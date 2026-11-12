/**
 * GET /api/admin-insights/click-map — aggregated click positions for one path + device.
 * Permission: insights.view. Parameterised SQL only; date-bounded and LIMITed.
 * Query: path (required site path), device (required: m|d), from/to/range/include_bots (shared).
 * Positions are x_pct / y_pct from click props (document %, rounded to the nearest 2%).
 * Device prefers props.vw, falling back to session screen_w (<768 = m).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import {
  botClause,
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
  InsightsClickMapBucket,
  InsightsClickMapResponse,
} from "@/components/sidhu/insights/insightsTypes";

const CLICK_ROW_CAP = 20000;
const BUCKET_CAP = 600;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await handleInsightsGet(req, res, "insights.view", async () => {
    const path = parsePathParam(req.query.path);
    if (!path) {
      res.status(400).json({ error: "A valid path is required." });
      return undefined;
    }
    const device = parseDeviceParam(req.query.device);
    if (!device) {
      res.status(400).json({ error: "device is required (m or d)." });
      return undefined;
    }
    const range = rangeOrReject(req, res);
    if (!range) return undefined;

    const { source, notes: baseNotes } = await resolveDataSource(range);
    const notes = [...baseNotes];

    const rows = await qrows<Record<string, unknown>>(
      `SELECT e.props_json AS props_json, s.screen_w AS screen_w
         FROM insights_events e
         JOIN insights_sessions s ON s.session_id = e.session_id
        WHERE e.click_id IS NOT NULL
          AND e.props_json IS NOT NULL
          AND e.path = ?
          AND e.event_time >= ? AND e.event_time < ?${botClause("s", range.includeBots)}
        LIMIT ?`,
      [path, range.startSql, range.endSql, CLICK_ROW_CAP]
    );
    const truncated = rows.length >= CLICK_ROW_CAP;

    const grid = new Map<string, InsightsClickMapBucket>();
    let total = 0;
    for (const r of rows) {
      const props = parseEventProps(r.props_json);
      if (!props) continue;
      const x = props.x_pct;
      const y = props.y_pct;
      if (typeof x !== "number" || typeof y !== "number") continue;
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 100 || y < 0 || y > 100) continue;
      const vw =
        props.vw === "m" || props.vw === "d"
          ? props.vw
          : r.screen_w != null && num(r.screen_w) > 0 && num(r.screen_w) < 768
            ? "m"
            : "d";
      if (vw !== device) continue;
      total += 1;
      const key = `${x}:${y}`;
      const hit = grid.get(key);
      if (hit) hit.count += 1;
      else grid.set(key, { x_pct: x, y_pct: y, count: 1 });
    }

    const buckets = [...grid.values()].sort((a, b) => b.count - a.count).slice(0, BUCKET_CAP);
    if (source === "summary") {
      notes.push("Click maps need detailed data, which is only kept for the detail retention window.");
    }
    if (truncated) notes.push("Very busy range: the map uses the first rows found and may be understated.");

    const payload: InsightsClickMapResponse = {
      installed: true,
      state: "ok",
      range: { from: range.from, to: range.to, days: range.days },
      include_bots: range.includeBots,
      source,
      notes,
      has_data: total > 0,
      path,
      device,
      total_clicks: total,
      truncated,
      buckets,
    };
    return payload;
  });
}
