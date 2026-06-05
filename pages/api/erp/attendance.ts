import pool from '../../../lib/db';
import type { NextApiRequest, NextApiResponse } from 'next';

const LEAVE_MAP: Record<string,string> = {
  sick_leave:'sick', annual_leave:'annual', emergency_leave:'emergency'
};
const LEAVE_LIMITS: Record<string,number> = { sick:10, annual:14, emergency:3 };

/**
 * When an admin changes attendance FROM a leave status to present/absent/weekly_off,
 * cancel the auto-created single-day leave record so quota is restored.
 */
async function cancelLeaveForDate(employee_id: number, date: string, old_status: string): Promise<void> {
  const leaveType = LEAVE_MAP[old_status];
  if (!leaveType) return; // old status wasn't a leave — nothing to cancel

  // Only cancel single-day auto-created leaves (from_date = to_date = date)
  await pool.query(
    `UPDATE erp_leaves SET status='cancelled'
     WHERE employee_id=? AND leave_type=? AND from_date=? AND to_date=? AND status='approved'`,
    [employee_id, leaveType, date, date]
  );
}

async function handleLeaveQuota(employee_id:number, date:string, status:string, admin_note:string) {
  const leaveType = LEAVE_MAP[status];
  if (!leaveType) return { warning: null };
  const year = new Date(date).getFullYear();

  // Check current quota used
  const [taken]: any = await pool.query(
    'SELECT COALESCE(SUM(DATEDIFF(to_date, from_date)+1),0) as days FROM erp_leaves WHERE employee_id=? AND leave_type=? AND status="approved" AND YEAR(from_date)=?',
    [employee_id, leaveType, year]
  );
  const usedDays = Number(taken[0]?.days || 0);
  const limit = LEAVE_LIMITS[leaveType];
  const warning = usedDays >= limit ? `Warning: ${leaveType} quota exceeded (${usedDays}/${limit} used)` : null;

  // Create approved leave record for this date if not exists
  const [existingLeave]: any = await pool.query(
    'SELECT id FROM erp_leaves WHERE employee_id=? AND from_date=? AND to_date=? AND leave_type=?',
    [employee_id, date, date, leaveType]
  );
  if (!existingLeave.length) {
    await pool.query(
      'INSERT INTO erp_leaves (employee_id,leave_type,from_date,to_date,reason,status) VALUES (?,?,?,?,?,?)',
      [employee_id, leaveType, date, date, admin_note||'Marked by admin', 'approved']
    );
  }
  return { warning };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {

    // Auto-migrate columns
    for (const sql of [
      "ALTER TABLE erp_attendance MODIFY COLUMN status VARCHAR(30) NOT NULL DEFAULT 'present'",
      "ALTER TABLE erp_attendance ADD COLUMN marked_by INT NULL",
      "ALTER TABLE erp_attendance ADD COLUMN admin_note TEXT NULL",
      "ALTER TABLE erp_attendance ADD COLUMN is_manual TINYINT(1) DEFAULT 0",
      "ALTER TABLE erp_users ADD COLUMN weekly_off_day INT DEFAULT 0",
    ]) { try { await pool.query(sql); } catch (_) {} }

    // ─── GET ───────────────────────────────────────────────────────────────
    if (req.method === 'GET') {
      const { employee_id, date, all, summary, month, format } = req.query;

      if (summary && employee_id) {
        const m = String(month || new Date().toISOString().slice(0,7));
        const [rows]: any = await pool.query(`
          SELECT COUNT(*) as total,
            SUM(status='present') as present,
            SUM(status='late') as late,
            SUM(status='absent') as absent,
            SUM(status='half_day') as half_day,
            SUM(status='sick_leave') as sick_leave,
            SUM(status='annual_leave') as annual_leave,
            SUM(status='emergency_leave') as emergency_leave,
            SUM(status='weekly_off') as weekly_off,
            SUM(status='public_holiday') as public_holiday,
            ROUND(SUM(COALESCE(working_hours,0)),2) as total_hours
          FROM erp_attendance WHERE employee_id=? AND date LIKE ?
        `, [employee_id, `${m}%`]);
        return res.status(200).json(rows[0]||{});
      }

      let query = 'SELECT a.*, u.name as employee_name, m.name as marked_by_name FROM erp_attendance a JOIN erp_users u ON a.employee_id=u.id LEFT JOIN erp_users m ON a.marked_by=m.id WHERE 1=1';
      const params: any[] = [];
      if (employee_id) { query += ' AND a.employee_id=?'; params.push(employee_id); }
      if (date) { query += ' AND a.date=?'; params.push(date); }
      if (month) { query += ' AND a.date LIKE ?'; params.push(`${month}%`); }
      query += ' ORDER BY a.date DESC';
      if (!all && !month) query += ' LIMIT 100';

      const [rows]: any = await pool.query(query, params);
      const data = Array.isArray(rows) ? rows : [];

      if (format === 'csv') {
        const header = 'Date,Employee,Clock In,Clock Out,Hours,Status,Admin Note\n';
        const csvRows = data.map((r:any) =>
          `${r.date},"${r.employee_name}",${r.time_in ? new Date(r.time_in).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}) : ''},${r.time_out ? new Date(r.time_out).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}) : ''},${r.working_hours||''},${r.status},"${r.admin_note||''}"`
        ).join('\n');
        res.setHeader('Content-Type','text/csv');
        res.setHeader('Content-Disposition',`attachment; filename="attendance-${date||month||'export'}.csv"`);
        return res.status(200).send(header + csvRows);
      }
      return res.status(200).json(data);
    }

    // ─── POST ──────────────────────────────────────────────────────────────
    if (req.method === 'POST') {
      const { action, employee_id, date, status, time_in, time_out, admin_note, marked_by, records } = req.body;

      // Personal clock in/out
      if (action === 'in' || action === 'out') {
        const nowTs     = new Date();
        const nowStr    = nowTs.toISOString().slice(0,19).replace('T',' ');

        if (action === 'in') {
          // Fix 2: ANCHOR DATE = clock-in date (handles night shifts)
          const anchorDate = nowTs.toISOString().slice(0,10); // always clock-in date
          const [existing]: any = await pool.query(
            'SELECT * FROM erp_attendance WHERE employee_id=? AND date=?',
            [employee_id, anchorDate]
          );
          if (existing.length && existing[0].time_in) {
            return res.status(400).json({ error: 'Already clocked in for this date' });
          }
          const hour = nowTs.getHours();
          const st   = hour >= 10 ? 'late' : 'present';
          // Detect night shift for shift_type
          const shiftType = (hour >= 18 || hour <= 5) ? 'night' : 'day';
          await pool.query(
            'INSERT INTO erp_attendance (employee_id,date,time_in,status,shift_type) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE time_in=?,status=?,shift_type=?',
            [employee_id, anchorDate, nowStr, st, shiftType, nowStr, st, shiftType]
          );
          await pool.query('INSERT INTO erp_audit_log (user_id,action,details) VALUES (?,?,?)',
            [employee_id,'CLOCK_IN',`Clocked in at ${nowStr} (anchor: ${anchorDate})`]
          ).catch(()=>{});
          return res.status(200).json({ success:true, message:'Clocked in', status:st, anchor_date: anchorDate });
        }

        if (action === 'out') {
          // Find the OPEN session for this employee (date anchored at clock-in date)
          // Look for any open session (time_out IS NULL) — not tied to today's date
          const [openSession]: any = await pool.query(
            'SELECT * FROM erp_attendance WHERE employee_id=? AND time_out IS NULL AND time_in IS NOT NULL ORDER BY time_in DESC LIMIT 1',
            [employee_id]
          );
          if (!openSession.length) return res.status(400).json({ error: 'Not clocked in' });
          const sess = openSession[0];
          // time_out can be NEXT DAY — date column never changes (anchor stays)
          const hours = Math.round((nowTs.getTime() - new Date(sess.time_in).getTime()) / 3600000 * 100) / 100;
          const cappedHours = Math.min(hours, 8); // cap at 8h
          const st = cappedHours < 4 ? 'half_day' : sess.status;
          // DO NOT update date column — only time_out + hours
          await pool.query(
            'UPDATE erp_attendance SET time_out=?,working_hours=?,status=? WHERE id=?',
            [nowStr, cappedHours, st, sess.id]
          );
          await pool.query('INSERT INTO erp_audit_log (user_id,action,details) VALUES (?,?,?)',
            [employee_id,'CLOCK_OUT',`Clocked out at ${nowStr} — ${cappedHours}h (anchor: ${sess.date})`]
          ).catch(()=>{});
          return res.status(200).json({ success:true, message:'Clocked out', hours: cappedHours, anchor_date: sess.date });
        }
      }

      // Manual single attendance mark
      if (action === 'manual_mark') {
        const [existing]: any = await pool.query('SELECT id FROM erp_attendance WHERE employee_id=? AND date=?', [employee_id, date]);
        let warning = null;

        if (existing.length) {
          await pool.query(
            'UPDATE erp_attendance SET status=?,time_in=COALESCE(NULLIF(?,\'\'),time_in),time_out=COALESCE(NULLIF(?,\'\'),time_out),admin_note=?,marked_by=?,is_manual=1 WHERE id=?',
            [status, time_in||'', time_out||'', admin_note||'', marked_by||null, existing[0].id]
          );
        } else {
          await pool.query(
            'INSERT INTO erp_attendance (employee_id,date,status,time_in,time_out,admin_note,marked_by,is_manual) VALUES (?,?,?,?,?,?,?,1)',
            [employee_id, date, status, time_in||null, time_out||null, admin_note||'', marked_by||null]
          );
        }

        // If overwriting an existing leave status with a non-leave status, cancel the leave
        if (existing.length) {
          const [prevRow]: any = await pool.query('SELECT status FROM erp_attendance WHERE id=?', [existing[0].id]);
          const prevStatus = prevRow[0]?.status;
          if (LEAVE_MAP[prevStatus] && !LEAVE_MAP[status]) {
            await cancelLeaveForDate(Number(employee_id), date, prevStatus);
          }
        }

        const result = await handleLeaveQuota(Number(employee_id), date, status, admin_note||'');
        warning = result.warning;

        await pool.query('INSERT INTO erp_audit_log (user_id,action,details) VALUES (?,?,?)',
          [marked_by,'ATTENDANCE_MANUAL',`Marked emp#${employee_id} as ${status} on ${date}${admin_note?` — ${admin_note}`:''}`]
        ).catch(()=>{});

        return res.status(200).json({ success:true, warning });
      }

      // Bulk attendance mark
      if (action === 'bulk_mark') {
        const warnings: string[] = [];
        for (const rec of (records||[])) {
          const [existing]: any = await pool.query('SELECT id FROM erp_attendance WHERE employee_id=? AND date=?', [rec.employee_id, date]);
          if (existing.length) {
            await pool.query(
              'UPDATE erp_attendance SET status=?,admin_note=?,marked_by=?,is_manual=1 WHERE id=?',
              [rec.status, rec.admin_note||'', marked_by||null, existing[0].id]
            );
          } else {
            await pool.query(
              'INSERT INTO erp_attendance (employee_id,date,status,admin_note,marked_by,is_manual) VALUES (?,?,?,?,?,1)',
              [rec.employee_id, date, rec.status, rec.admin_note||'', marked_by||null]
            );
          }
          // Cancel leave if overwriting a leave status with non-leave
          if (existing.length) {
            const [prevRow]: any = await pool.query('SELECT status FROM erp_attendance WHERE id=?', [existing[0].id]);
            const prevStatus = prevRow[0]?.status;
            if (LEAVE_MAP[prevStatus] && !LEAVE_MAP[rec.status]) {
              await cancelLeaveForDate(Number(rec.employee_id), date, prevStatus);
            }
          }
          const result = await handleLeaveQuota(rec.employee_id, date, rec.status, rec.admin_note||'');
          if (result.warning) warnings.push(`${rec.employee_id}: ${result.warning}`);
        }
        await pool.query('INSERT INTO erp_audit_log (user_id,action,details) VALUES (?,?,?)',
          [marked_by,'ATTENDANCE_BULK',`Bulk marked ${(records||[]).length} employees for ${date}`]
        ).catch(()=>{});
        return res.status(200).json({ success:true, warnings });
      }

      return res.status(400).json({ error: 'Invalid action' });
    }

    // ─── PATCH (edit existing) ─────────────────────────────────────────────
    if (req.method === 'PATCH') {
      const { id, status, time_in, time_out, admin_note, marked_by } = req.body;
      if (!id) return res.status(400).json({ error: 'Missing id' });

      const [existing]: any = await pool.query('SELECT * FROM erp_attendance WHERE id=?', [id]);
      if (!existing.length) return res.status(404).json({ error: 'Record not found' });
      const old = existing[0];

      await pool.query(
        'UPDATE erp_attendance SET status=?,time_in=COALESCE(NULLIF(?,\'\'),time_in),time_out=COALESCE(NULLIF(?,\'\'),time_out),admin_note=?,marked_by=?,is_manual=1 WHERE id=?',
        [status, time_in||'', time_out||'', admin_note||'', marked_by||null, id]
      );

      let warning = null;
      if (status !== old.status) {
        if (LEAVE_MAP[status]) {
          // Status changed TO a leave type → create/update leave quota
          const result = await handleLeaveQuota(old.employee_id, old.date, status, admin_note||'');
          warning = result.warning;
        } else if (LEAVE_MAP[old.status]) {
          // Status changed FROM a leave type (→ present/absent/weekly_off etc.) → cancel leave & restore quota
          await cancelLeaveForDate(old.employee_id, old.date, old.status);
          warning = null;
        }
      }

      await pool.query('INSERT INTO erp_audit_log (user_id,action,details) VALUES (?,?,?)',
        [marked_by,'ATTENDANCE_EDIT',`Edited emp#${old.employee_id} att#${id}: ${old.status}→${status} on ${old.date}`]
      ).catch(()=>{});

      return res.status(200).json({ success:true, warning, leave_cancelled: LEAVE_MAP[old.status] && !LEAVE_MAP[status] });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
