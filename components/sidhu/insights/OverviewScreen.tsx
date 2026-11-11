"use client";

import KpiGrid from "./KpiGrid";
import type { InsightsRangeState, InsightsSummaryResponse } from "./insightsTypes";
import {
  KpiCard,
  NotesList,
  RangeControls,
  ResourceView,
  S,
  PURPLE,
  buildInsightsUrl,
  fmtInt,
  fmtPct,
  useInsightsResource,
} from "./shared";

type Props = {
  range: InsightsRangeState;
  onRange: (r: InsightsRangeState) => void;
  includeBots: boolean;
  onIncludeBots: (v: boolean) => void;
};

export default function OverviewScreen({ range, onRange, includeBots, onIncludeBots }: Props) {
  const url = buildInsightsUrl("summary", range, includeBots);
  const resource = useInsightsResource<InsightsSummaryResponse>(url);

  return (
    <div>
      <RangeControls range={range} onRange={onRange} includeBots={includeBots} onIncludeBots={onIncludeBots} />
      <ResourceView resource={resource} isEmpty={(d) => !d.has_data}>
        {(d) => {
          const k = d.kpis;
          const maxSessions = Math.max(1, ...d.trend.map((t) => t.sessions));
          const sessionsForNv = (k.new_sessions ?? 0) + (k.returning_sessions ?? 0);
          return (
            <>
              <NotesList notes={d.notes} />
              <KpiGrid kpis={k} />
              <div className="sin-grid">
                <KpiCard
                  label="Checkout rate"
                  value={fmtPct(k.checkout_starts, k.sessions)}
                  hint="Checkout starts ÷ sessions (approx.)"
                />
                <KpiCard
                  label="Order rate"
                  value={fmtPct(k.orders, k.sessions)}
                  hint="Orders ÷ sessions (approx.)"
                />
                {k.new_sessions !== null && k.returning_sessions !== null && (
                  <KpiCard
                    label="New vs returning"
                    value={`${fmtInt(k.new_sessions)} / ${fmtInt(k.returning_sessions)}`}
                    hint={sessionsForNv ? `${fmtPct(k.returning_sessions, sessionsForNv)} returning` : undefined}
                  />
                )}
              </div>
              <div style={S.card}>
                <h3 style={S.cardTitle}>Sessions by day (UTC)</h3>
                <div className="sin-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th style={S.th}>Date</th>
                        <th style={S.th}>Sessions</th>
                        <th style={{ ...S.th, textAlign: "right" }}>Visitors</th>
                        <th style={{ ...S.th, textAlign: "right" }}>Pageviews</th>
                        <th style={{ ...S.th, textAlign: "right" }}>Orders</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.trend.map((t) => (
                        <tr key={t.date}>
                          <td style={{ ...S.td, whiteSpace: "nowrap" }}>{t.date}</td>
                          <td style={{ ...S.td, minWidth: 140 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div
                                aria-hidden="true"
                                style={{
                                  height: 8,
                                  borderRadius: 4,
                                  background: PURPLE,
                                  width: `${Math.max(2, (t.sessions / maxSessions) * 100)}%`,
                                  maxWidth: 120,
                                }}
                              />
                              <span>{fmtInt(t.sessions)}</span>
                            </div>
                          </td>
                          <td style={S.tdNum}>{fmtInt(t.visitors)}</td>
                          <td style={S.tdNum}>{fmtInt(t.pageviews)}</td>
                          <td style={S.tdNum}>{fmtInt(t.orders)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          );
        }}
      </ResourceView>
    </div>
  );
}
