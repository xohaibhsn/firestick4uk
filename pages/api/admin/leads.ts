import type { NextApiRequest, NextApiResponse } from 'next';
import pool from '@/lib/db';

function checkAdminAuth(req: NextApiRequest): boolean {
  const session = req.headers['x-admin-session'] || req.cookies?.sAdminSession;
  return !!session;
}

async function ensureChatLeadsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_leads (
      id INT AUTO_INCREMENT PRIMARY KEY,
      customer_name VARCHAR(255),
      customer_whatsapp VARCHAR(50),
      customer_email VARCHAR(255),
      interested_in VARCHAR(255),
      chat_history TEXT,
      ip_address VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });

  try {
    await ensureChatLeadsTable();

    if (req.method === 'GET') {
      const [rows] = await pool.query('SELECT * FROM chat_leads ORDER BY created_at DESC');
      return res.status(200).json(Array.isArray(rows) ? rows : []);
    }

    if (req.method === 'DELETE') {
      const ids = Array.isArray(req.body?.ids)
        ? req.body.ids.map((value: unknown) => Number(value)).filter((value: number) => Number.isInteger(value) && value > 0)
        : [];
      if (ids.length > 0) {
        const placeholders = ids.map(() => '?').join(',');
        await pool.query(`DELETE FROM chat_leads WHERE id IN (${placeholders})`, ids);
        return res.status(200).json({ success: true, deleted: ids.length });
      }

      const id = Number(req.query.id || req.body?.id);
      if (!id) return res.status(400).json({ error: 'id required' });
      await pool.query('DELETE FROM chat_leads WHERE id=?', [id]);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
}
