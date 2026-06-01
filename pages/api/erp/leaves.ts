import type { NextApiRequest, NextApiResponse } from 'next';

const getDB = async () => {
  const mysql = require('mysql2/promise');
  return Promise.race([
    mysql.createConnection({ host: process.env.DB_HOST||'srv497.hstgr.io', user: process.env.DB_USER||'u992747032_firestick4uk', password: process.env.DB_PASSWORD||'Firestick@2026', database: process.env.DB_NAME||'u992747032_firestick4uk', port: 3306, connectTimeout: 5000 }),
    new Promise((_,reject) => setTimeout(()=>reject(new Error('timeout')),6000)),
  ]);
};

const LIMITS: Record<string,number> = { annual:14, sick:10, emergency:3 };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let conn;
  try {
    conn = await getDB();

    if (req.method === 'GET') {
      const { employee_id, balance, year } = req.query;

      // Leave balance
      if (balance && employee_id) {
        const y = String(year || new Date().getFullYear());
        const [rows]: any = await conn.query(`
          SELECT leave_type, SUM(DATEDIFF(to_date, from_date)+1) as days_taken
          FROM erp_leaves
          WHERE employee_id=? AND status='approved' AND YEAR(from_date)=?
          GROUP BY leave_type
        `, [employee_id, y]);
        const taken: Record<string,number> = {annual:0,sick:0,emergency:0};
        rows.forEach((r:any) => { if (taken[r.leave_type]!==undefined) taken[r.leave_type]=Number(r.days_taken); });
        return res.status(200).json({
          annual_taken: taken.annual, annual_limit: LIMITS.annual, annual_remaining: LIMITS.annual - taken.annual,
          sick_taken: taken.sick, sick_limit: LIMITS.sick, sick_remaining: LIMITS.sick - taken.sick,
          emergency_taken: taken.emergency, emergency_limit: LIMITS.emergency, emergency_remaining: LIMITS.emergency - taken.emergency,
        });
      }

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
      await conn.query('INSERT INTO erp_audit_log (action,details) VALUES (?,?)', [`LEAVE_${status.toUpperCase()}`, `Leave #${id} ${status}`]).catch(()=>{});
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  } finally {
    if (conn) try { await conn.end(); } catch (_) {}
  }
}
