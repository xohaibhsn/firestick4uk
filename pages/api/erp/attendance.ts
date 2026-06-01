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
      const { employee_id, date, all, summary, month, format } = req.query;

      // Monthly summary
      if (summary && employee_id) {
        const m = String(month || new Date().toISOString().slice(0,7));
        const [rows]: any = await conn.query(`
          SELECT
            COUNT(*) as total,
            SUM(status='present') as present,
            SUM(status='late') as late,
            SUM(status='absent') as absent,
            SUM(status='half_day') as half_day,
            ROUND(SUM(COALESCE(working_hours,0)),2) as total_hours
          FROM erp_attendance WHERE employee_id=? AND date LIKE ?
        `, [employee_id, `${m}%`]);
        return res.status(200).json(rows[0]||{});
      }

      let query = 'SELECT a.*, u.name as employee_name FROM erp_attendance a JOIN erp_users u ON a.employee_id=u.id WHERE 1=1';
      const params: any[] = [];
      if (employee_id) { query += ' AND a.employee_id=?'; params.push(employee_id); }
      if (date) { query += ' AND a.date=?'; params.push(date); }
      if (month) { query += ' AND a.date LIKE ?'; params.push(`${month}%`); }
      query += ' ORDER BY a.date DESC';
      if (!all && !month) query += ' LIMIT 100';

      const [rows]: any = await conn.query(query, params);
      const data = Array.isArray(rows) ? rows : [];

      // CSV export
      if (format === 'csv') {
        const header = 'Date,Employee,Clock In,Clock Out,Hours,Status\n';
        const csvRows = data.map((r:any) =>
          `${r.date},"${r.employee_name}",${r.time_in ? new Date(r.time_in).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}) : ''},${r.time_out ? new Date(r.time_out).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}) : ''},${r.working_hours||''},${r.status}`
        ).join('\n');
        res.setHeader('Content-Type','text/csv');
        res.setHeader('Content-Disposition',`attachment; filename="attendance-${date||month||'export'}.csv"`);
        return res.status(200).send(header + csvRows);
      }

      return res.status(200).json(data);
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
        await conn.query('INSERT INTO erp_audit_log (user_id,action,details) VALUES (?,?,?)', [employee_id,'CLOCK_IN',`Clocked in at ${now} — status: ${status}`]).catch(()=>{});
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
        await conn.query('INSERT INTO erp_audit_log (user_id,action,details) VALUES (?,?,?)', [employee_id,'CLOCK_OUT',`Clocked out at ${now} — ${hours}h worked`]).catch(()=>{});
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
