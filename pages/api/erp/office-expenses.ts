import pool from '../../../lib/db';
import type { NextApiRequest, NextApiResponse } from 'next';

// Maps office expense categories to their COA expense head names
const CATEGORY_COA: Record<string, string> = {
  'Rent':                         'Office Rent Expense',
  'Utilities':                    'Utility Bills',
  'Online Subscriptions':         'Online Subscriptions',
  'Building Maintenance Charges': 'Building Maintenance',
};
const categoryToExpenseHead = (cat: string): string => CATEGORY_COA[cat] ?? 'General Office Expense';

// Find-or-create an erp_accounts row (type='company') keyed by name
async function getOrCreateAccount(name: string): Promise<number> {
  const [r]: any = await pool.query(
    `SELECT id FROM erp_accounts WHERE name=? AND type='company' LIMIT 1`, [name]
  );
  if (Array.isArray(r) && r.length) return r[0].id;
  const [ins]: any = await pool.query(
    `INSERT INTO erp_accounts (name,type,opening_balance) VALUES (?,'company',0)`, [name]
  );
  return ins.insertId;
}

// Find-or-create a COA row keyed by name
async function getOrCreateCOA(name: string, type: string): Promise<number> {
  const [r]: any = await pool.query(
    `SELECT id FROM erp_chart_of_accounts WHERE account_name=? LIMIT 1`, [name]
  );
  if (Array.isArray(r) && r.length) return r[0].id;
  const [ins]: any = await pool.query(
    `INSERT INTO erp_chart_of_accounts (account_name,account_type) VALUES (?,?)`, [name, type]
  );
  return ins.insertId;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {

    // ─── Schema bootstrap ──────────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS erp_office_expenses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        date DATE NOT NULL,
        category VARCHAR(100),
        description TEXT,
        amount DECIMAL(10,2) DEFAULT 0,
        paid_by VARCHAR(255),
        receipt_path VARCHAR(500),
        notes TEXT,
        added_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ─── Schema migrations (idempotent, wrapped individually) ──────────────────
    for (const sql of [
      `ALTER TABLE erp_office_expenses ADD COLUMN expense_type ENUM('one_time','recurring_fixed','recurring_variable') NOT NULL DEFAULT 'one_time'`,
      `ALTER TABLE erp_office_expenses ADD COLUMN status ENUM('due','paid','overdue') NOT NULL DEFAULT 'paid'`,
      `ALTER TABLE erp_office_expenses ADD COLUMN due_date DATE NULL`,
      `ALTER TABLE erp_office_expenses ADD COLUMN billing_cycle ENUM('monthly','none') NOT NULL DEFAULT 'none'`,
      `ALTER TABLE erp_office_expenses ADD COLUMN billing_month VARCHAR(7) NULL`,
      `ALTER TABLE erp_accounts MODIFY COLUMN type ENUM('employee','vendor','client','company') NOT NULL`,
      `ALTER TABLE erp_office_expenses MODIFY COLUMN status ENUM('due','paid','overdue','dismissed') NOT NULL DEFAULT 'due'`,
    ]) { try { await pool.query(sql); } catch (_) {} }

    // COA table (idempotent — coa.ts also creates this)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS erp_chart_of_accounts (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        account_name VARCHAR(100) NOT NULL,
        account_type ENUM('asset','liability','equity','revenue','expense') NOT NULL,
        code         VARCHAR(20) UNIQUE NULL,
        created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).catch(() => {});

    // Double-entry tracking columns on erp_transactions
    for (const sql of [
      `ALTER TABLE erp_transactions ADD COLUMN coa_id INT NULL`,
      `ALTER TABLE erp_transactions ADD COLUMN voucher_ref VARCHAR(60) NULL`,
    ]) { try { await pool.query(sql); } catch (_) {} }

    const curMonth = new Date().toISOString().slice(0, 7);

    // ─── Auto-mark overdue entries ─────────────────────────────────────────────
    await pool.query(
      `UPDATE erp_office_expenses SET status='overdue' WHERE status='due' AND due_date IS NOT NULL AND due_date < CURDATE()`
    ).catch(() => {});

    // ─── Idempotent monthly recurring generation ───────────────────────────────
    // Templates: billing_cycle='monthly' AND billing_month IS NULL
    // Instances: billing_cycle='monthly' AND billing_month='YYYY-MM'
    // Only run on GET (page load). Running on DELETE caused the generation hook to
    // re-insert a just-deleted instance on the subsequent load() GET call.
    if (req.method === 'GET') {
      // Fetch every registered recurring template
      const [templates]: any = await pool.query(
        `SELECT * FROM erp_office_expenses WHERE billing_cycle='monthly' AND billing_month IS NULL`
      );
      if (Array.isArray(templates) && templates.length > 0) {
        const [yr, mo] = curMonth.split('-').map(Number);
        const dueDate = new Date(yr, mo, 0).toISOString().slice(0, 10); // last day of month
        for (const t of templates) {
          // Per-template idempotency: check whether THIS template already has a
          // generated instance for the current month. A blind total count was the
          // previous bug — one existing instance blocked all remaining templates.
          const [existing]: any = await pool.query(
            `SELECT id FROM erp_office_expenses
             WHERE billing_month=? AND billing_cycle='monthly' AND category=? AND description=?
             LIMIT 1`,
            [curMonth, t.category, t.description]
          );
          if (Array.isArray(existing) && existing.length > 0) continue; // already generated
          // Fixed: copy baseline amount. Variable: start at Rs. 0 (pending admin input).
          const amt = t.expense_type === 'recurring_variable' ? 0 : (Number(t.amount) || 0);
          await pool.query(
            `INSERT INTO erp_office_expenses
             (date,category,description,amount,notes,added_by,expense_type,status,due_date,billing_cycle,billing_month)
             VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
            [dueDate, t.category, t.description, amt, t.notes || '', t.added_by || '',
             t.expense_type, 'due', dueDate, 'monthly', curMonth]
          );
        }
      }
    }

    // ─── GET ───────────────────────────────────────────────────────────────────
    if (req.method === 'GET') {
      const { month, category, summary } = req.query;
      const targetMonth = String(month || curMonth);

      if (summary) {
        const [rows] = await pool.query(
          `SELECT category, SUM(amount) as total, COUNT(*) as count
           FROM erp_office_expenses
           WHERE status='paid'
             AND ((billing_cycle='none' AND date LIKE ?) OR (billing_cycle='monthly' AND billing_month=?))
           GROUP BY category ORDER BY total DESC`,
          [`${targetMonth}%`, targetMonth]
        );
        const [tot]: any = await pool.query(
          `SELECT COALESCE(SUM(amount),0) as total
           FROM erp_office_expenses
           WHERE status='paid'
             AND ((billing_cycle='none' AND date LIKE ?) OR (billing_cycle='monthly' AND billing_month=?))`,
          [`${targetMonth}%`, targetMonth]
        );
        return res.status(200).json({ categories: Array.isArray(rows) ? rows : [], total: Number(tot[0]?.total || 0) });
      }

      // Main list — templates (billing_cycle='monthly' AND billing_month IS NULL) are excluded
      let cond = `((billing_cycle='none' AND date LIKE ? AND billing_month IS NULL)
                  OR (billing_cycle='monthly' AND billing_month=?)) AND status != 'dismissed'`;
      const params: any[] = [`${targetMonth}%`, targetMonth];
      if (category) { cond = `(${cond}) AND category=?`; params.push(category); }

      const [rows] = await pool.query(
        `SELECT * FROM erp_office_expenses WHERE ${cond} ORDER BY status ASC, due_date ASC, date DESC`,
        params
      );
      return res.status(200).json(Array.isArray(rows) ? rows : []);
    }

    // ─── POST ──────────────────────────────────────────────────────────────────
    if (req.method === 'POST') {
      const { date, category, description, amount, paid_by, receipt_path, notes, added_by,
              expense_type, due_date } = req.body;
      if (!date) return res.status(400).json({ error: 'Date required' });
      const et = expense_type || 'one_time';
      // Recurring types create a template (billing_month=NULL); one_time is immediately paid.
      const bc = et !== 'one_time' ? 'monthly' : 'none';
      const finalAmt = et === 'recurring_variable' ? 0 : (Number(amount) || 0);
      const [result]: any = await pool.query(
        `INSERT INTO erp_office_expenses
         (date,category,description,amount,paid_by,receipt_path,notes,added_by,expense_type,status,due_date,billing_cycle,billing_month)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [date, category || 'Miscellaneous', description || '', finalAmt, paid_by || '',
         receipt_path || '', notes || '', added_by || '', et,
         et !== 'one_time' ? 'paid' : 'due',  // templates=paid sentinel; one_time starts as due
         due_date || null, bc, null]
      );
      return res.status(200).json({ success: true, id: result.insertId });
    }

    // ─── PUT ───────────────────────────────────────────────────────────────────
    if (req.method === 'PUT') {
      const { id, date, category, description, amount, paid_by, receipt_path, notes,
              expense_type, status, due_date, billing_cycle,
              mark_paid, paid_by_user_id, payment_coa_id } = req.body;
      if (!id) return res.status(400).json({ error: 'ID required' });

      if (mark_paid) {
        const finalAmt = Number(amount) || 0;

        // ── Step 1: resolve payment source BEFORE any writes ──────────────────
        let paymentSourceName = 'Cash In Hand';
        if (payment_coa_id) {
          const [coaRow]: any = await pool.query(
            `SELECT account_name FROM erp_chart_of_accounts WHERE id=? LIMIT 1`, [payment_coa_id]
          );
          if (Array.isArray(coaRow) && coaRow.length) paymentSourceName = coaRow[0].account_name;
        }

        // ── Step 2: real-time balance guard ───────────────────────────────────
        const [srcBal]: any = await pool.query(`
          SELECT COALESCE(a.opening_balance, 0) + COALESCE(
            SUM(CASE WHEN t.type='debit' THEN t.amount WHEN t.type='credit' THEN -t.amount ELSE 0 END), 0
          ) AS balance
          FROM erp_chart_of_accounts c
          LEFT JOIN erp_accounts a ON a.name = c.account_name AND a.type = 'company'
          LEFT JOIN erp_transactions t ON t.coa_id = c.id
          WHERE c.account_name = ?
          GROUP BY c.id, a.opening_balance
        `, [paymentSourceName]);
        const availableBalance = Array.isArray(srcBal) && srcBal.length ? Number(srcBal[0]?.balance ?? 0) : 0;

        if (availableBalance < finalAmt) {
          return res.status(400).json({
            error: `Insufficient Funds! ${paymentSourceName} has Rs. ${Math.round(availableBalance).toLocaleString()} available but Rs. ${Math.round(finalAmt).toLocaleString()} is required. Please inject funds (Sales/Loan) via the Ledger to process this payment.`,
          });
        }

        // ── Step 3: mark paid + write double-entry ────────────────────────────
        await pool.query(
          `UPDATE erp_office_expenses SET status='paid', amount=?, paid_by=?, date=CURDATE() WHERE id=?`,
          [finalAmt, paid_by || '', id]
        );

        // Fetch expense row for category / description
        const [expRow]: any = await pool.query(`SELECT * FROM erp_office_expenses WHERE id=?`, [id]);
        const exp = expRow[0] || {};

        // Resolve expense COA head from category
        const expenseHeadName = categoryToExpenseHead(exp.category || '');

        // Ensure erp_accounts + COA rows exist for each head
        const [drAccId, crAccId] = await Promise.all([
          getOrCreateAccount(expenseHeadName),
          getOrCreateAccount(paymentSourceName),
        ]);
        const [drCoaId, crCoaId] = await Promise.all([
          getOrCreateCOA(expenseHeadName, 'expense'),
          getOrCreateCOA(paymentSourceName, 'asset'),
        ]);

        const voucherRef = `OE-${id}-${Date.now()}`;
        const memo = `${exp.description || exp.category || 'Office Expense'} (${curMonth})`;

        // DR: expense head increases (asset/expense increases on debit)
        await pool.query(
          `INSERT INTO erp_transactions
           (account_id,type,amount,description,reference_type,reference_id,created_by,coa_id,voucher_ref)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          [drAccId, 'debit', finalAmt, `DR ${expenseHeadName} — ${memo}`,
           'office_expense', id, paid_by_user_id || null, drCoaId, voucherRef]
        );
        // CR: asset account decreases (asset decreases on credit)
        await pool.query(
          `INSERT INTO erp_transactions
           (account_id,type,amount,description,reference_type,reference_id,created_by,coa_id,voucher_ref)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          [crAccId, 'credit', finalAmt, `CR ${paymentSourceName} — ${memo}`,
           'office_expense', id, paid_by_user_id || null, crCoaId, voucherRef]
        );
        return res.status(200).json({ success: true });
      }

      // Regular edit
      await pool.query(
        `UPDATE erp_office_expenses
         SET date=?,category=?,description=?,amount=?,paid_by=?,receipt_path=?,notes=?,expense_type=?,status=?,due_date=?,billing_cycle=?
         WHERE id=?`,
        [date, category, description || '', Number(amount) || 0, paid_by || '',
         receipt_path || '', notes || '', expense_type || 'one_time',
         status || 'paid', due_date || null, billing_cycle || 'none', id]
      );
      return res.status(200).json({ success: true });
    }

    // ─── DELETE ────────────────────────────────────────────────────────────────
    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'ID required' });
      const [chk]: any = await pool.query(
        `SELECT billing_cycle, billing_month FROM erp_office_expenses WHERE id=? LIMIT 1`, [id]
      );
      const row = Array.isArray(chk) ? chk[0] : null;
      if (row?.billing_cycle === 'monthly' && row?.billing_month) {
        // Soft-delete: dismissed record acts as a "skip" marker for the generation loop —
        // prevents re-insert of this month's instance on the next GET.
        await pool.query(`UPDATE erp_office_expenses SET status='dismissed' WHERE id=?`, [id]);
      } else {
        await pool.query('DELETE FROM erp_office_expenses WHERE id=?', [id]);
      }
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
