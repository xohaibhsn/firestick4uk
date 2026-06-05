import pool from '../../../lib/db';
import type { NextApiRequest, NextApiResponse } from 'next';
import { getLastCompletedMonthYear } from '../../../lib/payrollUtils';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {

    if (req.method === 'GET') {
      const { account_id, self, user_id, user_role } = req.query;
      const cutoff = getLastCompletedMonthYear(); // e.g. '2026-05'

      if (account_id) {
        // Fix 1 — smart filter:
        // - payroll transactions → compare by p.month_year (not created_at)
        // - salary/advance/manual/expense → always include (no cutoff needed for own account)
        // - exclude rejected expenses
        const VALID_TXN = `
          SELECT t.*, p.month_year as payroll_month
          FROM erp_transactions t
          LEFT JOIN erp_payroll p ON (t.reference_type='payroll' AND t.reference_id=p.id)
          WHERE t.account_id=?
          AND (
            (t.reference_type='payroll' AND p.month_year <= ?)
            OR
            (t.reference_type IN ('salary','advance','manual_entry','employee_request'))
            OR
            (t.reference_type='expense' AND NOT EXISTS (
              SELECT 1 FROM erp_expenses e WHERE e.id=t.reference_id AND e.status='rejected'
            ))
            OR
            (t.reference_type NOT IN ('payroll','expense','salary','advance','manual_entry','employee_request')
             AND DATE_FORMAT(t.created_at,'%Y-%m') <= ?)
          )
          ORDER BY
            CASE WHEN t.reference_type='payroll' THEN p.month_year
                 ELSE DATE_FORMAT(t.created_at,'%Y-%m') END ASC,
            t.created_at ASC
        `;
        const [txns] = await pool.query(VALID_TXN, [account_id, cutoff, cutoff]);

        // Balance uses same smart filter
        const [bal]: any = await pool.query(`
          SELECT COALESCE(SUM(CASE WHEN t.type='credit' THEN t.amount ELSE -t.amount END),0) as balance
          FROM erp_transactions t
          LEFT JOIN erp_payroll p ON (t.reference_type='payroll' AND t.reference_id=p.id)
          WHERE t.account_id=?
          AND (
            (t.reference_type='payroll' AND p.month_year <= ?)
            OR
            (t.reference_type IN ('salary','advance','manual_entry','employee_request'))
            OR
            (t.reference_type='expense' AND NOT EXISTS (
              SELECT 1 FROM erp_expenses e WHERE e.id=t.reference_id AND e.status='rejected'
            ))
            OR
            (t.reference_type NOT IN ('payroll','expense','salary','advance','manual_entry','employee_request')
             AND DATE_FORMAT(t.created_at,'%Y-%m') <= ?)
          )
        `, [account_id, cutoff, cutoff]);

        const [acc]: any = await pool.query('SELECT * FROM erp_accounts WHERE id=?', [account_id]);
        const openingBalance = acc[0]?.opening_balance || 0;
        return res.status(200).json({
          transactions: Array.isArray(txns) ? txns : [],
          balance: Number(openingBalance) + Number(bal[0]?.balance || 0),
        });
      }

      // Account lookup by user_id — employee, vendor, or admin-initiated lookup
      if (self === '1' || user_role === 'employee' || user_role === 'vendor') {
        if (!user_id) return res.status(400).json({ error: 'user_id required' });
        // Step 3: vendor looks up by type='vendor', employee by type='employee'
        const acctType = user_role === 'vendor' ? 'vendor' : 'employee';
        const [accounts] = await pool.query(`
          SELECT a.*,
            COALESCE(a.opening_balance,0) + COALESCE(SUM(
              CASE WHEN t.type='credit' THEN t.amount WHEN t.type='debit' THEN -t.amount ELSE 0 END
            ),0) as balance
          FROM erp_accounts a
          LEFT JOIN erp_transactions t ON a.id=t.account_id
          WHERE a.reference_id=? AND (a.type=? OR a.type='employee')
          GROUP BY a.id
          LIMIT 1
        `, [user_id, acctType]);
        return res.status(200).json(Array.isArray(accounts) ? accounts : []);
      }

      // Admin / Manager — all accounts
      const [accounts] = await pool.query(`
        SELECT a.*,
          COALESCE(a.opening_balance,0) + COALESCE(SUM(
            CASE WHEN t.type='credit' THEN t.amount WHEN t.type='debit' THEN -t.amount ELSE 0 END
          ),0) as balance
        FROM erp_accounts a
        LEFT JOIN erp_transactions t ON a.id=t.account_id
        GROUP BY a.id
        ORDER BY a.name
      `);
      return res.status(200).json(Array.isArray(accounts) ? accounts : []);
    }

    if (req.method === 'POST') {
      const { account_id, type, amount, description, reference_type, created_by } = req.body;
      if (!account_id || !type || !amount) return res.status(400).json({ error: 'Missing fields' });
      const [result]: any = await pool.query(
        'INSERT INTO erp_transactions (account_id,type,amount,description,reference_type,created_by) VALUES (?,?,?,?,?,?)',
        [account_id, type, amount, description||'', reference_type||'manual_entry', created_by||null]
      );
      return res.status(200).json({ success: true, id: result.insertId });
    }

    // PUT — create new account (existing)
    if (req.method === 'PUT') {
      const body = req.body;
      // Detect: if body has 'transaction_id' it's an edit-transaction request
      if (body.transaction_id) {
        const { transaction_id, type, amount, description, created_by } = body;
        if (!transaction_id) return res.status(400).json({ error: 'transaction_id required' });

        // Fetch old transaction to calculate difference
        const [oldRows]: any = await pool.query('SELECT * FROM erp_transactions WHERE id=?', [transaction_id]);
        if (!oldRows.length) return res.status(404).json({ error: 'Transaction not found' });
        const old = oldRows[0];

        // Update the transaction
        await pool.query(
          'UPDATE erp_transactions SET type=?,amount=?,description=? WHERE id=?',
          [type||old.type, amount||old.amount, description??old.description, transaction_id]
        );

        // Balance auto-syncs dynamically from SUM of transactions — no manual update needed
        await pool.query('INSERT INTO erp_audit_log (user_id,action,details) VALUES (?,?,?)',
          [created_by||null, 'LEDGER_TXN_EDIT',
           `Transaction #${transaction_id} updated: ${old.type}/${old.amount} → ${type||old.type}/${amount||old.amount}`]
        ).catch(()=>{});

        return res.status(200).json({ success: true });
      }

      // Otherwise: create new account
      const { name, type: acctType, opening_balance } = body;
      if (!name || !acctType) return res.status(400).json({ error: 'Missing fields' });
      const [result]: any = await pool.query(
        'INSERT INTO erp_accounts (name,type,opening_balance) VALUES (?,?,?)',
        [name, acctType, opening_balance||0]
      );
      return res.status(200).json({ success: true, id: result.insertId });
    }

    // DELETE — permanently remove a transaction
    if (req.method === 'DELETE') {
      const { transaction_id, created_by } = req.body;
      if (!transaction_id) return res.status(400).json({ error: 'transaction_id required' });

      const [oldRows]: any = await pool.query('SELECT * FROM erp_transactions WHERE id=?', [transaction_id]);
      if (!oldRows.length) return res.status(404).json({ error: 'Transaction not found' });
      const old = oldRows[0];

      await pool.query('DELETE FROM erp_transactions WHERE id=?', [transaction_id]);

      // Balance recalculates dynamically from erp_transactions SUM — no manual update needed
      await pool.query('INSERT INTO erp_audit_log (user_id,action,details) VALUES (?,?,?)',
        [created_by||null, 'LEDGER_TXN_DELETE',
         `Transaction #${transaction_id} deleted: ${old.type} Rs.${old.amount} — ${old.description||''}`]
      ).catch(()=>{});

      return res.status(200).json({ success: true, deleted_type: old.type, deleted_amount: old.amount });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
