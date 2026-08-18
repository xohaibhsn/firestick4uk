"use client";

import {
  ADMIN_CONTENT_SECTIONS,
  keysForPage,
} from "@/lib/adminContentFields";

type Props = {
  page: string;
  siteContent: Record<string, string>;
  setSiteContent: React.Dispatch<
    React.SetStateAction<Record<string, string>>
  >;
  onSave: (keys: string[]) => void;
  saving: boolean;
  saveLabel?: string;
};

export default function AdminContentPanel({
  page,
  siteContent,
  setSiteContent,
  onSave,
  saving,
  saveLabel = "💾 Save",
}: Props) {
  const sections = ADMIN_CONTENT_SECTIONS[page] || [];
  if (!sections.length) {
    return (
      <p style={{ fontSize: 13, color: "#666" }}>
        No fields configured for this page yet.
      </p>
    );
  }

  return (
    <div>
      {sections.map((section) => (
        <div key={section.title} style={{ marginBottom: 24 }}>
          <div
            style={{
              margin: "0 0 14px",
              fontSize: 13,
              fontWeight: 700,
              color: "#5B21B6",
            }}
          >
            {section.title}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 14,
            }}
          >
            {section.fields.map((field) => (
              <div
                key={field.key}
                className="modal-field"
                style={field.wide ? { gridColumn: "1 / -1" } : undefined}
              >
                <label>{field.label}</label>
                {field.type === "textarea" || field.type === "json" ? (
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
            ))}
          </div>
        </div>
      ))}
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
