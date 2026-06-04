import type { NextApiRequest, NextApiResponse } from 'next';
import { RL_GENERAL, getClientIp } from '../../lib/rateLimit';
import pool from '../../lib/db';

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

    return res.status(200).json({ success:true, order_id });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
