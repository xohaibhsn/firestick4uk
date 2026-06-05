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

      // Account lookup by user_id — used by employee self-view AND admin looking up specific employee
      if (self === '1' || user_role === 'employee') {
        if (!user_id) return res.status(400).json({ error: 'user_id required' });
        const [accounts] = await pool.query(`
          SELECT a.*,
            COALESCE(a.opening_balance,0) + COALESCE(SUM(
              CASE WHEN t.type='credit' THEN t.amount WHEN t.type='debit' THEN -t.amount ELSE 0 END
            ),0) as balance
          FROM erp_accounts a
          LEFT JOIN erp_transactions t ON a.id=t.account_id
          WHERE a.reference_id=? AND a.type='employee'
          GROUP BY a.id
        `, [user_id]);
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

    if (req.method === 'PUT') {
      const { name, type, opening_balance } = req.body;
      if (!name || !type) return res.status(400).json({ error: 'Missing fields' });
      const [result]: any = await pool.query(
        'INSERT INTO erp_accounts (name,type,opening_balance) VALUES (?,?,?)',
        [name, type, opening_balance||0]
      );
      return res.status(200).json({ success: true, id: result.insertId });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
