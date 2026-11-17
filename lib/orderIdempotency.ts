/** Pure helpers for checkout Idempotency-Key (no DB). */

import { createHash } from "crypto";

export const IDEMPOTENCY_HEADER = "idempotency-key";

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Lowercase UUID v4 only. */
export function isValidIdempotencyKey(v: unknown): v is string {
  return typeof v === "string" && UUID_V4_RE.test(v);
}

export type OrderRequestHashInput = {
  items: { id: number; qty: number }[];
  couponCode: string;
  paymentMethod: string;
  email: string;
};

/**
 * Canonical request hash for idempotent checkout.
 * Callers must pass already-validated values (qtyById entries, normalizeCouponCode,
 * publicPaymentMethod, normalized customer_email).
 */
export function computeOrderRequestHash(input: OrderRequestHashInput): string {
  const items = input.items
    .map((i) => [Number(i.id), Number(i.qty)] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const canonical = JSON.stringify({
    v: 1,
    items,
    coupon: input.couponCode || "",
    payment: input.paymentMethod,
    email: String(input.email || "")
      .trim()
      .toLowerCase(),
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function isDupEntry(err: unknown): boolean {
  const e = err as { code?: unknown; errno?: unknown } | null | undefined;
  return e?.code === "ER_DUP_ENTRY" || e?.errno === 1062;
}

/** Parse MySQL duplicate-key name from sqlMessage/message (`PRIMARY` or `table.PRIMARY`). */
export function dupKeyName(err: unknown): string | null {
  const e = err as { sqlMessage?: unknown; message?: unknown } | null | undefined;
  const msg = String(e?.sqlMessage || e?.message || "");
  const m = /for key '([^']+)'/i.exec(msg);
  return m ? m[1] : null;
}

export function isPrimaryDupKey(keyName: string | null): boolean {
  if (!keyName) return false;
  return keyName === "PRIMARY" || keyName.endsWith(".PRIMARY");
}
