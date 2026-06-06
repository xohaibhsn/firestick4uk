import type { NextApiRequest, NextApiResponse } from 'next';
import { RL_GENERAL, getClientIp } from '../../lib/rateLimit';
import pool from '../../lib/db';
import nodemailer from 'nodemailer';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { allowed } = RL_GENERAL(getClientIp(req));
  if (!allowed) return res.status(429).json({ error: 'Too many requests' });

  try {
    for (const col of [
      "ALTER TABLE orders ADD COLUMN coupon_code VARCHAR(50)",
      "ALTER TABLE orders ADD COLUMN discount_amount DECIMAL(10,2) DEFAULT 0",
      "ALTER TABLE orders ADD COLUMN vat_amount DECIMAL(10,2) DEFAULT 0",
      "ALTER TABLE orders ADD COLUMN payment_reference VARCHAR(255)",
    ]) { try { await pool.query(col); } catch (_) {} }

    const { customer_name, customer_email, customer_phone, delivery_address, city, postcode, notes,
      payment_method, receipt_path, items, total, coupon_code, discount_amount, vat_amount,
      payment_reference } = req.body;

    const order_id = 'ORD-' + Date.now();

    await pool.query(
      'INSERT INTO orders (order_id,customer_name,customer_email,customer_phone,delivery_address,city,postcode,notes,payment_method,receipt_path,total,coupon_code,discount_amount,vat_amount,payment_reference,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [order_id, customer_name, customer_email, customer_phone, delivery_address, city, postcode, notes||'', payment_method, receipt_path||'', total, coupon_code||null, discount_amount||0, vat_amount||0, payment_reference||null, 'pending']
    );

    for (const item of items) {
      await pool.query(
        'INSERT INTO order_items (order_id,product_id,product_name,price,quantity) VALUES (?,?,?,?,?)',
        [order_id, item.id, item.name, item.price, item.qty]
      );
    }

    if (coupon_code) {
      await pool.query('UPDATE coupons SET used_count=used_count+1 WHERE code=?', [coupon_code]).catch(()=>{});
    }

    // Fire-and-forget email notification — never delays or breaks the order response
    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      const transporter = nodemailer.createTransport({
        host: 'smtp.hostinger.com',
        port: 465,
        secure: true,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });

      const itemRows = (items as any[]).map((i: any) =>
        `<tr>
          <td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;font-size:14px">${i.name}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;text-align:center;font-size:14px">${i.qty}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;text-align:right;font-size:14px;font-weight:600;color:#5B21B6">£${(Number(i.price) * Number(i.qty)).toFixed(2)}</td>
        </tr>`
      ).join('');

      const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f5f5f5">
<div style="max-width:620px;margin:30px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e5e5">
  <div style="background:#5B21B6;padding:28px 32px">
    <h2 style="color:#fff;margin:0;font-size:22px;letter-spacing:1px">🛍️ New Order Received</h2>
    <p style="color:rgba(255,255,255,0.7);margin:6px 0 0;font-size:13px">firestick4uk.com</p>
  </div>
  <div style="padding:28px 32px">
    <div style="background:#F5F3FF;border:1px solid #DDD6FE;border-radius:10px;padding:14px 20px;margin-bottom:24px;display:inline-block">
      <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#7C3AED;margin-bottom:4px;font-weight:700">Order Reference</div>
      <div style="font-size:20px;font-weight:700;color:#5B21B6">${order_id}</div>
    </div>
    <h3 style="color:#111;font-size:13px;letter-spacing:1.5px;text-transform:uppercase;margin:0 0 12px;padding-bottom:8px;border-bottom:2px solid #f0f0f0">Customer Details</h3>
    <table style="width:100%;margin-bottom:24px;border-collapse:collapse">
      <tr><td style="padding:5px 0;color:#888;font-size:13px;width:110px">Name</td><td style="color:#111;font-size:13px;font-weight:600">${customer_name}</td></tr>
      <tr><td style="padding:5px 0;color:#888;font-size:13px">Email</td><td style="color:#111;font-size:13px">${customer_email}</td></tr>
      <tr><td style="padding:5px 0;color:#888;font-size:13px">Phone</td><td style="color:#111;font-size:13px">${customer_phone}</td></tr>
      <tr><td style="padding:5px 0;color:#888;font-size:13px">Address</td><td style="color:#111;font-size:13px">${[delivery_address, city, postcode].filter(Boolean).join(', ')}</td></tr>
      <tr><td style="padding:5px 0;color:#888;font-size:13px">Payment</td><td style="color:#111;font-size:13px;font-weight:600">${payment_method === 'bank' ? '🏦 Bank Transfer' : '💵 Cash on Delivery'}</td></tr>
      ${payment_reference ? `<tr><td style="padding:5px 0;color:#888;font-size:13px">Reference</td><td style="color:#111;font-size:13px">${payment_reference}</td></tr>` : ''}
      ${notes ? `<tr><td style="padding:5px 0;color:#888;font-size:13px">Notes</td><td style="color:#111;font-size:13px">${notes}</td></tr>` : ''}
    </table>
    <h3 style="color:#111;font-size:13px;letter-spacing:1.5px;text-transform:uppercase;margin:0 0 12px;padding-bottom:8px;border-bottom:2px solid #f0f0f0">Order Items</h3>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
      <thead><tr style="background:#f9f9f9">
        <th style="padding:10px 14px;text-align:left;font-size:11px;color:#888;font-weight:700;letter-spacing:1px;text-transform:uppercase">Product</th>
        <th style="padding:10px 14px;text-align:center;font-size:11px;color:#888;font-weight:700;letter-spacing:1px;text-transform:uppercase">Qty</th>
        <th style="padding:10px 14px;text-align:right;font-size:11px;color:#888;font-weight:700;letter-spacing:1px;text-transform:uppercase">Total</th>
      </tr></thead>
      <tbody>${itemRows}</tbody>
    </table>
    <div style="background:#fafafa;border:1px solid #e5e5e5;border-radius:10px;padding:16px 20px">
      ${vat_amount ? `<div style="display:flex;justify-content:space-between;padding:5px 0;font-size:13px"><span style="color:#888">VAT (20%)</span><span style="color:#111">£${Number(vat_amount).toFixed(2)}</span></div>` : ''}
      ${discount_amount ? `<div style="display:flex;justify-content:space-between;padding:5px 0;font-size:13px;color:#16A34A"><span>Discount${coupon_code ? ` (${coupon_code})` : ''}</span><span>−£${Number(discount_amount).toFixed(2)}</span></div>` : ''}
      <div style="display:flex;justify-content:space-between;padding:10px 0 4px;font-size:18px;font-weight:700;border-top:1px solid #e5e5e5;margin-top:6px"><span style="color:#111">Grand Total</span><span style="color:#5B21B6">£${Number(total).toFixed(2)}</span></div>
    </div>
  </div>
  <div style="background:#f9f9f9;padding:14px 32px;border-top:1px solid #e5e5e5;text-align:center">
    <p style="color:#aaa;font-size:12px;margin:0">Automated notification from firestick4uk.com</p>
  </div>
</div></body></html>`;

      transporter.sendMail({
        from: `"Firestick4UK Orders" <noreply@firestick4uk.com>`,
        to: 'firestick4uk@gmail.com',
        subject: `🛍️ New Order ${order_id} — ${customer_name}`,
        html,
      }).catch((err: any) => console.error('[orders] Email notification failed:', err));
    }

    return res.status(200).json({ success:true, order_id });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
