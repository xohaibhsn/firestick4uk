/**
 * Shared seasonal eligibility predicates.
 * Purchase/sales-card decisions are request-time and fail-closed under unknown schema.
 */
import {
  expandedRowHasOperationalFields,
  rowContradictsLegacyCapability,
  type SchemaCapability,
  type SchemaCapabilityMode,
} from "@/lib/productSchemaCapability";
import { parseUtcSqlToMs } from "@/lib/productSeasonLondon";

export type SeasonPhase =
  | "permanent"
  | "upcoming"
  | "live"
  | "ended"
  | "paused"
  | "incomplete"
  | "private";

export type ProductOpsRow = {
  id?: unknown;
  active?: unknown;
  lifecycle_mode?: unknown;
  shop_listed?: unknown;
  season_paused?: unknown;
  season_starts_at?: unknown;
  season_ends_at?: unknown;
  stock?: unknown;
};

function asFlag(v: unknown): 0 | 1 {
  return Number(v) === 1 ? 1 : 0;
}

export function isPublicPage(p: ProductOpsRow): boolean {
  return asFlag(p.active) === 1;
}

export function readLifecycleMode(
  p: ProductOpsRow,
  mode: SchemaCapabilityMode
): "permanent" | "seasonal" | "invalid" {
  if (mode === "legacy") return "permanent";
  if (!Object.prototype.hasOwnProperty.call(p, "lifecycle_mode") && mode === "expanded") {
    return "invalid";
  }
  const raw = p.lifecycle_mode;
  if (raw === undefined || raw === null || raw === "") {
    return mode === "expanded" ? "invalid" : "permanent";
  }
  const s = String(raw);
  if (s === "permanent" || s === "seasonal") return s;
  return "invalid";
}

export function hasValidWindow(p: ProductOpsRow, nowMs: number): boolean {
  void nowMs;
  const starts = parseUtcSqlToMs(p.season_starts_at);
  const ends = parseUtcSqlToMs(p.season_ends_at);
  if (starts == null || ends == null) return false;
  return starts < ends;
}

export function inWindow(p: ProductOpsRow, nowMs: number): boolean {
  const starts = parseUtcSqlToMs(p.season_starts_at);
  const ends = parseUtcSqlToMs(p.season_ends_at);
  if (starts == null || ends == null) return false;
  return starts <= nowMs && nowMs < ends;
}

/**
 * Authoritative purchase eligibility.
 * - legacy: active=1 only (no new stock-text rules), unless the row itself carries
 *   expanded operational fields that contradict a stale cached legacy result → deny
 * - expanded: window + pause; invalid lifecycle / incomplete ops → deny
 * - unknown: deny purchase (fail closed) while pages may still render if active=1
 */
export function isPurchasable(
  p: ProductOpsRow,
  nowMs: number,
  capability: SchemaCapability
): boolean {
  if (!isPublicPage(p)) return false;

  if (capability.mode === "unknown") return false;

  if (capability.mode === "legacy") {
    // Stale cache / schema-expanded mid-TTL: never authorize as legacy when row shows ops fields.
    if (rowContradictsLegacyCapability(p as Record<string, unknown>)) {
      return false;
    }
    return true;
  }

  // expanded
  if (!expandedRowHasOperationalFields(p as Record<string, unknown>)) return false;
  const life = readLifecycleMode(p, "expanded");
  if (life === "invalid") return false;
  if (life === "permanent") return true;
  if (asFlag(p.season_paused) === 1) return false;
  if (!hasValidWindow(p, nowMs)) return false;
  return inWindow(p, nowMs);
}

/**
 * Resolve capability for purchase when a cached legacy result may be stale relative to the row.
 * Prefer expanded evaluation when the row already exposes operational season fields.
 */
export function resolvePurchaseCapabilityForRow(
  p: ProductOpsRow,
  capability: SchemaCapability
): SchemaCapability {
  if (
    capability.mode === "legacy" &&
    rowContradictsLegacyCapability(p as Record<string, unknown>)
  ) {
    return {
      mode: "unknown",
      present: [],
      missing: [],
      reason: "stale_legacy_cache_contradicted_by_row_ops",
    };
  }
  return capability;
}

export function isSalesCardEligible(
  p: ProductOpsRow,
  nowMs: number,
  capability: SchemaCapability
): boolean {
  if (!isPurchasable(p, nowMs, capability)) return false;
  if (capability.mode === "legacy") return true;
  if (capability.mode === "unknown") return false;
  if (!Object.prototype.hasOwnProperty.call(p, "shop_listed")) return false;
  return asFlag(p.shop_listed) === 1;
}

export function resolveSeasonPhase(
  p: ProductOpsRow,
  nowMs: number,
  capability: SchemaCapability
): SeasonPhase {
  if (!isPublicPage(p)) return "private";
  if (capability.mode === "legacy") {
    if (rowContradictsLegacyCapability(p as Record<string, unknown>)) return "incomplete";
    return "permanent";
  }
  if (capability.mode === "unknown") {
    return "incomplete";
  }
  if (!expandedRowHasOperationalFields(p as Record<string, unknown>)) return "incomplete";
  const life = readLifecycleMode(p, "expanded");
  if (life === "invalid") return "incomplete";
  if (life === "permanent") return "permanent";
  if (asFlag(p.season_paused) === 1) return "paused";
  if (!hasValidWindow(p, nowMs)) return "incomplete";
  if (nowMs < (parseUtcSqlToMs(p.season_starts_at) as number)) return "upcoming";
  if (inWindow(p, nowMs)) return "live";
  return "ended";
}

export function isUpcomingPhase(
  p: ProductOpsRow,
  nowMs: number,
  capability: SchemaCapability
): boolean {
  return resolveSeasonPhase(p, nowMs, capability) === "upcoming";
}

export function isEndedOrPausedArchive(
  p: ProductOpsRow,
  nowMs: number,
  capability: SchemaCapability
): boolean {
  const phase = resolveSeasonPhase(p, nowMs, capability);
  return phase === "ended" || phase === "paused";
}

export function isHubLiveMember(
  p: ProductOpsRow,
  nowMs: number,
  capability: SchemaCapability
): boolean {
  return (
    readLifecycleMode(p, capability.mode) === "seasonal" &&
    isSalesCardEligible(p, nowMs, capability)
  );
}

export function isHubUpcomingMember(
  p: ProductOpsRow,
  nowMs: number,
  capability: SchemaCapability
): boolean {
  return isUpcomingPhase(p, nowMs, capability);
}

export function isHubPastMember(
  p: ProductOpsRow,
  nowMs: number,
  capability: SchemaCapability
): boolean {
  const phase = resolveSeasonPhase(p, nowMs, capability);
  return phase === "ended" || phase === "paused";
}

const MAX_ALT_IDS = 10;

export function parseProductIdArray(raw: unknown): { ok: true; ids: number[] } | { ok: false; error: string } {
  if (raw == null) return { ok: true, ids: [] };
  let arr: unknown = raw;
  if (typeof raw === "string") {
    try {
      arr = JSON.parse(raw);
    } catch {
      return { ok: false, error: "alternative IDs must be a JSON array of positive integers" };
    }
  }
  if (!Array.isArray(arr)) {
    return { ok: false, error: "alternative IDs must be an array" };
  }
  if (arr.length > MAX_ALT_IDS) {
    return { ok: false, error: `alternative IDs limited to ${MAX_ALT_IDS}` };
  }
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const item of arr) {
    if (typeof item !== "number" || !Number.isInteger(item) || item <= 0) {
      return { ok: false, error: "alternative IDs must be positive integers" };
    }
    if (seen.has(item)) continue;
    seen.add(item);
    ids.push(item);
  }
  return { ok: true, ids };
}

/** Available Offers: public + listed + purchasable (no private/missing/self leakage). */
export function filterAvailableOfferIds(
  selfId: number,
  ids: number[],
  byId: Map<number, ProductOpsRow>,
  nowMs: number,
  capability: SchemaCapability
): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const id of ids) {
    if (id === selfId || seen.has(id)) continue;
    const row = byId.get(id);
    if (!row) continue;
    if (!isSalesCardEligible(row, nowMs, capability)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Upcoming Offers: upcoming phase; does not require purchasable. */
export function filterUpcomingOfferIds(
  selfId: number,
  ids: number[],
  byId: Map<number, ProductOpsRow>,
  nowMs: number,
  capability: SchemaCapability
): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const id of ids) {
    if (id === selfId || seen.has(id)) continue;
    const row = byId.get(id);
    if (!row) continue;
    if (!isUpcomingPhase(row, nowMs, capability)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
