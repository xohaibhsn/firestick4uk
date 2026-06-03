import type { NextApiRequest, NextApiResponse } from 'next';
import { RL_GENERAL, getClientIp } from '../../lib/rateLimit';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { allowed } = RL_GENERAL(getClientIp(req));
  if (!allowed) return res.status(429).json({ error: 'Too many requests' });

  let connection: any;
  try {
    const mysql = require('mysql2/promise');
    connection = await Promise.race([
      mysql.createConnection({ host: process.env.DB_HOST||'srv497.hstgr.io', user: process.env.DB_USER||'u992747032_firestick4uk', password: process.env.DB_PASSWORD||'Firestick@2026', database: process.env.DB_NAME||'u992747032_firestick4uk', port: 3306, connectTimeout: 5000 }),
      new Promise((_,reject) => setTimeout(()=>reject(new Error('DB connection timeout')),6000)),
    ]);

    const { slug, id, category, minPrice, maxPrice, sort } = req.query;

    if (id) {
      const [rows]: any = await connection.query('SELECT * FROM products WHERE id=? AND active=1', [id]);
      return res.status(200).json(rows[0] || null);
    }

    if (slug) {
      const [rows]: any = await connection.query(
        "SELECT * FROM products WHERE active=1 AND LOWER(REPLACE(REPLACE(name,' ','-'),'/',''))=?",
        [String(slug).toLowerCase()]
      );
      return res.status(200).json(rows[0] || null);
    }

    // Build dynamic filter query
    let query = 'SELECT * FROM products WHERE active=1';
    const params: any[] = [];

    if (category && category !== 'All') {
      query += ' AND category=?';
      params.push(category);
    }
    if (minPrice) {
      query += ' AND price >= ?';
      params.push(Number(minPrice));
    }
    if (maxPrice) {
      query += ' AND price <= ?';
      params.push(Number(maxPrice));
    }

    const sortMap: Record<string,string> = {
      price_asc: 'price ASC',
      price_desc: 'price DESC',
      newest: 'created_at DESC',
      featured: 'id ASC',
    };
    query += ` ORDER BY ${sortMap[String(sort)] || 'id ASC'}`;

    const [rows] = await connection.query(query, params);
    return res.status(200).json(Array.isArray(rows) ? rows : []);

  } catch (error: any) {
    return res.status(200).json({ error: error.message });
  } finally {
    if (connection) try { await connection.end(); } catch (_) {}
  }
}
