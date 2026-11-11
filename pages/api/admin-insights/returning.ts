/**
 * GET /api/admin-insights/returning — new vs returning visitors.
 * Permission: insights.view. Parameterised SQL only; SELECT only; no lock side-effects.
 * Derived from insights_sessions (visitor_id / is_new_visitor / is_returning);
 * there is no separate insights_visitors table in Phase 1 schema.
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
import {
  daysSinceLastBucketLabel,
  visitCountBucketLabel,
} from "@/components/sidhu/insights/insightsPhase2";
import type {
  InsightsReturningBucket,
  InsightsReturningResponse,
} from "@/components/sidhu/insights/insightsTypes";

const VISITOR_CAP = 5000;

function tallyBuckets(labels: string[], order: string[]): InsightsReturningBucket[] {
  const map = new Map<string, number>();
  for (const o of order) map.set(o, 0);
  for (const l of labels) map.set(l, (map.get(l) || 0) + 1);
  return order.map((label) => ({ label, visitors: map.get(label) || 0 }));
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await handleInsightsGet(req, res, "insights.view", async () => {
    const range = rangeOrReject(req, res);
    if (!range) return undefined;

    const bots = botClause("s", range.includeBots);
    const w = [range.startSql, range.endSql];

    const [totalsRow] = await qrows<Record<string, unknown>>(
      `SELECT COUNT(DISTINCT s.visitor_id) AS visitors,
              COUNT(*) AS sessions,
              COUNT(DISTINCT CASE WHEN s.is_new_visitor = 1 THEN s.visitor_id END) AS new_visitors,
              COUNT(DISTINCT CASE WHEN s.is_returning = 1 THEN s.visitor_id END) AS returning_visitors
         FROM insights_sessions s
        WHERE s.started_at >= ? AND s.started_at < ?${bots}`,
      w
    );

    const visitors = num(totalsRow?.visitors);
    const sessions = num(totalsRow?.sessions);
    const new_visitors = num(totalsRow?.new_visitors);
    const returning_visitors = num(totalsRow?.returning_visitors);

    // Per-visitor visit counts in range (bounded).
    const visitRows = await qrows<Record<string, unknown>>(
      `SELECT s.visitor_id AS visitor_id, COUNT(*) AS visits
         FROM insights_sessions s
        WHERE s.started_at >= ? AND s.started_at < ?${bots}
        GROUP BY s.visitor_id
        ORDER BY visits DESC
        LIMIT ${VISITOR_CAP}`,
      w
    );
    const visitLabels = visitRows.map((r) => visitCountBucketLabel(num(r.visits)));
    const visit_count_buckets = tallyBuckets(visitLabels, [
      "1 visit",
      "2 visits",
      "3–4 visits",
      "5–9 visits",
      "10+ visits",
    ]);

    // Days since prior visit for returning visitors: prior session before range window.
    const gapRows = await qrows<Record<string, unknown>>(
      `SELECT DATEDIFF(r.first_in_range, p.prev_at) AS days_gap
         FROM (
           SELECT s.visitor_id AS visitor_id, MIN(s.started_at) AS first_in_range
             FROM insights_sessions s
            WHERE s.started_at >= ? AND s.started_at < ?${bots}
              AND s.is_returning = 1
            GROUP BY s.visitor_id
            LIMIT ${VISITOR_CAP}
         ) r
         JOIN (
           SELECT s.visitor_id AS visitor_id, MAX(s.started_at) AS prev_at
             FROM insights_sessions s
            WHERE s.started_at < ?
            GROUP BY s.visitor_id
         ) p ON p.visitor_id = r.visitor_id
        WHERE p.prev_at IS NOT NULL
        LIMIT ${VISITOR_CAP}`,
      [range.startSql, range.endSql, range.startSql]
    );

    const gaps = gapRows
      .map((r) => num(r.days_gap))
      .filter((d) => Number.isFinite(d) && d >= 0);
    const daysLabels = gaps.map((d) => daysSinceLastBucketLabel(d));
    const days_since_last_buckets = tallyBuckets(daysLabels, [
      "0–1 days",
      "2–7 days",
      "8–30 days",
      "31–90 days",
      "90+ days",
    ]);

    let avg_days_since_last: number | null = null;
    if (gaps.length > 0) {
      const sum = gaps.reduce((a, b) => a + b, 0);
      avg_days_since_last = Math.round((sum / gaps.length) * 10) / 10;
    }

    const notes: string[] = [];
    if (visitRows.length >= VISITOR_CAP) {
      notes.push(`Visit-count buckets are limited to the top ${VISITOR_CAP} visitors in range.`);
    }

    const payload: InsightsReturningResponse = {
      installed: true,
      state: "ok",
      range: { from: range.from, to: range.to, days: range.days },
      include_bots: range.includeBots,
      source: "detail",
      notes,
      has_data: sessions > 0 || visitors > 0,
      totals: { visitors, new_visitors, returning_visitors, sessions },
      visit_count_buckets,
      days_since_last_buckets,
      avg_days_since_last,
    };
    return payload;
  });
}
