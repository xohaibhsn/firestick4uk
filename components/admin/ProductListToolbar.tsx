"use client";

import type { ProductSeoReviewFilter } from "@/lib/productSeoReviewClient";
import type {
  ProductAdminListCounts,
  ProductAdminListTab,
  ProductVisibilityFilter,
} from "@/lib/productAdminListFilters";

export type ProductSeoSummaryCounts = {
  needsAttention: number;
  review: number;
  healthy: number;
  inactive: number;
  reviewQueue: number;
};

type Props = {
  search: string;
  onSearchChange: (value: string) => void;
  tab: ProductAdminListTab;
  onTabChange: (tab: ProductAdminListTab) => void;
  counts: ProductAdminListCounts;
  visibilityFilter: ProductVisibilityFilter;
  onVisibilityFilterChange: (value: ProductVisibilityFilter) => void;
  seoFilter: ProductSeoReviewFilter;
  onSeoFilterChange: (value: ProductSeoReviewFilter) => void;
  seoSummary: ProductSeoSummaryCounts;
  showFilters: boolean;
};

const PRIMARY_TABS: { id: ProductAdminListTab; label: string; countKey: keyof ProductAdminListCounts }[] = [
  { id: "all", label: "All", countKey: "all" },
  { id: "public", label: "Public", countKey: "public" },
  { id: "hidden", label: "Hidden", countKey: "hidden" },
  { id: "seasonal", label: "Seasonal", countKey: "seasonal" },
  { id: "out_of_stock", label: "Out of stock", countKey: "out_of_stock" },
  { id: "needs_seo", label: "Needs SEO", countKey: "needs_seo" },
];

export default function ProductListToolbar({
  search,
  onSearchChange,
  tab,
  onTabChange,
  counts,
  visibilityFilter,
  onVisibilityFilterChange,
  seoFilter,
  onSeoFilterChange,
  seoSummary,
  showFilters,
}: Props) {
  if (!showFilters) return null;

  return (
    <div data-testid="product-list-toolbar" style={{ marginBottom: 14 }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <label style={{ flex: "1 1 220px", minWidth: 180, margin: 0 }}>
          <span className="sr-only" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
            Search products
          </span>
          <input
            type="search"
            data-testid="product-list-search"
            placeholder="Search name, slug, or category…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            style={{
              width: "100%",
              background: "#FFFFFF",
              border: "1px solid #E5E5E5",
              borderRadius: 8,
              padding: "10px 12px",
              color: "#111111",
              fontSize: 13,
              outline: "none",
            }}
          />
        </label>
      </div>

      <div
        data-testid="product-list-tabs"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 12,
          alignItems: "center",
        }}
      >
        {PRIMARY_TABS.map(({ id, label, countKey }) => {
          const selected = tab === id;
          return (
            <button
              key={id}
              type="button"
              data-testid={`product-list-tab-${id}`}
              className="action-btn btn-view"
              aria-pressed={selected}
              onClick={() => onTabChange(id)}
              style={{
                opacity: selected ? 1 : 0.7,
                borderColor: selected ? "rgba(91,33,182,0.55)" : undefined,
                background: selected ? "rgba(91,33,182,0.12)" : undefined,
              }}
            >
              {label} ({counts[countKey]})
            </button>
          );
        })}
      </div>

      {/* Legacy visibility filters — same semantics + test ids (mapped into Public/Private tabs). */}
      <div
        data-testid="product-visibility-filters"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 12,
          alignItems: "center",
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.85, marginRight: 4 }}>
          Visibility
        </span>
        {(
          [
            ["all", "All"],
            ["visible", "Public"],
            ["hidden", "Private"],
          ] as const
        ).map(([value, label]) => {
          const selected = visibilityFilter === value;
          return (
            <button
              key={value}
              type="button"
              data-testid={`product-visibility-filter-${value}`}
              className="action-btn btn-view"
              aria-pressed={selected}
              onClick={() => onVisibilityFilterChange(value)}
              style={{
                opacity: selected ? 1 : 0.7,
                borderColor: selected ? "rgba(91,33,182,0.55)" : undefined,
                background: selected ? "rgba(91,33,182,0.12)" : undefined,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div
        data-testid="product-seo-review-summary"
        style={{
          marginBottom: 12,
          padding: "10px 12px",
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 10,
          fontSize: 12,
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          alignItems: "center",
        }}
      >
        <span style={{ fontWeight: 700, opacity: 0.85 }}>Deterministic SEO</span>
        <span data-testid="product-seo-count-needs-attention">
          Needs attention: {seoSummary.needsAttention}
        </span>
        <span data-testid="product-seo-count-review">Review: {seoSummary.review}</span>
        <span data-testid="product-seo-count-healthy">Healthy: {seoSummary.healthy}</span>
        <span data-testid="product-seo-count-inactive">Inactive: {seoSummary.inactive}</span>
        <span data-testid="product-seo-count-review-queue" style={{ fontWeight: 600 }}>
          Review Queue: {seoSummary.reviewQueue}
        </span>
      </div>

      <div
        data-testid="product-seo-review-filters"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 4,
        }}
      >
        {(
          [
            ["all", "All"],
            ["review-queue", "Review Queue"],
            ["needs-attention", "Needs attention"],
            ["review", "Review"],
            ["healthy", "Healthy"],
            ["inactive", "Inactive"],
          ] as const
        ).map(([value, label]) => {
          const active = seoFilter === value;
          return (
            <button
              key={value}
              type="button"
              data-testid={`product-seo-filter-${value}`}
              className="action-btn btn-view"
              onClick={() => onSeoFilterChange(value)}
              style={{
                opacity: active ? 1 : 0.7,
                borderColor: active ? "rgba(91,33,182,0.55)" : undefined,
                background: active ? "rgba(91,33,182,0.12)" : undefined,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
