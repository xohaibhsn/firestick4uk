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

async function loadSection(key: string) {
  const [rows]: any = await pool.query(
    `SELECT content_key,content_value,content_type,page_name,label,section_order,is_visible
     FROM site_content WHERE content_key=? LIMIT 1`,
    [key]
  );
  return rows?.[0] || null;
}

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
        const { key, is_visible } = req.body;
        const prev = await loadSection(String(key));
        if (prev) {
          const nextVis = is_visible ? 1 : 0;
          if (Number(prev.is_visible) !== nextVis) {
            const conn = await pool.getConnection();
            try {
              await conn.beginTransaction();
              await recordContentRevision(
                {
                  entityType: 'section',
                  entityId: String(key),
                  entityLabel: String(prev.label || key),
                  revisionAction: 'update',
                  snapshot: sectionSnapshot(prev),
                  changedFields: ['is_visible'],
                  actor: admin,
                },
                conn
              );
              await conn.query('UPDATE site_content SET is_visible=? WHERE content_key=?', [nextVis, key]);
              await conn.commit();
            } catch (txErr: any) {
              try { await conn.rollback(); } catch { /* ignore */ }
              throw txErr;
            } finally {
              conn.release();
            }
          }
        } else {
          await pool.query('UPDATE site_content SET is_visible=? WHERE content_key=?', [is_visible?1:0, key]);
        }
        const { ip } = getRequestMeta(req);
        await recordAdminAudit({
          actor: admin,
          action: 'page_builder.updated',
          entityType: 'page_builder',
          entityId: key,
          summary: `Toggled visibility for ${key}`,
          metadata: { section_key: key, visible: !!is_visible },
          ip,
        });
        invalidatePublicCmsCache();
        return res.status(200).json({ success: true });
      }
      if (action === 'reorder') {
        const { order } = req.body;
        // Capture each affected section before reorder
        for (const item of (order || [])) {
          if (!item?.key) continue;
          const prev = await loadSection(String(item.key));
          if (!prev) continue;
          if (Number(prev.section_order) === Number(item.section_order)) continue;
          const conn = await pool.getConnection();
          try {
            await conn.beginTransaction();
            await recordContentRevision(
              {
                entityType: 'section',
                entityId: String(item.key),
                entityLabel: String(prev.label || item.key),
                revisionAction: 'update',
                snapshot: sectionSnapshot(prev),
                changedFields: ['section_order'],
                actor: admin,
              },
              conn
            );
            await conn.query('UPDATE site_content SET section_order=? WHERE content_key=?', [item.section_order, item.key]);
            await conn.commit();
          } catch (txErr) {
            try { await conn.rollback(); } catch { /* ignore */ }
            throw txErr;
          } finally {
            conn.release();
          }
        }
        const { ip } = getRequestMeta(req);
        const keys = (order || []).map((item: any) => item.key).filter(Boolean);
        await recordAdminAudit({
          actor: admin,
          action: 'page_builder.updated',
          entityType: 'page_builder',
          entityId: null,
          summary: 'Reordered page sections',
          metadata: { keys },
          ip,
        });
        invalidatePublicCmsCache();
        return res.status(200).json({ success: true });
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
