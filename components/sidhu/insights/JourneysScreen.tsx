"use client";

import type { InsightsJourneysResponse, InsightsRangeState } from "./insightsTypes";
import {
  NotesList,
  RangeControls,
  ResourceView,
  S,
  buildInsightsUrl,
  fmtDuration,
  fmtUtc,
  useInsightsResource,
} from "./shared";

type Props = {
  range: InsightsRangeState;
  onRange: (r: InsightsRangeState) => void;
  includeBots: boolean;
  onIncludeBots: (v: boolean) => void;
};

const KEY_STEPS = new Set(["cart_add", "checkout_start", "checkout_place_order", "order_linked"]);

const SOURCE_LABELS: Record<string, string> = {
  direct: "Direct",
  google_ads: "Google Ads",
  utm: "Campaign",
  referral: "Referral",
};

export default function JourneysScreen({ range, onRange, includeBots, onIncludeBots }: Props) {
  const url = buildInsightsUrl("journeys", range, includeBots, { limit: 50 });
  const resource = useInsightsResource<InsightsJourneysResponse>(url);

  return (
    <div>
      <RangeControls range={range} onRange={onRange} includeBots={includeBots} onIncludeBots={onIncludeBots} />
      <ResourceView resource={resource} isEmpty={(d) => !d.has_data}>
        {(d) => (
          <>
            <NotesList notes={d.notes} />
            <div style={{ ...S.muted, marginBottom: 10 }}>Most recent {d.rows.length} sessions (max 50).</div>
            {d.rows.map((j) => {
              const source =
                (SOURCE_LABELS[j.source_bucket] || j.source_bucket) +
                (j.utm_campaign ? ` · ${j.utm_campaign}` : j.referrer_host ? ` · ${j.referrer_host}` : "");
              const exitClick = j.exit_click
                ? j.exit_click.label || j.exit_click.tag || j.exit_click.click_id || "element"
                : null;
              return (
                <div key={`${j.ref}-${j.started_at}`} style={S.card}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 8 }}>
                    <strong style={{ fontSize: 13 }}>{fmtUtc(j.started_at)}</strong>
                    <span style={S.pill}>{j.is_returning ? "Returning" : j.is_new_visitor ? "New" : "Visitor"}</span>
                    <span style={S.pill}>{j.device_type}</span>
                    {j.is_bot && <span style={{ ...S.pill, background: "#FEE2E2", color: "#B91C1C" }}>Bot</span>}
                    {j.has_order && <span style={{ ...S.pill, background: "#DCFCE7", color: "#166534" }}>Order</span>}
                    <span style={S.muted}>#{j.ref}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#444444", display: "grid", gap: 2, marginBottom: 8 }}>
                    <div>
                      <strong>Source:</strong> {source}
                    </div>
                    <div>
                      <strong>Browser:</strong> {[j.browser_name, j.os_name].filter(Boolean).join(" / ") || "—"} ·{" "}
                      <strong>Engaged:</strong> {fmtDuration(j.duration_ms)} · <strong>Pageviews:</strong>{" "}
                      {j.pageview_count}
                    </div>
                    <div>
                      <strong>Landing:</strong> {j.landing_path} · <strong>Exit:</strong> {j.exit_path || "—"}
                      {exitClick ? (
                        <>
                          {" "}
                          · <strong>Last click before exit:</strong> {exitClick}
                        </>
                      ) : null}
                    </div>
                  </div>
                  <div className="sin-steps" aria-label="Journey steps">
                    {j.steps.length === 0 ? (
                      <span style={S.muted}>Landing: {j.landing_path}</span>
                    ) : (
                      j.steps.map((s, i) => {
                        const isPage = s.type === "page_view";
                        const detail = isPage
                          ? [
                              s.engaged_ms ? fmtDuration(s.engaged_ms) : null,
                              s.scroll_pct ? `${s.scroll_pct}% scroll` : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")
                          : "";
                        return (
                          <span key={`${s.type}-${i}`} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                            {i > 0 && <span aria-hidden="true">→</span>}
                            <span
                              className={`sin-step${KEY_STEPS.has(s.type) ? " sin-step-key" : ""}`}
                              title={s.path}
                            >
                              {s.label ? `${s.label} · ${s.path}` : s.path}
                              {detail ? ` (${detail})` : ""}
                            </span>
                          </span>
                        );
                      })
                    )}
                    {j.steps_truncated && <span style={S.muted}>…</span>}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </ResourceView>
    </div>
  );
}
