/**
 * Seasonal hub publication helpers (site_content key + validation + effective public state).
 */
import type { Pool } from "mysql2/promise";
import {
  isHubLiveMember,
  isHubPastMember,
  isHubUpcomingMember,
} from "@/lib/productSeasonEligibility";
import type { SchemaCapability } from "@/lib/productSchemaCapability";
import { detectProductSchemaCapability } from "@/lib/productSchemaCapabilityServer";
import { floorSecondUtcMs, normalizeSeasonalUtcFields } from "@/lib/productSeasonLondon";
import { queryWithSeasonalUtc } from "@/lib/productSeasonalQuery";

export const SEASONAL_HUB_PUBLISHED_KEY = "seasonal_hub_published";

export type HubRowsLoadResult =
  | { ok: true; rows: any[] }
  | { ok: false; error: string; code: "read_failed" | "capability_not_expanded" };

export type HubPublicationFlagResult =
  | { ok: true; published: boolean }
  | { ok: false; error: string; code: "flag_read_failed" };

/**
 * Typed publication-flag read. Never converts a failed read into factual false/unpublished.
 */
export async function readSeasonalHubPublicationFlag(db: {
  query: Pool["query"];
}): Promise<HubPublicationFlagResult> {
  try {
    const [rows]: any = await db.query(
      `SELECT content_value FROM site_content WHERE content_key = ? LIMIT 1`,
      [SEASONAL_HUB_PUBLISHED_KEY]
    );
    return { ok: true, published: String(rows?.[0]?.content_value || "") === "1" };
  } catch (err: any) {
    return {
      ok: false,
      error: String(err?.message || err || "hub_publication_flag_read_failed"),
      code: "flag_read_failed",
    };
  }
}

/**
 * Convenience for callers that only need a boolean when the flag is known.
 * Failed reads throw — do not use this to treat outages as unpublished.
 */
export async function isSeasonalHubPublished(db: { query: Pool["query"] }): Promise<boolean> {
  const flag = await readSeasonalHubPublicationFlag(db);
  if (!flag.ok) {
    throw new Error(flag.error || "hub_publication_flag_read_failed");
  }
  return flag.published;
}

/** Server-side: refuse publishing an empty/thin hub. */
export function canPublishSeasonalHub(opts: {
  rows: any[];
  nowMs: number;
  capability: SchemaCapability;
}): { ok: true } | { ok: false; error: string } {
  if (opts.capability.mode !== "expanded") {
    return { ok: false, error: "Seasonal hub requires expanded product schema" };
  }
  const live = opts.rows.filter((r) => isHubLiveMember(r, opts.nowMs, opts.capability));
  const upcoming = opts.rows.filter((r) => isHubUpcomingMember(r, opts.nowMs, opts.capability));
  const past = opts.rows.filter((r) => isHubPastMember(r, opts.nowMs, opts.capability));
  if (live.length + upcoming.length + past.length === 0) {
    return {
      ok: false,
      error: "Cannot publish an empty seasonal hub; configure at least one public seasonal product",
    };
  }
  return { ok: true };
}

/**
 * Load public seasonal hub candidate rows.
 * Propagates typed failure — never collapses read errors into [].
 */
export async function loadPublicSeasonalHubRows(
  db: { query: Pool["query"] },
  capability: SchemaCapability
): Promise<HubRowsLoadResult> {
  if (capability.mode !== "expanded") {
    return { ok: false, error: "expanded schema required", code: "capability_not_expanded" };
  }
  try {
    const [rows]: any = await queryWithSeasonalUtc(
      db,
      `SELECT id, name, description, short_description, slug, price, badge, image, category, active,
              lifecycle_mode, shop_listed, season_paused, season_name, season_starts_at, season_ends_at, product_version
       FROM products WHERE active = 1 AND lifecycle_mode = 'seasonal' ORDER BY id ASC`
    );
    return {
      ok: true,
      rows: (Array.isArray(rows) ? rows : []).map((r: any) => normalizeSeasonalUtcFields(r)),
    };
  } catch (err: any) {
    return {
      ok: false,
      error: String(err?.message || err || "hub_product_read_failed"),
      code: "read_failed",
    };
  }
}

/**
 * Effective public hub decision for rendering / robots / inbound links / sitemap.
 * Does not mutate the stored publication flag.
 */
export async function resolveSeasonalHubPublicState(
  db: { query: Pool["query"] },
  opts?: { nowMs?: number; capability?: SchemaCapability }
): Promise<{
  /**
   * Known publication flag when readable. `null` means the flag read failed
   * (unknown/unavailable) — never treat as factual unpublished.
   */
  storedPublished: boolean | null;
  capability: SchemaCapability;
  rows: any[];
  memberCount: number;
  /** True only when stored published AND useful public members resolved. */
  effectivelyPublic: boolean;
  /** Known-empty after successful content resolution returning no useful members. */
  knownEmpty: boolean;
  /** Failed publication/capability/product reads — not empty, not unpublished. */
  temporarilyUnavailable: boolean;
}> {
  const flag = await readSeasonalHubPublicationFlag(db);
  if (!flag.ok) {
    return {
      storedPublished: null,
      capability: opts?.capability || {
        mode: "unknown",
        present: [],
        missing: [],
        reason: "hub_publish_flag_read_failed",
      },
      rows: [],
      memberCount: 0,
      effectivelyPublic: false,
      knownEmpty: false,
      temporarilyUnavailable: true,
    };
  }
  const storedPublished = flag.published;

  let capability: SchemaCapability;
  try {
    capability = opts?.capability || (await detectProductSchemaCapability(db as any));
  } catch {
    return {
      storedPublished,
      capability: {
        mode: "unknown",
        present: [],
        missing: [],
        reason: "hub_capability_detect_failed",
      },
      rows: [],
      memberCount: 0,
      effectivelyPublic: false,
      knownEmpty: false,
      // Capability failure while published → unavailable; while unpublished still unknown of content but flag is known 0.
      temporarilyUnavailable: storedPublished === true,
    };
  }

  const nowMs = floorSecondUtcMs(opts?.nowMs ?? Date.now());

  if (!storedPublished) {
    return {
      storedPublished: false,
      capability,
      rows: [],
      memberCount: 0,
      effectivelyPublic: false,
      knownEmpty: false,
      temporarilyUnavailable: false,
    };
  }

  if (capability.mode !== "expanded") {
    return {
      storedPublished: true,
      capability,
      rows: [],
      memberCount: 0,
      effectivelyPublic: false,
      knownEmpty: false,
      temporarilyUnavailable: true,
    };
  }

  const loaded = await loadPublicSeasonalHubRows(db, capability);
  if (!loaded.ok) {
    return {
      storedPublished: true,
      capability,
      rows: [],
      memberCount: 0,
      effectivelyPublic: false,
      knownEmpty: false,
      temporarilyUnavailable: true,
    };
  }

  const rows = loaded.rows;
  const live = rows.filter((r) => isHubLiveMember(r, nowMs, capability));
  const upcoming = rows.filter((r) => isHubUpcomingMember(r, nowMs, capability));
  const past = rows.filter((r) => isHubPastMember(r, nowMs, capability));
  const memberCount = live.length + upcoming.length + past.length;

  return {
    storedPublished: true,
    capability,
    rows,
    memberCount,
    effectivelyPublic: memberCount > 0,
    knownEmpty: memberCount === 0,
    temporarilyUnavailable: false,
  };
}

/**
 * Validate a requested write of seasonal_hub_published before committing settings.
 * Publishing ("1") requires canPublishSeasonalHub against current public seasonal rows.
 * Read failure → unavailable (not "empty").
 */
export async function validateSeasonalHubPublicationWrite(opts: {
  db: { query: Pool["query"] };
  nextValue: string;
  nowMs?: number;
}): Promise<
  | { ok: true }
  | { ok: false; error: string; status: number; code?: string }
> {
  const next = String(opts.nextValue ?? "").trim();
  if (next !== "1") {
    return { ok: true };
  }
  let capability: SchemaCapability;
  try {
    capability = await detectProductSchemaCapability(opts.db as any);
  } catch (err: any) {
    return {
      ok: false,
      error: "Seasonal hub publication validation temporarily unavailable",
      status: 503,
      code: "hub_validation_unavailable",
    };
  }
  const nowMs = floorSecondUtcMs(opts.nowMs ?? Date.now());
  const loaded = await loadPublicSeasonalHubRows(opts.db, capability);
  if (!loaded.ok) {
    return {
      ok: false,
      error: "Seasonal hub publication validation temporarily unavailable",
      status: 503,
      code: "hub_validation_unavailable",
    };
  }
  const gate = canPublishSeasonalHub({ rows: loaded.rows, nowMs, capability });
  if (!gate.ok) {
    return { ok: false, error: gate.error, status: 400, code: "seasonal_hub_empty" };
  }
  return { ok: true };
}
