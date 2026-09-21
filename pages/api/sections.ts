import type { NextApiRequest, NextApiResponse } from 'next';
import pool from '../../lib/db';
import { getRequestMeta, requireAdminPermission } from '../../lib/adminAuth';
import { recordAdminAudit } from '../../lib/adminAudit';
import { recordContentRevision } from '../../lib/contentRevisions';

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
        const admin = await requireAdminPermission(req, res, 'page_builder.manage', { mutate: false });
        if (!admin) return;
      }
      let query = 'SELECT content_key,content_value,content_type,page_name,label,section_order,is_visible FROM site_content WHERE page_name=? AND content_type="json"';
      const params: any[] = [page || 'home'];
      if (!all) query += ' AND is_visible=1';
      query += ' ORDER BY section_order ASC';
      const [rows]: any = await pool.query(query, params);
      const result = (Array.isArray(rows)?rows:[]).map((r:any) => ({
        key: r.content_key,
        label: r.label,
        page: r.page_name,
        order: r.section_order,
        visible: !!r.is_visible,
        data: (() => { try { return JSON.parse(r.content_value); } catch { return {}; } })(),
      }));
      return res.status(200).json(result);
    }

    if (req.method === 'POST') {
      if (!admin) return;
      const { key, value } = req.body;
      if (!key) return res.status(400).json({ error: 'Key required' });
      const json = typeof value === 'string' ? value : JSON.stringify(value);
      const prev = await loadSection(String(key));
      if (prev && String(prev.content_value || '') !== json) {
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
              changedFields: ['content_value'],
              actor: admin,
            },
            conn
          );
          await conn.query('UPDATE site_content SET content_value=? WHERE content_key=?', [json, key]);
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
        await pool.query('UPDATE site_content SET content_value=? WHERE content_key=?', [json, key]);
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
      return res.status(200).json({ success: true });
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
        return res.status(200).json({ success: true });
      }
      return res.status(400).json({ error: 'Unknown action' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
