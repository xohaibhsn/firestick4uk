"use client";

import { useMemo, useState } from "react";
import KpiGrid from "./KpiGrid";
import type { InsightsSummaryResponse, InsightsTopPath } from "./insightsTypes";
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

function PathTable({ title, rows }: { title: string; rows: InsightsTopPath[] }) {
  return (
    <div style={S.card}>
      <h3 style={S.cardTitle}>{title}</h3>
      <div className="sin-table-wrap">
        <table>
          <thead>
            <tr>
              <th style={S.th}>Path</th>
              <th style={{ ...S.th, textAlign: "right" }}>Sessions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td style={S.td} colSpan={2}>
                  No data yet
                </td>
              </tr>
            )}
            {rows.slice(0, TOP_N).map((p) => (
              <tr key={p.path}>
                <td style={{ ...S.td, wordBreak: "break-all" }}>{p.path}</td>
                <td style={S.tdNum}>{fmtInt(p.sessions)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

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
              <KpiGrid kpis={k} avgEngagedMs={d.avg_engaged_ms} />
              {alerts.length > 0 && (
                <div role="alert" style={{ ...S.card, background: "#FFF7ED", borderColor: "#FDBA74", fontSize: 13, color: "#9A3412" }}>
                  <strong>Alerts:</strong> {alerts.join(" · ")}
                </div>
              )}
              <div className="sin-two">
                <PathTable title="Top landing pages" rows={d.top_landings} />
                <PathTable title="Top exit pages" rows={d.top_exits} />
              </div>
            </>
          );
        }}
      </ResourceView>
    </div>
  );
}
