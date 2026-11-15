"use client";

/**
 * F4UK-MULTI-106 — side-by-side revision compare (Revision vs Current).
 *
 * Safety:
 *  - Text mode renders React text nodes only (HTML is stripped, never injected).
 *  - "Rendered" mode renders HTML ONLY through the sanitising CmsBody component.
 *  - No raw HTML injection API is used in this file.
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import CmsBody from "@/components/CmsBody";
import { diffWords, stripHtmlForDiff } from "@/lib/textDiff";
import {
  buildCompareRows,
  fetchCurrentForRevision,
  type CompareRow,
  type CurrentFetchResult,
} from "@/lib/revisionCompare";

export type CompareRevisionInfo = {
  id: number;
  entity_type: string;
  entity_id: string;
  snapshot: unknown;
  created_at?: string | Date | null;
  actor_name?: string | null;
  actor_role?: string | null;
};

export function revisionCompareLabel(rev: {
  created_at?: string | Date | null;
  actor_name?: string | null;
}): string {
  const when = rev.created_at ? new Date(rev.created_at as any).toLocaleString() : "unknown date";
  const who = rev.actor_name ? String(rev.actor_name) : "unknown actor";
  return `Revision ${when}, ${who}`;
}

const SR_ONLY: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0,0,0,0)",
  whiteSpace: "nowrap",
  border: 0,
};

const DEL_STYLE: CSSProperties = {
  color: "#B91C1C",
  background: "rgba(220,38,38,0.12)",
  textDecoration: "line-through",
};
const INS_STYLE: CSSProperties = {
  color: "#166534",
  background: "rgba(22,163,74,0.14)",
  textDecoration: "underline",
};

const PANE_STYLE: CSSProperties = {
  border: "1px solid #E5E5E5",
  borderRadius: 8,
  padding: 10,
  background: "#fff",
  fontSize: 13,
  lineHeight: 1.55,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  maxHeight: 320,
  overflow: "auto",
  color: "#222",
};

const GRID_CSS = `
.f4uk-rev-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media (max-width: 720px){.f4uk-rev-grid{grid-template-columns:1fr}}
`;

function EmptyValue() {
  return <em style={{ color: "#888" }}>(empty)</em>;
}

function DelText({ text }: { text: string }) {
  return (
    <del style={DEL_STYLE} data-diff="removed" title="Removed (in revision, not in current)">
      <span style={SR_ONLY}>[removed: </span>
      {text}
      <span style={SR_ONLY}>]</span>
    </del>
  );
}

function InsText({ text }: { text: string }) {
  return (
    <ins style={INS_STYLE} data-diff="added" title="Added (in current, not in revision)">
      <span style={SR_ONLY}>[added: </span>
      {text}
      <span style={SR_ONLY}>]</span>
    </ins>
  );
}

function CompareRowView({
  row,
  mode,
  focused,
  revisionLabel,
  currentLabel,
}: {
  row: CompareRow;
  mode: "text" | "rendered";
  focused: boolean;
  revisionLabel: string;
  currentLabel: string;
}) {
  const leftText = row.html ? stripHtmlForDiff(row.before) : row.before;
  const rightText = row.html ? stripHtmlForDiff(row.after) : row.after;
  const diff = useMemo(
    () => (mode === "text" && row.changed ? diffWords(leftText, rightText) : null),
    [mode, row.changed, leftText, rightText]
  );
  const tooLarge = !!diff?.tooLarge;

  let left: React.ReactNode;
  let right: React.ReactNode;

  if (mode === "rendered") {
    if (row.html) {
      left = row.before.trim() ? <CmsBody html={row.before} /> : <EmptyValue />;
      right = row.after.trim() ? <CmsBody html={row.after} /> : <EmptyValue />;
    } else {
      left = row.before ? row.before : <EmptyValue />;
      right = row.after ? row.after : <EmptyValue />;
    }
  } else if (tooLarge || !diff) {
    left = leftText ? leftText : <EmptyValue />;
    right = rightText ? rightText : <EmptyValue />;
  } else {
    left = diff.ops.length ? (
      diff.ops.map((op, i) =>
        op.type === "equal" ? (
          <span key={i}>{op.text}</span>
        ) : op.type === "delete" ? (
          <DelText key={i} text={op.text} />
        ) : null
      )
    ) : (
      <EmptyValue />
    );
    right = diff.ops.length ? (
      diff.ops.map((op, i) =>
        op.type === "equal" ? (
          <span key={i}>{op.text}</span>
        ) : op.type === "insert" ? (
          <InsText key={i} text={op.text} />
        ) : null
      )
    ) : (
      <EmptyValue />
    );
    if (!leftText) left = <EmptyValue />;
    if (!rightText) right = <EmptyValue />;
  }

  return (
    <section
      aria-label={`${row.label} — ${row.changed ? "changed" : "unchanged"}`}
      data-compare-field={row.field}
      data-compare-changed={row.changed ? "1" : "0"}
      style={{
        border: row.changed ? "2px solid #F59E0B" : "1px solid #E5E5E5",
        background: row.changed ? "rgba(245,158,11,0.06)" : "#FAFAFA",
        borderRadius: 10,
        padding: 10,
        marginBottom: 10,
      }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 13 }}>{row.label}</strong>
        <code style={{ fontSize: 10, color: "#888" }}>{row.field}</code>
        {row.changed ? (
          <span
            style={{ fontSize: 10, background: "#FEF3C7", color: "#92400E", padding: "2px 6px", borderRadius: 4, fontWeight: 700 }}
          >
            ● Changed
          </span>
        ) : (
          <span style={{ fontSize: 10, color: "#666" }}>
            {row.recorded ? (focused ? "Identical to current" : "Unchanged") : "Not recorded in this revision"}
          </span>
        )}
      </div>
      {tooLarge ? (
        <div role="note" data-testid="diff-too-large" style={{ fontSize: 12, color: "#92400E", marginBottom: 6 }}>
          Diff skipped: too large to diff — showing both versions
        </div>
      ) : null}
      <div className="f4uk-rev-grid">
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#444", marginBottom: 4 }}>{revisionLabel}</div>
          <div style={PANE_STYLE} data-compare-side="revision">
            {left}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#444", marginBottom: 4 }}>{currentLabel}</div>
          <div style={PANE_STYLE} data-compare-side="current">
            {right}
          </div>
        </div>
      </div>
    </section>
  );
}

type ViewProps = {
  entityType: string;
  revisionSnapshot: unknown;
  /** Snapshot-shaped current state; null/undefined = not available. */
  currentSnapshot?: unknown | null;
  currentLoading?: boolean;
  currentError?: string;
  revisionLabel: string;
  currentLabel?: string;
  /** When set, this field is listed first and other fields are collapsed behind a toggle. */
  focusField?: string | null;
  /** Initial display mode (default "text"). */
  defaultMode?: "text" | "rendered";
};

export default function RevisionCompareView({
  entityType,
  revisionSnapshot,
  currentSnapshot,
  currentLoading = false,
  currentError = "",
  revisionLabel,
  currentLabel = "Current",
  focusField = null,
  defaultMode = "text",
}: ViewProps) {
  const [mode, setMode] = useState<"text" | "rendered">(defaultMode);
  const [showUnchanged, setShowUnchanged] = useState(false);
  const [showOtherFields, setShowOtherFields] = useState(false);

  const hasCurrent = currentSnapshot != null;
  const rows = useMemo(
    () =>
      buildCompareRows({
        entityType,
        revisionSnapshot,
        currentSnapshot: hasCurrent ? currentSnapshot : {},
        focusField,
      }),
    [entityType, revisionSnapshot, currentSnapshot, hasCurrent, focusField]
  );

  const visible = rows.filter((r) => {
    if (focusField && !showOtherFields && r.field !== focusField) return false;
    if (!hasCurrent) return true;
    return r.changed || showUnchanged || r.field === focusField;
  });
  const hiddenCount = rows.length - visible.length;

  return (
    <div data-testid="revision-compare" data-compare-entity={entityType}>
      <style>{GRID_CSS}</style>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
        <div role="group" aria-label="Compare display mode" style={{ display: "inline-flex", gap: 6 }}>
          <button
            type="button"
            className="action-btn btn-view"
            aria-pressed={mode === "text"}
            data-testid="compare-mode-text"
            onClick={() => setMode("text")}
            style={{ opacity: mode === "text" ? 1 : 0.65 }}
          >
            Text diff
          </button>
          <button
            type="button"
            className="action-btn btn-view"
            aria-pressed={mode === "rendered"}
            data-testid="compare-mode-rendered"
            onClick={() => setMode("rendered")}
            style={{ opacity: mode === "rendered" ? 1 : 0.65 }}
          >
            Rendered
          </button>
        </div>
        {hasCurrent ? (
          <label style={{ fontSize: 12, display: "inline-flex", gap: 4, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={showUnchanged}
              onChange={(e) => setShowUnchanged(e.target.checked)}
            />
            Show unchanged fields
          </label>
        ) : null}
        {focusField ? (
          <label style={{ fontSize: 12, display: "inline-flex", gap: 4, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={showOtherFields}
              onChange={(e) => setShowOtherFields(e.target.checked)}
            />
            Show other fields in this revision
          </label>
        ) : null}
        <span style={{ fontSize: 11, color: "#555" }} data-testid="compare-legend">
          <DelText text="Removed" /> = in revision, not in current · <InsText text="Added" /> = in current, not
          in revision
        </span>
      </div>

      {currentLoading ? (
        <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>Loading current version…</div>
      ) : null}
      {!currentLoading && !hasCurrent ? (
        <div role="alert" style={{ fontSize: 12, color: "#B45309", marginBottom: 8 }}>
          Current version unavailable{currentError ? ` — ${currentError}` : ""}. Showing the revision only.
        </div>
      ) : null}

      {hasCurrent && visible.length === 0 ? (
        <div style={{ fontSize: 13, color: "#166534", padding: 10 }}>
          No differences between this revision and the current version.
        </div>
      ) : null}

      {visible.map((row) =>
        hasCurrent ? (
          <CompareRowView
            key={row.field}
            row={row}
            mode={mode}
            focused={row.field === focusField}
            revisionLabel={revisionLabel}
            currentLabel={currentLabel}
          />
        ) : (
          <section key={row.field} aria-label={row.label} style={{ marginBottom: 10 }}>
            <strong style={{ fontSize: 13 }}>{row.label}</strong>{" "}
            <code style={{ fontSize: 10, color: "#888" }}>{row.field}</code>
            <div style={{ ...PANE_STYLE, marginTop: 4 }}>
              {mode === "rendered" && row.html ? (
                row.before.trim() ? <CmsBody html={row.before} /> : <EmptyValue />
              ) : row.before ? (
                row.html ? stripHtmlForDiff(row.before) : row.before
              ) : (
                <EmptyValue />
              )}
            </div>
          </section>
        )
      )}

      {hiddenCount > 0 && hasCurrent ? (
        <div style={{ fontSize: 11, color: "#888" }}>
          {hiddenCount} other field{hiddenCount === 1 ? "" : "s"} hidden (unchanged or outside this field).
        </div>
      ) : null}
    </div>
  );
}

/**
 * Fetches the CURRENT entity (existing authorized GET endpoints) and renders the compare view.
 * Read-only — never writes.
 */
export function RevisionCompareLoader({
  revision,
  focusField = null,
  onCurrentLoaded,
}: {
  revision: CompareRevisionInfo;
  focusField?: string | null;
  onCurrentLoaded?: (result: CurrentFetchResult) => void;
}) {
  const [state, setState] = useState<{ loading: boolean; result: CurrentFetchResult | null }>({
    loading: true,
    result: null,
  });
  const cbRef = useRef(onCurrentLoaded);
  useEffect(() => {
    cbRef.current = onCurrentLoaded;
  });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, result: null });
    void fetchCurrentForRevision(revision.entity_type, revision.entity_id, revision.snapshot).then((result) => {
      if (cancelled) return; // stale response for a previous revision
      setState({ loading: false, result });
      cbRef.current?.(result);
    });
    return () => {
      cancelled = true;
    };
  }, [revision.id, revision.entity_type, revision.entity_id, revision.snapshot]);

  const result = state.result;
  return (
    <RevisionCompareView
      entityType={revision.entity_type}
      revisionSnapshot={revision.snapshot}
      currentSnapshot={result && result.ok ? result.snapshot : null}
      currentLoading={state.loading}
      currentError={result && !result.ok ? result.error : ""}
      revisionLabel={revisionCompareLabel(revision)}
      focusField={focusField}
    />
  );
}
