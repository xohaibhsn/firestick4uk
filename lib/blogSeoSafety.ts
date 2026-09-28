/**
 * Pure blog URL/canonical safety helpers for JSEO-B3.
 * No DB, no HTTP, no side effects.
 */

export const BLOG_SITE_ORIGIN = "https://firestick4uk.com";

export function normalizeBlogSlug(slug: string | null | undefined): string {
  return String(slug || "")
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, "");
}

/** Canonical model: https://firestick4uk.com/blog/{slug} (no trailing slash). */
export function expectedBlogCanonical(slug: string | null | undefined): string {
  const s = normalizeBlogSlug(slug);
  return `${BLOG_SITE_ORIGIN}/blog/${s}`;
}

export function isAutoCanonicalForSlug(
  canonical: string | null | undefined,
  slug: string | null | undefined
): boolean {
  const raw = String(canonical || "").trim();
  if (!raw) return true;
  const result = normalizeBlogCanonicalInput(raw, slug);
  return result.ok && result.canonical === expectedBlogCanonical(slug);
}

export type BlogCanonicalResult =
  | { ok: true; canonical: string }
  | { ok: false; error: string };

/**
 * Blank → expected self canonical.
 * Exact HTTPS Firestick4UK blog URL for slug (optional trailing slash) → expected.
 * Everything else → reject.
 */
export function normalizeBlogCanonicalInput(
  input: string | null | undefined,
  slug: string | null | undefined
): BlogCanonicalResult {
  const expected = expectedBlogCanonical(slug);
  const raw = String(input ?? "").trim();
  if (!raw) return { ok: true, canonical: expected };

  if (!/^https?:\/\//i.test(raw)) {
    return {
      ok: false,
      error: "Canonical must be the absolute Firestick4UK HTTPS blog URL for this slug.",
    };
  }

  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, error: "Canonical URL is malformed." };
  }

  if (u.protocol !== "https:") {
    return { ok: false, error: "Canonical must use HTTPS." };
  }
  if (u.hostname !== "firestick4uk.com") {
    return {
      ok: false,
      error: "Canonical must use the firestick4uk.com host (no www or external hosts).",
    };
  }
  if (u.port && u.port !== "443") {
    return { ok: false, error: "Canonical must not include an unexpected port." };
  }
  if (u.username || u.password) {
    return { ok: false, error: "Canonical must not include credentials." };
  }
  if (u.search) {
    return { ok: false, error: "Canonical must not include query strings." };
  }
  if (u.hash) {
    return { ok: false, error: "Canonical must not include hash fragments." };
  }

  const path = u.pathname.replace(/\/+$/, "") || "";
  const expectedPath = `/blog/${normalizeBlogSlug(slug)}`;
  if (!normalizeBlogSlug(slug) || path !== expectedPath) {
    return {
      ok: false,
      error: "Canonical must match the current Firestick4UK blog URL for this slug.",
    };
  }

  return { ok: true, canonical: expected };
}

/**
 * Resolve canonical for PUT after finalSlug is known.
 * - Explicit blank → expected for final slug
 * - Explicit value → normalize/validate for final slug
 * - Omitted + no slug change → preserve current (even if historically odd)
 * - Omitted + allowed draft slug change → align if blank/old-auto; else must be valid for final
 */
export function resolveBlogCanonicalForPut(opts: {
  bodyHasCanonical: boolean;
  suppliedCanonical: string | null | undefined;
  currentCanonical: string | null | undefined;
  oldSlug: string | null | undefined;
  finalSlug: string | null | undefined;
  slugChanged: boolean;
}): BlogCanonicalResult {
  const finalExpected = expectedBlogCanonical(opts.finalSlug);

  if (opts.bodyHasCanonical) {
    return normalizeBlogCanonicalInput(opts.suppliedCanonical, opts.finalSlug);
  }

  if (!opts.slugChanged) {
    return {
      ok: true,
      canonical: String(opts.currentCanonical || "").trim() || finalExpected,
    };
  }

  const current = String(opts.currentCanonical || "").trim();
  if (!current || isAutoCanonicalForSlug(current, opts.oldSlug)) {
    return { ok: true, canonical: finalExpected };
  }

  return normalizeBlogCanonicalInput(current, opts.finalSlug);
}

export const PRODUCT_SLUG_PROTECTED_MESSAGE =
  "Existing product URL slug is protected. Use a controlled SEO migration with a permanent redirect before changing this URL.";

export const BLOG_PUBLISHED_SLUG_PROTECTED_MESSAGE =
  "Published blog URL slug is protected. Use a controlled SEO migration with a permanent redirect before changing this URL.";
