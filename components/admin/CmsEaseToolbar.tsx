"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  cmsViewOnSiteForPage,
  formatCmsFindSnippetHtml,
  searchCmsContent,
  type CmsFindHit,
} from "@/lib/cmsFindText";
import { keysForPage } from "@/lib/adminContentFields";
import { CMS_EXPAND_FIELD_EVENT } from "@/lib/adminSidebarGroups";

type Props = {
  activePage: string;
  setActivePage: (page: string) => void;
  siteContent: Record<string, string>;
  /** Snapshot of last loaded/saved content for dirty detection. */
  savedContent: Record<string, string>;
  onMarkSaved: (next: Record<string, string>) => void;
  products: Array<{ id: number | string; name: string }>;
  contentSaving: boolean;
  onSave: (keys: string[]) => void | Promise<void>;
  /** Called when user confirms leaving while dirty — returns true to proceed. */
  requestLeave?: (next: () => void) => void;
  /** Live preview pane toggle (admin Content Editor). */
  previewOpen?: boolean;
  onTogglePreview?: () => void;
};

function dirtyKeys(
  current: Record<string, string>,
  saved: Record<string, string>
): string[] {
  const keys = new Set([...Object.keys(current), ...Object.keys(saved)]);
  const out: string[] = [];
  for (const k of keys) {
    if (String(current[k] ?? "") !== String(saved[k] ?? "")) out.push(k);
  }
  return out;
}

export default function CmsEaseToolbar({
  activePage,
  setActivePage,
  siteContent,
  savedContent,
  onMarkSaved,
  products,
  contentSaving,
  onSave,
  previewOpen = false,
  onTogglePreview,
}: Props) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [highlightKey, setHighlightKey] = useState<string | null>(null);
  const dirty = useMemo(
    () => dirtyKeys(siteContent, savedContent),
    [siteContent, savedContent]
  );
  const dirtyCount = dirty.length;
  const dirtyRef = useRef(0);
  useEffect(() => {
    dirtyRef.current = dirtyCount;
  }, [dirtyCount]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query.trim()), 220);
    return () => window.clearTimeout(t);
  }, [query]);

  const results: CmsFindHit[] = useMemo(() => {
    if (!debounced) return [];
    return searchCmsContent({
      query: debounced,
      siteContent,
      productNames: products.map((p) => ({ id: p.id, name: p.name })),
      max: 50,
    });
  }, [debounced, siteContent, products]);

  // beforeunload while dirty
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current <= 0) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  // Flash highlight on field
  useEffect(() => {
    if (!highlightKey) return;
    const el = document.querySelector(
      `[data-cms-field="${CSS.escape(highlightKey)}"]`
    ) as HTMLElement | null;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const prev = el.style.outline;
    const prevBg = el.style.background;
    el.style.outline = "2px solid #7C3AED";
    el.style.background = "#F5F3FF";
    const t = window.setTimeout(() => {
      el.style.outline = prev;
      el.style.background = prevBg;
      setHighlightKey(null);
    }, 2000);
    return () => window.clearTimeout(t);
  }, [highlightKey, activePage]);

  const goToHit = useCallback(
    (hit: CmsFindHit) => {
      if (hit.matchIn === "product") {
        setActivePage("products");
        return;
      }
      const expandThenHighlight = () => {
        try {
          window.dispatchEvent(
            new CustomEvent(CMS_EXPAND_FIELD_EVENT, {
              detail: { key: hit.key },
            })
          );
        } catch {
          /* ignore */
        }
        // Allow accordion open + paint before scroll/highlight
        window.setTimeout(() => setHighlightKey(hit.key), 60);
      };
      if (hit.page && hit.page !== activePage) {
        setActivePage(hit.page);
        // allow panel to mount then expand + highlight
        window.setTimeout(expandThenHighlight, 80);
      } else {
        expandThenHighlight();
      }
    },
    [activePage, setActivePage]
  );

  const view = cmsViewOnSiteForPage(activePage);
  // Products listing also wants /products; detail sample is separate — brief:
  // Products listing → /products, Product detail → sample product.
  const listingHref =
    activePage === "products" ? "/products" : view?.href || null;
  const detailHref = activePage === "products" ? "/products/firestick-4k" : null;

  const saveDirtyForPage = () => {
    const pageKeys = new Set(keysForPage(activePage));
    // Include dirty keys that belong to this page prefix / keysForPage
    const toSave = dirty.filter(
      (k) =>
        pageKeys.has(k) ||
        k.startsWith(activePage + "_") ||
        (activePage === "products" && k.startsWith("pd_")) ||
        (activePage === "cart" &&
          (k.startsWith("bank_") || k.startsWith("success_") || k.startsWith("checkout_"))) ||
        (activePage === "home" && k.startsWith("home_")) ||
        (activePage === "about" && k.startsWith("about_")) ||
        (activePage === "contact" && k.startsWith("contact_")) ||
        (activePage === "subscription" && k.startsWith("subscription_"))
    );
    const keys = toSave.length ? toSave : [...pageKeys];
    void Promise.resolve(onSave(keys)).then(() => {
      onMarkSaved({ ...siteContent });
    });
  };

  return (
    <div data-cms-ease-toolbar="1" style={{ marginBottom: 18 }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          alignItems: "center",
          marginBottom: 10,
        }}
      >
        <label style={{ fontSize: 12, fontWeight: 700, color: "#5B21B6" }}>
          Find text
        </label>
        <input
          data-cms-find-input="1"
          type="search"
          placeholder="Search labels, keys, values, products…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            flex: "1 1 220px",
            minWidth: 180,
            padding: "8px 12px",
            border: "1px solid #DDD6FE",
            borderRadius: 8,
            fontSize: 13,
          }}
        />
        {listingHref ? (
          <a
            data-cms-view-on-site="1"
            href={listingHref}
            target="_blank"
            rel="noopener noreferrer"
            className="action-btn btn-view"
            style={{ padding: "8px 14px", fontSize: 12, textDecoration: "none" }}
          >
            View on site ↗
          </a>
        ) : null}
        {detailHref ? (
          <a
            data-cms-view-on-site-detail="1"
            href={detailHref}
            target="_blank"
            rel="noopener noreferrer"
            className="action-btn btn-view"
            style={{ padding: "8px 14px", fontSize: 12, textDecoration: "none" }}
          >
            View product detail ↗
          </a>
        ) : null}
        {onTogglePreview ? (
          <button
            type="button"
            data-cms-preview-toggle="1"
            className="action-btn btn-verify"
            aria-pressed={previewOpen}
            onClick={onTogglePreview}
            style={{
              padding: "8px 14px",
              fontSize: 12,
              background: previewOpen ? "rgba(91,33,182,0.15)" : undefined,
            }}
          >
            {previewOpen ? "Preview on" : "Preview"}
          </button>
        ) : null}
      </div>

      {debounced && (
        <div
          data-cms-find-results="1"
          style={{
            background: "#fff",
            border: "1px solid #E5E5E5",
            borderRadius: 10,
            maxHeight: 280,
            overflow: "auto",
            marginBottom: 10,
          }}
        >
          {results.length === 0 ? (
            <div style={{ padding: 12, fontSize: 13, color: "#666" }}>
              No matches
            </div>
          ) : (
            results.map((hit) => (
              <div
                key={`${hit.page}:${hit.key}:${hit.matchIn}`}
                data-cms-find-hit={hit.key}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                  padding: "10px 12px",
                  borderBottom: "1px solid #F0F0F0",
                  fontSize: 12,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: "#111" }}>
                    {hit.label}{" "}
                    <span style={{ fontWeight: 500, color: "#888" }}>
                      · {hit.page} / {hit.section}
                    </span>
                  </div>
                  {hit.snippet ? (
                    <div
                      style={{ color: "#444", marginTop: 4 }}
                      dangerouslySetInnerHTML={{
                        __html: formatCmsFindSnippetHtml(hit.snippet),
                      }}
                    />
                  ) : (
                    <div style={{ color: "#999", marginTop: 4 }}>
                      (label only — value hidden)
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className="action-btn btn-verify"
                  data-cms-find-go="1"
                  style={{ padding: "6px 12px", fontSize: 12 }}
                  onClick={() => goToHit(hit)}
                >
                  Go
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {dirtyCount > 0 ? (
        <div
          data-cms-unsaved-bar="1"
          style={{
            position: "sticky",
            bottom: 0,
            zIndex: 40,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "10px 14px",
            background: "#FFF7ED",
            border: "1px solid #FDBA74",
            borderRadius: 10,
            fontSize: 13,
            color: "#9A3412",
          }}
        >
          <span data-cms-unsaved-count={dirtyCount}>
            {dirtyCount} unsaved change{dirtyCount === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            className="btn-primary"
            disabled={contentSaving}
            data-cms-unsaved-save="1"
            onClick={saveDirtyForPage}
          >
            {contentSaving ? "Saving..." : "💾 Save"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Confirm helper for tab/page switches — used by sidhu page. */
export async function confirmLeaveIfDirty(
  dirtyCount: number,
  proceed: () => void,
  confirmFn?: (message: string) => boolean | Promise<boolean>
): Promise<void> {
  if (dirtyCount <= 0) {
    proceed();
    return;
  }
  const message = `You have ${dirtyCount} unsaved change${dirtyCount === 1 ? "" : "s"}. Leave without saving?`;
  if (!confirmFn) return;
  const ok = await confirmFn(message);
  if (ok) proceed();
}

export function countDirtyKeys(
  current: Record<string, string>,
  saved: Record<string, string>
): number {
  return dirtyKeys(current, saved).length;
}
