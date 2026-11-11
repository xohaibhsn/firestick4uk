/**
 * Europe/London wall-time ↔ UTC for seasonal product windows.
 * Portable — does not rely on process timezone for seasonal DATETIME fields.
 *
 * Input: { wall: "YYYY-MM-DDTHH:mm:ss", offset: "+00:00"|"+01:00" }
 * Storage: UTC DATETIME string "YYYY-MM-DD HH:mm:ss" (second precision).
 */

export type LondonOffset = "+00:00" | "+01:00";

export type LondonWallInput = {
  wall: string;
  offset: LondonOffset;
};

export type LondonParseOk = {
  ok: true;
  utcSql: string;
  utcIso: string;
  utcMs: number;
};

export type LondonParseErr = {
  ok: false;
  code: "invalid_london_wall" | "ambiguous_london_wall" | "validation";
  error: string;
};

const WALL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/;
const UTC_SQL_RE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/;
const ISO_OFFSET_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;

const SEASONAL_UTC_KEYS = [
  "season_starts_at",
  "season_ends_at",
] as const;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** Reject calendar overflow (e.g. Feb 30) — Date.UTC normalizes otherwise. */
export function assertValidUtcCalendarParts(
  y: number,
  mo: number,
  da: number,
  h: number,
  mi: number,
  s: number
): boolean {
  if (![y, mo, da, h, mi, s].every((n) => Number.isInteger(n))) return false;
  if (mo < 1 || mo > 12 || da < 1 || da > 31) return false;
  if (h < 0 || h > 23 || mi < 0 || mi > 59 || s < 0 || s > 59) return false;
  const ms = Date.UTC(y, mo - 1, da, h, mi, s);
  if (!Number.isFinite(ms)) return false;
  const d = new Date(ms);
  return (
    d.getUTCFullYear() === y &&
    d.getUTCMonth() + 1 === mo &&
    d.getUTCDate() === da &&
    d.getUTCHours() === h &&
    d.getUTCMinutes() === mi &&
    d.getUTCSeconds() === s
  );
}

/** Format an Instant in Europe/London as wall + numeric offset minutes. */
export function londonPartsFromUtcMs(utcMs: number): {
  wall: string;
  offset: LondonOffset;
  offsetMinutes: number;
} | null {
  if (!Number.isFinite(utcMs)) return null;
  const dtf = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "longOffset",
  });
  const parts = dtf.formatToParts(new Date(utcMs));
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  const y = get("year");
  const mo = get("month");
  const da = get("day");
  const h = get("hour");
  const mi = get("minute");
  const s = get("second");
  const tzn = get("timeZoneName") || "";
  if (!y || !mo || !da || h == null || mi == null || s == null) return null;

  let offsetMinutes = 0;
  const m = tzn.match(/(?:GMT|UTC)([+-])(\d{1,2})(?::?(\d{2}))?/i);
  if (m) {
    const sign = m[1] === "-" ? -1 : 1;
    offsetMinutes = sign * (Number(m[2]) * 60 + Number(m[3] || 0));
  } else if (/GMT|UTC/i.test(tzn) && !/[+-]/.test(tzn)) {
    offsetMinutes = 0;
  } else {
    return null;
  }

  const offset: LondonOffset =
    offsetMinutes === 60 ? "+01:00" : offsetMinutes === 0 ? "+00:00" : (null as any);
  if (offset !== "+00:00" && offset !== "+01:00") return null;

  return {
    wall: `${y}-${mo}-${da}T${h}:${mi}:${s}`,
    offset,
    offsetMinutes,
  };
}

export function utcMsToUtcSql(utcMs: number): string {
  const d = new Date(utcMs);
  return (
    `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ` +
    `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`
  );
}

export function utcMsToUtcIso(utcMs: number): string {
  return new Date(utcMs).toISOString().replace(/\.\d{3}Z$/, "Z");
}

function parseOffsetToMinutes(off: string): number | null {
  if (off === "Z" || off === "z") return 0;
  const m = off.match(/^([+-])(\d{2}):?(\d{2})$/);
  if (!m) return null;
  const sign = m[1] === "-" ? -1 : 1;
  return sign * (Number(m[2]) * 60 + Number(m[3]));
}

/**
 * Model mysql2's default DATETIME→Date trap for tests: the driver builds a
 * Date whose *local* wall equals the stored DATETIME text. getUTC* on that
 * Date reads a shifted instant and must not be used for eligibility.
 */
export function mysql2LocalDateTrapFromUtcSql(utcSql: string, processTzOffsetMinutes: number): Date {
  const m = UTC_SQL_RE.exec(String(utcSql).trim());
  if (!m) throw new Error("invalid utc sql for trap model");
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const da = Number(m[3]);
  const h = Number(m[4]);
  const mi = Number(m[5]);
  const s = Number(m[6]);
  // Instant such that local wall in a zone with this offset equals the SQL wall.
  const asUtc = Date.UTC(y, mo - 1, da, h, mi, s);
  return new Date(asUtc + processTzOffsetMinutes * 60_000);
}

/**
 * Parse stored seasonal UTC value to ms.
 * - SQL "YYYY-MM-DD HH:mm:ss" → UTC (no process TZ)
 * - ISO with explicit Z/offset → honor that offset (do not treat wall as UTC)
 * - Date objects → rejected (ambiguous under process TZ). Use queryWithSeasonalUtc
 *   so seasonal columns arrive as raw UTC SQL strings before Date decoding.
 * Rejects trailing junk on SQL form and calendar overflow.
 */
export function parseUtcSqlToMs(value: unknown): number | null {
  if (value == null || value === "") return null;

  if (value instanceof Date) {
    // Do not use getUTC* or local getters as a substitute for raw UTC reads.
    return null;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const iso = ISO_OFFSET_RE.exec(raw);
  if (iso) {
    const y = Number(iso[1]);
    const mo = Number(iso[2]);
    const da = Number(iso[3]);
    const h = Number(iso[4]);
    const mi = Number(iso[5]);
    const s = Number(iso[6]);
    if (!assertValidUtcCalendarParts(y, mo, da, h, mi, s)) return null;
    const offMin = parseOffsetToMinutes(iso[7]);
    if (offMin == null) return null;
    const asUtc = Date.UTC(y, mo - 1, da, h, mi, s);
    const utcMs = asUtc - offMin * 60_000;
    return Number.isFinite(utcMs) ? Math.floor(utcMs / 1000) * 1000 : null;
  }

  // Strict UTC SQL — no trailing junk
  const m = UTC_SQL_RE.exec(raw);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const da = Number(m[3]);
    const h = Number(m[4]);
    const mi = Number(m[5]);
    const s = Number(m[6]);
    if (!assertValidUtcCalendarParts(y, mo, da, h, mi, s)) return null;
    const utcMs = Date.UTC(y, mo - 1, da, h, mi, s);
    return Number.isFinite(utcMs) ? utcMs : null;
  }

  return null;
}

/** Normalize seasonal DATETIME fields on a product row to UTC SQL strings. */
export function normalizeSeasonalUtcFields<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = { ...row };
  for (const key of SEASONAL_UTC_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(out, key)) continue;
    const ms = parseUtcSqlToMs(out[key]);
    out[key] = ms == null ? out[key] : utcMsToUtcSql(ms);
  }
  return out as T;
}

export function utcSqlToLondonWall(value: unknown): LondonWallInput | null {
  const ms = parseUtcSqlToMs(value);
  if (ms == null) return null;
  const parts = londonPartsFromUtcMs(ms);
  if (!parts) return null;
  return { wall: parts.wall, offset: parts.offset };
}

export function parseLondonWallInput(raw: unknown): LondonParseOk | LondonParseErr {
  if (!isPlainObject(raw)) {
    return { ok: false, code: "validation", error: "London datetime must be an object with wall and offset" };
  }
  const wall = String(raw.wall || "");
  const offset = raw.offset;
  if (offset !== "+00:00" && offset !== "+01:00") {
    return {
      ok: false,
      code: "validation",
      error: "offset must be exactly +00:00 or +01:00",
    };
  }
  const wm = WALL_RE.exec(wall);
  if (!wm) {
    return {
      ok: false,
      code: "validation",
      error: "wall must be YYYY-MM-DDTHH:mm:ss without timezone",
    };
  }

  const y = Number(wm[1]);
  const mo = Number(wm[2]);
  const da = Number(wm[3]);
  const h = Number(wm[4]);
  const mi = Number(wm[5]);
  const s = Number(wm[6]);
  if (!assertValidUtcCalendarParts(y, mo, da, h, mi, s)) {
    return {
      ok: false,
      code: "invalid_london_wall",
      error: "Wall calendar date/time is invalid (e.g. February 30)",
    };
  }
  const offsetMinutes = offset === "+01:00" ? 60 : 0;

  const asUtc = Date.UTC(y, mo - 1, da, h, mi, s);
  const candidateMs = asUtc - offsetMinutes * 60_000;
  if (!Number.isFinite(candidateMs)) {
    return { ok: false, code: "invalid_london_wall", error: "Invalid London wall time" };
  }

  const roundTrip = londonPartsFromUtcMs(candidateMs);
  if (!roundTrip) {
    return { ok: false, code: "invalid_london_wall", error: "Could not resolve Europe/London offset" };
  }

  if (roundTrip.wall !== wall) {
    return {
      ok: false,
      code: "invalid_london_wall",
      error: "Wall time does not exist in Europe/London for the given offset (e.g. spring-forward gap)",
    };
  }
  if (roundTrip.offset !== offset) {
    return {
      ok: false,
      code: "ambiguous_london_wall",
      error: "Offset does not match Europe/London for this wall time; supply the correct +00:00 or +01:00 occurrence",
    };
  }

  const utcMs = Math.floor(candidateMs / 1000) * 1000;
  return {
    ok: true,
    utcMs,
    utcSql: utcMsToUtcSql(utcMs),
    utcIso: utcMsToUtcIso(utcMs),
  };
}

export function floorSecondUtcMs(ms: number = Date.now()): number {
  return Math.floor(ms / 1000) * 1000;
}
