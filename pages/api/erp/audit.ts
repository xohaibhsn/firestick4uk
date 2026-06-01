import type { NextApiRequest, NextApiResponse } from 'next';

const getDB = async () => {
  const mysql = require('mysql2/promise');
  return Promise.race([
    mysql.createConnection({ host: process.env.DB_HOST||'srv497.hstgr.io', user: process.env.DB_USER||'u992747032_firestick4uk', password: process.env.DB_PASSWORD||'Firestick@2026', database: process.env.DB_NAME||'u992747032_firestick4uk', port: 3306, connectTimeout: 5000 }),
    new Promise((_,reject) => setTimeout(()=>reject(new Error('timeout')),6000)),
  ]);
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  let conn;
  try {
    conn = await getDB();
    const { limit: lim, action } = req.query;
    let query = 'SELECT a.*, u.name as user_name FROM erp_audit_log a LEFT JOIN erp_users u ON a.user_id=u.id WHERE 1=1';
    const params: any[] = [];
    if (action) { query += ' AND a.action LIKE ?'; params.push(`%${action}%`); }
    query += ' ORDER BY a.created_at DESC LIMIT ?';
    params.push(Number(lim)||100);
    const [rows] = await conn.query(query, params);
    return res.status(200).json(Array.isArray(rows)?rows:[]);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  } finally {
    if (conn) try { await conn.end(); } catch (_) {}
  }
}
