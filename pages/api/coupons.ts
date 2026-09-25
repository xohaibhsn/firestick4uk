import type { NextApiRequest, NextApiResponse } from 'next';
import { RL_GENERAL, getClientIp } from '../../lib/rateLimit';
import pool from '../../lib/db';
import { getRequestMeta, requireAdminPermission } from '../../lib/adminAuth';
import { recordAdminAudit } from '../../lib/adminAudit';
import {
  calculateCouponDiscount,
  normalizeCouponCode,
} from '../../lib/orderPricing';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { allowed } = RL_GENERAL(getClientIp(req));
  if (!allowed) return res.status(429).json({ error: 'Too many requests' });

  try {
    const { action } = req.query;

    // Public checkout validation — no admin session required
    if (req.method === 'POST' && action === 'validate') {
      const { code, cart_total } = req.body;
      if (!code) return res.status(400).json({ valid:false, message:"Please enter a coupon code" });

      const normalized = normalizeCouponCode(code);
      const [rows]: any = await pool.query(
        'SELECT * FROM coupons WHERE code=? AND is_active=1',
        [normalized]
      );

      if (!rows.length) return res.status(200).json({ valid:false, message:"Invalid coupon code" });

      const c = rows[0];
      if (c.expires_at && new Date(c.expires_at) < new Date()) return res.status(200).json({ valid:false, message:"Coupon has expired" });
      if (c.usage_limit !== null && c.used_count >= c.usage_limit) return res.status(200).json({ valid:false, message:"Coupon usage limit reached" });
      if (cart_total < Number(c.minimum_order)) return res.status(200).json({ valid:false, message:`Minimum order £${Number(c.minimum_order).toFixed(2)} required` });

      const discount_amount = calculateCouponDiscount({
        type: c.type,
        value: Number(c.value),
        cartTotal: Number(cart_total),
      });

      return res.status(200).json({
        valid: true, code: c.code, type: c.type, value: Number(c.value),
        discount_amount,
        message: `✅ ${c.code} applied!`,
      });
    }

    // Admin listing + mutations — super_admin only (matches Sidhu UI)
    const admin = await requireAdminPermission(req, res, 'coupons.manage');
    if (!admin) return;

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
      const { ip } = getRequestMeta(req);
      await recordAdminAudit({
        actor: admin,
        action: 'coupon.created',
        entityType: 'coupon',
        entityId: r.insertId,
        summary: `Created coupon ${String(code).toUpperCase().trim()}`,
        metadata: { type },
        ip,
      });
      return res.status(200).json({ success:true, id:r.insertId });
    }

    if (req.method === 'PUT') {
      const { id, code, type, value, minimum_order, usage_limit, expires_at, is_active } = req.body;
      await pool.query(
        'UPDATE coupons SET code=?,type=?,value=?,minimum_order=?,usage_limit=?,expires_at=?,is_active=? WHERE id=?',
        [String(code).toUpperCase().trim(), type, value, minimum_order||0, usage_limit||null, expires_at||null, is_active?1:0, id]
      );
      const { ip } = getRequestMeta(req);
      await recordAdminAudit({
        actor: admin,
        action: 'coupon.updated',
        entityType: 'coupon',
        entityId: id,
        summary: `Updated coupon ${String(code).toUpperCase().trim()}`,
        ip,
      });
      return res.status(200).json({ success:true });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      const [prevRows]: any = await pool.query('SELECT id, code FROM coupons WHERE id=?', [id]);
      const prev = Array.isArray(prevRows) && prevRows[0] ? prevRows[0] : null;
      await pool.query('DELETE FROM coupons WHERE id=?', [id]);
      const { ip } = getRequestMeta(req);
      await recordAdminAudit({
        actor: admin,
        action: 'coupon.deleted',
        entityType: 'coupon',
        entityId: id as string,
        summary: `Deleted coupon ${prev?.code || id}`,
        ip,
      });
      return res.status(200).json({ success:true });
    }

    return res.status(405).json({ error:'Method not allowed' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
