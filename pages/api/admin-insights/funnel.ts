/**
 * GET /api/admin-insights/funnel — product view → ATC → cart → checkout → order.
 * Permission: insights.view. Parameterised SQL only; SELECT only; no lock side-effects.
 * Counts are DISTINCT sessions from stored events only (honest empty when zero).
 * Missing tables => 200 { installed:false, state:"not_installed" }.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import {
  botClause,
  handleInsightsGet,
  num,
  qrows,
  rangeOrReject,
} from "@/components/sidhu/insights/insightsServer";
import { buildFunnelSteps } from "@/components/sidhu/insights/insightsPhase2";
import type { InsightsFunnelResponse } from "@/components/sidhu/insights/insightsTypes";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await handleInsightsGet(req, res, "insights.view", async () => {
    const range = rangeOrReject(req, res);
    if (!range) return undefined;

    const bots = botClause("s", range.includeBots);
    const w = [range.startSql, range.endSql];

    // Funnel needs event detail; probe sessions first so missing tables fail-safe.
    await qrows(`SELECT 1 AS ok FROM insights_sessions s LIMIT 1`);

    const [row] = await qrows<Record<string, unknown>>(
      `SELECT
         (SELECT COUNT(DISTINCT e.session_id)
            FROM insights_events e
            JOIN insights_sessions s ON s.session_id = e.session_id
           WHERE e.event_time >= ? AND e.event_time < ?${bots}
             AND e.event_type = 'page_view'
             AND (e.path = '/products' OR e.path LIKE '/products/%')) AS product_view,
         (SELECT COUNT(DISTINCT e.session_id)
            FROM insights_events e
            JOIN insights_sessions s ON s.session_id = e.session_id
           WHERE e.event_time >= ? AND e.event_time < ?${bots}
             AND (e.event_type = 'cart_add' OR e.click_id = 'cart_add')) AS add_to_cart,
         (SELECT COUNT(DISTINCT e.session_id)
            FROM insights_events e
            JOIN insights_sessions s ON s.session_id = e.session_id
           WHERE e.event_time >= ? AND e.event_time < ?${bots}
             AND (e.event_type = 'cart_view'
                  OR e.click_id = 'cart_view'
                  OR (e.event_type = 'page_view'
                      AND (e.path = '/cart' OR e.path LIKE '/cart/%')
                      AND e.path <> '/cart/success'
                      AND e.path NOT LIKE '/cart/success/%'))) AS cart_view,
         (SELECT COUNT(DISTINCT e.session_id)
            FROM insights_events e
            JOIN insights_sessions s ON s.session_id = e.session_id
           WHERE e.event_time >= ? AND e.event_time < ?${bots}
             AND (e.event_type = 'checkout_start'
                  OR e.click_id IN ('mini_checkout','pdp_sticky_checkout'))) AS checkout_start,
         (SELECT COUNT(DISTINCT e.session_id)
            FROM insights_events e
            JOIN insights_sessions s ON s.session_id = e.session_id
           WHERE e.event_time >= ? AND e.event_time < ?${bots}
             AND (e.event_type IN ('order_linked','checkout_place_order')
                  OR e.click_id = 'place_order'
                  OR s.order_id IS NOT NULL)) AS order_placed`,
      [...w, ...w, ...w, ...w, ...w]
    );

    const counts = {
      product_view: num(row?.product_view),
      add_to_cart: num(row?.add_to_cart),
      cart_view: num(row?.cart_view),
      checkout_start: num(row?.checkout_start),
      order_placed: num(row?.order_placed),
    };
    const steps = buildFunnelSteps(counts);
    const has_data = steps.some((s) => s.sessions > 0);

    const payload: InsightsFunnelResponse = {
      installed: true,
      state: "ok",
      range: { from: range.from, to: range.to, days: range.days },
      include_bots: range.includeBots,
      source: "detail",
      notes: has_data
        ? []
        : ["No funnel events in this range yet. Counts are computed only from stored Insights events."],
      has_data,
      steps,
    };
    return payload;
  });
}
