"use client";

/**
 * Insights Settings — super_admin only (panel hides the tab without insights.settings).
 * Recording must stay OFF until privacy text is approved.
 */
import { useEffect, useState } from "react";
import {
  INSIGHTS_OPTOUT_KEY,
  hasInsightsOptOut,
  setInsightsOptOut,
} from "@/lib/insightsClient";
import type {
  InsightsSettingsResponse,
  InsightsSettingsValues,
} from "./insightsTypes";
import {
  ResourceView,
  S,
  fmtInt,
  fmtUtc,
  useInsightsResource,
} from "./shared";

type BoolKey = "enabled" | "recording_enabled" | "kill_switch";
type IntKey =
  | "cleanup_min_interval_sec"
  | "detail_retention_days"
  | "summary_retention_days"
  | "ip_full_retention_days";

const BOOL_FIELDS: Array<{ key: BoolKey; label: string; help: string }> = [
  { key: "enabled", label: "Insights enabled", help: "Master switch. Default OFF." },
  {
    key: "recording_enabled",
    label: "Recording enabled",
    help: "Stores visitor sessions and events. Must stay OFF until the privacy text is approved.",
  },
  { key: "kill_switch", label: "Kill switch", help: "Immediately stops all recording when ON." },
];

const INT_FIELDS: Array<{ key: IntKey; label: string; unit: string }> = [
  { key: "cleanup_min_interval_sec", label: "Cleanup minimum interval", unit: "seconds" },
  { key: "detail_retention_days", label: "Detailed data retention", unit: "days" },
  { key: "summary_retention_days", label: "Daily summary retention", unit: "days" },
  { key: "ip_full_retention_days", label: "Full IP retention", unit: "days" },
];

function pickValues(s: InsightsSettingsValues): Record<BoolKey, boolean> & Record<IntKey, number> {
  return {
    enabled: s.enabled,
    recording_enabled: s.recording_enabled,
    kill_switch: s.kill_switch,
    cleanup_min_interval_sec: s.cleanup_min_interval_sec,
    detail_retention_days: s.detail_retention_days,
    summary_retention_days: s.summary_retention_days,
    ip_full_retention_days: s.ip_full_retention_days,
  };
}

function SettingsBody({
  data,
  onSaved,
}: {
  data: InsightsSettingsResponse;
  onSaved: (msg: { kind: "ok" | "err"; text: string }) => void;
}) {
  const current = pickValues(data.settings);
  const [draft, setDraft] = useState(current);
  const [intText, setIntText] = useState<Record<IntKey, string>>({
    cleanup_min_interval_sec: String(current.cleanup_min_interval_sec),
    detail_retention_days: String(current.detail_retention_days),
    summary_retention_days: String(current.summary_retention_days),
    ip_full_retention_days: String(current.ip_full_retention_days),
  });
  const [privacyApproved, setPrivacyApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  const enablingRecording = draft.recording_enabled && !current.recording_enabled;

  const post = async (body: Record<string, unknown>, okText: string) => {
    setBusy(true);
    setFormError("");
    try {
      const res = await fetch("/api/admin-insights/settings", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = String(json?.error || "").trim();
        const text = msg && msg.length <= 200 ? msg : `Save failed (HTTP ${res.status}).`;
        setFormError(text);
        onSaved({ kind: "err", text });
        return;
      }
      onSaved({ kind: "ok", text: okText });
    } catch {
      const text = "Could not reach the server.";
      setFormError(text);
      onSaved({ kind: "err", text });
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const body: Record<string, unknown> = {};
    for (const f of BOOL_FIELDS) {
      if (draft[f.key] !== current[f.key]) body[f.key] = draft[f.key];
    }
    for (const f of INT_FIELDS) {
      const b = data.bounds[f.key];
      const raw = intText[f.key].trim();
      const n = Number(raw);
      if (!/^\d+$/.test(raw) || !Number.isInteger(n) || n < b.min || n > b.max) {
        setFormError(
          `${f.label} must be a whole number between ${fmtInt(b.min)} and ${fmtInt(b.max)}.`
        );
        return;
      }
      if (n !== current[f.key]) body[f.key] = n;
    }
    if (Object.keys(body).length === 0) {
      setFormError("No changes to save.");
      return;
    }
    if (enablingRecording) {
      if (!privacyApproved) {
        setFormError("Confirm that the privacy text has been approved before turning recording ON.");
        return;
      }
      body.confirm_privacy_approved = true;
    }
    await post(body, "Settings saved.");
  };

  const s = data.settings;
  const c = data.cleanup;

  return (
    <>
      <div style={S.card}>
        <h3 style={S.cardTitle}>Current status</h3>
        <div className="sin-table-wrap">
          <table>
            <tbody>
              {(
                [
                  ["Insights enabled", s.enabled ? "ON" : "OFF"],
                  ["Recording enabled", s.recording_enabled ? "ON" : "OFF"],
                  ["Kill switch", s.kill_switch ? "ON (recording stopped)" : "OFF"],
                  ["Recording active now", data.recording_active ? "YES" : "NO"],
                  ["Cleanup minimum interval", `${fmtInt(s.cleanup_min_interval_sec)} seconds`],
                  ["Detailed retention", `${fmtInt(s.detail_retention_days)} days`],
                  ["Summary retention", `${fmtInt(s.summary_retention_days)} days`],
                  ["Full IP retention", `${fmtInt(s.ip_full_retention_days)} days (then masked)`],
                ] as Array<[string, string]>
              ).map(([k, v]) => (
                <tr key={k}>
                  <td style={S.td}>{k}</td>
                  <td style={{ ...S.td, fontWeight: 600 }}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ThisBrowserOptOutCard />

      <div style={S.card}>
        <h3 style={S.cardTitle}>Change settings</h3>
        {BOOL_FIELDS.map((f) => (
          <label
            key={f.key}
            style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 12 }}
          >
            <input
              type="checkbox"
              checked={draft[f.key]}
              disabled={busy}
              onChange={(e) => {
                setDraft((d) => ({ ...d, [f.key]: e.target.checked }));
                if (f.key === "recording_enabled" && !e.target.checked) setPrivacyApproved(false);
              }}
              style={{ marginTop: 3 }}
            />
            <span>
              <strong>{f.label}</strong> — {draft[f.key] ? "ON" : "OFF"}
              <div style={S.muted}>{f.help}</div>
            </span>
          </label>
        ))}
        {enablingRecording && (
          <label
            style={{
              display: "flex",
              gap: 12,
              alignItems: "flex-start",
              marginBottom: 12,
              padding: 10,
              background: "rgba(220,38,38,0.06)",
              borderRadius: 8,
            }}
          >
            <input
              type="checkbox"
              checked={privacyApproved}
              disabled={busy}
              onChange={(e) => setPrivacyApproved(e.target.checked)}
              style={{ marginTop: 3 }}
            />
            <span>
              <strong>I confirm the privacy text has been approved</strong>
              <div style={S.muted}>Required to turn recording ON.</div>
            </span>
          </label>
        )}
        {INT_FIELDS.map((f) => {
          const b = data.bounds[f.key];
          return (
            <label key={f.key} style={{ display: "block", marginBottom: 12 }}>
              <strong>{f.label}</strong>
              <div style={S.muted}>
                {fmtInt(b.min)}–{fmtInt(b.max)} {f.unit}
              </div>
              <input
                style={{ ...S.input, width: 120, marginTop: 6 }}
                type="number"
                inputMode="numeric"
                min={b.min}
                max={b.max}
                step={1}
                value={intText[f.key]}
                disabled={busy}
                onChange={(e) => setIntText((t) => ({ ...t, [f.key]: e.target.value }))}
              />
            </label>
          );
        })}
        {formError && (
          <div role="alert" style={{ color: "#DC2626", fontSize: 13, marginBottom: 10 }}>
            {formError}
          </div>
        )}
        <button type="button" style={S.btn} disabled={busy} onClick={() => void save()}>
          {busy ? "Saving…" : "Save settings"}
        </button>
      </div>

      <div style={S.card}>
        <h3 style={S.cardTitle}>Last cleanup</h3>
        {c ? (
          <div className="sin-table-wrap">
            <table>
              <tbody>
                <tr>
                  <td style={S.td}>Last success</td>
                  <td style={S.td}>{c.last_success_at ? fmtUtc(c.last_success_at) : "Never"}</td>
                </tr>
                <tr>
                  <td style={S.td}>Last error</td>
                  <td style={S.td}>{c.last_error || "None"}</td>
                </tr>
                <tr>
                  <td style={S.td}>Events deleted</td>
                  <td style={S.td}>{fmtInt(c.last_deleted_events)}</td>
                </tr>
                <tr>
                  <td style={S.td}>Sessions deleted</td>
                  <td style={S.td}>{fmtInt(c.last_deleted_sessions)}</td>
                </tr>
                <tr>
                  <td style={S.td}>IPs masked</td>
                  <td style={S.td}>{fmtInt(c.last_masked_ips)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <div style={S.muted}>No cleanup has run yet.</div>
        )}
      </div>
    </>
  );
}

function ThisBrowserOptOutCard() {
  const [excluded, setExcluded] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      setExcluded(hasInsightsOptOut(window.localStorage));
    } catch {
      setExcluded(false);
    }
    setReady(true);
  }, []);

  const toggle = () => {
    try {
      const next = !excluded;
      setInsightsOptOut(window.localStorage, next);
      setExcluded(next);
    } catch {
      /* ignore */
    }
  };

  return (
    <div style={S.card}>
      <h3 style={S.cardTitle}>This browser</h3>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontWeight: 600 }}>
          {ready ? (excluded ? "Excluded" : "Included") : "…"}
        </span>
        <button type="button" style={S.btnGhost} onClick={toggle} disabled={!ready}>
          {excluded ? "Include this browser" : "Exclude this browser"}
        </button>
      </div>
      <div style={{ ...S.muted, marginTop: 8 }}>
        Stored only in this browser as <code>{INSIGHTS_OPTOUT_KEY}</code>. No server setting.
        Authenticated /sidhu loads set Excluded automatically.
      </div>
    </div>
  );
}

export default function SettingsScreen() {
  const resource = useInsightsResource<InsightsSettingsResponse>("/api/admin-insights/settings");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [bodyKey, setBodyKey] = useState(0);

  return (
    <div>
      <div
        role="alert"
        style={{
          ...S.card,
          background: "rgba(220,38,38,0.07)",
          borderColor: "rgba(220,38,38,0.35)",
          color: "#991B1B",
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        Recording must stay OFF until the privacy text is approved. Do not enable recording until the cookie /
        privacy notice covering analytics has been reviewed and approved.
      </div>
      {msg && (
        <div
          role="status"
          style={{
            ...S.card,
            color: msg.kind === "ok" ? "#166534" : "#991B1B",
            background: msg.kind === "ok" ? "rgba(22,163,74,0.08)" : "rgba(220,38,38,0.07)",
          }}
        >
          {msg.text}
        </div>
      )}
      <ResourceView resource={resource}>
        {(d) => (
          <SettingsBody
            key={bodyKey}
            data={d}
            onSaved={(m) => {
              setMsg(m);
              if (m.kind === "ok") {
                setBodyKey((k) => k + 1);
                resource.retry();
              }
            }}
          />
        )}
      </ResourceView>
    </div>
  );
}
