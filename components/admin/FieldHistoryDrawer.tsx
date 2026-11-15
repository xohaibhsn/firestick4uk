"use client";

/**
 * F4UK-MULTI-106 — per-field History button + drawer.
 *
 * - Lists revisions for ONE content key / product field (newest first, paginated) using the
 *   existing GET /api/admin-revisions (+ read-only `field` filter).
 * - Compare with current via RevisionCompareLoader (sanitised, read-only).
 * - "Restore this version" ALWAYS opens an in-app confirm modal (with the diff again) and then
 *   calls the EXISTING POST /api/admin-revisions/restore with { revision_id, expected_version? }.
 *   The server stays authoritative for RBAC / SEO guard / slug / version checks.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { AdminRoleName } from "@/lib/adminPermissions";
import {
  buildRestoreBody,
  canOfferRestoreRevision,
  RESTORE_ENDPOINT,
} from "@/lib/contentRevisionsClient";
import {
  buildFieldHistoryQuery,
  fieldLabel,
  isSiteContentEntity,
  PRODUCT_FIELDS_NOT_RESTORED,
  snapshotFieldNames,
  snapshotFieldValue,
  valueToText,
  type CurrentFetchResult,
} from "@/lib/revisionCompare";
import { RevisionCompareLoader, revisionCompareLabel } from "@/components/admin/RevisionCompareView";

export type FieldHistoryTarget =
  | { kind: "content"; fieldKey: string; label: string }
  | { kind: "product"; productId: number | string; fieldKey: string; label: string };

export type FieldHistoryRestored = {
  entityType: string;
  entityId: string;
  /** Fields/keys contained in the restored snapshot (callers refresh these). */
  keys: string[];
  fieldKey: string;
};

type RevItem = {
  id: number;
  entity_type: string;
  entity_id: string;
  entity_label: string | null;
  revision_action: string;
  changed_fields: string[];
  actor_name: string;
  actor_role: string;
  created_at: string;
};
type RevDetail = RevItem & { snapshot: unknown };

const ACTION_LABELS: Record<string, string> = { update: "Update", delete: "Delete", restore: "Restore" };

/** Small 🕘 History button — renders nothing without revisions.view. */
export function FieldHistoryButton({
  canViewRevisions,
  label,
  onOpen,
  testId,
}: {
  canViewRevisions: boolean;
  label: string;
  onOpen: () => void;
  testId?: string;
}) {
  if (!canViewRevisions) return null;
  return (
    <button
      type="button"
      className="action-btn btn-view"
      data-field-history-btn={testId || label}
      aria-label={`History for ${label}`}
      title={`History for ${label}`}
      onClick={onOpen}
      style={{ padding: "1px 7px", fontSize: 11, marginLeft: 8, verticalAlign: "middle" }}
    >
      🕘 History
    </button>
  );
}

function seoSuffix(guard: any): string {
  if (!guard || guard.status === "skipped") return "";
  if (guard.status === "unavailable") return " — SEO check temporarily unavailable";
  const n = Number(guard.issue_count || 0);
  return n === 0 ? " — SEO: no deterministic issues found" : ` — SEO: ${n} issue(s) to review`;
}

type Props = {
  target: FieldHistoryTarget | null;
  role: AdminRoleName;
  /** can("revisions.view") from the host page. */
  canViewRevisions: boolean;
  onClose: () => void;
  onRestored?: (info: FieldHistoryRestored) => void;
  /** Content keys only: push an old value into Live Preview as an UNSAVED override (null clears). */
  onPreviewRestore?: (overrides: Record<string, string> | null) => void;
  onToast?: (message: string, kind?: "success" | "error" | "info") => void;
  /** Extra sentence shown in the confirm modal (e.g. unsaved editor edits get replaced). */
  restoreNote?: string;
};

export default function FieldHistoryDrawer({
  target,
  role,
  canViewRevisions,
  onClose,
  onRestored,
  onPreviewRestore,
  onToast,
  restoreNote,
}: Props) {
  const [items, setItems] = useState<RevItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [selected, setSelected] = useState<RevDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [confirmRev, setConfirmRev] = useState<RevDetail | null>(null);
  const [confirmKey, setConfirmKey] = useState(0);
  const [bound, setBound] = useState<{
    revisionId: number;
    result: CurrentFetchResult | null;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const listSeq = useRef(0);
  const previewRef = useRef(false);
  const onPreviewRef = useRef(onPreviewRestore);
  useEffect(() => {
    onPreviewRef.current = onPreviewRestore;
  });

  const open = !!target && canViewRevisions;
  const targetId = target
    ? `${target.kind}:${target.kind === "product" ? target.productId : ""}:${target.fieldKey}`
    : "";

  const clearPreview = useCallback(() => {
    if (previewRef.current) {
      previewRef.current = false;
      setPreviewing(false);
      onPreviewRef.current?.(null);
    }
  }, []);

  const load = useCallback(
    async (pageNum: number) => {
      if (!target) return;
      const mine = ++listSeq.current;
      setLoading(true);
      setError("");
      try {
        const qs = buildFieldHistoryQuery({
          entityType: target.kind === "product" ? "product" : undefined,
          entityId: target.kind === "product" ? target.productId : undefined,
          field: target.fieldKey,
          page: pageNum,
          limit: 10,
        });
        const r = await fetch(`/api/admin-revisions?${qs}`, { credentials: "include", cache: "no-store" });
        if (mine !== listSeq.current) return;
        if (r.status === 401) {
          setError("Session expired");
          return;
        }
        if (r.status === 403) {
          setError("Permission denied");
          return;
        }
        if (!r.ok) {
          setError("Failed to load history");
          return;
        }
        const data = await r.json();
        if (mine !== listSeq.current) return;
        setItems(Array.isArray(data.items) ? data.items : []);
        setTotal(Number(data.pagination?.total || 0));
        setTotalPages(Number(data.pagination?.totalPages || 1));
        setPage(Number(data.pagination?.page || pageNum));
      } catch {
        if (mine === listSeq.current) setError("Failed to load history");
      } finally {
        if (mine === listSeq.current) setLoading(false);
      }
    },
    [target]
  );

  // (Re)load when the target changes; reset transient state.
  useEffect(() => {
    setItems([]);
    setSelected(null);
    setConfirmRev(null);
    setBound(null);
    setMsg("");
    setPage(1);
    if (open) void load(1);
    return () => {
      listSeq.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId, open]);

  // Never leave a stale preview override behind.
  useEffect(() => {
    if (!open) clearPreview();
  }, [open, clearPreview]);
  useEffect(() => () => clearPreview(), [clearPreview]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (confirmRev) setConfirmRev(null);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, confirmRev, onClose]);

  if (!open || !target) return null;

  const isProduct = target.kind === "product";
  const productFieldNotRestored = isProduct && PRODUCT_FIELDS_NOT_RESTORED.has(target.fieldKey);

  const offerRestore = (item: { entity_type: string; revision_action: string }) =>
    !productFieldNotRestored && canOfferRestoreRevision(item, role);

  const fetchDetail = async (id: number): Promise<RevDetail | null> => {
    try {
      const r = await fetch(`/api/admin-revisions?id=${id}`, { credentials: "include", cache: "no-store" });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMsg(`❌ ${data.error || "Failed to load revision"}`);
        return null;
      }
      return data as RevDetail;
    } catch {
      setMsg("❌ Failed to load revision");
      return null;
    }
  };

  const openCompare = async (item: RevItem) => {
    setMsg("");
    clearPreview();
    setDetailLoading(true);
    const d = await fetchDetail(item.id);
    setDetailLoading(false);
    if (d) setSelected(d);
  };

  const previewValueFor = (rev: RevDetail): string | null => {
    if (target.kind !== "content" || !onPreviewRestore) return null;
    if (!isSiteContentEntity(rev.entity_type)) return null;
    const v = snapshotFieldValue(rev.entity_type, rev.snapshot, target.fieldKey);
    return v === undefined ? null : valueToText(v);
  };

  const startPreview = (rev: RevDetail) => {
    const v = previewValueFor(rev);
    if (v == null || target.kind !== "content") return;
    previewRef.current = true;
    setPreviewing(true);
    onPreviewRestore?.({ [target.fieldKey]: v });
    setMsg("👁 Previewing this version in Live Preview (not saved). Close the preview or stop it to discard.");
  };

  const openConfirm = async (item: RevItem | RevDetail) => {
    setMsg("");
    const d: RevDetail | null =
      "snapshot" in item && (item as RevDetail).snapshot !== undefined
        ? (item as RevDetail)
        : await fetchDetail(item.id);
    if (!d) return;
    setBound(null);
    setConfirmKey((k) => k + 1);
    setConfirmRev(d);
  };

  const cancelConfirm = () => {
    if (busy) return;
    setConfirmRev(null);
    setBound(null);
  };

  const doRestore = async () => {
    if (!confirmRev) return;
    if (confirmRev.entity_type === "product") {
      if (
        !bound ||
        bound.revisionId !== confirmRev.id ||
        !bound.result ||
        !bound.result.ok
      ) {
        setMsg("❌ Current product version is not bound to this revision yet — wait or reopen confirm.");
        return;
      }
    }
    const expected =
      confirmRev.entity_type === "product" && bound?.result && bound.result.ok
        ? bound.result.version
        : null;
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch(RESTORE_ENDPOINT, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildRestoreBody(confirmRev.id, expected)),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (r.status === 409) {
          setMsg(`❌ ${data.error || "Stale version"} — reconfirm with a fresh current read (not auto-resubmitted).`);
          setBound(null);
          setConfirmKey((k) => k + 1); // re-read current
          return;
        }
        setMsg(`❌ ${data.error || data.message || "Restore failed"}`);
        return;
      }
      const restored = confirmRev;
      const text = `✅ Version restored. Current state was saved to History first.${seoSuffix(data.seo_guard)}`;
      clearPreview();
      setConfirmRev(null);
      setBound(null);
      setSelected(null);
      setMsg(text);
      onToast?.(text, "success");
      onRestored?.({
        entityType: restored.entity_type,
        entityId: String(restored.entity_id),
        keys: snapshotFieldNames(restored.entity_type, restored.snapshot),
        fieldKey: target.fieldKey,
      });
      await load(page);
    } catch {
      setMsg("❌ Restore failed");
    } finally {
      setBusy(false);
    }
  };

  const confirmKeys = confirmRev ? snapshotFieldNames(confirmRev.entity_type, confirmRev.snapshot) : [];
  const otherKeys = confirmKeys.filter((k) => k !== target.fieldKey);
  const productVersionPending =
    !!confirmRev &&
    confirmRev.entity_type === "product" &&
    (!bound || bound.revisionId !== confirmRev.id || !bound.result);
  const productUnavailable =
    !!confirmRev &&
    confirmRev.entity_type === "product" &&
    !!bound &&
    bound.revisionId === confirmRev.id &&
    !!bound.result &&
    !bound.result.ok;

  let slugWarning = "";
  if (
    confirmRev &&
    confirmRev.entity_type === "product" &&
    bound?.result &&
    bound.result.ok &&
    bound.revisionId === confirmRev.id
  ) {
    const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();
    const revSlug = norm(snapshotFieldValue("product", confirmRev.snapshot, "slug"));
    const curSlug = norm(snapshotFieldValue("product", bound.result.snapshot, "slug"));
    if (revSlug && curSlug && revSlug !== curSlug) {
      slugWarning =
        "This revision has a different URL slug than the current product — the server will block the restore (slug changes need a controlled SEO migration).";
    }
  }

  return (
    <>
      <aside
        role="dialog"
        aria-modal="false"
        aria-label={`History for ${target.label}`}
        data-field-history-drawer={target.fieldKey}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          width: "min(620px, 100vw)",
          zIndex: 13000,
          background: "#fff",
          borderRight: "1px solid #E5E5E5",
          boxShadow: "8px 0 24px rgba(0,0,0,0.25)",
          display: "flex",
          flexDirection: "column",
          color: "#222",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "12px 16px",
            borderBottom: "1px solid #E5E5E5",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>🕘 History — {target.label}</div>
            <div style={{ fontSize: 11, color: "#888" }}>
              {isProduct ? `product #${target.productId}` : "site content"} · <code>{target.fieldKey}</code>
            </div>
          </div>
          <button
            type="button"
            className="action-btn btn-view"
            onClick={() => load(page)}
            disabled={loading}
          >
            Refresh
          </button>
          <button
            type="button"
            className="action-btn btn-delete"
            data-testid="field-history-close"
            onClick={() => {
              clearPreview();
              onClose();
            }}
          >
            Close
          </button>
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
          {msg ? (
            <div
              role="status"
              style={{
                marginBottom: 12,
                padding: "10px 14px",
                borderRadius: 8,
                fontSize: 13,
                background: msg.startsWith("❌") ? "rgba(220,38,38,0.08)" : "rgba(22,163,74,0.08)",
                color: msg.startsWith("❌") ? "#DC2626" : "#166534",
              }}
            >
              {msg}
            </div>
          ) : null}
          {error ? <div style={{ color: "#DC2626", fontSize: 13, marginBottom: 10 }}>{error}</div> : null}
          {productFieldNotRestored ? (
            <div style={{ fontSize: 12, color: "#92400E", marginBottom: 10 }}>
              Seasonal, listing and visibility controls are preserved on restore — history for this field is
              view / compare only.
            </div>
          ) : null}

          {!loading && !error && items.length === 0 ? (
            <div data-testid="field-history-empty" style={{ padding: 24, textAlign: "center", color: "#888" }}>
              No history yet
            </div>
          ) : null}
          {loading ? <div style={{ fontSize: 12, color: "#666" }}>Loading…</div> : null}

          {!selected && items.length > 0 ? (
            <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>
              {total} revision{total === 1 ? "" : "s"} · newest first · page {page} of {totalPages}
            </div>
          ) : null}

          {!selected
            ? items.map((item) => (
                <div
                  key={item.id}
                  data-field-history-item={item.id}
                  style={{
                    border: "1px solid #E5E5E5",
                    borderRadius: 10,
                    padding: "10px 12px",
                    marginBottom: 8,
                    background: "#FAFAFA",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      {item.created_at ? new Date(item.created_at).toLocaleString() : "—"}
                    </div>
                    <div style={{ fontSize: 12, color: "#555" }}>
                      {item.actor_name} <span style={{ color: "#888" }}>({item.actor_role})</span>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: "#888", margin: "4px 0 8px" }}>
                    {ACTION_LABELS[item.revision_action] || item.revision_action} · {item.entity_type}
                    {(item.changed_fields || []).length > 1
                      ? ` · ${(item.changed_fields || []).length} fields in this save`
                      : ""}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="action-btn btn-view"
                      data-testid="field-history-compare"
                      onClick={() => openCompare(item)}
                      disabled={detailLoading || busy}
                    >
                      Compare with current
                    </button>
                    {offerRestore(item) ? (
                      <button
                        type="button"
                        className="action-btn btn-edit"
                        data-testid="field-history-restore"
                        onClick={() => openConfirm(item)}
                        disabled={detailLoading || busy}
                      >
                        Restore this version
                      </button>
                    ) : null}
                  </div>
                </div>
              ))
            : null}

          {!selected && totalPages > 1 ? (
            <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 12, alignItems: "center" }}>
              <button
                type="button"
                className="action-btn btn-view"
                disabled={page <= 1 || loading}
                onClick={() => load(page - 1)}
              >
                ← Prev
              </button>
              <span style={{ fontSize: 12, color: "#666" }}>
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                className="action-btn btn-view"
                disabled={page >= totalPages || loading}
                onClick={() => load(page + 1)}
              >
                Next →
              </button>
            </div>
          ) : null}

          {selected ? (
            <div data-testid="field-history-compare-panel">
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                <button
                  type="button"
                  className="action-btn btn-view"
                  onClick={() => {
                    clearPreview();
                    setSelected(null);
                  }}
                >
                  ← Back to list
                </button>
                {previewValueFor(selected) != null && !previewing ? (
                  <button
                    type="button"
                    className="action-btn btn-view"
                    data-testid="field-history-preview-restore"
                    onClick={() => startPreview(selected)}
                  >
                    👁 Preview restore
                  </button>
                ) : null}
                {previewing ? (
                  <button
                    type="button"
                    className="action-btn btn-delete"
                    data-testid="field-history-stop-preview"
                    onClick={() => {
                      clearPreview();
                      setMsg("");
                    }}
                  >
                    Stop preview
                  </button>
                ) : null}
                {offerRestore(selected) ? (
                  <button
                    type="button"
                    className="modal-save"
                    data-testid="field-history-restore"
                    onClick={() => openConfirm(selected)}
                    disabled={busy}
                  >
                    Restore this version
                  </button>
                ) : null}
              </div>
              <RevisionCompareLoader revision={selected} focusField={target.fieldKey} />
            </div>
          ) : null}
        </div>
      </aside>

      {confirmRev ? (
        <div
          className="modal-overlay"
          style={{ zIndex: 13100 }}
          onClick={cancelConfirm}
          data-testid="field-history-confirm"
        >
          <div
            className="modal"
            role="alertdialog"
            aria-modal="true"
            aria-label="Confirm restore"
            style={{ maxWidth: 860, width: "96%", maxHeight: "92vh", overflow: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-title">Confirm restore</div>
            <p style={{ fontSize: 14, color: "#333", lineHeight: 1.55, marginBottom: 12 }}>
              You are about to restore <strong>{revisionCompareLabel(confirmRev)}</strong> of{" "}
              <strong>{confirmRev.entity_label || confirmRev.entity_id}</strong>. The current version will be saved
              to History first, so this restore can be undone.
            </p>
            {otherKeys.length > 0 ? (
              <div
                role="alert"
                data-testid="field-history-restore-scope"
                style={{ fontSize: 12, background: "#FFFBEB", border: "1px solid #FCD34D", color: "#92400E", padding: 10, borderRadius: 8, marginBottom: 12 }}
              >
                Restore applies the <strong>whole revision</strong>, not only “{fieldLabel(target.fieldKey)}”. It
                also restores {otherKeys.length} other field{otherKeys.length === 1 ? "" : "s"}:{" "}
                {otherKeys.slice(0, 12).join(", ")}
                {otherKeys.length > 12 ? "…" : ""}. Review every highlighted change below.
              </div>
            ) : null}
            {isProduct ? (
              <div style={{ fontSize: 12, color: "#555", marginBottom: 10 }}>
                Private / shop listing / seasonal window controls are preserved (not restored from the snapshot).
                {productVersionPending ? (
                  <span data-testid="field-history-version-loading"> Loading current product version…</span>
                ) : productUnavailable ? (
                  <span style={{ color: "#B45309" }}>
                    {" "}
                    {bound?.result && !bound.result.ok ? bound.result.error : "Current product unavailable"}
                  </span>
                ) : null}
              </div>
            ) : null}
            {slugWarning ? (
              <div role="alert" style={{ fontSize: 12, color: "#B45309", marginBottom: 10 }}>
                {slugWarning}
              </div>
            ) : null}
            {restoreNote ? <div style={{ fontSize: 12, color: "#555", marginBottom: 10 }}>{restoreNote}</div> : null}
            {msg && msg.startsWith("❌") ? (
              <div role="alert" style={{ color: "#DC2626", fontSize: 13, marginBottom: 10 }}>
                {msg}
              </div>
            ) : null}

            <RevisionCompareLoader
              key={`${confirmRev.id}:${confirmKey}`}
              revision={confirmRev}
              onCurrentLoaded={(result) => setBound({ revisionId: confirmRev.id, result })}
            />

            <div className="modal-actions">
              <button type="button" className="modal-cancel" onClick={cancelConfirm} disabled={busy}>
                Cancel
              </button>
              <button
                type="button"
                className="modal-save"
                data-testid="field-history-confirm-restore-btn"
                onClick={doRestore}
                disabled={busy || productVersionPending || productUnavailable}
              >
                {busy ? "Restoring…" : "Restore this version"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
