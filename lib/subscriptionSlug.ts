export const DEFAULT_SUBSCRIPTION_SLUG = "iptv-subscriptions-uk";
export const SITE_ORIGIN = "https://firestick4uk.com";

/** Single-segment App Router / system paths that must never become the subscription slug. */
export const RESERVED_SUBSCRIPTION_SLUGS = new Set(
  [
    "",
    "products",
    "blog",
    "cart",
    "contact",
    "about",
    "faq",
    "order-tracking",
    "privacy-policy",
    "terms",
    "refund-policy",
    "sidhu",
    "erp",
    "api",
    "admin",
    "player",
    "5gnextdownload",
    "a1iptvdownload",
    "sitemap.xml",
    "robots.txt",
    "favicon.ico",
    "downloads",
    "_next",
    "subscription-landing",
  ].map((s) => s.toLowerCase())
);

export function normalizeSubscriptionSlug(input: string): string {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function subscriptionPagePath(slug: string): string {
  const s = normalizeSubscriptionSlug(slug) || DEFAULT_SUBSCRIPTION_SLUG;
  // App Router default is no trailing slash; keep redirects loop-free.
  return `/${s}`;
}

export function subscriptionPageUrl(slug: string): string {
  const s = normalizeSubscriptionSlug(slug) || DEFAULT_SUBSCRIPTION_SLUG;
  // Match the live App Router 200 URL (no trailing slash).
  return `${SITE_ORIGIN}/${s}`;
}

export type SubscriptionSlugValidation =
  | { ok: true; slug: string }
  | { ok: false; slug: string; error: string };

export function validateSubscriptionSlug(input: string): SubscriptionSlugValidation {
  const slug = normalizeSubscriptionSlug(input);
  if (!slug) {
    return { ok: false, slug: "", error: "Page slug cannot be empty." };
  }
  if (slug.includes("/")) {
    return { ok: false, slug, error: "Use a single URL segment only (no nested paths)." };
  }
  if (RESERVED_SUBSCRIPTION_SLUGS.has(slug)) {
    return {
      ok: false,
      slug,
      error: `"${slug}" is reserved by an existing site route. Choose a different slug.`,
    };
  }
  return { ok: true, slug };
}

function normalizeUrlForCompare(url: string): string {
  return String(url || "")
    .trim()
    .replace(/\/+$/, "")
    .toLowerCase();
}

/** Auto canonical from active slug, unless a genuine custom override is set. */
export function resolveSubscriptionCanonical(
  activeSlug: string,
  customCanonical: string | undefined,
  previousSlug?: string
): string {
  const auto = subscriptionPageUrl(activeSlug);
  const custom = String(customCanonical || "").trim();
  if (!custom) return auto;

  // Known autos include current + legacy trailing-slash forms (CMS may still
  // store older slash URLs). Compare without trailing slash so those resolve
  // to the live no-slash preferred URL without treating them as custom.
  const knownAutos = [
    auto,
    subscriptionPageUrl(DEFAULT_SUBSCRIPTION_SLUG),
    previousSlug ? subscriptionPageUrl(previousSlug) : "",
  ]
    .filter(Boolean)
    .map(normalizeUrlForCompare);

  if (knownAutos.includes(normalizeUrlForCompare(custom))) {
    return auto;
  }

  return custom;
}

export function isAutoSubscriptionCanonical(
  canonical: string,
  activeSlug: string,
  previousSlug?: string
): boolean {
  const custom = String(canonical || "").trim();
  if (!custom) return true;
  return (
    resolveSubscriptionCanonical(activeSlug, custom, previousSlug) ===
    subscriptionPageUrl(activeSlug)
  );
}
