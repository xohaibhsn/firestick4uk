import type { NextApiRequest, NextApiResponse } from 'next';

const getDB = async () => {
  const mysql = require('mysql2/promise');
  return Promise.race([
    mysql.createConnection({ host: process.env.DB_HOST||'srv497.hstgr.io', user: process.env.DB_USER||'u992747032_firestick4uk', password: process.env.DB_PASSWORD||'Firestick@2026', database: process.env.DB_NAME||'u992747032_firestick4uk', port: 3306, connectTimeout: 5000 }),
    new Promise((_,reject) => setTimeout(()=>reject(new Error('timeout')),6000)),
  ]);
};

const LEAVE_MAP: Record<string,string> = {
  sick_leave:'sick', annual_leave:'annual', emergency_leave:'emergency'
};
const LEAVE_LIMITS: Record<string,number> = { sick:10, annual:14, emergency:3 };

async function handleLeaveQuota(conn:any, employee_id:number, date:string, status:string, admin_note:string) {
  const leaveType = LEAVE_MAP[status];
  if (!leaveType) return { warning: null };
  const year = new Date(date).getFullYear();

  // Check current quota used
  const [taken]: any = await conn.query(
    'SELECT COALESCE(SUM(DATEDIFF(to_date, from_date)+1),0) as days FROM erp_leaves WHERE employee_id=? AND leave_type=? AND status="approved" AND YEAR(from_date)=?',
    [employee_id, leaveType, year]
  );
  const usedDays = Number(taken[0]?.days || 0);
  const limit = LEAVE_LIMITS[leaveType];
  const warning = usedDays >= limit ? `Warning: ${leaveType} quota exceeded (${usedDays}/${limit} used)` : null;

  // Create approved leave record for this date if not exists
  const [existingLeave]: any = await conn.query(
    'SELECT id FROM erp_leaves WHERE employee_id=? AND from_date=? AND to_date=? AND leave_type=?',
    [employee_id, date, date, leaveType]
  );
  if (!existingLeave.length) {
    await conn.query(
      'INSERT INTO erp_leaves (employee_id,leave_type,from_date,to_date,reason,status) VALUES (?,?,?,?,?,?)',
      [employee_id, leaveType, date, date, admin_note||'Marked by admin', 'approved']
    );
  }
  return { warning };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let conn: any;
  try {
    conn = await getDB();

    // Auto-migrate columns
    for (const sql of [
      "ALTER TABLE erp_attendance MODIFY COLUMN status VARCHAR(30) NOT NULL DEFAULT 'present'",
      "ALTER TABLE erp_attendance ADD COLUMN marked_by INT NULL",
      "ALTER TABLE erp_attendance ADD COLUMN admin_note TEXT NULL",
      "ALTER TABLE erp_attendance ADD COLUMN is_manual TINYINT(1) DEFAULT 0",
      "ALTER TABLE erp_users ADD COLUMN weekly_off_day INT DEFAULT 0",
    ]) { try { await conn.query(sql); } catch (_) {} }

    // ─── GET ───────────────────────────────────────────────────────────────
    if (req.method === 'GET') {
      const { employee_id, date, all, summary, month, format } = req.query;

      if (summary && employee_id) {
        const m = String(month || new Date().toISOString().slice(0,7));
        const [rows]: any = await conn.query(`
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

      const [rows]: any = await conn.query(query, params);
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
        const today = new Date().toISOString().slice(0,10);
        const now = new Date().toISOString().slice(0,19).replace('T',' ');
        const [existing]: any = await conn.query('SELECT * FROM erp_attendance WHERE employee_id=? AND date=?', [employee_id, today]);
        if (action === 'in') {
          if (existing.length) return res.status(400).json({ error: 'Already clocked in today' });
          const hour = new Date().getHours();
          const st = hour >= 10 ? 'late' : 'present';
          await conn.query('INSERT INTO erp_attendance (employee_id,date,time_in,status) VALUES (?,?,?,?)', [employee_id, today, now, st]);
          await conn.query('INSERT INTO erp_audit_log (user_id,action,details) VALUES (?,?,?)', [employee_id,'CLOCK_IN',`Clocked in at ${now}`]).catch(()=>{});
          return res.status(200).json({ success:true, message:'Clocked in', status:st });
        }
        if (action === 'out') {
          if (!existing.length) return res.status(400).json({ error: 'Not clocked in today' });
          if (existing[0].time_out) return res.status(400).json({ error: 'Already clocked out' });
          const hours = Math.round((Date.now() - new Date(existing[0].time_in).getTime()) / 3600000 * 100) / 100;
          const st = hours < 4 ? 'half_day' : existing[0].status;
          await conn.query('UPDATE erp_attendance SET time_out=?,working_hours=?,status=? WHERE id=?', [now, hours, st, existing[0].id]);
          await conn.query('INSERT INTO erp_audit_log (user_id,action,details) VALUES (?,?,?)', [employee_id,'CLOCK_OUT',`Clocked out at ${now} — ${hours}h`]).catch(()=>{});
          return res.status(200).json({ success:true, message:'Clocked out', hours });
        }
      }

      // Manual single attendance mark
      if (action === 'manual_mark') {
        const [existing]: any = await conn.query('SELECT id FROM erp_attendance WHERE employee_id=? AND date=?', [employee_id, date]);
        let warning = null;

        if (existing.length) {
          await conn.query(
            'UPDATE erp_attendance SET status=?,time_in=COALESCE(NULLIF(?,\'\'),time_in),time_out=COALESCE(NULLIF(?,\'\'),time_out),admin_note=?,marked_by=?,is_manual=1 WHERE id=?',
            [status, time_in||'', time_out||'', admin_note||'', marked_by||null, existing[0].id]
          );
        } else {
          await conn.query(
            'INSERT INTO erp_attendance (employee_id,date,status,time_in,time_out,admin_note,marked_by,is_manual) VALUES (?,?,?,?,?,?,?,1)',
            [employee_id, date, status, time_in||null, time_out||null, admin_note||'', marked_by||null]
          );
        }

        const result = await handleLeaveQuota(conn, employee_id, date, status, admin_note||'');
        warning = result.warning;

        await conn.query('INSERT INTO erp_audit_log (user_id,action,details) VALUES (?,?,?)',
          [marked_by,'ATTENDANCE_MANUAL',`Marked emp#${employee_id} as ${status} on ${date}${admin_note?` — ${admin_note}`:''}`]
        ).catch(()=>{});

        return res.status(200).json({ success:true, warning });
      }

      // Bulk attendance mark
      if (action === 'bulk_mark') {
        const warnings: string[] = [];
        for (const rec of (records||[])) {
          const [existing]: any = await conn.query('SELECT id FROM erp_attendance WHERE employee_id=? AND date=?', [rec.employee_id, date]);
          if (existing.length) {
            await conn.query(
              'UPDATE erp_attendance SET status=?,admin_note=?,marked_by=?,is_manual=1 WHERE id=?',
              [rec.status, rec.admin_note||'', marked_by||null, existing[0].id]
            );
          } else {
            await conn.query(
              'INSERT INTO erp_attendance (employee_id,date,status,admin_note,marked_by,is_manual) VALUES (?,?,?,?,?,1)',
              [rec.employee_id, date, rec.status, rec.admin_note||'', marked_by||null]
            );
          }
          const result = await handleLeaveQuota(conn, rec.employee_id, date, rec.status, rec.admin_note||'');
          if (result.warning) warnings.push(`${rec.employee_id}: ${result.warning}`);
        }
        await conn.query('INSERT INTO erp_audit_log (user_id,action,details) VALUES (?,?,?)',
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

      const [existing]: any = await conn.query('SELECT * FROM erp_attendance WHERE id=?', [id]);
      if (!existing.length) return res.status(404).json({ error: 'Record not found' });
      const old = existing[0];

      await conn.query(
        'UPDATE erp_attendance SET status=?,time_in=COALESCE(NULLIF(?,\'\'),time_in),time_out=COALESCE(NULLIF(?,\'\'),time_out),admin_note=?,marked_by=?,is_manual=1 WHERE id=?',
        [status, time_in||'', time_out||'', admin_note||'', marked_by||null, id]
      );

      // Handle leave quota if new status is leave type
      let warning = null;
      if (LEAVE_MAP[status] && status !== old.status) {
        const result = await handleLeaveQuota(conn, old.employee_id, old.date, status, admin_note||'');
        warning = result.warning;
      }

      await conn.query('INSERT INTO erp_audit_log (user_id,action,details) VALUES (?,?,?)',
        [marked_by,'ATTENDANCE_EDIT',`Edited emp#${old.employee_id} att#${id}: ${old.status}→${status} on ${old.date}`]
      ).catch(()=>{});

      return res.status(200).json({ success:true, warning });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  } finally {
    if (conn) try { await conn.end(); } catch (_) {}
  }
}
