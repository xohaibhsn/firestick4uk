/**
 * Server-only reader for CMS payment method toggles.
 * Short TTL cache; fail-safe = both enabled.
 */

import {
  PAYMENT_BANK_ENABLED_KEY,
  PAYMENT_COD_ENABLED_KEY,
  effectivePaymentMethods,
  type PaymentMethodToggleMap,
} from "./paymentMethodSettings";

export const PAYMENT_METHOD_SETTINGS_CACHE_TTL_MS = 5_000;

type Queryable = {
  query: (sql: string, params?: unknown[]) => Promise<[unknown[], unknown?]>;
};

type CacheEntry = { at: number; value: PaymentMethodToggleMap };

let cache: CacheEntry | null = null;

export function clearPaymentMethodSettingsCache(): void {
  cache = null;
}

/**
 * Read the two toggles. Fail-safe: any error ⇒ both enabled.
 * Optional `db` injection for tests.
 */
export async function getPaymentMethodSettings(opts?: {
  db?: Queryable;
  nowMs?: number;
  ttlMs?: number;
}): Promise<PaymentMethodToggleMap> {
  const now = opts?.nowMs ?? Date.now();
  const ttl = opts?.ttlMs ?? PAYMENT_METHOD_SETTINGS_CACHE_TTL_MS;
  if (cache && now - cache.at < ttl) return cache.value;

  const failSafe: PaymentMethodToggleMap = {
    bankEnabled: true,
    codEnabled: true,
    bothOffCorrected: false,
  };

  try {
    const db =
      opts?.db ??
      ((await import("./db")).default as unknown as Queryable);
    const [rows] = await db.query(
      `SELECT content_key, content_value FROM site_content
       WHERE content_key IN (?, ?)`,
      [PAYMENT_BANK_ENABLED_KEY, PAYMENT_COD_ENABLED_KEY]
    );
    const map = new Map<string, string>();
    for (const r of (rows as Array<{ content_key?: string; content_value?: string }>) || []) {
      if (r && typeof r.content_key === "string") {
        map.set(r.content_key, String(r.content_value ?? ""));
      }
    }
    const value = effectivePaymentMethods(
      map.has(PAYMENT_BANK_ENABLED_KEY)
        ? map.get(PAYMENT_BANK_ENABLED_KEY)
        : undefined,
      map.has(PAYMENT_COD_ENABLED_KEY)
        ? map.get(PAYMENT_COD_ENABLED_KEY)
        : undefined
    );
    cache = { at: now, value };
    return value;
  } catch {
    cache = { at: now, value: failSafe };
    return failSafe;
  }
}
