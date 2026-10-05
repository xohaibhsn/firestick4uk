/**
 * Shared product/blog row normalization for SEO diagnostics.
 * Used by Overview GET and Issue Memory reconcile (parity).
 */
import {
  analyzeInlineImageAlts,
  analyzeProductRichHtmlFields,
  type SeoDiagBlogInput,
  type SeoDiagProductInput,
} from "@/lib/seoDiagnostics";
import {
  analyzeBlogCanonical,
  blogPublicUrl,
  deriveBlogHealth,
  deriveProductHealth,
  productPublicUrl,
} from "@/lib/seoOverview";

export type ProductDbRow = {
  id: number | string;
  name?: string | null;
  slug?: string | null;
  active?: number | boolean | null;
  seo_title?: string | null;
  meta_description?: string | null;
  focus_keyword?: string | null;
  image?: string | null;
  og_image?: string | null;
  short_description?: string | null;
  description?: string | null;
  full_description?: string | null;
};

export type BlogDbRow = {
  id: number | string;
  title?: string | null;
  slug?: string | null;
  status?: string | null;
  active?: number | boolean | null;
  meta_title?: string | null;
  meta_description?: string | null;
  focus_keyword?: string | null;
  canonical_url?: string | null;
  featured_image?: string | null;
  excerpt?: string | null;
  content?: string | null;
};

/** Compact overview/API product row (no raw HTML). */
export type NormalizedProductSeoRow = SeoDiagProductInput & {
  publicUrl: string;
  canonical: string;
  inSitemap: boolean;
  hasCustomOg: boolean;
  focus_keyword: string;
  health: string[];
};

/** Compact overview/API blog row (no raw HTML / no content). */
export type NormalizedBlogSeoRow = SeoDiagBlogInput & {
  publicUrl: string;
  published: boolean;
  storedCanonical: string;
  effectiveCanonical: string;
  inSitemap: boolean;
  focus_keyword: string;
  focusKeywordNote: string;
  health: string[];
};

export function normalizeProductDiagnosticRow(
  p: ProductDbRow
): NormalizedProductSeoRow {
  const active = Number(p.active) === 1;
  const slug = String(p.slug || "")
    .trim()
    .toLowerCase();
  const derived = deriveProductHealth({
    name: String(p.name || ""),
    slug,
    active,
    seo_title: p.seo_title,
    meta_description: p.meta_description,
    short_description: p.short_description,
    description: p.description,
    full_description: p.full_description,
    image: p.image,
    og_image: p.og_image,
  });
  const inlineImageAlt = analyzeProductRichHtmlFields({
    short_description: p.short_description,
    description: p.description,
    full_description: p.full_description,
  });
  return {
    id: Number(p.id),
    name: String(p.name || ""),
    slug,
    active,
    publicUrl: slug ? productPublicUrl(slug) : "",
    title: derived.title,
    description: derived.description,
    canonical: derived.canonical,
    inSitemap: derived.inSitemap,
    ogSource: derived.ogSource,
    hasCustomOg: !!String(p.og_image || "").trim(),
    focus_keyword: String(p.focus_keyword || ""),
    health: derived.flags,
    inlineImageAlt,
  };
}

export function normalizeBlogDiagnosticRow(b: BlogDbRow): NormalizedBlogSeoRow {
  const slug = String(b.slug || "")
    .trim()
    .toLowerCase();
  const active = Number(b.active) === 1;
  const derived = deriveBlogHealth({
    title: String(b.title || ""),
    slug,
    status: String(b.status || ""),
    active,
    meta_title: b.meta_title,
    meta_description: b.meta_description,
    excerpt: b.excerpt,
    featured_image: b.featured_image,
    canonical_url: b.canonical_url,
  });
  const canon = analyzeBlogCanonical(b.canonical_url, slug);
  const inlineImageAlt = analyzeInlineImageAlts(b.content);
  return {
    id: Number(b.id),
    title: String(b.title || ""),
    slug,
    status: String(b.status || ""),
    active,
    published: derived.published,
    publicUrl: slug ? blogPublicUrl(slug) : "",
    effectiveTitle: derived.title,
    effectiveDescription: derived.description,
    storedCanonical: String(b.canonical_url || ""),
    effectiveCanonical: canon.effectiveCanonical,
    canonicalHealth: canon.label,
    canonicalDetail: canon.detail,
    inSitemap: derived.inSitemap,
    featuredImage: !!String(b.featured_image || "").trim(),
    focus_keyword: String(b.focus_keyword || ""),
    focusKeywordNote: "Stored — not currently emitted in page metadata",
    health: derived.flags,
    inlineImageAlt,
  };
}
