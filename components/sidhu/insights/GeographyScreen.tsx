"use client";

import type { InsightsGeoResponse, InsightsRangeState } from "./insightsTypes";
import {
  KpiCard,
  NotesList,
  RangeControls,
  ResourceView,
  S,
  buildInsightsUrl,
  fmtInt,
  useInsightsResource,
} from "./shared";

// Must match DBIP_ATTRIBUTION_TEXT / DBIP_ATTRIBUTION_URL in lib/insightsGeo.ts.
// Not imported: that module reads the filesystem and must never enter the client bundle.
const DBIP_TEXT = "IP Geolocation by DB-IP";
const DBIP_URL = "https://db-ip.com";

const PHRASE_LIMIT = 100;

type Props = {
  range: InsightsRangeState;
  onRange: (r: InsightsRangeState) => void;
  includeBots: boolean;
  onIncludeBots: (v: boolean) => void;
};

/** Exact phrase required by the Insights spec. */
export function geoPhrase(visitors: number, country: string, region: string, city: string): string {
  return `In this period, ${visitors} visitors from ${country}, ${region}, ${city}.`;
}

export default function GeographyScreen({ range, onRange, includeBots, onIncludeBots }: Props) {
  const url = buildInsightsUrl("geo", range, includeBots);
  const resource = useInsightsResource<InsightsGeoResponse>(url);

  return (
    <div>
      <RangeControls range={range} onRange={onRange} includeBots={includeBots} onIncludeBots={onIncludeBots} />
      <ResourceView resource={resource} isEmpty={(d) => !d.has_data}>
        {(d) => (
          <>
            <NotesList notes={d.notes} />
            <div className="sin-grid">
              <KpiCard label="Visitors" value={fmtInt(d.totals.visitors)} />
              <KpiCard label="Sessions" value={fmtInt(d.totals.sessions)} />
              <KpiCard label="Countries" value={fmtInt(d.countries.length)} />
            </div>

            <div
              style={{ ...S.card, background: "#F5F3FF", borderColor: "#C4B5FD", fontSize: 13, color: "#4C1D95" }}
            >
              <strong>Approximate.</strong> Location is estimated from the visitor&apos;s IP address and can be wrong
              (VPNs, mobile carriers, shared networks).
              {!d.geo_city_enabled && " City-level lookup is currently disabled, so regions and cities show as Unknown."}
            </div>

            <div style={S.card}>
              <h3 style={S.cardTitle}>Visitors by location</h3>
              <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {d.rows.slice(0, PHRASE_LIMIT).map((r, i) => (
                  <li
                    key={`${r.country}|${r.region}|${r.city}|${i}`}
                    style={{ fontSize: 13, padding: "6px 0", borderBottom: `1px solid #E5E5E5` }}
                  >
                    {geoPhrase(r.visitors, r.country, r.region, r.city)}
                  </li>
                ))}
              </ul>
              {(d.rows.length > PHRASE_LIMIT || d.truncated) && (
                <div style={{ ...S.muted, marginTop: 8 }}>Showing the top {PHRASE_LIMIT} locations.</div>
              )}
            </div>

            <div style={S.card}>
              <h3 style={S.cardTitle}>Country → region → city</h3>
              {d.countries.map((c, ci) => (
                <details key={c.country} open={ci < 2} style={{ marginBottom: 8 }}>
                  <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                    {c.country} — {fmtInt(c.visitors)} visitors
                  </summary>
                  <div style={{ paddingLeft: 16, marginTop: 6 }}>
                    {c.regions.map((r) => (
                      <details key={`${c.country}|${r.region}`} style={{ marginBottom: 4 }}>
                        <summary style={{ cursor: "pointer", fontSize: 13 }}>
                          {r.region} — {fmtInt(r.visitors)} visitors
                        </summary>
                        <ul style={{ margin: "4px 0 6px", paddingLeft: 18, fontSize: 12, color: "#666666" }}>
                          {r.cities.map((city) => (
                            <li key={`${c.country}|${r.region}|${city.city}`}>
                              {city.city}: {fmtInt(city.visitors)}
                            </li>
                          ))}
                        </ul>
                      </details>
                    ))}
                  </div>
                </details>
              ))}
              <div style={{ ...S.muted, marginTop: 6 }}>
                A visitor seen from several locations in the period is counted in each of them.
              </div>
            </div>

            <div style={{ ...S.muted, marginBottom: 16 }}>
              <a href={DBIP_URL} target="_blank" rel="noopener noreferrer">
                {DBIP_TEXT}
              </a>
            </div>
          </>
        )}
      </ResourceView>
    </div>
  );
}
