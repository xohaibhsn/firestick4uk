import pool from '../../../lib/db';
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {

    if (req.method === 'GET') {
      const { employee_id, notifications } = req.query;

      // Notifications: recent status changes for employee
      if (notifications && employee_id) {
        const [rows]: any = await pool.query(
          'SELECT id,amount,category,status,admin_note,approved_at FROM erp_expenses WHERE employee_id=? AND status != "pending" ORDER BY approved_at DESC LIMIT 5',
          [employee_id]
        );
        return res.status(200).json(Array.isArray(rows)?rows:[]);
      }

      let query = 'SELECT e.*,u.name as employee_name FROM erp_expenses e JOIN erp_users u ON e.employee_id=u.id';
      const params: any[] = [];
      if (employee_id) { query += ' WHERE e.employee_id=?'; params.push(employee_id); }
      query += ' ORDER BY e.created_at DESC';
      const [rows] = await pool.query(query, params);
      return res.status(200).json(Array.isArray(rows) ? rows : []);
    }

    if (req.method === 'POST') {
      const { employee_id, amount, description, category, receipt_path } = req.body;
      if (!employee_id || !amount) return res.status(400).json({ error: 'Missing required fields' });

      const monthYear = new Date().toISOString().slice(0,7);
      const [result]: any = await pool.query(
        'INSERT INTO erp_expenses (employee_id,amount,description,category,receipt_path,month_year) VALUES (?,?,?,?,?,?)',
        [employee_id, amount, description||'', category||'Other', receipt_path||'', monthYear]
      );
      return res.status(200).json({ success: true, id: result.insertId });
    }

    if (req.method === 'PATCH') {
      const { id, status, admin_note, approved_by } = req.body;
      if (!id || !status) return res.status(400).json({ error: 'Missing fields' });

      const [expRows]: any = await pool.query('SELECT * FROM erp_expenses WHERE id=?', [id]);
      if (!expRows.length) return res.status(404).json({ error: 'Expense not found' });
      const expense = expRows[0];

      await pool.query(
        'UPDATE erp_expenses SET status=?,admin_note=?,approved_by=?,approved_at=NOW() WHERE id=?',
        [status, admin_note||'', approved_by||null, id]
      );

      await pool.query('INSERT INTO erp_audit_log (user_id,action,details) VALUES (?,?,?)',
        [approved_by, `EXPENSE_${status.toUpperCase()}`, `Expense #${id} £${expense.amount} — ${admin_note||'no note'}`]
      ).catch(()=>{});

      if (status === 'approved') {
        const [accounts]: any = await pool.query('SELECT id FROM erp_accounts WHERE reference_id=? AND type="employee"', [expense.employee_id]);
        let accountId: number;
        if (accounts.length) {
          accountId = accounts[0].id;
        } else {
          const [userRows]: any = await pool.query('SELECT name FROM erp_users WHERE id=?', [expense.employee_id]);
          const [newAcc]: any = await pool.query('INSERT INTO erp_accounts (name,type,reference_id) VALUES (?,?,?)', [userRows[0]?.name||'Employee','employee',expense.employee_id]);
          accountId = newAcc.insertId;
        }
        await pool.query('INSERT INTO erp_transactions (account_id,type,amount,description,reference_type,reference_id,created_by) VALUES (?,?,?,?,?,?,?)',
          [accountId,'credit',expense.amount,`Expense reimbursement: ${expense.description||expense.category}`,'expense',id,approved_by||null]
        );
      }

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
