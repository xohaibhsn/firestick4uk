"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  buildDirtyOverrides,
  CMS_PREVIEW_MSG_TYPE,
  cmsPreviewHref,
} from "@/lib/cmsPreview";
import { cmsViewOnSiteForPage } from "@/lib/cmsFindText";

const DESKTOP_W = 1280;
const MOBILE_W = 390;
const DEBOUNCE_MS = 300;

type Props = {
  open: boolean;
  onClose: () => void;
  activePage: string;
  siteContent: Record<string, string>;
  savedContent: Record<string, string>;
  /**
   * F4UK-MULTI-106 — optional temporary overrides (e.g. "Preview restore" of an old revision).
   * Merged over the dirty overrides in the postMessage payload only; never touches editor state
   * or storage, so clearing it (null/undefined) returns the preview to the editor's own dirty state.
   */
  forceOverrides?: Record<string, string> | null;
};

function previewPathForPage(page: string): string {
  if (page === "products") return "/products";
  if (page === "overview") return "/";
  const view = cmsViewOnSiteForPage(page);
  return view?.href || "/";
}

export default function CmsPreviewPane({
  open,
  onClose,
  activePage,
  siteContent,
  savedContent,
  forceOverrides = null,
}: Props) {
  const [widthMode, setWidthMode] = useState<"desktop" | "mobile">("desktop");
  const [paneWidth, setPaneWidth] = useState(440);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [iframeReady, setIframeReady] = useState(false);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  const path = previewPathForPage(activePage);
  const src = cmsPreviewHref(path);

  const postOverrides = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    const overrides = {
      ...buildDirtyOverrides(siteContent, savedContent),
      ...(forceOverrides || {}),
    };
    iframe.contentWindow.postMessage(
      { type: CMS_PREVIEW_MSG_TYPE, overrides },
      window.location.origin
    );
  }, [siteContent, savedContent, forceOverrides]);

  useEffect(() => {
    if (!open || !iframeReady) return;
    const t = window.setTimeout(postOverrides, DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [open, iframeReady, postOverrides, siteContent, savedContent, forceOverrides]);

  useEffect(() => {
    setIframeReady(false);
  }, [src]);

  useEffect(() => {
    if (!open) return;
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = dragRef.current.startX - e.clientX;
      const next = Math.min(900, Math.max(320, dragRef.current.startW + dx));
      setPaneWidth(next);
    };
    const onUp = () => {
      dragRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [open]);

  if (!open) return null;

  const frameMax = widthMode === "desktop" ? DESKTOP_W : MOBILE_W;
  const shell: CSSProperties = {
    position: "fixed",
    top: 0,
    right: 0,
    bottom: 0,
    width: paneWidth,
    zIndex: 12000,
    background: "#0f0f14",
    borderLeft: "1px solid rgba(255,255,255,0.12)",
    display: "flex",
    flexDirection: "column",
    boxShadow: "-8px 0 24px rgba(0,0,0,0.35)",
  };

  return (
    <aside data-cms-preview-pane="1" style={shell}>
      <div
        data-cms-preview-resize="1"
        onMouseDown={(e) => {
          dragRef.current = { startX: e.clientX, startW: paneWidth };
        }}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 6,
          cursor: "ew-resize",
          zIndex: 2,
        }}
        title="Drag to resize"
      />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 12px",
          borderBottom: "1px solid rgba(255,255,255,0.1)",
          flexWrap: "wrap",
        }}
      >
        <strong style={{ fontSize: 13, color: "#EDE9FE" }}>Preview</strong>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
          {path}
        </span>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          data-cms-preview-width="desktop"
          className="action-btn btn-view"
          aria-pressed={widthMode === "desktop"}
          onClick={() => setWidthMode("desktop")}
          style={{
            padding: "4px 10px",
            fontSize: 11,
            opacity: widthMode === "desktop" ? 1 : 0.65,
          }}
        >
          Desktop {DESKTOP_W}
        </button>
        <button
          type="button"
          data-cms-preview-width="mobile"
          className="action-btn btn-view"
          aria-pressed={widthMode === "mobile"}
          onClick={() => setWidthMode("mobile")}
          style={{
            padding: "4px 10px",
            fontSize: 11,
            opacity: widthMode === "mobile" ? 1 : 0.65,
          }}
        >
          Mobile {MOBILE_W}
        </button>
        <button
          type="button"
          data-cms-preview-close="1"
          className="action-btn btn-delete"
          onClick={onClose}
          style={{ padding: "4px 10px", fontSize: 11 }}
        >
          Close
        </button>
      </div>
      <div
        style={{
          flex: 1,
          overflow: "auto",
          display: "flex",
          justifyContent: "center",
          background: "#1a1a22",
          padding: 8,
        }}
      >
        <iframe
          ref={iframeRef}
          data-cms-preview-iframe="1"
          title="CMS live preview"
          src={src}
          onLoad={() => {
            setIframeReady(true);
            window.setTimeout(postOverrides, 50);
          }}
          style={{
            width: "100%",
            maxWidth: frameMax,
            height: "100%",
            minHeight: "100%",
            border: "1px solid rgba(255,255,255,0.08)",
            background: "#fff",
            borderRadius: 4,
          }}
        />
      </div>
    </aside>
  );
}
