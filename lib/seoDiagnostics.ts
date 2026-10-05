/**
 * Deterministic read-only SEO diagnostics (no DB, no HTTP, no AI).
 * Consumes already-normalized SEO Overview product/blog rows only.
 */

import type { ProductOgSource } from "@/lib/seoOverview";

export type SeoDiagnosticSeverity = "needs-attention" | "review";

export type SeoDiagnosticCategory =
  | "metadata"
  | "canonical"
  | "media"
  | "indexing";

export type SeoDiagnosticIssue = {
  id: string;
  severity: SeoDiagnosticSeverity;
  category: SeoDiagnosticCategory;
  entityType: "product" | "blog";
  entityId: string;
  label: string;
  url: string | null;
  field: string | null;
  message: string;
  evidence: string;
  editTarget: "products" | "blog";
};

export type SeoDiagnosticsSummary = {
  eligibleEntities: number;
  healthyEntities: number;
  needsAttentionEntities: number;
  reviewEntities: number;
  totalIssues: number;
};

export type SeoDiagnosticsResult = {
  summary: SeoDiagnosticsSummary;
  issues: SeoDiagnosticIssue[];
};

/** Compact inline <img> alt scan — counts only, never raw HTML. */
export type InlineImageAltFinding = {
  total: number;
  missingAlt: number;
  emptyAlt: number;
};

export const EMPTY_INLINE_IMAGE_ALT: InlineImageAltFinding = {
  total: 0,
  missingAlt: 0,
  emptyAlt: 0,
};

/**
 * Pure deterministic scan of stored TipTap/rich HTML for <img> alt presence.
 * Does not execute HTML, fetch URLs, or judge alt wording quality.
 */
export function analyzeInlineImageAlts(
  html: string | null | undefined
): InlineImageAltFinding {
  const src = typeof html === "string" ? html : "";
  if (!src) return { ...EMPTY_INLINE_IMAGE_ALT };

  const imgTagRe = /<img\b[^>]*>/gi;
  let total = 0;
  let missingAlt = 0;
  let emptyAlt = 0;
  let m: RegExpExecArray | null;
  while ((m = imgTagRe.exec(src)) !== null) {
    total += 1;
    const tag = m[0];
    // Real `alt=` only — not `data-alt`, `aria-*`, etc.
    const altMatch = tag.match(
      /(?<![\w-])alt\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i
    );
    if (!altMatch) {
      missingAlt += 1;
      continue;
    }
    const raw = altMatch[1] ?? altMatch[2] ?? altMatch[3] ?? "";
    if (!String(raw).trim()) emptyAlt += 1;
  }
  return { total, missingAlt, emptyAlt };
}

function mergeInlineImageAltFindings(
  parts: InlineImageAltFinding[]
): InlineImageAltFinding {
  return parts.reduce(
    (acc, part) => ({
      total: acc.total + part.total,
      missingAlt: acc.missingAlt + part.missingAlt,
      emptyAlt: acc.emptyAlt + part.emptyAlt,
    }),
    { ...EMPTY_INLINE_IMAGE_ALT }
  );
}

/**
 * Scan product rich-HTML fields with identical-string dedupe so legacy
 * duplicated fallback copies are not double-counted.
 */
export function analyzeProductRichHtmlFields(fields: {
  short_description?: string | null;
  description?: string | null;
  full_description?: string | null;
}): InlineImageAltFinding {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const raw of [
    fields.short_description,
    fields.description,
    fields.full_description,
  ]) {
    const s = typeof raw === "string" ? raw : "";
    if (!s.trim()) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    unique.push(s);
  }
  return mergeInlineImageAltFindings(unique.map(analyzeInlineImageAlts));
}

/** Normalized product row already produced by /api/admin-seo-overview. */
export type SeoDiagProductInput = {
  id: number;
  name: string;
  slug: string;
  active: boolean;
  title: string;
  description: string;
  publicUrl?: string;
  ogSource: ProductOgSource | string;
  /** Compact server-side scan of description / short_description / full_description. */
  inlineImageAlt?: InlineImageAltFinding | null;
};

/** Normalized blog row already produced by /api/admin-seo-overview. */
export type SeoDiagBlogInput = {
  id: number;
  title: string;
  slug: string;
  status: string;
  active: boolean;
  effectiveTitle: string;
  effectiveDescription: string;
  publicUrl?: string;
  featuredImage: boolean;
  canonicalHealth: string;
  canonicalDetail: string;
  /** Compact server-side scan of blog content HTML (content itself is never exposed). */
  inlineImageAlt?: InlineImageAltFinding | null;
};

export type SeoDiagnosticsInput = {
  products?: SeoDiagProductInput[] | null;
  blog?: SeoDiagBlogInput[] | null;
};

function issueId(
  entityType: "product" | "blog",
  entityId: string | number,
  code: string
): string {
  return `${entityType}:${entityId}:${code}`;
}

function severityRank(s: SeoDiagnosticSeverity): number {
  return s === "needs-attention" ? 0 : 1;
}

function sortIssues(issues: SeoDiagnosticIssue[]): SeoDiagnosticIssue[] {
  return [...issues].sort((a, b) => {
    const sr = severityRank(a.severity) - severityRank(b.severity);
    if (sr !== 0) return sr;
    if (a.entityType !== b.entityType) {
      return a.entityType < b.entityType ? -1 : 1;
    }
    const idCmp = String(a.entityId).localeCompare(String(b.entityId), "en", {
      numeric: true,
    });
    if (idCmp !== 0) return idCmp;
    return a.id.localeCompare(b.id);
  });
}

export function diagnoseProduct(
  p: SeoDiagProductInput
): SeoDiagnosticIssue[] {
  if (!p.active) return [];

  const id = String(p.id);
  const slug = String(p.slug || "").trim();
  const label = String(p.name || "").trim() || `Product ${id}`;
  const url = slug && p.publicUrl ? String(p.publicUrl) : null;
  const title = String(p.title || "");
  const description = String(p.description || "").trim();
  const issues: SeoDiagnosticIssue[] = [];

  if (!slug) {
    issues.push({
      id: issueId("product", id, "missing-slug"),
      severity: "needs-attention",
      category: "indexing",
      entityType: "product",
      entityId: id,
      label,
      url: null,
      field: "slug",
      message: "Product has no public slug.",
      evidence: "No stable product URL/canonical can be derived.",
      editTarget: "products",
    });
  }

  if (!description) {
    issues.push({
      id: issueId("product", id, "missing-description"),
      severity: "needs-attention",
      category: "metadata",
      entityType: "product",
      entityId: id,
      label,
      url,
      field: "meta_description",
      message: "Product has no effective meta description.",
      evidence:
        "Current public fallback chain produced an empty description.",
      editTarget: "products",
    });
  } else if (description.length > 180) {
    issues.push({
      id: issueId("product", id, "description-long"),
      severity: "review",
      category: "metadata",
      entityType: "product",
      entityId: id,
      label,
      url,
      field: "meta_description",
      message: "Effective product meta description exceeds the review threshold.",
      evidence: `${description.length} characters (threshold > 180).`,
      editTarget: "products",
    });
  }

  if (title.length > 70) {
    issues.push({
      id: issueId("product", id, "title-long"),
      severity: "review",
      category: "metadata",
      entityType: "product",
      entityId: id,
      label,
      url,
      field: "seo_title",
      message: "Effective product title exceeds the review threshold.",
      evidence: `${title.length} characters (threshold > 70).`,
      editTarget: "products",
    });
  }

  if (String(p.ogSource) === "Global fallback") {
    issues.push({
      id: issueId("product", id, "og-global-fallback"),
      severity: "review",
      category: "media",
      entityType: "product",
      entityId: id,
      label,
      url,
      field: "og_image",
      message:
        "No product-specific or product-image OG source is currently available, so the global fallback is used.",
      evidence: 'ogSource === "Global fallback"',
      editTarget: "products",
    });
  }

  const inline = p.inlineImageAlt;
  if (inline && inline.missingAlt > 0) {
    const n = inline.missingAlt;
    issues.push({
      id: issueId("product", id, "inline-image-missing-alt"),
      severity: "needs-attention",
      category: "media",
      entityType: "product",
      entityId: id,
      label,
      url,
      field: "rich_content",
      message:
        n === 1
          ? "Inline product image is missing an alt attribute."
          : "Inline product images are missing alt attributes.",
      evidence: `${n} inline image${n === 1 ? "" : "s"} without an alt attribute.`,
      editTarget: "products",
    });
  }
  if (inline && inline.emptyAlt > 0) {
    const n = inline.emptyAlt;
    issues.push({
      id: issueId("product", id, "inline-image-empty-alt"),
      severity: "review",
      category: "media",
      entityType: "product",
      entityId: id,
      label,
      url,
      field: "rich_content",
      message:
        n === 1
          ? "Inline product image has an empty alt attribute."
          : "Inline product images have empty alt attributes.",
      evidence: `${n} inline image${n === 1 ? " has" : "s have"} an empty alt attribute. Empty alt may be intentional for a decorative image, so review context.`,
      editTarget: "products",
    });
  }

  return issues;
}

export function diagnoseBlog(b: SeoDiagBlogInput): SeoDiagnosticIssue[] {
  const status = String(b.status || "").toLowerCase();
  if (status !== "published" || !b.active) return [];

  const id = String(b.id);
  const slug = String(b.slug || "").trim();
  const label = String(b.title || "").trim() || `Blog ${id}`;
  const url = slug && b.publicUrl ? String(b.publicUrl) : null;
  const effectiveTitle = String(b.effectiveTitle || "").trim();
  const effectiveDescription = String(b.effectiveDescription || "").trim();
  const issues: SeoDiagnosticIssue[] = [];

  if (!slug) {
    issues.push({
      id: issueId("blog", id, "missing-slug"),
      severity: "needs-attention",
      category: "indexing",
      entityType: "blog",
      entityId: id,
      label,
      url: null,
      field: "slug",
      message: "Blog post has no public slug.",
      evidence: "No stable blog URL/canonical can be derived.",
      editTarget: "blog",
    });
  }

  if (!effectiveTitle) {
    issues.push({
      id: issueId("blog", id, "missing-title"),
      severity: "needs-attention",
      category: "metadata",
      entityType: "blog",
      entityId: id,
      label,
      url,
      field: "meta_title",
      message: "Blog post has no effective meta title.",
      evidence: "Current public fallback chain produced an empty title.",
      editTarget: "blog",
    });
  } else if (effectiveTitle.length > 75) {
    issues.push({
      id: issueId("blog", id, "title-long"),
      severity: "review",
      category: "metadata",
      entityType: "blog",
      entityId: id,
      label,
      url,
      field: "meta_title",
      message: "Effective blog title exceeds the review threshold.",
      evidence: `${effectiveTitle.length} characters (threshold > 75).`,
      editTarget: "blog",
    });
  }

  if (!effectiveDescription) {
    issues.push({
      id: issueId("blog", id, "missing-description"),
      severity: "needs-attention",
      category: "metadata",
      entityType: "blog",
      entityId: id,
      label,
      url,
      field: "meta_description",
      message: "Blog post has no effective meta description.",
      evidence:
        "Current public fallback chain produced an empty description.",
      editTarget: "blog",
    });
  } else if (effectiveDescription.length > 180) {
    issues.push({
      id: issueId("blog", id, "description-long"),
      severity: "review",
      category: "metadata",
      entityType: "blog",
      entityId: id,
      label,
      url,
      field: "meta_description",
      message: "Effective blog meta description exceeds the review threshold.",
      evidence: `${effectiveDescription.length} characters (threshold > 180).`,
      editTarget: "blog",
    });
  }

  if (!b.featuredImage) {
    issues.push({
      id: issueId("blog", id, "missing-featured-image"),
      severity: "review",
      category: "media",
      entityType: "blog",
      entityId: id,
      label,
      url,
      field: "featured_image",
      message: "Blog post has no featured image.",
      evidence: "featured_image is blank.",
      editTarget: "blog",
    });
  }

  if (String(b.canonicalHealth) === "Review") {
    issues.push({
      id: issueId("blog", id, "canonical-review"),
      severity: "needs-attention",
      category: "canonical",
      entityType: "blog",
      entityId: id,
      label,
      url,
      field: "canonical_url",
      message: "Canonical needs review.",
      evidence: String(b.canonicalDetail || "Canonical health is Review."),
      editTarget: "blog",
    });
  }

  const inline = b.inlineImageAlt;
  if (inline && inline.missingAlt > 0) {
    const n = inline.missingAlt;
    issues.push({
      id: issueId("blog", id, "inline-image-missing-alt"),
      severity: "needs-attention",
      category: "media",
      entityType: "blog",
      entityId: id,
      label,
      url,
      field: "content",
      message:
        n === 1
          ? "Inline blog image is missing an alt attribute."
          : "Inline blog images are missing alt attributes.",
      evidence: `${n} inline image${n === 1 ? "" : "s"} without an alt attribute.`,
      editTarget: "blog",
    });
  }
  if (inline && inline.emptyAlt > 0) {
    const n = inline.emptyAlt;
    issues.push({
      id: issueId("blog", id, "inline-image-empty-alt"),
      severity: "review",
      category: "media",
      entityType: "blog",
      entityId: id,
      label,
      url,
      field: "content",
      message:
        n === 1
          ? "Inline blog image has an empty alt attribute."
          : "Inline blog images have empty alt attributes.",
      evidence: `${n} inline image${n === 1 ? " has" : "s have"} an empty alt attribute. Empty alt may be intentional for a decorative image, so review context.`,
      editTarget: "blog",
    });
  }

  return issues;
}

function entityState(
  issues: SeoDiagnosticIssue[]
): "needs-attention" | "review" | "healthy" {
  if (issues.some((i) => i.severity === "needs-attention")) {
    return "needs-attention";
  }
  if (issues.length > 0) return "review";
  return "healthy";
}

/**
 * Build diagnostics from already-fetched overview rows.
 * Pass only the entity collections the caller is permitted to see.
 */
export function buildSeoDiagnostics(
  input: SeoDiagnosticsInput
): SeoDiagnosticsResult {
  const products = Array.isArray(input.products) ? input.products : [];
  const blogs = Array.isArray(input.blog) ? input.blog : [];

  const eligibleProducts = products.filter((p) => !!p.active);
  const eligibleBlogs = blogs.filter(
    (b) => String(b.status || "").toLowerCase() === "published" && !!b.active
  );

  const allIssues: SeoDiagnosticIssue[] = [];
  let healthyEntities = 0;
  let needsAttentionEntities = 0;
  let reviewEntities = 0;

  for (const p of eligibleProducts) {
    const issues = diagnoseProduct(p);
    allIssues.push(...issues);
    const state = entityState(issues);
    if (state === "healthy") healthyEntities += 1;
    else if (state === "needs-attention") needsAttentionEntities += 1;
    else reviewEntities += 1;
  }

  for (const b of eligibleBlogs) {
    const issues = diagnoseBlog(b);
    allIssues.push(...issues);
    const state = entityState(issues);
    if (state === "healthy") healthyEntities += 1;
    else if (state === "needs-attention") needsAttentionEntities += 1;
    else reviewEntities += 1;
  }

  const issues = sortIssues(allIssues);
  return {
    summary: {
      eligibleEntities: eligibleProducts.length + eligibleBlogs.length,
      healthyEntities,
      needsAttentionEntities,
      reviewEntities,
      totalIssues: issues.length,
    },
    issues,
  };
}
