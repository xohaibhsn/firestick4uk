import type { NextApiRequest, NextApiResponse } from 'next';
import pool from '../../lib/db';
import { getRequestMeta, requireAdminPermission } from '../../lib/adminAuth';
import { recordAdminAudit } from '../../lib/adminAudit';

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
      const { key, value } = req.body;
      if (!key) return res.status(400).json({ error: 'Key required' });
      const json = typeof value === 'string' ? value : JSON.stringify(value);
      await pool.query('UPDATE site_content SET content_value=? WHERE content_key=?', [json, key]);
      if (admin) {
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
      }
      return res.status(200).json({ success: true });
    }

    if (req.method === 'PUT') {
      const { action } = req.query;
      if (action === 'visibility') {
        const { key, is_visible } = req.body;
        await pool.query('UPDATE site_content SET is_visible=? WHERE content_key=?', [is_visible?1:0, key]);
        if (admin) {
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
        }
        return res.status(200).json({ success: true });
      }
      if (action === 'reorder') {
        const { order } = req.body;
        for (const item of (order||[])) {
          await pool.query('UPDATE site_content SET section_order=? WHERE content_key=?', [item.section_order, item.key]);
        }
        if (admin) {
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
        }
        return res.status(200).json({ success: true });
      }
      return res.status(400).json({ error: 'Unknown action' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
