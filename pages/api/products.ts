import type { NextApiRequest, NextApiResponse } from 'next';
import { RL_GENERAL, getClientIp } from '../../lib/rateLimit';
import pool from '../../lib/db';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { allowed } = RL_GENERAL(getClientIp(req));
  if (!allowed) return res.status(429).json({ error: 'Too many requests' });

  try {
    const { slug, id, category, minPrice, maxPrice, sort } = req.query;

    if (id) {
      const [rows]: any = await pool.query('SELECT * FROM products WHERE id=? AND active=1', [id]);
      return res.status(200).json(rows[0] || null);
    }

    if (slug) {
      const [rows]: any = await pool.query(
        "SELECT * FROM products WHERE active=1 AND LOWER(REPLACE(REPLACE(name,' ','-'),'/',''))=?",
        [String(slug).toLowerCase()]
      );
      return res.status(200).json(rows[0] || null);
    }

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

    const [rows] = await pool.query(query, params);
    return res.status(200).json(Array.isArray(rows) ? rows : []);

  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
