import type { NextApiRequest, NextApiResponse } from 'next';

const getDB = async () => {
  const mysql = require('mysql2/promise');
  return Promise.race([
    mysql.createConnection({ host: process.env.DB_HOST||'srv497.hstgr.io', user: process.env.DB_USER||'u992747032_firestick4uk', password: process.env.DB_PASSWORD||'Firestick@2026', database: process.env.DB_NAME||'u992747032_firestick4uk', port: 3306, connectTimeout: 5000 }),
    new Promise((_,reject) => setTimeout(()=>reject(new Error('timeout')),6000)),
  ]);
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let conn;
  try {
    conn = await getDB();

    if (req.method === 'GET') {
      const { employee_id } = req.query;
      let query = 'SELECT l.*,u.name as employee_name FROM erp_leaves l JOIN erp_users u ON l.employee_id=u.id';
      const params: any[] = [];
      if (employee_id) { query += ' WHERE l.employee_id=?'; params.push(employee_id); }
      query += ' ORDER BY l.created_at DESC';
      const [rows] = await conn.query(query, params);
      return res.status(200).json(Array.isArray(rows) ? rows : []);
    }

    if (req.method === 'POST') {
      const { employee_id, leave_type, from_date, to_date, reason } = req.body;
      if (!employee_id || !from_date || !to_date) return res.status(400).json({ error: 'Missing required fields' });
      const [result]: any = await conn.query(
        'INSERT INTO erp_leaves (employee_id,leave_type,from_date,to_date,reason) VALUES (?,?,?,?,?)',
        [employee_id, leave_type||'annual', from_date, to_date, reason||'']
      );
      return res.status(200).json({ success: true, id: result.insertId });
    }

    if (req.method === 'PATCH') {
      const { id, status } = req.body;
      if (!id || !status) return res.status(400).json({ error: 'Missing fields' });
      await conn.query('UPDATE erp_leaves SET status=? WHERE id=?', [status, id]);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  } finally {
    if (conn) try { await conn.end(); } catch (_) {}
  }
}
