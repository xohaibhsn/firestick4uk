/**
 * Detect whether content_drafts exists — no runtime DDL.
 * Cached briefly so admin drafts API can degrade when the table is absent.
 */

type PoolLike = {
  query: (sql: string, params?: any[]) => Promise<any>;
};

let cached: boolean | null = null;
let cachedAt = 0;
const CACHE_MS = 60_000;

/** Test helper — reset capability cache. */
export function resetContentDraftsCapabilityCache(): void {
  cached = null;
  cachedAt = 0;
}

/**
 * Returns true when content_drafts is queryable.
 * Treats missing-table errors as "not available"; other errors propagate.
 */
export async function contentDraftsTableAvailable(pool: PoolLike): Promise<boolean> {
  const now = Date.now();
  if (cached != null && now - cachedAt < CACHE_MS) return cached;

  try {
    await pool.query("SELECT id FROM content_drafts LIMIT 0");
    cached = true;
    cachedAt = now;
    return true;
  } catch (err: unknown) {
    const code = typeof (err as { code?: string })?.code === "string" ? (err as { code: string }).code : "";
    if (code === "ER_NO_SUCH_TABLE" || code === "ER_BAD_TABLE_ERROR") {
      cached = false;
      cachedAt = now;
      return false;
    }
    throw err;
  }
}
