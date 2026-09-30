/** Pure coupon admin/public input validation. No DB, no side effects. */

import { normalizeCouponCode, roundMoney } from "./orderPricing";

export type CouponAdminType = "percentage" | "fixed";

export type NormalizedCouponAdminInput = {
  code: string;
  type: CouponAdminType;
  value: number;
  minimumOrder: number;
  usageLimit: number | null;
  expiresAt: string | null;
};

export type ValidationOk<T> = { ok: true; value: T };
export type ValidationErr = { ok: false; error: string };
export type ValidationResult<T> = ValidationOk<T> | ValidationErr;

const CODE_MAX = 50;
const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONEY_RE = /^-?\d+(\.\d+)?$/;

function err(error: string): ValidationErr {
  return { ok: false, error };
}

function ok<T>(value: T): ValidationOk<T> {
  return { ok: true, value };
}

/** Strict finite money string/number (rejects "12abc", NaN, Infinity, booleans). */
export function parseStrictMoney(raw: unknown): number | null {
  if (typeof raw === "boolean") return null;
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return null;
    return roundMoney(raw);
  }
  if (typeof raw === "string") {
    const t = raw.trim();
    if (t === "") return null;
    if (!MONEY_RE.test(t)) return null;
    const n = Number(t);
    if (!Number.isFinite(n)) return null;
    return roundMoney(n);
  }
  return null;
}

export function parseCouponCode(raw: unknown): ValidationResult<string> {
  if (raw === null || raw === undefined) {
    return err("Coupon code is required");
  }
  if (typeof raw === "boolean" || typeof raw === "object") {
    return err("Invalid coupon code");
  }
  const code = normalizeCouponCode(raw);
  if (!code) return err("Coupon code is required");
  if (code.length > CODE_MAX) {
    return err(`Coupon code must be at most ${CODE_MAX} characters`);
  }
  return ok(code);
}

export function parseCouponType(raw: unknown): ValidationResult<CouponAdminType> {
  if (raw === "percentage" || raw === "fixed") return ok(raw);
  return err("Coupon type must be percentage or fixed");
}

export function parseCouponValue(
  raw: unknown,
  type: CouponAdminType
): ValidationResult<number> {
  const n = parseStrictMoney(raw);
  if (n === null) return err("Coupon value must be a valid number");
  if (!(n > 0)) return err("Coupon value must be greater than 0");
  if (type === "percentage" && n > 100) {
    return err("Percentage value must be at most 100");
  }
  return ok(n);
}

/** Blank → 0; otherwise finite money >= 0. */
export function parseMinimumOrder(raw: unknown): ValidationResult<number> {
  if (raw === null || raw === undefined) return ok(0);
  if (typeof raw === "string" && raw.trim() === "") return ok(0);
  const n = parseStrictMoney(raw);
  if (n === null) return err("Minimum order must be a valid number");
  if (n < 0) return err("Minimum order cannot be negative");
  return ok(n);
}

/**
 * Blank / null → unlimited (null).
 * Otherwise positive safe integer >= 1.
 */
export function parseUsageLimit(raw: unknown): ValidationResult<number | null> {
  if (raw === null || raw === undefined) return ok(null);
  if (typeof raw === "string" && raw.trim() === "") return ok(null);
  if (typeof raw === "boolean") return err("Usage limit must be a whole number");
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return err("Usage limit must be a whole number");
    if (!Number.isInteger(raw)) return err("Usage limit must be a whole number");
    if (raw < 1) return err("Usage limit must be at least 1");
    if (raw > Number.MAX_SAFE_INTEGER) {
      return err("Usage limit is too large");
    }
    return ok(raw);
  }
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!/^\d+$/.test(t)) return err("Usage limit must be a whole number");
    const n = Number(t);
    if (!Number.isSafeInteger(n) || n < 1) {
      return err("Usage limit must be at least 1");
    }
    return ok(n);
  }
  return err("Usage limit must be a whole number");
}

/**
 * Blank → null.
 * Accepts YYYY-MM-DD, Date, or ISO-like strings whose leading date is valid.
 * Does not change expiry business semantics — only normalizes input shape.
 */
export function parseExpiresAt(raw: unknown): ValidationResult<string | null> {
  if (raw === null || raw === undefined) return ok(null);
  if (typeof raw === "string" && raw.trim() === "") return ok(null);

  let ymd: string | null = null;

  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return err("Invalid expiry date");
    const y = raw.getUTCFullYear();
    const m = String(raw.getUTCMonth() + 1).padStart(2, "0");
    const d = String(raw.getUTCDate()).padStart(2, "0");
    ymd = `${y}-${m}-${d}`;
  } else if (typeof raw === "string") {
    const t = raw.trim();
    const head = t.length >= 10 ? t.slice(0, 10) : t;
    if (!DATE_ONLY_RE.test(head)) {
      return err("Expiry must be a valid date (YYYY-MM-DD)");
    }
    ymd = head;
  } else {
    return err("Expiry must be a valid date (YYYY-MM-DD)");
  }

  if (!isValidCalendarDate(ymd)) {
    return err("Expiry must be a valid calendar date");
  }
  return ok(ymd);
}

function isValidCalendarDate(ymd: string): boolean {
  const m = ymd.match(DATE_ONLY_RE);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === mo - 1 &&
    dt.getUTCDate() === d
  );
}

export function parseCouponId(raw: unknown): ValidationResult<number> {
  if (typeof raw === "boolean") return err("Invalid coupon id");
  if (typeof raw === "number") {
    if (!Number.isSafeInteger(raw) || raw < 1) return err("Invalid coupon id");
    return ok(raw);
  }
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!/^\d+$/.test(t)) return err("Invalid coupon id");
    const n = Number(t);
    if (!Number.isSafeInteger(n) || n < 1) return err("Invalid coupon id");
    return ok(n);
  }
  return err("Invalid coupon id");
}

/**
 * Accept only deliberate boolean / 0 / 1 shapes.
 * String "false" must NOT become true.
 */
export function parseIsActive(raw: unknown): ValidationResult<boolean> {
  if (raw === true || raw === 1) return ok(true);
  if (raw === false || raw === 0) return ok(false);
  if (raw === "1") return ok(true);
  if (raw === "0") return ok(false);
  return err("is_active must be true or false");
}

/** Public checkout preview cart_total: finite numeric >= 0. */
export function parseCartTotal(raw: unknown): ValidationResult<number> {
  if (raw === null || raw === undefined) {
    return err("cart_total is required");
  }
  if (typeof raw === "string" && raw.trim() === "") {
    return err("cart_total is required");
  }
  const n = parseStrictMoney(raw);
  if (n === null) return err("cart_total must be a valid number");
  if (n < 0) return err("cart_total cannot be negative");
  return ok(n);
}

export function parseCouponAdminInput(body: unknown): ValidationResult<NormalizedCouponAdminInput> {
  if (!body || typeof body !== "object") {
    return err("Invalid coupon payload");
  }
  const b = body as Record<string, unknown>;

  const code = parseCouponCode(b.code);
  if (!code.ok) return code;

  const type = parseCouponType(b.type);
  if (!type.ok) return type;

  const value = parseCouponValue(b.value, type.value);
  if (!value.ok) return value;

  const minimumOrder = parseMinimumOrder(b.minimum_order);
  if (!minimumOrder.ok) return minimumOrder;

  const usageLimit = parseUsageLimit(b.usage_limit);
  if (!usageLimit.ok) return usageLimit;

  const expiresAt = parseExpiresAt(b.expires_at);
  if (!expiresAt.ok) return expiresAt;

  return ok({
    code: code.value,
    type: type.value,
    value: value.value,
    minimumOrder: minimumOrder.value,
    usageLimit: usageLimit.value,
    expiresAt: expiresAt.value,
  });
}
