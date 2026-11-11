/**
 * Endpoint-specific public product projections.
 * Never leak SELECT * admin/ops fields to public clients.
 */
import {
  isPurchasable,
  isSalesCardEligible,
  resolveSeasonPhase,
  type SeasonPhase,
} from "@/lib/productSeasonEligibility";
import type { SchemaCapability } from "@/lib/productSchemaCapability";
import { parseUtcSqlToMs, utcMsToUtcIso } from "@/lib/productSeasonLondon";

/** Legacy lightweight list/card fields (home, /products SSR, search hits). */
export const PUBLIC_LIST_FIELDS = [
  "id",
  "name",
  "description",
  "short_description",
  "slug",
  "price",
  "badge",
  "image",
  "category",
] as const;

export type PublicListProduct = {
  id: number;
  name: string;
  description: string;
  short_description?: string | null;
  slug?: string | null;
  price: number | string;
  badge: string | null;
  image: string | null;
  category: string;
};

export type PublicDetailProduct = PublicListProduct & {
  stock?: string | null;
  full_description?: string | null;
  features?: string | null;
  seo_title?: string | null;
  meta_description?: string | null;
  focus_keyword?: string | null;
  og_image?: string | null;
  /** Intentional seasonal presentation (only when seasonal + public). */
  lifecycle_mode?: "permanent" | "seasonal";
  season_name?: string | null;
  season_starts_at?: string | null;
  season_ends_at?: string | null;
  season_phase?: SeasonPhase;
  purchasable?: boolean;
  shop_listed?: boolean;
  season_show_countdown?: boolean;
  season_ended_notice?: string | null;
  available_offers_heading?: string | null;
};

function pick<T extends string>(row: Record<string, unknown>, keys: readonly T[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (k in row) out[k] = row[k];
  }
  return out;
}

export function toPublicListProduct(row: Record<string, unknown>): PublicListProduct {
  const base = pick(row, PUBLIC_LIST_FIELDS);
  return {
    id: Number(base.id),
    name: String(base.name || ""),
    description: String(base.description || ""),
    short_description: (base.short_description as string | null | undefined) ?? null,
    slug: (base.slug as string | null | undefined) ?? null,
    price: base.price as number | string,
    badge: (base.badge as string | null) ?? null,
    image: (base.image as string | null) ?? null,
    category: String(base.category || ""),
  };
}

function utcFieldIso(value: unknown): string | null {
  const ms = parseUtcSqlToMs(value);
  return ms == null ? null : utcMsToUtcIso(ms);
}

export function toPublicDetailProduct(
  row: Record<string, unknown>,
  nowMs: number,
  capability: SchemaCapability
): PublicDetailProduct {
  const list = toPublicListProduct(row);
  const detail: PublicDetailProduct = {
    ...list,
    stock: (row.stock as string | null | undefined) ?? null,
    full_description: (row.full_description as string | null | undefined) ?? null,
    features: (row.features as string | null | undefined) ?? null,
    seo_title: (row.seo_title as string | null | undefined) ?? null,
    meta_description: (row.meta_description as string | null | undefined) ?? null,
    focus_keyword: (row.focus_keyword as string | null | undefined) ?? null,
    og_image: (row.og_image as string | null | undefined) ?? null,
  };

  if (capability.mode !== "expanded") {
    detail.purchasable = isPurchasable(row, nowMs, capability);
    return detail;
  }

  const life = String(row.lifecycle_mode || "");
  if (life === "seasonal" && Number(row.active) === 1) {
    detail.lifecycle_mode = "seasonal";
    detail.season_name = (row.season_name as string | null) ?? null;
    detail.season_starts_at = utcFieldIso(row.season_starts_at);
    detail.season_ends_at = utcFieldIso(row.season_ends_at);
    detail.season_phase = resolveSeasonPhase(row, nowMs, capability);
    detail.purchasable = isPurchasable(row, nowMs, capability);
    detail.shop_listed = Number(row.shop_listed) === 1;
    detail.season_show_countdown = Number(row.season_show_countdown) === 1;
    detail.season_ended_notice = (row.season_ended_notice as string | null) ?? null;
    detail.available_offers_heading = (row.available_offers_heading as string | null) ?? null;
  } else if (life === "permanent" || capability.mode === "expanded") {
    detail.lifecycle_mode = life === "seasonal" ? "seasonal" : "permanent";
    detail.purchasable = isPurchasable(row, nowMs, capability);
  }

  return detail;
}

/** SQL select list for lightweight public listings (no full_description / SEO). */
export const PUBLIC_LIST_SQL =
  "id, name, description, short_description, slug, price, badge, image, category, active, stock";

/** SQL select for detail + seasonal ops (expanded). Legacy callers omit seasonal cols via capability. */
export const PUBLIC_DETAIL_SQL_LEGACY =
  "id, name, description, short_description, full_description, slug, price, badge, image, category, stock, features, seo_title, meta_description, focus_keyword, og_image, active";

export const PUBLIC_DETAIL_SQL_EXPANDED =
  PUBLIC_DETAIL_SQL_LEGACY +
  ", product_version, lifecycle_mode, shop_listed, season_name, season_starts_at, season_ends_at, season_paused, season_show_countdown, season_ended_notice, available_offers_heading, season_available_ids, season_upcoming_ids";

export function filterSalesCardRows<T extends Record<string, unknown>>(
  rows: T[],
  nowMs: number,
  capability: SchemaCapability
): T[] {
  return rows.filter((r) => isSalesCardEligible(r, nowMs, capability));
}
