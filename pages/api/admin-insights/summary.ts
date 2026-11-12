/**
 * GET /api/admin-insights/summary — KPIs for Today (sessions, pageviews, engaged time, funnel counts, top landing/exit pages).
 * Permission: insights.view (manager + super_admin). Parameterised SQL only.
 * Query: from, to (YYYY-MM-DD), range (today|7d|30d|90d), include_bots (default 0). Max 366 days.
 * Missing tables => 200 { installed:false, state:"not_installed" }.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import pool from "@/lib/db";
import { getInsightsSettings } from "@/lib/insightsSettings";
import { scheduleInsightsRetention, type InsightsPoolLike } from "@/lib/insightsRetention";
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
  InsightsKpis,
  InsightsSummaryResponse,
  InsightsTrendPoint,
} from "@/components/sidhu/insights/insightsTypes";

const TOP_LIMIT = 20;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await handleInsightsGet(req, res, "insights.view", async () => {
    const range = rangeOrReject(req, res);
    if (!range) return undefined;

    const { source, notes } = await resolveDataSource(range);
    const bots = botClause("s", range.includeBots);
    const sessionWindow = [range.startSql, range.endSql];

    let kpis: InsightsKpis;
    let trend: InsightsTrendPoint[];
    let avgEngagedMs: number | null = null;
    let topLandings: InsightsSummaryResponse["top_landings"] = [];
    let topExits: InsightsSummaryResponse["top_exits"] = [];
    let topPaths: InsightsSummaryResponse["top_paths"];

    if (source === "detail") {
      const [sess] = await qrows<Record<string, unknown>>(
        `SELECT COUNT(*) AS sessions,
                COUNT(DISTINCT s.visitor_id) AS visitors,
                COALESCE(SUM(s.pageview_count), 0) AS pageviews,
                COALESCE(SUM(s.order_id IS NOT NULL), 0) AS orders,
                COALESCE(SUM(s.is_new_visitor = 1), 0) AS new_sessions,
                COALESCE(SUM(s.is_returning = 1), 0) AS returning_sessions,
                AVG(s.duration_ms) AS avg_engaged_ms
           FROM insights_sessions s
          WHERE s.started_at >= ? AND s.started_at < ?${bots}`,
        sessionWindow
      );

      const [ev] = await qrows<Record<string, unknown>>(
        `SELECT COALESCE(SUM(e.event_type = 'cart_add' OR e.click_id = 'cart_add'), 0) AS atc,
                COALESCE(SUM(e.event_type = 'checkout_start'), 0) AS checkout_starts,
                COALESCE(SUM(e.event_type = 'checkout_place_order' OR e.click_id = 'place_order'), 0) AS place_orders,
                COALESCE(SUM(e.event_type = 'error'), 0) AS js_errors,
                COALESCE(SUM(e.http_status = 404), 0) AS not_found
           FROM insights_events e
           JOIN insights_sessions s ON s.session_id = e.session_id
          WHERE e.event_time >= ? AND e.event_time < ?${bots}`,
        sessionWindow
      );

      kpis = {
        sessions: num(sess?.sessions),
        visitors: num(sess?.visitors),
        pageviews: num(sess?.pageviews),
        add_to_cart: num(ev?.atc),
        checkout_starts: num(ev?.checkout_starts),
        place_order_clicks: num(ev?.place_orders),
        orders: num(sess?.orders),
        new_sessions: num(sess?.new_sessions),
        returning_sessions: num(sess?.returning_sessions),
        js_errors: num(ev?.js_errors),
        not_found_404: num(ev?.not_found),
      };

      const trendRows = await qrows<Record<string, unknown>>(
        `SELECT DATE_FORMAT(s.started_at, '%Y-%m-%d') AS d,
                COUNT(*) AS sessions,
                COUNT(DISTINCT s.visitor_id) AS visitors,
                COALESCE(SUM(s.pageview_count), 0) AS pageviews,
                COALESCE(SUM(s.order_id IS NOT NULL), 0) AS orders
           FROM insights_sessions s
          WHERE s.started_at >= ? AND s.started_at < ?${bots}
          GROUP BY d
          ORDER BY d ASC
          LIMIT 400`,
        sessionWindow
      );
      trend = trendRows.map((r) => ({
        date: String(r.d),
        sessions: num(r.sessions),
        visitors: num(r.visitors),
        pageviews: num(r.pageviews),
        orders: num(r.orders),
      }));

      avgEngagedMs = numOrNull(sess?.avg_engaged_ms);

      const landingRows = await qrows<Record<string, unknown>>(
        `SELECT s.landing_path AS p, COUNT(*) AS sessions
           FROM insights_sessions s
          WHERE s.started_at >= ? AND s.started_at < ?${bots}
            AND s.landing_path IS NOT NULL
          GROUP BY s.landing_path
          ORDER BY sessions DESC
          LIMIT ${TOP_LIMIT}`,
        sessionWindow
      );
      topLandings = landingRows.map((r) => ({ path: String(r.p || "/"), sessions: num(r.sessions) }));

      const exitRows = await qrows<Record<string, unknown>>(
        `SELECT s.exit_path AS p, COUNT(*) AS sessions
           FROM insights_sessions s
          WHERE s.started_at >= ? AND s.started_at < ?${bots}
            AND s.exit_path IS NOT NULL
          GROUP BY s.exit_path
          ORDER BY sessions DESC
          LIMIT ${TOP_LIMIT}`,
        sessionWindow
      );
      topExits = exitRows.map((r) => ({ path: String(r.p || "/"), sessions: num(r.sessions) }));

      const pathRows = await qrows<Record<string, unknown>>(
        `SELECT e.path AS p,
                COUNT(*) AS pageviews,
                COUNT(DISTINCT e.session_id) AS sessions
           FROM insights_events e
           JOIN insights_sessions s ON s.session_id = e.session_id
          WHERE e.event_type = 'page_view'
            AND e.event_time >= ? AND e.event_time < ?${bots}
          GROUP BY e.path
          ORDER BY pageviews DESC
          LIMIT ${TOP_LIMIT}`,
        sessionWindow
      );
      topPaths = pathRows.map((r) => ({
        path: String(r.p || "/"),
        pageviews: num(r.pageviews),
        sessions: num(r.sessions),
      }));
    } else {
      // Summary (rollup) mode — range older than detail retention.
      const dateWindow = [range.from, range.to];
      const [tot] = await qrows<Record<string, unknown>>(
        `SELECT COALESCE(SUM(sessions), 0) AS sessions,
                COALESCE(SUM(bot_sessions), 0) AS bots,
                COALESCE(SUM(visitors), 0) AS visitors,
                COALESCE(SUM(pageviews), 0) AS pageviews,
                COALESCE(SUM(add_to_cart), 0) AS atc,
                COALESCE(SUM(checkout_starts), 0) AS checkout_starts,
                COALESCE(SUM(place_order_clicks), 0) AS place_orders,
                COALESCE(SUM(orders_attributed), 0) AS orders
           FROM insights_daily_summary
          WHERE summary_date >= ? AND summary_date <= ?`,
        dateWindow
      );
      const sessionsAll = num(tot?.sessions);
      const sessionsShown = range.includeBots ? sessionsAll : Math.max(0, sessionsAll - num(tot?.bots));
      const visitorsSum = num(tot?.visitors);
      kpis = {
        sessions: sessionsShown,
        visitors: visitorsSum > 0 ? visitorsSum : null,
        pageviews: num(tot?.pageviews),
        add_to_cart: num(tot?.atc),
        checkout_starts: num(tot?.checkout_starts),
        place_order_clicks: num(tot?.place_orders),
        orders: num(tot?.orders),
        new_sessions: null,
        returning_sessions: null,
        js_errors: null,
        not_found_404: null,
      };

      const trendRows = await qrows<Record<string, unknown>>(
        `SELECT DATE_FORMAT(summary_date, '%Y-%m-%d') AS d,
                sessions, bot_sessions, visitors, pageviews, orders_attributed
           FROM insights_daily_summary
          WHERE summary_date >= ? AND summary_date <= ?
          ORDER BY summary_date ASC
          LIMIT 400`,
        dateWindow
      );
      trend = trendRows.map((r) => ({
        date: String(r.d),
        sessions: range.includeBots ? num(r.sessions) : Math.max(0, num(r.sessions) - num(r.bot_sessions)),
        visitors: num(r.visitors) > 0 ? num(r.visitors) : null,
        pageviews: num(r.pageviews),
        orders: num(r.orders_attributed),
      }));

      const pathRows = await qrows<Record<string, unknown>>(
        `SELECT path AS p,
                COALESCE(SUM(pageviews), 0) AS pageviews,
                COALESCE(SUM(unique_sessions), 0) AS sessions
           FROM insights_page_daily
          WHERE summary_date >= ? AND summary_date <= ?
          GROUP BY path
          ORDER BY pageviews DESC
          LIMIT ${TOP_LIMIT}`,
        dateWindow
      );
      topPaths = pathRows.map((r) => ({
        path: String(r.p || "/"),
        pageviews: num(r.pageviews),
        sessions: num(r.sessions),
      }));
    }

    // Opportunistic retention on admin load (throttled + GET_LOCK inside; never throws).
    try {
      const settings = await getInsightsSettings();
      scheduleInsightsRetention({
        pool: pool as unknown as InsightsPoolLike,
        settings,
        holder: "admin",
      });
    } catch {
      /* ignore */
    }

    const payload: InsightsSummaryResponse = {
      installed: true,
      state: "ok",
      range: { from: range.from, to: range.to, days: range.days },
      include_bots: range.includeBots,
      source,
      notes,
      has_data: kpis.sessions > 0 || kpis.pageviews > 0,
      kpis,
      avg_engaged_ms: avgEngagedMs,
      trend,
      top_paths: topPaths,
      top_landings: topLandings,
      top_exits: topExits,
    };
    return payload;
  });
}
