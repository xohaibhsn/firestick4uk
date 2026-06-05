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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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

    return res.status(200).json({ success: true, voucherRef });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
