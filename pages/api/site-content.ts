import type { NextApiRequest, NextApiResponse } from 'next';
import pool from '../../lib/db';
import { SITE_CONTENT_DEFAULTS } from '../../lib/siteContentSeed';
import {
  DEFAULT_SUBSCRIPTION_SLUG,
  isAutoSubscriptionCanonical,
  normalizeSubscriptionSlug,
  subscriptionPageUrl,
  validateSubscriptionSlug,
} from '../../lib/subscriptionSlug';
import { requireAdmin, getRequestMeta } from '../../lib/adminAuth';
import { hasAdminPermission, isSuperAdminSettingsKey } from '../../lib/adminPermissions';
import { recordAdminAudit } from '../../lib/adminAudit';
import {
  classifySiteContentEntityType,
  recordContentRevision,
} from '../../lib/contentRevisions';

/** Lookup metadata for upserts only — does not seed the database at request time. */
const DEFAULTS = SITE_CONTENT_DEFAULTS;

async function loadKeysSnapshot(keys: string[]) {
  if (!keys.length) return { values: {} as Record<string, string>, rows: {} as Record<string, any> };
  const [rows]: any = await pool.query(
    `SELECT content_key, content_value, content_type, page_name, label
     FROM site_content WHERE content_key IN (${keys.map(() => '?').join(',')})`,
    keys
  );
  const values: Record<string, string> = {};
  const metaRows: Record<string, any> = {};
  for (const r of rows || []) {
    values[r.content_key] = r.content_value || '';
    metaRows[r.content_key] = {
      content_type: r.content_type,
      page_name: r.page_name,
      label: r.label,
    };
  }
  return { values, rows: metaRows };
}

function changedKeys(prev: Record<string, string>, next: Array<{ key: string; value: string }>): string[] {
  const out: string[] = [];
  for (const u of next) {
    const before = prev[u.key];
    if (before === undefined || before !== u.value) out.push(u.key);
  }
  return out;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'GET') {
      const admin = await requireAdmin(req, res);
      if (!admin) return;
      (req as any).__adminIdentity = admin;
    }

    if (req.method === 'GET') {
      const { page } = req.query;
      let query = 'SELECT content_key, content_value, content_type, page_name, label FROM site_content';
      const params: any[] = [];
      if (page && page !== 'all') { query += ' WHERE page_name=?'; params.push(page); }
      query += ' ORDER BY id ASC';
      const [rows]: any = await pool.query(query, params);
      const result: Record<string,string> = {};
      for (const r of rows) result[r.content_key] = r.content_value || '';
      return res.status(200).json(result);
    }

    if (req.method === 'POST') {
      const admin = (req as any).__adminIdentity;
      const { key, value, updates } = req.body;

      const upsert = async (contentKey: string, contentValue: string) => {
        const defaults = DEFAULTS.find((d) => d[0] === contentKey);
        const contentType = (defaults?.[2] as string) || 'text';
        const pageName = (defaults?.[3] as string) || (contentKey.split('_')[0] || 'home');
        const label = (defaults?.[4] as string) || contentKey;
        await pool.query(
          `INSERT INTO site_content (content_key, content_value, content_type, page_name, label)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE content_value = VALUES(content_value), page_name = VALUES(page_name), label = VALUES(label)`,
          [contentKey, contentValue || '', contentType, pageName, label]
        );
      };

      const updateList: Array<{ key: string; value: string }> = [];
      if (updates && Array.isArray(updates)) {
        for (const u of updates) {
          if (!u?.key) continue;
          // previous slug is managed server-side only
          if (String(u.key) === 'subscription_previous_slug') continue;
          updateList.push({ key: String(u.key), value: String(u.value ?? '') });
        }
      } else if (key) {
        if (String(key) === 'subscription_previous_slug') {
          return res.status(400).json({ error: 'subscription_previous_slug is managed automatically' });
        }
        updateList.push({ key: String(key), value: String(value ?? '') });
      } else {
        return res.status(400).json({ error: 'No content keys provided' });
      }

      const settingsKeys = updateList.filter((u) => isSuperAdminSettingsKey(u.key)).map((u) => u.key);
      const contentKeys = updateList.filter((u) => !isSuperAdminSettingsKey(u.key)).map((u) => u.key);

      if (settingsKeys.length && !hasAdminPermission(admin.role, 'settings.manage')) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'You do not have permission for this action.',
          detail: 'Site Settings keys require Super Admin',
          blocked_keys: settingsKeys,
        });
      }
      if (contentKeys.length && !hasAdminPermission(admin.role, 'content.manage')) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'You do not have permission for this action.',
        });
      }

      const affectedKeys = updateList.map((u) => u.key);
      // Also capture previous_slug if slug change will touch it
      const keysForSnapshot = [...new Set(affectedKeys)];
      const beforeSnap = await loadKeysSnapshot(keysForSnapshot);
      const changed = changedKeys(beforeSnap.values, updateList);

      const slugUpdate = updateList.find((u) => u.key === 'subscription_slug');
      let slugChangePrevious: string | undefined;

      if (changed.length > 0 || slugUpdate) {
        const entityType = classifySiteContentEntityType(keysForSnapshot);
        const entityId =
          keysForSnapshot.length === 1
            ? keysForSnapshot[0]
            : keysForSnapshot.slice(0, 6).join(',').slice(0, 191);
        const conn = await pool.getConnection();
        try {
          await conn.beginTransaction();
          // Re-bind upsert to use conn for transactional consistency
          const upsertTx = async (contentKey: string, contentValue: string) => {
            const defaults = DEFAULTS.find((d) => d[0] === contentKey);
            const contentType = (defaults?.[2] as string) || 'text';
            const pageName = (defaults?.[3] as string) || (contentKey.split('_')[0] || 'home');
            const label = (defaults?.[4] as string) || contentKey;
            await conn.query(
              `INSERT INTO site_content (content_key, content_value, content_type, page_name, label)
               VALUES (?, ?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE content_value = VALUES(content_value), page_name = VALUES(page_name), label = VALUES(label)`,
              [contentKey, contentValue || '', contentType, pageName, label]
            );
          };

          // Build snapshot of previous values for changed keys (+ routing side effects keys)
          const snapKeys = [...new Set([
            ...changed,
            ...(slugUpdate ? ['subscription_slug', 'subscription_previous_slug', 'subscription_canonical'] : []),
          ])];
          const snapBefore = await loadKeysSnapshot(snapKeys);
          await recordContentRevision(
            {
              entityType,
              entityId,
              entityLabel:
                keysForSnapshot.length === 1
                  ? keysForSnapshot[0]
                  : `Batch (${keysForSnapshot.length} keys)`,
              revisionAction: 'update',
              snapshot: {
                values: snapBefore.values,
                metadata: { rows: snapBefore.rows, keys: snapKeys },
              },
              changedFields: snapKeys,
              actor: admin,
            },
            conn
          );

          // Execute mutations inside transaction using conn upsert
          const localUpsert = upsertTx;
          // Inline the slug + updates using localUpsert
          {
            if (slugUpdate) {
              const validated = validateSubscriptionSlug(slugUpdate.value);
              if (!validated.ok) {
                await conn.rollback();
                return res.status(400).json({ error: validated.error });
              }
              const [slugRows]: any = await conn.query(
                `SELECT content_key, content_value
                 FROM site_content
                 WHERE content_key IN (
                   'subscription_slug',
                   'subscription_previous_slug',
                   'subscription_canonical'
                 )`
              );
              const currentMap: Record<string, string> = {};
              for (const row of slugRows || []) {
                currentMap[row.content_key] = row.content_value || '';
              }
              const currentSlug =
                normalizeSubscriptionSlug(currentMap.subscription_slug || '') ||
                DEFAULT_SUBSCRIPTION_SLUG;
              const nextSlug = validated.slug;
              slugUpdate.value = nextSlug;
              if (nextSlug !== currentSlug) {
                await localUpsert('subscription_previous_slug', currentSlug);
                await localUpsert('subscription_slug', nextSlug);
                slugChangePrevious = currentSlug;
                const incomingCanonical = updateList.find((u) => u.key === 'subscription_canonical');
                const canonicalCandidate =
                  incomingCanonical?.value ?? currentMap.subscription_canonical ?? '';
                if (
                  isAutoSubscriptionCanonical(
                    canonicalCandidate,
                    currentSlug,
                    normalizeSubscriptionSlug(currentMap.subscription_previous_slug || '')
                  ) ||
                  isAutoSubscriptionCanonical(canonicalCandidate, nextSlug, currentSlug)
                ) {
                  if (incomingCanonical) incomingCanonical.value = '';
                  await localUpsert('subscription_canonical', '');
                }
              } else {
                await localUpsert('subscription_slug', nextSlug);
              }
            }
            for (const u of updateList) {
              if (u.key === 'subscription_slug' && slugUpdate) continue;
              await localUpsert(u.key, u.value);
            }
          }

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
      } else {
        // No content changes — still allow empty success
      }

      // dead code path removed — mutations already applied above when changed

      const allKeys = updateList.map((u) => u.key);
      const hasSettings = settingsKeys.length > 0;
      const hasContent = contentKeys.length > 0;
      const { ip } = getRequestMeta(req);
      if (changed.length > 0 || slugUpdate) {
        if (hasSettings && !hasContent) {
          await recordAdminAudit({
            actor: admin,
            action: 'settings.updated',
            entityType: 'settings',
            entityId: null,
            summary: `Updated ${settingsKeys.length} site setting(s)`,
            metadata: { keys: settingsKeys },
            ip,
          });
        } else if (hasContent && !hasSettings) {
          await recordAdminAudit({
            actor: admin,
            action: 'content.updated',
            entityType: 'content',
            entityId: null,
            summary: `Updated ${contentKeys.length} content key(s)`,
            metadata: { keys: contentKeys },
            ip,
          });
        } else if (hasSettings || hasContent) {
          await recordAdminAudit({
            actor: admin,
            action: hasSettings ? 'settings.updated' : 'content.updated',
            entityType: hasSettings ? 'settings' : 'content',
            entityId: null,
            summary: `Updated ${allKeys.length} site content key(s)`,
            metadata: { keys: allKeys, settings_keys: settingsKeys, content_keys: contentKeys },
            ip,
          });
        }
      }

      return res.status(200).json({
        success: true,
        ...(slugUpdate
          ? {
              subscription_slug: slugUpdate.value,
              preview_url: subscriptionPageUrl(slugUpdate.value),
              ...(slugChangePrevious
                ? { subscription_previous_slug: slugChangePrevious }
                : {}),
            }
          : {}),
      });
    }

    if (req.method === 'PUT') {
      const admin = (req as any).__adminIdentity;
      const { content_key, content_value, content_type, page_name, label } = req.body;
      const ck = String(content_key || '');
      if (!ck) return res.status(400).json({ error: 'content_key required' });

      if (isSuperAdminSettingsKey(ck)) {
        if (!hasAdminPermission(admin.role, 'settings.manage')) {
          return res.status(403).json({
            error: 'Forbidden',
            message: 'You do not have permission for this action.',
          });
        }
      } else if (!hasAdminPermission(admin.role, 'content.manage')) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'You do not have permission for this action.',
        });
      }

      const before = await loadKeysSnapshot([ck]);
      const nextVal = String(content_value ?? '');
      const changed = before.values[ck] === undefined || before.values[ck] !== nextVal;
      if (changed) {
        const entityType = classifySiteContentEntityType([ck]);
        const conn = await pool.getConnection();
        try {
          await conn.beginTransaction();
          await recordContentRevision(
            {
              entityType,
              entityId: ck,
              entityLabel: ck,
              revisionAction: 'update',
              snapshot: {
                values: before.values,
                metadata: { rows: before.rows, keys: [ck] },
              },
              changedFields: [ck],
              actor: admin,
            },
            conn
          );
          await conn.query(
            'INSERT INTO site_content (content_key,content_value,content_type,page_name,label) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE content_value=?,label=?',
            [ck, nextVal, content_type||'text', page_name||'', label||ck, nextVal, label||ck]
          );
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
      }

      const { ip } = getRequestMeta(req);
      const isSettings = isSuperAdminSettingsKey(ck);
      if (changed) {
        await recordAdminAudit({
          actor: admin,
          action: isSettings ? 'settings.updated' : 'content.updated',
          entityType: isSettings ? 'settings' : 'content',
          entityId: ck,
          summary: isSettings ? 'Updated site setting' : 'Updated site content',
          metadata: { keys: [ck] },
          ip,
        });
      }
      return res.status(200).json({ success: true });
    }

    if (req.method === 'DELETE') {
      const admin = (req as any).__adminIdentity;
      const key = String(req.query.key || '');
      if (!key) return res.status(400).json({ error: 'key required' });

      if (isSuperAdminSettingsKey(key)) {
        if (!hasAdminPermission(admin.role, 'settings.manage')) {
          return res.status(403).json({
            error: 'Forbidden',
            message: 'You do not have permission for this action.',
          });
        }
      } else if (!hasAdminPermission(admin.role, 'content.manage')) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'You do not have permission for this action.',
        });
      }

      const before = await loadKeysSnapshot([key]);
      const [fullRows]: any = await pool.query(
        'SELECT content_key, content_value, content_type, page_name, label FROM site_content WHERE content_key=? LIMIT 1',
        [key]
      );
      const row = fullRows?.[0];
      if (row) {
        const entityType = classifySiteContentEntityType([key]);
        const conn = await pool.getConnection();
        try {
          await conn.beginTransaction();
          await recordContentRevision(
            {
              entityType,
              entityId: key,
              entityLabel: key,
              revisionAction: 'delete',
              snapshot: {
                content_key: row.content_key,
                content_value: row.content_value,
                content_type: row.content_type,
                page_name: row.page_name,
                label: row.label,
                values: { [key]: row.content_value || '' },
                metadata: {
                  rows: {
                    [key]: {
                      content_type: row.content_type,
                      page_name: row.page_name,
                      label: row.label,
                    },
                  },
                },
              },
              changedFields: [key],
              actor: admin,
            },
            conn
          );
          await conn.query('DELETE FROM site_content WHERE content_key=?', [key]);
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
      }

      const { ip } = getRequestMeta(req);
      const isSettings = isSuperAdminSettingsKey(key);
      await recordAdminAudit({
        actor: admin,
        action: isSettings ? 'settings.updated' : 'content.updated',
        entityType: isSettings ? 'settings' : 'content',
        entityId: key,
        summary: isSettings ? 'Deleted site setting key' : 'Deleted site content key',
        metadata: { keys: [key], deleted: true },
        ip,
      });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
