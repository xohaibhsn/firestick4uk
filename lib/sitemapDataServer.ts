import { unstable_cache } from "next/cache";
import pool from "@/lib/db";
import { getSubscriptionSlugConfig } from "@/lib/subscriptionSlugServer";

export const SITEMAP_CACHE_TAG = "sitemap";

/** Conservative fallback TTL (seconds). Mutations also call revalidateTag. */
export const SITEMAP_CACHE_TTL_SECONDS = 300;

export type SitemapDynamicData = {
  subscriptionUrl: string;
  products: Array<{ slug: string; lastModified: string | null }>;
  posts: Array<{ slug: string; lastModified: string | null }>;
};

function normalizeSlug(raw: unknown): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, "");
}

/** Prefer factual created_at; never invent request-time dates. */
function factualTimestamp(value: unknown): string | null {
  if (value == null || value === "") return null;
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

async function loadSitemapDynamicData(): Promise<SitemapDynamicData> {
  const baseUrl = "https://firestick4uk.com";
  let subscriptionUrl = `${baseUrl}/iptv-subscriptions-uk`;

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
 */
export const getCachedSitemapDynamicData = unstable_cache(
  loadSitemapDynamicData,
  ["sitemap-dynamic-data-v1"],
  {
    revalidate: SITEMAP_CACHE_TTL_SECONDS,
    tags: [SITEMAP_CACHE_TAG],
  }
);
