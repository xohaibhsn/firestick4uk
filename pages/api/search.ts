import type { NextApiRequest, NextApiResponse } from 'next';
import { RL_SEARCH, getClientIp } from '../../lib/rateLimit';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { allowed } = RL_SEARCH(getClientIp(req));
  if (!allowed) return res.status(429).json({ error: 'Too many requests' });

  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.status(200).json([]);

  let conn: any;
  try {
    const mysql = require('mysql2/promise');
    conn = await Promise.race([
      mysql.createConnection({ host: process.env.DB_HOST||'srv497.hstgr.io', user: process.env.DB_USER||'u992747032_firestick4uk', password: process.env.DB_PASSWORD||'Firestick@2026', database: process.env.DB_NAME||'u992747032_firestick4uk', port: 3306, connectTimeout: 5000 }),
      new Promise((_,reject) => setTimeout(()=>reject(new Error('timeout')),6000)),
    ]);

    const term = `%${q}%`;
    const [rows]: any = await conn.query(
      `SELECT id, name, price, image, category, badge,
        LOWER(REPLACE(REPLACE(name, ' ', '-'), '/', '')) as slug
       FROM products
       WHERE active=1 AND (name LIKE ? OR short_description LIKE ? OR focus_keyword LIKE ?)
       LIMIT 6`,
      [term, term, term]
    );

    return res.status(200).json(Array.isArray(rows) ? rows : []);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  } finally {
    if (conn) try { await conn.end(); } catch (_) {}
  }
}
