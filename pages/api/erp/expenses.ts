import pool from '../../../lib/db';
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Fix 1C — add missing columns
    for (const sql of [
      "ALTER TABLE erp_expenses ADD COLUMN approved_by_role VARCHAR(20)",
      "ALTER TABLE erp_expenses ADD COLUMN rejection_reason TEXT",
    ]) { try { await pool.query(sql); } catch (_) {} }

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
      const { id, status, admin_note, approved_by, approver_role, rejection_reason } = req.body;
      if (!id || !status) return res.status(400).json({ error: 'Missing fields' });

      // Tier 1: role must be admin or manager
      if (!approver_role || !['admin', 'manager'].includes(approver_role)) {
        return res.status(403).json({ success:false, message: 'Forbidden: Only Admin or Manager can approve expenses' });
      }

      const [expRows]: any = await pool.query('SELECT * FROM erp_expenses WHERE id=?', [id]);
      if (!expRows.length) return res.status(404).json({ error: 'Expense not found' });
      const expense = expRows[0];

      // Tier 2: manager cannot self-approve their own expense claim
      if (approver_role === 'manager' && Number(approved_by) === Number(expense.employee_id)) {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized: Managers are restricted from self-approving expense claims.',
        });
      }

      // Tier 3: employee can never approve (already blocked by Tier 1)

      await pool.query(
        'UPDATE erp_expenses SET status=?,admin_note=?,approved_by=?,approved_at=NOW(),approved_by_role=?,rejection_reason=? WHERE id=?',
        [status, admin_note||'', approved_by||null, approver_role||null, rejection_reason||null, id]
      );

      // Fix 4 — audit log for BOTH approve AND reject
      await pool.query('INSERT INTO erp_audit_log (user_id,action,details) VALUES (?,?,?)',
        [approved_by, `EXPENSE_${status.toUpperCase()}`, `Expense #${id} Rs.${expense.amount} — ${status==='rejected'?(rejection_reason||admin_note||'no reason'):(admin_note||'approved')}`]
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

      // Fix 3 — rejected expense: delete any existing transaction so it never appears in ledger
      if (status === 'rejected') {
        try {
          await pool.query(
            'DELETE FROM erp_transactions WHERE reference_type="expense" AND reference_id=?',
            [id]
          );
        } catch (_) {}
      }

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
