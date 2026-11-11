"use client";

import type { InsightsFunnelResponse, InsightsRangeState } from "./insightsTypes";
import {
  NotesList,
  RangeControls,
  ResourceView,
  S,
  PURPLE,
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

export default function FunnelScreen({ range, onRange, includeBots, onIncludeBots }: Props) {
  const url = buildInsightsUrl("funnel", range, includeBots);
  const resource = useInsightsResource<InsightsFunnelResponse>(url);

  return (
    <div>
      <RangeControls range={range} onRange={onRange} includeBots={includeBots} onIncludeBots={onIncludeBots} />
      <ResourceView
        resource={resource}
        isEmpty={(d) => !d.has_data}
      >
        {(d) => {
          const max = Math.max(1, ...d.steps.map((s) => s.sessions));
          return (
            <>
              <NotesList notes={d.notes} />
              <div style={S.card}>
                <h3 style={S.cardTitle}>Conversion funnel</h3>
                <p style={{ ...S.muted, marginBottom: 12 }}>
                  Distinct sessions per step from stored events only. Drop-off is versus the previous step.
                </p>
                <div className="sin-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th style={S.th}>Step</th>
                        <th style={{ ...S.th, textAlign: "right" }}>Sessions</th>
                        <th style={{ ...S.th, textAlign: "right" }}>Drop-off</th>
                        <th style={S.th}>Relative</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.steps.map((step) => (
                        <tr key={step.id}>
                          <td style={S.td}>{step.label}</td>
                          <td style={S.tdNum}>{fmtInt(step.sessions)}</td>
                          <td style={S.tdNum}>
                            {step.dropoff_pct === null ? "—" : `${step.dropoff_pct.toFixed(1)}%`}
                          </td>
                          <td style={{ ...S.td, minWidth: 120 }}>
                            <div
                              aria-hidden="true"
                              style={{
                                height: 8,
                                borderRadius: 4,
                                background: PURPLE,
                                width: `${Math.max(2, (step.sessions / max) * 100)}%`,
                                maxWidth: 160,
                              }}
                            />
                          </td>
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
