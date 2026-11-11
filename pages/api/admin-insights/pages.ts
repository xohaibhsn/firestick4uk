/**
 * GET /api/admin-insights/pages — per-path stats.
 * Permission: insights.view. Parameterised SQL only.
 * Detail range: insights_events/insights_sessions (honours include_bots).
 * Older range: insights_page_daily rollup.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import {
  botClause,
  handleInsightsGet,
  num,
  numOrNull,
  qrows,
  rangeOrReject,
  resolveDataSource,
} from "@/components/sidhu/insights/insightsServer";
import type {
  InsightsPageRow,
  InsightsPagesResponse,
} from "@/components/sidhu/insights/insightsTypes";

const ROW_LIMIT = 100;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await handleInsightsGet(req, res, "insights.view", async () => {
    const range = rangeOrReject(req, res);
    if (!range) return undefined;

    const { source, notes } = await resolveDataSource(range);
    const bots = botClause("s", range.includeBots);
    let rows: InsightsPageRow[];

    if (source === "detail") {
      const w = [range.startSql, range.endSql];
      const pageRows = await qrows<Record<string, unknown>>(
        `SELECT e.path AS p,
                COALESCE(SUM(e.event_type = 'page_view'), 0) AS pageviews,
                COUNT(DISTINCT CASE WHEN e.event_type = 'page_view' THEN e.session_id END) AS unique_sessions,
                ROUND(AVG(e.time_on_page_ms)) AS avg_time,
                ROUND(AVG(e.scroll_depth_pct)) AS avg_scroll
           FROM insights_events e
           JOIN insights_sessions s ON s.session_id = e.session_id
          WHERE e.event_type IN ('page_view', 'scroll_depth')
            AND e.event_time >= ? AND e.event_time < ?${bots}
          GROUP BY e.path
          HAVING pageviews > 0
          ORDER BY pageviews DESC
          LIMIT ${ROW_LIMIT}`,
        w
      );

      const exitRows = await qrows<Record<string, unknown>>(
        `SELECT s.exit_path AS p, COUNT(*) AS exits
           FROM insights_sessions s
          WHERE s.exit_path IS NOT NULL
            AND s.started_at >= ? AND s.started_at < ?${bots}
          GROUP BY s.exit_path
          ORDER BY exits DESC
          LIMIT 500`,
        w
      );
      const exits = new Map(exitRows.map((r) => [String(r.p), num(r.exits)]));

      rows = pageRows.map((r) => ({
        path: String(r.p || "/"),
        pageviews: num(r.pageviews),
        unique_sessions: num(r.unique_sessions),
        avg_time_on_page_ms: numOrNull(r.avg_time),
        avg_scroll_depth_pct: numOrNull(r.avg_scroll),
        exits: exits.get(String(r.p)) ?? 0,
      }));
    } else {
      const w = [range.from, range.to];
      const pageRows = await qrows<Record<string, unknown>>(
        `SELECT path AS p,
                COALESCE(SUM(pageviews), 0) AS pageviews,
                COALESCE(SUM(unique_sessions), 0) AS unique_sessions,
                ROUND(AVG(avg_time_on_page_ms)) AS avg_time,
                ROUND(AVG(avg_scroll_depth_pct)) AS avg_scroll,
                COALESCE(SUM(exits), 0) AS exits
           FROM insights_page_daily
          WHERE summary_date >= ? AND summary_date <= ?
          GROUP BY path
          ORDER BY pageviews DESC
          LIMIT ${ROW_LIMIT}`,
        w
      );
      rows = pageRows.map((r) => ({
        path: String(r.p || "/"),
        pageviews: num(r.pageviews),
        unique_sessions: num(r.unique_sessions),
        avg_time_on_page_ms: numOrNull(r.avg_time),
        avg_scroll_depth_pct: numOrNull(r.avg_scroll),
        exits: num(r.exits),
      }));
    }

    const payload: InsightsPagesResponse = {
      installed: true,
      state: "ok",
      range: { from: range.from, to: range.to, days: range.days },
      include_bots: range.includeBots,
      source,
      notes,
      has_data: rows.length > 0,
      rows,
      totals: { pageviews: rows.reduce((a, r) => a + r.pageviews, 0) },
    };
    return payload;
  });
}
