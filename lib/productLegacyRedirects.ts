/**
 * Narrow Product 8 / Product 9 legacy slug maps.
 * Redirects activate ONLY when the target DB slug exists on an active product.
 * Do not hardcode prices/names — routing stays DB-driven.
 *
 * Product 9 alias `2-years-subscription` is code-owned (see CODE_OWNED_REDIRECT_SOURCES).
 * It must not depend on the current display-name slugify, so renaming the product
 * for brand consistency cannot orphan the historical alias.
 */

export const PRODUCT8_CANONICAL_SLUG = "3-years-subscription";
export const PRODUCT9_CANONICAL_SLUG = "b1g-2-years-plan";

/** Evidenced historical/current sources → final canonical target. */
export const PRODUCT8_LEGACY_SLUG_REDIRECTS: Readonly<Record<string, string>> = {
  "world-cup-offer-3-years": PRODUCT8_CANONICAL_SLUG,
  "3-years-season-pass": PRODUCT8_CANONICAL_SLUG,
};

/** Historical name-derived Product 9 alias → canonical Product 9 slug. */
export const PRODUCT9_LEGACY_SLUG_REDIRECTS: Readonly<Record<string, string>> = {
  "2-years-subscription": PRODUCT9_CANONICAL_SLUG,
};

export function normalizeProductSlug(slug: string): string {
  return String(slug || "")
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, "");
}

/**
 * If `requested` is a known legacy source AND `targetExists` is true,
 * return the canonical target. Otherwise null (continue normal resolution).
 * Never returns a self-redirect.
 */
export function resolveProductLegacyRedirect(
  requested: string,
  targetExists: boolean
): string | null {
  const s = normalizeProductSlug(requested);
  if (!s || !targetExists) return null;
  const target =
    PRODUCT8_LEGACY_SLUG_REDIRECTS[s] || PRODUCT9_LEGACY_SLUG_REDIRECTS[s];
  if (!target) return null;
  const t = normalizeProductSlug(target);
  if (!t || t === s) return null;
  return t;
}
