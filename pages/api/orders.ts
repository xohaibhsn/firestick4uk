import type { NextApiRequest, NextApiResponse } from 'next';
import { RL_GENERAL, getClientIp } from '../../lib/rateLimit';
import pool from '../../lib/db';
import nodemailer from 'nodemailer';
import { getContactConfig } from '../../lib/contact-config';
import { escapeHtml } from '../../lib/contentHtml';
import {
  buildDigitalSupplyAckNotes,
  isDigitalProduct,
} from '../../lib/productFulfilment';
import {
  calculateAuthoritativePricing,
  calculateCouponDiscount,
  calculateGrandTotal,
  isFiniteNonNegativeMoney,
  normalizeCouponCode,
  parseOrderQuantity,
  roundMoney,
  type AuthoritativeLineItem,
} from '../../lib/orderPricing';

type DbProduct = {
  id: number;
  name: string;
  price: number | string;
  category: string | null;
  stock: string | null;
  active: number;
};

const ALLOWED_PAYMENT_METHODS = new Set(['bank', 'cod']);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { allowed } = RL_GENERAL(getClientIp(req));
  if (!allowed) return res.status(429).json({ error: 'Too many requests' });

  try {
    const {
      customer_name,
      customer_email,
      customer_phone,
      delivery_address,
      city,
      postcode,
      notes,
      payment_method,
      receipt_path,
      items,
      coupon_code,
      payment_reference,
      digital_supply_acknowledgement,
    } = req.body;
    // Client total / discount_amount / vat_amount / item.price / item.name are intentionally ignored.

    if (!ALLOWED_PAYMENT_METHODS.has(String(payment_method || ''))) {
      return res.status(400).json({ error: 'Invalid payment method.' });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Order items are required.' });
    }

    const qtyById = new Map<number, number>();

    for (const item of items) {
      const id = Number(item?.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'Each item must include a valid product ID.' });
      }
      const qty = parseOrderQuantity(item?.qty);
      if (qty === null) {
        return res.status(400).json({ error: 'Each item must include a valid quantity.' });
      }
      if (qtyById.has(id)) {
        // Normal CartContext consolidates duplicates; reject tampered duplicate rows.
        return res.status(400).json({ error: 'Duplicate product IDs are not allowed.' });
      }
      qtyById.set(id, qty);
    }

    const uniqueIds = [...qtyById.keys()];
    const placeholders = uniqueIds.map(() => '?').join(',');
    const [rows]: any = await pool.query(
      `SELECT id, name, price, category, stock, active FROM products WHERE id IN (${placeholders}) AND active=1`,
      uniqueIds
    );
    const products = (Array.isArray(rows) ? rows : []) as DbProduct[];
    const byId = new Map(products.map((p) => [Number(p.id), p]));

    for (const id of uniqueIds) {
      if (!byId.has(id)) {
        return res.status(400).json({
          error: 'One or more items in your cart are no longer available. Please remove them and try again.',
        });
      }
    }

    const authoritativeItems: AuthoritativeLineItem[] = [];
    for (const id of uniqueIds) {
      const p = byId.get(id)!;
      const price = Number(p.price);
      if (!isFiniteNonNegativeMoney(price)) {
        return res.status(500).json({
          error: 'Unable to process order due to an invalid product price. Please contact support.',
        });
      }
      authoritativeItems.push({
        id: Number(p.id),
        name: String(p.name),
        price: roundMoney(price),
        qty: qtyById.get(id)!,
        category: p.category,
        stock: p.stock,
      });
    }

    const digitalProducts = authoritativeItems.filter((p) => isDigitalProduct(p));
    const hasDigital = digitalProducts.length > 0;

    if (hasDigital && digital_supply_acknowledgement !== true) {
      return res.status(400).json({
        error: 'Digital supply acknowledgement is required for subscription/digital items.',
      });
    }

    const { subtotal, shipping, vatAmount } = calculateAuthoritativePricing(authoritativeItems);

    let validatedCouponCode: string | null = null;
    let discountAmount = 0;
    const rawCoupon = normalizeCouponCode(coupon_code);
    if (rawCoupon) {
      const [couponRows]: any = await pool.query(
        'SELECT * FROM coupons WHERE code=? AND is_active=1',
        [rawCoupon]
      );
      if (!Array.isArray(couponRows) || !couponRows.length) {
        return res.status(400).json({ error: 'Invalid coupon code.' });
      }
      const c = couponRows[0];
      if (c.expires_at && new Date(c.expires_at) < new Date()) {
        return res.status(400).json({ error: 'Coupon has expired.' });
      }
      if (c.usage_limit !== null && Number(c.used_count) >= Number(c.usage_limit)) {
        return res.status(400).json({ error: 'Coupon usage limit reached.' });
      }
      const cartTotalForCoupon = roundMoney(subtotal + shipping);
      if (cartTotalForCoupon < Number(c.minimum_order)) {
        return res.status(400).json({
          error: `Minimum order £${Number(c.minimum_order).toFixed(2)} required.`,
        });
      }
      discountAmount = calculateCouponDiscount({
        type: c.type,
        value: Number(c.value),
        cartTotal: cartTotalForCoupon,
      });
      if (!Number.isFinite(discountAmount) || discountAmount < 0) {
        return res.status(400).json({ error: 'Unable to apply coupon.' });
      }
      validatedCouponCode = String(c.code);
    }

    const grandTotal = calculateGrandTotal({
      subtotal,
      shipping,
      vatAmount,
      discountAmount,
    });

    const customerNotes = typeof notes === 'string' ? notes : '';
    const recordedAt = new Date().toISOString();
    const notesToStore = hasDigital
      ? buildDigitalSupplyAckNotes({
          customerNotes,
          digitalProductIds: digitalProducts.map((p) => Number(p.id)),
          recordedAtIso: recordedAt,
        })
      : customerNotes || '';

    const order_id = 'ORD-' + Date.now();
    const contact = await getContactConfig();

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      await conn.query(
        'INSERT INTO orders (order_id,customer_name,customer_email,customer_phone,delivery_address,city,postcode,notes,payment_method,receipt_path,total,coupon_code,discount_amount,vat_amount,payment_reference,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [
          order_id,
          customer_name,
          customer_email,
          customer_phone,
          delivery_address,
          city,
          postcode,
          notesToStore,
          payment_method,
          receipt_path || '',
          grandTotal,
          validatedCouponCode,
          discountAmount,
          vatAmount,
          payment_reference || null,
          'pending',
        ]
      );

      for (const item of authoritativeItems) {
        await conn.query(
          'INSERT INTO order_items (order_id,product_id,product_name,price,quantity) VALUES (?,?,?,?,?)',
          [order_id, item.id, item.name, item.price, item.qty]
        );
      }

      if (validatedCouponCode) {
        await conn.query('UPDATE coupons SET used_count=used_count+1 WHERE code=?', [
          validatedCouponCode,
        ]);
      }

      await conn.commit();
    } catch (txErr) {
      await conn.rollback();
      throw txErr;
    } finally {
      conn.release();
    }

    const responseItems = authoritativeItems.map((i) => ({
      id: i.id,
      name: i.name,
      price: i.price,
      qty: i.qty,
    }));

    // Fire-and-forget email notification — never delays or breaks the order response
    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      const transporter = nodemailer.createTransport({
        host: 'smtp.hostinger.com',
        port: 465,
        secure: true,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });

      const itemRows = authoritativeItems
        .map(
          (i) =>
            `<tr>
          <td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;font-size:14px">${i.name}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;text-align:center;font-size:14px">${i.qty}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;text-align:right;font-size:14px;font-weight:600;color:#5B21B6">£${(i.price * i.qty).toFixed(2)}</td>
        </tr>`
        )
        .join('');

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
      ${notesToStore ? `<tr><td style="padding:5px 0;color:#888;font-size:13px">Notes</td><td style="color:#111;font-size:13px">${notesToStore}</td></tr>` : ''}
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
      ${vatAmount ? `<div style="display:flex;justify-content:space-between;padding:5px 0;font-size:13px"><span style="color:#888">VAT (20%)</span><span style="color:#111">£${vatAmount.toFixed(2)}</span></div>` : ''}
      ${discountAmount ? `<div style="display:flex;justify-content:space-between;padding:5px 0;font-size:13px;color:#16A34A"><span>Discount${validatedCouponCode ? ` (${validatedCouponCode})` : ''}</span><span>−£${discountAmount.toFixed(2)}</span></div>` : ''}
      <div style="display:flex;justify-content:space-between;padding:10px 0 4px;font-size:18px;font-weight:700;border-top:1px solid #e5e5e5;margin-top:6px"><span style="color:#111">Grand Total</span><span style="color:#5B21B6">£${grandTotal.toFixed(2)}</span></div>
    </div>
  </div>
  <div style="background:#f9f9f9;padding:14px 32px;border-top:1px solid #e5e5e5;text-align:center">
    <p style="color:#aaa;font-size:12px;margin:0">Automated notification from firestick4uk.com</p>
  </div>
</div></body></html>`;

      transporter.sendMail({
        from: `"Firestick4UK Orders" <noreply@firestick4uk.com>`,
        to: contact.email,
        subject: `🛍️ New Order ${order_id} — ${customer_name}`,
        html,
      }).catch((err: any) => console.error('[orders] Email notification failed:', err));

      // Customer order confirmation — fire-and-forget; must not fail the order
      if (customer_email) {
        const safeName = escapeHtml(String(customer_name || ''));
        const safeOrderId = escapeHtml(String(order_id));
        const safePayment =
          payment_method === 'bank' ? 'Bank Transfer' : 'Cash on Delivery';
        const customerItemRows = authoritativeItems
          .map((i) => {
            const name = escapeHtml(String(i.name || 'Item'));
            const qty = escapeHtml(String(i.qty));
            const lineTotal = (i.price * i.qty).toFixed(2);
            return `<tr>
              <td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;font-size:14px">${name}</td>
              <td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;text-align:center;font-size:14px">${qty}</td>
              <td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;text-align:right;font-size:14px;font-weight:600;color:#5B21B6">£${lineTotal}</td>
            </tr>`;
          })
          .join('');

        const digitalSection = hasDigital
          ? `<p style="color:#333;font-size:14px;line-height:1.6;margin:0 0 14px">Subscription services are active within 1 hour of payment confirmation.</p>
    <p style="color:#333;font-size:14px;line-height:1.65;margin:0 0 14px">You requested your digital subscription to begin as soon as possible after payment confirmation, before the 14-day cancellation period ends, and acknowledged that once digital supply begins you will lose the 14-day cancellation right for that digital content.</p>
    <p style="color:#333;font-size:14px;line-height:1.65;margin:0 0 18px">This does not affect your statutory rights if the digital content is faulty, not as described, or otherwise does not conform to the contract.</p>`
          : '';

        const customerHtml = `<!DOCTYPE html><html><body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f5f5f5">
<div style="max-width:620px;margin:30px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e5e5">
  <div style="background:#5B21B6;padding:28px 32px">
    <h2 style="color:#fff;margin:0;font-size:22px;letter-spacing:1px">Order Confirmation</h2>
    <p style="color:rgba(255,255,255,0.7);margin:6px 0 0;font-size:13px">firestick4uk.com</p>
  </div>
  <div style="padding:28px 32px">
    <p style="color:#333;font-size:15px;line-height:1.6;margin:0 0 16px">Hi ${safeName},</p>
    <p style="color:#333;font-size:14px;line-height:1.6;margin:0 0 16px">Thank you for your order. Your order is currently <strong>pending</strong> payment/verification.</p>
    <div style="background:#F5F3FF;border:1px solid #DDD6FE;border-radius:10px;padding:14px 20px;margin-bottom:20px;display:inline-block">
      <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#7C3AED;margin-bottom:4px;font-weight:700">Order ID</div>
      <div style="font-size:20px;font-weight:700;color:#5B21B6">${safeOrderId}</div>
    </div>
    <p style="color:#555;font-size:13px;margin:0 0 8px"><strong>Payment method:</strong> ${safePayment}</p>
    <p style="color:#555;font-size:13px;margin:0 0 20px"><strong>Total:</strong> £${grandTotal.toFixed(2)}</p>
    <h3 style="color:#111;font-size:13px;letter-spacing:1.5px;text-transform:uppercase;margin:0 0 12px;padding-bottom:8px;border-bottom:2px solid #f0f0f0">Items</h3>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      <thead><tr style="background:#f9f9f9">
        <th style="padding:10px 14px;text-align:left;font-size:11px;color:#888;font-weight:700;letter-spacing:1px;text-transform:uppercase">Product</th>
        <th style="padding:10px 14px;text-align:center;font-size:11px;color:#888;font-weight:700;letter-spacing:1px;text-transform:uppercase">Qty</th>
        <th style="padding:10px 14px;text-align:right;font-size:11px;color:#888;font-weight:700;letter-spacing:1px;text-transform:uppercase">Total</th>
      </tr></thead>
      <tbody>${customerItemRows}</tbody>
    </table>
    ${digitalSection}
    <p style="color:#555;font-size:13px;line-height:1.7;margin:0">
      <a href="https://firestick4uk.com/terms" style="color:#5B21B6">Terms &amp; Conditions</a> ·
      <a href="https://firestick4uk.com/refund-policy" style="color:#5B21B6">Refund Policy</a> ·
      <a href="https://firestick4uk.com/privacy-policy" style="color:#5B21B6">Privacy Policy</a>
    </p>
  </div>
  <div style="background:#f9f9f9;padding:14px 32px;border-top:1px solid #e5e5e5;text-align:center">
    <p style="color:#aaa;font-size:12px;margin:0">Firestick4UK · firestick4uk.com</p>
  </div>
</div></body></html>`;

        transporter
          .sendMail({
            from: `"Firestick4UK" <noreply@firestick4uk.com>`,
            to: customer_email,
            subject: `Firestick4UK Order Confirmation — ${order_id}`,
            html: customerHtml,
          })
          .catch((err: any) =>
            console.error('[orders] Customer order confirmation email failed:', err)
          );
      }
    }

    return res.status(200).json({
      success: true,
      order_id,
      whatsappUrl: contact.whatsappUrl,
      telegramUrl: contact.telegramUrl,
      pricing: {
        subtotal,
        shipping,
        vat_amount: vatAmount,
        discount_amount: discountAmount,
        total: grandTotal,
        coupon_code: validatedCouponCode,
      },
      items: responseItems,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
