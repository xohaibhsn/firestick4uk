import type { NextApiRequest, NextApiResponse } from 'next';
import { randomInt } from 'crypto';
import { RL_GENERAL, getClientIp } from '../../lib/rateLimit';
import pool from '../../lib/db';
import nodemailer from 'nodemailer';
import { getContactConfig } from '../../lib/contact-config';
import { escapeHtml, escapeHtmlWithLineBreaks, sanitizeEmailHeaderText } from '../../lib/contentHtml';
import {
  buildDigitalSupplyAckNotes,
  isDigitalProduct,
} from '../../lib/productFulfilment';
import {
  calculateAuthoritativePricing,
  calculateGrandTotal,
  evaluateLockedCoupon,
  extractVatFromInclusiveGrandTotal,
  isFiniteNonNegativeMoney,
  normalizeCouponCode,
  parseOrderQuantity,
  roundMoney,
  type AuthoritativeLineItem,
} from '../../lib/orderPricing';
import {
  CUSTOMER_IDENTITY_REQUIRED_MSG,
  hasMeaningfulCustomerIdentity,
  normalizeCheckoutPhoneForStorage,
  normalizeOrderCustomerIdentity,
  validateCheckoutContact,
} from '../../lib/orderCustomerIdentity';
import {
  isPublicPaymentMethod,
  toDbPaymentMethod,
  type PublicPaymentMethod,
} from '../../lib/paymentMethod';
import { isPaymentMethodEffectivelyEnabled } from '../../lib/paymentMethodSettings';
import { getPaymentMethodSettings } from '../../lib/paymentMethodSettingsServer';
import {
  getPricesIncludeVat,
  isPricesIncludeVatReadError,
} from '../../lib/pricesIncludeVatServer';
import { lockAndAuthorizeOrderProducts } from '../../lib/orderProductEligibility';
import { isAllowedReceiptPath } from '../../lib/receiptPathPolicy';
import {
  computeOrderRequestHash,
  dupKeyName,
  isDupEntry,
  isPrimaryDupKey,
  isValidIdempotencyKey,
} from '../../lib/orderIdempotency';

const PRICING_UNAVAILABLE_MSG =
  'Pricing temporarily unavailable. Please try again.';

/** ORD- + Date.now() + 3 random digits (fits orders.order_id VARCHAR(20)). */
export function generateOrderId(nowMs: number = Date.now()): string {
  return 'ORD-' + String(nowMs) + String(randomInt(0, 1000)).padStart(3, '0');
}

/** Coupon/order validation failures that must roll back an open transaction. */
class OrderValidationError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'OrderValidationError';
    this.status = status;
  }
}

/**
 * Email-only payment label. Same digital-only classification as cart
 * (digital items present and no physical items). Does not change DB values.
 */
function emailPaymentMethodLabel(
  method: PublicPaymentMethod,
  digitalOnly: boolean,
  style: 'email-admin' | 'email-customer'
): string {
  if (method === 'bank') {
    return style === 'email-admin' ? '🏦 Bank Transfer' : 'Bank Transfer';
  }
  if (digitalOnly) {
    const label = 'Pay on Delivery / Activation';
    return style === 'email-admin' ? `💵 ${label}` : label;
  }
  const label = 'Cash on Delivery';
  return style === 'email-admin' ? `💵 ${label}` : label;
}

/** Email-only: render digital-supply marker as readable text; stored notes stay untouched. */
function formatAdminEmailNotesDisplay(storedNotes: string): string {
  const marker = '[DIGITAL_SUPPLY_ACK_V1]';
  const idx = storedNotes.indexOf(marker);
  if (idx < 0) return storedNotes;

  const customerPart = storedNotes.slice(0, idx).replace(/\s+$/, '');
  const markerBlock = storedNotes.slice(idx);
  const recordedAt = /recorded_at=([^\r\n]*)/.exec(markerBlock)?.[1]?.trim() || '';
  const productIds = /product_ids=([^\r\n]*)/.exec(markerBlock)?.[1]?.trim() || '';
  const readable =
    `Digital supply acknowledgement: accepted — recorded ${recordedAt}` +
    (productIds ? `, product ids ${productIds}` : '');

  return customerPart ? `${customerPart}\n${readable}` : readable;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { allowed } = RL_GENERAL(getClientIp(req));
  if (!allowed) return res.status(429).json({ error: 'Too many requests' });

  // Idempotency-Key (optional): validate before any DB / coupon / receipt / email work.
  const rawIdemHeader = req.headers['idempotency-key'];
  let idempotencyKey: string | null = null;
  if (rawIdemHeader !== undefined) {
    if (typeof rawIdemHeader !== 'string' || !isValidIdempotencyKey(rawIdemHeader)) {
      return res.status(400).json({
        error: 'Invalid checkout session. Please refresh the page and try again.',
        code: 'invalid_idempotency_key',
      });
    }
    idempotencyKey = rawIdemHeader;
  }

  try {
    const {
      customer_name: rawCustomerName,
      customer_email: rawCustomerEmail,
      customer_phone: rawCustomerPhone,
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

    const identity = normalizeOrderCustomerIdentity({
      customer_name: rawCustomerName,
      customer_email: rawCustomerEmail,
      customer_phone: rawCustomerPhone,
    });
    const { customer_name, customer_email } = identity;
    let { customer_phone } = identity;

    if (!hasMeaningfulCustomerIdentity({ customer_name, customer_email, customer_phone })) {
      return res.status(400).json({ error: CUSTOMER_IDENTITY_REQUIRED_MSG });
    }

    // Email + phone mandatory (E.164). Reject before payment / receipt / coupon / DB / email.
    const checkoutContact = validateCheckoutContact({
      customer_email,
      customer_phone,
    });
    if (!checkoutContact.ok) {
      return res.status(400).json({
        error: checkoutContact.message,
        field: checkoutContact.field,
        code: checkoutContact.code,
      });
    }
    customer_phone = normalizeCheckoutPhoneForStorage(customer_phone);

    if (!isPublicPaymentMethod(payment_method)) {
      return res.status(400).json({ error: 'Invalid payment method.' });
    }
    const publicPaymentMethod: PublicPaymentMethod = payment_method;
    const dbPaymentMethod = toDbPaymentMethod(publicPaymentMethod);

    // Receipt path allowlist — before any DB / coupon / email work.
    // COD: ignore receipt_path entirely (pre-MULTI-107 behaviour — never store a receipt).
    const receiptPathValue =
      publicPaymentMethod === 'cod'
        ? ''
        : receipt_path == null
          ? ''
          : String(receipt_path);
    if (publicPaymentMethod !== 'cod' && !isAllowedReceiptPath(receiptPathValue)) {
      return res.status(400).json({
        error: 'Receipt upload is invalid — please upload your receipt again.',
      });
    }

    // CMS on/off — fail-safe enabled. Reject before receipt, coupon, DB, or email.
    const paymentToggles = await getPaymentMethodSettings();
    if (!isPaymentMethodEffectivelyEnabled(publicPaymentMethod, paymentToggles)) {
      return res.status(400).json({ error: 'Payment method unavailable.' });
    }

    // VAT mode — early read is a fast path only. On read error (unknown), do not
    // decide OFF (would overcharge when prices are already inclusive); proceed to TX.
    let pricesIncludeVatEarly: boolean | undefined;
    try {
      pricesIncludeVatEarly = await getPricesIncludeVat();
    } catch (err) {
      if (!isPricesIncludeVatReadError(err)) throw err;
      pricesIncludeVatEarly = undefined;
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
    const rawCoupon = normalizeCouponCode(coupon_code);
    const customerNotes = typeof notes === 'string' ? notes : '';
    // Contact/SMTP stay outside the short DB transaction.
    const contact = await getContactConfig();

    const requestHash = idempotencyKey
      ? computeOrderRequestHash({
          items: uniqueIds.map((id) => ({ id, qty: qtyById.get(id)! })),
          couponCode: rawCoupon,
          paymentMethod: publicPaymentMethod,
          email: customer_email,
        })
      : null;

    let order_id = '';
    let validatedCouponCode: string | null = null;
    let discountAmount = 0;
    let grandTotal = 0;
    let authoritativeItems: AuthoritativeLineItem[] = [];
    let notesToStore = customerNotes || '';
    let subtotal = 0;
    let shipping = 0;
    let vatAmount = 0;
    let hasDigital = false;
    let orderPricesIncludeVat =
      typeof pricesIncludeVatEarly === 'boolean' ? pricesIncludeVatEarly : false;

    type CreateOutcome =
      | { kind: 'created' }
      | { kind: 'replay_primary' }
      | { kind: 'retry_collision' };

    async function safeRollback(conn: { rollback: () => Promise<void> }) {
      try {
        await conn.rollback();
      } catch {
        /* ignore */
      }
    }

    async function attemptCreate(candidateOrderId: string): Promise<CreateOutcome> {
      validatedCouponCode = null;
      discountAmount = 0;
      grandTotal = 0;
      authoritativeItems = [];
      notesToStore = customerNotes || '';
      subtotal = 0;
      shipping = 0;
      vatAmount = 0;
      hasDigital = false;
      orderPricesIncludeVat =
        typeof pricesIncludeVatEarly === 'boolean' ? pricesIncludeVatEarly : false;
      order_id = candidateOrderId;

      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        // Fixed lock order: claim idempotency key before product/coupon FOR UPDATE.
        if (idempotencyKey && requestHash) {
          try {
            await conn.query(
              'INSERT INTO order_idempotency_keys (idempotency_key, request_hash, order_id, created_at) VALUES (?, ?, ?, UTC_TIMESTAMP(3))',
              [idempotencyKey, requestHash, order_id]
            );
          } catch (insErr) {
            if (isDupEntry(insErr)) {
              await safeRollback(conn);
              const keyName = dupKeyName(insErr);
              if (isPrimaryDupKey(keyName)) return { kind: 'replay_primary' };
              if (
                keyName === 'uq_oik_order_id' ||
                (typeof keyName === 'string' && keyName.endsWith('.uq_oik_order_id'))
              ) {
                return { kind: 'retry_collision' };
              }
            }
            throw insErr;
          }
        }

        // Lock products in ascending id order; sample eligibility time inside the TX.
        const authorized = await lockAndAuthorizeOrderProducts({
          conn,
          productIds: uniqueIds,
        });
        if (!authorized.ok) {
          throw new OrderValidationError(authorized.error);
        }

        // Re-check CMS payment toggles inside the TX (early check is a fast path only).
        const paymentTogglesTx = await getPaymentMethodSettings({ db: conn, ttlMs: 0 });
        if (!isPaymentMethodEffectivelyEnabled(publicPaymentMethod, paymentTogglesTx)) {
          throw new OrderValidationError('Payment method unavailable.');
        }

        // Re-read VAT mode inside TX (authoritative for this order).
        // Unknown/error → roll back + 503; never INSERT or email with a guessed OFF.
        try {
          orderPricesIncludeVat = await getPricesIncludeVat({ db: conn, ttlMs: 0 });
        } catch (vatErr) {
          if (isPricesIncludeVatReadError(vatErr)) {
            throw new OrderValidationError(PRICING_UNAVAILABLE_MSG, 503);
          }
          throw vatErr;
        }

        authoritativeItems = [];
        for (const id of uniqueIds) {
          const p = authorized.productsById.get(id)!;
          const price = Number(p.price);
          if (!isFiniteNonNegativeMoney(price)) {
            throw new OrderValidationError(
              'Unable to process order due to an invalid product price. Please contact support.',
              500
            );
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
        hasDigital = digitalProducts.length > 0;
        if (hasDigital && digital_supply_acknowledgement !== true) {
          throw new OrderValidationError(
            'Digital supply acknowledgement is required for subscription/digital items.'
          );
        }

        const pricing = calculateAuthoritativePricing(authoritativeItems, {
          pricesIncludeVat: orderPricesIncludeVat,
        });
        subtotal = pricing.subtotal;
        shipping = pricing.shipping;
        vatAmount = pricing.vatAmount;

        const recordedAt = new Date().toISOString();
        notesToStore = hasDigital
          ? buildDigitalSupplyAckNotes({
              customerNotes,
              digitalProductIds: digitalProducts.map((p) => Number(p.id)),
              recordedAtIso: recordedAt,
            })
          : customerNotes || '';

        if (rawCoupon) {
          const [couponRows]: any = await conn.query(
            'SELECT * FROM coupons WHERE code=? AND is_active=1 LIMIT 1 FOR UPDATE',
            [rawCoupon]
          );
          if (!Array.isArray(couponRows) || !couponRows.length) {
            throw new OrderValidationError('Invalid coupon code.');
          }
          const evaluated = evaluateLockedCoupon({
            coupon: couponRows[0],
            cartTotalForCoupon: roundMoney(subtotal + shipping),
          });
          if (!evaluated.ok) {
            throw new OrderValidationError(evaluated.error);
          }
          discountAmount = evaluated.discountAmount;
          validatedCouponCode = evaluated.code;
        }

        grandTotal = calculateGrandTotal({
          subtotal,
          shipping,
          vatAmount,
          discountAmount,
          pricesIncludeVat: orderPricesIncludeVat,
        });
        if (orderPricesIncludeVat) {
          vatAmount = extractVatFromInclusiveGrandTotal(grandTotal);
        }

        try {
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
              dbPaymentMethod,
              receiptPathValue || '',
              grandTotal,
              validatedCouponCode,
              discountAmount,
              vatAmount,
              payment_reference || null,
              'pending',
            ]
          );
        } catch (ordErr) {
          if (isDupEntry(ordErr)) {
            await safeRollback(conn);
            return { kind: 'retry_collision' };
          }
          throw ordErr;
        }

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
        return { kind: 'created' };
      } catch (txErr) {
        await safeRollback(conn);
        throw txErr;
      } finally {
        conn.release();
      }
    }

    /** Replay path: pool only, outside any TX. */
    async function replayIdempotentOrder(
      key: string,
      expectedHash: string
    ): Promise<
      | { kind: 'response'; status: number; body: Record<string, unknown> }
      | { kind: 'restart' }
    > {
      const [keyRows]: any = await pool.query(
        'SELECT request_hash, order_id FROM order_idempotency_keys WHERE idempotency_key=?',
        [key]
      );
      if (!Array.isArray(keyRows) || !keyRows.length) {
        return { kind: 'restart' };
      }
      const keyRow = keyRows[0];
      if (String(keyRow.request_hash) !== expectedHash) {
        return {
          kind: 'response',
          status: 422,
          body: {
            error:
              'This checkout was already used for a different order. Please refresh the page and try again.',
            code: 'idempotency_key_reused',
          },
        };
      }
      const existingOrderId = String(keyRow.order_id);
      const [orderRows]: any = await pool.query(
        'SELECT order_id, total, discount_amount, vat_amount, coupon_code FROM orders WHERE order_id=?',
        [existingOrderId]
      );
      if (!Array.isArray(orderRows) || !orderRows.length) {
        await pool.query(
          'DELETE FROM order_idempotency_keys WHERE idempotency_key=? AND order_id=?',
          [key, existingOrderId]
        );
        return { kind: 'restart' };
      }
      const [itemRows]: any = await pool.query(
        'SELECT product_id, product_name, price, quantity FROM order_items WHERE order_id=? ORDER BY id',
        [existingOrderId]
      );
      const replayItems = (Array.isArray(itemRows) ? itemRows : []).map((row: any) => ({
        id: Number(row.product_id),
        name: String(row.product_name),
        price: Number(row.price),
        qty: Number(row.quantity),
      }));
      let replaySubtotal = 0;
      for (const it of replayItems) {
        replaySubtotal = roundMoney(replaySubtotal + Number(it.price) * Number(it.qty));
      }
      const o = orderRows[0];
      console.log('[orders] idempotent replay', existingOrderId);
      return {
        kind: 'response',
        status: 200,
        body: {
          success: true,
          replayed: true,
          order_id: existingOrderId,
          whatsappUrl: contact.whatsappUrl,
          telegramUrl: contact.telegramUrl,
          pricing: {
            subtotal: replaySubtotal,
            total: Number(o.total),
            vat_amount: Number(o.vat_amount),
            discount_amount: Number(o.discount_amount),
            coupon_code: o.coupon_code ?? null,
          },
          items: replayItems,
        },
      };
    }

    // Collision / orphan / missing-key: at most one restart/retry of the create TX
    // (a second collision or restart → generic 500). Hard ceiling: 2 restarts total.
    let restartsUsed = 0;
    const maxRestarts = 2;
    let created = false;
    while (!created) {
      const outcome = await attemptCreate(generateOrderId());
      if (outcome.kind === 'created') {
        created = true;
        break;
      }
      if (outcome.kind === 'replay_primary') {
        const replay = await replayIdempotentOrder(idempotencyKey!, requestHash!);
        if (replay.kind === 'response') {
          return res.status(replay.status).json(replay.body);
        }
        // orphan / missing key → restart create once (within budget)
        if (restartsUsed >= maxRestarts) {
          console.error('[orders] Order creation failed:', 'Error', 'idempotency_restart_exhausted');
          return res.status(500).json({ error: 'Unable to create order. Please try again.' });
        }
        restartsUsed += 1;
        continue;
      }
      // retry_collision: RETRY ONCE; a second collision → 500
      if (restartsUsed >= 1 || restartsUsed >= maxRestarts) {
        console.error('[orders] Order creation failed:', 'Error', 'ER_DUP_ENTRY');
        return res.status(500).json({ error: 'Unable to create order. Please try again.' });
      }
      restartsUsed += 1;
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

      const safeAdminOrderId = escapeHtml(String(order_id || ''));
      const safeAdminCustomerName = escapeHtml(String(customer_name || ''));
      const safeAdminCustomerEmail = escapeHtml(String(customer_email || ''));
      const safeAdminCustomerPhone = escapeHtml(String(customer_phone || ''));
      const safeAdminAddress = escapeHtml(
        [delivery_address, city, postcode].filter(Boolean).join(', ')
      );
      const safeAdminPaymentReference = escapeHtml(String(payment_reference || ''));
      // Email display only — notesToStore (DB insert) stays byte-identical.
      const safeAdminNotes = escapeHtmlWithLineBreaks(
        formatAdminEmailNotesDisplay(notesToStore)
      );
      const safeAdminCouponCode = escapeHtml(String(validatedCouponCode || ''));
      const subjectCustomerName = sanitizeEmailHeaderText(customer_name);
      const hasPhysical = authoritativeItems.some((p) => !isDigitalProduct(p));
      const digitalOnly = hasDigital && !hasPhysical;
      const adminPaymentLabel = emailPaymentMethodLabel(
        publicPaymentMethod,
        digitalOnly,
        'email-admin'
      );
      const safeAdminPaymentLabel = escapeHtml(adminPaymentLabel);
      // Receipt status only — never attach the file; never link public/guessable receipt URLs.
      const receiptUploaded = Boolean(String(receiptPathValue || '').trim());
      // Row label is "Receipt"; value must not repeat the "Receipt:" prefix.
      // COD: receipt not required; bank keeps existing attached / not-uploaded strings.
      const receiptStatusLine =
        publicPaymentMethod === 'cod'
          ? 'Not required (pay on delivery / activation)'
          : receiptUploaded
            ? 'Attached — view in /sidhu → Orders'
            : 'Not uploaded';
      const safeAdminReceiptStatus = escapeHtml(receiptStatusLine);

      const itemRows = authoritativeItems
        .map((i) => {
          const safeName = escapeHtml(String(i.name || 'Item'));
          return `<tr>
          <td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;font-size:14px">${safeName}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;text-align:center;font-size:14px">${i.qty}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #f0f0f0;text-align:right;font-size:14px;font-weight:600;color:#5B21B6">£${(i.price * i.qty).toFixed(2)}</td>
        </tr>`;
        })
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
      <div style="font-size:20px;font-weight:700;color:#5B21B6">${safeAdminOrderId}</div>
    </div>
    <h3 style="color:#111;font-size:13px;letter-spacing:1.5px;text-transform:uppercase;margin:0 0 12px;padding-bottom:8px;border-bottom:2px solid #f0f0f0">Customer Details</h3>
    <table style="width:100%;margin-bottom:24px;border-collapse:collapse">
      <tr><td style="padding:5px 0;color:#888;font-size:13px;width:110px">Name</td><td style="color:#111;font-size:13px;font-weight:600">${safeAdminCustomerName}</td></tr>
      <tr><td style="padding:5px 0;color:#888;font-size:13px">Email</td><td style="color:#111;font-size:13px">${safeAdminCustomerEmail}</td></tr>
      <tr><td style="padding:5px 0;color:#888;font-size:13px">Phone</td><td style="color:#111;font-size:13px">${safeAdminCustomerPhone}</td></tr>
      <tr><td style="padding:5px 0;color:#888;font-size:13px">Address</td><td style="color:#111;font-size:13px">${safeAdminAddress}</td></tr>
      <tr><td style="padding:5px 0;color:#888;font-size:13px">Payment</td><td style="color:#111;font-size:13px;font-weight:600">${safeAdminPaymentLabel}</td></tr>
      <tr><td style="padding:5px 0;color:#888;font-size:13px">Receipt</td><td style="color:#111;font-size:13px;font-weight:600">${safeAdminReceiptStatus}</td></tr>
      ${payment_reference ? `<tr><td style="padding:5px 0;color:#888;font-size:13px">Reference</td><td style="color:#111;font-size:13px">${safeAdminPaymentReference}</td></tr>` : ''}
      ${notesToStore ? `<tr><td style="padding:5px 0;color:#888;font-size:13px">Notes</td><td style="color:#111;font-size:13px">${safeAdminNotes}</td></tr>` : ''}
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
      ${vatAmount ? `<div style="display:flex;justify-content:space-between;padding:5px 0;font-size:13px"><span style="color:#888">${orderPricesIncludeVat ? 'Includes VAT (20%)' : 'VAT (20%)'}</span><span style="color:#111">£${vatAmount.toFixed(2)}</span></div>` : ''}
      ${discountAmount ? `<div style="display:flex;justify-content:space-between;padding:5px 0;font-size:13px;color:#16A34A"><span>Discount${validatedCouponCode ? ` (${safeAdminCouponCode})` : ''}</span><span>−£${discountAmount.toFixed(2)}</span></div>` : ''}
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
        subject: `🛍️ New Order ${order_id} — ${subjectCustomerName}`,
        html,
      }).catch((err: any) => console.error('[orders] Email notification failed:', err));

      // Customer order confirmation — fire-and-forget; must not fail the order
      if (customer_email) {
        const safeName = escapeHtml(String(customer_name || ''));
        const safeOrderId = escapeHtml(String(order_id));
        const customerPaymentLabel = emailPaymentMethodLabel(
          publicPaymentMethod,
          digitalOnly,
          'email-customer'
        );
        const safePayment = escapeHtml(customerPaymentLabel);
        const customerStatusLine =
          publicPaymentMethod === 'cod'
            ? digitalOnly
              ? 'Thank you for your order. You chose to pay on delivery / activation.'
              : 'Thank you for your order. You chose Cash on Delivery.'
            : 'Thank you for your order. Your order is currently <strong>pending</strong> payment/verification.';
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
    <p style="color:#333;font-size:14px;line-height:1.6;margin:0 0 16px">${customerStatusLine}</p>
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
        prices_include_vat: orderPricesIncludeVat,
      },
      items: responseItems,
    });
  } catch (error: any) {
    if (error instanceof OrderValidationError || error?.name === 'OrderValidationError') {
      return res.status(error.status || 400).json({ error: error.message });
    }
    // Do not leak raw DB/driver messages to clients. Log only non-sensitive diagnostics.
    const errCode = typeof error?.code === 'string' ? error.code : undefined;
    const errName = typeof error?.name === 'string' ? error.name : 'Error';
    console.error('[orders] Order creation failed:', errName, errCode || '');
    return res.status(500).json({ error: 'Unable to create order. Please try again.' });
  }
}
