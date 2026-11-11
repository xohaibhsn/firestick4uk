/**
 * GET /api/admin-insights/checkout-problems — checkout friction signals.
 * Permission: insights.view. Parameterised SQL only; SELECT only; no lock side-effects.
 * Metrics the beacon does not emit are returned as tracked:false ("not tracked").
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
import { CHECKOUT_PROBLEM_CATALOG } from "@/components/sidhu/insights/insightsPhase2";
import type {
  InsightsCheckoutMetric,
  InsightsCheckoutProblemsResponse,
} from "@/components/sidhu/insights/insightsTypes";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await handleInsightsGet(req, res, "insights.view", async () => {
    const range = rangeOrReject(req, res);
    if (!range) return undefined;

    const bots = botClause("s", range.includeBots);
    const w = [range.startSql, range.endSql];

    await qrows(`SELECT 1 AS ok FROM insights_sessions s LIMIT 1`);

    const [row] = await qrows<Record<string, unknown>>(
      `SELECT
         (SELECT COUNT(DISTINCT e.session_id)
            FROM insights_events e
            JOIN insights_sessions s ON s.session_id = e.session_id
           WHERE e.event_time >= ? AND e.event_time < ?${bots}
             AND (e.event_type IN ('checkout_start','checkout_payment','checkout_place_order')
                  OR e.click_id IN ('mini_checkout','pdp_sticky_checkout','place_order','pay_method_bank','pay_method_cod'))
             AND s.order_id IS NULL) AS abandonment,
         (SELECT COUNT(*)
            FROM insights_events e
            JOIN insights_sessions s ON s.session_id = e.session_id
           WHERE e.event_time >= ? AND e.event_time < ?${bots}
             AND (e.event_type = 'checkout_payment'
                  OR e.click_id IN ('pay_method_bank','pay_method_cod'))) AS payment_switches`,
      [...w, ...w]
    );

    const live: Record<string, number> = {
      checkout_stage_abandonment: num(row?.abandonment),
      payment_method_switches: num(row?.payment_switches),
    };

    const metrics: InsightsCheckoutMetric[] = CHECKOUT_PROBLEM_CATALOG.map((m) => {
      if (!m.tracked) {
        return {
          id: m.id,
          label: m.label,
          tracked: false,
          count: null,
          note: m.note,
        };
      }
      return {
        id: m.id,
        label: m.label,
        tracked: true,
        count: live[m.id] ?? 0,
        note: m.note,
      };
    });

    const has_data = metrics.some((m) => m.tracked && (m.count ?? 0) > 0);

    const payload: InsightsCheckoutProblemsResponse = {
      installed: true,
      state: "ok",
      range: { from: range.from, to: range.to, days: range.days },
      include_bots: range.includeBots,
      source: "detail",
      notes: [],
      has_data,
      metrics,
    };
    return payload;
  });
}
