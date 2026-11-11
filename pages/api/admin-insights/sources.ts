/**
 * GET /api/admin-insights/sources — traffic sources / UTM.
 * Permission: insights.view. Parameterised SQL only.
 * Detail range: insights_sessions (honours include_bots, distinct visitors, orders).
 * Older range: insights_source_daily rollup.
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
  InsightsSourceRow,
  InsightsSourcesResponse,
} from "@/components/sidhu/insights/insightsTypes";

const ROW_LIMIT = 100;

// Mirrors lib/insightsIngest sourceBucket(): gclid > utm > referrer > direct (static SQL, no user input).
const HAS_GCLID = "(s.gclid IS NOT NULL AND s.gclid <> '')";
const HAS_UTM = "(COALESCE(s.utm_source,'') <> '' OR COALESCE(s.utm_medium,'') <> '')";
const SQL_BUCKET = `CASE WHEN ${HAS_GCLID} THEN 'google_ads' WHEN ${HAS_UTM} THEN 'utm' WHEN COALESCE(s.referrer_host,'') <> '' THEN 'referral' ELSE 'direct' END`;
const SQL_REF_HOST = `CASE WHEN ${HAS_GCLID} OR ${HAS_UTM} THEN '' ELSE COALESCE(s.referrer_host,'') END`;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await handleInsightsGet(req, res, "insights.view", async () => {
    const range = rangeOrReject(req, res);
    if (!range) return undefined;

    const { source, notes } = await resolveDataSource(range);
    const bots = botClause("s", range.includeBots);
    let rows: InsightsSourceRow[];

    if (source === "detail") {
      const w = [range.startSql, range.endSql];
      const data = await qrows<Record<string, unknown>>(
        `SELECT ${SQL_BUCKET} AS b_bucket,
                COALESCE(s.utm_source,'') AS b_source,
                COALESCE(s.utm_medium,'') AS b_medium,
                COALESCE(s.utm_campaign,'') AS b_campaign,
                ${SQL_REF_HOST} AS b_ref,
                COUNT(*) AS sessions,
                COUNT(DISTINCT s.visitor_id) AS visitors,
                COALESCE(SUM(s.order_id IS NOT NULL), 0) AS orders,
                COALESCE(MAX(${HAS_GCLID}), 0) AS has_gclid
           FROM insights_sessions s
          WHERE s.started_at >= ? AND s.started_at < ?${bots}
          GROUP BY b_bucket, b_source, b_medium, b_campaign, b_ref
          ORDER BY sessions DESC
          LIMIT ${ROW_LIMIT}`,
        w
      );
      rows = data.map((r) => ({
        source_bucket: String(r.b_bucket || "direct"),
        utm_source: String(r.b_source || ""),
        utm_medium: String(r.b_medium || ""),
        utm_campaign: String(r.b_campaign || ""),
        referrer_host: String(r.b_ref || ""),
        sessions: num(r.sessions),
        visitors: numOrNull(r.visitors),
        orders: num(r.orders),
        has_gclid: num(r.has_gclid) === 1,
      }));
    } else {
      const w = [range.from, range.to];
      const data = await qrows<Record<string, unknown>>(
        `SELECT source_bucket AS b_bucket,
                utm_source AS b_source,
                utm_medium AS b_medium,
                utm_campaign AS b_campaign,
                COALESCE(SUM(sessions), 0) AS sessions,
                COALESCE(SUM(visitors), 0) AS visitors,
                COALESCE(SUM(orders_attributed), 0) AS orders
           FROM insights_source_daily
          WHERE summary_date >= ? AND summary_date <= ?
          GROUP BY b_bucket, b_source, b_medium, b_campaign
          ORDER BY sessions DESC
          LIMIT ${ROW_LIMIT}`,
        w
      );
      rows = data.map((r) => ({
        source_bucket: String(r.b_bucket || "unknown"),
        utm_source: String(r.b_source || ""),
        utm_medium: String(r.b_medium || ""),
        utm_campaign: String(r.b_campaign || ""),
        referrer_host: "",
        sessions: num(r.sessions),
        visitors: num(r.visitors) > 0 ? num(r.visitors) : null,
        orders: num(r.orders),
        has_gclid: String(r.b_bucket) === "google_ads",
      }));
    }

    const payload: InsightsSourcesResponse = {
      installed: true,
      state: "ok",
      range: { from: range.from, to: range.to, days: range.days },
      include_bots: range.includeBots,
      source,
      notes,
      has_data: rows.length > 0,
      rows,
      totals: { sessions: rows.reduce((a, r) => a + r.sessions, 0) },
    };
    return payload;
  });
}
