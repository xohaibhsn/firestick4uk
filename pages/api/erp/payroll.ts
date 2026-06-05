import pool from '../../../lib/db';
import type { NextApiRequest, NextApiResponse } from 'next';
import { getLastCompletedMonthYear } from '../../../lib/payrollUtils';

const currentMonthYear = () => new Date().toISOString().slice(0,7);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {

    // Ensure employee accounts + payroll table exist
    try {
      await pool.query(`INSERT IGNORE INTO erp_accounts (name,type,reference_id,opening_balance) SELECT name,'employee',id,0.00 FROM erp_users WHERE active=1`);
    } catch (_) {}

    await pool.query(`
      CREATE TABLE IF NOT EXISTS erp_payroll (
        id INT AUTO_INCREMENT PRIMARY KEY,
        employee_id INT NOT NULL,
        month_year VARCHAR(7) NOT NULL,
        base_salary DECIMAL(10,2) DEFAULT 0,
        total_expenses DECIMAL(10,2) DEFAULT 0,
        advances DECIMAL(10,2) DEFAULT 0,
        net_pay DECIMAL(10,2) DEFAULT 0,
        status ENUM('pending','credited','partial') DEFAULT 'pending',
        credited_at DATETIME DEFAULT NULL,
        credited_by INT DEFAULT NULL,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_payroll (employee_id, month_year)
      )
    `);

    // ── GET — payroll summary ──────────────────────────────────────────────
    if (req.method === 'GET') {
      const cutoff   = getLastCompletedMonthYear();
      const rawMonth = String(req.query.month || cutoff);
      // Block current and future months — clamp to last completed
      const month    = rawMonth > cutoff ? cutoff : rawMonth;

      const { employee_id, manager_id, view } = req.query;

      // view=pending|credited — return erp_payroll records
      if (view) {
        const cutoff = getLastCompletedMonthYear();
        let q = `SELECT p.*, u.name, u.department FROM erp_payroll p JOIN erp_users u ON p.employee_id=u.id WHERE p.month_year <= ?`;
        const params: any[] = [cutoff];
        if (view === 'pending') { q += ' AND p.status="pending"'; }
        if (view === 'credited') { q += ' AND p.status="credited"'; }
        if (employee_id) { q += ' AND p.employee_id=?'; params.push(employee_id); }
        if (manager_id) { q += ' AND u.reports_to=?'; params.push(manager_id); }
        q += ' ORDER BY p.month_year DESC, u.name ASC';
        const [rows] = await pool.query(q, params);
        return res.status(200).json(Array.isArray(rows)?rows:[]);
      }

      let empQuery: string;
      let empParams: any[];
      if (manager_id) {
        empQuery = 'SELECT id,name,department,salary,role FROM erp_users WHERE active=1 AND reports_to=? ORDER BY name';
        empParams = [manager_id];
      } else if (employee_id) {
        empQuery = 'SELECT id,name,department,salary,role FROM erp_users WHERE active=1 AND id=?';
        empParams = [employee_id];
      } else {
        empQuery = 'SELECT id,name,department,salary,role FROM erp_users WHERE active=1 ORDER BY name';
        empParams = [];
      }
      const [employees]: any = await pool.query(empQuery, empParams);

      const payroll = await Promise.all(employees.map(async (emp: any) => {
        const [expRows]: any = await pool.query(
          'SELECT COALESCE(SUM(amount),0) as total FROM erp_expenses WHERE employee_id=? AND status="approved" AND month_year=?',
          [emp.id, month]
        );
        const [advRows]: any = await pool.query(
          'SELECT COALESCE(SUM(t.amount),0) as total FROM erp_transactions t JOIN erp_accounts a ON t.account_id=a.id WHERE a.reference_id=? AND a.type="employee" AND t.type="debit" AND t.reference_type="advance" AND t.created_at LIKE ?',
          [emp.id, `${month}%`]
        );
        const [attRows]: any = await pool.query(
          'SELECT COUNT(*) as days FROM erp_attendance WHERE employee_id=? AND date LIKE ? AND status="present"',
          [emp.id, `${month}%`]
        );
        // Check if already credited this month
        const [credited]: any = await pool.query(
          'SELECT status,credited_at FROM erp_payroll WHERE employee_id=? AND month_year=?',
          [emp.id, month]
        );
        const base = Number(emp.salary || 0);
        const expenses = Number(expRows[0]?.total || 0);
        const advances = Number(advRows[0]?.total || 0);
        const net = base + expenses - advances;
        return {
          ...emp, base_salary:base, approved_expenses:expenses, advances, net_pay:net,
          present_days:Number(attRows[0]?.days||0),
          payroll_status: credited[0]?.status || 'not_generated',
          credited_at: credited[0]?.credited_at || null,
        };
      }));

      return res.status(200).json(payroll);
    }

    // ── POST — bulk salary credit (legacy) ───────────────────────────────
    if (req.method === 'POST') {
      const { month, created_by } = req.body;
      const now = currentMonthYear();
      const m = (month && month <= now) ? month : now;
      // Fix 1: block future months
      if (month && month > now) return res.status(400).json({ error: 'Cannot credit salary for future months' });

      const [employees]: any = await pool.query('SELECT id,name,salary FROM erp_users WHERE active=1 AND salary>0');
      let credited = 0;
      for (const emp of employees) {
        const [accounts]: any = await pool.query('SELECT id FROM erp_accounts WHERE reference_id=? AND type="employee"', [emp.id]);
        let accountId: number;
        if (accounts.length) {
          accountId = accounts[0].id;
        } else {
          const [newAcc]: any = await pool.query('INSERT INTO erp_accounts (name,type,reference_id) VALUES (?,?,?)', [emp.name,'employee',emp.id]);
          accountId = newAcc.insertId;
        }
        const [existing]: any = await pool.query(
          'SELECT id FROM erp_transactions WHERE account_id=? AND reference_type="salary" AND created_at LIKE ?',
          [accountId, `${m}%`]
        );
        if (!existing.length) {
          await pool.query('INSERT INTO erp_transactions (account_id,type,amount,description,reference_type,created_by) VALUES (?,?,?,?,?,?)',
            [accountId,'credit',emp.salary,`Monthly salary — ${m}`,'salary',created_by||null]
          );
          await pool.query(`
            INSERT INTO erp_payroll (employee_id,month_year,base_salary,net_pay,status,credited_at,credited_by)
            VALUES (?,?,?,?,'credited',NOW(),?)
            ON DUPLICATE KEY UPDATE status='credited',credited_at=NOW(),credited_by=?,base_salary=?,net_pay=?
          `, [emp.id, m, emp.salary, emp.salary, created_by||null, created_by||null, emp.salary, emp.salary]);
          credited++;
        }
      }
      await pool.query('INSERT INTO erp_audit_log (user_id,action,details) VALUES (?,?,?)', [created_by,'SALARY_BULK_CREDIT',`Salary credited for ${credited} employees — ${m}`]).catch(()=>{});
      return res.status(200).json({ success: true, credited });
    }

    // ── PATCH — approve & credit individual payroll row ──────────────────
    if (req.method === 'PATCH') {
      const { id, action, created_by } = req.body;
      if (!id || action !== 'credit') return res.status(400).json({ error: 'Invalid action' });

      const [rows]: any = await pool.query('SELECT * FROM erp_payroll WHERE id=?', [id]);
      if (!rows.length) return res.status(404).json({ error: 'Payroll record not found' });
      const pr = rows[0];
      if (pr.status === 'credited') return res.status(400).json({ error: 'Already credited' });

      // Fix 1: block future months
      const now = currentMonthYear();
      if (pr.month_year > now) return res.status(400).json({ error: 'Cannot credit future months' });

      // Find/create employee ledger account
      const [accounts]: any = await pool.query('SELECT id FROM erp_accounts WHERE reference_id=? AND type="employee"', [pr.employee_id]);
      let accountId: number;
      if (accounts.length) {
        accountId = accounts[0].id;
      } else {
        const [userRows]: any = await pool.query('SELECT name FROM erp_users WHERE id=?', [pr.employee_id]);
        const [newAcc]: any = await pool.query('INSERT INTO erp_accounts (name,type,reference_id) VALUES (?,?,?)', [userRows[0]?.name||'Employee','employee',pr.employee_id]);
        accountId = newAcc.insertId;
      }

      // Check not already credited this month
      const [existingTxn]: any = await pool.query(
        'SELECT id FROM erp_transactions WHERE account_id=? AND reference_type="payroll" AND reference_id=?',
        [accountId, id]
      );
      if (!existingTxn.length) {
        await pool.query(
          'INSERT INTO erp_transactions (account_id,type,amount,description,reference_type,reference_id,created_by) VALUES (?,?,?,?,?,?,?)',
          [accountId, 'credit', pr.net_pay, `Salary for ${pr.month_year}`, 'payroll', id, created_by||null]
        );
      }

      await pool.query(
        'UPDATE erp_payroll SET status="credited", credited_at=NOW(), credited_by=? WHERE id=?',
        [created_by||null, id]
      );

      await pool.query('INSERT INTO erp_audit_log (user_id,action,details) VALUES (?,?,?)',
        [created_by, 'PAYROLL_CREDITED', `Payroll #${id} Rs.${pr.net_pay} for ${pr.month_year} credited`]
      ).catch(()=>{});

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
