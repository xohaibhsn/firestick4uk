import pool from '../../../lib/db';
import type { NextApiRequest, NextApiResponse } from 'next';
import { getLastCompletedMonthYear } from '../../../lib/payrollUtils';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // ── Auto-migrate new columns ──────────────────────────────────────────
    for (const sql of [
      "ALTER TABLE erp_payroll ADD COLUMN deduction_days DECIMAL(5,2) DEFAULT 0",
      "ALTER TABLE erp_payroll ADD COLUMN daily_rate DECIMAL(10,2) DEFAULT 0",
      "ALTER TABLE erp_payroll ADD COLUMN total_deductions DECIMAL(10,2) DEFAULT 0",
      "ALTER TABLE erp_payroll ADD COLUMN deduction_details TEXT",
      "ALTER TABLE erp_payroll ADD COLUMN generated_at DATETIME",
    ]) { try { await pool.query(sql); } catch (_) {} }

    // ── Determine target month ────────────────────────────────────────────
    const cutoff      = getLastCompletedMonthYear(); // e.g. '2026-05'
    const nowDate     = new Date();
    const nowMonthYear = `${nowDate.getFullYear()}-${String(nowDate.getMonth()+1).padStart(2,'0')}`;

    const { created_by, month_year: requestedMonth, exception } = req.body;

    let targetMonth: string;
    if (requestedMonth) {
      // Fix 2: block current or future months
      if (requestedMonth > cutoff) {
        const nextCutoffDate = (() => {
          const [y, m] = requestedMonth.split('-').map(Number);
          const d = new Date(y, m, 1); // 1st of next month
          return d.toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' });
        })();
        return res.status(400).json({
          error: `Cannot generate payroll for ${requestedMonth}. This will be available after ${nextCutoffDate}.`
        });
      }
      targetMonth = requestedMonth;
    } else {
      targetMonth = cutoff;
    }

    // Fix 1: May 2026 exception flag
    const isExceptionMonth = targetMonth === '2026-05' || exception === true;

    // ── Month metadata ────────────────────────────────────────────────────
    const [tYear, tMonth] = targetMonth.split('-').map(Number);
    const totalDaysInMonth = new Date(tYear, tMonth, 0).getDate();

    // Build all calendar dates for the target month
    const allDates: string[] = [];
    for (let d = 1; d <= totalDaysInMonth; d++) {
      const dt = new Date(tYear, tMonth - 1, d);
      allDates.push(dt.toISOString().split('T')[0]);
    }

    // ── Get active employees ──────────────────────────────────────────────
    const [employees]: any = await pool.query(
      'SELECT id,name,salary,department,weekly_off_day FROM erp_users WHERE active=1 AND salary>0 ORDER BY name'
    );
    if (!employees.length) {
      return res.status(200).json({ success:true, generated:0, message:'No active employees with salary' });
    }

    let generated = 0;
    const results: any[] = [];

    for (const emp of employees) {
      const baseSalary = Number(emp.salary || 0);

      // Always get approved expenses regardless of exception
      const [expRowsEarly]: any = await pool.query(
        `SELECT COALESCE(SUM(amount),0) as total FROM erp_expenses WHERE employee_id=? AND month_year=? AND status='approved'`,
        [emp.id, targetMonth]
      );
      const approvedExpensesEarly = Number(expRowsEarly[0]?.total || 0);

      // ── Fix 1: May 2026 exception — full salary, no deductions ──────────
      if (isExceptionMonth) {
        const netPayException = baseSalary + approvedExpensesEarly;
        await pool.query(`
          INSERT INTO erp_payroll
            (employee_id, month_year, base_salary, deduction_days, daily_rate,
             total_deductions, total_expenses, advances, net_pay,
             deduction_details, status, generated_at)
          VALUES (?,?,?,0,0,0,?,0,?,'Exception: Full salary — no attendance deduction','pending',NOW())
          ON DUPLICATE KEY UPDATE
            net_pay           = IF(status='pending', VALUES(net_pay),           net_pay),
            total_expenses    = IF(status='pending', VALUES(total_expenses),    total_expenses),
            deduction_details = IF(status='pending', VALUES(deduction_details), deduction_details),
            generated_at      = IF(status='pending', NOW(),                     generated_at)
        `, [emp.id, targetMonth, baseSalary, approvedExpensesEarly, netPayException]);
        generated++;
        results.push({ id: emp.id, name: emp.name, base_salary: baseSalary, deduction_days: 0, total_deductions: 0, approved_expenses: approvedExpensesEarly, net_pay: netPayException, exception: true });
        continue; // skip normal attendance logic
      }

      const dailyRate    = baseSalary / totalDaysInMonth;
      const weeklyOffDay = Number(emp.weekly_off_day ?? 0); // 0=Sun, 1=Mon…6=Sat

      // ── STEP B: Attendance records ──────────────────────────────────────
      const [attRows]: any = await pool.query(
        // Fix 3: USE date (anchor) NOT time_in — night shifts count for their start date
        `SELECT date, status, working_hours, shift_type FROM erp_attendance
         WHERE employee_id=? AND DATE_FORMAT(date,'%Y-%m')=?`,
        [emp.id, targetMonth]
      );
      // Map date → status for fast lookup
      const attMap: Record<string, string> = {};
      for (const a of attRows) {
        const d = typeof a.date === 'string'
          ? a.date.slice(0,10)
          : new Date(a.date).toISOString().split('T')[0];
        attMap[d] = a.status;
      }

      // ── STEP C: Approved leaves ─────────────────────────────────────────
      const [leaveRows]: any = await pool.query(
        `SELECT from_date, to_date, leave_type FROM erp_leaves
         WHERE employee_id=?
           AND status='approved'
           AND leave_type IN ('annual','sick','emergency')
           AND (
             DATE_FORMAT(from_date,'%Y-%m')=?
             OR DATE_FORMAT(to_date,'%Y-%m')=?
           )`,
        [emp.id, targetMonth, targetMonth]
      );

      // ── STEP D: Build approved leave dates set ──────────────────────────
      const approvedLeaveDates = new Set<string>();
      for (const lv of leaveRows) {
        const start = new Date(lv.from_date);
        const end   = new Date(lv.to_date);
        const cur   = new Date(start);
        while (cur <= end) {
          approvedLeaveDates.add(cur.toISOString().split('T')[0]);
          cur.setDate(cur.getDate() + 1);
        }
      }

      // ── STEP E: Count deduction days ────────────────────────────────────
      let deductionDays = 0;
      const deductionDetails: { date: string; reason: string }[] = [];

      for (const dateStr of allDates) {
        const dt        = new Date(dateStr);
        const dayOfWeek = dt.getDay(); // 0=Sun…6=Sat

        // Skip weekly off day
        if (dayOfWeek === weeklyOffDay) continue;

        const status = attMap[dateStr];

        if (!status) {
          // No attendance record
          if (!approvedLeaveDates.has(dateStr)) {
            deductionDays += 1;
            deductionDetails.push({ date: dateStr, reason: 'Absent — No record' });
          }
        } else if (status === 'absent') {
          if (!approvedLeaveDates.has(dateStr)) {
            deductionDays += 1;
            deductionDetails.push({ date: dateStr, reason: 'Absent' });
          }
        } else if (status === 'half_day') {
          deductionDays += 0.5;
          deductionDetails.push({ date: dateStr, reason: 'Half Day' });
        }
        // present, late, sick_leave, annual_leave, emergency_leave,
        // weekly_off, public_holiday → no deduction
      }

      // ── STEP F: Deduction amount ─────────────────────────────────────────
      const totalDeductions = Math.round(deductionDays * dailyRate * 100) / 100;

      // ── STEP G: Approved expenses (reuse early query result) ─────────────
      const approvedExpenses = approvedExpensesEarly;

      // ── STEP H: Advances ─────────────────────────────────────────────────
      const [advRows]: any = await pool.query(
        `SELECT COALESCE(SUM(t.amount),0) as total
         FROM erp_transactions t
         JOIN erp_accounts a ON t.account_id=a.id
         WHERE a.reference_id=? AND a.type='employee'
           AND t.type='debit' AND t.reference_type='advance'
           AND DATE_FORMAT(t.created_at,'%Y-%m')=?`,
        [emp.id, targetMonth]
      );
      const advances = Number(advRows[0]?.total || 0);

      // ── STEP I: Net pay ──────────────────────────────────────────────────
      const rawNet    = baseSalary - totalDeductions + approvedExpenses - advances;
      const finalNet  = Math.max(0, Math.round(rawNet * 100) / 100);
      const roundedDR = Math.round(dailyRate * 100) / 100;

      // ── INSERT / UPDATE erp_payroll (only if pending, never overwrite credited) ──
      await pool.query(`
        INSERT INTO erp_payroll
          (employee_id, month_year, base_salary, deduction_days, daily_rate,
           total_deductions, total_expenses, advances, net_pay,
           deduction_details, status, generated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,\'pending\',NOW())
        ON DUPLICATE KEY UPDATE
          deduction_days     = IF(status=\'pending\', VALUES(deduction_days),     deduction_days),
          daily_rate         = IF(status=\'pending\', VALUES(daily_rate),          daily_rate),
          total_deductions   = IF(status=\'pending\', VALUES(total_deductions),    total_deductions),
          total_expenses     = IF(status=\'pending\', VALUES(total_expenses),      total_expenses),
          advances           = IF(status=\'pending\', VALUES(advances),            advances),
          net_pay            = IF(status=\'pending\', VALUES(net_pay),             net_pay),
          deduction_details  = IF(status=\'pending\', VALUES(deduction_details),   deduction_details),
          generated_at       = IF(status=\'pending\', NOW(),                       generated_at)
      `, [
        emp.id, targetMonth, baseSalary, deductionDays, roundedDR,
        totalDeductions, approvedExpenses, advances, finalNet,
        JSON.stringify(deductionDetails),
      ]);

      generated++;
      results.push({
        id: emp.id, name: emp.name, base_salary: baseSalary,
        deduction_days: deductionDays, daily_rate: roundedDR,
        total_deductions: totalDeductions, approved_expenses: approvedExpenses,
        advances, net_pay: finalNet, deduction_details: deductionDetails,
      });
    }

    await pool.query(
      'INSERT INTO erp_audit_log (user_id,action,details) VALUES (?,?,?)',
      [created_by||null, 'PAYROLL_GENERATED',
       `Attendance-based payroll generated for ${generated} employees — ${targetMonth}`]
    ).catch(()=>{});

    return res.status(200).json({
      success: true, generated, month_year: targetMonth,
      total_days_in_month: totalDaysInMonth, results,
    });

  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
