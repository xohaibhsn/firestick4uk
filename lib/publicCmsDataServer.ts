import { revalidateTag, unstable_cache } from "next/cache";
import pool from "@/lib/db";

/** Shared tag so a site_content write expires both public payloads together. */
export const PUBLIC_CMS_CACHE_TAG = "public-cms";
export const PUBLIC_CMS_CACHE_TTL_SECONDS = 300;

export type PublicSiteContentAllMap = Record<string, string>;

export type PublicVisibleSection = {
  key: string;
  label: string;
  page: string;
  order: number;
  visible: boolean;
  data: unknown;
};

/**
 * Same SELECT and key mapping as GET /api/site-content?page=all.
 * Throws on query failure so a DB error is not stored as an empty map.
 */
async function loadPublicSiteContentAll(): Promise<PublicSiteContentAllMap> {
  const [rows]: any = await pool.query(
    "SELECT content_key, content_value, content_type, page_name, label FROM site_content ORDER BY id ASC"
  );
  const result: PublicSiteContentAllMap = {};
  for (const r of rows || []) result[r.content_key] = r.content_value || "";
  return result;
}

/**
 * Same SELECT and mapping as a public GET /api/sections (visible JSON rows only).
 * Throws on query failure so a DB error is not stored as an empty list.
 */
async function loadPublicVisibleSections(page: string): Promise<PublicVisibleSection[]> {
  const [rows]: any = await pool.query(
    'SELECT content_key,content_value,content_type,page_name,label,section_order,is_visible FROM site_content WHERE page_name=? AND content_type="json" AND is_visible=1 ORDER BY section_order ASC',
    [page]
  );
  return (Array.isArray(rows) ? rows : []).map((r: any) => ({
    key: r.content_key,
    label: r.label,
    page: r.page_name,
    order: r.section_order,
    visible: !!r.is_visible,
    data: (() => {
      try {
        return JSON.parse(r.content_value);
      } catch {
        return {};
      }
    })(),
  }));
}

export const getCachedPublicSiteContentAll = unstable_cache(
  loadPublicSiteContentAll,
  ["public-site-content-all-v1"],
  {
    revalidate: PUBLIC_CMS_CACHE_TTL_SECONDS,
    tags: [PUBLIC_CMS_CACHE_TAG],
  }
);

export const getCachedPublicVisibleSections = unstable_cache(
  loadPublicVisibleSections,
  ["public-sections-visible-v1"],
  {
    revalidate: PUBLIC_CMS_CACHE_TTL_SECONDS,
    tags: [PUBLIC_CMS_CACHE_TAG],
  }
);

/**
 * Immediate expiry. Next 16 treats `{ expire: 0 }` as expired now, so the next
 * public read recomputes instead of serving the previous value.
 * Swallows errors so a committed CMS write is not turned into an API 500.
 */
export function invalidatePublicCmsCache(): void {
  try {
    revalidateTag(PUBLIC_CMS_CACHE_TAG, { expire: 0 });
  } catch (err) {
    console.error("[cms] public cache invalidate failed:", err);
  }
}
