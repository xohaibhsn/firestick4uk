"use client";

import { useId, type ReactNode } from "react";

export type CollapsibleSectionProps = {
  title: string;
  open: boolean;
  onToggle: () => void;
  /** Number of fields (shown in header). */
  fieldCount?: number;
  /** Optional "appears on" hint under the title row. */
  appearsOnHint?: string;
  /** Red ● when section has unsaved dirty fields. */
  dirty?: boolean;
  /** Optional help line under the header. */
  help?: string;
  /** data-cms-section value (Content Editor). */
  sectionKey?: string;
  /** data-testid for the section root. */
  testId?: string;
  children: ReactNode;
  /** Compact styling for dark product modal. */
  variant?: "default" | "dark";
};

export default function CollapsibleSection({
  title,
  open,
  onToggle,
  fieldCount,
  appearsOnHint,
  dirty = false,
  help,
  sectionKey,
  testId,
  children,
  variant = "default",
}: CollapsibleSectionProps) {
  const reactId = useId();
  const panelId = `collapsible-panel-${reactId.replace(/:/g, "")}`;
  const isDark = variant === "dark";

  return (
    <div
      data-collapsible-section={sectionKey || title}
      data-cms-section={sectionKey || undefined}
      data-testid={testId || undefined}
      style={{
        marginBottom: 14,
        border: isDark
          ? "1px solid rgba(255,255,255,0.1)"
          : "1px solid #E5E5E5",
        borderRadius: 10,
        background: isDark ? "rgba(255,255,255,0.02)" : "#FAFAFA",
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        data-collapsible-toggle="1"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 14px",
          border: "none",
          background: "transparent",
          cursor: "pointer",
          textAlign: "left",
          color: isDark ? "#FFFFFF" : "#111111",
          fontSize: 13,
          fontWeight: 700,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            display: "inline-flex",
            width: 22,
            height: 22,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 6,
            background: isDark ? "rgba(139,0,255,0.2)" : "#F5F3FF",
            color: "#5B21B6",
            fontSize: 14,
            flexShrink: 0,
          }}
        >
          {open ? "−" : "+"}
        </span>
        <span style={{ flex: 1, color: isDark ? "#C4B5FD" : "#5B21B6" }}>
          {title}
        </span>
        {typeof fieldCount === "number" ? (
          <span
            data-collapsible-field-count="1"
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: isDark ? "rgba(255,255,255,0.45)" : "#888",
            }}
          >
            {fieldCount} field{fieldCount === 1 ? "" : "s"}
          </span>
        ) : null}
        {dirty ? (
          <span
            data-collapsible-dirty="1"
            title="Unsaved changes in this section"
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#DC2626",
              flexShrink: 0,
            }}
            aria-label="Unsaved changes"
          />
        ) : null}
      </button>
      {appearsOnHint ? (
        <div
          style={{
            padding: "0 14px 8px 46px",
            fontSize: 11,
            color: isDark ? "rgba(255,255,255,0.4)" : "#9CA3AF",
            lineHeight: 1.35,
          }}
        >
          {appearsOnHint}
        </div>
      ) : null}
      {help ? (
        <div
          style={{
            padding: "0 14px 8px 46px",
            fontSize: 12,
            color: isDark ? "rgba(255,255,255,0.5)" : "#666",
            lineHeight: 1.4,
          }}
        >
          {help}
        </div>
      ) : null}
      <div
        id={panelId}
        role="region"
        hidden={!open}
        style={{
          display: open ? "block" : "none",
          padding: "4px 14px 16px",
          borderTop: open
            ? isDark
              ? "1px solid rgba(255,255,255,0.08)"
              : "1px solid #EEE"
            : "none",
          transition: "opacity 0.15s ease",
        }}
      >
        {children}
      </div>
    </div>
  );
}
