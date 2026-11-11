"use client";

import type { AdminRoleName } from "@/lib/adminPermissions";
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
  adminRole: AdminRoleName;
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

export default function JourneysScreen({ adminRole, range, onRange, includeBots, onIncludeBots }: Props) {
  const url = buildInsightsUrl("journeys", range, includeBots, { limit: 50 });
  const resource = useInsightsResource<InsightsJourneysResponse>(url);
  // Hard UI rule: only super_admin may ever see IP (server also omits it for other roles).
  const mayShowIp = adminRole === "super_admin";

  return (
    <div>
      <RangeControls range={range} onRange={onRange} includeBots={includeBots} onIncludeBots={onIncludeBots} />
      <ResourceView resource={resource} isEmpty={(d) => !d.has_data}>
        {(d) => (
          <>
            <NotesList notes={d.notes} />
            <div style={{ ...S.muted, marginBottom: 10 }}>Most recent {d.rows.length} sessions (max 50).</div>
            {d.rows.map((j) => {
              const showIp = mayShowIp && d.ip_visible && typeof j.ip_address === "string" && j.ip_address.length > 0;
              const source =
                (SOURCE_LABELS[j.source_bucket] || j.source_bucket) +
                (j.utm_campaign ? ` · ${j.utm_campaign}` : j.referrer_host ? ` · ${j.referrer_host}` : "");
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
                      <strong>Location:</strong> {j.country}, {j.region}, {j.city}
                      {j.network_provider ? ` · ${j.network_provider}` : ""}
                    </div>
                    <div>
                      <strong>Source:</strong> {source}
                    </div>
                    <div>
                      <strong>Browser:</strong> {[j.browser_name, j.os_name].filter(Boolean).join(" / ") || "—"} ·{" "}
                      <strong>Time:</strong> {fmtDuration(j.duration_ms)} · <strong>Pageviews:</strong> {j.pageview_count}
                    </div>
                    {showIp && (
                      <div>
                        <strong>IP:</strong> {j.ip_address}
                        {j.ip_masked ? " (masked)" : ""}
                      </div>
                    )}
                  </div>
                  <div className="sin-steps" aria-label="Journey steps">
                    {j.steps.length === 0 ? (
                      <span style={S.muted}>Landing: {j.landing_path}</span>
                    ) : (
                      j.steps.map((s, i) => (
                        <span key={`${s.type}-${i}`} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          {i > 0 && <span aria-hidden="true">→</span>}
                          <span
                            className={`sin-step${KEY_STEPS.has(s.type) ? " sin-step-key" : ""}`}
                            title={s.path}
                          >
                            {s.label ? `${s.label} · ${s.path}` : s.path}
                          </span>
                        </span>
                      ))
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
