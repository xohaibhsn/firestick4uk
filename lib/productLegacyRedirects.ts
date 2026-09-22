/**
 * Narrow Product 8 legacy slug map for Phase 20D.
 * Redirects activate ONLY when the target DB slug exists on an active product.
 * Do not hardcode prices/names — routing stays DB-driven.
 */

export const PRODUCT8_CANONICAL_SLUG = "3-years-subscription";

/** Evidenced historical/current sources → final canonical target. */
export const PRODUCT8_LEGACY_SLUG_REDIRECTS: Readonly<Record<string, string>> = {
  "world-cup-offer-3-years": PRODUCT8_CANONICAL_SLUG,
  "3-years-season-pass": PRODUCT8_CANONICAL_SLUG,
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
  const target = PRODUCT8_LEGACY_SLUG_REDIRECTS[s];
  if (!target) return null;
  const t = normalizeProductSlug(target);
  if (!t || t === s) return null;
  return t;
}
