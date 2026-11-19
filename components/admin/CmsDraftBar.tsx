"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdminDialogs } from "@/components/admin/AdminDialogs";
import { isSuperAdminSettingsKey } from "@/lib/adminPermissions";
import {
  DRAFT_ENTITY_TYPE,
  buildDraftChanges,
  draftOverrides,
  formatDraftBanner,
  keysMatchingLive,
  liveChangedKeys,
  type DraftChanges,
} from "@/lib/contentDraftClient";

/** Draft API entity_type for CMS pages: site_content_page */

type DraftDto = {
  entity_type: string;
  entity_id: string;
  changes: DraftChanges;
  draft_version: number;
  created_by_name: string;
  updated_by_name: string;
  created_at: string;
  updated_at: string;
  age_days: number;
  key_count: number;
  corrupt?: true;
};

type DraftSummary = Omit<DraftDto, "changes">;

const PAGE_LABELS: Record<string, string> = {
  overview: "Pages",
  home: "Home",
  about: "About",
  subscription: "Subscription",
  contact: "Contact",
  faq: "FAQ",
  footer: "Footer",
  products: "Products",
  cart: "Cart",
  tracking: "Tracking",
  blog: "Blog",
  legal: "Legal",
  global: "Global",
};

export type CmsDraftBarProps = {
  activePage: string;
  siteContent: Record<string, string>;
  savedContent: Record<string, string>;
  setSiteContent: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  baseHashForKey: (key: string) => string | undefined;
  onPublish: (
    keys: string[],
    overrides?: Record<string, string>
  ) => Promise<boolean>;
  contentSaving: boolean;
  onSessionExpired: () => void;
  onOpenPage: (pageId: string) => void;
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

export default function CmsDraftBar(props: CmsDraftBarProps) {
  const {
    activePage,
    siteContent,
    savedContent,
    setSiteContent,
    baseHashForKey,
    onPublish,
    contentSaving,
    onSessionExpired,
    onOpenPage,
  } = props;
  const { showToast, confirm: askConfirm, choose: askChoose } = useAdminDialogs();

  const [available, setAvailable] = useState<boolean | null>(null);
  const [draft, setDraft] = useState<DraftDto | null>(null);
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [forbidden, setForbidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [openedVersion, setOpenedVersion] = useState<number | null>(null);

  const busyAll = busy || contentSaving;

  const reloadDraft = useCallback(async () => {
    if (!activePage || activePage === "overview") return;
    const url = `/api/admin-drafts?entity_type=${encodeURIComponent(
      DRAFT_ENTITY_TYPE
    )}&entity_id=${encodeURIComponent(activePage)}`;
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
  }, [activePage, onSessionExpired]);

  const reloadList = useCallback(async () => {
    const url = `/api/admin-drafts?entity_type=${encodeURIComponent(
      DRAFT_ENTITY_TYPE
    )}`;
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
      setDrafts([]);
      return;
    }
    setAvailable(true);
    setDrafts(Array.isArray(data?.drafts) ? data.drafts : []);
  }, [onSessionExpired]);

  useEffect(() => {
    setForbidden(false);
    setOpenedVersion(null);
    setDraft(null);
    setDrafts([]);
    setAvailable(null);
    let cancelled = false;
    (async () => {
      try {
        if (activePage === "overview") {
          await reloadList();
        } else {
          await reloadDraft();
        }
      } catch {
        /* ignore */
      }
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [activePage, reloadDraft, reloadList]);

  const handleSaveDraft = async () => {
    if (busyAll || activePage === "overview") return;
    const { changes, skippedSettingsKeys, missingHashKeys } = buildDraftChanges(
      siteContent,
      savedContent,
      baseHashForKey,
      isSuperAdminSettingsKey
    );
    const changeKeys = Object.keys(changes);
    if (!changeKeys.length && !skippedSettingsKeys.length && !missingHashKeys.length) {
      showToast("Nothing to save as draft", "info");
      return;
    }
    if (skippedSettingsKeys.length) {
      showToast(
        `Settings fields must be saved normally: ${skippedSettingsKeys.slice(0, 8).join(", ")}`,
        "info"
      );
    }
    if (missingHashKeys.length) {
      showToast("Reload the page and try again", "error");
      return;
    }
    if (!changeKeys.length) {
      showToast("Nothing to save as draft", "info");
      return;
    }

    if (
      draft &&
      (openedVersion === null || openedVersion !== Number(draft.draft_version))
    ) {
      const banner = formatDraftBanner(draft);
      const ok = await askConfirm(
        `Replace the existing draft by ${banner.who} (${banner.count} changes)?`
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
          entity_type: DRAFT_ENTITY_TYPE,
          entity_id: activePage,
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
        setOpenedVersion(Number(data.draft.draft_version) || null);
      } else {
        await reloadDraft();
      }
    } finally {
      setBusy(false);
    }
  };

  const handleOpenDraft = async () => {
    if (busyAll || !draft?.changes) return;
    const draftKeys = new Set(Object.keys(draft.changes));
    const dirtyExtra: string[] = [];
    const allKeys = new Set([
      ...Object.keys(siteContent || {}),
      ...Object.keys(savedContent || {}),
    ]);
    for (const k of allKeys) {
      if (draftKeys.has(k)) continue;
      if (String(siteContent[k] ?? "") !== String(savedContent[k] ?? "")) {
        dirtyExtra.push(k);
      }
    }
    if (dirtyExtra.length) {
      const ok = await askConfirm(
        `You have unsaved edits not in this draft (${dirtyExtra.length}). Opening the draft will keep those fields. Continue?`
      );
      if (!ok) return;
    }
    const overrides = draftOverrides(draft.changes);
    setSiteContent((s) => ({ ...s, ...overrides }));
    setOpenedVersion(Number(draft.draft_version) || null);
    const live = liveChangedKeys(draft.changes, baseHashForKey);
    if (live.length) {
      showToast(
        `These fields changed live after this draft was saved: ${live.slice(0, 10).join(", ")}`,
        "info"
      );
    }
  };

  const handlePublishDraft = async () => {
    if (busyAll || !draft?.changes) return;
    const changes = draft.changes;
    const keys = Object.keys(changes);
    if (!keys.length) {
      showToast("Draft has no changes", "info");
      return;
    }
    const matching = keysMatchingLive(changes, savedContent);
    if (matching.length === keys.length) {
      const choice = await askChoose(
        "Draft already matches the live site - Discard draft / Cancel",
        [
          { id: "discard", label: "Discard draft", variant: "danger" },
          { id: "cancel", label: "Cancel", variant: "default" },
        ]
      );
      if (choice === "discard") {
        await doDiscard(false);
      }
      return;
    }
    const live = liveChangedKeys(changes, baseHashForKey);
    const preview = keys.slice(0, 10).join(", ");
    let msg = `Publish ${keys.length} field(s) from this draft?\n${preview}${
      keys.length > 10 ? ", …" : ""
    }`;
    if (live.length) {
      msg +=
        "\n\n⚠ These fields changed live after the draft was saved - publishing will overwrite them: " +
        live.slice(0, 10).join(", ");
    }
    const okConfirm = await askConfirm(msg);
    if (!okConfirm) return;

    setBusy(true);
    try {
      const ok = await onPublish(keys, draftOverrides(changes));
      if (!ok) return;
      const del = await draftFetch("/api/admin-drafts", {
        method: "DELETE",
        body: JSON.stringify({
          entity_type: DRAFT_ENTITY_TYPE,
          entity_id: activePage,
          expected_draft_version: draft.draft_version,
        }),
      });
      if (del.status === 401) {
        onSessionExpired();
        return;
      }
      if (del.ok) {
        showToast("Published. Draft removed.", "success");
        setDraft(null);
        setOpenedVersion(null);
      } else {
        showToast(
          "Published, but the draft could not be removed - use Discard draft",
          "error"
        );
        await reloadDraft();
      }
    } finally {
      setBusy(false);
    }
  };

  const doDiscard = async (askFirst: boolean) => {
    if (busyAll || !draft) return;
    if (askFirst) {
      const ok = await askConfirm(
        "Discard this draft permanently? This cannot be undone."
      );
      if (!ok) return;
    }
    setBusy(true);
    try {
      const r = await draftFetch("/api/admin-drafts", {
        method: "DELETE",
        body: JSON.stringify({
          entity_type: DRAFT_ENTITY_TYPE,
          entity_id: activePage,
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
    } finally {
      setBusy(false);
    }
  };

  const handleDiscardDraft = async () => {
    await doDiscard(true);
  };

  if (forbidden) return null;
  if (available === false) return null;
  if (available === null) return null;

  if (activePage === "overview") {
    if (!drafts.length) return null;
    return (
      <div
        data-cms-draft-bar="overview"
        style={{
          marginBottom: 16,
          padding: "12px 14px",
          background: "#FFF7ED",
          border: "1px solid #FED7AA",
          borderRadius: 10,
          fontSize: 13,
          color: "#9A3412",
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 8 }}>
          Pages with unpublished drafts
        </div>
        <ul style={{ margin: 0, paddingLeft: 18, listStyle: "disc" }}>
          {drafts.map((d) => {
            const banner = formatDraftBanner(d);
            const label = PAGE_LABELS[d.entity_id] || d.entity_id;
            return (
              <li key={d.entity_id} style={{ marginBottom: 6 }}>
                <strong>{label}</strong>
                {" — "}
                {banner.who}, {banner.whenLondon}, {banner.count} change(s)
                <button
                  type="button"
                  className="action-btn btn-view"
                  disabled={busyAll}
                  style={{ marginLeft: 10, padding: "4px 10px", fontSize: 12 }}
                  onClick={() => onOpenPage(d.entity_id)}
                >
                  Open
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  const banner = draft ? formatDraftBanner(draft) : null;

  return (
    <div
      data-cms-draft-bar={activePage}
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
              className="action-btn btn-verify"
              disabled={busyAll}
              style={{ padding: "8px 14px", fontSize: 13 }}
              onClick={() => void handlePublishDraft()}
            >
              Publish draft
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
          change(s) — NOT live
          {banner.staleDaysWarning ? (
            <div style={{ marginTop: 4, color: "#9A3412", fontWeight: 600 }}>
              ⚠ {Number(draft.age_days) || 0} days old
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
