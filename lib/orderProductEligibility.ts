/**
 * Authoritative product eligibility for order creation.
 * Locks rows in ascending id order inside an open transaction.
 */
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import {
  rowContradictsLegacyCapability,
  type SchemaCapability,
} from "@/lib/productSchemaCapability";
import {
  clearProductSchemaCapabilityCache,
  detectProductSchemaCapability,
} from "@/lib/productSchemaCapabilityServer";
import { isPurchasable } from "@/lib/productSeasonEligibility";
import { floorSecondUtcMs, normalizeSeasonalUtcFields } from "@/lib/productSeasonLondon";
import { queryWithSeasonalUtc } from "@/lib/productSeasonalQuery";

export type OrderProductRow = {
  id: number;
  name: string;
  price: number | string;
  category: string | null;
  stock: string | null;
  active: number;
  lifecycle_mode?: string;
  shop_listed?: number;
  season_paused?: number;
  season_starts_at?: string | null;
  season_ends_at?: string | null;
  product_version?: number;
};

function isUnknownColumnError(err: unknown): boolean {
  const e = err as { code?: string; errno?: number; message?: string };
  if (e?.code === "ER_BAD_FIELD_ERROR" || e?.errno === 1054) return true;
  return /Unknown column/i.test(String(e?.message || err || ""));
}

const EXPANDED_SELECT = `SELECT id, name, price, category, stock, active,
  lifecycle_mode, shop_listed, season_paused, season_starts_at, season_ends_at, product_version
  FROM products WHERE id IN (%PH%) ORDER BY id ASC FOR UPDATE`;

const LEGACY_SELECT = `SELECT id, name, price, category, stock, active
  FROM products WHERE id IN (%PH%) ORDER BY id ASC FOR UPDATE`;

/**
 * Lock + authorize products for an order.
 * Never manufactures expanded capability from a successful subset SELECT.
 * Unresolved capability → deny purchase; public pages remain separately resolvable.
 */
export async function lockAndAuthorizeOrderProducts(opts: {
  conn: PoolConnection;
  productIds: number[];
  capability?: SchemaCapability;
  nowMs?: number;
  detectCapability?: typeof detectProductSchemaCapability;
  schemaName?: string;
  contextKey?: string;
}): Promise<
  | { ok: true; productsById: Map<number, OrderProductRow>; capability: SchemaCapability; nowMs: number }
  | { ok: false; error: string; code: string }
> {
  const sortedIds = [...new Set(opts.productIds)]
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0)
    .sort((a, b) => a - b);

  if (!sortedIds.length) {
    return { ok: false, error: "Order items are required.", code: "validation" };
  }

  const detect = opts.detectCapability || detectProductSchemaCapability;
  let capability =
    opts.capability ||
    (await detect(opts.conn, {
      bypassCache: false,
      schemaName: opts.schemaName,
      contextKey: opts.contextKey,
    }));

  const placeholders = sortedIds.map(() => "?").join(",");
  let rows: OrderProductRow[] = [];
  let usedExpandedSelect = false;

  try {
    const [expandedRows] = await queryWithSeasonalUtc<RowDataPacket[]>(
      opts.conn,
      EXPANDED_SELECT.replace("%PH%", placeholders),
      sortedIds
    );
    rows = (Array.isArray(expandedRows) ? expandedRows : []).map((r) =>
      normalizeSeasonalUtcFields(r as OrderProductRow)
    ) as OrderProductRow[];
    usedExpandedSelect = true;
  } catch (err) {
    if (!isUnknownColumnError(err)) throw err;
    const [legacyRows] = await opts.conn.query<RowDataPacket[]>(
      LEGACY_SELECT.replace("%PH%", placeholders),
      sortedIds
    );
    rows = (Array.isArray(legacyRows) ? legacyRows : []) as OrderProductRow[];
    usedExpandedSelect = false;
  }

  // Sample eligibility AFTER locks acquired.
  const nowMs = floorSecondUtcMs(opts.nowMs ?? Date.now());

  if (usedExpandedSelect && capability.mode === "legacy") {
    // Stale cache: columns exist — refresh; never invent expanded from SELECT alone.
    clearProductSchemaCapabilityCache({
      schemaName: opts.schemaName,
      contextKey: opts.contextKey,
      db: opts.conn,
    });
    capability = await detect(opts.conn, {
      bypassCache: true,
      schemaName: opts.schemaName,
      contextKey: opts.contextKey,
    });
  } else if (!usedExpandedSelect && capability.mode === "expanded") {
    capability = {
      mode: "unknown",
      present: [],
      missing: [],
      reason: "expanded_capability_but_select_missing_columns",
    };
  }

  // Partial/unknown stays unknown — deny purchase even if subset SELECT worked.
  if (capability.mode === "unknown") {
    return {
      ok: false,
      error:
        "One or more items in your cart are no longer available. Please remove them and try again.",
      code: "not_purchasable",
    };
  }

  const productsById = new Map<number, OrderProductRow>();

  for (const row of rows) {
    const id = Number(row.id);
    if (Number(row.active) !== 1) continue;

    let capForRow = capability;
    if (
      capability.mode === "legacy" &&
      rowContradictsLegacyCapability(row as unknown as Record<string, unknown>)
    ) {
      clearProductSchemaCapabilityCache({
        schemaName: opts.schemaName,
        contextKey: opts.contextKey,
        db: opts.conn,
      });
      capForRow = {
        mode: "unknown",
        present: [],
        missing: [],
        reason: "stale_legacy_cache_contradicted_by_row_ops",
      };
    }

    if (!isPurchasable(row, nowMs, capForRow)) continue;
    productsById.set(id, row);
  }

  for (const id of sortedIds) {
    if (!productsById.has(id)) {
      return {
        ok: false,
        error:
          "One or more items in your cart are no longer available. Please remove them and try again.",
        code: "not_purchasable",
      };
    }
  }

  return { ok: true, productsById, capability, nowMs };
}
