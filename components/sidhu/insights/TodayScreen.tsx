"use client";

import { useMemo, useState } from "react";
import KpiGrid from "./KpiGrid";
import type { InsightsSummaryResponse } from "./insightsTypes";
import { rangeFromPreset } from "./insightsTypes";
import {
  IncludeBotsToggle,
  NotesList,
  ResourceView,
  S,
  buildInsightsUrl,
  fmtInt,
  useInsightsResource,
} from "./shared";

const TOP_N = 5;

export default function TodayScreen() {
  const [includeBots, setIncludeBots] = useState(false);
  const range = useMemo(() => rangeFromPreset("today"), []);
  const url = buildInsightsUrl("summary", range, includeBots);
  const resource = useInsightsResource<InsightsSummaryResponse>(url);

  return (
    <div>
      <div className="sin-controls">
        <span style={{ fontSize: 13, fontWeight: 600 }}>Today (UTC)</span>
        <IncludeBotsToggle checked={includeBots} onChange={setIncludeBots} />
        <button type="button" style={S.btnGhost} onClick={resource.retry}>
          Refresh
        </button>
      </div>
      <ResourceView resource={resource} isEmpty={(d) => !d.has_data}>
        {(d) => {
          const k = d.kpis;
          const alerts: string[] = [];
          if ((k.js_errors ?? 0) > 0) alerts.push(`${fmtInt(k.js_errors)} JavaScript error event(s) today`);
          if ((k.not_found_404 ?? 0) > 0) alerts.push(`${fmtInt(k.not_found_404)} page(s) returned 404 today`);
          return (
            <>
              <NotesList notes={d.notes} />
              <KpiGrid kpis={k} />
              {alerts.length > 0 && (
                <div role="alert" style={{ ...S.card, background: "#FFF7ED", borderColor: "#FDBA74", fontSize: 13, color: "#9A3412" }}>
                  <strong>Alerts:</strong> {alerts.join(" · ")}
                </div>
              )}
              <div className="sin-two">
                <div style={S.card}>
                  <h3 style={S.cardTitle}>Top countries</h3>
                  <div className="sin-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th style={S.th}>Country</th>
                          <th style={{ ...S.th, textAlign: "right" }}>Visitors</th>
                          <th style={{ ...S.th, textAlign: "right" }}>Sessions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.top_countries.slice(0, TOP_N).map((c) => (
                          <tr key={c.country}>
                            <td style={S.td}>{c.country}</td>
                            <td style={S.tdNum}>{fmtInt(c.visitors)}</td>
                            <td style={S.tdNum}>{fmtInt(c.sessions)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div style={S.card}>
                  <h3 style={S.cardTitle}>Top pages</h3>
                  <div className="sin-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th style={S.th}>Path</th>
                          <th style={{ ...S.th, textAlign: "right" }}>Pageviews</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.top_paths.slice(0, TOP_N).map((p) => (
                          <tr key={p.path}>
                            <td style={{ ...S.td, wordBreak: "break-all" }}>{p.path}</td>
                            <td style={S.tdNum}>{fmtInt(p.pageviews)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          );
        }}
      </ResourceView>
    </div>
  );
}
