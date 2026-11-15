"use client";

/** Small badge shown only when live CMS preview overrides are active in an iframe. */
export default function CmsPreviewBadge() {
  return (
    <div
      data-cms-preview-badge="1"
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        top: 10,
        right: 10,
        zIndex: 2147483646,
        background: "rgba(91, 33, 182, 0.92)",
        color: "#fff",
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.02em",
        padding: "6px 10px",
        borderRadius: 8,
        boxShadow: "0 2px 10px rgba(0,0,0,0.18)",
        pointerEvents: "none",
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
      }}
    >
      Preview — not saved
    </div>
  );
}
