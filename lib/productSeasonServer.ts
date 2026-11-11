/**
 * Seasonal / privacy / listing mutations under product_version concurrency.
 */
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import pool from "@/lib/db";
import type { AdminIdentity } from "@/lib/adminAuth";
import { recordAdminAudit } from "@/lib/adminAudit";
import { recordContentRevision, snapshotProduct } from "@/lib/contentRevisions";
import { invalidateSitemapCache } from "@/lib/hostingerResourceInvalidation";
import {
  PRODUCT_VERSION_MAX,
  type ParsedSeasonAction,
} from "@/lib/productSeasonActions";
import {
  floorSecondUtcMs,
  normalizeSeasonalUtcFields,
  parseUtcSqlToMs,
  utcMsToUtcSql,
} from "@/lib/productSeasonLondon";
import { hasValidWindow, inWindow } from "@/lib/productSeasonEligibility";
import { queryWithSeasonalUtc } from "@/lib/productSeasonalQuery";
import { assertSingleUpdate } from "@/lib/productWriterTx";

export type SeasonDeps = {
  getConnection: () => Promise<PoolConnection>;
  recordContentRevision: typeof recordContentRevision;
  recordAdminAudit: typeof recordAdminAudit;
  invalidateSitemapCache: () => void;
  snapshotProduct: typeof snapshotProduct;
  nowMs?: () => number;
};

const defaultDeps: SeasonDeps = {
  getConnection: () => pool.getConnection(),
  recordContentRevision,
  recordAdminAudit,
  invalidateSitemapCache,
  snapshotProduct,
  nowMs: () => Date.now(),
};

export type SeasonMutationResult =
  | {
      ok: true;
      status: 200;
      id: number;
      product_version: number;
      noop: boolean;
      changed_fields: string[];
      row: Record<string, unknown>;
    }
  | {
      ok: false;
      status: 400 | 404 | 409 | 500;
      error: string;
      code: string;
      current_version?: number;
      id?: number;
    };

function ver(row: Record<string, unknown>): number {
  const n = Number(row.product_version);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

function flag(v: unknown): 0 | 1 {
  return Number(v) === 1 ? 1 : 0;
}

export async function applySeasonAction(
  payload: ParsedSeasonAction,
  actor: AdminIdentity,
  ip: string | null | undefined,
  deps: SeasonDeps = defaultDeps
): Promise<SeasonMutationResult> {
  const nowMs = floorSecondUtcMs((deps.nowMs || Date.now)());
  const conn = await deps.getConnection();
  let committed = false;

  try {
    await conn.beginTransaction();
    const [lockedRows] = await queryWithSeasonalUtc<RowDataPacket[]>(
      conn,
      `SELECT * FROM products WHERE id = ? LIMIT 1 FOR UPDATE`,
      [payload.id]
    );
    const current =
      Array.isArray(lockedRows) && lockedRows[0]
        ? normalizeSeasonalUtcFields(lockedRows[0] as Record<string, unknown>)
        : null;
    if (!current) {
      await conn.rollback();
      return { ok: false, status: 404, error: "Product not found", code: "not_found", id: payload.id };
    }

    const currentVersion = ver(current);
    if (currentVersion !== payload.expected_version) {
      await conn.rollback();
      return {
        ok: false,
        status: 409,
        error: "Stale product_version; refresh and retry",
        code: "stale_version",
        current_version: currentVersion,
        id: payload.id,
      };
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    const changed: string[] = [];
    let noop = false;

    const life = String(current.lifecycle_mode || "permanent");

    if (payload.action === "set_lifecycle_settings") {
      if (
        life === payload.lifecycle_mode &&
        (payload.lifecycle_mode === "permanent"
          ? true
          : String(current.season_name || "") === String(payload.season_name || ""))
      ) {
        noop = true;
      } else {
        sets.push("lifecycle_mode=?");
        params.push(payload.lifecycle_mode);
        changed.push("lifecycle_mode");
        if (payload.lifecycle_mode === "permanent") {
          sets.push("season_name=NULL", "season_starts_at=NULL", "season_ends_at=NULL", "season_paused=0");
          changed.push("season_name", "season_starts_at", "season_ends_at", "season_paused");
        } else {
          sets.push("season_name=?");
          params.push(payload.season_name);
          changed.push("season_name");
        }
      }
    } else if (payload.action === "set_season_window") {
      if (life !== "seasonal") {
        await conn.rollback();
        return { ok: false, status: 400, error: "Product must be seasonal", code: "precondition", id: payload.id };
      }
      const curS = parseUtcSqlToMs(current.season_starts_at);
      const curE = parseUtcSqlToMs(current.season_ends_at);
      if (curS === payload.startsUtcMs && curE === payload.endsUtcMs) {
        noop = true;
      } else {
        sets.push("season_starts_at=?", "season_ends_at=?");
        params.push(payload.startsUtcSql, payload.endsUtcSql);
        changed.push("season_starts_at", "season_ends_at");
      }
    } else if (payload.action === "activate_now") {
      if (life !== "seasonal") {
        await conn.rollback();
        return { ok: false, status: 400, error: "Product must be seasonal", code: "precondition", id: payload.id };
      }
      if (flag(current.season_paused) === 1) {
        await conn.rollback();
        return { ok: false, status: 400, error: "Paused seasonal products cannot Activate Now", code: "precondition", id: payload.id };
      }
      if (!hasValidWindow(current, nowMs)) {
        await conn.rollback();
        return { ok: false, status: 400, error: "Valid season window required", code: "precondition", id: payload.id };
      }
      const starts = parseUtcSqlToMs(current.season_starts_at)!;
      if (starts <= nowMs) {
        noop = true; // already started / live / ended — Activate Now is no-op when not upcoming
      } else {
        const sql = utcMsToUtcSql(nowMs);
        sets.push("season_starts_at=?");
        params.push(sql);
        changed.push("season_starts_at");
      }
    } else if (payload.action === "pause") {
      if (life !== "seasonal") {
        await conn.rollback();
        return { ok: false, status: 400, error: "Product must be seasonal", code: "precondition", id: payload.id };
      }
      if (flag(current.season_paused) === 1) noop = true;
      else {
        sets.push("season_paused=1");
        changed.push("season_paused");
      }
    } else if (payload.action === "resume") {
      if (life !== "seasonal") {
        await conn.rollback();
        return { ok: false, status: 400, error: "Product must be seasonal", code: "precondition", id: payload.id };
      }
      if (flag(current.season_paused) === 0) {
        noop = true;
      } else if (!hasValidWindow(current, nowMs) || !inWindow(current, nowMs)) {
        await conn.rollback();
        return {
          ok: false,
          status: 400,
          error: "Cannot resume outside an open valid window; set a new window first",
          code: "window_expired",
          id: payload.id,
        };
      } else {
        sets.push("season_paused=0");
        changed.push("season_paused");
      }
    } else if (payload.action === "end_early") {
      if (life !== "seasonal") {
        await conn.rollback();
        return { ok: false, status: 400, error: "Product must be seasonal", code: "precondition", id: payload.id };
      }
      if (!hasValidWindow(current, nowMs)) {
        await conn.rollback();
        return { ok: false, status: 400, error: "Valid season window required", code: "precondition", id: payload.id };
      }
      const starts = parseUtcSqlToMs(current.season_starts_at)!;
      const ends = parseUtcSqlToMs(current.season_ends_at)!;
      if (nowMs >= ends) {
        noop = true; // already ended
      } else if (nowMs < starts) {
        await conn.rollback();
        return {
          ok: false,
          status: 400,
          error: "End Early is not allowed for future windows; use Pause",
          code: "future_window",
          id: payload.id,
        };
      } else if (!(nowMs > starts)) {
        // now === starts (same-second boundary): ending would make end <= start
        await conn.rollback();
        return {
          ok: false,
          status: 400,
          error: "End Early would not leave start < end; try again after the start instant or Pause",
          code: "end_not_after_start",
          id: payload.id,
        };
      } else {
        // live: shorten end to now (exclusive) — now > starts guaranteed
        const sql = utcMsToUtcSql(nowMs);
        sets.push("season_ends_at=?");
        params.push(sql);
        changed.push("season_ends_at");
      }
    } else if (payload.action === "set_shop_listed") {
      if (flag(current.shop_listed) === payload.shop_listed) noop = true;
      else {
        sets.push("shop_listed=?");
        params.push(payload.shop_listed);
        changed.push("shop_listed");
      }
    } else if (payload.action === "set_private_active" || payload.action === "set_visibility_active") {
      if (flag(current.active) === payload.active) noop = true;
      else {
        sets.push("active=?");
        params.push(payload.active);
        changed.push("active");
      }
    } else if (payload.action === "set_archive_presentation") {
      if (payload.season_show_countdown != null) {
        if (flag(current.season_show_countdown) !== payload.season_show_countdown) {
          sets.push("season_show_countdown=?");
          params.push(payload.season_show_countdown);
          changed.push("season_show_countdown");
        }
      }
      if (Object.prototype.hasOwnProperty.call(payload, "season_ended_notice")) {
        const next = payload.season_ended_notice ?? null;
        if (String(current.season_ended_notice ?? "") !== String(next ?? "")) {
          sets.push("season_ended_notice=?");
          params.push(next);
          changed.push("season_ended_notice");
        }
      }
      if (Object.prototype.hasOwnProperty.call(payload, "available_offers_heading")) {
        const next = payload.available_offers_heading ?? null;
        if (String(current.available_offers_heading ?? "") !== String(next ?? "")) {
          sets.push("available_offers_heading=?");
          params.push(next);
          changed.push("available_offers_heading");
        }
      }
      if (
        Object.prototype.hasOwnProperty.call(payload, "season_available_ids") &&
        Array.isArray(payload.season_available_ids)
      ) {
        const next = JSON.stringify(payload.season_available_ids);
        const cur = typeof current.season_available_ids === "string"
          ? current.season_available_ids
          : JSON.stringify(current.season_available_ids ?? []);
        if (cur !== next) {
          sets.push("season_available_ids=?");
          params.push(next);
          changed.push("season_available_ids");
        }
      }
      if (
        Object.prototype.hasOwnProperty.call(payload, "season_upcoming_ids") &&
        Array.isArray(payload.season_upcoming_ids)
      ) {
        const next = JSON.stringify(payload.season_upcoming_ids);
        const cur = typeof current.season_upcoming_ids === "string"
          ? current.season_upcoming_ids
          : JSON.stringify(current.season_upcoming_ids ?? []);
        if (cur !== next) {
          sets.push("season_upcoming_ids=?");
          params.push(next);
          changed.push("season_upcoming_ids");
        }
      }
      if (changed.length === 0) noop = true;
    }

    if (noop || changed.length === 0) {
      // Max version: legitimate no-op does not require increment.
      await conn.commit();
      committed = true;
      return {
        ok: true,
        status: 200,
        id: payload.id,
        product_version: currentVersion,
        noop: true,
        changed_fields: [],
        row: current,
      };
    }

    if (currentVersion === PRODUCT_VERSION_MAX) {
      await conn.rollback();
      return {
        ok: false,
        status: 409,
        error: "product_version overflow; refuse further mutations",
        code: "version_overflow",
        current_version: currentVersion,
        id: payload.id,
      };
    }

    const nextVersion = currentVersion + 1;
    sets.push("product_version=?");
    params.push(nextVersion);
    params.push(payload.id);
    params.push(currentVersion);

    await deps.recordContentRevision(
      {
        entityType: "product",
        entityId: payload.id,
        entityLabel: String(current.name || ""),
        revisionAction: "update",
        snapshot: deps.snapshotProduct(current),
        changedFields: changed,
        actor,
      },
      conn
    );

    const [upd] = await conn.query(
      `UPDATE products SET ${sets.join(", ")} WHERE id=? AND product_version=?`,
      params
    );
    assertSingleUpdate(upd as any, "season_action");

    const [freshRows] = await queryWithSeasonalUtc<RowDataPacket[]>(
      conn,
      `SELECT * FROM products WHERE id = ? LIMIT 1`,
      [payload.id]
    );
    const resulting = normalizeSeasonalUtcFields(
      (Array.isArray(freshRows) && freshRows[0]
        ? freshRows[0]
        : { ...current, product_version: nextVersion }) as Record<string, unknown>
    );

    await conn.commit();
    committed = true;

    await deps.recordAdminAudit({
      actor,
      action: `product.${payload.action}`,
      entityType: "product",
      entityId: payload.id,
      summary: `${payload.action} on product ${current.name || payload.id}`,
      metadata: { changed_fields: changed, product_version: nextVersion },
      ip: ip ?? null,
    });
    deps.invalidateSitemapCache();

    return {
      ok: true,
      status: 200,
      id: payload.id,
      product_version: nextVersion,
      noop: false,
      changed_fields: changed,
      row: resulting,
    };
  } catch (err: any) {
    if (!committed) {
      try {
        await conn.rollback();
      } catch {
        /* ignore */
      }
    }
    if (err?.code === "REVISION_TOO_LARGE") {
      return { ok: false, status: 500, error: String(err.message), code: "server_error", id: payload.id };
    }
    throw err;
  } finally {
    conn.release();
  }
}
