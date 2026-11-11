/**
 * Product seasonal schema capability — never fail open.
 *
 * Modes:
 * - legacy: positively identified pre-expansion schema (required new columns absent)
 * - expanded: all required seasonal columns present
 * - unknown: detection failure or partial/incompatible column set — deny purchasing & ops writes
 */

export const SEASONAL_REQUIRED_COLUMNS = [
  "product_version",
  "lifecycle_mode",
  "shop_listed",
  "season_name",
  "season_starts_at",
  "season_ends_at",
  "season_paused",
  "season_show_countdown",
  "season_ended_notice",
  "available_offers_heading",
  "season_available_ids",
  "season_upcoming_ids",
] as const;

export type SeasonalColumn = (typeof SEASONAL_REQUIRED_COLUMNS)[number];

export type SchemaCapabilityMode = "legacy" | "expanded" | "unknown";

export type SchemaCapability = {
  mode: SchemaCapabilityMode;
  present: SeasonalColumn[];
  missing: SeasonalColumn[];
  reason: string;
};

export type ColumnPresenceSource = {
  /** Column names known to exist on products (information_schema or DESCRIBE). */
  columnNames: string[] | null;
  /** Detection error — forces unknown (not legacy). */
  error?: string | null;
};

/**
 * Positive legacy only when the products table is established (baseline columns present)
 * and every required seasonal column is confirmed absent.
 * Empty metadata / table-not-established must NOT become trusted legacy.
 */
export const LEGACY_BASELINE_COLUMNS = ["id", "name", "active", "price"] as const;

export function resolveSchemaCapability(source: ColumnPresenceSource): SchemaCapability {
  if (source.error) {
    return {
      mode: "unknown",
      present: [],
      missing: [...SEASONAL_REQUIRED_COLUMNS],
      reason: `capability_detection_failed: ${source.error}`,
    };
  }
  if (!Array.isArray(source.columnNames)) {
    return {
      mode: "unknown",
      present: [],
      missing: [...SEASONAL_REQUIRED_COLUMNS],
      reason: "capability_detection_unavailable",
    };
  }

  if (source.columnNames.length === 0) {
    return {
      mode: "unknown",
      present: [],
      missing: [...SEASONAL_REQUIRED_COLUMNS],
      reason: "products_table_not_established_or_empty_metadata",
    };
  }

  const set = new Set(source.columnNames.map((c) => String(c)));
  const present = SEASONAL_REQUIRED_COLUMNS.filter((c) => set.has(c));
  const missing = SEASONAL_REQUIRED_COLUMNS.filter((c) => !set.has(c));
  const baselinePresent = LEGACY_BASELINE_COLUMNS.every((c) => set.has(c));

  if (missing.length === 0) {
    return { mode: "expanded", present, missing, reason: "all_seasonal_columns_present" };
  }
  if (present.length === 0 && baselinePresent) {
    return { mode: "legacy", present, missing, reason: "no_seasonal_columns_present" };
  }
  if (present.length === 0 && !baselinePresent) {
    return {
      mode: "unknown",
      present,
      missing,
      reason: "incomplete_products_metadata_not_trusted_legacy",
    };
  }
  return {
    mode: "unknown",
    present,
    missing,
    reason: "partial_or_incompatible_seasonal_schema",
  };
}

/**
 * A single product row / DTO missing properties does NOT prove legacy schema.
 * Use only after capability.mode === "expanded" to detect incomplete operational data.
 */
export function expandedRowHasOperationalFields(row: Record<string, unknown>): boolean {
  return (
    Object.prototype.hasOwnProperty.call(row, "lifecycle_mode") &&
    Object.prototype.hasOwnProperty.call(row, "shop_listed") &&
    Object.prototype.hasOwnProperty.call(row, "product_version")
  );
}

/**
 * Row evidence of seasonal columns contradicts a cached/stale "legacy" capability.
 * Callers must refresh capability or fail closed — never authorize purchase as legacy.
 */
export function rowContradictsLegacyCapability(row: Record<string, unknown>): boolean {
  return (
    Object.prototype.hasOwnProperty.call(row, "lifecycle_mode") ||
    Object.prototype.hasOwnProperty.call(row, "shop_listed") ||
    Object.prototype.hasOwnProperty.call(row, "product_version") ||
    Object.prototype.hasOwnProperty.call(row, "season_paused") ||
    Object.prototype.hasOwnProperty.call(row, "season_starts_at") ||
    Object.prototype.hasOwnProperty.call(row, "season_ends_at")
  );
}

type CacheEntry = { at: number; capability: SchemaCapability };
const cacheByContext = new Map<string, CacheEntry>();
export const SCHEMA_CAPABILITY_CACHE_TTL_MS = 30_000;

export function getCachedSchemaCapability(contextKey = "default"): SchemaCapability | null {
  const cached = cacheByContext.get(contextKey);
  if (!cached) return null;
  if (Date.now() - cached.at > SCHEMA_CAPABILITY_CACHE_TTL_MS) {
    cacheByContext.delete(contextKey);
    return null;
  }
  return cached.capability;
}

export function setCachedSchemaCapability(
  capability: SchemaCapability,
  contextKey = "default"
): void {
  cacheByContext.set(contextKey, { at: Date.now(), capability });
}

export function clearSchemaCapabilityCache(contextKey?: string): void {
  if (contextKey == null) {
    cacheByContext.clear();
    return;
  }
  cacheByContext.delete(contextKey);
}

/** Invalidate after migrations / capability-changing ops (tests + admin hooks). */
export function rememberSchemaCapability(
  capability: SchemaCapability,
  contextKey = "default"
): SchemaCapability {
  setCachedSchemaCapability(capability, contextKey);
  return capability;
}

/** Test helper: inject a frozen cache entry with controlled age. */
export function __setSchemaCapabilityCacheForTests(opts: {
  capability: SchemaCapability;
  atMs: number;
  contextKey?: string;
}): void {
  cacheByContext.set(opts.contextKey || "default", {
    at: opts.atMs,
    capability: opts.capability,
  });
}
