/**
 * Detect whether chat_leads.handled exists — no runtime DDL.
 * Cached briefly so admin UI can hide the Handled controls when absent.
 */

type PoolLike = {
  query: (sql: string, params?: any[]) => Promise<any>;
};

let cached: boolean | null = null;
let cachedAt = 0;
const CACHE_MS = 60_000;

/** Test helper — reset capability cache. */
export function resetLeadsHandledCapabilityCache(): void {
  cached = null;
  cachedAt = 0;
}

/**
 * Returns true when chat_leads.handled is queryable.
 * Treats ER_BAD_FIELD_ERROR as "not available"; other errors propagate.
 */
export async function leadsHandledColumnAvailable(pool: PoolLike): Promise<boolean> {
  const now = Date.now();
  if (cached != null && now - cachedAt < CACHE_MS) return cached;

  try {
    await pool.query("SELECT handled FROM chat_leads LIMIT 0");
    cached = true;
    cachedAt = now;
    return true;
  } catch (err: unknown) {
    const code = typeof (err as { code?: string })?.code === "string" ? (err as { code: string }).code : "";
    if (code === "ER_BAD_FIELD_ERROR" || code === "ER_BAD_FIELD") {
      cached = false;
      cachedAt = now;
      return false;
    }
    // information_schema fallback (some drivers / modes)
    try {
      const [rows]: any = await pool.query(
        `SELECT COUNT(*) AS c
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'chat_leads'
           AND COLUMN_NAME = 'handled'`
      );
      const ok = Number(rows?.[0]?.c || 0) > 0;
      cached = ok;
      cachedAt = now;
      return ok;
    } catch {
      throw err;
    }
  }
}
