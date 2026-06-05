import pool from '../../../../lib/db';
import type { NextApiRequest, NextApiResponse } from 'next';

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

// ── Zohaib user + account resolver ─────────────────────────────────────────
// Joins erp_users with erp_accounts so we get the exact account_id that the
// ledger page selector (loadEmployee) uses — avoids the mismatch where a
// user exists but their erp_accounts row was never created yet.
async function resolveZohaibAccount(): Promise<{ userId: number; accId: number; name: string } | null> {
  // JOIN query: finds admin user + their existing employee erp_accounts row in one shot
  const [rows]: any = await pool.query(`
    SELECT u.id AS user_id, u.name,
           a.id AS account_id
    FROM erp_users u
    LEFT JOIN erp_accounts a ON a.reference_id = u.id AND a.type = 'employee'
    WHERE (u.name LIKE '%Zohaib%' OR u.email LIKE '%zohaib%')
      AND u.role = 'admin'
    LIMIT 1
  `);
  if (!Array.isArray(rows) || !rows.length) return null;

  const { user_id: userId, name, account_id } = rows[0];
  let accId: number = account_id;

  if (!accId) {
    // Employee account row doesn't exist yet — create it so the ledger selector can find it
    const [ins]: any = await pool.query(
      `INSERT INTO erp_accounts (name, type, reference_id, opening_balance) VALUES (?, 'employee', ?, 0)`,
      [name, userId]
    );
    accId = ins.insertId;
    console.log(`[inject-funds] Created missing employee account for ${name} (user_id=${userId}, acc_id=${accId})`);
  }

  return { userId, accId, name };
}

// ── Historical orphan repair ────────────────────────────────────────────────
// Runs on every request but is idempotent — only inserts rows that are still
// missing. After the first successful repair pass the NOT EXISTS subquery
// returns zero rows and this becomes a no-op (single cheap read).
async function repairOrphanedLoanEntries() {
  const zh = await resolveZohaibAccount();
  if (!zh) {
    console.error('[inject-funds] repairOrphanedLoanEntries: Zohaib admin user not found — skipping repair');
    return;
  }

  // Find every INJ-LOAN- liability credit that has no matching row in
  // Zohaib's personal employee account under the same voucher_ref
  const [orphans]: any = await pool.query(`
    SELECT t.voucher_ref, t.amount, t.description, t.created_at
    FROM erp_transactions t
    JOIN erp_chart_of_accounts c ON t.coa_id = c.id
    WHERE t.voucher_ref LIKE 'INJ-LOAN-%'
      AND t.type = 'credit'
      AND c.account_name = 'Zohaib Hassan Loan Account'
      AND NOT EXISTS (
        SELECT 1 FROM erp_transactions t2
        WHERE t2.voucher_ref = t.voucher_ref
          AND t2.account_id = ?
      )
  `, [zh.accId]);

  if (!Array.isArray(orphans) || !orphans.length) return;

  for (const row of orphans) {
    // Strip the generic "CR Zohaib Hassan Loan Account — " prefix to recover the
    // original memo that would have been used for the employee ledger description
    const memo = (row.description || '')
      .replace(/^CR Zohaib Hassan Loan Account\s*[—-]\s*/i, '')
      || 'Director Capital Infusion / Operational Loan from Zohaib Hassan';

    await pool.query(`
      INSERT INTO erp_transactions
        (account_id, type, amount, description, reference_type, voucher_ref, created_at)
      VALUES (?, 'credit', ?, ?, 'cash_injection', ?, ?)
    `, [zh.accId, row.amount, memo, row.voucher_ref, row.created_at]);

    console.log(
      `[inject-funds] Repaired orphaned loan entry: ${row.voucher_ref} Rs.${row.amount} → acc_id=${zh.accId} (${zh.name})`
    );
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Run idempotent repair on every request — becomes a cheap no-op once all
  // historical orphans have been backfilled
  try {
    await repairOrphanedLoanEntries();
  } catch (err) {
    console.error('[inject-funds] Bootstrap repair failed:', err);
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { amount, injection_type, destination_account_id, description } = req.body;

  if (!amount || !injection_type || !destination_account_id) {
    return res.status(400).json({ error: 'amount, injection_type, and destination_account_id are required' });
  }
  if (!['sales', 'loan'].includes(injection_type)) {
    return res.status(400).json({ error: 'injection_type must be "sales" or "loan"' });
  }

  const finalAmt = Number(amount);
  if (!finalAmt || finalAmt <= 0) {
    return res.status(400).json({ error: 'Amount must be a positive number' });
  }

  try {
    // Resolve destination account name from COA id
    const [destRow]: any = await pool.query(
      'SELECT account_name FROM erp_chart_of_accounts WHERE id=? LIMIT 1', [destination_account_id]
    );
    if (!Array.isArray(destRow) || !destRow.length) {
      return res.status(400).json({ error: 'Invalid destination account' });
    }
    const destName: string = destRow[0].account_name;

    // Credit side: liability (loan) or revenue (sales)
    const creditName = injection_type === 'loan'
      ? 'Zohaib Hassan Loan Account'
      : 'IPTV Manual Sales Revenue';
    const creditType = injection_type === 'loan' ? 'liability' : 'revenue';

    // Ensure erp_accounts rows exist
    const [drAccId, crAccId] = await Promise.all([
      getOrCreateAccount(destName),
      getOrCreateAccount(creditName),
    ]);

    // Ensure COA rows exist
    const [drCoaId, crCoaId] = await Promise.all([
      getOrCreateCOA(destName, 'asset'),
      getOrCreateCOA(creditName, creditType),
    ]);

    const voucherRef = `INJ-${injection_type.toUpperCase()}-${Date.now()}`;
    const memo = description || (injection_type === 'loan'
      ? `Loan injection into ${destName}`
      : `Website sales revenue into ${destName}`);

    // DR: destination asset increases (cash/bank receives funds)
    await pool.query(
      `INSERT INTO erp_transactions
       (account_id,type,amount,description,reference_type,coa_id,voucher_ref)
       VALUES (?,?,?,?,?,?,?)`,
      [drAccId, 'debit', finalAmt, `DR ${destName} — ${memo}`, 'cash_injection', drCoaId, voucherRef]
    );

    // CR: liability increases (loan owed to Zohaib) OR revenue increases (P&L credit)
    await pool.query(
      `INSERT INTO erp_transactions
       (account_id,type,amount,description,reference_type,coa_id,voucher_ref)
       VALUES (?,?,?,?,?,?,?)`,
      [crAccId, 'credit', finalAmt, `CR ${creditName} — ${memo}`, 'cash_injection', crCoaId, voucherRef]
    );

    // Row 3 (loan only): mirror the loan into Zohaib's personal employee ledger so the
    // amount shows in his individual profile statement as a credit the company owes him back
    if (injection_type === 'loan') {
      try {
        const zh = await resolveZohaibAccount();
        if (!zh) {
          console.error('[inject-funds] Row 3: Zohaib admin user not found — personal ledger mirror skipped');
        } else {
          await pool.query(
            `INSERT INTO erp_transactions
             (account_id,type,amount,description,reference_type,voucher_ref)
             VALUES (?,?,?,?,?,?)`,
            [zh.accId, 'credit', finalAmt,
             memo || 'Director Capital Infusion / Operational Loan from Zohaib Hassan',
             'cash_injection', voucherRef]
          );
        }
      } catch (err) {
        // Log the real error so it's visible in server logs — not silently swallowed
        console.error('[inject-funds] Row 3 personal ledger mirror failed:', err);
      }
    }

    return res.status(200).json({ success: true, voucherRef });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
