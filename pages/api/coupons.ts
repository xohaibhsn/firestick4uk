import type { NextApiRequest, NextApiResponse } from 'next';
import { RL_GENERAL, getClientIp } from '../../lib/rateLimit';
import pool from '../../lib/db';
import { getRequestMeta, requireAdminPermission } from '../../lib/adminAuth';
import { recordAdminAudit } from '../../lib/adminAudit';
import { setAdminNoStore } from '../../lib/adminNoStore';
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
import { couponRowBaseHash } from '../../lib/couponBaseHash';

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
      setAdminNoStore(res);
      const [rows] = await pool.query('SELECT * FROM coupons ORDER BY created_at DESC');
      const list = Array.isArray(rows) ? rows : [];
      return res.status(200).json(
        list.map((row: any) => ({
          ...row,
          base_hash: couponRowBaseHash(row as Record<string, unknown>),
        }))
      );
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
      const bodyBaseHash = req.body?.base_hash;
      const force = req.body?.force === true;
      if (typeof bodyBaseHash !== 'string') {
        console.log('coupon.save_without_base_hash', idParsed.value);
      }

      const conn = await pool.getConnection();
      let newBaseHash: string | null = null;
      try {
        await conn.beginTransaction();
        const [lockedRows]: any = await conn.query(
          'SELECT * FROM coupons WHERE id=? FOR UPDATE',
          [idParsed.value]
        );
        const current =
          Array.isArray(lockedRows) && lockedRows[0] ? lockedRows[0] : null;
        if (!current) {
          await conn.rollback();
          return res.status(404).json({ error: 'Coupon not found' });
        }

        if (
          typeof bodyBaseHash === 'string' &&
          bodyBaseHash !== couponRowBaseHash(current as Record<string, unknown>) &&
          !force
        ) {
          await conn.rollback();
          return res.status(409).json({
            error:
              'This coupon was changed by someone else - list reloaded, try again.',
            code: 'stale',
          });
        }

        let result: any;
        try {
          const [r]: any = await conn.query(
            'UPDATE coupons SET code=?,type=?,value=?,minimum_order=?,usage_limit=?,expires_at=?,is_active=? WHERE id=?',
            [
              v.code,
              v.type,
              v.value,
              v.minimumOrder,
              v.usageLimit,
              v.expiresAt,
              activeParsed.value ? 1 : 0,
              idParsed.value,
            ]
          );
          result = r;
        } catch (updateErr: unknown) {
          if (isDuplicateKeyError(updateErr)) {
            await conn.rollback();
            return res.status(409).json({ error: 'Coupon code already exists' });
          }
          throw updateErr;
        }
        if (!result || Number(result.affectedRows) === 0) {
          await conn.rollback();
          return res.status(404).json({ error: 'Coupon not found' });
        }

        const [afterRows]: any = await conn.query(
          'SELECT * FROM coupons WHERE id=?',
          [idParsed.value]
        );
        const after =
          Array.isArray(afterRows) && afterRows[0] ? afterRows[0] : null;
        newBaseHash = couponRowBaseHash(
          (after || {
            code: v.code,
            type: v.type,
            value: v.value,
            minimum_order: v.minimumOrder,
            usage_limit: v.usageLimit,
            expires_at: v.expiresAt,
            is_active: activeParsed.value ? 1 : 0,
          }) as Record<string, unknown>
        );
        await conn.commit();
      } catch (txErr) {
        try {
          await conn.rollback();
        } catch {
          /* ignore */
        }
        throw txErr;
      } finally {
        conn.release();
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
      return res.status(200).json({ success: true, base_hash: newBaseHash });
    }

    if (req.method === 'DELETE') {
      const idParsed = parseCouponId(req.query.id);
      if (!idParsed.ok) return res.status(400).json({ error: idParsed.error });

      const [prevRows]: any = await pool.query('SELECT id, code FROM coupons WHERE id=?', [idParsed.value]);
      const prev = Array.isArray(prevRows) && prevRows[0] ? prevRows[0] : null;
      if (!prev) return res.status(404).json({ error: 'Coupon not found' });

      const [delResult]: any = await pool.query('DELETE FROM coupons WHERE id=?', [idParsed.value]);
      if (!delResult || Number(delResult.affectedRows) === 0) {
        return res.status(404).json({ error: 'Coupon not found' });
      }
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
    const errCode = typeof error?.code === 'string' ? error.code : undefined;
    const errName = typeof error?.name === 'string' ? error.name : 'Error';
    console.error('[coupons] failed', errCode || errName);
    return res.status(500).json({ error: 'Request failed' });
  }
}
