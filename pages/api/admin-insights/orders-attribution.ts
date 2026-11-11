/**
 * GET /api/admin-insights/orders-attribution — order ↔ session attribution.
 * Permission: insights.view. Parameterised SQL only; SELECT only; no lock side-effects.
 *
 * Logical link = insights_sessions rows with order_id (Phase 1 schema has no
 * separate insights_orders_link table). Joined to orders for payment/status/total
 * only — never customer name/email/phone/address.
 * IP returned ONLY when canViewInsightsIp(role) (super_admin).
 * Missing tables => 200 { installed:false, state:"not_installed" }.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { canViewInsightsIp } from "@/lib/adminPermissions";
import {
  SQL_COUNTRY,
  botClause,
  handleInsightsGet,
  normUnknown,
  num,
  numOrNull,
  qrows,
  rangeOrReject,
} from "@/components/sidhu/insights/insightsServer";
import type {
  InsightsOrderAttributionRow,
  InsightsOrdersAttributionResponse,
} from "@/components/sidhu/insights/insightsTypes";

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;
const PATH_MAX = 120;

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

    const limit = parseLimit(req.query.limit);
    const ipVisible = canViewInsightsIp(role);
    const bots = botClause("s", range.includeBots);
    const ipCols = ipVisible ? ", s.ip_address AS ip_address, s.ip_masked AS ip_masked" : "";

    // Derived "insights_orders_link": sessions that linked an order_id.
    const rowsRaw = await qrows<Record<string, unknown>>(
      `SELECT s.order_id AS order_id,
              DATE_FORMAT(COALESCE(o.created_at, s.started_at), '%Y-%m-%dT%H:%i:%sZ') AS ordered_at,
              o.payment_method AS payment_method,
              o.status AS status,
              o.total AS total,
              COALESCE(NULLIF(s.utm_source,''), CASE WHEN s.gclid IS NOT NULL AND s.gclid <> '' THEN 'google' ELSE NULL END) AS src,
              COALESCE(NULLIF(s.utm_medium,''), CASE WHEN s.gclid IS NOT NULL AND s.gclid <> '' THEN 'cpc' ELSE NULL END) AS med,
              s.referrer_host AS referrer_host,
              s.landing_path AS landing_path,
              ${SQL_COUNTRY} AS c_name,
              s.device_type AS device_type${ipCols}
         FROM insights_sessions s
         LEFT JOIN orders o ON o.order_id = s.order_id
        WHERE s.order_id IS NOT NULL
          AND s.order_id <> ''
          AND s.started_at >= ? AND s.started_at < ?${bots}
        ORDER BY s.started_at DESC
        LIMIT ?`,
      [range.startSql, range.endSql, limit]
    );

    const rows: InsightsOrderAttributionRow[] = rowsRaw.map((r) => {
      const row: InsightsOrderAttributionRow = {
        order_id: String(r.order_id || "").slice(0, 64),
        ordered_at: r.ordered_at ? String(r.ordered_at) : null,
        payment_method: r.payment_method != null ? String(r.payment_method).slice(0, 64) : null,
        status: r.status != null ? String(r.status).slice(0, 64) : null,
        total: numOrNull(r.total),
        source: r.src != null && String(r.src) ? String(r.src).slice(0, 128) : null,
        medium: r.med != null && String(r.med) ? String(r.med).slice(0, 128) : null,
        referrer_host: r.referrer_host ? String(r.referrer_host).slice(0, 255) : null,
        landing_path: String(r.landing_path || "/").slice(0, PATH_MAX),
        country: normUnknown(r.c_name),
        device_type: String(r.device_type || "unknown"),
      };
      if (ipVisible) {
        row.ip_address = r.ip_address ? String(r.ip_address) : null;
        row.ip_masked = num(r.ip_masked) === 1;
      }
      return row;
    });

    const payload: InsightsOrdersAttributionResponse = {
      installed: true,
      state: "ok",
      range: { from: range.from, to: range.to, days: range.days },
      include_bots: range.includeBots,
      source: "detail",
      notes: [],
      has_data: rows.length > 0,
      ip_visible: ipVisible,
      limit,
      rows,
    };
    return payload;
  });
}
