import pool from '../../../../lib/db';
import type { NextApiRequest, NextApiResponse } from 'next';

const DEFAULT_SERVERS = ['Opplex', 'B1G', 'StarShare', 'Lion OTT', '5G Next'];

async function bootstrap() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS erp_iptv_servers (
      id               INT AUTO_INCREMENT PRIMARY KEY,
      server_name      VARCHAR(100) NOT NULL,
      available_credits INT NOT NULL DEFAULT 0,
      created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS erp_iptv_purchase_orders (
      id                 INT AUTO_INCREMENT PRIMARY KEY,
      server_id          INT NOT NULL,
      credits_purchased  INT NOT NULL,
      cost_per_credit    DECIMAL(10,4) NOT NULL,
      total_amount       DECIMAL(12,2) NOT NULL,
      status             ENUM('pending_payable','paid') NOT NULL DEFAULT 'pending_payable',
      voucher_ref        VARCHAR(60) NULL,
      vendor_description TEXT NULL,
      created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
  // Idempotent column migrations — ignored if already present
  try { await pool.query(`ALTER TABLE erp_iptv_purchase_orders ADD COLUMN vendor_id INT NULL`); } catch (_) {}
  try { await pool.query(`ALTER TABLE erp_iptv_purchase_orders ADD COLUMN payment_voucher_ref VARCHAR(60) NULL`); } catch (_) {}

  // Seed default servers (idempotent — skip names already present)
  const [existing]: any = await pool.query('SELECT server_name FROM erp_iptv_servers');
  const seen = new Set((Array.isArray(existing) ? existing : []).map((r: any) => r.server_name));
  for (const name of DEFAULT_SERVERS) {
    if (!seen.has(name)) {
      await pool.query(
        'INSERT INTO erp_iptv_servers (server_name, available_credits) VALUES (?, 0)', [name]
      );
    }
  }
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
    await bootstrap();

    // ── GET ──────────────────────────────────────────────────────────────────
    if (req.method === 'GET') {
      const [servers]: any = await pool.query('SELECT * FROM erp_iptv_servers ORDER BY server_name');
      const [orders]: any  = await pool.query(`
        SELECT p.*, s.server_name, u.name AS vendor_name
        FROM erp_iptv_purchase_orders p
        JOIN erp_iptv_servers s ON p.server_id = s.id
        LEFT JOIN erp_users u ON u.id = p.vendor_id
        ORDER BY p.created_at DESC
        LIMIT 150
      `);
      return res.status(200).json({
        servers: Array.isArray(servers) ? servers : [],
        orders:  Array.isArray(orders)  ? orders  : [],
      });
    }

    // ── POST — record new purchase payable ───────────────────────────────────
    if (req.method === 'POST') {
      const { server_id, credits_purchased, cost_per_credit, vendor_description, vendor_id } = req.body;
      if (!server_id || !credits_purchased || !cost_per_credit) {
        return res.status(400).json({ error: 'server_id, credits_purchased, cost_per_credit are required' });
      }

      const credits     = parseInt(String(credits_purchased), 10);
      const costPer     = parseFloat(String(cost_per_credit));
      const totalAmount = Math.round(credits * costPer * 100) / 100;
      const voucherRef  = `IPTV-PO-${Date.now()}`;
      const memo        = vendor_description || `IPTV bulk purchase — ${credits} credits`;

      const [poResult]: any = await pool.query(
        `INSERT INTO erp_iptv_purchase_orders
         (server_id,credits_purchased,cost_per_credit,total_amount,status,voucher_ref,vendor_description,vendor_id)
         VALUES (?,?,?,?,'pending_payable',?,?,?)`,
        [server_id, credits, costPer, totalAmount, voucherRef, vendor_description || null, vendor_id || null]
      );

      await pool.query(
        'UPDATE erp_iptv_servers SET available_credits = available_credits + ? WHERE id = ?',
        [credits, server_id]
      );

      // DR IPTV Credit Purchases (expense↑) + CR IPTV Vendor Payable (liability↑)
      const drAccId = await getOrCreateAccount('IPTV Credit Purchases');
      const crAccId = await getOrCreateAccount('IPTV Vendor Payable');
      const drCoaId = await getOrCreateCOA('IPTV Credit Purchases', 'expense');
      const crCoaId = await getOrCreateCOA('IPTV Vendor Payable', 'liability');

      await pool.query(
        `INSERT INTO erp_transactions (account_id,type,amount,description,reference_type,coa_id,voucher_ref)
         VALUES (?,?,?,?,?,?,?)`,
        [drAccId, 'debit', totalAmount, `DR IPTV Credit Purchases — ${memo}`, 'iptv_purchase', drCoaId, voucherRef]
      );
      await pool.query(
        `INSERT INTO erp_transactions (account_id,type,amount,description,reference_type,coa_id,voucher_ref)
         VALUES (?,?,?,?,?,?,?)`,
        [crAccId, 'credit', totalAmount, `CR IPTV Vendor Payable — ${memo}`, 'iptv_purchase', crCoaId, voucherRef]
      );

      return res.status(200).json({ success: true, id: poResult.insertId, voucherRef, totalAmount });
    }

    // ── PATCH — edit pending order ───────────────────────────────────────────
    if (req.method === 'PATCH') {
      const { id, credits_purchased, cost_per_credit, vendor_id, vendor_description } = req.body;
      if (!id) return res.status(400).json({ error: 'id required' });

      const [orderRows]: any = await pool.query(
        'SELECT * FROM erp_iptv_purchase_orders WHERE id=? LIMIT 1', [id]
      );
      if (!Array.isArray(orderRows) || !orderRows.length)
        return res.status(404).json({ error: 'Order not found' });
      const order = orderRows[0];
      if (order.status === 'paid')
        return res.status(400).json({ error: 'Paid orders cannot be edited' });

      const oldCredits  = Number(order.credits_purchased);
      const newCredits  = credits_purchased ? parseInt(String(credits_purchased), 10) : oldCredits;
      const newRate     = cost_per_credit   ? parseFloat(String(cost_per_credit))     : Number(order.cost_per_credit);
      const newTotal    = Math.round(newCredits * newRate * 100) / 100;
      const creditDelta = newCredits - oldCredits;

      // Update both transaction rows to the revised amount
      await pool.query(
        `UPDATE erp_transactions SET amount=? WHERE voucher_ref=? AND type='debit'`,
        [newTotal, order.voucher_ref]
      );
      await pool.query(
        `UPDATE erp_transactions SET amount=? WHERE voucher_ref=? AND type='credit'`,
        [newTotal, order.voucher_ref]
      );

      // Adjust live inventory by the credit delta
      if (creditDelta !== 0) {
        await pool.query(
          'UPDATE erp_iptv_servers SET available_credits = available_credits + ? WHERE id = ?',
          [creditDelta, order.server_id]
        );
      }

      await pool.query(
        `UPDATE erp_iptv_purchase_orders
         SET credits_purchased=?, cost_per_credit=?, total_amount=?, vendor_id=?, vendor_description=?
         WHERE id=?`,
        [
          newCredits, newRate, newTotal,
          vendor_id !== undefined ? (vendor_id || null) : order.vendor_id,
          vendor_description !== undefined ? (vendor_description || null) : order.vendor_description,
          id,
        ]
      );

      return res.status(200).json({ success: true });
    }

    // ── DELETE — full ledger rollback ────────────────────────────────────────
    if (req.method === 'DELETE') {
      const orderId = req.query.id as string;
      if (!orderId) return res.status(400).json({ error: 'id required' });

      const [orderRows]: any = await pool.query(
        'SELECT * FROM erp_iptv_purchase_orders WHERE id=? LIMIT 1', [orderId]
      );
      if (!Array.isArray(orderRows) || !orderRows.length)
        return res.status(404).json({ error: 'Order not found' });
      const order = orderRows[0];

      // Reverse purchase double-entry (DR expense + CR liability)
      await pool.query('DELETE FROM erp_transactions WHERE voucher_ref=?', [order.voucher_ref]);

      // If already paid, also reverse the payment double-entry (DR liability + CR asset)
      if (order.status === 'paid' && order.payment_voucher_ref) {
        await pool.query('DELETE FROM erp_transactions WHERE voucher_ref=?', [order.payment_voucher_ref]);
      }

      // Restore server inventory
      await pool.query(
        'UPDATE erp_iptv_servers SET available_credits = available_credits - ? WHERE id = ?',
        [Number(order.credits_purchased), order.server_id]
      );

      await pool.query('DELETE FROM erp_iptv_purchase_orders WHERE id=?', [orderId]);

      return res.status(200).json({ success: true });
    }

    // ── PUT — settle / mark purchase order as paid ───────────────────────────
    if (req.method === 'PUT') {
      const { id, payment_coa_id } = req.body;
      if (!id) return res.status(400).json({ error: 'id required' });

      const [orderRows]: any = await pool.query(
        `SELECT p.*, s.server_name
         FROM erp_iptv_purchase_orders p
         JOIN erp_iptv_servers s ON p.server_id = s.id
         WHERE p.id = ? LIMIT 1`,
        [id]
      );
      if (!Array.isArray(orderRows) || !orderRows.length)
        return res.status(404).json({ error: 'Purchase order not found' });
      const order = orderRows[0];
      if (order.status === 'paid')
        return res.status(400).json({ error: 'This order is already marked as paid' });

      const finalAmt = parseFloat(order.total_amount);

      let paymentSourceName = 'Cash In Hand';
      if (payment_coa_id) {
        const [coaRow]: any = await pool.query(
          'SELECT account_name FROM erp_chart_of_accounts WHERE id=? LIMIT 1', [payment_coa_id]
        );
        if (Array.isArray(coaRow) && coaRow.length) paymentSourceName = coaRow[0].account_name;
      }

      // Balance guard
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
      const available = Array.isArray(srcBal) && srcBal.length ? Number(srcBal[0]?.balance ?? 0) : 0;
      if (available < finalAmt) {
        return res.status(400).json({
          error: `Insufficient Funds! ${paymentSourceName} has Rs. ${Math.round(available).toLocaleString()} available but Rs. ${Math.round(finalAmt).toLocaleString()} is required.`,
        });
      }

      const payVoucher = `IPTV-PAY-${id}-${Date.now()}`;
      const memo = order.vendor_description || `PO #${id} vendor payment — ${order.server_name}`;

      // DR IPTV Vendor Payable (liability↓) + CR Cash/Bank (asset↓)
      const drAccId = await getOrCreateAccount('IPTV Vendor Payable');
      const crAccId = await getOrCreateAccount(paymentSourceName);
      const drCoaId = await getOrCreateCOA('IPTV Vendor Payable', 'liability');
      const crCoaId = await getOrCreateCOA(paymentSourceName, 'asset');

      await pool.query(
        `INSERT INTO erp_transactions (account_id,type,amount,description,reference_type,coa_id,voucher_ref)
         VALUES (?,?,?,?,?,?,?)`,
        [drAccId, 'debit', finalAmt, `DR IPTV Vendor Payable — ${memo}`, 'iptv_payment', drCoaId, payVoucher]
      );
      await pool.query(
        `INSERT INTO erp_transactions (account_id,type,amount,description,reference_type,coa_id,voucher_ref)
         VALUES (?,?,?,?,?,?,?)`,
        [crAccId, 'credit', finalAmt, `CR ${paymentSourceName} — ${memo}`, 'iptv_payment', crCoaId, payVoucher]
      );

      await pool.query(
        `UPDATE erp_iptv_purchase_orders SET status='paid', payment_voucher_ref=? WHERE id=?`,
        [payVoucher, id]
      );

      return res.status(200).json({ success: true, payVoucher });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
