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
      const { employee_id, date, all } = req.query;
      let query = 'SELECT a.*, u.name as employee_name FROM erp_attendance a JOIN erp_users u ON a.employee_id=u.id WHERE 1=1';
      const params: any[] = [];
      if (employee_id) { query += ' AND a.employee_id=?'; params.push(employee_id); }
      if (date) { query += ' AND a.date=?'; params.push(date); }
      if (!all) query += ' ORDER BY a.date DESC LIMIT 100';
      else query += ' ORDER BY a.date DESC';
      const [rows] = await conn.query(query, params);
      return res.status(200).json(Array.isArray(rows) ? rows : []);
    }

    if (req.method === 'POST') {
      const { employee_id, action } = req.body;
      if (!employee_id || !action) return res.status(400).json({ error: 'Missing fields' });

      const today = new Date().toISOString().slice(0,10);
      const now = new Date().toISOString().slice(0,19).replace('T',' ');

      const [existing]: any = await conn.query('SELECT * FROM erp_attendance WHERE employee_id=? AND date=?', [employee_id, today]);

      if (action === 'in') {
        if (existing.length) return res.status(400).json({ error: 'Already clocked in today' });
        const hour = new Date().getHours();
        const status = hour >= 10 ? 'late' : 'present';
        await conn.query('INSERT INTO erp_attendance (employee_id,date,time_in,status) VALUES (?,?,?,?)', [employee_id, today, now, status]);
        return res.status(200).json({ success: true, message: 'Clocked in', status });
      }

      if (action === 'out') {
        if (!existing.length) return res.status(400).json({ error: 'Not clocked in today' });
        if (existing[0].time_out) return res.status(400).json({ error: 'Already clocked out' });
        const inTime = new Date(existing[0].time_in);
        const outTime = new Date();
        const hours = Math.round((outTime.getTime() - inTime.getTime()) / 3600000 * 100) / 100;
        const status = hours < 4 ? 'half_day' : existing[0].status;
        await conn.query('UPDATE erp_attendance SET time_out=?,working_hours=?,status=? WHERE id=?', [now, hours, status, existing[0].id]);
        return res.status(200).json({ success: true, message: 'Clocked out', hours });
      }

      return res.status(400).json({ error: 'Invalid action' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  } finally {
    if (conn) try { await conn.end(); } catch (_) {}
  }
}
