/**
 * Payment-method boundary adapter.
 *
 * Public checkout/API contract: `bank` | `cod`
 * Production DB ENUM contract:  `bank_transfer` | `cod`
 *
 * Write path maps public → DB. Read path accepts both bank representations
 * without rewriting historical rows or expanding the public API surface.
 */

export const PUBLIC_PAYMENT_METHODS = ["bank", "cod"] as const;
export type PublicPaymentMethod = (typeof PUBLIC_PAYMENT_METHODS)[number];

export const DB_PAYMENT_METHODS = ["bank_transfer", "cod"] as const;
export type DbPaymentMethod = (typeof DB_PAYMENT_METHODS)[number];

export type PaymentDisplayKind = "bank" | "cod" | "unknown";

export function isPublicPaymentMethod(value: unknown): value is PublicPaymentMethod {
  return value === "bank" || value === "cod";
}

/**
 * Map a validated public payment method to the production ENUM value.
 * Must only be called after public-contract validation.
 * Never silently defaults invalid values.
 */
export function toDbPaymentMethod(value: PublicPaymentMethod): DbPaymentMethod {
  switch (value) {
    case "bank":
      return "bank_transfer";
    case "cod":
      return "cod";
    default: {
      const _exhaustive: never = value;
      throw new Error(`Unsupported public payment method: ${String(_exhaustive)}`);
    }
  }
}

/** Recognized bank storage representations (legacy public token + DB ENUM). */
export function isBankStorageValue(value: unknown): boolean {
  return value === "bank" || value === "bank_transfer";
}

export function isCodStorageValue(value: unknown): boolean {
  return value === "cod";
}

/**
 * Classify a stored/read payment_method conservatively.
 * Unknown / empty / malformed values are never treated as COD or confirmed bank.
 */
export function classifyStoredPaymentMethod(value: unknown): PaymentDisplayKind {
  if (isBankStorageValue(value)) return "bank";
  if (isCodStorageValue(value)) return "cod";
  return "unknown";
}

export type PaymentLabelStyle = "short" | "long" | "email-admin" | "email-customer";

export function formatPaymentMethodLabel(
  value: unknown,
  style: PaymentLabelStyle = "long"
): string {
  const kind = classifyStoredPaymentMethod(value);
  if (kind === "bank") {
    if (style === "short") return "Bank";
    if (style === "email-admin") return "🏦 Bank Transfer";
    return "Bank Transfer";
  }
  if (kind === "cod") {
    if (style === "short") return "COD";
    if (style === "email-admin") return "💵 Cash on Delivery";
    return "Cash on Delivery";
  }
  if (style === "short") return "Unknown";
  return "Unknown payment method";
}

/**
 * Expand an admin/public filter token into storage values that should match.
 * Filter input remains `bank` | `cod` (never expands the public filter vocabulary).
 */
export function paymentFilterStorageValues(
  publicFilter: PublicPaymentMethod
): readonly string[] {
  if (publicFilter === "bank") return ["bank", "bank_transfer"];
  return ["cod"];
}
