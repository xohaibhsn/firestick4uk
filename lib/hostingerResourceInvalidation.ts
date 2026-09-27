import { revalidateTag } from "next/cache";
import { SITEMAP_CACHE_TAG } from "@/lib/sitemapDataServer";
import { FAVICON_CACHE_TAG } from "@/lib/faviconUrlServer";

/**
 * Safe post-commit cache purge. Never throws to callers — DB commit already won.
 * Next 16 requires a cacheLife profile on revalidateTag (use "max").
 */
export function invalidateSitemapCache(): void {
  try {
    revalidateTag(SITEMAP_CACHE_TAG, "max");
  } catch (err) {
    console.error("[h5] sitemap cache invalidate failed:", err);
  }
}

export function invalidateFaviconCache(): void {
  try {
    revalidateTag(FAVICON_CACHE_TAG, "max");
  } catch (err) {
    console.error("[h5] favicon cache invalidate failed:", err);
  }
}

const SUBSCRIPTION_SITEMAP_KEYS = new Set([
  "subscription_slug",
  "subscription_previous_slug",
  "subscription_canonical",
]);

export function siteContentKeysAffectSitemap(keys: string[]): boolean {
  return keys.some((k) => SUBSCRIPTION_SITEMAP_KEYS.has(String(k || "").trim()));
}

export function siteContentKeysAffectFavicon(keys: string[]): boolean {
  return keys.some((k) => String(k || "").trim() === "favicon_url");
}
