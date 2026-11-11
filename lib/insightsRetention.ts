/**
 * Sidhu Insights opportunistic retention + IP mask job.
 * Triggered after successful ingest (and later admin load).
 * Throttled; GET_LOCK on ONE dedicated pool connection; RELEASE_LOCK in finally.
 * Batch 500; ~1.5s wall budget; swallows errors after releasing lock.
 */

import type { InsightsSettings } from "./insightsSettings";

export const INSIGHTS_RETENTION_LOCK = "insights_retention";
export const INSIGHTS_RETENTION_TIME_BUDGET_MS = 1500;
export const INSIGHTS_RETENTION_DEFAULT_BATCH = 500;
export const INSIGHTS_RETENTION_DEFAULT_INTERVAL_SEC = 300;

export type InsightsConnLike = {
  query: (sql: string, params?: unknown[]) => Promise<[unknown, unknown?]>;
  release: () => void;
};

export type InsightsPoolLike = {
  getConnection: () => Promise<InsightsConnLike>;
};

type SettingsSlice = Pick<
  InsightsSettings,
  | "detail_retention_days"
  | "summary_retention_days"
  | "ip_full_retention_days"
  | "cleanup_batch_size"
  | "cleanup_min_interval_sec"
>;

export type RetentionDeps = {
  /** Prefer pool; getConnection alone also accepted (ingest API shape). */
  pool?: InsightsPoolLike;
  getConnection?: () => Promise<InsightsConnLike>;
  settings: SettingsSlice;
  now?: Date;
  timeBudgetMs?: number;
  holder?: string;
  getLastSuccessAt?: () => Promise<Date | null>;
};

export type RetentionResult = {
  ran: boolean;
  skipped?: "throttle" | "lock" | "budget";
  masked: number;
  deletedEvents: number;
  deletedSessions: number;
  deletedSummaries: number;
  error?: string;
};

/** IPv4: zero last octet. IPv6: keep first /64 (first 4 hextets). Idempotent. */
export function maskInsightsIp(ip: string): string {
  const raw = String(ip || "").trim();
  if (!raw) return raw;

  if (raw.includes(".")) {
    const host = raw.includes(":") && !raw.includes("::") ? raw.split(":")[0] : raw;
    const parts = host.split(".");
    if (parts.length === 4 && parts.every((p) => /^\d{1,3}$/.test(p))) {
      return `${Number(parts[0])}.${Number(parts[1])}.${Number(parts[2])}.0`;
    }
    return raw;
  }

  let v = raw;
  if (v.startsWith("[") && v.includes("]")) {
    v = v.slice(1, v.indexOf("]"));
  }
  const lower = v.toLowerCase();
  if (lower.includes("::")) {
    const [left, right = ""] = lower.split("::");
    const leftParts = left ? left.split(":").filter(Boolean) : [];
    const rightParts = right ? right.split(":").filter(Boolean) : [];
    const missing = 8 - leftParts.length - rightParts.length;
    const mid = Array(Math.max(0, missing)).fill("0");
    const full = [...leftParts, ...mid, ...rightParts].slice(0, 8);
    return full.slice(0, 4).join(":") + "::";
  }
  const hextets = lower.split(":").filter(Boolean);
  return hextets.slice(0, 4).join(":") + "::";
}

export function insightsIpMaskSqlPredicate(): string {
  return `ip_masked = 0 AND ip_address IS NOT NULL AND ip_address <> '' AND started_at < DATE_SUB(?, INTERVAL ? DAY)`;
}

export function insightsDetailDeleteEventsSql(): string {
  return `DELETE FROM insights_events WHERE event_time < DATE_SUB(?, INTERVAL ? DAY) LIMIT ?`;
}

export function insightsDetailDeleteSessionsSql(): string {
  return `DELETE FROM insights_sessions WHERE started_at < DATE_SUB(?, INTERVAL ? DAY) LIMIT ?`;
}

export function insightsSummaryDeleteSql(table: string): string {
  const allowed = new Set([
    "insights_daily_summary",
    "insights_geo_daily",
    "insights_source_daily",
    "insights_page_daily",
  ]);
  if (!allowed.has(table)) throw new Error("invalid_summary_table");
  return `DELETE FROM ${table} WHERE summary_date < DATE_SUB(?, INTERVAL ? DAY) LIMIT ?`;
}

let lastLocalAttemptAt = 0;

export function __resetInsightsRetentionThrottle(): void {
  lastLocalAttemptAt = 0;
}

async function readLastSuccess(
  conn: InsightsConnLike,
  override?: () => Promise<Date | null>
): Promise<Date | null> {
  if (override) return override();
  try {
    const [rows] = await conn.query(
      `SELECT last_success_at FROM insights_cleanup_lease WHERE lease_name = ? LIMIT 1`,
      [INSIGHTS_RETENTION_LOCK]
    );
    const row = Array.isArray(rows)
      ? (rows as Array<{ last_success_at?: Date | string | null }>)[0]
      : null;
    if (!row?.last_success_at) return null;
    const d = new Date(row.last_success_at);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

function resolveGetConnection(deps: RetentionDeps): () => Promise<InsightsConnLike> {
  if (typeof deps.getConnection === "function") return deps.getConnection;
  if (deps.pool && typeof deps.pool.getConnection === "function") {
    return () => deps.pool!.getConnection();
  }
  throw new Error("retention_no_pool");
}

/**
 * Run retention if throttle allows and lock acquired.
 * Uses at most 1 pool connection. Never throws to caller.
 */
export async function runInsightsRetention(deps: RetentionDeps): Promise<RetentionResult> {
  const empty: RetentionResult = {
    ran: false,
    masked: 0,
    deletedEvents: 0,
    deletedSessions: 0,
    deletedSummaries: 0,
  };

  const now = deps.now || new Date();
  const wallStart = Date.now();
  const intervalSec =
    deps.settings.cleanup_min_interval_sec || INSIGHTS_RETENTION_DEFAULT_INTERVAL_SEC;
  const batch = deps.settings.cleanup_batch_size || INSIGHTS_RETENTION_DEFAULT_BATCH;
  const budget = deps.timeBudgetMs ?? INSIGHTS_RETENTION_TIME_BUDGET_MS;

  if (lastLocalAttemptAt && wallStart - lastLocalAttemptAt < intervalSec * 1000) {
    return { ...empty, skipped: "throttle" };
  }
  lastLocalAttemptAt = wallStart;

  let conn: InsightsConnLike | null = null;
  let lockHeld = false;

  try {
    const getConnection = resolveGetConnection(deps);
    conn = await getConnection();

    const lastSuccess = await readLastSuccess(conn, deps.getLastSuccessAt);
    if (lastSuccess && now.getTime() - lastSuccess.getTime() < intervalSec * 1000) {
      return { ...empty, skipped: "throttle" };
    }

    const [lockRows] = await conn.query(`SELECT GET_LOCK(?, 0) AS got`, [
      INSIGHTS_RETENTION_LOCK,
    ]);
    const got = Array.isArray(lockRows)
      ? Number((lockRows as Array<{ got?: number }>)[0]?.got)
      : 0;
    if (got !== 1) {
      return { ...empty, skipped: "lock" };
    }
    lockHeld = true;

    await conn.query(
      `INSERT INTO insights_cleanup_lease (lease_name, holder, acquired_at)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE holder = VALUES(holder), acquired_at = VALUES(acquired_at)`,
      [INSIGHTS_RETENTION_LOCK, deps.holder || "ingest", now]
    );

    let masked = 0;
    let deletedEvents = 0;
    let deletedSessions = 0;
    let deletedSummaries = 0;

    const withinBudget = () => Date.now() - wallStart < budget;

    if (withinBudget()) {
      const [sel] = await conn.query(
        `SELECT id, ip_address FROM insights_sessions
         WHERE ${insightsIpMaskSqlPredicate()}
         ORDER BY started_at ASC
         LIMIT ?`,
        [now, deps.settings.ip_full_retention_days, batch]
      );
      const rows = Array.isArray(sel)
        ? (sel as Array<{ id: number; ip_address: string }>)
        : [];
      for (const row of rows) {
        if (!withinBudget()) break;
        const maskedIp = maskInsightsIp(row.ip_address);
        await conn.query(
          `UPDATE insights_sessions
           SET ip_address = ?, ip_masked = 1, ip_masked_at = ?
           WHERE id = ? AND ip_masked = 0`,
          [maskedIp.slice(0, 45), now, row.id]
        );
        masked += 1;
      }
    }

    if (withinBudget()) {
      const [r] = await conn.query(insightsDetailDeleteEventsSql(), [
        now,
        deps.settings.detail_retention_days,
        batch,
      ]);
      deletedEvents = Number((r as { affectedRows?: number })?.affectedRows || 0);
    }

    if (withinBudget()) {
      const [r] = await conn.query(insightsDetailDeleteSessionsSql(), [
        now,
        deps.settings.detail_retention_days,
        batch,
      ]);
      deletedSessions = Number((r as { affectedRows?: number })?.affectedRows || 0);
    }

    for (const table of [
      "insights_daily_summary",
      "insights_geo_daily",
      "insights_source_daily",
      "insights_page_daily",
    ]) {
      if (!withinBudget()) break;
      const [r] = await conn.query(insightsSummaryDeleteSql(table), [
        now,
        deps.settings.summary_retention_days,
        batch,
      ]);
      deletedSummaries += Number((r as { affectedRows?: number })?.affectedRows || 0);
    }

    await conn.query(
      `UPDATE insights_cleanup_lease
       SET last_success_at = ?, last_error = NULL,
           last_deleted_events = ?, last_deleted_sessions = ?, last_masked_ips = ?
       WHERE lease_name = ?`,
      [now, deletedEvents, deletedSessions, masked, INSIGHTS_RETENTION_LOCK]
    );

    return {
      ran: true,
      masked,
      deletedEvents,
      deletedSessions,
      deletedSummaries,
      skipped: withinBudget() ? undefined : "budget",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message.slice(0, 500) : "retention_error";
    try {
      if (conn) {
        await conn.query(
          `UPDATE insights_cleanup_lease SET last_error = ? WHERE lease_name = ?`,
          [msg, INSIGHTS_RETENTION_LOCK]
        );
      }
    } catch {
      /* ignore */
    }
    return { ...empty, ran: false, error: msg };
  } finally {
    if (conn && lockHeld) {
      try {
        await conn.query(`SELECT RELEASE_LOCK(?)`, [INSIGHTS_RETENTION_LOCK]);
      } catch {
        /* ignore */
      }
    }
    if (conn) {
      try {
        conn.release();
      } catch {
        /* ignore */
      }
    }
  }
}

/** Fire-and-forget after ingest — never blocks the HTTP response. */
export function scheduleInsightsRetention(deps: RetentionDeps): void {
  void runInsightsRetention(deps).catch(() => {
    /* swallow */
  });
}
