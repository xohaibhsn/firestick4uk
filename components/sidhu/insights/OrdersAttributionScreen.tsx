"use client";

import type { AdminRoleName } from "@/lib/adminPermissions";
import type { InsightsOrdersAttributionResponse, InsightsRangeState } from "./insightsTypes";
import {
  NotesList,
  RangeControls,
  ResourceView,
  S,
  buildInsightsUrl,
  fmtInt,
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

export default function OrdersAttributionScreen({
  adminRole,
  range,
  onRange,
  includeBots,
  onIncludeBots,
}: Props) {
  const url = buildInsightsUrl("orders-attribution", range, includeBots, { limit: 50 });
  const resource = useInsightsResource<InsightsOrdersAttributionResponse>(url);
  const mayShowIp = adminRole === "super_admin";

  return (
    <div>
      <RangeControls range={range} onRange={onRange} includeBots={includeBots} onIncludeBots={onIncludeBots} />
      <ResourceView resource={resource} isEmpty={(d) => !d.has_data}>
        {(d) => (
          <>
            <NotesList notes={d.notes} />
            <div style={S.card}>
              <h3 style={S.cardTitle}>Orders attribution</h3>
              <p style={{ ...S.muted, marginBottom: 12 }}>
                Source, landing page, country and device from the Insights session linked to each order. Customer
                contact details are never shown here.
              </p>
              <div className="sin-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th style={S.th}>Order</th>
                      <th style={S.th}>When</th>
                      <th style={S.th}>Source / medium</th>
                      <th style={S.th}>Referrer</th>
                      <th style={S.th}>Landing</th>
                      <th style={S.th}>Country</th>
                      <th style={S.th}>Device</th>
                      <th style={{ ...S.th, textAlign: "right" }}>Total</th>
                      {mayShowIp && d.ip_visible && <th style={S.th}>IP</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {d.rows.map((r) => {
                      const showIp =
                        mayShowIp && d.ip_visible && typeof r.ip_address === "string" && r.ip_address.length > 0;
                      return (
                        <tr key={r.order_id}>
                          <td style={S.td}>
                            <strong>{r.order_id}</strong>
                            <div style={S.muted}>
                              {[r.payment_method, r.status].filter(Boolean).join(" · ") || "—"}
                            </div>
                          </td>
                          <td style={{ ...S.td, whiteSpace: "nowrap" }}>{fmtUtc(r.ordered_at)}</td>
                          <td style={S.td}>
                            {[r.source, r.medium].filter(Boolean).join(" / ") || "direct"}
                          </td>
                          <td style={S.td}>{r.referrer_host || "—"}</td>
                          <td style={S.td}>{r.landing_path}</td>
                          <td style={S.td}>{r.country}</td>
                          <td style={S.td}>{r.device_type}</td>
                          <td style={S.tdNum}>{r.total == null ? "—" : fmtInt(r.total)}</td>
                          {mayShowIp && d.ip_visible && (
                            <td style={S.td}>
                              {showIp ? `${r.ip_address}${r.ip_masked ? " (masked)" : ""}` : "—"}
                            </td>
                          )}
                        </tr>
                      );
                    })}
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
