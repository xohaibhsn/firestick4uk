import pool from '../../../lib/db';
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { limit: lim, action } = req.query;
    let query = 'SELECT a.*, u.name as user_name FROM erp_audit_log a LEFT JOIN erp_users u ON a.user_id=u.id WHERE 1=1';
    const params: any[] = [];
    if (action) { query += ' AND a.action LIKE ?'; params.push(`%${action}%`); }
    query += ' ORDER BY a.created_at DESC LIMIT ?';
    params.push(Number(lim)||100);
    const [rows] = await pool.query(query, params);
    return res.status(200).json(Array.isArray(rows)?rows:[]);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
