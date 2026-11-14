/**
 * Server-only reader for CMS prices_include_vat.
 * Short TTL cache on successful reads only.
 * Read errors are NOT cached and do NOT fail-safe to OFF (would overcharge
 * when prices are already VAT-inclusive). Callers must treat unknown as
 * "do not decide" — orders API returns 503 inside the transaction.
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

/** Typed error: CMS read failed — setting is unknown; do not assume OFF. */
export class PricesIncludeVatReadError extends Error {
  constructor(message = "prices_include_vat read failed") {
    super(message);
    this.name = "PricesIncludeVatReadError";
  }
}

export function isPricesIncludeVatReadError(err: unknown): boolean {
  return (
    err instanceof PricesIncludeVatReadError ||
    (typeof err === "object" &&
      err !== null &&
      (err as { name?: unknown }).name === "PricesIncludeVatReadError")
  );
}

export function clearPricesIncludeVatCache(): void {
  cache = null;
}

/**
 * Read prices_include_vat.
 * - Missing row / empty / garbage ⇒ OFF (deliberate, same as today).
 * - Successful read ⇒ cache + return boolean.
 * - Read ERROR ⇒ do NOT cache; throw PricesIncludeVatReadError.
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
  } catch (err) {
    if (isPricesIncludeVatReadError(err)) throw err;
    throw new PricesIncludeVatReadError(
      err instanceof Error ? err.message : "prices_include_vat read failed"
    );
  }
}
