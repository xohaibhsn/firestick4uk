/**
 * AB-8C1 — Authoritative Blog inventory preflight (server-only, read-only).
 *
 * Distinct from the SEO dashboard's catch-and-empty resilience: a failed
 * inventory query must never be interpreted as zero Blog posts for future
 * article-generation eligibility.
 *
 * SELECT-only. No public endpoint. No CMS writes. No schema changes.
 * Production callers must invoke only after blog.manage + super_admin auth.
 */

import {
  MAX_BLOG_MATCH_INVENTORY,
  MAX_MATCH_CATEGORY_CHARS,
  MAX_MATCH_FOCUS_KEYWORD_CHARS,
  MAX_MATCH_SLUG_CHARS,
  MAX_MATCH_TITLE_CHARS,
  type BlogMatchInventoryRow,
} from "@/lib/blogOpportunityMatcher";

/** Fetch one extra row to detect overflow without silent truncation. */
export const BLOG_ARTICLE_INVENTORY_QUERY_LIMIT = MAX_BLOG_MATCH_INVENTORY + 1;

export const BLOG_ARTICLE_INVENTORY_PREFLIGHT_FAILURE_CODES = [
  "query_failed",
  "invalid_result_shape",
  "malformed_row",
  "duplicate_entity_id",
  "inventory_overflow",
  "incomplete_inventory",
] as const;

export type BlogArticleInventoryPreflightFailureCode =
  (typeof BLOG_ARTICLE_INVENTORY_PREFLIGHT_FAILURE_CODES)[number];

export type BlogArticleInventoryPreflightFailure = {
  ok: false;
  code: BlogArticleInventoryPreflightFailureCode;
  authoritativeQuerySuccess: false;
};

export type BlogArticleInventoryPreflightSuccess = {
  ok: true;
  authoritativeQuerySuccess: true;
  rows: BlogMatchInventoryRow[];
  count: number;
};

export type BlogArticleInventoryPreflightResult =
  | BlogArticleInventoryPreflightSuccess
  | BlogArticleInventoryPreflightFailure;

/**
 * Injected SELECT seam for offline tests. Must never fall back to a live
 * database when missing — callers/tests must supply an explicit query.
 */
export type BlogArticleInventoryQueryFn = (
  sql: string,
  params?: unknown[]
) => Promise<unknown>;

export const BLOG_ARTICLE_INVENTORY_SELECT_SQL =
  `SELECT id, title, slug, status, active, focus_keyword, category
   FROM blog_posts
   ORDER BY id ASC
   LIMIT ${BLOG_ARTICLE_INVENTORY_QUERY_LIMIT}`;

const ALLOWED_STATUS = new Set(["draft", "published"]);

function fail(
  code: BlogArticleInventoryPreflightFailureCode
): BlogArticleInventoryPreflightFailure {
  return { ok: false, code, authoritativeQuerySuccess: false };
}

function parseActive(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === 0 || value === 1) return value === 1;
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value === 0) return false;
    if (value === 1) return true;
  }
  return null;
}

function parseOptionalBoundedString(
  value: unknown,
  maxChars: number
): { ok: true; value: string | null } | { ok: false } {
  if (value === undefined || value === null) {
    return { ok: true, value: null };
  }
  if (typeof value !== "string") return { ok: false };
  const trimmed = value.trim();
  if (trimmed.length > maxChars) return { ok: false };
  return { ok: true, value: trimmed.length ? trimmed : null };
}

function parseInventoryRow(
  raw: unknown
): { ok: true; value: BlogMatchInventoryRow } | { ok: false } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false };
  }
  const row = raw as Record<string, unknown>;
  const id = Number(row.id);
  if (!Number.isInteger(id) || id <= 0) return { ok: false };

  if (typeof row.title !== "string") return { ok: false };
  const title = row.title.trim();
  if (!title || title.length > MAX_MATCH_TITLE_CHARS) return { ok: false };

  if (typeof row.slug !== "string") return { ok: false };
  const slug = row.slug.trim();
  if (slug.length > MAX_MATCH_SLUG_CHARS) return { ok: false };

  if (typeof row.status !== "string") return { ok: false };
  const status = row.status.trim().toLowerCase();
  if (!ALLOWED_STATUS.has(status)) return { ok: false };

  const active = parseActive(row.active);
  if (active === null) return { ok: false };

  const focusP = parseOptionalBoundedString(
    row.focus_keyword,
    MAX_MATCH_FOCUS_KEYWORD_CHARS
  );
  if (!focusP.ok) return { ok: false };
  const catP = parseOptionalBoundedString(
    row.category,
    MAX_MATCH_CATEGORY_CHARS
  );
  if (!catP.ok) return { ok: false };

  return {
    ok: true,
    value: {
      id,
      title,
      slug,
      status,
      active,
      focus_keyword: focusP.value,
      category: catP.value,
    },
  };
}

async function defaultAuthoritativeQuery(
  sql: string,
  params?: unknown[]
): Promise<unknown> {
  // Lazy import so offline tests that inject `query` never load live DB env.
  const mod = await import("@/lib/db");
  const pool = mod.default;
  const [rows] = await pool.query(sql, params ?? []);
  return rows;
}

/**
 * Load a bounded authoritative Blog inventory snapshot for future generation.
 *
 * Only a successfully completed query may return ok:true.
 * Zero rows is valid only when the authoritative query itself succeeded.
 * More than MAX_BLOG_MATCH_INVENTORY rows → inventory_overflow HOLD.
 */
export async function loadAuthoritativeBlogMatchInventory(deps?: {
  query?: BlogArticleInventoryQueryFn;
}): Promise<BlogArticleInventoryPreflightResult> {
  const query = deps?.query;
  if (typeof query !== "function") {
    // Production path: lazy DB. Tests must inject — never silently open live DB
    // when a required mock is omitted from an offline suite.
    try {
      const rows = await defaultAuthoritativeQuery(
        BLOG_ARTICLE_INVENTORY_SELECT_SQL
      );
      return normalizeAuthoritativeRows(rows);
    } catch {
      return fail("query_failed");
    }
  }

  let raw: unknown;
  try {
    raw = await query(BLOG_ARTICLE_INVENTORY_SELECT_SQL);
  } catch {
    return fail("query_failed");
  }

  return normalizeAuthoritativeRows(raw);
}

function normalizeAuthoritativeRows(
  raw: unknown
): BlogArticleInventoryPreflightResult {
  if (!Array.isArray(raw)) {
    return fail("invalid_result_shape");
  }

  if (raw.length > MAX_BLOG_MATCH_INVENTORY) {
    return fail("inventory_overflow");
  }

  const rows: BlogMatchInventoryRow[] = [];
  const seen = new Set<number>();

  for (const item of raw) {
    const parsed = parseInventoryRow(item);
    if (!parsed.ok) return fail("malformed_row");
    if (seen.has(parsed.value.id)) return fail("duplicate_entity_id");
    seen.add(parsed.value.id);
    rows.push(parsed.value);
  }

  // Defensive completeness: array holes / sparse results are incomplete.
  if (Object.keys(raw).length !== raw.length) {
    return fail("incomplete_inventory");
  }

  return {
    ok: true,
    authoritativeQuerySuccess: true,
    rows,
    count: rows.length,
  };
}
