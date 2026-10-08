/**
 * Client-safe deterministic product SEO review queue helpers.
 * Reuses normalizeProductDiagnosticRow + diagnoseProduct only.
 * No DB. No HTTP. No AI. No Issue Memory writes.
 */

import {
  diagnoseProduct,
  type SeoDiagnosticIssue,
} from "@/lib/seoDiagnostics";
import {
  normalizeProductDiagnosticRow,
  type ProductDbRow,
} from "@/lib/seoDiagnosticRows";

export type ProductSeoReviewStatus =
  | "needs-attention"
  | "review"
  | "healthy"
  | "inactive";

export type ProductSeoReviewFilter =
  | "all"
  | "review-queue"
  | "needs-attention"
  | "review"
  | "healthy"
  | "inactive";

export type ProductSeoReviewIssue = {
  id: string;
  severity: "needs-attention" | "review";
  message: string;
  evidence: string;
  field: string | null;
  category: string;
  label: string;
};

export type ProductSeoReviewRow = {
  productId: number;
  active: boolean;
  status: ProductSeoReviewStatus;
  issueCount: number;
  needsAttentionCount: number;
  reviewCount: number;
  issues: ProductSeoReviewIssue[];
};

export type ProductSeoReviewSummary = {
  total: number;
  needsAttention: number;
  review: number;
  healthy: number;
  inactive: number;
  reviewQueue: number;
};

function mapIssue(issue: SeoDiagnosticIssue): ProductSeoReviewIssue {
  return {
    id: issue.id,
    severity: issue.severity,
    message: String(issue.message || ""),
    evidence: String(issue.evidence || ""),
    field: issue.field == null ? null : String(issue.field),
    category: String(issue.category || ""),
    label: String(issue.label || ""),
  };
}

/**
 * Derive live deterministic SEO status for one admin product row.
 * Uses the shared diagnostic engine only — no duplicated thresholds.
 */
export function buildProductSeoReviewRow(
  product: ProductDbRow
): ProductSeoReviewRow {
  const normalized = normalizeProductDiagnosticRow(product);
  const active = Boolean(normalized.active);
  const productId = Number(normalized.id);

  if (!active) {
    return {
      productId: Number.isFinite(productId) ? productId : 0,
      active: false,
      status: "inactive",
      issueCount: 0,
      needsAttentionCount: 0,
      reviewCount: 0,
      issues: [],
    };
  }

  // diagnoseProduct already sorts needs-attention before review.
  const rawIssues = diagnoseProduct(normalized);
  const issues = rawIssues.map(mapIssue);
  const needsAttentionCount = issues.filter(
    (i) => i.severity === "needs-attention"
  ).length;
  const reviewCount = issues.filter((i) => i.severity === "review").length;

  let status: ProductSeoReviewStatus = "healthy";
  if (needsAttentionCount > 0) status = "needs-attention";
  else if (reviewCount > 0) status = "review";

  return {
    productId: Number.isFinite(productId) ? productId : 0,
    active: true,
    status,
    issueCount: issues.length,
    needsAttentionCount,
    reviewCount,
    issues,
  };
}

export function summarizeProductSeoReviewRows(
  rows: ProductSeoReviewRow[]
): ProductSeoReviewSummary {
  const summary: ProductSeoReviewSummary = {
    total: rows.length,
    needsAttention: 0,
    review: 0,
    healthy: 0,
    inactive: 0,
    reviewQueue: 0,
  };
  for (const row of rows) {
    if (row.status === "needs-attention") summary.needsAttention += 1;
    else if (row.status === "review") summary.review += 1;
    else if (row.status === "healthy") summary.healthy += 1;
    else if (row.status === "inactive") summary.inactive += 1;
  }
  summary.reviewQueue = summary.needsAttention + summary.review;
  return summary;
}

export function matchesProductSeoFilter(
  row: ProductSeoReviewRow,
  filter: ProductSeoReviewFilter
): boolean {
  if (filter === "all") return true;
  if (filter === "review-queue") {
    return row.status === "needs-attention" || row.status === "review";
  }
  return row.status === filter;
}

export function statusRankForQueue(status: ProductSeoReviewStatus): number {
  if (status === "needs-attention") return 0;
  if (status === "review") return 1;
  if (status === "healthy") return 2;
  return 3;
}

/**
 * Filter products by SEO status. When filter is review-queue, sort
 * needs-attention before review while preserving relative order within class.
 * Other filters preserve original list order.
 */
export function filterAndOrderProductsForSeoReview<T extends { id?: unknown }>(
  products: T[],
  reviewById: Map<number, ProductSeoReviewRow>,
  filter: ProductSeoReviewFilter
): T[] {
  const indexed = products.map((product, index) => {
    const id = Number(product.id);
    const row =
      reviewById.get(id) ||
      buildProductSeoReviewRow(product as unknown as ProductDbRow);
    return { product, index, row };
  });

  const filtered = indexed.filter(({ row }) =>
    matchesProductSeoFilter(row, filter)
  );

  if (filter === "review-queue") {
    filtered.sort((a, b) => {
      const ra = statusRankForQueue(a.row.status);
      const rb = statusRankForQueue(b.row.status);
      if (ra !== rb) return ra - rb;
      return a.index - b.index;
    });
  }

  return filtered.map((entry) => entry.product);
}

export function productSeoStatusLabel(status: ProductSeoReviewStatus): string {
  if (status === "needs-attention") return "Needs attention";
  if (status === "review") return "Review";
  if (status === "healthy") return "Healthy";
  return "Inactive";
}

export function productSeoBadgeText(row: ProductSeoReviewRow): string {
  const label = productSeoStatusLabel(row.status);
  if (row.status === "needs-attention" || row.status === "review") {
    return `${label} · ${row.issueCount}`;
  }
  return label;
}

export function productSeoIssueTooltip(row: ProductSeoReviewRow): string {
  if (row.status === "inactive") return "Inactive — outside current public SEO scope.";
  if (row.issueCount === 0) return "No current deterministic SEO issues.";
  return row.issues
    .slice(0, 6)
    .map((issue) => `${issue.severity}: ${issue.message}`)
    .join("\n");
}
