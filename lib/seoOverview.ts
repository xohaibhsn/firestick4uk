/**
 * Pure SEO overview derivations (no DB, no HTTP).
 * Used by /api/admin-seo-overview and unit tests.
 */

export const SEO_SITE_ORIGIN = "https://firestick4uk.com";

export type SeoHealth =
  | "OK"
  | "Review"
  | "Missing"
  | "Inactive"
  | "Not in sitemap"
  | "Draft"
  | "Auto"
  | "Noindex"
  | "Redirect";

export function stripHtml(html: string): string {
  return String(html || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function productPublicUrl(slug: string): string {
  const s = String(slug || "")
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, "");
  return `${SEO_SITE_ORIGIN}/products/${s}`;
}

export function blogPublicUrl(slug: string): string {
  const s = String(slug || "")
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, "");
  return `${SEO_SITE_ORIGIN}/blog/${s}`;
}

/**
 * Mirrors app/products/[slug]/page.tsx productPageTitle().
 * Keep in sync — Overview is read-only parity, not a second algorithm.
 */
export function productEffectiveTitle(
  seoTitle: string | null | undefined,
  name: string | null | undefined
): string {
  const base = String(seoTitle || name || "")
    .trim()
    .replace(/\s+/g, " ");
  if (!base) return "Firestick4UK";
  if (/\|\s*Firestick4UK\s*$/i.test(base)) return base;
  if (/Firestick4UK\s*$/i.test(base) && !/\|\s*Firestick4UK\s*$/i.test(base)) {
    return base;
  }
  return `${base} | Firestick4UK`;
}

/**
 * Mirrors app/products/[slug]/page.tsx productMetaDescription() fallback chain.
 */
export function productEffectiveDescription(opts: {
  meta_description?: string | null;
  short_description?: string | null;
  description?: string | null;
  full_description?: string | null;
}): string {
  const raw =
    opts.meta_description ||
    opts.short_description ||
    opts.description ||
    opts.full_description ||
    "";
  return stripHtml(String(raw)).slice(0, 320);
}

export type ProductOgSource = "Custom OG" | "Product image fallback" | "Global fallback";

export function productOgSource(
  ogImage: string | null | undefined,
  image: string | null | undefined
): ProductOgSource {
  if (String(ogImage || "").trim()) return "Custom OG";
  if (String(image || "").trim()) return "Product image fallback";
  return "Global fallback";
}

export function deriveProductHealth(opts: {
  name: string;
  slug: string;
  active: boolean;
  seo_title?: string | null;
  meta_description?: string | null;
  short_description?: string | null;
  description?: string | null;
  full_description?: string | null;
  image?: string | null;
  og_image?: string | null;
}): { flags: SeoHealth[]; inSitemap: boolean; title: string; description: string; canonical: string; ogSource: ProductOgSource } {
  const slug = String(opts.slug || "")
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, "");
  const active = !!opts.active;
  const title = productEffectiveTitle(opts.seo_title, opts.name);
  const description = productEffectiveDescription({
    meta_description: opts.meta_description,
    short_description: opts.short_description,
    description: opts.description,
    full_description: opts.full_description,
  });
  const canonical = slug ? productPublicUrl(slug) : "";
  const ogSource = productOgSource(opts.og_image, opts.image);
  const inSitemap = active && !!slug;
  const flags: SeoHealth[] = [];

  if (!active) flags.push("Inactive");
  if (!slug) flags.push("Missing");
  if (!title) flags.push("Missing");
  else if (title.length > 70) flags.push("Review");
  if (!description) flags.push("Missing");
  else if (description.length > 180) flags.push("Review");
  if (!inSitemap) flags.push("Not in sitemap");
  if (ogSource === "Global fallback") flags.push("Review");

  const nameSlug = String(opts.name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug && nameSlug && slug !== nameSlug) flags.push("Review");

  if (flags.length === 0) flags.push("OK");
  return { flags: [...new Set(flags)], inSitemap, title, description, canonical, ogSource };
}

export function blogEffectiveTitle(
  metaTitle: string | null | undefined,
  title: string | null | undefined
): string {
  const base = String(metaTitle || title || "").trim();
  if (!base) return "";
  return `${base} | Firestick4UK Blog`;
}

export function blogEffectiveDescription(opts: {
  meta_description?: string | null;
  excerpt?: string | null;
}): string {
  return stripHtml(String(opts.meta_description || opts.excerpt || "")).slice(0, 320);
}

export type BlogCanonicalHealth = {
  label: SeoHealth | "Auto" | "OK";
  detail: string;
  effectiveCanonical: string;
};

export function analyzeBlogCanonical(
  storedCanonical: string | null | undefined,
  slug: string
): BlogCanonicalHealth {
  const auto = blogPublicUrl(slug);
  const raw = String(storedCanonical || "").trim();
  if (!raw) {
    return { label: "Auto", detail: "Blank — public page uses auto canonical", effectiveCanonical: auto };
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return {
      label: "Review",
      detail: "Malformed canonical URL",
      effectiveCanonical: raw,
    };
  }

  if (url.protocol === "http:") {
    return { label: "Review", detail: "Canonical uses http://", effectiveCanonical: raw };
  }
  if (url.protocol !== "https:") {
    return { label: "Review", detail: "Canonical protocol is not https", effectiveCanonical: raw };
  }
  if (url.hostname.toLowerCase() !== "firestick4uk.com") {
    return {
      label: "Review",
      detail: `Canonical host is ${url.hostname}`,
      effectiveCanonical: raw,
    };
  }

  const expectedPath = `/blog/${String(slug || "")
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, "")}`;
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (path !== expectedPath) {
    return {
      label: "Review",
      detail: "Canonical path does not match current blog slug",
      effectiveCanonical: raw,
    };
  }

  const normalizedStored = raw.replace(/\/+$/, "").toLowerCase();
  const normalizedAuto = auto.replace(/\/+$/, "").toLowerCase();
  if (normalizedStored === normalizedAuto) {
    return { label: "OK", detail: "Matches expected blog URL", effectiveCanonical: raw };
  }

  return { label: "OK", detail: "On-site HTTPS canonical", effectiveCanonical: raw };
}

export function deriveBlogHealth(opts: {
  title: string;
  slug: string;
  status: string;
  active: boolean;
  meta_title?: string | null;
  meta_description?: string | null;
  excerpt?: string | null;
  featured_image?: string | null;
  canonical_url?: string | null;
}): {
  flags: SeoHealth[];
  inSitemap: boolean;
  title: string;
  description: string;
  canonicalHealth: BlogCanonicalHealth;
  published: boolean;
} {
  const slug = String(opts.slug || "")
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, "");
  const published =
    String(opts.status || "").toLowerCase() === "published" && !!opts.active && !!slug;
  const title = blogEffectiveTitle(opts.meta_title, opts.title);
  const description = blogEffectiveDescription(opts);
  const canonicalHealth = analyzeBlogCanonical(opts.canonical_url, slug);
  const inSitemap = published;
  const flags: SeoHealth[] = [];

  if (String(opts.status || "").toLowerCase() !== "published") flags.push("Draft");
  if (!opts.active) flags.push("Inactive");
  if (!slug) flags.push("Missing");
  if (!title) flags.push("Missing");
  else if (title.length > 75) flags.push("Review");
  if (!description) flags.push("Missing");
  else if (description.length > 180) flags.push("Review");
  if (!String(opts.featured_image || "").trim()) flags.push("Review");
  if (canonicalHealth.label === "Review") flags.push("Review");
  if (!inSitemap) flags.push("Not in sitemap");

  if (flags.length === 0) flags.push("OK");
  return {
    flags: [...new Set(flags)],
    inSitemap,
    title,
    description,
    canonicalHealth,
    published,
  };
}

export type KeyPageFact = {
  url: string;
  path: string;
  indexState: "index" | "noindex" | "redirect" | "robots-disallow";
  canonical: string;
  inSitemap: boolean;
  source: "CMS" | "DB" | "Generated" | "Hardcoded";
  note?: string;
};

/** Static technical matrix — no live crawling. Subscription URL injected by API. */
export function buildKeyPageFacts(subscriptionUrl: string): KeyPageFact[] {
  const sub = String(subscriptionUrl || `${SEO_SITE_ORIGIN}/iptv-subscriptions-uk`).replace(
    /\/+$/,
    ""
  );
  return [
    { path: "/", url: SEO_SITE_ORIGIN, indexState: "index", canonical: SEO_SITE_ORIGIN, inSitemap: true, source: "CMS" },
    { path: "/products", url: `${SEO_SITE_ORIGIN}/products`, indexState: "index", canonical: `${SEO_SITE_ORIGIN}/products`, inSitemap: true, source: "Hardcoded" },
    { path: "/blog", url: `${SEO_SITE_ORIGIN}/blog`, indexState: "index", canonical: `${SEO_SITE_ORIGIN}/blog`, inSitemap: true, source: "Hardcoded" },
    { path: "/faq", url: `${SEO_SITE_ORIGIN}/faq`, indexState: "index", canonical: `${SEO_SITE_ORIGIN}/faq`, inSitemap: true, source: "Hardcoded" },
    { path: "/contact", url: `${SEO_SITE_ORIGIN}/contact`, indexState: "index", canonical: `${SEO_SITE_ORIGIN}/contact`, inSitemap: true, source: "Hardcoded" },
    { path: "/about", url: `${SEO_SITE_ORIGIN}/about`, indexState: "index", canonical: `${SEO_SITE_ORIGIN}/about`, inSitemap: true, source: "Hardcoded" },
    { path: "/order-tracking", url: `${SEO_SITE_ORIGIN}/order-tracking`, indexState: "index", canonical: `${SEO_SITE_ORIGIN}/order-tracking`, inSitemap: true, source: "Hardcoded", note: "GSC verification required" },
    { path: "subscription", url: sub, indexState: "index", canonical: sub, inSitemap: true, source: "CMS" },
    { path: "/terms", url: `${SEO_SITE_ORIGIN}/terms`, indexState: "index", canonical: `${SEO_SITE_ORIGIN}/terms`, inSitemap: true, source: "Hardcoded" },
    { path: "/privacy-policy", url: `${SEO_SITE_ORIGIN}/privacy-policy`, indexState: "index", canonical: `${SEO_SITE_ORIGIN}/privacy-policy`, inSitemap: true, source: "Hardcoded" },
    { path: "/refund-policy", url: `${SEO_SITE_ORIGIN}/refund-policy`, indexState: "index", canonical: `${SEO_SITE_ORIGIN}/refund-policy`, inSitemap: true, source: "Hardcoded" },
    { path: "/cart", url: `${SEO_SITE_ORIGIN}/cart`, indexState: "noindex", canonical: `${SEO_SITE_ORIGIN}/cart`, inSitemap: false, source: "Hardcoded" },
    { path: "/cart/success", url: `${SEO_SITE_ORIGIN}/cart/success`, indexState: "noindex", canonical: `${SEO_SITE_ORIGIN}/cart/success`, inSitemap: false, source: "Hardcoded" },
    { path: "/sidhu", url: `${SEO_SITE_ORIGIN}/sidhu`, indexState: "robots-disallow", canonical: `${SEO_SITE_ORIGIN}/sidhu`, inSitemap: false, source: "Hardcoded", note: "robots Disallow + meta noindex" },
    { path: "/A1iptvDownload", url: `${SEO_SITE_ORIGIN}/A1iptvDownload`, indexState: "noindex", canonical: `${SEO_SITE_ORIGIN}/A1iptvDownload`, inSitemap: false, source: "Hardcoded" },
    { path: "/5GNextDownload", url: `${SEO_SITE_ORIGIN}/5GNextDownload`, indexState: "noindex", canonical: `${SEO_SITE_ORIGIN}/5GNextDownload`, inSitemap: false, source: "Hardcoded" },
    { path: "/player", url: `${SEO_SITE_ORIGIN}/player`, indexState: "noindex", canonical: `${SEO_SITE_ORIGIN}/player`, inSitemap: false, source: "Hardcoded" },
    { path: "/admin", url: `${SEO_SITE_ORIGIN}/admin`, indexState: "redirect", canonical: SEO_SITE_ORIGIN, inSitemap: false, source: "Hardcoded", note: "Server redirect → /" },
    { path: "/erp", url: `${SEO_SITE_ORIGIN}/erp`, indexState: "robots-disallow", canonical: SEO_SITE_ORIGIN, inSitemap: false, source: "Hardcoded", note: "ERP — internal / robots blocked / frozen" },
  ];
}

export type VerificationItem = {
  url: string;
  label: string;
  note: string;
};

export function buildProduct8VerificationItems(): VerificationItem[] {
  const note = "Verify in GSC — technical state only; no Google status claimed";
  return [
    { url: productPublicUrl("3-years-subscription"), label: "Product 8 current", note },
    { url: productPublicUrl("world-cup-offer-3-years"), label: "Product 8 legacy", note },
    { url: productPublicUrl("3-years-season-pass"), label: "Product 8 legacy", note },
    { url: productPublicUrl("b1g-2-years-plan"), label: "Product 9 current", note },
    { url: productPublicUrl("2-years-subscription"), label: "Product 9 name alias", note },
  ];
}

export function buildContentVerificationItems(subscriptionUrl: string): VerificationItem[] {
  const note = "Verify in GSC — technical state only; no Google status claimed";
  const sub = String(subscriptionUrl || `${SEO_SITE_ORIGIN}/iptv-subscriptions-uk`).replace(
    /\/+$/,
    ""
  );
  return [
    { url: SEO_SITE_ORIGIN, label: "Homepage", note },
    { url: `${SEO_SITE_ORIGIN}/products`, label: "Products listing", note },
    { url: `${SEO_SITE_ORIGIN}/blog`, label: "Blog listing", note },
    { url: `${SEO_SITE_ORIGIN}/faq`, label: "FAQ", note },
    { url: sub, label: "Subscription", note },
    { url: `${SEO_SITE_ORIGIN}/order-tracking`, label: "Order tracking", note },
    { url: `${SEO_SITE_ORIGIN}/terms`, label: "Terms", note },
    { url: `${SEO_SITE_ORIGIN}/privacy-policy`, label: "Privacy", note },
    { url: `${SEO_SITE_ORIGIN}/refund-policy`, label: "Refund", note },
  ];
}
