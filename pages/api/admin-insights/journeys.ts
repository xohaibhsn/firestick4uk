/**
 * GET /api/admin-insights/journeys — recent sessions with event path sequence.
 * Permission: insights.view. Parameterised SQL only; bounded (max 50 sessions).
 * IP columns are selected and returned ONLY when canViewInsightsIp(role) (super_admin).
 * Managers never receive ip_address / ip_masked (keys are absent).
 * Visitor ids are never returned; sessions are identified by a short `ref`.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { canViewInsightsIp } from "@/lib/adminPermissions";
import {
  SQL_CITY,
  SQL_COUNTRY,
  SQL_REGION,
  botClause,
  handleInsightsGet,
  normUnknown,
  num,
  numOrNull,
  qrows,
  rangeOrReject,
  resolveDataSource,
} from "@/components/sidhu/insights/insightsServer";
import type {
  InsightsJourney,
  InsightsJourneysResponse,
} from "@/components/sidhu/insights/insightsTypes";

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 25;
const MAX_STEPS = 25;
const EVENT_ROW_CAP = 3000;
const PATH_MAX = 120;

const STEP_LABELS: Record<string, string> = {
  cart_add: "Add to cart",
  checkout_start: "Checkout started",
  checkout_place_order: "Place order",
  order_linked: "Order linked",
};

function parseLimit(v: string | string[] | undefined): number {
  const raw = Array.isArray(v) ? v[0] : v;
  const n = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await handleInsightsGet(req, res, "insights.view", async ({ role }) => {
    const range = rangeOrReject(req, res);
    if (!range) return undefined;

    const { source, notes: baseNotes } = await resolveDataSource(range);
    const notes = [...baseNotes];
    const limit = parseLimit(req.query.limit);
    const ipVisible = canViewInsightsIp(role);
    const bots = botClause("s", range.includeBots);

    // Journeys need detail rows; if the range is entirely past detail retention they simply won't exist.
    const ipCols = ipVisible ? ", s.ip_address AS ip_address, s.ip_masked AS ip_masked" : "";
    const sessions = await qrows<Record<string, unknown>>(
      `SELECT s.session_id AS session_id,
              DATE_FORMAT(s.started_at, '%Y-%m-%dT%H:%i:%sZ') AS started_at,
              s.duration_ms AS duration_ms,
              s.is_bot AS is_bot,
              s.is_new_visitor AS is_new_visitor,
              s.is_returning AS is_returning,
              s.device_type AS device_type,
              s.browser_name AS browser_name,
              s.os_name AS os_name,
              ${SQL_COUNTRY} AS c_name,
              ${SQL_REGION} AS r_name,
              ${SQL_CITY} AS ci_name,
              s.network_provider AS network_provider,
              CASE WHEN s.gclid IS NOT NULL AND s.gclid <> '' THEN 'google_ads'
                   WHEN COALESCE(s.utm_source,'') <> '' OR COALESCE(s.utm_medium,'') <> '' THEN 'utm'
                   WHEN COALESCE(s.referrer_host,'') <> '' THEN 'referral'
                   ELSE 'direct' END AS source_bucket,
              s.utm_source AS utm_source,
              s.utm_medium AS utm_medium,
              s.utm_campaign AS utm_campaign,
              s.referrer_host AS referrer_host,
              s.landing_path AS landing_path,
              s.exit_path AS exit_path,
              s.pageview_count AS pageview_count,
              s.event_count AS event_count,
              (s.order_id IS NOT NULL) AS has_order${ipCols}
         FROM insights_sessions s
        WHERE s.started_at >= ? AND s.started_at < ?${bots}
        ORDER BY s.started_at DESC
        LIMIT ?`,
      [range.startSql, range.endSql, limit]
    );

    const stepsBySession = new Map<string, InsightsJourney["steps"]>();
    const truncated = new Set<string>();

    if (sessions.length > 0) {
      const ids = sessions.map((s) => String(s.session_id));
      const events = await qrows<Record<string, unknown>>(
        `SELECT e.session_id AS session_id, e.event_type AS event_type, e.path AS path, e.click_id AS click_id
           FROM insights_events e
          WHERE e.session_id IN (?)
            AND (e.event_type IN ('page_view','cart_add','checkout_start','checkout_place_order','order_linked')
                 OR e.click_id IN ('cart_add','place_order'))
          ORDER BY e.event_time ASC, e.id ASC
          LIMIT ${EVENT_ROW_CAP}`,
        [ids]
      );
      for (const ev of events) {
        const sid = String(ev.session_id);
        let list = stepsBySession.get(sid);
        if (!list) {
          list = [];
          stepsBySession.set(sid, list);
        }
        const type = String(ev.event_type || "");
        const path = String(ev.path || "/").slice(0, PATH_MAX);
        const last = list[list.length - 1];
        if (last && last.type === type && last.path === path) continue;
        if (list.length >= MAX_STEPS) {
          truncated.add(sid);
          continue;
        }
        list.push({ type, path, label: STEP_LABELS[type] ?? null });
      }
    }

    const rows: InsightsJourney[] = sessions.map((r) => {
      const sid = String(r.session_id);
      const row: InsightsJourney = {
        ref: sid.slice(0, 8),
        started_at: String(r.started_at || ""),
        duration_ms: numOrNull(r.duration_ms),
        is_bot: num(r.is_bot) === 1,
        is_new_visitor: num(r.is_new_visitor) === 1,
        is_returning: num(r.is_returning) === 1,
        device_type: String(r.device_type || "unknown"),
        browser_name: r.browser_name ? String(r.browser_name) : null,
        os_name: r.os_name ? String(r.os_name) : null,
        country: normUnknown(r.c_name),
        region: normUnknown(r.r_name),
        city: normUnknown(r.ci_name),
        network_provider: r.network_provider ? String(r.network_provider) : null,
        source_bucket: String(r.source_bucket || "direct"),
        utm_source: r.utm_source ? String(r.utm_source) : null,
        utm_medium: r.utm_medium ? String(r.utm_medium) : null,
        utm_campaign: r.utm_campaign ? String(r.utm_campaign) : null,
        referrer_host: r.referrer_host ? String(r.referrer_host) : null,
        landing_path: String(r.landing_path || "/").slice(0, PATH_MAX),
        exit_path: r.exit_path ? String(r.exit_path).slice(0, PATH_MAX) : null,
        pageview_count: num(r.pageview_count),
        event_count: num(r.event_count),
        has_order: num(r.has_order) === 1,
        steps: stepsBySession.get(sid) || [],
        steps_truncated: truncated.has(sid),
      };
      if (ipVisible) {
        row.ip_address = r.ip_address ? String(r.ip_address) : null;
        row.ip_masked = num(r.ip_masked) === 1;
      }
      return row;
    });

    if (source === "summary" && rows.length === 0) {
      notes.push("Detailed journeys are only kept for the detail retention window.");
    }

    const payload: InsightsJourneysResponse = {
      installed: true,
      state: "ok",
      range: { from: range.from, to: range.to, days: range.days },
      include_bots: range.includeBots,
      source,
      notes,
      has_data: rows.length > 0,
      ip_visible: ipVisible,
      limit,
      rows,
    };
    return payload;
  });
}
