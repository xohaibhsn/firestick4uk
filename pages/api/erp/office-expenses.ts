import pool from '../../../lib/db';
import type { NextApiRequest, NextApiResponse } from 'next';

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
    ]) { try { await pool.query(sql); } catch (_) {} }

    const curMonth = new Date().toISOString().slice(0, 7);

    // ─── Auto-mark overdue entries ─────────────────────────────────────────────
    await pool.query(
      `UPDATE erp_office_expenses SET status='overdue' WHERE status='due' AND due_date IS NOT NULL AND due_date < CURDATE()`
    ).catch(() => {});

    // ─── Idempotent monthly recurring generation ───────────────────────────────
    // Templates: billing_cycle='monthly' AND billing_month IS NULL
    // Instances: billing_cycle='monthly' AND billing_month='YYYY-MM'
    // one_time POSTs bypass this entirely — never gate a plain expense save on
    // month-duplicate state. Only run for GET (page load) or recurring-type POSTs.
    const isOneTimePost = req.method === 'POST' &&
      (!req.body?.expense_type || req.body.expense_type === 'one_time');
    if (!isOneTimePost) {
      const [genCheck]: any = await pool.query(
        `SELECT COUNT(*) as cnt FROM erp_office_expenses WHERE billing_month=?`,
        [curMonth]
      );
      if (Number(genCheck[0]?.cnt || 0) === 0) {
        const [templates]: any = await pool.query(
          `SELECT * FROM erp_office_expenses WHERE billing_cycle='monthly' AND billing_month IS NULL`
        );
        if (Array.isArray(templates) && templates.length > 0) {
          const [yr, mo] = curMonth.split('-').map(Number);
          const dueDate = new Date(yr, mo, 0).toISOString().slice(0, 10); // last day of month
          for (const t of templates) {
            // Fixed: copy baseline amount. Variable: start at 0 (pending input).
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
      let cond = `(billing_cycle='none' AND date LIKE ? AND billing_month IS NULL)
                  OR (billing_cycle='monthly' AND billing_month=?)`;
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
         'paid',  // templates stored as paid; instances are generated with status='due'
         due_date || null, bc, null]
      );
      return res.status(200).json({ success: true, id: result.insertId });
    }

    // ─── PUT ───────────────────────────────────────────────────────────────────
    if (req.method === 'PUT') {
      const { id, date, category, description, amount, paid_by, receipt_path, notes,
              expense_type, status, due_date, billing_cycle,
              mark_paid, paid_by_user_id } = req.body;
      if (!id) return res.status(400).json({ error: 'ID required' });

      if (mark_paid) {
        const finalAmt = Number(amount) || 0;
        await pool.query(
          `UPDATE erp_office_expenses SET status='paid', amount=?, paid_by=?, date=CURDATE() WHERE id=?`,
          [finalAmt, paid_by || '', id]
        );

        // Fetch row for ledger description
        const [expRow]: any = await pool.query(`SELECT * FROM erp_office_expenses WHERE id=?`, [id]);
        const exp = expRow[0] || {};

        // Find or create "Office Expenses Account" of type 'company'
        const [compAccs]: any = await pool.query(
          `SELECT id FROM erp_accounts WHERE type='company' AND name='Office Expenses Account' LIMIT 1`
        );
        let accountId: number;
        if (Array.isArray(compAccs) && compAccs.length) {
          accountId = compAccs[0].id;
        } else {
          const [ins]: any = await pool.query(
            `INSERT INTO erp_accounts (name,type,opening_balance) VALUES ('Office Expenses Account','company',0)`
          );
          accountId = ins.insertId;
        }

        // Debit the company account — keeps global ledger balances current
        await pool.query(
          `INSERT INTO erp_transactions (account_id,type,amount,description,reference_type,reference_id,created_by)
           VALUES (?,?,?,?,?,?,?)`,
          [accountId, 'debit', finalAmt,
           `${exp.category || 'Office Expense'} — ${exp.description || ''} (${curMonth})`,
           'office_expense', id, paid_by_user_id || null]
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
      await pool.query('DELETE FROM erp_office_expenses WHERE id=?', [id]);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
