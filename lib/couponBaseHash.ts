/**
 * Coupon admin write stale-write token (MULTI-137).
 * Server-only — Node crypto. Do not import from client components.
 *
 * Hash is sha256 of JSON.stringify of the RAW column values, in a fixed order,
 * of exactly the columns PUT /api/coupons writes. No trimming, no coercion.
 *
 * used_count / created_at are excluded on purpose so order redemptions do not
 * cause false 409s. null and "" stay distinct because JSON encodes them
 * differently and MySQL distinguishes NULL from ''. A missing key is null.
 */
import { createHash } from "crypto";

/** Same order as the UPDATE column list in pages/api/coupons.ts PUT. */
export const COUPON_WRITE_COLUMNS = [
  "code",
  "type",
  "value",
  "minimum_order",
  "usage_limit",
  "expires_at",
  "is_active",
] as const;

export type CouponWriteColumn = (typeof COUPON_WRITE_COLUMNS)[number];

function rawColumn(row: Record<string, unknown>, key: string): unknown {
  if (!Object.prototype.hasOwnProperty.call(row, key)) return null;
  const value = row[key];
  return value === undefined ? null : value;
}

/** SHA-256 hex of the raw writable columns. Unrelated columns are ignored. */
export function couponRowBaseHash(row: Record<string, unknown> | null | undefined): string {
  const source = row && typeof row === "object" ? row : {};
  const values = COUPON_WRITE_COLUMNS.map((key) => rawColumn(source, key));
  return createHash("sha256").update(JSON.stringify(values), "utf8").digest("hex");
}
