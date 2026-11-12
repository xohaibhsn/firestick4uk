/**
 * GET /api/admin-insights/page-behaviour — per-path engagement from first-party events.
 * Permission: insights.view. Parameterised SQL only; every query is date-bounded and LIMITed.
 * Query: from/to/range/include_bots (shared), path (optional site path), device (m|d, optional),
 *        limit (paths, default 20, max 50).
 * Per path: views, avg engaged time, scroll reach at 25/50/75/100, top clicked elements,
 * rage clicks and exit rate. Device uses session screen_w (<768 = m); clicks prefer props.vw.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import {
  botClause,
  deviceClause,
  handleInsightsGet,
  num,
  parseDeviceParam,
  parseEventProps,
  parsePathParam,
  qrows,
  rangeOrReject,
  resolveDataSource,
} from "@/components/sidhu/insights/insightsServer";
import type {
  InsightsClickedElement,
  InsightsPageBehaviourResponse,
  InsightsPageBehaviourRow,
} from "@/components/sidhu/insights/insightsTypes";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MILESTONE_ROW_CAP = 20000;
const CLICK_ROW_CAP = 20000;
const TOP_CLICKS = 5;
const LABEL_MAX = 40;

function parseLimit(v: string | string[] | undefined): number {
  const raw = Array.isArray(v) ? v[0] : v;
  const n = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

function emptyRow(path: string, views: number): InsightsPageBehaviourRow {
  return {
    path,
    views,
    avg_engaged_ms: null,
    reach: { m25: 0, m50: 0, m75: 0, m100: 0 },
    top_clicks: [],
    rage_clicks: 0,
    exit_rate_pct: null,
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await handleInsightsGet(req, res, "insights.view", async () => {
    const range = rangeOrReject(req, res);
    if (!range) return undefined;

    const pathRaw = req.query.path;
    const hasPath = Array.isArray(pathRaw) ? pathRaw.length > 0 && String(pathRaw[0]) !== "" : !!pathRaw;
    const pathFilter = hasPath ? parsePathParam(pathRaw) : null;
    if (hasPath && !pathFilter) {
      res.status(400).json({ error: "Invalid path." });
      return undefined;
    }
    const deviceRaw = req.query.device;
    const hasDevice = Array.isArray(deviceRaw) ? deviceRaw.length > 0 && String(deviceRaw[0]) !== "" : !!deviceRaw;
    const device = hasDevice ? parseDeviceParam(deviceRaw) : null;
    if (hasDevice && !device) {
      res.status(400).json({ error: "Invalid device. Use m or d." });
      return undefined;
    }

    const { source, notes: baseNotes } = await resolveDataSource(range);
    const notes = [...baseNotes];
    const limit = parseLimit(req.query.limit);
    const scope = `${botClause("s", range.includeBots)}${deviceClause("s", device)}`;
    const dateWin = [range.startSql, range.endSql];

    const pathSql = pathFilter ? " AND e.path = ?" : "";
    const pathParams = pathFilter ? [pathFilter] : [];

    // 1) Views per path (bounded by LIMIT).
    const viewRows = await qrows<Record<string, unknown>>(
      `SELECT e.path AS p, COUNT(*) AS views
         FROM insights_events e
         JOIN insights_sessions s ON s.session_id = e.session_id
        WHERE e.event_type = 'page_view'
          AND e.event_time >= ? AND e.event_time < ?${scope}${pathSql}
        GROUP BY e.path
        ORDER BY views DESC
        LIMIT ?`,
      [...dateWin, ...pathParams, limit]
    );

    const byPath = new Map<string, InsightsPageBehaviourRow>();
    for (const r of viewRows) {
      const p = String(r.p || "/");
      byPath.set(p, emptyRow(p, num(r.views)));
    }
    const paths = [...byPath.keys()];
    let truncated = false;

    if (paths.length > 0) {
      // 2) Engaged time (summed timing deltas) per path.
      const timeRows = await qrows<Record<string, unknown>>(
        `SELECT e.path AS p, COALESCE(SUM(e.time_on_page_ms), 0) AS engaged_ms,
                COUNT(e.time_on_page_ms) AS timed
           FROM insights_events e
           JOIN insights_sessions s ON s.session_id = e.session_id
          WHERE e.event_type = 'scroll_depth'
            AND e.time_on_page_ms IS NOT NULL
            AND e.event_time >= ? AND e.event_time < ?${scope}
            AND e.path IN (?)
          GROUP BY e.path
          LIMIT ?`,
        [...dateWin, paths, MAX_LIMIT]
      );
      for (const r of timeRows) {
        const row = byPath.get(String(r.p || "/"));
        if (!row || num(r.timed) <= 0 || row.views <= 0) continue;
        row.avg_engaged_ms = Math.round(num(r.engaged_ms) / row.views);
      }

      // 3) Scroll milestone flags (one flagged event per mark per page view).
      const milestoneRows = await qrows<Record<string, unknown>>(
        `SELECT e.path AS p, e.props_json AS props_json
           FROM insights_events e
           JOIN insights_sessions s ON s.session_id = e.session_id
          WHERE e.event_type = 'scroll_depth'
            AND e.props_json IS NOT NULL
            AND e.event_time >= ? AND e.event_time < ?${scope}
            AND e.path IN (?)
          LIMIT ?`,
        [...dateWin, paths, MILESTONE_ROW_CAP]
      );
      if (milestoneRows.length >= MILESTONE_ROW_CAP) truncated = true;
      for (const r of milestoneRows) {
        const row = byPath.get(String(r.p || "/"));
        const props = parseEventProps(r.props_json);
        if (!row || !props) continue;
        if (props.m25 === true) row.reach.m25 += 1;
        if (props.m50 === true) row.reach.m50 += 1;
        if (props.m75 === true) row.reach.m75 += 1;
        if (props.m100 === true) row.reach.m100 += 1;
      }

      // 4) Click rows (props allowlist: tag, label, vw, rage) aggregated here.
      const clickRows = await qrows<Record<string, unknown>>(
        `SELECT e.path AS p, e.props_json AS props_json, s.screen_w AS screen_w
           FROM insights_events e
           JOIN insights_sessions s ON s.session_id = e.session_id
          WHERE e.click_id IS NOT NULL
            AND e.props_json IS NOT NULL
            AND e.event_time >= ? AND e.event_time < ?${botClause("s", range.includeBots)}
            AND e.path IN (?)
          LIMIT ?`,
        [...dateWin, paths, CLICK_ROW_CAP]
      );
      if (clickRows.length >= CLICK_ROW_CAP) truncated = true;
      const clicksByPath = new Map<string, Map<string, InsightsClickedElement>>();
      for (const r of clickRows) {
        const p = String(r.p || "/");
        const row = byPath.get(p);
        const props = parseEventProps(r.props_json);
        if (!row || !props) continue;
        if (device) {
          const vw =
            props.vw === "m" || props.vw === "d"
              ? props.vw
              : r.screen_w != null && num(r.screen_w) > 0 && num(r.screen_w) < 768
                ? "m"
                : "d";
          if (vw !== device) continue;
        }
        if (props.rage === true) row.rage_clicks += 1;
        const label = typeof props.label === "string" ? props.label.slice(0, LABEL_MAX) : "";
        const tag = typeof props.tag === "string" ? props.tag.slice(0, 32) : "";
        const key = `${tag}\u0000${label}`;
        let m = clicksByPath.get(p);
        if (!m) {
          m = new Map();
          clicksByPath.set(p, m);
        }
        const hit = m.get(key);
        if (hit) hit.clicks += 1;
        else m.set(key, { label, tag, clicks: 1 });
      }
      for (const [p, m] of clicksByPath) {
        const row = byPath.get(p);
        if (row) row.top_clicks = [...m.values()].sort((a, b) => b.clicks - a.clicks).slice(0, TOP_CLICKS);
      }

      // 5) Exits: sessions whose exit_path is one of these paths.
      const exitRows = await qrows<Record<string, unknown>>(
        `SELECT s.exit_path AS p, COUNT(*) AS exits
           FROM insights_sessions s
          WHERE s.started_at >= ? AND s.started_at < ?${scope}
            AND s.exit_path IN (?)
          GROUP BY s.exit_path
          LIMIT ?`,
        [...dateWin, paths, MAX_LIMIT]
      );
      for (const r of exitRows) {
        const row = byPath.get(String(r.p || "/"));
        if (!row || row.views <= 0) continue;
        row.exit_rate_pct = Math.min(100, Math.round((num(r.exits) / row.views) * 1000) / 10);
      }
    }

    if (source === "summary") {
      notes.push("Page behaviour needs detailed data, which is only kept for the detail retention window.");
    }
    if (truncated) notes.push("Very busy range: click and scroll figures use the first rows found and may be understated.");

    const rows = [...byPath.values()];
    const payload: InsightsPageBehaviourResponse = {
      installed: true,
      state: "ok",
      range: { from: range.from, to: range.to, days: range.days },
      include_bots: range.includeBots,
      source,
      notes,
      has_data: rows.length > 0,
      device: device ?? "all",
      path: pathFilter,
      truncated,
      rows,
    };
    return payload;
  });
}
