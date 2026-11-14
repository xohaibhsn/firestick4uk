/**
 * Server-only reader for CMS prices_include_vat.
 * Short TTL cache; fail-safe = OFF (additive VAT / today's behaviour).
 */

import {
  PRICES_INCLUDE_VAT_KEY,
  parsePricesIncludeVat,
} from "./pricesIncludeVat";

export const PRICES_INCLUDE_VAT_CACHE_TTL_MS = 5_000;

type Queryable = {
  query: (sql: string, params?: unknown[]) => Promise<[unknown[], unknown?]>;
};

type CacheEntry = { at: number; value: boolean };

let cache: CacheEntry | null = null;

export function clearPricesIncludeVatCache(): void {
  cache = null;
}

/**
 * Read prices_include_vat. Fail-safe: any error ⇒ OFF.
 * Optional `db` injection for tests.
 */
export async function getPricesIncludeVat(opts?: {
  db?: Queryable;
  nowMs?: number;
  ttlMs?: number;
}): Promise<boolean> {
  const now = opts?.nowMs ?? Date.now();
  const ttl = opts?.ttlMs ?? PRICES_INCLUDE_VAT_CACHE_TTL_MS;
  if (cache && now - cache.at < ttl) return cache.value;

  const failSafe = false;

  try {
    const db =
      opts?.db ??
      ((await import("./db")).default as unknown as Queryable);
    const [rows] = await db.query(
      `SELECT content_value FROM site_content WHERE content_key = ? LIMIT 1`,
      [PRICES_INCLUDE_VAT_KEY]
    );
    const row = Array.isArray(rows) && rows.length
      ? (rows[0] as { content_value?: string })
      : null;
    const value = parsePricesIncludeVat(
      row ? row.content_value : undefined
    );
    cache = { at: now, value };
    return value;
  } catch {
    cache = { at: now, value: failSafe };
    return failSafe;
  }
}
