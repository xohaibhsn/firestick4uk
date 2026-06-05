import pool from '../../../../lib/db';
import type { NextApiRequest, NextApiResponse } from 'next';

async function ensureTables() {
  // erp_iptv_servers is created by the purchases endpoint; create it here too so this
  // endpoint is safe to call even if purchases.ts has never been hit yet.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS erp_iptv_servers (
      id               INT AUTO_INCREMENT PRIMARY KEY,
      server_name      VARCHAR(100) NOT NULL,
      available_credits INT NOT NULL DEFAULT 0,
      created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS erp_iptv_sales_logs (
      id                    INT AUTO_INCREMENT PRIMARY KEY,
      server_id             INT NOT NULL,
      employee_id           INT NOT NULL,
      credits_sold          INT NOT NULL,
      price_per_credit      DECIMAL(10,4) NOT NULL,
      total_revenue         DECIMAL(12,2) NOT NULL,
      destination_account_id INT NULL,
      voucher_ref           VARCHAR(60) NULL,
      created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function getOrCreateAccount(name: string): Promise<number> {
  const [r]: any = await pool.query(`SELECT id FROM erp_accounts WHERE name=? AND type='company' LIMIT 1`, [name]);
  if (Array.isArray(r) && r.length) return r[0].id;
  const [ins]: any = await pool.query(`INSERT INTO erp_accounts (name,type,opening_balance) VALUES (?,'company',0)`, [name]);
  return ins.insertId;
}

async function getOrCreateCOA(name: string, type: string): Promise<number> {
  const [r]: any = await pool.query(`SELECT id FROM erp_chart_of_accounts WHERE account_name=? LIMIT 1`, [name]);
  if (Array.isArray(r) && r.length) return r[0].id;
  const [ins]: any = await pool.query(`INSERT INTO erp_chart_of_accounts (account_name,account_type) VALUES (?,?)`, [name, type]);
  return ins.insertId;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await ensureTables();

    // ── GET ──────────────────────────────────────────────────────────────────
    if (req.method === 'GET') {
      const [logs]: any = await pool.query(`
        SELECT l.*, s.server_name, u.name AS employee_name
        FROM erp_iptv_sales_logs l
        JOIN erp_iptv_servers s ON l.server_id = s.id
        JOIN erp_users u ON l.employee_id = u.id
        ORDER BY l.created_at DESC
        LIMIT 150
      `);
      return res.status(200).json({ logs: Array.isArray(logs) ? logs : [] });
    }

    // ── POST — record a sale + auto-post revenue ─────────────────────────────
    if (req.method === 'POST') {
      const { server_id, employee_id, credits_sold, price_per_credit, destination_account_id } = req.body;
      if (!server_id || !employee_id || !credits_sold || !price_per_credit || !destination_account_id) {
        return res.status(400).json({
          error: 'server_id, employee_id, credits_sold, price_per_credit, destination_account_id are required',
        });
      }

      const credits      = parseInt(String(credits_sold), 10);
      const pricePer     = parseFloat(String(price_per_credit));
      const totalRevenue = Math.round(credits * pricePer * 100) / 100;

      // ── CRITICAL: check inventory ─────────────────────────────────────────
      const [serverRow]: any = await pool.query(
        'SELECT id, server_name, available_credits FROM erp_iptv_servers WHERE id=? LIMIT 1',
        [server_id]
      );
      if (!Array.isArray(serverRow) || !serverRow.length)
        return res.status(400).json({ error: 'Server not found' });

      const server = serverRow[0];
      if (server.available_credits < credits) {
        return res.status(400).json({
          error: `Insufficient credits! ${server.server_name} has ${server.available_credits.toLocaleString()} credits available but ${credits.toLocaleString()} were requested. Purchase more stock first.`,
        });
      }

      // Resolve destination asset account name from COA id
      const [destRow]: any = await pool.query(
        'SELECT account_name FROM erp_chart_of_accounts WHERE id=? LIMIT 1',
        [destination_account_id]
      );
      if (!Array.isArray(destRow) || !destRow.length)
        return res.status(400).json({ error: 'Invalid destination account' });
      const destName: string = destRow[0].account_name;

      const voucherRef = `INJ-AUTO-SALES-${Date.now()}`;
      const memo = `${server.server_name} — ${credits} credits @ Rs.${pricePer} each`;

      // 1. Deduct credits from live inventory
      await pool.query(
        'UPDATE erp_iptv_servers SET available_credits = available_credits - ? WHERE id = ?',
        [credits, server_id]
      );

      // 2. Insert sales log row
      const [logResult]: any = await pool.query(
        `INSERT INTO erp_iptv_sales_logs
         (server_id,employee_id,credits_sold,price_per_credit,total_revenue,destination_account_id,voucher_ref)
         VALUES (?,?,?,?,?,?,?)`,
        [server_id, employee_id, credits, pricePer, totalRevenue, destination_account_id, voucherRef]
      );

      // 3. Auto cash inflow double-entry:
      //    DR destination asset (cash/bank increases) + CR IPTV Manual Sales Revenue (P&L revenue increases)
      const drAccId = await getOrCreateAccount(destName);
      const crAccId = await getOrCreateAccount('IPTV Manual Sales Revenue');
      const drCoaId = await getOrCreateCOA(destName, 'asset');
      const crCoaId = await getOrCreateCOA('IPTV Manual Sales Revenue', 'revenue');

      await pool.query(
        `INSERT INTO erp_transactions (account_id,type,amount,description,reference_type,coa_id,voucher_ref)
         VALUES (?,?,?,?,?,?,?)`,
        [drAccId, 'debit', totalRevenue, `DR ${destName} — ${memo}`, 'iptv_sale', drCoaId, voucherRef]
      );
      await pool.query(
        `INSERT INTO erp_transactions (account_id,type,amount,description,reference_type,coa_id,voucher_ref)
         VALUES (?,?,?,?,?,?,?)`,
        [crAccId, 'credit', totalRevenue, `CR IPTV Manual Sales Revenue — ${memo}`, 'iptv_sale', crCoaId, voucherRef]
      );

      return res.status(200).json({ success: true, id: logResult.insertId, voucherRef, totalRevenue });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
