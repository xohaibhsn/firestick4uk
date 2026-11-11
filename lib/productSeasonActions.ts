/**
 * Strict discriminated lifecycle PATCH payloads for expanded seasonal schema.
 */
import { parseLondonWallInput, type LondonWallInput } from "@/lib/productSeasonLondon";
import { parseProductIdArray } from "@/lib/productSeasonEligibility";

export const PRODUCT_VERSION_MAX = 4294967295;

export type SeasonActionName =
  | "set_lifecycle_settings"
  | "set_season_window"
  | "activate_now"
  | "pause"
  | "resume"
  | "end_early"
  | "set_shop_listed"
  | "set_private_active"
  | "set_archive_presentation"
  | "set_visibility_active"; // task-01 private toggle alias under versioned contract

const ACTION_ALLOW: Record<SeasonActionName, readonly string[]> = {
  set_lifecycle_settings: ["id", "action", "expected_version", "lifecycle_mode", "season_name"],
  set_season_window: ["id", "action", "expected_version", "starts_at_london", "ends_at_london"],
  activate_now: ["id", "action", "expected_version"],
  pause: ["id", "action", "expected_version"],
  resume: ["id", "action", "expected_version"],
  end_early: ["id", "action", "expected_version"],
  set_shop_listed: ["id", "action", "expected_version", "shop_listed"],
  set_private_active: ["id", "action", "expected_version", "active"],
  set_archive_presentation: [
    "id",
    "action",
    "expected_version",
    "season_show_countdown",
    "season_ended_notice",
    "available_offers_heading",
    "season_available_ids",
    "season_upcoming_ids",
  ],
  set_visibility_active: ["id", "action", "expected_version", "active"],
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export function parsePositiveInt(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isInteger(v) || v <= 0) return null;
  return v;
}

export function parseVersion(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > PRODUCT_VERSION_MAX) return null;
  return v;
}

export function parseFlag01(v: unknown): 0 | 1 | null {
  if (v === 0 || v === 1) return v;
  return null;
}

export type ParsedSeasonAction =
  | {
      action: "set_lifecycle_settings";
      id: number;
      expected_version: number;
      lifecycle_mode: "permanent" | "seasonal";
      season_name: string | null;
    }
  | {
      action: "set_season_window";
      id: number;
      expected_version: number;
      starts_at_london: LondonWallInput;
      ends_at_london: LondonWallInput;
      startsUtcSql: string;
      endsUtcSql: string;
      startsUtcMs: number;
      endsUtcMs: number;
    }
  | { action: "activate_now"; id: number; expected_version: number }
  | { action: "pause"; id: number; expected_version: number }
  | { action: "resume"; id: number; expected_version: number }
  | { action: "end_early"; id: number; expected_version: number }
  | { action: "set_shop_listed"; id: number; expected_version: number; shop_listed: 0 | 1 }
  | { action: "set_private_active"; id: number; expected_version: number; active: 0 | 1 }
  | { action: "set_visibility_active"; id: number; expected_version: number; active: 0 | 1 }
  | {
      action: "set_archive_presentation";
      id: number;
      expected_version: number;
      season_show_countdown?: 0 | 1;
      season_ended_notice?: string | null;
      available_offers_heading?: string | null;
      season_available_ids?: number[];
      season_upcoming_ids?: number[];
    };

export type ParseActionResult =
  | { ok: true; payload: ParsedSeasonAction }
  | { ok: false; error: string; code: "validation" };

export function parseSeasonActionPayload(body: unknown): ParseActionResult {
  if (!isPlainObject(body)) {
    return { ok: false, error: "Payload must be a JSON object", code: "validation" };
  }
  const action = String(body.action || "") as SeasonActionName;
  if (!(action in ACTION_ALLOW)) {
    return { ok: false, error: "Unknown or missing action", code: "validation" };
  }
  const allowed = ACTION_ALLOW[action];
  const unexpected = Object.keys(body).filter((k) => !(allowed as readonly string[]).includes(k));
  if (unexpected.length) {
    return {
      ok: false,
      error: `Unexpected fields for ${action}: ${unexpected.join(", ")}`,
      code: "validation",
    };
  }

  const id = parsePositiveInt(body.id);
  const expected_version = parseVersion(body.expected_version);
  if (id == null) return { ok: false, error: "id must be a positive integer", code: "validation" };
  if (expected_version == null) {
    return { ok: false, error: "expected_version must be an integer 0..4294967295", code: "validation" };
  }

  if (action === "set_lifecycle_settings") {
    const mode = body.lifecycle_mode;
    if (mode !== "permanent" && mode !== "seasonal") {
      return { ok: false, error: "lifecycle_mode must be permanent or seasonal", code: "validation" };
    }
    let season_name: string | null = null;
    if (mode === "seasonal") {
      const name = String(body.season_name ?? "").trim();
      if (!name || name.length > 120) {
        return { ok: false, error: "season_name required (1..120) for seasonal", code: "validation" };
      }
      season_name = name;
    }
    return {
      ok: true,
      payload: { action, id, expected_version, lifecycle_mode: mode, season_name },
    };
  }

  if (action === "set_season_window") {
    const starts = parseLondonWallInput(body.starts_at_london);
    if (!starts.ok) return { ok: false, error: `starts_at_london: ${starts.error}`, code: "validation" };
    const ends = parseLondonWallInput(body.ends_at_london);
    if (!ends.ok) return { ok: false, error: `ends_at_london: ${ends.error}`, code: "validation" };
    if (starts.utcMs >= ends.utcMs) {
      return { ok: false, error: "season window requires starts_at < ends_at", code: "validation" };
    }
    return {
      ok: true,
      payload: {
        action,
        id,
        expected_version,
        starts_at_london: body.starts_at_london as LondonWallInput,
        ends_at_london: body.ends_at_london as LondonWallInput,
        startsUtcSql: starts.utcSql,
        endsUtcSql: ends.utcSql,
        startsUtcMs: starts.utcMs,
        endsUtcMs: ends.utcMs,
      },
    };
  }

  if (action === "activate_now" || action === "pause" || action === "resume" || action === "end_early") {
    return { ok: true, payload: { action, id, expected_version } };
  }

  if (action === "set_shop_listed") {
    const shop_listed = parseFlag01(body.shop_listed);
    if (shop_listed == null) {
      return { ok: false, error: "shop_listed must be 0 or 1", code: "validation" };
    }
    return { ok: true, payload: { action, id, expected_version, shop_listed } };
  }

  if (action === "set_private_active" || action === "set_visibility_active") {
    const active = parseFlag01(body.active);
    if (active == null) return { ok: false, error: "active must be 0 or 1", code: "validation" };
    return { ok: true, payload: { action, id, expected_version, active } };
  }

  // set_archive_presentation
  const hasAny =
    Object.prototype.hasOwnProperty.call(body, "season_show_countdown") ||
    Object.prototype.hasOwnProperty.call(body, "season_ended_notice") ||
    Object.prototype.hasOwnProperty.call(body, "available_offers_heading") ||
    Object.prototype.hasOwnProperty.call(body, "season_available_ids") ||
    Object.prototype.hasOwnProperty.call(body, "season_upcoming_ids");
  if (!hasAny) {
    return { ok: false, error: "set_archive_presentation requires at least one presentation field", code: "validation" };
  }
  const out: Extract<ParsedSeasonAction, { action: "set_archive_presentation" }> = {
    action: "set_archive_presentation",
    id,
    expected_version,
  };
  if (Object.prototype.hasOwnProperty.call(body, "season_show_countdown")) {
    const f = parseFlag01(body.season_show_countdown);
    if (f == null) return { ok: false, error: "season_show_countdown must be 0 or 1", code: "validation" };
    out.season_show_countdown = f;
  }
  if (Object.prototype.hasOwnProperty.call(body, "season_ended_notice")) {
    if (body.season_ended_notice === null) out.season_ended_notice = null;
    else {
      const s = String(body.season_ended_notice);
      if (s.length > 5000) return { ok: false, error: "season_ended_notice too long", code: "validation" };
      out.season_ended_notice = s;
    }
  }
  if (Object.prototype.hasOwnProperty.call(body, "available_offers_heading")) {
    if (body.available_offers_heading === null) out.available_offers_heading = null;
    else {
      const s = String(body.available_offers_heading).trim();
      if (s.length > 120) return { ok: false, error: "available_offers_heading too long", code: "validation" };
      out.available_offers_heading = s || null;
    }
  }
  if (Object.prototype.hasOwnProperty.call(body, "season_available_ids")) {
    const p = parseProductIdArray(body.season_available_ids);
    if (!p.ok) return { ok: false, error: p.error, code: "validation" };
    if (p.ids.includes(id)) return { ok: false, error: "season_available_ids cannot include self", code: "validation" };
    out.season_available_ids = p.ids;
  }
  if (Object.prototype.hasOwnProperty.call(body, "season_upcoming_ids")) {
    const p = parseProductIdArray(body.season_upcoming_ids);
    if (!p.ok) return { ok: false, error: p.error, code: "validation" };
    if (p.ids.includes(id)) return { ok: false, error: "season_upcoming_ids cannot include self", code: "validation" };
    out.season_upcoming_ids = p.ids;
  }
  return { ok: true, payload: out };
}
