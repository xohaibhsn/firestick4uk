import { unstable_cache } from "next/cache";
import pool from "@/lib/db";

/**
 * Pages Router mutation handlers do not have the App Router static-generation
 * store required by `revalidateTag` in this production architecture.
 * Public CMS freshness is TTL-only (approximately 60 seconds max staleness).
 */
export const PUBLIC_CMS_CACHE_TTL_SECONDS = 60;

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
  }
);

export const getCachedPublicVisibleSections = unstable_cache(
  loadPublicVisibleSections,
  ["public-sections-visible-v1"],
  {
    revalidate: PUBLIC_CMS_CACHE_TTL_SECONDS,
  }
);

/**
 * Pages mutation compatibility: public CMS cache is TTL-only; maximum server
 * staleness approximately 60 seconds.
 * No Next cache API call, no log, no throw, no DB work.
 */
export function invalidatePublicCmsCache(): void {
  // no-op — Pages Router lacks the static-generation store for revalidateTag
}
