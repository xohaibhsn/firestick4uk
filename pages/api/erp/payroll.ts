import pool from '../../../lib/db';
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {

    // Fix 1A — ensure every active employee has a ledger account
    try {
      await pool.query(`
        INSERT IGNORE INTO erp_accounts (name, type, reference_id, opening_balance)
        SELECT name, 'employee', id, 0.00 FROM erp_users WHERE active=1
      `);
    } catch (_) {}

    // Fix 1B — create erp_payroll table for permanent salary records
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

    if (req.method === 'GET') {
      const month = String(req.query.month || new Date().toISOString().slice(0,7));
      const { employee_id, manager_id } = req.query;

      // Fix 3 — manager sees team (employees reporting to them)
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
        const base = Number(emp.salary || 0);
        const expenses = Number(expRows[0]?.total || 0);
        const advances = Number(advRows[0]?.total || 0);
        const net = base + expenses - advances;
        return { ...emp, base_salary:base, approved_expenses:expenses, advances, net_pay:net, present_days:Number(attRows[0]?.days||0) };
      }));

      return res.status(200).json(payroll);
    }

    // POST — bulk salary credit for all employees
    if (req.method === 'POST') {
      const { month, created_by } = req.body;
      const m = month || new Date().toISOString().slice(0,7);
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
        // Check if salary already credited this month
        const [existing]: any = await pool.query(
          'SELECT id FROM erp_transactions WHERE account_id=? AND reference_type="salary" AND created_at LIKE ?',
          [accountId, `${m}%`]
        );
        if (!existing.length) {
          await pool.query('INSERT INTO erp_transactions (account_id,type,amount,description,reference_type,created_by) VALUES (?,?,?,?,?,?)',
            [accountId,'credit',emp.salary,`Monthly salary — ${m}`,'salary',created_by||null]
          );
          // Fix 1B — persist salary record in erp_payroll
          await pool.query(`
            INSERT INTO erp_payroll (employee_id,month_year,base_salary,net_pay,status,credited_at,credited_by)
            VALUES (?,?,?,?,'credited',NOW(),?)
            ON DUPLICATE KEY UPDATE status='credited', credited_at=NOW(), credited_by=?, base_salary=?, net_pay=?
          `, [emp.id, m, emp.salary, emp.salary, created_by||null, created_by||null, emp.salary, emp.salary]);
          credited++;
        }
      }
      await pool.query('INSERT INTO erp_audit_log (user_id,action,details) VALUES (?,?,?)', [created_by,'SALARY_BULK_CREDIT',`Salary credited for ${credited} employees — ${m}`]).catch(()=>{});
      return res.status(200).json({ success: true, credited });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
