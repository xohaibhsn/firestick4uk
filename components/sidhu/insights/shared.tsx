"use client";

/**
 * Shared Sidhu Insights UI: styles, fetch hook, date range picker, bots toggle and state views.
 * No new dependencies; inline styles + a small scoped <style> block (see InsightsStyles).
 */
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  rangeFromPreset,
  validateRangeInputs,
  isoDateUtc,
  type InsightsRangePreset,
  type InsightsRangeState,
} from "./insightsTypes";

export const PURPLE = "#5B21B6";
export const PURPLE_DARK = "#4C1D95";
export const BORDER = "#E5E5E5";
export const GRAY_BG = "#F5F5F5";
export const GRAY_TEXT = "#666666";

export const S: Record<string, CSSProperties> = {
  card: {
    background: "#FFFFFF",
    border: `1px solid ${BORDER}`,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
  },
  cardTitle: { fontSize: 14, fontWeight: 700, color: "#111111", margin: "0 0 10px" },
  muted: { fontSize: 12, color: GRAY_TEXT },
  th: {
    textAlign: "left",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    color: GRAY_TEXT,
    padding: "8px 10px",
    borderBottom: `1px solid ${BORDER}`,
    whiteSpace: "nowrap",
    background: GRAY_BG,
  },
  td: { fontSize: 13, color: "#111111", padding: "8px 10px", borderBottom: `1px solid ${BORDER}`, verticalAlign: "top" },
  tdNum: {
    fontSize: 13,
    color: "#111111",
    padding: "8px 10px",
    borderBottom: `1px solid ${BORDER}`,
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  },
  btn: {
    background: PURPLE,
    color: "#FFFFFF",
    border: "none",
    padding: "8px 16px",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  btnGhost: {
    background: "#FFFFFF",
    color: PURPLE,
    border: `1px solid ${PURPLE}`,
    padding: "7px 14px",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  input: {
    border: `1px solid ${BORDER}`,
    borderRadius: 8,
    padding: "7px 10px",
    fontSize: 13,
    color: "#111111",
    background: "#FFFFFF",
    minHeight: 34,
  },
  pill: {
    display: "inline-block",
    fontSize: 11,
    fontWeight: 600,
    padding: "2px 8px",
    borderRadius: 999,
    background: GRAY_BG,
    color: GRAY_TEXT,
  },
};

/** Scoped responsive CSS (grid, scrolling tables, sticky controls). Render once in the panel. */
export function InsightsStyles() {
  return (
    <style>{`
      .sin-root { display:block; }
      .sin-subnav { display:flex; gap:6px; overflow-x:auto; padding-bottom:6px; margin-bottom:12px; -webkit-overflow-scrolling:touch; }
      .sin-subnav button { flex:0 0 auto; border:1px solid ${BORDER}; background:#fff; color:#111; padding:8px 14px; border-radius:999px; font-size:13px; font-weight:600; cursor:pointer; }
      .sin-subnav button[aria-current="page"] { background:${PURPLE}; border-color:${PURPLE}; color:#fff; }
      .sin-controls { display:flex; flex-wrap:wrap; gap:10px 14px; align-items:center; margin-bottom:14px; }
      .sin-presets { display:flex; flex-wrap:wrap; gap:6px; }
      .sin-presets button { border:1px solid ${BORDER}; background:#fff; color:#111; padding:6px 12px; border-radius:8px; font-size:12px; font-weight:600; cursor:pointer; }
      .sin-presets button[aria-pressed="true"] { background:${PURPLE}; border-color:${PURPLE}; color:#fff; }
      .sin-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:12px; margin-bottom:16px; }
      .sin-two { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; }
      .sin-table-wrap { overflow-x:auto; -webkit-overflow-scrolling:touch; }
      .sin-table-wrap table { width:100%; border-collapse:collapse; min-width:420px; }
      .sin-skel { background:linear-gradient(90deg,#eee,#f7f7f7,#eee); background-size:200% 100%; animation:sin-pulse 1.2s ease-in-out infinite; border-radius:8px; }
      @keyframes sin-pulse { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
      .sin-steps { display:flex; flex-wrap:wrap; gap:4px; align-items:center; }
      .sin-step { font-size:11px; background:${GRAY_BG}; border:1px solid ${BORDER}; border-radius:6px; padding:2px 6px; max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .sin-step-key { background:#EDE9FE; border-color:#C4B5FD; color:${PURPLE_DARK}; font-weight:600; }
      @media (max-width: 720px) {
        .sin-two { grid-template-columns:1fr; }
        .sin-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
        .sin-controls { position:sticky; top:0; z-index:5; background:#fff; padding:8px 0; border-bottom:1px solid ${BORDER}; }
      }
    `}</style>
  );
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function fmtInt(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString("en-GB");
}

export function fmtPct(part: number, whole: number): string {
  if (!whole) return "—";
  return `${((part / whole) * 100).toFixed(1)}%`;
}

export function fmtDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}m ${r}s` : `${m}m`;
}

export function fmtBytes(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function fmtUtc(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toLocaleString("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })} UTC`;
}

// ---------------------------------------------------------------------------
// Fetch hook (no synchronous setState inside effects)
// ---------------------------------------------------------------------------

type FetchResult<T> =
  | { key: string; status: "ready"; data: T; error: "" }
  | { key: string; status: "not_installed"; data: null; error: "" }
  | { key: string; status: "error"; data: null; error: string };

export type InsightsResource<T> =
  | { status: "loading"; data: null; error: ""; retry: () => void }
  | (FetchResult<T> & { retry: () => void });

export function buildInsightsUrl(
  path: string,
  range: { from: string; to: string } | null,
  includeBots: boolean,
  extra?: Record<string, string | number>
): string {
  const p = new URLSearchParams();
  if (range) {
    p.set("from", range.from);
    p.set("to", range.to);
  }
  p.set("include_bots", includeBots ? "1" : "0");
  if (extra) for (const [k, v] of Object.entries(extra)) p.set(k, String(v));
  return `/api/admin-insights/${path}?${p.toString()}`;
}

export function useInsightsResource<T>(url: string): InsightsResource<T> {
  const [nonce, setNonce] = useState(0);
  const [result, setResult] = useState<FetchResult<T> | null>(null);
  const key = `${url}#${nonce}`;

  useEffect(() => {
    const ctrl = new AbortController();
    let cancelled = false;
    fetch(url, { credentials: "include", signal: ctrl.signal, cache: "no-store" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.status === 401) {
          setResult({ key, status: "error", data: null, error: "Session expired. Please sign in again." });
        } else if (res.status === 403) {
          setResult({ key, status: "error", data: null, error: "You do not have permission to view this." });
        } else if (data && data.installed === false) {
          setResult({ key, status: "not_installed", data: null, error: "" });
        } else if (!res.ok) {
          const msg = typeof data?.error === "string" && data.error.length < 200 ? data.error : "Request failed.";
          setResult({ key, status: "error", data: null, error: msg });
        } else {
          setResult({ key, status: "ready", data: data as T, error: "" });
        }
      })
      .catch((err) => {
        if (cancelled || (err && err.name === "AbortError")) return;
        setResult({ key, status: "error", data: null, error: "Network error. Check your connection and retry." });
      });
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [url, key]);

  const retry = () => setNonce((n) => n + 1);
  if (!result || result.key !== key) return { status: "loading", data: null, error: "", retry };
  return { ...result, retry };
}

// ---------------------------------------------------------------------------
// Shared state views
// ---------------------------------------------------------------------------

export function LoadingSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading" style={S.card}>
      <div className="sin-skel" style={{ height: 18, width: "35%", marginBottom: 14 }} />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="sin-skel" style={{ height: 14, width: `${95 - i * 9}%`, marginBottom: 10 }} />
      ))}
    </div>
  );
}

export function EmptyState({ message = "No consented traffic in range" }: { message?: string }) {
  return (
    <div style={{ ...S.card, textAlign: "center", padding: "28px 16px" }}>
      <div style={{ fontSize: 28, marginBottom: 6 }} aria-hidden="true">
        📭
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: "#111111" }}>{message}</div>
      <div style={{ ...S.muted, marginTop: 4 }}>
        Insights only counts visitors who accepted Analytics cookies while recording is enabled.
      </div>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      style={{ ...S.card, borderColor: "rgba(220,38,38,0.35)", background: "rgba(220,38,38,0.05)" }}
    >
      <div style={{ fontSize: 14, fontWeight: 700, color: "#DC2626", marginBottom: 4 }}>Could not load Insights</div>
      <div style={{ fontSize: 13, color: "#111111", marginBottom: 10 }}>{message}</div>
      <button type="button" style={S.btn} onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}

export function NotInstalledState() {
  return (
    <div style={{ ...S.card, textAlign: "center", padding: "28px 16px" }}>
      <div style={{ fontSize: 28, marginBottom: 6 }} aria-hidden="true">
        🧩
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#111111" }}>Insights not installed</div>
      <div style={{ ...S.muted, marginTop: 4 }}>
        The Insights database tables have not been created yet. Nothing is being recorded.
      </div>
    </div>
  );
}

/** Renders loading / error / not-installed / empty, else children(data). */
export function ResourceView<T>({
  resource,
  isEmpty,
  children,
}: {
  resource: InsightsResource<T>;
  isEmpty?: (data: T) => boolean;
  children: (data: T) => ReactNode;
}) {
  if (resource.status === "loading") return <LoadingSkeleton />;
  if (resource.status === "not_installed") return <NotInstalledState />;
  if (resource.status === "error") return <ErrorState message={resource.error} onRetry={resource.retry} />;
  if (isEmpty && isEmpty(resource.data)) return <EmptyState />;
  return <>{children(resource.data)}</>;
}

export function NotesList({ notes }: { notes: string[] | undefined }) {
  if (!notes || notes.length === 0) return null;
  return (
    <div
      style={{
        ...S.card,
        background: "#FFFBEB",
        borderColor: "#FCD34D",
        padding: "10px 14px",
        fontSize: 12,
        color: "#92400E",
      }}
    >
      {notes.map((n, i) => (
        <div key={i}>{n}</div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

const PRESETS: Array<{ id: Exclude<InsightsRangePreset, "custom">; label: string }> = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "90d", label: "90 days" },
];

export function DateRangePicker({
  value,
  onChange,
}: {
  value: InsightsRangeState;
  onChange: (next: InsightsRangeState) => void;
}) {
  const [customFrom, setCustomFrom] = useState(value.from);
  const [customTo, setCustomTo] = useState(value.to);
  const [showCustom, setShowCustom] = useState(value.preset === "custom");
  const today = useMemo(() => isoDateUtc(new Date()), []);
  const customError = showCustom ? validateRangeInputs(customFrom, customTo) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div className="sin-presets" role="group" aria-label="Date range">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={value.preset === p.id}
            onClick={() => {
              setShowCustom(false);
              onChange(rangeFromPreset(p.id));
            }}
          >
            {p.label}
          </button>
        ))}
        <button type="button" aria-pressed={value.preset === "custom" || showCustom} onClick={() => setShowCustom(true)}>
          Custom
        </button>
      </div>
      {showCustom && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <label style={S.muted}>
            From{" "}
            <input
              type="date"
              style={S.input}
              value={customFrom}
              max={today}
              onChange={(e) => setCustomFrom(e.target.value)}
            />
          </label>
          <label style={S.muted}>
            To{" "}
            <input
              type="date"
              style={S.input}
              value={customTo}
              max={today}
              onChange={(e) => setCustomTo(e.target.value)}
            />
          </label>
          <button
            type="button"
            style={{ ...S.btn, opacity: customError ? 0.5 : 1 }}
            disabled={!!customError}
            onClick={() => onChange({ preset: "custom", from: customFrom, to: customTo })}
          >
            Apply
          </button>
          {customError && (
            <span role="alert" style={{ fontSize: 12, color: "#DC2626" }}>
              {customError}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function IncludeBotsToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      Include bots
    </label>
  );
}

export function KpiCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div style={{ ...S.card, marginBottom: 0, padding: "14px 14px" }}>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", color: GRAY_TEXT }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: "#111111", marginTop: 4 }}>{value}</div>
      {hint && <div style={{ ...S.muted, marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

/** Standard controls row used by range-based screens. */
export function RangeControls({
  range,
  onRange,
  includeBots,
  onIncludeBots,
}: {
  range: InsightsRangeState;
  onRange: (r: InsightsRangeState) => void;
  includeBots: boolean;
  onIncludeBots: (v: boolean) => void;
}) {
  return (
    <div className="sin-controls">
      <DateRangePicker value={range} onChange={onRange} />
      <IncludeBotsToggle checked={includeBots} onChange={onIncludeBots} />
    </div>
  );
}
