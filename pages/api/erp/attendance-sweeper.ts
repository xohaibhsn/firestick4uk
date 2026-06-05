import pool from '../../../lib/db';
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // DB migration — add shift_type column
    try {
      await pool.query(`ALTER TABLE erp_attendance ADD COLUMN shift_type ENUM('day','night','auto_closed') DEFAULT 'day'`);
    } catch (_) {}
    // Tag existing night shifts
    try {
      await pool.query(`
        UPDATE erp_attendance SET shift_type='night'
        WHERE (TIME(time_in) >= '18:00:00' OR TIME(time_in) <= '06:00:00')
        AND shift_type='day' AND time_in IS NOT NULL
      `);
    } catch (_) {}

    const now = new Date();

    // Find all open sessions (clocked in but no clock-out)
    const [openSessions]: any = await pool.query(`
      SELECT * FROM erp_attendance
      WHERE time_out IS NULL
        AND time_in IS NOT NULL
        AND status IN ('present','late','half_day')
    `);

    let autoClosedCount = 0;
    const closed: any[] = [];

    for (const session of openSessions) {
      const clockInTime = new Date(session.time_in);
      const expiryTime  = new Date(clockInTime.getTime() + 8 * 60 * 60 * 1000); // +8h

      if (now >= expiryTime) {
        // Auto clock-out at clock_in + 8h exactly
        const autoOut  = expiryTime.toISOString().slice(0,19).replace('T',' ');
        const hours    = 8.00;
        const newNote  = (session.admin_note ? session.admin_note + ' | ' : '') +
                         'Auto clock-out: 8hr cap reached';

        await pool.query(`
          UPDATE erp_attendance
          SET time_out=?, working_hours=?, shift_type='auto_closed',
              admin_note=?, status=IF(working_hours<4,'half_day',status)
          WHERE id=? AND time_out IS NULL
        `, [autoOut, hours, newNote, session.id]);

        autoClosedCount++;
        closed.push({ id: session.id, employee_id: session.employee_id, auto_out: autoOut });

        await pool.query(
          'INSERT INTO erp_audit_log (user_id,action,details) VALUES (?,?,?)',
          [session.employee_id, 'AUTO_CLOCKOUT', `Auto clock-out at ${autoOut} (8hr cap) for session #${session.id}`]
        ).catch(()=>{});
      }
    }

    return res.status(200).json({
      success: true,
      scanned: openSessions.length,
      auto_closed: autoClosedCount,
      closed,
      timestamp: now.toISOString(),
    });

  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
