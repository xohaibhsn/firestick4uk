"use client";

import type { InsightsPagesResponse, InsightsRangeState } from "./insightsTypes";
import {
  NotesList,
  RangeControls,
  ResourceView,
  S,
  buildInsightsUrl,
  fmtDuration,
  fmtInt,
  useInsightsResource,
} from "./shared";

type Props = {
  range: InsightsRangeState;
  onRange: (r: InsightsRangeState) => void;
  includeBots: boolean;
  onIncludeBots: (v: boolean) => void;
};

export default function PagesScreen({ range, onRange, includeBots, onIncludeBots }: Props) {
  const url = buildInsightsUrl("pages", range, includeBots);
  const resource = useInsightsResource<InsightsPagesResponse>(url);

  return (
    <div>
      <RangeControls range={range} onRange={onRange} includeBots={includeBots} onIncludeBots={onIncludeBots} />
      <ResourceView resource={resource} isEmpty={(d) => !d.has_data}>
        {(d) => (
          <>
            <NotesList notes={d.notes} />
            <div style={S.card}>
              <h3 style={S.cardTitle}>Top pages</h3>
              <div className="sin-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th style={S.th}>Path</th>
                      <th style={{ ...S.th, textAlign: "right" }}>Pageviews</th>
                      <th style={{ ...S.th, textAlign: "right" }}>Sessions</th>
                      <th style={{ ...S.th, textAlign: "right" }}>Avg time</th>
                      <th style={{ ...S.th, textAlign: "right" }}>Avg scroll</th>
                      <th style={{ ...S.th, textAlign: "right" }}>Exits</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.rows.map((r) => (
                      <tr key={r.path}>
                        <td style={{ ...S.td, wordBreak: "break-all" }}>{r.path}</td>
                        <td style={S.tdNum}>{fmtInt(r.pageviews)}</td>
                        <td style={S.tdNum}>{fmtInt(r.unique_sessions)}</td>
                        <td style={S.tdNum}>{fmtDuration(r.avg_time_on_page_ms)}</td>
                        <td style={S.tdNum}>{r.avg_scroll_depth_pct === null ? "—" : `${fmtInt(r.avg_scroll_depth_pct)}%`}</td>
                        <td style={S.tdNum}>{fmtInt(r.exits)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </ResourceView>
    </div>
  );
}
