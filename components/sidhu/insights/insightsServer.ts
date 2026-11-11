/**
 * SERVER-ONLY helpers for /api/admin-insights/* (imports the DB pool — never import from client components).
 * Lives under components/sidhu/insights/ so it is NOT exposed as a Next.js API route.
 *
 * - parseDateRange: shared from/to/include_bots parsing (max 366 days)
 * - handleInsightsGet: method + permission + fail-safe wrapper (missing tables => 200 not_installed)
 * - parameterised SQL only
 */
import type { NextApiRequest, NextApiResponse } from "next";
import pool from "@/lib/db";
import { requireAdminPermission, type AdminIdentity } from "@/lib/adminAuth";
import type { AdminPermission, AdminRoleName } from "@/lib/adminPermissions";
import { getInsightsSettings } from "@/lib/insightsSettings";
import {
  INSIGHTS_MAX_RANGE_DAYS,
  INSIGHTS_NOT_INSTALLED,
  addDaysIso,
  inclusiveDays,
  isValidIsoDate,
  isoDateUtc,
  type InsightsDataSource,
  type InsightsRangeMeta,
} from "./insightsTypes";

export type ParsedRange = InsightsRangeMeta & {
  includeBots: boolean;
  /** Inclusive start, 'YYYY-MM-DD 00:00:00' (UTC) */
  startSql: string;
  /** Exclusive end (day after `to`), 'YYYY-MM-DD 00:00:00' (UTC) */
  endSql: string;
};

function firstQuery(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return String(v[0] ?? "").trim();
  return String(v ?? "").trim();
}

function normalizeDateParam(raw: string): string | null {
  if (!raw) return null;
  // Accept plain date or ISO datetime (date part only).
  const m = /^(\d{4}-\d{2}-\d{2})(?:[T ].*)?$/.exec(raw);
  if (!m) return null;
  return isValidIsoDate(m[1]) ? m[1] : null;
}

/**
 * Parse ?from=&to=&range=&include_bots=.
 * - `range` preset (today|7d|30d|90d) is used when from/to are absent.
 * - No params => today only.
 * - Rejects invalid dates, from > to, and ranges over 366 days.
 */
export function parseDateRange(
  query: NextApiRequest["query"],
  now: Date = new Date()
): { ok: true; range: ParsedRange } | { ok: false; error: string } {
  const today = isoDateUtc(now);
  const fromRaw = firstQuery(query.from);
  const toRaw = firstQuery(query.to);
  const presetRaw = firstQuery(query.range).toLowerCase();
  const botsRaw = firstQuery(query.include_bots).toLowerCase();
  const includeBots = botsRaw === "1" || botsRaw === "true";

  let from: string;
  let to: string;

  if (fromRaw || toRaw) {
    const f = fromRaw ? normalizeDateParam(fromRaw) : null;
    const t = toRaw ? normalizeDateParam(toRaw) : null;
    if ((fromRaw && !f) || (toRaw && !t)) {
      return { ok: false, error: "Invalid date. Use YYYY-MM-DD." };
    }
    to = t || today;
    from = f || to;
  } else if (presetRaw) {
    const span =
      presetRaw === "today" ? 1 : presetRaw === "7d" ? 7 : presetRaw === "30d" ? 30 : presetRaw === "90d" ? 90 : 0;
    if (!span) return { ok: false, error: "Invalid range preset." };
    to = today;
    from = addDaysIso(today, -(span - 1));
  } else {
    from = today;
    to = today;
  }

  if (from > to) return { ok: false, error: "from must be on or before to." };
  const days = inclusiveDays(from, to);
  if (days > INSIGHTS_MAX_RANGE_DAYS) {
    return { ok: false, error: `Date range cannot exceed ${INSIGHTS_MAX_RANGE_DAYS} days.` };
  }

  return {
    ok: true,
    range: {
      from,
      to,
      days,
      includeBots,
      startSql: `${from} 00:00:00`,
      endSql: `${addDaysIso(to, 1)} 00:00:00`,
    },
  };
}

/** True for "table does not exist" style DB errors (insights not migrated yet). */
export function isMissingTableError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; errno?: number; sqlState?: string; message?: string };
  if (e.code === "ER_NO_SUCH_TABLE" || e.errno === 1146 || e.sqlState === "42S02") return true;
  return typeof e.message === "string" && /table .* doesn't exist/i.test(e.message);
}

/** Run a parameterised query and return rows. Always pass values via `params`. */
export async function qrows<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [rows] = await pool.query(sql, params as never[]);
  return (Array.isArray(rows) ? rows : []) as unknown as T[];
}

export function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** SQL fragment excluding bots (alias is a trusted constant, never user input). */
export function botClause(alias: "s", includeBots: boolean): string {
  return includeBots ? "" : ` AND ${alias}.is_bot = 0`;
}

/**
 * Detail tables (sessions/events) only exist for detail_retention_days.
 * Older ranges fall back to daily rollup tables (bots cannot be separated there).
 */
export async function resolveDataSource(
  range: ParsedRange,
  now: Date = new Date()
): Promise<{ source: InsightsDataSource; notes: string[] }> {
  const settings = await getInsightsSettings();
  const detailDays = Math.max(1, settings.detail_retention_days || 90);
  const cutoff = addDaysIso(isoDateUtc(now), -detailDays);
  if (range.from >= cutoff) return { source: "detail", notes: [] };
  const notes = [
    `Part of this range is older than the ${detailDays}-day detailed retention window, so daily summaries are used. ` +
      "Visitor counts are approximated by sessions" +
      (range.includeBots ? "." : " and bots cannot be excluded."),
  ];
  return { source: "summary", notes };
}

export type InsightsGetContext = {
  admin: AdminIdentity;
  role: AdminRoleName;
  req: NextApiRequest;
};

/**
 * GET-only admin handler wrapper.
 * - 405 for other methods, 401/403 via requireAdminPermission
 * - ER_NO_SUCH_TABLE => 200 { installed:false, state:"not_installed" } (never 500)
 * - other failures => generic 500 (no SQL text, no PII)
 */
export async function handleInsightsGet(
  req: NextApiRequest,
  res: NextApiResponse,
  permission: AdminPermission,
  fn: (ctx: InsightsGetContext) => Promise<unknown>
): Promise<void> {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const admin = await requireAdminPermission(req, res, permission);
  if (!admin) return;

  res.setHeader("Cache-Control", "no-store");
  try {
    const payload = await fn({ admin, role: admin.role as AdminRoleName, req });
    if (res.writableEnded || res.headersSent) return;
    res.status(200).json(payload);
  } catch (err) {
    if (isMissingTableError(err)) {
      res.status(200).json({ ...INSIGHTS_NOT_INSTALLED });
      return;
    }
    const code = err && typeof err === "object" ? String((err as { code?: string }).code || "") : "";
    console.error("[insights-admin] query failed", code || "unknown");
    res.status(500).json({ error: "Insights data is temporarily unavailable." });
  }
}

/** Respond 400 for a bad range; returns the parsed range or null if a response was sent. */
export function rangeOrReject(req: NextApiRequest, res: NextApiResponse): ParsedRange | null {
  const parsed = parseDateRange(req.query);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return null;
  }
  return parsed.range;
}

export function normUnknown(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s || s.toLowerCase() === "unknown") return "Unknown";
  return s;
}

/** SQL expressions that collapse NULL / '' / 'unknown' to 'Unknown' (static strings, no user input). */
export const SQL_COUNTRY = "COALESCE(NULLIF(NULLIF(s.country_name,''),'unknown'),'Unknown')";
export const SQL_REGION = "COALESCE(NULLIF(NULLIF(s.region_name,''),'unknown'),'Unknown')";
export const SQL_CITY = "COALESCE(NULLIF(NULLIF(s.city_name,''),'unknown'),'Unknown')";
