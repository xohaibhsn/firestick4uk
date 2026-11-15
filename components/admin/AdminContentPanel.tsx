"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  ADMIN_CONTENT_SECTIONS,
  keysForPage,
} from "@/lib/adminContentFields";
import { formatCmsAppearsOnHint } from "@/lib/cmsAppearsOn";
import { CMS_EXPAND_FIELD_EVENT } from "@/lib/adminSidebarGroups";
import CmsUpdatesAfterSaveChip from "@/components/admin/CmsUpdatesAfterSaveChip";
import CollapsibleSection from "@/components/admin/CollapsibleSection";

const TipTapEditor = dynamic(() => import("./TipTapEditor"), { ssr: false });

type Props = {
  page: string;
  siteContent: Record<string, string>;
  setSiteContent: React.Dispatch<
    React.SetStateAction<Record<string, string>>
  >;
  onSave: (keys: string[]) => void;
  saving: boolean;
  saveLabel?: string;
  /** Snapshot for dirty-dot per section. */
  savedContent?: Record<string, string>;
};

function sectionDirty(
  fields: { key: string }[],
  current: Record<string, string>,
  saved: Record<string, string> | undefined
): boolean {
  if (!saved) return false;
  return fields.some(
    (f) => String(current[f.key] ?? "") !== String(saved[f.key] ?? "")
  );
}

export default function AdminContentPanel({
  page,
  siteContent,
  setSiteContent,
  onSave,
  saving,
  saveLabel = "💾 Save",
  savedContent,
}: Props) {
  const sections = ADMIN_CONTENT_SECTIONS[page] || [];

  function defaultOpenMap(list: typeof sections): Record<string, boolean> {
    const next: Record<string, boolean> = {};
    list.forEach((s, i) => {
      next[s.title] = i === 0;
    });
    return next;
  }

  const [openMap, setOpenMap] = useState<Record<string, boolean>>(() =>
    defaultOpenMap(ADMIN_CONTENT_SECTIONS[page] || [])
  );

  // First section open by default when page changes
  useEffect(() => {
    setOpenMap(defaultOpenMap(ADMIN_CONTENT_SECTIONS[page] || []));
  }, [page]);

  const expandAll = useCallback(() => {
    const next: Record<string, boolean> = {};
    for (const s of sections) next[s.title] = true;
    setOpenMap(next);
  }, [sections]);

  const collapseAll = useCallback(() => {
    const next: Record<string, boolean> = {};
    for (const s of sections) next[s.title] = false;
    setOpenMap(next);
  }, [sections]);

  const expandForField = useCallback(
    (fieldKey: string) => {
      for (const s of sections) {
        if (s.fields.some((f) => f.key === fieldKey)) {
          setOpenMap((prev) => ({ ...prev, [s.title]: true }));
          return;
        }
      }
    },
    [sections]
  );

  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent<{ key?: string }>).detail;
      if (detail?.key) expandForField(detail.key);
    };
    window.addEventListener(CMS_EXPAND_FIELD_EVENT, handler);
    return () => window.removeEventListener(CMS_EXPAND_FIELD_EVENT, handler);
  }, [expandForField]);

  const anyOpen = useMemo(
    () => sections.some((s) => openMap[s.title]),
    [sections, openMap]
  );

  if (!sections.length) {
    return (
      <p style={{ fontSize: 13, color: "#666" }}>
        No fields configured for this page yet.
      </p>
    );
  }

  return (
    <div data-cms-content-panel={page}>
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          marginBottom: 14,
        }}
      >
        <button
          type="button"
          className="action-btn btn-view"
          data-testid="cms-expand-all"
          onClick={expandAll}
          style={{ padding: "6px 12px", fontSize: 12 }}
        >
          Expand all
        </button>
        <button
          type="button"
          className="action-btn btn-view"
          data-testid="cms-collapse-all"
          onClick={collapseAll}
          style={{ padding: "6px 12px", fontSize: 12 }}
        >
          Collapse all
        </button>
        {!anyOpen ? (
          <span style={{ fontSize: 11, color: "#888", alignSelf: "center" }}>
            All sections collapsed
          </span>
        ) : null}
      </div>

      {sections.map((section) => {
        const open = !!openMap[section.title];
        const dirty = sectionDirty(section.fields, siteContent, savedContent);
        const appearsHints = section.fields
          .map((f) => formatCmsAppearsOnHint(f.key))
          .filter(Boolean);
        const uniqueHints = [...new Set(appearsHints)];
        const appearsOnHint =
          uniqueHints.length === 1
            ? uniqueHints[0]
            : uniqueHints.length > 1
              ? `${uniqueHints.length} placements`
              : undefined;

        return (
          <CollapsibleSection
            key={section.title}
            title={section.title}
            open={open}
            onToggle={() =>
              setOpenMap((prev) => ({
                ...prev,
                [section.title]: !prev[section.title],
              }))
            }
            fieldCount={section.fields.length}
            appearsOnHint={appearsOnHint}
            dirty={dirty}
            sectionKey={section.title}
            testId={`cms-section-${section.title}`}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 14,
              }}
            >
              {section.fields.map((field) => {
                const appears = formatCmsAppearsOnHint(field.key);
                return (
                  <div
                    key={field.key}
                    className="modal-field"
                    data-cms-field={field.key}
                    style={field.wide ? { gridColumn: "1 / -1" } : undefined}
                  >
                    <label>
                      {field.label}
                      <CmsUpdatesAfterSaveChip fieldKey={field.key} />
                    </label>
                    {field.help ? (
                      <p
                        style={{
                          fontSize: 12,
                          color: "#666",
                          margin: "0 0 6px",
                          lineHeight: 1.4,
                        }}
                      >
                        {field.help}
                      </p>
                    ) : null}
                    {appears ? (
                      <p
                        data-cms-appears-on={field.key}
                        style={{
                          fontSize: 11,
                          color: "#9CA3AF",
                          margin: "0 0 6px",
                          lineHeight: 1.35,
                        }}
                      >
                        {appears}
                      </p>
                    ) : null}
                    {field.type === "html" ? (
                      <TipTapEditor
                        content={siteContent[field.key] || ""}
                        onChange={(html) =>
                          setSiteContent((s) => ({
                            ...s,
                            [field.key]: html,
                          }))
                        }
                        placeholder={`Write ${field.label.toLowerCase()}…`}
                      />
                    ) : field.type === "textarea" || field.type === "json" ? (
                      <textarea
                        rows={field.type === "json" ? 8 : 3}
                        style={{ width: "100%", resize: "vertical" }}
                        value={siteContent[field.key] || ""}
                        onChange={(e) =>
                          setSiteContent((s) => ({
                            ...s,
                            [field.key]: e.target.value,
                          }))
                        }
                      />
                    ) : (
                      <input
                        style={{ width: "100%" }}
                        value={siteContent[field.key] || ""}
                        onChange={(e) =>
                          setSiteContent((s) => ({
                            ...s,
                            [field.key]: e.target.value,
                          }))
                        }
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </CollapsibleSection>
        );
      })}
      <button
        className="btn-primary"
        disabled={saving}
        onClick={() => onSave(keysForPage(page))}
      >
        {saving ? "Saving..." : saveLabel}
      </button>
    </div>
  );
}
