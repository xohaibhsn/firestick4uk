"use client";

import type { InsightsCheckoutProblemsResponse, InsightsRangeState } from "./insightsTypes";
import {
  NotesList,
  RangeControls,
  ResourceView,
  S,
  buildInsightsUrl,
  fmtInt,
  useInsightsResource,
} from "./shared";

type Props = {
  range: InsightsRangeState;
  onRange: (r: InsightsRangeState) => void;
  includeBots: boolean;
  onIncludeBots: (v: boolean) => void;
};

export default function CheckoutProblemsScreen({ range, onRange, includeBots, onIncludeBots }: Props) {
  const url = buildInsightsUrl("checkout-problems", range, includeBots);
  const resource = useInsightsResource<InsightsCheckoutProblemsResponse>(url);

  return (
    <div>
      <RangeControls range={range} onRange={onRange} includeBots={includeBots} onIncludeBots={onIncludeBots} />
      <ResourceView resource={resource}>
        {(d) => (
          <>
            <NotesList notes={d.notes} />
            <div style={S.card}>
              <h3 style={S.cardTitle}>Checkout problems</h3>
              <p style={{ ...S.muted, marginBottom: 12 }}>
                Counts come only from events the beacon already emits. Untracked signals are labelled honestly.
              </p>
              <div className="sin-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th style={S.th}>Signal</th>
                      <th style={{ ...S.th, textAlign: "right" }}>Count</th>
                      <th style={S.th}>Status</th>
                      <th style={S.th}>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.metrics.map((m) => (
                      <tr key={m.id}>
                        <td style={S.td}>{m.label}</td>
                        <td style={S.tdNum}>{m.tracked ? fmtInt(m.count) : "—"}</td>
                        <td style={S.td}>
                          {m.tracked ? (
                            <span style={S.pill}>Tracked</span>
                          ) : (
                            <span style={{ ...S.pill, background: "#FEF3C7", color: "#92400E" }}>
                              Not tracked
                            </span>
                          )}
                        </td>
                        <td style={{ ...S.td, ...S.muted }}>{m.note || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!d.has_data && (
                <p style={{ ...S.muted, marginTop: 12 }}>
                  No tracked checkout-problem events in this range yet.
                </p>
              )}
            </div>
          </>
        )}
      </ResourceView>
    </div>
  );
}
