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
    { path: "/admin", url: `${SEO_SITE_ORIGIN}/admin`, indexState: "redirect", canonical: SEO_SITE_ORIGIN, inSitemap: false, source: "Hardcoded", note: "Server redirect → /" },
  ];
}

export type VerificationGroup = "priority-migrations" | "core-content";

export type VerificationKind = "current" | "legacy-redirect" | "content";

/** Curated GSC queue row — Firestick4UK technical expectations only; never Google status. */
export type VerificationItem = {
  url: string;
  label: string;
  group: VerificationGroup;
  kind: VerificationKind;
  expectedStatus: 200 | 308 | null;
  expectedCanonical: string | null;
  expectedTarget: string | null;
  inSitemap: boolean | null;
  note: string;
};

export type GscAccountCheck = {
  key: "manual-actions" | "security-issues";
  label: string;
  note: string;
};

export const GSC_VERIFY_NOTE =
  "Verify in GSC — technical state only; no Google status claimed";

export const GSC_ACCOUNT_CHECKS: readonly GscAccountCheck[] = [
  {
    key: "manual-actions",
    label: "Manual Actions",
    note: "Check Google Search Console → Manual Actions. No live Google status is connected.",
  },
  {
    key: "security-issues",
    label: "Security Issues",
    note: "Check Google Search Console → Security Issues. No live Google status is connected.",
  },
] as const;

export const PRODUCT8_CURRENT_SLUG = "3-years-subscription";
export const PRODUCT9_CURRENT_SLUG = "b1g-2-years-plan";
export const PRODUCT9_ALIAS_SLUG = "2-years-subscription";

/**
 * Priority Product 8 / Product 9 migration URLs for manual GSC work.
 * expectedStatus depends on whether the DB target product is active.
 */
export function buildProductMigrationVerificationItems(opts: {
  p8Active: boolean;
  p9Active: boolean;
}): VerificationItem[] {
  const p8Url = productPublicUrl(PRODUCT8_CURRENT_SLUG);
  const p9Url = productPublicUrl(PRODUCT9_CURRENT_SLUG);
  const items: VerificationItem[] = [];

  if (opts.p8Active) {
    items.push({
      url: p8Url,
      label: "Product 8 current",
      group: "priority-migrations",
      kind: "current",
      expectedStatus: 200,
      expectedCanonical: p8Url,
      expectedTarget: null,
      inSitemap: true,
      note: GSC_VERIFY_NOTE,
    });
  } else {
    items.push({
      url: p8Url,
      label: "Product 8 current",
      group: "priority-migrations",
      kind: "current",
      expectedStatus: null,
      expectedCanonical: null,
      expectedTarget: null,
      inSitemap: false,
      note: `${GSC_VERIFY_NOTE}. Technical state requires review — target product inactive or missing.`,
    });
  }

  for (const fromSlug of ["world-cup-offer-3-years", "3-years-season-pass"] as const) {
    const url = productPublicUrl(fromSlug);
    if (opts.p8Active) {
      items.push({
        url,
        label: "Product 8 legacy",
        group: "priority-migrations",
        kind: "legacy-redirect",
        expectedStatus: 308,
        expectedCanonical: p8Url,
        expectedTarget: p8Url,
        inSitemap: false,
        note: GSC_VERIFY_NOTE,
      });
    } else {
      items.push({
        url,
        label: "Product 8 legacy",
        group: "priority-migrations",
        kind: "legacy-redirect",
        expectedStatus: null,
        expectedCanonical: null,
        expectedTarget: p8Url,
        inSitemap: false,
        note: `${GSC_VERIFY_NOTE}. Redirect depends on active target; configured target ${p8Url} is inactive or missing.`,
      });
    }
  }

  if (opts.p9Active) {
    items.push({
      url: p9Url,
      label: "Product 9 current",
      group: "priority-migrations",
      kind: "current",
      expectedStatus: 200,
      expectedCanonical: p9Url,
      expectedTarget: null,
      inSitemap: true,
      note: GSC_VERIFY_NOTE,
    });
  } else {
    items.push({
      url: p9Url,
      label: "Product 9 current",
      group: "priority-migrations",
      kind: "current",
      expectedStatus: null,
      expectedCanonical: null,
      expectedTarget: null,
      inSitemap: false,
      note: `${GSC_VERIFY_NOTE}. Technical state requires review — target product inactive or missing.`,
    });
  }

  const aliasUrl = productPublicUrl(PRODUCT9_ALIAS_SLUG);
  if (opts.p9Active) {
    items.push({
      url: aliasUrl,
      label: "Product 9 alias",
      group: "priority-migrations",
      kind: "legacy-redirect",
      expectedStatus: 308,
      expectedCanonical: p9Url,
      expectedTarget: p9Url,
      inSitemap: false,
      note: GSC_VERIFY_NOTE,
    });
  } else {
    items.push({
      url: aliasUrl,
      label: "Product 9 alias",
      group: "priority-migrations",
      kind: "legacy-redirect",
      expectedStatus: null,
      expectedCanonical: null,
      expectedTarget: p9Url,
      inSitemap: false,
      note: `${GSC_VERIFY_NOTE}. Redirect depends on active target; configured target ${p9Url} is inactive or missing.`,
    });
  }

  return items;
}

export function buildContentVerificationItems(subscriptionUrl: string): VerificationItem[] {
  const sub = String(subscriptionUrl || `${SEO_SITE_ORIGIN}/iptv-subscriptions-uk`).replace(
    /\/+$/,
    ""
  );
  const rows: Array<{ url: string; label: string }> = [
    { url: SEO_SITE_ORIGIN, label: "Homepage" },
    { url: `${SEO_SITE_ORIGIN}/products`, label: "Products listing" },
    { url: `${SEO_SITE_ORIGIN}/blog`, label: "Blog listing" },
    { url: `${SEO_SITE_ORIGIN}/faq`, label: "FAQ" },
    { url: sub, label: "Subscription" },
    { url: `${SEO_SITE_ORIGIN}/order-tracking`, label: "Order tracking" },
    { url: `${SEO_SITE_ORIGIN}/terms`, label: "Terms" },
    { url: `${SEO_SITE_ORIGIN}/privacy-policy`, label: "Privacy" },
    { url: `${SEO_SITE_ORIGIN}/refund-policy`, label: "Refund" },
  ];
  return rows.map((r) => ({
    url: r.url,
    label: r.label,
    group: "core-content" as const,
    kind: "content" as const,
    expectedStatus: 200 as const,
    expectedCanonical: r.url,
    expectedTarget: null,
    inSitemap: true,
    note: GSC_VERIFY_NOTE,
  }));
}

/** Soft ceilings for manual GSC verification brief fields (fail closed if exceeded). */
const MAX_GSC_BRIEF_LABEL_CHARS = 200;
const MAX_GSC_BRIEF_NOTE_CHARS = 1000;
const MAX_GSC_BRIEF_URL_CHARS = 2048;
const MAX_GSC_BRIEF_CHARS = 8000;

export type ManualGscVerificationBriefResult =
  | { ok: true; brief: string }
  | { ok: false; reason: string };

function gscBriefFail(reason: string): ManualGscVerificationBriefResult {
  return { ok: false, reason };
}

/** Reject CR/LF/control chars that could forge brief headings; keep legitimate plain text. */
function isBoundedSafeGscPlainField(
  value: string,
  maxChars: number
): boolean {
  if (typeof value !== "string" || !value.trim() || value.length > maxChars) {
    return false;
  }
  if (/[\x00-\x1f\x7f]/.test(value)) return false;
  if (/[<>]/.test(value)) return false;
  return true;
}

function isSafeSameOriginHttpsUrl(value: string): boolean {
  if (typeof value !== "string" || !value || value.length > MAX_GSC_BRIEF_URL_CHARS) {
    return false;
  }
  if (/[\x00-\x1f\x7f]/.test(value)) return false;
  if (/[<>\s]/.test(value)) return false;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:") return false;
    if (parsed.origin !== SEO_SITE_ORIGIN) return false;
    if (parsed.username || parsed.password) return false;
    return true;
  } catch {
    return false;
  }
}

function formatVerificationGroupLabel(group: VerificationGroup): string {
  if (group === "priority-migrations") return "Priority URL Migrations";
  return "Core Content";
}

function formatVerificationKindLabel(kind: VerificationKind): string {
  if (kind === "legacy-redirect") return "Legacy redirect";
  if (kind === "current") return "Current";
  return "Content";
}

function formatExpectedHttp(status: 200 | 308 | null): string {
  if (status === null) return "Requires technical review / not specified";
  return String(status);
}

function formatOptionalUrl(value: string | null): string {
  if (value === null) return "Not specified";
  return value;
}

function formatSitemapExpectation(value: boolean | null): string {
  if (value === null) return "Not determined";
  return value ? "Yes" : "No";
}

/**
 * Pure formatter for a human-copied manual GSC URL verification brief.
 * Emits Firestick4UK technical expectations only — never Google observations.
 * Fail closed on malformed or unsafe input. No network, storage, or mutation.
 */
export function buildManualGscVerificationBrief(
  item: VerificationItem
): ManualGscVerificationBriefResult {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return gscBriefFail(
      "Verification brief is unavailable: queue row is malformed."
    );
  }

  const group = item.group;
  if (group !== "priority-migrations" && group !== "core-content") {
    return gscBriefFail(
      "Verification brief is unavailable: unknown verification group."
    );
  }

  const kind = item.kind;
  if (kind !== "current" && kind !== "legacy-redirect" && kind !== "content") {
    return gscBriefFail(
      "Verification brief is unavailable: unknown verification type."
    );
  }

  if (
    item.expectedStatus !== null &&
    item.expectedStatus !== 200 &&
    item.expectedStatus !== 308
  ) {
    return gscBriefFail(
      "Verification brief is unavailable: expected HTTP status is invalid."
    );
  }

  if (typeof item.inSitemap !== "boolean" && item.inSitemap !== null) {
    return gscBriefFail(
      "Verification brief is unavailable: sitemap expectation is invalid."
    );
  }

  if (
    typeof item.label !== "string" ||
    !isBoundedSafeGscPlainField(item.label, MAX_GSC_BRIEF_LABEL_CHARS)
  ) {
    return gscBriefFail(
      "Verification brief is unavailable: label is missing or unsafe."
    );
  }

  if (
    typeof item.note !== "string" ||
    !isBoundedSafeGscPlainField(item.note, MAX_GSC_BRIEF_NOTE_CHARS)
  ) {
    return gscBriefFail(
      "Verification brief is unavailable: source note is missing or unsafe."
    );
  }

  if (typeof item.url !== "string" || !item.url) {
    return gscBriefFail(
      "Verification brief is unavailable: URL is missing."
    );
  }
  if (!isSafeSameOriginHttpsUrl(item.url)) {
    return gscBriefFail(
      "Verification brief is unavailable: URL is not a safe same-origin HTTPS URL."
    );
  }

  if (item.expectedCanonical !== null) {
    if (
      typeof item.expectedCanonical !== "string" ||
      !isSafeSameOriginHttpsUrl(item.expectedCanonical)
    ) {
      return gscBriefFail(
        "Verification brief is unavailable: expected canonical is unsafe."
      );
    }
  }

  if (item.expectedTarget !== null) {
    if (
      typeof item.expectedTarget !== "string" ||
      !isSafeSameOriginHttpsUrl(item.expectedTarget)
    ) {
      return gscBriefFail(
        "Verification brief is unavailable: expected redirect destination is unsafe."
      );
    }
  }

  const brief = [
    "FIRESTICK4UK — MANUAL GSC URL VERIFICATION BRIEF",
    "================================================",
    "",
    "SOURCE",
    "Firestick4UK SEO Workspace",
    "Technical expectations only — NOT Google observations.",
    "",
    "URL DETAILS",
    `Label: ${item.label}`,
    `URL: ${item.url}`,
    `Group: ${formatVerificationGroupLabel(group)}`,
    `Type: ${formatVerificationKindLabel(kind)}`,
    "",
    "EXPECTED TECHNICAL STATE",
    `Expected HTTP: ${formatExpectedHttp(item.expectedStatus)}`,
    `Expected redirect destination: ${formatOptionalUrl(item.expectedTarget)}`,
    `Expected canonical: ${formatOptionalUrl(item.expectedCanonical)}`,
    `Expected sitemap inclusion: ${formatSitemapExpectation(item.inSitemap)}`,
    "",
    "SOURCE NOTE",
    item.note,
    "",
    "MANUAL GOOGLE SEARCH CONSOLE REVIEW",
    "- Inspect this exact URL in the correct GSC property.",
    "- Compare actual Google-reported indexing and canonical details.",
    "- Check redirect/canonical behavior against the expected configuration.",
    "- Review live URL inspection where appropriate.",
    "- Record any discrepancy separately for editorial/technical follow-up.",
    "",
    "GOOGLE OBSERVATIONS",
    "Not checked or recorded by this tool.",
    "",
    "IMPORTANT",
    "These are website technical expectations, not live crawl results.",
    "No indexing, clicks, impressions, position or coverage status is claimed.",
    "No Google Search Console verification has been performed by this tool.",
    "This brief is not saved in the CMS.",
    "The operator must verify actual results in Google Search Console.",
    "",
  ].join("\n");

  if (brief.length > MAX_GSC_BRIEF_CHARS) {
    return gscBriefFail(
      "Verification brief is unavailable: assembled brief exceeds safe size."
    );
  }

  return { ok: true, brief };
}
