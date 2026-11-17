import type { NextApiRequest, NextApiResponse } from 'next';
import pool from '../../lib/db';
import { getRequestMeta, requireAdminPermission } from '../../lib/adminAuth';
import { recordAdminAudit } from '../../lib/adminAudit';
import { setAdminNoStore } from '../../lib/adminNoStore';
import { recordContentRevision } from '../../lib/contentRevisions';
import {
  getCachedPublicVisibleSections,
  invalidatePublicCmsCache,
} from '../../lib/publicCmsDataServer';
import { getClientIp, RL_PUBLIC_GET } from '../../lib/rateLimit';
import { hashSiteContentValue } from '../../lib/siteContentBaseHash';

function sectionSnapshot(row: any) {
  return {
    content_key: row.content_key,
    content_value: row.content_value,
    content_type: row.content_type,
    page_name: row.page_name,
    label: row.label,
    section_order: row.section_order,
    is_visible: row.is_visible,
    data: (() => {
      try {
        return JSON.parse(String(row.content_value || '{}'));
      } catch {
        return {};
      }
    })(),
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    let admin: Awaited<ReturnType<typeof requireAdminPermission>> | null = null;
    if (req.method !== 'GET') {
      admin = await requireAdminPermission(req, res, 'page_builder.manage');
      if (!admin) return;
    }

    if (req.method === 'GET') {
      const { page, all } = req.query;
      if (all) {
        setAdminNoStore(res);
        const admin = await requireAdminPermission(req, res, 'page_builder.manage', { mutate: false });
        if (!admin) return;
      }
      const pageArg = page || 'home';
      if (!all && typeof pageArg === 'string') {
        const ip = getClientIp(req);
        const { allowed, retryAfterSec } = RL_PUBLIC_GET(ip, 'sections');
        if (!allowed) {
          res.setHeader('Retry-After', String(retryAfterSec));
          return res.status(429).json({ error: 'Too many requests' });
        }
        const result = await getCachedPublicVisibleSections(pageArg);
        return res.status(200).json(result);
      }
      let query = 'SELECT content_key,content_value,content_type,page_name,label,section_order,is_visible FROM site_content WHERE page_name=? AND content_type="json"';
      const params: any[] = [pageArg];
      if (!all) query += ' AND is_visible=1';
      query += ' ORDER BY section_order ASC';
      const [rows]: any = await pool.query(query, params);
      const result = (Array.isArray(rows)?rows:[]).map((r:any) => {
        const row: Record<string, unknown> = {
          key: r.content_key,
          label: r.label,
          page: r.page_name,
          order: r.section_order,
          visible: !!r.is_visible,
          data: (() => { try { return JSON.parse(r.content_value); } catch { return {}; } })(),
        };
        // Admin ?all=1 only — public/cache path never reaches here.
        if (all) {
          row.base_hash = hashSiteContentValue(
            r.content_value == null ? '' : String(r.content_value),
            true
          );
        }
        return row;
      });
      return res.status(200).json(result);
    }

    if (req.method === 'POST') {
      if (!admin) return;
      const { key, value, base_hash: bodyBaseHash, force: bodyForce } = req.body;
      if (!key) return res.status(400).json({ error: 'Key required' });
      const json = typeof value === 'string' ? value : JSON.stringify(value);
      const hasBaseHash = typeof bodyBaseHash === 'string';
      const force = bodyForce === true;
      if (!hasBaseHash) {
        console.log('[sections] legacy_save_no_base_hash', String(key));
      }

      const conn = await pool.getConnection();
      let wroteValue = json;
      try {
        await conn.beginTransaction();
        const [lockedRows]: any = await conn.query(
          `SELECT content_key,content_value,content_type,page_name,label,section_order,is_visible
           FROM site_content WHERE content_key=? LIMIT 1 FOR UPDATE`,
          [key]
        );
        const locked = lockedRows?.[0] || null;

        if (hasBaseHash && !force) {
          const present = !!locked;
          const currentHash = present
            ? hashSiteContentValue(
                locked.content_value == null ? '' : String(locked.content_value),
                true
              )
            : hashSiteContentValue(undefined, false);
          if (currentHash !== bodyBaseHash) {
            await conn.rollback();
            return res.status(409).json({
              error: 'stale',
              conflicts: [
                {
                  key: String(key),
                  label: String(locked?.label || key),
                },
              ],
            });
          }
        }

        const prevValue = locked ? String(locked.content_value || '') : '';
        const changed = !!locked && prevValue !== json;
        if (changed) {
          await recordContentRevision(
            {
              entityType: 'section',
              entityId: String(key),
              entityLabel: String(locked.label || key),
              revisionAction: 'update',
              snapshot: sectionSnapshot(locked),
              changedFields: ['content_value'],
              actor: admin,
            },
            conn
          );
        }
        await conn.query('UPDATE site_content SET content_value=? WHERE content_key=?', [json, key]);
        wroteValue = json;
        await conn.commit();
      } catch (txErr: any) {
        try { await conn.rollback(); } catch { /* ignore */ }
        if (txErr?.code === 'REVISION_TOO_LARGE') {
          return res.status(400).json({ error: txErr.message });
        }
        throw txErr;
      } finally {
        conn.release();
      }

      const { ip } = getRequestMeta(req);
      await recordAdminAudit({
        actor: admin,
        action: 'page_builder.updated',
        entityType: 'page_builder',
        entityId: key,
        summary: `Updated page section ${key}`,
        metadata: { section_key: key },
        ip,
      });
      if (force && hasBaseHash) {
        // Key only — never values.
        await recordAdminAudit({
          actor: admin,
          action: 'page_builder.overwrite_stale',
          entityType: 'page_builder',
          entityId: key,
          summary: `Overwrote stale page section ${key}`,
          metadata: { section_key: key },
          ip,
        });
      }
      invalidatePublicCmsCache();
      const newBaseHash = hashSiteContentValue(wroteValue, true);
      return res.status(200).json({ success: true, base_hash: newBaseHash });
    }

    if (req.method === 'PUT') {
      if (!admin) return;
      const { action } = req.query;
      if (action === 'visibility') {
        const { key: rawKey, is_visible } = req.body || {};
        const key = typeof rawKey === 'string' ? rawKey.trim() : '';
        if (!key || key.length > 191) {
          return res.status(400).json({ error: 'invalid_visibility' });
        }
        let nextVis: 0 | 1;
        if (is_visible === true || is_visible === 1) {
          nextVis = 1;
        } else if (is_visible === false || is_visible === 0) {
          nextVis = 0;
        } else {
          return res.status(400).json({ error: 'invalid_visibility' });
        }

        const conn = await pool.getConnection();
        let changed = 0;
        try {
          await conn.beginTransaction();
          const [lockedRows]: any = await conn.query(
            `SELECT content_key,content_value,content_type,page_name,label,section_order,is_visible
             FROM site_content WHERE content_key=? LIMIT 1 FOR UPDATE`,
            [key]
          );
          const locked = lockedRows?.[0] || null;
          if (!locked) {
            await conn.rollback();
            return res.status(404).json({ error: 'unknown_section' });
          }
          if (Number(locked.is_visible) !== nextVis) {
            await recordContentRevision(
              {
                entityType: 'section',
                entityId: String(key),
                entityLabel: String(locked.label || key),
                revisionAction: 'update',
                snapshot: sectionSnapshot(locked),
                changedFields: ['is_visible'],
                actor: admin,
              },
              conn
            );
            await conn.query('UPDATE site_content SET is_visible=? WHERE content_key=?', [nextVis, key]);
            changed = 1;
          }
          await conn.commit();
        } catch (txErr: any) {
          try { await conn.rollback(); } catch { /* ignore */ }
          throw txErr;
        } finally {
          conn.release();
        }

        if (changed === 0) {
          return res.status(200).json({ success: true, changed: 0 });
        }
        const { ip } = getRequestMeta(req);
        await recordAdminAudit({
          actor: admin,
          action: 'page_builder.updated',
          entityType: 'page_builder',
          entityId: key,
          summary: `Toggled visibility for ${key}`,
          metadata: { section_key: key, visible: nextVis === 1 },
          ip,
        });
        invalidatePublicCmsCache();
        return res.status(200).json({ success: true, changed: 1 });
      }
      if (action === 'reorder') {
        const body = req.body || {};
        const order = body.order;
        if (!Array.isArray(order) || order.length < 1 || order.length > 200) {
          return res.status(400).json({ error: 'invalid_order' });
        }
        const seen = new Set<string>();
        const parsed: Array<{ key: string; section_order: number }> = [];
        for (const item of order) {
          const key = typeof item?.key === 'string' ? item.key.trim() : '';
          if (!key || key.length > 191) {
            return res.status(400).json({ error: 'invalid_order' });
          }
          if (seen.has(key)) {
            return res.status(400).json({ error: 'invalid_order' });
          }
          seen.add(key);
          const so = item?.section_order;
          if (
            typeof so !== 'number' ||
            !Number.isInteger(so) ||
            so < 0 ||
            so > 100000
          ) {
            return res.status(400).json({ error: 'invalid_order' });
          }
          parsed.push({ key, section_order: so });
        }

        const hasBaseOrders =
          body.base_orders != null &&
          typeof body.base_orders === 'object' &&
          !Array.isArray(body.base_orders);
        const force = body.force === true;
        if (!hasBaseOrders) {
          console.log('[sections] legacy_reorder_no_base');
        }

        const keys = parsed.map((p) => p.key);
        const placeholders = keys.map(() => '?').join(',');
        const conn = await pool.getConnection();
        let changed = 0;
        const overwriteConflicts: Array<{ key: string; current: number; base: number }> = [];
        try {
          await conn.beginTransaction();
          const [lockedRows]: any = await conn.query(
            `SELECT content_key,content_value,content_type,page_name,label,section_order,is_visible
             FROM site_content WHERE content_key IN (${placeholders}) FOR UPDATE`,
            keys
          );
          const rows: any[] = Array.isArray(lockedRows) ? lockedRows : [];
          const byKey = new Map<string, any>();
          for (const row of rows) byKey.set(String(row.content_key), row);

          const missing = keys.filter((k) => !byKey.has(k));
          if (missing.length) {
            await conn.rollback();
            return res.status(404).json({ error: 'unknown_section', keys: missing });
          }

          const pageNames = new Set(rows.map((r) => String(r.page_name)));
          if (pageNames.size !== 1) {
            await conn.rollback();
            return res.status(400).json({ error: 'mixed_pages' });
          }

          if (hasBaseOrders && !force) {
            const conflicts: Array<{ key: string; current: number; base: number }> = [];
            for (const p of parsed) {
              if (!Object.prototype.hasOwnProperty.call(body.base_orders, p.key)) continue;
              const baseRaw = (body.base_orders as Record<string, unknown>)[p.key];
              const base =
                typeof baseRaw === 'number' && Number.isInteger(baseRaw)
                  ? baseRaw
                  : Number(baseRaw);
              if (!Number.isFinite(base)) continue;
              const current = Number(byKey.get(p.key).section_order);
              if (current !== base) {
                conflicts.push({ key: p.key, current, base });
              }
            }
            if (conflicts.length) {
              await conn.rollback();
              return res.status(409).json({ error: 'stale', conflicts });
            }
          }

          if (hasBaseOrders && force) {
            for (const p of parsed) {
              if (!Object.prototype.hasOwnProperty.call(body.base_orders, p.key)) continue;
              const baseRaw = (body.base_orders as Record<string, unknown>)[p.key];
              const base =
                typeof baseRaw === 'number' && Number.isInteger(baseRaw)
                  ? baseRaw
                  : Number(baseRaw);
              if (!Number.isFinite(base)) continue;
              const current = Number(byKey.get(p.key).section_order);
              if (current !== base) {
                overwriteConflicts.push({ key: p.key, current, base });
              }
            }
          }

          for (const p of parsed) {
            const locked = byKey.get(p.key);
            if (Number(locked.section_order) === p.section_order) continue;
            await recordContentRevision(
              {
                entityType: 'section',
                entityId: p.key,
                entityLabel: String(locked.label || p.key),
                revisionAction: 'update',
                snapshot: sectionSnapshot(locked),
                changedFields: ['section_order'],
                actor: admin,
              },
              conn
            );
            await conn.query(
              'UPDATE site_content SET section_order=? WHERE content_key=?',
              [p.section_order, p.key]
            );
            changed++;
          }
          await conn.commit();
        } catch (txErr) {
          try { await conn.rollback(); } catch { /* ignore */ }
          throw txErr;
        } finally {
          conn.release();
        }

        if (changed === 0) {
          return res.status(200).json({ success: true, changed: 0 });
        }
        const { ip } = getRequestMeta(req);
        await recordAdminAudit({
          actor: admin,
          action: 'page_builder.updated',
          entityType: 'page_builder',
          entityId: null,
          summary: 'Reordered page sections',
          metadata: { keys },
          ip,
        });
        if (force && hasBaseOrders && overwriteConflicts.length) {
          await recordAdminAudit({
            actor: admin,
            action: 'page_builder.overwrite_stale',
            entityType: 'page_builder',
            entityId: null,
            summary: 'Overwrote stale page section order',
            metadata: { keys: overwriteConflicts.map((c) => c.key) },
            ip,
          });
        }
        invalidatePublicCmsCache();
        return res.status(200).json({ success: true, changed });
      }
      return res.status(400).json({ error: 'Unknown action' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    const errCode = typeof error?.code === 'string' ? error.code : undefined;
    const errName = typeof error?.name === 'string' ? error.name : 'Error';
    console.error('[sections] failed', errCode || errName);
    return res.status(500).json({ error: 'Request failed' });
  }
}
