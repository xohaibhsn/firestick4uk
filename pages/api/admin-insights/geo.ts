/**
 * GET /api/admin-insights/geo — country → region → city rollup.
 * Permission: insights.view. Parameterised SQL only.
 * Detail range: insights_sessions (exact distinct visitors, bots filter).
 * Older range: insights_geo_daily fallback (visitors approximated by sessions where needed).
 * Query: from, to, range, include_bots. Max 366 days.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { DBIP_ATTRIBUTION_TEXT, DBIP_ATTRIBUTION_URL } from "@/lib/insightsGeo";
import { getInsightsSettings } from "@/lib/insightsSettings";
import {
  SQL_CITY,
  SQL_COUNTRY,
  SQL_REGION,
  botClause,
  handleInsightsGet,
  normUnknown,
  num,
  qrows,
  rangeOrReject,
  resolveDataSource,
} from "@/components/sidhu/insights/insightsServer";
import type {
  InsightsGeoCountry,
  InsightsGeoResponse,
} from "@/components/sidhu/insights/insightsTypes";

const ROW_LIMIT = 1000;
const COUNTRY_LIMIT = 300;

type GeoRow = { country: string; code: string; region: string; city: string; visitors: number; sessions: number };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await handleInsightsGet(req, res, "insights.view", async () => {
    const range = rangeOrReject(req, res);
    if (!range) return undefined;

    const { source, notes } = await resolveDataSource(range);
    const settings = await getInsightsSettings();
    const bots = botClause("s", range.includeBots);

    let geoRows: GeoRow[];
    let countryTotals = new Map<string, number>();
    let totals = { visitors: 0, sessions: 0, pageviews: 0 };

    if (source === "detail") {
      const w = [range.startSql, range.endSql];
      const rows = await qrows<Record<string, unknown>>(
        `SELECT ${SQL_COUNTRY} AS c_name,
                COALESCE(MAX(NULLIF(s.country_code,'')), '') AS c_code,
                ${SQL_REGION} AS r_name,
                ${SQL_CITY} AS ci_name,
                COUNT(DISTINCT s.visitor_id) AS visitors,
                COUNT(*) AS sessions
           FROM insights_sessions s
          WHERE s.started_at >= ? AND s.started_at < ?${bots}
          GROUP BY c_name, r_name, ci_name
          ORDER BY visitors DESC, sessions DESC
          LIMIT ${ROW_LIMIT}`,
        w
      );
      geoRows = rows.map((r) => ({
        country: normUnknown(r.c_name),
        code: String(r.c_code || ""),
        region: normUnknown(r.r_name),
        city: normUnknown(r.ci_name),
        visitors: num(r.visitors),
        sessions: num(r.sessions),
      }));

      const cRows = await qrows<Record<string, unknown>>(
        `SELECT ${SQL_COUNTRY} AS c_name, COUNT(DISTINCT s.visitor_id) AS visitors
           FROM insights_sessions s
          WHERE s.started_at >= ? AND s.started_at < ?${bots}
          GROUP BY c_name
          LIMIT ${COUNTRY_LIMIT}`,
        w
      );
      countryTotals = new Map(cRows.map((r) => [normUnknown(r.c_name), num(r.visitors)]));

      const [t] = await qrows<Record<string, unknown>>(
        `SELECT COUNT(DISTINCT s.visitor_id) AS visitors,
                COUNT(*) AS sessions,
                COALESCE(SUM(s.pageview_count), 0) AS pageviews
           FROM insights_sessions s
          WHERE s.started_at >= ? AND s.started_at < ?${bots}`,
        w
      );
      totals = { visitors: num(t?.visitors), sessions: num(t?.sessions), pageviews: num(t?.pageviews) };
    } else {
      const w = [range.from, range.to];
      const rows = await qrows<Record<string, unknown>>(
        `SELECT COALESCE(NULLIF(country_name,''),'Unknown') AS c_name,
                COALESCE(MAX(NULLIF(country_code,'')), '') AS c_code,
                COALESCE(NULLIF(region_name,''),'Unknown') AS r_name,
                COALESCE(NULLIF(city_name,''),'Unknown') AS ci_name,
                COALESCE(SUM(CASE WHEN visitors > 0 THEN visitors ELSE sessions END), 0) AS visitors,
                COALESCE(SUM(sessions), 0) AS sessions,
                COALESCE(SUM(pageviews), 0) AS pageviews
           FROM insights_geo_daily
          WHERE summary_date >= ? AND summary_date <= ?
          GROUP BY c_name, r_name, ci_name
          ORDER BY visitors DESC, sessions DESC
          LIMIT ${ROW_LIMIT}`,
        w
      );
      let pv = 0;
      geoRows = rows.map((r) => {
        pv += num(r.pageviews);
        return {
          country: normUnknown(r.c_name),
          code: String(r.c_code || ""),
          region: normUnknown(r.r_name),
          city: normUnknown(r.ci_name),
          visitors: num(r.visitors),
          sessions: num(r.sessions),
        };
      });
      for (const g of geoRows) {
        countryTotals.set(g.country, (countryTotals.get(g.country) || 0) + g.visitors);
      }
      totals = {
        visitors: geoRows.reduce((a, g) => a + g.visitors, 0),
        sessions: geoRows.reduce((a, g) => a + g.sessions, 0),
        pageviews: pv,
      };
    }

    // Build country -> region -> city tree.
    const tree = new Map<string, InsightsGeoCountry>();
    for (const g of geoRows) {
      let c = tree.get(g.country);
      if (!c) {
        c = {
          country: g.country,
          country_code: g.code,
          visitors: countryTotals.get(g.country) ?? 0,
          sessions: 0,
          regions: [],
        };
        tree.set(g.country, c);
      }
      c.sessions += g.sessions;
      if (!c.country_code && g.code) c.country_code = g.code;
      let r = c.regions.find((x) => x.region === g.region);
      if (!r) {
        r = { region: g.region, visitors: 0, cities: [] };
        c.regions.push(r);
      }
      r.visitors += g.visitors;
      r.cities.push({ city: g.city, visitors: g.visitors, sessions: g.sessions });
    }
    const countries = [...tree.values()];
    for (const c of countries) {
      if (!c.visitors) c.visitors = c.regions.reduce((a, r) => a + r.visitors, 0);
      c.regions.sort((a, b) => b.visitors - a.visitors);
      for (const r of c.regions) r.cities.sort((a, b) => b.visitors - a.visitors);
    }
    countries.sort((a, b) => b.visitors - a.visitors || b.sessions - a.sessions);

    const payload: InsightsGeoResponse = {
      installed: true,
      state: "ok",
      range: { from: range.from, to: range.to, days: range.days },
      include_bots: range.includeBots,
      source,
      notes,
      has_data: totals.sessions > 0,
      approximate: true,
      attribution: { text: DBIP_ATTRIBUTION_TEXT, url: DBIP_ATTRIBUTION_URL },
      geo_city_enabled: settings.geo_city_enabled === true,
      totals,
      countries,
      rows: geoRows.map((g) => ({
        country: g.country,
        region: g.region,
        city: g.city,
        visitors: g.visitors,
        sessions: g.sessions,
      })),
      truncated: geoRows.length >= ROW_LIMIT,
    };
    return payload;
  });
}
