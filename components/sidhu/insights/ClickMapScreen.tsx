"use client";

import { useState } from "react";
import {
  INSIGHTS_DESKTOP_WIDTH_PX,
  INSIGHTS_MOBILE_WIDTH_PX,
  type InsightsClickMapResponse,
  type InsightsDevice,
  type InsightsPageBehaviourResponse,
  type InsightsRangeState,
} from "./insightsTypes";
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

/** Display box (CSS px) the page is scaled into. */
const BOX = {
  m: { w: 300, h: 560, viewW: INSIGHTS_MOBILE_WIDTH_PX },
  d: { w: 640, h: 400, viewW: INSIGHTS_DESKTOP_WIDTH_PX },
} as const;

function ClickMapView({
  path,
  device,
  range,
  includeBots,
}: {
  path: string;
  device: InsightsDevice;
  range: InsightsRangeState;
  includeBots: boolean;
}) {
  const [preview, setPreview] = useState(false);
  const url = buildInsightsUrl("click-map", range, includeBots, { path, device });
  const resource = useInsightsResource<InsightsClickMapResponse>(url);
  const box = BOX[device];
  const scale = box.w / box.viewW;

  return (
    <ResourceView resource={resource} isEmpty={(d) => !d.has_data}>
      {(d) => {
        const max = d.buckets.reduce((m, b) => Math.max(m, b.count), 1);
        return (
          <>
            <NotesList notes={d.notes} />
            <div style={S.card}>
              <h3 style={S.cardTitle}>
                {d.path} · {device === "m" ? "Mobile" : "Desktop"} · {fmtInt(d.total_clicks)} clicks
              </h3>
              <p style={{ ...S.muted, marginBottom: 10 }}>
                Approximate: click positions are stored as a share of the page width and height, rounded to the
                nearest 2%, so each cell below is a 2% bucket.
              </p>
              <div style={{ marginBottom: 10 }}>
                <button type="button" style={S.btnGhost} onClick={() => setPreview((v) => !v)}>
                  {preview ? "Hide page preview" : "Show page preview (may be blocked)"}
                </button>
              </div>
              <div
                data-testid="click-map-surface"
                style={{
                  position: "relative",
                  width: box.w,
                  maxWidth: "100%",
                  height: box.h,
                  border: "1px solid #E5E5E5",
                  borderRadius: 8,
                  background: "#FAFAFA",
                  overflow: "hidden",
                }}
              >
                {preview && (
                  <iframe
                    title={`Preview of ${d.path}`}
                    src={d.path}
                    sandbox=""
                    loading="lazy"
                    tabIndex={-1}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: box.viewW,
                      height: Math.round(box.h / scale),
                      border: 0,
                      transform: `scale(${scale})`,
                      transformOrigin: "top left",
                      pointerEvents: "none",
                    }}
                  />
                )}
                {d.buckets.map((b) => (
                  <span
                    key={`${b.x_pct}:${b.y_pct}`}
                    title={`${b.count} click${b.count === 1 ? "" : "s"}`}
                    style={{
                      position: "absolute",
                      left: `${Math.min(b.x_pct, 98)}%`,
                      top: `${Math.min(b.y_pct, 98)}%`,
                      width: "2%",
                      height: "2%",
                      minWidth: 6,
                      minHeight: 6,
                      borderRadius: 3,
                      background: `rgba(220, 38, 38, ${(0.25 + 0.75 * (b.count / max)).toFixed(2)})`,
                    }}
                  />
                ))}
              </div>
              {preview && (
                <p style={{ ...S.muted, marginTop: 8 }}>
                  The preview loads without scripts. If it stays blank, the site&apos;s security headers block framing
                  — the heat grid above still shows where visitors clicked.
                </p>
              )}
              <div className="sin-table-wrap" style={{ marginTop: 12 }}>
                <table>
                  <thead>
                    <tr>
                      <th style={S.th}>Across (%)</th>
                      <th style={S.th}>Down (%)</th>
                      <th style={{ ...S.th, textAlign: "right" }}>Clicks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.buckets.slice(0, 10).map((b) => (
                      <tr key={`${b.x_pct}:${b.y_pct}`}>
                        <td style={S.td}>{b.x_pct}</td>
                        <td style={S.td}>{b.y_pct}</td>
                        <td style={S.tdNum}>{fmtInt(b.count)}</td>
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
  );
}

export default function ClickMapScreen({ range, onRange, includeBots, onIncludeBots }: Props) {
  const [device, setDevice] = useState<InsightsDevice>("m");
  const [pathInput, setPathInput] = useState("");
  const [path, setPath] = useState("");
  const [pathError, setPathError] = useState("");

  const pathsUrl = buildInsightsUrl("page-behaviour", range, includeBots, { limit: 50 });
  const paths = useInsightsResource<InsightsPageBehaviourResponse>(pathsUrl);
  const options = paths.status === "ready" ? paths.data.rows.map((r) => r.path) : [];

  const choose = (v: string) => {
    const p = v.trim();
    if (!p.startsWith("/") || p.startsWith("//") || /[?#\s]/.test(p)) {
      setPathError("Enter a site path such as /products (no query or hash).");
      return;
    }
    setPathError("");
    setPath(p);
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
            onChange={(e) => setDevice(e.target.value === "d" ? "d" : "m")}
          >
            <option value="m">Mobile (390px)</option>
            <option value="d">Desktop (1280px)</option>
          </select>
        </label>
        <label style={S.muted}>
          Path{" "}
          <input
            style={{ ...S.input, width: 220 }}
            type="text"
            list="sin-clickmap-paths"
            placeholder="/products"
            value={pathInput}
            aria-label="Click map path"
            onChange={(e) => setPathInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") choose(pathInput);
            }}
          />
          <datalist id="sin-clickmap-paths">
            {options.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </label>
        <button type="button" style={S.btn} onClick={() => choose(pathInput)}>
          Show map
        </button>
        {pathError && (
          <span role="alert" style={{ fontSize: 12, color: "#DC2626" }}>
            {pathError}
          </span>
        )}
      </div>
      {path ? (
        <ClickMapView key={`${path}|${device}`} path={path} device={device} range={range} includeBots={includeBots} />
      ) : (
        <div style={{ ...S.card, ...S.muted }}>Choose a path and device to see where visitors clicked.</div>
      )}
    </div>
  );
}
