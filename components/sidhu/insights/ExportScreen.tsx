"use client";

import { useState } from "react";
import { hasAdminPermission, type AdminRoleName } from "@/lib/adminPermissions";
import { INSIGHTS_EXPORT_DEFAULT_ROWS, INSIGHTS_EXPORT_MAX_ROWS, type InsightsRangeState } from "./insightsTypes";
import { RangeControls, S, buildInsightsUrl } from "./shared";

type Props = {
  adminRole: AdminRoleName;
  range: InsightsRangeState;
  onRange: (r: InsightsRangeState) => void;
  includeBots: boolean;
  onIncludeBots: (v: boolean) => void;
};

export default function ExportScreen({ adminRole, range, onRange, includeBots, onIncludeBots }: Props) {
  const canExport = hasAdminPermission(adminRole, "insights.export");
  const isSuperAdmin = adminRole === "super_admin";
  const [kind, setKind] = useState<"daily" | "sessions">("daily");
  const [maxRows, setMaxRows] = useState(String(INSIGHTS_EXPORT_DEFAULT_ROWS));
  const [status, setStatus] = useState<"idle" | "working" | "ok" | "error" | "not_installed">("idle");
  const [message, setMessage] = useState("");

  if (!canExport) {
    return (
      <div style={S.card} role="status">
        <div style={{ fontSize: 14, fontWeight: 700 }}>Export not available</div>
        <div style={{ ...S.muted, marginTop: 4 }}>Your role cannot export Insights data.</div>
      </div>
    );
  }

  const effectiveKind = kind === "sessions" && !isSuperAdmin ? "daily" : kind;

  async function onDownload() {
    setStatus("working");
    setMessage("");
    const capped = Math.min(
      INSIGHTS_EXPORT_MAX_ROWS,
      Math.max(1, Number.parseInt(maxRows, 10) || INSIGHTS_EXPORT_DEFAULT_ROWS)
    );
    const url = buildInsightsUrl("export", range, includeBots, {
      kind: effectiveKind,
      max_rows: capped,
    });
    try {
      const res = await fetch(url, { credentials: "include", cache: "no-store" });
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const data = await res.json().catch(() => ({}));
        if (data && data.installed === false) {
          setStatus("not_installed");
          setMessage("Insights not installed — schema tables are missing.");
          return;
        }
        if (res.status === 403) {
          setStatus("error");
          setMessage(typeof data?.error === "string" ? data.error : "Permission denied.");
          return;
        }
        setStatus("error");
        setMessage(typeof data?.error === "string" ? data.error : "Export failed.");
        return;
      }
      if (!res.ok) {
        setStatus("error");
        setMessage("Export failed.");
        return;
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `insights-${effectiveKind}-${range.from}_${range.to}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
      setStatus("ok");
      setMessage(`Downloaded ${effectiveKind} CSV (max ${capped.toLocaleString("en-GB")} rows).`);
    } catch {
      setStatus("error");
      setMessage("Network error. Check your connection and retry.");
    }
  }

  return (
    <div>
      <RangeControls range={range} onRange={onRange} includeBots={includeBots} onIncludeBots={onIncludeBots} />
      <div style={S.card}>
        <h3 style={S.cardTitle}>Export Insights CSV</h3>
        <p style={{ ...S.muted, marginBottom: 12 }}>
          Daily summaries for managers and super_admins. Session-level rows are super_admin only and never include
          IP address or location. Cells are formula-injection safe; every export is audit-logged.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end", marginBottom: 12 }}>
          <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
            <legend style={{ ...S.muted, marginBottom: 4 }}>Dataset</legend>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <label style={{ fontSize: 13, display: "inline-flex", gap: 6, alignItems: "center" }}>
                <input
                  type="radio"
                  name="insights-export-kind"
                  checked={effectiveKind === "daily"}
                  onChange={() => setKind("daily")}
                />
                Daily summaries
              </label>
              <label
                style={{
                  fontSize: 13,
                  display: "inline-flex",
                  gap: 6,
                  alignItems: "center",
                  opacity: isSuperAdmin ? 1 : 0.5,
                }}
              >
                <input
                  type="radio"
                  name="insights-export-kind"
                  checked={effectiveKind === "sessions"}
                  disabled={!isSuperAdmin}
                  onChange={() => setKind("sessions")}
                />
                Sessions {isSuperAdmin ? "" : "(super_admin only)"}
              </label>
            </div>
          </fieldset>
          <label style={{ ...S.muted, display: "flex", flexDirection: "column", gap: 4 }}>
            Max rows (≤ {INSIGHTS_EXPORT_MAX_ROWS.toLocaleString("en-GB")})
            <input
              type="number"
              min={1}
              max={INSIGHTS_EXPORT_MAX_ROWS}
              style={S.input}
              value={maxRows}
              aria-label="Maximum export rows"
              onChange={(e) => setMaxRows(e.target.value)}
            />
          </label>
          <button
            type="button"
            style={{ ...S.btn, opacity: status === "working" ? 0.6 : 1 }}
            disabled={status === "working"}
            onClick={() => void onDownload()}
          >
            {status === "working" ? "Preparing…" : "Download CSV"}
          </button>
        </div>
        {status === "not_installed" && (
          <div role="status" style={{ fontSize: 13, color: "#92400E" }}>
            {message}
          </div>
        )}
        {status === "error" && (
          <div role="alert" style={{ fontSize: 13, color: "#DC2626" }}>
            {message}
          </div>
        )}
        {status === "ok" && (
          <div role="status" style={{ fontSize: 13, color: "#166534" }}>
            {message}
          </div>
        )}
      </div>
    </div>
  );
}
