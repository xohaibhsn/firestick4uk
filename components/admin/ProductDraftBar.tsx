"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAdminDialogs } from "@/components/admin/AdminDialogs";
import type { EditProductDraft } from "@/lib/productContentDraftClient";
import {
  PRODUCT_DRAFT_ENTITY_TYPE,
  buildProductDraftPayload,
  draftBaseIsStale,
  formatDraftBanner,
  productDraftDiffers,
  type ProductDraftFields,
} from "@/lib/productDraftClient";

type ProductDraftDto = {
  entity_type: string;
  entity_id: string;
  changes: {
    fields: ProductDraftFields;
    base_version: number;
  };
  draft_version: number;
  created_by_name: string;
  updated_by_name: string;
  created_at: string;
  updated_at: string;
  age_days: number;
  key_count: number;
  corrupt?: true;
};

export type ProductDraftBarProps = {
  productId: number;
  liveVersion: number | null;
  editProduct: EditProductDraft;
  setEditProduct: React.Dispatch<React.SetStateAction<EditProductDraft>>;
  contentDraftBaseVersion: number | null;
  setContentDraftBaseVersion: (v: number | null) => void;
  onPublishArmed: (versionOrNull: number | null) => void;
  productSaving: boolean;
  onSessionExpired: () => void;
};

async function draftFetch(
  input: string,
  init?: RequestInit
): Promise<Response> {
  return fetch(input, {
    credentials: "include",
    cache: "no-store",
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers || {}),
    },
  });
}

export default function ProductDraftBar(props: ProductDraftBarProps) {
  const {
    productId,
    liveVersion,
    editProduct,
    setEditProduct,
    contentDraftBaseVersion,
    setContentDraftBaseVersion,
    onPublishArmed,
    productSaving,
    onSessionExpired,
  } = props;
  const { showToast, confirm: askConfirm } = useAdminDialogs();

  const [available, setAvailable] = useState<boolean | null>(null);
  const [draft, setDraft] = useState<ProductDraftDto | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [openedVersion, setOpenedVersion] = useState<number | null>(null);
  const liveBaselineRef = useRef<EditProductDraft | null>(null);

  const busyAll = busy || productSaving;
  const entityId = String(productId);

  const reloadDraft = useCallback(async () => {
    if (!productId) return;
    const url = `/api/admin-drafts?entity_type=${encodeURIComponent(
      PRODUCT_DRAFT_ENTITY_TYPE
    )}&entity_id=${encodeURIComponent(entityId)}`;
    const r = await draftFetch(url);
    if (r.status === 401) {
      onSessionExpired();
      return;
    }
    if (r.status === 403) {
      setForbidden(true);
      return;
    }
    const data = await r.json().catch(() => ({}));
    if (data?.available === false) {
      setAvailable(false);
      setDraft(null);
      return;
    }
    setAvailable(true);
    setDraft(data?.draft && typeof data.draft === "object" ? data.draft : null);
  }, [productId, entityId, onSessionExpired]);

  useEffect(() => {
    setForbidden(false);
    setOpenedVersion(null);
    setDraft(null);
    setAvailable(null);
    onPublishArmed(null);
    liveBaselineRef.current = { ...editProduct };
    let cancelled = false;
    (async () => {
      try {
        await reloadDraft();
      } catch {
        /* ignore */
      }
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
    // Intentionally only re-run on productId change (not every editProduct keystroke).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- snapshot baseline once per product
  }, [productId, reloadDraft, onPublishArmed]);

  const handleSaveDraft = async () => {
    if (busyAll || !productId) return;
    const base =
      contentDraftBaseVersion != null && Number.isFinite(Number(contentDraftBaseVersion))
        ? Number(contentDraftBaseVersion)
        : liveVersion != null && Number.isFinite(Number(liveVersion))
          ? Number(liveVersion)
          : 0;
    const changes = buildProductDraftPayload(editProduct, base);

    if (
      draft &&
      (openedVersion === null || openedVersion !== Number(draft.draft_version))
    ) {
      const banner = formatDraftBanner(draft);
      const ok = await askConfirm(
        `Replace the existing draft by ${banner.who} (${banner.count} fields)?`
      );
      if (!ok) return;
    }

    setBusy(true);
    try {
      const expected =
        draft && typeof draft.draft_version === "number"
          ? draft.draft_version
          : null;
      const r = await draftFetch("/api/admin-drafts", {
        method: "PUT",
        body: JSON.stringify({
          entity_type: PRODUCT_DRAFT_ENTITY_TYPE,
          entity_id: entityId,
          expected_draft_version: expected,
          changes,
        }),
      });
      if (r.status === 401) {
        onSessionExpired();
        return;
      }
      if (r.status === 403) {
        setForbidden(true);
        return;
      }
      const data = await r.json().catch(() => ({}));
      if (
        r.status === 409 &&
        (data?.code === "draft_stale" || data?.code === "draft_exists")
      ) {
        showToast("Draft changed by someone else - reloaded", "info");
        await reloadDraft();
        return;
      }
      if (!r.ok || !data?.success) {
        showToast(String(data?.error || "Draft save failed"), "error");
        return;
      }
      showToast("Draft saved - not live yet", "success");
      if (data?.draft && typeof data.draft === "object") {
        setDraft(data.draft);
        const nextVer = Number(data.draft.draft_version) || null;
        setOpenedVersion(nextVer);
        if (openedVersion != null && nextVer != null) {
          onPublishArmed(nextVer);
        }
      } else {
        await reloadDraft();
      }
    } finally {
      setBusy(false);
    }
  };

  const handleOpenDraft = async () => {
    if (busyAll || !draft?.changes?.fields) return;
    const baseline = liveBaselineRef.current;
    if (baseline && productDraftDiffers(baseline as ProductDraftFields, editProduct)) {
      const ok = await askConfirm(
        "You have unsaved edits in the editor. Opening the draft will replace them. Continue?"
      );
      if (!ok) return;
    }
    const fields = draft.changes.fields;
    setEditProduct((prev) => ({
      ...prev,
      ...Object.fromEntries(
        Object.entries(fields).map(([k, v]) => [k, String(v ?? "")])
      ),
    }));
    setContentDraftBaseVersion(
      typeof draft.changes.base_version === "number"
        ? draft.changes.base_version
        : null
    );
    setOpenedVersion(Number(draft.draft_version) || null);
    onPublishArmed(Number(draft.draft_version) || null);
    if (draftBaseIsStale(draft.changes, liveVersion)) {
      showToast(
        "This product changed after the draft was saved — Update will show the conflict review.",
        "info"
      );
    }
  };

  const handleDiscardDraft = async () => {
    if (busyAll || !draft) return;
    const ok = await askConfirm(
      "Discard this draft permanently? This cannot be undone."
    );
    if (!ok) return;
    setBusy(true);
    try {
      const r = await draftFetch("/api/admin-drafts", {
        method: "DELETE",
        body: JSON.stringify({
          entity_type: PRODUCT_DRAFT_ENTITY_TYPE,
          entity_id: entityId,
          expected_draft_version: draft.draft_version,
        }),
      });
      if (r.status === 401) {
        onSessionExpired();
        return;
      }
      if (r.status === 409 || r.status === 404) {
        const data = await r.json().catch(() => ({}));
        showToast(
          String(data?.error || "Draft changed or missing - reloaded"),
          "info"
        );
        await reloadDraft();
        return;
      }
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        showToast(String(data?.error || "Discard failed"), "error");
        return;
      }
      showToast("Draft discarded", "success");
      setDraft(null);
      setOpenedVersion(null);
      onPublishArmed(null);
    } finally {
      setBusy(false);
    }
  };

  if (forbidden) return null;
  if (available === false) return null;
  if (available === null) return null;

  const banner = draft ? formatDraftBanner(draft) : null;
  const opened =
    draft != null &&
    openedVersion != null &&
    openedVersion === Number(draft.draft_version);

  return (
    <div
      data-product-draft-bar={entityId}
      style={{
        marginBottom: 16,
        padding: "12px 14px",
        background: "#F0FDF4",
        border: "1px solid #BBF7D0",
        borderRadius: 10,
        fontSize: 13,
        color: "#14532D",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <button
          type="button"
          className="action-btn btn-view"
          disabled={busyAll}
          style={{ padding: "8px 14px", fontSize: 13 }}
          onClick={() => void handleSaveDraft()}
        >
          💾 Save draft
        </button>
        {draft ? (
          <>
            <button
              type="button"
              className="action-btn btn-view"
              disabled={busyAll}
              style={{ padding: "8px 14px", fontSize: 13 }}
              onClick={() => void handleOpenDraft()}
            >
              Open draft
            </button>
            <button
              type="button"
              className="action-btn btn-view"
              disabled={busyAll}
              style={{
                padding: "8px 14px",
                fontSize: 13,
                color: "#991B1B",
                borderColor: "#FECACA",
              }}
              onClick={() => void handleDiscardDraft()}
            >
              Discard draft
            </button>
          </>
        ) : null}
      </div>
      {draft && banner ? (
        <div style={{ marginTop: 10, lineHeight: 1.5 }}>
          📝 Draft by {banner.who}, saved {banner.whenLondon} — {banner.count}{" "}
          fields — NOT live
          {banner.staleDaysWarning ? (
            <div style={{ marginTop: 4, color: "#9A3412", fontWeight: 600 }}>
              ⚠ {Number(draft.age_days) || 0} days old
            </div>
          ) : null}
        </div>
      ) : null}
      {opened ? (
        <div style={{ marginTop: 8, color: "#166534", fontStyle: "italic" }}>
          Draft opened in the editor — review, then press Update to publish it.
        </div>
      ) : null}
    </div>
  );
}
