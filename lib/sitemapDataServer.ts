import { unstable_cache } from "next/cache";
import pool from "@/lib/db";
import { getSubscriptionSlugConfig } from "@/lib/subscriptionSlugServer";

/**
 * Pages Router mutation handlers do not have the App Router static-generation
 * store required by `revalidateTag` in this production architecture.
 * Sitemap freshness is TTL-only (300 seconds).
 */
export const SITEMAP_CACHE_TTL_SECONDS = 300;

export type SitemapDynamicData = {
  subscriptionUrl: string;
  products: Array<{ slug: string; lastModified: string | null }>;
  posts: Array<{ slug: string; lastModified: string | null }>;
};

const DEFAULT_SUBSCRIPTION_URL = "https://firestick4uk.com/iptv-subscriptions-uk";

export function emptySitemapDynamicData(): SitemapDynamicData {
  return {
    subscriptionUrl: DEFAULT_SUBSCRIPTION_URL,
    products: [],
    posts: [],
  };
}

function normalizeSlug(raw: unknown): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, "");
}

/** Prefer factual created_at; never invent request-time dates. */
export function factualTimestamp(value: unknown): string | null {
  if (value == null || value === "") return null;
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * Convert a cached ISO timestamp into a Date safe for Next sitemap XML
 * serialization. Invalid values must not become Invalid Date objects —
 * resolveSitemap calls toISOString() on Date lastModified and throws RangeError.
 */
export function parseFactualLastModified(iso: string | null): Date | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
}

/**
 * Fail-closed dynamic-data resolution used by the sitemap route.
 * Primary may throw outside DB catches (e.g. unstable_cache incrementalCache
 * invariant). Secondary is the uncached loader. Final fallback is static-only.
 */
export async function resolveSitemapDynamicDataWithFallback(
  primary: () => Promise<SitemapDynamicData>,
  secondary: () => Promise<SitemapDynamicData>,
  fallback: () => SitemapDynamicData = emptySitemapDynamicData
): Promise<SitemapDynamicData> {
  try {
    return await primary();
  } catch {
    try {
      return await secondary();
    } catch {
      return fallback();
    }
  }
}

export async function loadSitemapDynamicData(): Promise<SitemapDynamicData> {
  let subscriptionUrl = DEFAULT_SUBSCRIPTION_URL;

  try {
    const route = await getSubscriptionSlugConfig();
    subscriptionUrl = route.pageUrl;
  } catch {
    // keep default
  }

  const products: SitemapDynamicData["products"] = [];
  const posts: SitemapDynamicData["posts"] = [];

  try {
    // Live schema has created_at only — do not SELECT a non-existent column.
    const [rows]: any = await pool.query(
      `SELECT slug, created_at
       FROM products
       WHERE active = 1
         AND slug IS NOT NULL AND TRIM(slug) <> ''`
    );
    for (const p of Array.isArray(rows) ? rows : []) {
      const slug = normalizeSlug(p.slug);
      if (!slug) continue;
      products.push({
        slug,
        lastModified: factualTimestamp(p.created_at),
      });
    }
  } catch {
    // empty products on failure — static URLs still emitted by caller
  }

  try {
    const [rows]: any = await pool.query(
      `SELECT slug, created_at
       FROM blog_posts
       WHERE status = 'published' AND active = 1
         AND slug IS NOT NULL AND slug != ''`
    );
    for (const p of Array.isArray(rows) ? rows : []) {
      const slug = normalizeSlug(p.slug);
      if (!slug) continue;
      posts.push({
        slug,
        lastModified: factualTimestamp(p.created_at),
      });
    }
  } catch {
    // empty posts on failure
  }

  return { subscriptionUrl, products, posts };
}

/**
 * Cached DB-backed sitemap payload. Route stays force-dynamic so build never
 * permanently bakes an empty product/blog list; this only memoizes DB work.
 * Cache key v2 busts any prior corrupt/incompatible entries.
 */
export const getCachedSitemapDynamicData = unstable_cache(
  loadSitemapDynamicData,
  ["sitemap-dynamic-data-v2"],
  {
    revalidate: SITEMAP_CACHE_TTL_SECONDS,
  }
);

/** Prefer cache; never let cache/runtime invariants take the sitemap down. */
export async function getSitemapDynamicDataSafe(): Promise<SitemapDynamicData> {
  return resolveSitemapDynamicDataWithFallback(
    () => getCachedSitemapDynamicData(),
    () => loadSitemapDynamicData()
  );
}
