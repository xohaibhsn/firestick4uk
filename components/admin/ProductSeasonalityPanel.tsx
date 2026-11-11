"use client";

/**
 * CMS seasonal / shop / archive presentation controls.
 * Extracted for isolated fixture verification; used by Sidhu product editor.
 */
import { useState } from "react";
import { utcSqlToLondonWall } from "@/lib/productSeasonLondon";

export type SeasonalityProduct = {
  id: number;
  name?: string;
  product_version?: number | null;
  lifecycle_mode?: string | null;
  shop_listed?: number | null;
  season_name?: string | null;
  season_starts_at?: string | null;
  season_ends_at?: string | null;
  season_paused?: number | null;
  season_show_countdown?: number | null;
  season_ended_notice?: string | null;
  available_offers_heading?: string | null;
  season_available_ids?: unknown;
  season_upcoming_ids?: unknown;
};

/** Immutable dispatch context — captured before await, never rebuilt from a live ref. */
export type SeasonalityRequestContext = {
  editorSessionId: string;
  productId: number;
  actionStartedAtVersion: number;
  nextVersion: number;
  noop: boolean;
};

export type SeasonalityPanelProps = {
  product: SeasonalityProduct;
  /** Active editor session id at panel mount/action time (from Sidhu). */
  editorSessionId: string;
  disabled?: boolean;
  pending?: boolean;
  fetchImpl?: typeof fetch;
  onSessionExpired?: () => void;
  onForbidden?: () => void;
  onMessage?: (msg: string) => void;
  onRefresh?: () => void | Promise<void>;
  /** Live ops version only — callers must NOT treat this as content-draft base advancement. */
  onVersionUpdate?: (version: number, ctx: SeasonalityRequestContext) => void;
  /**
   * Operational product row after a successful content-preserving seasonal action.
   * Includes the immutable dispatch context so the editor can reject late responses
   * that no longer match the active session.
   */
  onProductUpdate?: (
    product: Record<string, unknown>,
    meta: SeasonalityRequestContext
  ) => void;
  confirmImpl?: (message: string) => boolean;
  promptImpl?: (message: string, defaultValue?: string) => string | null;
};

function idsToText(raw: unknown): string {
  if (raw == null) return "";
  if (Array.isArray(raw)) return raw.join(", ");
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.join(", ");
    } catch {
      return raw;
    }
  }
  return "";
}

function parseIdsInput(text: string): number[] | { error: string } {
  const parts = text
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) return [];
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const p of parts) {
    const n = Number(p);
    if (!Number.isInteger(n) || n <= 0) return { error: "IDs must be positive integers" };
    if (seen.has(n)) continue;
    seen.add(n);
    ids.push(n);
  }
  return ids;
}

function syncFromProduct(product: SeasonalityProduct) {
  const start = utcSqlToLondonWall(product.season_starts_at);
  const end = utcSqlToLondonWall(product.season_ends_at);
  return {
    startsWall: start?.wall || "",
    startsOffset: (start?.offset || "+00:00") as "+00:00" | "+01:00",
    endsWall: end?.wall || "",
    endsOffset: (end?.offset || "+00:00") as "+00:00" | "+01:00",
    countdown: (Number(product.season_show_countdown) === 0 ? 0 : 1) as 0 | 1,
    notice: String(product.season_ended_notice || ""),
    heading: String(product.available_offers_heading || ""),
    availableIds: idsToText(product.season_available_ids),
    upcomingIds: idsToText(product.season_upcoming_ids),
  };
}

/** Production PATCH contract used by the panel (exported for interactive harness). */
export async function postSeasonPatch(
  doFetch: typeof fetch,
  product: Pick<SeasonalityProduct, "id" | "product_version">,
  body: Record<string, unknown>
): Promise<Response> {
  return doFetch("/api/admin-products", {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...body,
      id: Number(product.id),
      expected_version: Number(product.product_version),
    }),
  });
}

export default function ProductSeasonalityPanel({
  product,
  editorSessionId,
  disabled = false,
  pending = false,
  fetchImpl,
  onSessionExpired,
  onForbidden,
  onMessage,
  onRefresh,
  onVersionUpdate,
  onProductUpdate,
  confirmImpl,
  promptImpl,
}: SeasonalityPanelProps) {
  const doFetch = fetchImpl || fetch;
  const confirm = confirmImpl || ((m: string) => window.confirm(m));
  const prompt = promptImpl || ((m: string, d?: string) => window.prompt(m, d));

  const [localPending, setLocalPending] = useState(false);
  const busy = disabled || pending || localPending;
  const syncKey = [
    product.id,
    product.product_version,
    product.season_starts_at,
    product.season_ends_at,
    product.season_show_countdown,
    product.season_ended_notice,
    product.available_offers_heading,
    idsToText(product.season_available_ids),
    idsToText(product.season_upcoming_ids),
    product.shop_listed,
    product.lifecycle_mode,
  ].join("|");
  const initial = syncFromProduct(product);
  const [syncedKey, setSyncedKey] = useState(syncKey);
  const [startsWall, setStartsWall] = useState(initial.startsWall);
  const [startsOffset, setStartsOffset] = useState<"+00:00" | "+01:00">(initial.startsOffset);
  const [endsWall, setEndsWall] = useState(initial.endsWall);
  const [endsOffset, setEndsOffset] = useState<"+00:00" | "+01:00">(initial.endsOffset);
  const [countdown, setCountdown] = useState<0 | 1>(initial.countdown);
  const [notice, setNotice] = useState(initial.notice);
  const [heading, setHeading] = useState(initial.heading);
  const [availableIds, setAvailableIds] = useState(initial.availableIds);
  const [upcomingIds, setUpcomingIds] = useState(initial.upcomingIds);

  // Adjust form fields during render when authoritative product/server state changes.
  if (syncedKey !== syncKey) {
    setSyncedKey(syncKey);
    setStartsWall(initial.startsWall);
    setStartsOffset(initial.startsOffset);
    setEndsWall(initial.endsWall);
    setEndsOffset(initial.endsOffset);
    setCountdown(initial.countdown);
    setNotice(initial.notice);
    setHeading(initial.heading);
    setAvailableIds(initial.availableIds);
    setUpcomingIds(initial.upcomingIds);
  }

  async function runPatch(body: Record<string, unknown>, successLabel: string) {
    if (product.product_version == null) {
      onMessage?.("❌ Seasonal controls need expanded schema (product_version).");
      return;
    }
    if (localPending) return;
    // Capture immutable dispatch context BEFORE any await — never read a live ref later.
    const dispatchCtx = {
      editorSessionId: String(editorSessionId),
      productId: Number(product.id),
      actionStartedAtVersion: Number(product.product_version),
    };
    setLocalPending(true);
    try {
      const r = await postSeasonPatch(doFetch, product, body);
      if (r.status === 401) {
        onSessionExpired?.();
        return;
      }
      if (r.status === 403) {
        onForbidden?.();
        onMessage?.("❌ Forbidden");
        return;
      }
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data.error) {
        onMessage?.(`❌ ${data.error || "Seasonal action failed"}`);
        await onRefresh?.();
        return;
      }
      const nextVersion =
        data.product_version != null
          ? Number(data.product_version)
          : dispatchCtx.actionStartedAtVersion;
      const ctx: SeasonalityRequestContext = {
        ...dispatchCtx,
        nextVersion,
        noop: !!data.noop,
      };
      onMessage?.(data.noop ? "✅ No change (noop)" : `✅ ${successLabel}`);
      if (data.product && typeof data.product === "object") {
        onProductUpdate?.(data.product as Record<string, unknown>, ctx);
      }
      // Live ops version bump only — content draft base is decided by the parent via onProductUpdate meta.
      if (data.product_version != null) onVersionUpdate?.(Number(data.product_version), ctx);
      await onRefresh?.();
    } catch {
      onMessage?.("❌ Seasonal action failed");
    } finally {
      setLocalPending(false);
    }
  }

  const quickActions: Array<{
    action: string;
    label: string;
    shop_listed?: 0 | 1;
    confirm?: string;
  }> = [
    {
      action: "set_shop_listed",
      shop_listed: Number(product.shop_listed) === 0 ? 1 : 0,
      label: Number(product.shop_listed) === 0 ? "List in shop" : "Hide from shop",
      confirm:
        Number(product.shop_listed) === 0
          ? undefined
          : "Hide from shop listings while keeping the public page indexable?",
    },
    { action: "pause", label: "Pause season" },
    { action: "resume", label: "Resume season" },
    { action: "end_early", label: "End Early" },
    { action: "activate_now", label: "Activate Now" },
  ];

  return (
    <div
      data-testid="product-seasonality-panel"
      style={{
        marginTop: 12,
        padding: "12px 14px",
        borderRadius: 10,
        border: "1px solid rgba(91,33,182,0.35)",
        background: "rgba(91,33,182,0.08)",
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
        Permanent / Seasonal &amp; shop listing
      </div>
      <div style={{ fontSize: 11, opacity: 0.7, lineHeight: 1.45, marginBottom: 10 }}>
        Permanent means a regular / year-round offering (not a lifetime package). Requires expanded
        schema. Switching Seasonal → Permanent can re-enable purchasing immediately — confirm carefully.
        Content History restore does not change Private / shop / seasonal window controls.
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {quickActions.map((qa) => (
          <button
            key={qa.action + qa.label}
            type="button"
            className="action-btn btn-view"
            data-testid={`product-season-action-${qa.action}`}
            disabled={busy}
            onClick={() => {
              if (qa.confirm && !confirm(qa.confirm)) return;
              if (!qa.confirm && !confirm(`${qa.label} for "${product.name || product.id}"?`)) return;
              const body: Record<string, unknown> = { action: qa.action };
              if (qa.action === "set_shop_listed") body.shop_listed = qa.shop_listed;
              void runPatch(body, qa.label);
            }}
          >
            {localPending ? "…" : qa.label}
          </button>
        ))}

        <button
          type="button"
          className="action-btn btn-edit"
          data-testid="product-season-make-seasonal"
          disabled={busy}
          onClick={() => {
            const name = prompt("Season name (required)", product.season_name || "");
            if (name == null) return;
            if (!String(name).trim()) {
              onMessage?.("❌ Season name required");
              return;
            }
            if (!confirm("Set lifecycle to Seasonal? Purchasing will require a valid UTC window.")) {
              return;
            }
            void runPatch(
              {
                action: "set_lifecycle_settings",
                lifecycle_mode: "seasonal",
                season_name: String(name).trim(),
              },
              "Marked Seasonal"
            );
          }}
        >
          Set Seasonal…
        </button>

        <button
          type="button"
          className="action-btn btn-verify"
          data-testid="product-season-make-permanent"
          disabled={busy}
          onClick={() => {
            if (
              !confirm(
                "Switch to Permanent (regular year-round offering)? This clears the season window/pause and may immediately re-enable purchasing for a Public product."
              )
            ) {
              return;
            }
            void runPatch(
              { action: "set_lifecycle_settings", lifecycle_mode: "permanent" },
              "Marked Permanent"
            );
          }}
        >
          Set Permanent
        </button>
      </div>

      <div
        data-testid="product-season-window-form"
        style={{
          borderTop: "1px solid rgba(255,255,255,0.12)",
          paddingTop: 10,
          marginBottom: 10,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
          Season window (London wall + offset)
        </div>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr auto" }}>
          <input
            data-testid="season-starts-wall"
            placeholder="Start YYYY-MM-DDTHH:mm:ss"
            value={startsWall}
            disabled={busy}
            onChange={(e) => setStartsWall(e.target.value)}
            style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid #ccc" }}
          />
          <select
            data-testid="season-starts-offset"
            value={startsOffset}
            disabled={busy}
            onChange={(e) => setStartsOffset(e.target.value as "+00:00" | "+01:00")}
            style={{ padding: "8px 10px", borderRadius: 6 }}
          >
            <option value="+00:00">+00:00</option>
            <option value="+01:00">+01:00</option>
          </select>
          <input
            data-testid="season-ends-wall"
            placeholder="End YYYY-MM-DDTHH:mm:ss"
            value={endsWall}
            disabled={busy}
            onChange={(e) => setEndsWall(e.target.value)}
            style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid #ccc" }}
          />
          <select
            data-testid="season-ends-offset"
            value={endsOffset}
            disabled={busy}
            onChange={(e) => setEndsOffset(e.target.value as "+00:00" | "+01:00")}
            style={{ padding: "8px 10px", borderRadius: 6 }}
          >
            <option value="+00:00">+00:00</option>
            <option value="+01:00">+01:00</option>
          </select>
        </div>
        <button
          type="button"
          className="action-btn btn-edit"
          data-testid="product-season-set-window"
          disabled={busy}
          style={{ marginTop: 8 }}
          onClick={() => {
            if (!startsWall.trim() || !endsWall.trim()) {
              onMessage?.("❌ Start and end London wall times are required");
              return;
            }
            if (!confirm("Save season start/end window?")) return;
            void runPatch(
              {
                action: "set_season_window",
                starts_at_london: { wall: startsWall.trim(), offset: startsOffset },
                ends_at_london: { wall: endsWall.trim(), offset: endsOffset },
              },
              "Season window saved"
            );
          }}
        >
          Save window
        </button>
      </div>

      <div
        data-testid="product-season-archive-form"
        style={{ borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 10 }}
      >
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
          Archive presentation &amp; alternatives
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginBottom: 8 }}>
          <input
            type="checkbox"
            data-testid="season-show-countdown"
            checked={countdown === 1}
            disabled={busy}
            onChange={(e) => setCountdown(e.target.checked ? 1 : 0)}
          />
          Show countdown
        </label>
        <textarea
          data-testid="season-ended-notice"
          placeholder="Ended / paused notice"
          value={notice}
          disabled={busy}
          onChange={(e) => setNotice(e.target.value)}
          rows={2}
          style={{ width: "100%", marginBottom: 8, padding: 8, borderRadius: 6 }}
        />
        <input
          data-testid="available-offers-heading"
          placeholder="Available Offers heading"
          value={heading}
          disabled={busy}
          onChange={(e) => setHeading(e.target.value)}
          style={{ width: "100%", marginBottom: 8, padding: 8, borderRadius: 6 }}
        />
        <input
          data-testid="season-available-ids"
          placeholder="Available offer IDs (comma-separated)"
          value={availableIds}
          disabled={busy}
          onChange={(e) => setAvailableIds(e.target.value)}
          style={{ width: "100%", marginBottom: 8, padding: 8, borderRadius: 6 }}
        />
        <input
          data-testid="season-upcoming-ids"
          placeholder="Upcoming offer IDs (comma-separated)"
          value={upcomingIds}
          disabled={busy}
          onChange={(e) => setUpcomingIds(e.target.value)}
          style={{ width: "100%", marginBottom: 8, padding: 8, borderRadius: 6 }}
        />
        <button
          type="button"
          className="action-btn btn-edit"
          data-testid="product-season-save-presentation"
          disabled={busy}
          onClick={() => {
            const avail = parseIdsInput(availableIds);
            if ("error" in avail) {
              onMessage?.(`❌ Available IDs: ${avail.error}`);
              return;
            }
            const up = parseIdsInput(upcomingIds);
            if ("error" in up) {
              onMessage?.(`❌ Upcoming IDs: ${up.error}`);
              return;
            }
            if (!confirm("Save archive presentation / alternatives?")) return;
            void runPatch(
              {
                action: "set_archive_presentation",
                season_show_countdown: countdown,
                season_ended_notice: notice,
                available_offers_heading: heading.trim() || null,
                season_available_ids: avail,
                season_upcoming_ids: up,
              },
              "Presentation saved"
            );
          }}
        >
          Save presentation
        </button>
      </div>

      {localPending ? (
        <div data-testid="product-season-pending" style={{ marginTop: 8, fontSize: 11, opacity: 0.75 }}>
          Saving… (duplicate clicks blocked)
        </div>
      ) : null}
    </div>
  );
}
