import type { NextApiRequest, NextApiResponse } from 'next';
import pool from '@/lib/db';
import { getRequestMeta, requireAdminPermission } from '@/lib/adminAuth';
import { recordAdminAudit } from '@/lib/adminAudit';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const admin = await requireAdminPermission(req, res, 'training.manage');
  if (!admin) return;

  try {
    if (req.method === 'GET') {
      const [rows] = await pool.query('SELECT * FROM berlin_training ORDER BY is_active DESC, updated_at DESC');
      return res.status(200).json(Array.isArray(rows) ? rows : []);
    }

    if (req.method === 'POST') {
      const { title, content, is_active } = req.body;
      if (!title || !content) return res.status(400).json({ error: 'Title and content required' });
      const [result] = await pool.query(
        'INSERT INTO berlin_training (title, content, is_active) VALUES (?,?,?)',
        [title, content, is_active === false ? 0 : 1]
      );
      const insertResult = result as { insertId?: number };
      const { ip } = getRequestMeta(req);
      await recordAdminAudit({
        actor: admin,
        action: 'training.created',
        entityType: 'training',
        entityId: insertResult.insertId,
        summary: `Created training entry ${title}`,
        ip,
      });
      return res.status(200).json({ success: true, id: insertResult.insertId });
    }

    if (req.method === 'PUT') {
      const { id, title, content, is_active } = req.body;
      if (!id) return res.status(400).json({ error: 'id required' });
      await pool.query(
        'UPDATE berlin_training SET title=?, content=?, is_active=? WHERE id=?',
        [title || '', content || '', is_active ? 1 : 0, id]
      );
      const { ip } = getRequestMeta(req);
      await recordAdminAudit({
        actor: admin,
        action: 'training.updated',
        entityType: 'training',
        entityId: id,
        summary: `Updated training entry ${title || id}`,
        ip,
      });
      return res.status(200).json({ success: true });
    }

    if (req.method === 'DELETE') {
      const id = Number(req.query.id || req.body?.id);
      if (!id) return res.status(400).json({ error: 'id required' });
      const [prevRows]: any = await pool.query('SELECT id, title FROM berlin_training WHERE id=? LIMIT 1', [id]);
      const prev = Array.isArray(prevRows) && prevRows[0] ? prevRows[0] : null;
      await pool.query('DELETE FROM berlin_training WHERE id=?', [id]);
      const { ip } = getRequestMeta(req);
      await recordAdminAudit({
        actor: admin,
        action: 'training.deleted',
        entityType: 'training',
        entityId: id,
        summary: `Deleted training entry ${prev?.title || id}`,
        ip,
      });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
}
