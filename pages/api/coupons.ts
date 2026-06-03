import type { NextApiRequest, NextApiResponse } from 'next';
import { RL_GENERAL, getClientIp } from '../../lib/rateLimit';
import pool from '../../lib/db';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { allowed } = RL_GENERAL(getClientIp(req));
  if (!allowed) return res.status(429).json({ error: 'Too many requests' });

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS coupons (
        id INT AUTO_INCREMENT PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        type ENUM('percentage','fixed') NOT NULL,
        value DECIMAL(10,2) NOT NULL,
        minimum_order DECIMAL(10,2) DEFAULT 0,
        usage_limit INT DEFAULT NULL,
        used_count INT DEFAULT 0,
        expires_at DATE DEFAULT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`INSERT IGNORE INTO coupons (code,type,value,minimum_order) VALUES ('WELCOME10','percentage',10,0),('SAVE5','fixed',5,20)`);

    const { action } = req.query;

    if (req.method === 'POST' && action === 'validate') {
      const { code, cart_total } = req.body;
      if (!code) return res.status(400).json({ valid:false, message:"Please enter a coupon code" });

      const [rows]: any = await pool.query(
        'SELECT * FROM coupons WHERE code=? AND is_active=1',
        [String(code).toUpperCase().trim()]
      );

      if (!rows.length) return res.status(200).json({ valid:false, message:"Invalid coupon code" });

      const c = rows[0];
      if (c.expires_at && new Date(c.expires_at) < new Date()) return res.status(200).json({ valid:false, message:"Coupon has expired" });
      if (c.usage_limit !== null && c.used_count >= c.usage_limit) return res.status(200).json({ valid:false, message:"Coupon usage limit reached" });
      if (cart_total < Number(c.minimum_order)) return res.status(200).json({ valid:false, message:`Minimum order £${Number(c.minimum_order).toFixed(2)} required` });

      const discount = c.type === 'percentage'
        ? Math.min(Number(cart_total) * Number(c.value) / 100, Number(cart_total))
        : Math.min(Number(c.value), Number(cart_total));

      return res.status(200).json({
        valid: true, code: c.code, type: c.type, value: Number(c.value),
        discount_amount: Math.round(discount * 100) / 100,
        message: `✅ ${c.code} applied!`,
      });
    }

    if (req.method === 'GET') {
      const [rows] = await pool.query('SELECT * FROM coupons ORDER BY created_at DESC');
      return res.status(200).json(Array.isArray(rows)?rows:[]);
    }

    if (req.method === 'POST') {
      const { code, type, value, minimum_order, usage_limit, expires_at } = req.body;
      if (!code||!type||!value) return res.status(400).json({ error:'Missing required fields' });
      const [r]: any = await pool.query(
        'INSERT INTO coupons (code,type,value,minimum_order,usage_limit,expires_at) VALUES (?,?,?,?,?,?)',
        [String(code).toUpperCase().trim(), type, value, minimum_order||0, usage_limit||null, expires_at||null]
      );
      return res.status(200).json({ success:true, id:r.insertId });
    }

    if (req.method === 'PUT') {
      const { id, code, type, value, minimum_order, usage_limit, expires_at, is_active } = req.body;
      await pool.query(
        'UPDATE coupons SET code=?,type=?,value=?,minimum_order=?,usage_limit=?,expires_at=?,is_active=? WHERE id=?',
        [String(code).toUpperCase().trim(), type, value, minimum_order||0, usage_limit||null, expires_at||null, is_active?1:0, id]
      );
      return res.status(200).json({ success:true });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      await pool.query('DELETE FROM coupons WHERE id=?', [id]);
      return res.status(200).json({ success:true });
    }

    return res.status(405).json({ error:'Method not allowed' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
