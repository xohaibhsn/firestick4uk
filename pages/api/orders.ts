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

type DbProduct = {
  id: number;
  name: string;
  category: string | null;
  stock: string | null;
  active: number;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { allowed } = RL_GENERAL(getClientIp(req));
  if (!allowed) return res.status(429).json({ error: 'Too many requests' });

  try {
    const { customer_name, customer_email, customer_phone, delivery_address, city, postcode, notes,
      payment_method, receipt_path, items, total, coupon_code, discount_amount, vat_amount,
      payment_reference, digital_supply_acknowledgement } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Order items are required.' });
    }

    const productIds: number[] = [];
    for (const item of items) {
      const id = Number(item?.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'Each item must include a valid product ID.' });
      }
      productIds.push(id);
    }

    const uniqueIds = [...new Set(productIds)];
    const placeholders = uniqueIds.map(() => '?').join(',');
    const [rows]: any = await pool.query(
      `SELECT id, name, category, stock, active FROM products WHERE id IN (${placeholders}) AND active=1`,
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

    const digitalProducts = products.filter((p) => isDigitalProduct(p));
    const hasDigital = digitalProducts.length > 0;

    if (hasDigital && digital_supply_acknowledgement !== true) {
      return res.status(400).json({
        error: 'Digital supply acknowledgement is required for subscription/digital items.',
      });
    }

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

    await pool.query(
      'INSERT INTO orders (order_id,customer_name,customer_email,customer_phone,delivery_address,city,postcode,notes,payment_method,receipt_path,total,coupon_code,discount_amount,vat_amount,payment_reference,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [order_id, customer_name, customer_email, customer_phone, delivery_address, city, postcode, notesToStore, payment_method, receipt_path||'', total, coupon_code||null, discount_amount||0, vat_amount||0, payment_reference||null, 'pending']
    );

    for (const item of items) {
      const authoritative = byId.get(Number(item.id));
      await pool.query(
        'INSERT INTO order_items (order_id,product_id,product_name,price,quantity) VALUES (?,?,?,?,?)',
        [order_id, item.id, authoritative?.name || item.name, item.price, item.qty]
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
        const customerItemRows = (items as any[])
          .map((i: any) => {
            const auth = byId.get(Number(i.id));
            const name = escapeHtml(String(auth?.name || i.name || 'Item'));
            const qty = escapeHtml(String(i.qty ?? 1));
            const lineTotal = (
              Number(i.price) * Number(i.qty || 1)
            ).toFixed(2);
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
    <p style="color:#555;font-size:13px;margin:0 0 20px"><strong>Total:</strong> £${Number(total).toFixed(2)}</p>
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
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
