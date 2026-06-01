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
      const month = String(req.query.month || new Date().toISOString().slice(0,7));

      const [employees]: any = await conn.query('SELECT id,name,department,salary FROM erp_users WHERE active=1 AND role != "admin" ORDER BY name');

      const payroll = await Promise.all(employees.map(async (emp: any) => {
        const [expRows]: any = await conn.query(
          'SELECT COALESCE(SUM(amount),0) as total FROM erp_expenses WHERE employee_id=? AND status="approved" AND month_year=?',
          [emp.id, month]
        );
        const [advRows]: any = await conn.query(
          'SELECT COALESCE(SUM(t.amount),0) as total FROM erp_transactions t JOIN erp_accounts a ON t.account_id=a.id WHERE a.reference_id=? AND a.type="employee" AND t.type="debit" AND t.reference_type="advance" AND t.created_at LIKE ?',
          [emp.id, `${month}%`]
        );
        const [attRows]: any = await conn.query(
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
      const [employees]: any = await conn.query('SELECT id,name,salary FROM erp_users WHERE active=1 AND salary>0');

      let credited = 0;
      for (const emp of employees) {
        const [accounts]: any = await conn.query('SELECT id FROM erp_accounts WHERE reference_id=? AND type="employee"', [emp.id]);
        let accountId: number;
        if (accounts.length) {
          accountId = accounts[0].id;
        } else {
          const [newAcc]: any = await conn.query('INSERT INTO erp_accounts (name,type,reference_id) VALUES (?,?,?)', [emp.name,'employee',emp.id]);
          accountId = newAcc.insertId;
        }
        // Check if salary already credited this month
        const [existing]: any = await conn.query(
          'SELECT id FROM erp_transactions WHERE account_id=? AND reference_type="salary" AND created_at LIKE ?',
          [accountId, `${m}%`]
        );
        if (!existing.length) {
          await conn.query('INSERT INTO erp_transactions (account_id,type,amount,description,reference_type,created_by) VALUES (?,?,?,?,?,?)',
            [accountId,'credit',emp.salary,`Monthly salary — ${m}`,'salary',created_by||null]
          );
          credited++;
        }
      }
      await conn.query('INSERT INTO erp_audit_log (user_id,action,details) VALUES (?,?,?)', [created_by,'SALARY_BULK_CREDIT',`Salary credited for ${credited} employees — ${m}`]).catch(()=>{});
      return res.status(200).json({ success: true, credited });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  } finally {
    if (conn) try { await conn.end(); } catch (_) {}
  }
}
