import type { NextApiRequest, NextApiResponse } from 'next';
import pool from '../../lib/db';
import { getRequestMeta, requireAdminPermission } from '../../lib/adminAuth';
import { recordAdminAudit } from '../../lib/adminAudit';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    let admin: Awaited<ReturnType<typeof requireAdminPermission>> | null = null;
    if (req.method !== 'GET') {
      admin = await requireAdminPermission(req, res, 'faqs.manage');
      if (!admin) return;
    }

    if (req.method === 'GET') {
      const { admin } = req.query;
      if (admin) {
        const identity = await requireAdminPermission(req, res, 'faqs.manage', { mutate: false });
        if (!identity) return;
      }
      let query = 'SELECT * FROM faqs';
      if (!admin) query += ' WHERE is_visible=1';
      query += ' ORDER BY category, sort_order ASC';
      const [rows] = await pool.query(query);
      return res.status(200).json(Array.isArray(rows)?rows:[]);
    }

    if (req.method === 'POST') {
      const { question, answer, category, sort_order } = req.body;
      if (!question || !answer) return res.status(400).json({ error: 'Question and answer required' });
      const [r]: any = await pool.query(
        'INSERT INTO faqs (question,answer,category,sort_order) VALUES (?,?,?,?)',
        [question, answer, category||'General', sort_order||0]
      );
      if (admin) {
        const { ip } = getRequestMeta(req);
        await recordAdminAudit({
          actor: admin,
          action: 'faq.created',
          entityType: 'faq',
          entityId: r.insertId,
          summary: 'Created FAQ',
          metadata: { category: category || 'General' },
          ip,
        });
      }
      return res.status(200).json({ success:true, id:r.insertId });
    }

    if (req.method === 'PUT') {
      const { id, question, answer, category, sort_order, is_visible } = req.body;
      if (!id) return res.status(400).json({ error: 'ID required' });
      await pool.query(
        'UPDATE faqs SET question=?,answer=?,category=?,sort_order=?,is_visible=? WHERE id=?',
        [question, answer, category||'General', sort_order||0, is_visible??1, id]
      );
      if (admin) {
        const { ip } = getRequestMeta(req);
        await recordAdminAudit({
          actor: admin,
          action: 'faq.updated',
          entityType: 'faq',
          entityId: id,
          summary: 'Updated FAQ',
          ip,
        });
      }
      return res.status(200).json({ success:true });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      await pool.query('DELETE FROM faqs WHERE id=?', [id]);
      if (admin) {
        const { ip } = getRequestMeta(req);
        await recordAdminAudit({
          actor: admin,
          action: 'faq.deleted',
          entityType: 'faq',
          entityId: id as string,
          summary: 'Deleted FAQ',
          ip,
        });
      }
      return res.status(200).json({ success:true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
