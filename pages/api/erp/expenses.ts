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
      const { employee_id, notifications } = req.query;

      // Notifications: recent status changes for employee
      if (notifications && employee_id) {
        const [rows]: any = await conn.query(
          'SELECT id,amount,category,status,admin_note,approved_at FROM erp_expenses WHERE employee_id=? AND status != "pending" ORDER BY approved_at DESC LIMIT 5',
          [employee_id]
        );
        return res.status(200).json(Array.isArray(rows)?rows:[]);
      }

      let query = 'SELECT e.*,u.name as employee_name FROM erp_expenses e JOIN erp_users u ON e.employee_id=u.id';
      const params: any[] = [];
      if (employee_id) { query += ' WHERE e.employee_id=?'; params.push(employee_id); }
      query += ' ORDER BY e.created_at DESC';
      const [rows] = await conn.query(query, params);
      return res.status(200).json(Array.isArray(rows) ? rows : []);
    }

    if (req.method === 'POST') {
      const { employee_id, amount, description, category, receipt_path } = req.body;
      if (!employee_id || !amount) return res.status(400).json({ error: 'Missing required fields' });

      // Monthly limit check
      const monthYear = new Date().toISOString().slice(0,7);
      const [userRows]: any = await conn.query('SELECT monthly_expense_limit FROM erp_users WHERE id=?', [employee_id]);
      const limit = Number(userRows[0]?.monthly_expense_limit || 500);
      const [monthTotal]: any = await conn.query(
        'SELECT COALESCE(SUM(amount),0) as total FROM erp_expenses WHERE employee_id=? AND month_year=? AND status != "rejected"',
        [employee_id, monthYear]
      );
      const usedThisMonth = Number(monthTotal[0]?.total || 0);
      if (usedThisMonth + Number(amount) > limit) {
        return res.status(400).json({ error: `Monthly expense limit exceeded. Used: £${usedThisMonth.toFixed(2)} / £${limit.toFixed(2)}` });
      }

      const [result]: any = await conn.query(
        'INSERT INTO erp_expenses (employee_id,amount,description,category,receipt_path,month_year) VALUES (?,?,?,?,?,?)',
        [employee_id, amount, description||'', category||'Other', receipt_path||'', monthYear]
      );
      return res.status(200).json({ success: true, id: result.insertId });
    }

    if (req.method === 'PATCH') {
      const { id, status, admin_note, approved_by } = req.body;
      if (!id || !status) return res.status(400).json({ error: 'Missing fields' });

      const [expRows]: any = await conn.query('SELECT * FROM erp_expenses WHERE id=?', [id]);
      if (!expRows.length) return res.status(404).json({ error: 'Expense not found' });
      const expense = expRows[0];

      await conn.query(
        'UPDATE erp_expenses SET status=?,admin_note=?,approved_by=?,approved_at=NOW() WHERE id=?',
        [status, admin_note||'', approved_by||null, id]
      );

      await conn.query('INSERT INTO erp_audit_log (user_id,action,details) VALUES (?,?,?)',
        [approved_by, `EXPENSE_${status.toUpperCase()}`, `Expense #${id} £${expense.amount} — ${admin_note||'no note'}`]
      ).catch(()=>{});

      if (status === 'approved') {
        const [accounts]: any = await conn.query('SELECT id FROM erp_accounts WHERE reference_id=? AND type="employee"', [expense.employee_id]);
        let accountId: number;
        if (accounts.length) {
          accountId = accounts[0].id;
        } else {
          const [userRows]: any = await conn.query('SELECT name FROM erp_users WHERE id=?', [expense.employee_id]);
          const [newAcc]: any = await conn.query('INSERT INTO erp_accounts (name,type,reference_id) VALUES (?,?,?)', [userRows[0]?.name||'Employee','employee',expense.employee_id]);
          accountId = newAcc.insertId;
        }
        await conn.query('INSERT INTO erp_transactions (account_id,type,amount,description,reference_type,reference_id,created_by) VALUES (?,?,?,?,?,?,?)',
          [accountId,'credit',expense.amount,`Expense reimbursement: ${expense.description||expense.category}`,'expense',id,approved_by||null]
        );
      }

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  } finally {
    if (conn) try { await conn.end(); } catch (_) {}
  }
}
