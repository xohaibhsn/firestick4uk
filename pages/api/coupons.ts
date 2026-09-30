import type { NextApiRequest, NextApiResponse } from 'next';
import { RL_GENERAL, getClientIp } from '../../lib/rateLimit';
import pool from '../../lib/db';
import { getRequestMeta, requireAdminPermission } from '../../lib/adminAuth';
import { recordAdminAudit } from '../../lib/adminAudit';
import {
  calculateCouponDiscount,
  normalizeCouponCode,
} from '../../lib/orderPricing';
import {
  parseCartTotal,
  parseCouponAdminInput,
  parseCouponCode,
  parseCouponId,
  parseIsActive,
} from '../../lib/couponValidation';

function isDuplicateKeyError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: string; errno?: number };
  return e.code === 'ER_DUP_ENTRY' || e.errno === 1062;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { allowed } = RL_GENERAL(getClientIp(req));
  if (!allowed) return res.status(429).json({ error: 'Too many requests' });

  try {
    const { action } = req.query;

    // Public checkout validation — no admin session required
    if (req.method === 'POST' && action === 'validate') {
      const { code, cart_total } = req.body ?? {};
      const codeParsed = parseCouponCode(code);
      if (!codeParsed.ok) {
        return res.status(400).json({ valid: false, message: codeParsed.error === 'Coupon code is required'
          ? 'Please enter a coupon code'
          : codeParsed.error });
      }

      const totalParsed = parseCartTotal(cart_total);
      if (!totalParsed.ok) {
        return res.status(400).json({ valid: false, message: totalParsed.error });
      }

      const normalized = normalizeCouponCode(codeParsed.value);
      const [rows]: any = await pool.query(
        'SELECT * FROM coupons WHERE code=? AND is_active=1',
        [normalized]
      );

      if (!rows.length) return res.status(200).json({ valid:false, message:"Invalid coupon code" });

      const c = rows[0];
      if (c.expires_at && new Date(c.expires_at) < new Date()) return res.status(200).json({ valid:false, message:"Coupon has expired" });
      if (c.usage_limit !== null && c.used_count >= c.usage_limit) return res.status(200).json({ valid:false, message:"Coupon usage limit reached" });
      if (totalParsed.value < Number(c.minimum_order)) return res.status(200).json({ valid:false, message:`Minimum order £${Number(c.minimum_order).toFixed(2)} required` });

      const discount_amount = calculateCouponDiscount({
        type: c.type,
        value: Number(c.value),
        cartTotal: totalParsed.value,
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
      const parsed = parseCouponAdminInput(req.body);
      if (!parsed.ok) return res.status(400).json({ error: parsed.error });
      const v = parsed.value;
      try {
        const [r]: any = await pool.query(
          'INSERT INTO coupons (code,type,value,minimum_order,usage_limit,expires_at) VALUES (?,?,?,?,?,?)',
          [v.code, v.type, v.value, v.minimumOrder, v.usageLimit, v.expiresAt]
        );
        const { ip } = getRequestMeta(req);
        await recordAdminAudit({
          actor: admin,
          action: 'coupon.created',
          entityType: 'coupon',
          entityId: r.insertId,
          summary: `Created coupon ${v.code}`,
          metadata: { type: v.type },
          ip,
        });
        return res.status(200).json({ success:true, id:r.insertId });
      } catch (insertErr: unknown) {
        if (isDuplicateKeyError(insertErr)) {
          return res.status(409).json({ error: 'Coupon code already exists' });
        }
        throw insertErr;
      }
    }

    if (req.method === 'PUT') {
      const idParsed = parseCouponId(req.body?.id);
      if (!idParsed.ok) return res.status(400).json({ error: idParsed.error });

      const parsed = parseCouponAdminInput(req.body);
      if (!parsed.ok) return res.status(400).json({ error: parsed.error });

      const activeParsed = parseIsActive(req.body?.is_active);
      if (!activeParsed.ok) return res.status(400).json({ error: activeParsed.error });

      const v = parsed.value;
      const [result]: any = await pool.query(
        'UPDATE coupons SET code=?,type=?,value=?,minimum_order=?,usage_limit=?,expires_at=?,is_active=? WHERE id=?',
        [v.code, v.type, v.value, v.minimumOrder, v.usageLimit, v.expiresAt, activeParsed.value ? 1 : 0, idParsed.value]
      );
      if (!result || Number(result.affectedRows) === 0) {
        return res.status(404).json({ error: 'Coupon not found' });
      }
      const { ip } = getRequestMeta(req);
      await recordAdminAudit({
        actor: admin,
        action: 'coupon.updated',
        entityType: 'coupon',
        entityId: idParsed.value,
        summary: `Updated coupon ${v.code}`,
        ip,
      });
      return res.status(200).json({ success:true });
    }

    if (req.method === 'DELETE') {
      const idParsed = parseCouponId(req.query.id);
      if (!idParsed.ok) return res.status(400).json({ error: idParsed.error });

      const [prevRows]: any = await pool.query('SELECT id, code FROM coupons WHERE id=?', [idParsed.value]);
      const prev = Array.isArray(prevRows) && prevRows[0] ? prevRows[0] : null;
      if (!prev) return res.status(404).json({ error: 'Coupon not found' });

      await pool.query('DELETE FROM coupons WHERE id=?', [idParsed.value]);
      const { ip } = getRequestMeta(req);
      await recordAdminAudit({
        actor: admin,
        action: 'coupon.deleted',
        entityType: 'coupon',
        entityId: String(idParsed.value),
        summary: `Deleted coupon ${prev.code || idParsed.value}`,
        ip,
      });
      return res.status(200).json({ success:true });
    }

    return res.status(405).json({ error:'Method not allowed' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
