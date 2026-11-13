import pool from "@/lib/db";
import { detectProductSchemaCapability } from "@/lib/productSchemaCapabilityServer";
import {
  filterSalesCardRows,
  PUBLIC_LIST_SQL,
  toPublicListProduct,
  type PublicListProduct,
} from "@/lib/productPublicDto";
import { floorSecondUtcMs, normalizeSeasonalUtcFields } from "@/lib/productSeasonLondon";
import { queryWithSeasonalUtc } from "@/lib/productSeasonalQuery";

export type PublicProduct = PublicListProduct;

/**
 * Default public product listing — sales-card eligible only.
 * Legacy schema: active=1. Expanded: also shop_listed + purchasable window.
 */
export async function getPublicActiveProducts(): Promise<PublicProduct[]> {
  try {
    const capability = await detectProductSchemaCapability();
    const nowMs = floorSecondUtcMs();
    let cols = PUBLIC_LIST_SQL;
    if (capability.mode === "expanded") {
      cols +=
        ", lifecycle_mode, shop_listed, season_paused, season_starts_at, season_ends_at, product_version";
    }
    const [rows]: any = await queryWithSeasonalUtc(
      pool,
      `SELECT ${cols}
       FROM products
       WHERE active = 1
       ORDER BY id ASC`
    );
    const list = (Array.isArray(rows) ? rows : []).map((r: any) =>
      normalizeSeasonalUtcFields(r)
    );
    return filterSalesCardRows(list, nowMs, capability).map((r) =>
      toPublicListProduct(r, { nowMs, capability })
    );
  } catch {
    return [];
  }
}
