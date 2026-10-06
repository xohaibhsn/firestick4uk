/**
 * Pages Router mutation handlers do not have the App Router static-generation
 * store required by `revalidateTag` in this production architecture.
 * Call sites remain so mutations still document which caches they affect;
 * freshness is TTL-only until a supported invalidation path exists.
 */

/**
 * TTL-only compatibility shim; sitemap refresh bound is 300 seconds.
 * No Next cache API call, no log, no throw, no DB work.
 */
export function invalidateSitemapCache(): void {
  // no-op — Pages Router lacks the static-generation store for revalidateTag
}

/**
 * TTL-only compatibility shim; favicon server lookup refresh bound is ≤300 seconds.
 * No Next cache API call, no log, no throw, no DB work.
 */
export function invalidateFaviconCache(): void {
  // no-op — Pages Router lacks the static-generation store for revalidateTag
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
