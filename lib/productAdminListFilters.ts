/**
 * F4UK-MULTI-130 — pure product-list search/tab filters for Sidhu Products admin.
 * Maps WooCommerce-style tabs onto existing visibility + SEO filter semantics.
 * No DB. No HTTP. No product mutation.
 */

import {
  buildProductSeoReviewRow,
  filterAndOrderProductsForSeoReview,
  type ProductSeoReviewFilter,
  type ProductSeoReviewRow,
} from "@/lib/productSeoReviewClient";
import type { ProductDbRow } from "@/lib/seoDiagnosticRows";

export type ProductAdminListTab =
  | "all"
  | "public"
  | "hidden"
  | "seasonal"
  | "out_of_stock"
  | "needs_seo";

export type ProductVisibilityFilter = "all" | "visible" | "hidden";

export type ProductAdminListProduct = {
  id?: unknown;
  name?: unknown;
  slug?: unknown;
  category?: unknown;
  active?: unknown;
  stock?: unknown;
  lifecycle_mode?: unknown;
};

/** Debounce delay for client-side product list search (ms). */
export const PRODUCT_ADMIN_SEARCH_DEBOUNCE_MS = 150;

/**
 * Map a primary list tab onto the legacy visibility + SEO filter pair.
 * Seasonal / Out of stock keep legacy filters at "all" and apply extra predicates.
 */
export function mapListTabToLegacyFilters(tab: ProductAdminListTab): {
  visibility: ProductVisibilityFilter;
  seo: ProductSeoReviewFilter;
} {
  switch (tab) {
    case "public":
      return { visibility: "visible", seo: "all" };
    case "hidden":
      return { visibility: "hidden", seo: "all" };
    case "needs_seo":
      return { visibility: "all", seo: "review-queue" };
    case "seasonal":
    case "out_of_stock":
    case "all":
    default:
      return { visibility: "all", seo: "all" };
  }
}

/**
 * When SEO detail filters change, derive the primary tab that preserves semantics:
 * - non-all SEO → needs_seo (Review Queue / Needs attention / …)
 * - visibility-only Public/Private stay mapped when SEO is all
 */
export function deriveListTabFromLegacyFilters(
  visibility: ProductVisibilityFilter,
  seo: ProductSeoReviewFilter,
  previousTab?: ProductAdminListTab
): ProductAdminListTab {
  if (seo !== "all") return "needs_seo";
  if (visibility === "visible") return "public";
  if (visibility === "hidden") return "hidden";
  if (previousTab === "seasonal" || previousTab === "out_of_stock") {
    return previousTab;
  }
  return "all";
}

export function matchesProductAdminSearch(
  product: ProductAdminListProduct,
  query: string
): boolean {
  const q = String(query || "")
    .trim()
    .toLowerCase();
  if (!q) return true;
  const name = String(product.name || "").toLowerCase();
  const slug = String(product.slug || "").toLowerCase();
  const category = String(product.category || "").toLowerCase();
  return name.includes(q) || slug.includes(q) || category.includes(q);
}

export function isProductSeasonal(product: ProductAdminListProduct): boolean {
  return String(product.lifecycle_mode || "") === "seasonal";
}

/**
 * Out of stock: numeric zero, or stock text that clearly means unavailable.
 * Digital / free-text inventory strings are treated as in stock.
 */
export function isProductOutOfStock(product: ProductAdminListProduct): boolean {
  const raw = String(product.stock ?? "").trim();
  if (!raw) return false;
  if (/^(0+|0+\.0+)$/.test(raw)) return true;
  const lower = raw.toLowerCase();
  return (
    lower === "out of stock" ||
    lower === "oos" ||
    lower === "sold out" ||
    lower === "unavailable"
  );
}

export function matchesProductAdminListTab(
  product: ProductAdminListProduct,
  tab: ProductAdminListTab,
  seoRow?: ProductSeoReviewRow | null
): boolean {
  if (tab === "all") return true;
  if (tab === "public") return Number(product.active) === 1;
  if (tab === "hidden") return Number(product.active) !== 1;
  if (tab === "seasonal") return isProductSeasonal(product);
  if (tab === "out_of_stock") return isProductOutOfStock(product);
  if (tab === "needs_seo") {
    const row =
      seoRow ||
      buildProductSeoReviewRow(product as unknown as ProductDbRow);
    return row.status === "needs-attention" || row.status === "review";
  }
  return true;
}

export type ProductAdminListCounts = {
  all: number;
  public: number;
  hidden: number;
  seasonal: number;
  out_of_stock: number;
  needs_seo: number;
};

export function countProductAdminListTabs<T extends ProductAdminListProduct>(
  products: T[],
  reviewById?: Map<number, ProductSeoReviewRow>
): ProductAdminListCounts {
  const counts: ProductAdminListCounts = {
    all: products.length,
    public: 0,
    hidden: 0,
    seasonal: 0,
    out_of_stock: 0,
    needs_seo: 0,
  };
  for (const p of products) {
    if (Number(p.active) === 1) counts.public += 1;
    else counts.hidden += 1;
    if (isProductSeasonal(p)) counts.seasonal += 1;
    if (isProductOutOfStock(p)) counts.out_of_stock += 1;
    const id = Number(p.id);
    const row =
      (Number.isFinite(id) && reviewById?.get(id)) ||
      buildProductSeoReviewRow(p as unknown as ProductDbRow);
    if (row.status === "needs-attention" || row.status === "review") {
      counts.needs_seo += 1;
    }
  }
  return counts;
}

/**
 * Full list pipeline: optional search → legacy SEO/visibility (or tab extras) → order.
 * When tab is seasonal/out_of_stock, legacy filters are forced to all and tab predicate applies.
 * When tab is public/hidden/needs_seo/all, legacy mapping matches historical behaviour.
 */
export function filterProductsForAdminList<T extends ProductAdminListProduct & { id?: unknown }>(
  products: T[],
  opts: {
    search: string;
    tab: ProductAdminListTab;
    visibilityFilter: ProductVisibilityFilter;
    seoFilter: ProductSeoReviewFilter;
    reviewById: Map<number, ProductSeoReviewRow>;
  }
): T[] {
  const searched = products.filter((p) =>
    matchesProductAdminSearch(p, opts.search)
  );

  const mapped = mapListTabToLegacyFilters(opts.tab);
  // Prefer explicit legacy filters when they already match the tab mapping
  // (keeps PAI visibility/SEO semantics when detail filters are used).
  const visibility =
    opts.tab === "seasonal" || opts.tab === "out_of_stock"
      ? "all"
      : opts.visibilityFilter;
  const seo =
    opts.tab === "seasonal" || opts.tab === "out_of_stock"
      ? "all"
      : opts.seoFilter;

  // Align: if caller passes tab-driven state, visibility/seo should equal mapped.
  void mapped;

  const seoFiltered = filterAndOrderProductsForSeoReview(
    searched,
    opts.reviewById,
    seo
  );

  let next = seoFiltered;
  if (visibility !== "all") {
    next = next.filter((p) => {
      const visible = Number(p.active) === 1;
      return visibility === "visible" ? visible : !visible;
    });
  }

  if (opts.tab === "seasonal" || opts.tab === "out_of_stock") {
    next = next.filter((p) => {
      const id = Number(p.id);
      const row =
        (Number.isFinite(id) && opts.reviewById.get(id)) || null;
      return matchesProductAdminListTab(p, opts.tab, row);
    });
  }

  return next;
}
