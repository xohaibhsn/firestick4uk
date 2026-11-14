import type { NextApiRequest, NextApiResponse } from 'next';
import pool from '../../lib/db';
import { getClientIp, rateLimit } from '../../lib/rateLimit';
import { formatPaymentMethodLabel } from '../../lib/paymentMethod';
import {
  maskCustomerName,
  maskEmail,
  maskPhone,
  maskPostcode,
  normaliseTrackEmail,
  normaliseTrackOrderId,
} from '../../lib/orderTrackingPrivacy';

/** ~10 requests / minute / IP — stricter than RL_GENERAL for a PII-adjacent lookup. */
const RL_TRACK = (ip: string) => rateLimit(`track:${ip}`, 10, 60 * 1000);

const NOT_FOUND = { error: 'Order not found' } as const;
const UNAVAILABLE = { error: 'Tracking temporarily unavailable' } as const;

/**
 * Public order tracking — requires BOTH order_id and email.
 *
 * Legacy rows with empty/NULL customer_email never match a supplied email, so
 * id-alone lookup cannot reveal data (404). Professor can help those customers
 * via WhatsApp.
 *
 * Response is intentionally minimal + masked. Never returns receipt_path,
 * payment_reference, notes, full phone/email/address, or internal ids.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const ip = getClientIp(req);
  const { allowed, retryAfterSec } = RL_TRACK(ip);
  if (!allowed) {
    res.setHeader('Retry-After', String(retryAfterSec));
    return res.status(429).json({ error: 'Too many requests' });
  }

  const rawOrderId = Array.isArray(req.query.order_id) ? req.query.order_id[0] : req.query.order_id;
  const rawEmail = Array.isArray(req.query.email) ? req.query.email[0] : req.query.email;

  if (rawOrderId == null || String(rawOrderId).trim() === '') {
    return res.status(400).json({ error: 'Order ID and email required' });
  }
  if (rawEmail == null || String(rawEmail).trim() === '') {
    return res.status(400).json({ error: 'Order ID and email required' });
  }

  const orderId = normaliseTrackOrderId(rawOrderId);
  const email = normaliseTrackEmail(rawEmail);
  if (!orderId || !email) {
    // Same constant-shape 404 as a miss — no enumeration signal on format vs existence.
    return res.status(404).json(NOT_FOUND);
  }

  try {
    const [rows]: any = await pool.query(
      `SELECT order_id, status, created_at, total, payment_method,
              customer_name, customer_email, customer_phone, postcode
       FROM orders
       WHERE order_id = ? AND LOWER(customer_email) = ?
       LIMIT 1`,
      [orderId, email]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json(NOT_FOUND);
    }

    const o = rows[0];
    const [items]: any = await pool.query(
      `SELECT product_name, quantity, price
       FROM order_items
       WHERE order_id = ?`,
      [orderId]
    );

    return res.status(200).json({
      order: {
        order_id: o.order_id,
        status: o.status,
        created_at: o.created_at,
        total: o.total,
        currency: 'GBP',
        payment_method: formatPaymentMethodLabel(o.payment_method, 'long'),
        customer: {
          name: maskCustomerName(o.customer_name),
          email: maskEmail(o.customer_email),
          phone: maskPhone(o.customer_phone),
          postcode: maskPostcode(o.postcode),
        },
      },
      items: (items || []).map((it: any) => ({
        product_name: it.product_name,
        quantity: it.quantity,
        price: it.price,
      })),
    });
  } catch (error: any) {
    const errCode = typeof error?.code === 'string' ? error.code : undefined;
    const errName = typeof error?.name === 'string' ? error.name : 'Error';
    console.error('[track] Tracking failed:', errName, errCode || '');
    return res.status(500).json(UNAVAILABLE);
  }
}
