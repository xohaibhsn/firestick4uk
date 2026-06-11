import type { NextApiRequest, NextApiResponse } from 'next';
import pool from '@/lib/db';

function checkAdminAuth(req: NextApiRequest): boolean {
  const session = req.headers['x-admin-session'] || req.cookies?.sAdminSession;
  return !!session;
}

async function ensureBerlinTrainingTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS berlin_training (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      content TEXT NOT NULL,
      is_active TINYINT(1) DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });

  try {
    await ensureBerlinTrainingTable();

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
      return res.status(200).json({ success: true, id: insertResult.insertId });
    }

    if (req.method === 'PUT') {
      const { id, title, content, is_active } = req.body;
      if (!id) return res.status(400).json({ error: 'id required' });
      await pool.query(
        'UPDATE berlin_training SET title=?, content=?, is_active=? WHERE id=?',
        [title || '', content || '', is_active ? 1 : 0, id]
      );
      return res.status(200).json({ success: true });
    }

    if (req.method === 'DELETE') {
      const id = Number(req.query.id || req.body?.id);
      if (!id) return res.status(400).json({ error: 'id required' });
      await pool.query('DELETE FROM berlin_training WHERE id=?', [id]);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
}
