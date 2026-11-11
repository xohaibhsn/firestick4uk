"use client";

import { useState } from "react";
import type { InsightsRangeState, InsightsSourcesResponse } from "./insightsTypes";
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

const BUCKET_LABELS: Record<string, string> = {
  direct: "Direct",
  organic: "Organic",
  google_ads: "Google Ads",
  utm: "Campaign (UTM)",
  referral: "Referral",
  unknown: "Unknown",
};

export default function SourcesScreen({ range, onRange, includeBots, onIncludeBots }: Props) {
  const [gclidOnly, setGclidOnly] = useState(false);
  const url = buildInsightsUrl("sources", range, includeBots);
  const resource = useInsightsResource<InsightsSourcesResponse>(url);

  return (
    <div>
      <RangeControls range={range} onRange={onRange} includeBots={includeBots} onIncludeBots={onIncludeBots} />
      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, marginBottom: 12, cursor: "pointer" }}>
        <input type="checkbox" checked={gclidOnly} onChange={(e) => setGclidOnly(e.target.checked)} />
        Google Ads click ID only
      </label>
      <ResourceView resource={resource} isEmpty={(d) => !d.has_data}>
        {(d) => {
          const rows = gclidOnly ? d.rows.filter((r) => r.has_gclid) : d.rows;
          return (
            <>
              <NotesList notes={d.notes} />
              <div style={S.card}>
                <h3 style={S.cardTitle}>Traffic sources</h3>
                {rows.length === 0 ? (
                  <div style={S.muted}>No sources match this filter.</div>
                ) : (
                  <div className="sin-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th style={S.th}>Source</th>
                          <th style={S.th}>UTM source</th>
                          <th style={S.th}>UTM medium</th>
                          <th style={S.th}>UTM campaign</th>
                          <th style={{ ...S.th, textAlign: "right" }}>Sessions</th>
                          <th style={{ ...S.th, textAlign: "right" }}>Visitors</th>
                          <th style={{ ...S.th, textAlign: "right" }}>Orders</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, i) => (
                          <tr key={`${r.source_bucket}|${r.utm_source}|${r.utm_medium}|${r.utm_campaign}|${r.referrer_host}|${i}`}>
                            <td style={S.td}>
                              {BUCKET_LABELS[r.source_bucket] || r.source_bucket}
                              {r.referrer_host ? <div style={S.muted}>{r.referrer_host}</div> : null}
                            </td>
                            <td style={S.td}>{r.utm_source || "—"}</td>
                            <td style={S.td}>{r.utm_medium || "—"}</td>
                            <td style={S.td}>{r.utm_campaign || "—"}</td>
                            <td style={S.tdNum}>{fmtInt(r.sessions)}</td>
                            <td style={S.tdNum}>{fmtInt(r.visitors)}</td>
                            <td style={S.tdNum}>{fmtInt(r.orders)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          );
        }}
      </ResourceView>
    </div>
  );
}
