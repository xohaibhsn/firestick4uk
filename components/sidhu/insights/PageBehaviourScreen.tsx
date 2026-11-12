"use client";

import { useState } from "react";
import type { InsightsPageBehaviourResponse, InsightsRangeState } from "./insightsTypes";
import {
  NotesList,
  RangeControls,
  ResourceView,
  S,
  buildInsightsUrl,
  fmtDuration,
  fmtInt,
  fmtPct,
  useInsightsResource,
} from "./shared";

type Props = {
  range: InsightsRangeState;
  onRange: (r: InsightsRangeState) => void;
  includeBots: boolean;
  onIncludeBots: (v: boolean) => void;
};

type DeviceChoice = "all" | "m" | "d";

const DEVICE_LABELS: Record<DeviceChoice, string> = { all: "All devices", m: "Mobile", d: "Desktop" };

export default function PageBehaviourScreen({ range, onRange, includeBots, onIncludeBots }: Props) {
  const [device, setDevice] = useState<DeviceChoice>("all");
  const [pathInput, setPathInput] = useState("");
  const [path, setPath] = useState("");
  const [pathError, setPathError] = useState("");

  const extra: Record<string, string | number> = { limit: 30 };
  if (device !== "all") extra.device = device;
  if (path) extra.path = path;
  const url = buildInsightsUrl("page-behaviour", range, includeBots, extra);
  const resource = useInsightsResource<InsightsPageBehaviourResponse>(url);

  const applyPath = () => {
    const v = pathInput.trim();
    if (!v) {
      setPathError("");
      setPath("");
      return;
    }
    if (!v.startsWith("/") || v.startsWith("//") || /[?#\s]/.test(v)) {
      setPathError("Enter a site path such as /products (no query or hash).");
      return;
    }
    setPathError("");
    setPath(v);
  };

  return (
    <div>
      <RangeControls range={range} onRange={onRange} includeBots={includeBots} onIncludeBots={onIncludeBots} />
      <div className="sin-controls">
        <label style={S.muted}>
          Device{" "}
          <select
            style={S.input}
            value={device}
            aria-label="Device"
            onChange={(e) => setDevice(e.target.value as DeviceChoice)}
          >
            {(Object.keys(DEVICE_LABELS) as DeviceChoice[]).map((k) => (
              <option key={k} value={k}>
                {DEVICE_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        <label style={S.muted}>
          Path{" "}
          <input
            style={{ ...S.input, width: 220 }}
            type="text"
            placeholder="All paths"
            value={pathInput}
            aria-label="Path filter"
            onChange={(e) => setPathInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") applyPath();
            }}
          />
        </label>
        <button type="button" style={S.btnGhost} onClick={applyPath}>
          Apply
        </button>
        {pathError && (
          <span role="alert" style={{ fontSize: 12, color: "#DC2626" }}>
            {pathError}
          </span>
        )}
      </div>
      <ResourceView resource={resource} isEmpty={(d) => !d.has_data}>
        {(d) => (
          <>
            <NotesList notes={d.notes} />
            <div style={S.card}>
              <h3 style={S.cardTitle}>Page behaviour</h3>
              <p style={{ ...S.muted, marginBottom: 12 }}>
                Engaged time counts only while the tab is visible. Scroll reach is the share of page views that
                reached each mark (short pages that never scroll are not counted). Device comes from screen width
                (under 768px = mobile).
              </p>
              <div className="sin-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th style={S.th}>Path</th>
                      <th style={{ ...S.th, textAlign: "right" }}>Views</th>
                      <th style={{ ...S.th, textAlign: "right" }}>Avg engaged</th>
                      <th style={{ ...S.th, textAlign: "right" }}>25%</th>
                      <th style={{ ...S.th, textAlign: "right" }}>50%</th>
                      <th style={{ ...S.th, textAlign: "right" }}>75%</th>
                      <th style={{ ...S.th, textAlign: "right" }}>100%</th>
                      <th style={{ ...S.th, textAlign: "right" }}>Exit rate</th>
                      <th style={{ ...S.th, textAlign: "right" }}>Rage clicks</th>
                      <th style={S.th}>Top clicked</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.rows.map((r) => (
                      <tr key={r.path}>
                        <td style={{ ...S.td, wordBreak: "break-all" }}>{r.path}</td>
                        <td style={S.tdNum}>{fmtInt(r.views)}</td>
                        <td style={S.tdNum}>{fmtDuration(r.avg_engaged_ms)}</td>
                        <td style={S.tdNum}>{fmtPct(r.reach.m25, r.views)}</td>
                        <td style={S.tdNum}>{fmtPct(r.reach.m50, r.views)}</td>
                        <td style={S.tdNum}>{fmtPct(r.reach.m75, r.views)}</td>
                        <td style={S.tdNum}>{fmtPct(r.reach.m100, r.views)}</td>
                        <td style={S.tdNum}>{r.exit_rate_pct == null ? "—" : `${r.exit_rate_pct}%`}</td>
                        <td style={S.tdNum}>{fmtInt(r.rage_clicks)}</td>
                        <td style={S.td}>
                          {r.top_clicks.length === 0
                            ? "—"
                            : r.top_clicks.map((c) => `${c.label || `<${c.tag || "element"}>`} (${c.clicks})`).join(", ")}
                        </td>
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
