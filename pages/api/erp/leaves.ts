import pool from '../../../lib/db';
import type { NextApiRequest, NextApiResponse } from 'next';

const LIMITS: Record<string,number> = { annual:14, sick:10, emergency:3 };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {

    // Auto-fix: cancel any approved leave records where attendance was overridden
    // to weekly_off, present, absent, or non-leave status on the same date.
    // This retroactively fixes cases that occurred before the cancellation logic was deployed.
    try {
      await pool.query(`
        UPDATE erp_leaves l
        SET l.status = 'cancelled'
        WHERE l.status = 'approved'
          AND EXISTS (
            SELECT 1 FROM erp_attendance a
            WHERE a.employee_id = l.employee_id
              AND a.date BETWEEN l.from_date AND l.to_date
              AND a.status IN ('weekly_off','present','absent','half_day','late','public_holiday')
              AND a.is_manual = 1
          )
      `);
    } catch (_) {}

    if (req.method === 'GET') {
      const { employee_id, balance, year } = req.query;

      // Leave balance
      if (balance && employee_id) {
        const y = String(year || new Date().getFullYear());
        const [rows]: any = await pool.query(`
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
      const [rows] = await pool.query(query, params);
      return res.status(200).json(Array.isArray(rows) ? rows : []);
    }

    if (req.method === 'POST') {
      const { employee_id, leave_type, from_date, to_date, reason } = req.body;
      if (!employee_id || !from_date || !to_date) return res.status(400).json({ error: 'Missing required fields' });
      const [result]: any = await pool.query(
        'INSERT INTO erp_leaves (employee_id,leave_type,from_date,to_date,reason) VALUES (?,?,?,?,?)',
        [employee_id, leave_type||'annual', from_date, to_date, reason||'']
      );
      return res.status(200).json({ success: true, id: result.insertId });
    }

    if (req.method === 'PATCH') {
      const { id, status } = req.body;
      if (!id || !status) return res.status(400).json({ error: 'Missing fields' });
      await pool.query('UPDATE erp_leaves SET status=? WHERE id=?', [status, id]);
      await pool.query('INSERT INTO erp_audit_log (action,details) VALUES (?,?)', [`LEAVE_${status.toUpperCase()}`, `Leave #${id} ${status}`]).catch(()=>{});
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
