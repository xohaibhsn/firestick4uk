"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  buildProductPreviewOverrides,
  cmsPreviewHref,
  PRODUCT_PREVIEW_MSG_TYPE,
  type ProductPreviewDraft,
} from "@/lib/productPreview";

const DESKTOP_W = 1280;
const MOBILE_W = 390;
const DEBOUNCE_MS = 300;

type Props = {
  open: boolean;
  onClose: () => void;
  /** SAVED public slug only. */
  slug: string;
  draft: ProductPreviewDraft;
};

/**
 * F4UK-MULTI-132 — side iframe of the real PDP with live unsaved draft overlays.
 * Never fetches /api, never writes storage; posts overrides only.
 */
export default function ProductPreviewPane({
  open,
  onClose,
  slug,
  draft,
}: Props) {
  const [widthMode, setWidthMode] = useState<"desktop" | "mobile">("desktop");
  const [paneWidth, setPaneWidth] = useState(440);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [iframeReady, setIframeReady] = useState(false);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  const path = `/products/${encodeURIComponent(slug)}`;
  const src = cmsPreviewHref(path);

  const postOverrides = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    const overrides = buildProductPreviewOverrides(draft);
    iframe.contentWindow.postMessage(
      { type: PRODUCT_PREVIEW_MSG_TYPE, overrides },
      window.location.origin
    );
  }, [draft]);

  useEffect(() => {
    if (!open || !iframeReady) return;
    const t = window.setTimeout(postOverrides, DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [open, iframeReady, postOverrides, draft]);

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
    <aside data-product-preview-pane="1" style={shell}>
      <div
        data-product-preview-resize="1"
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
        <strong style={{ fontSize: 13, color: "#EDE9FE" }}>Product preview</strong>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
          {path}
        </span>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          data-product-preview-width="desktop"
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
          data-product-preview-width="mobile"
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
          data-product-preview-close="1"
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
          data-product-preview-iframe="1"
          title="Product live preview"
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
