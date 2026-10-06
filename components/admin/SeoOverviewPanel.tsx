"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
} from "react";
import type { AdminRoleName, SidhuTab } from "@/lib/adminPermissions";
import { hasAdminPermission } from "@/lib/adminPermissions";

type VerificationRow = {
  url: string;
  label: string;
  group: "priority-migrations" | "core-content";
  kind: "current" | "legacy-redirect" | "content";
  expectedStatus: 200 | 308 | null;
  expectedCanonical: string | null;
  expectedTarget: string | null;
  inSitemap: boolean | null;
  note: string;
};

type GscAccountCheckRow = {
  key: string;
  label: string;
  note: string;
};

type DiagnosticIssue = {
  id: string;
  severity: "needs-attention" | "review";
  category: string;
  entityType: "product" | "blog";
  entityId: string;
  label: string;
  url: string | null;
  field: string | null;
  message: string;
  evidence: string;
  editTarget: "products" | "blog";
};

type DiagnosticsPayload = {
  summary: {
    eligibleEntities: number;
    healthyEntities: number;
    needsAttentionEntities: number;
    reviewEntities: number;
    totalIssues: number;
  };
  issues: DiagnosticIssue[];
};

type OverviewPayload = {
  permissions: {
    products: boolean;
    blog: boolean;
    content: boolean;
    settings: boolean;
    productsManage: boolean;
    blogManage: boolean;
    contentManage: boolean;
    settingsManage: boolean;
  };
  site?: Record<string, unknown>;
  products?: Array<Record<string, unknown>>;
  product8?: Record<string, unknown>;
  blog?: Array<Record<string, unknown>>;
  keyPages?: Array<Record<string, unknown>>;
  redirects?: Array<Record<string, string>>;
  sitemap?: { included: string[]; excluded: string[]; note: string };
  verificationQueue?: VerificationRow[];
  gscAccountChecks?: GscAccountCheckRow[];
  diagnostics?: DiagnosticsPayload;
  orderTracking?: Record<string, unknown>;
};

type MemoryRow = {
  issue_key: string;
  rule_code: string;
  entity_type: "product" | "blog";
  entity_id: string;
  entity_label: string | null;
  category: string;
  severity: string;
  field_name: string | null;
  status: "open" | "resolved";
  resolution_reason: "fixed" | "entity_out_of_scope" | "deleted" | null;
  first_seen_at: string;
  last_seen_at: string;
  resolved_at: string | null;
  reopened_count: number;
  occurrence_count: number;
  latest_message: string;
  latest_evidence: string;
};

type SeoAiProviderChoice = "gemini" | "openai";

type SeoAiExplanation = {
  summary: string;
  why_it_matters: string;
  recommended_action: string;
  cautions: string[];
};

type IssueExplainState = {
  status: "loading" | "ok" | "error";
  provider: SeoAiProviderChoice;
  explanation?: SeoAiExplanation;
  error?: string;
};

type Props = {
  role: AdminRoleName;
  onNavigate: (tab: SidhuTab) => void;
  getRoleHeaders: () => Record<string, string>;
};

function formatMemoryWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function resolutionLabel(reason: MemoryRow["resolution_reason"]): string {
  if (reason === "fixed") return "No longer detected";
  if (reason === "entity_out_of_scope") return "No longer in public SEO scope";
  if (reason === "deleted") return "Entity deleted";
  return "—";
}

function badgeStyle(flag: string): CSSProperties {
  const base: CSSProperties = {
    display: "inline-block",
    fontSize: 11,
    fontWeight: 600,
    padding: "2px 8px",
    borderRadius: 999,
    marginRight: 4,
    marginBottom: 2,
  };
  if (flag === "OK" || flag === "Auto" || flag === "Healthy") {
    return { ...base, background: "#DCFCE7", color: "#166534" };
  }
  if (
    flag === "Missing" ||
    flag === "Inactive" ||
    flag === "Draft" ||
    flag === "Needs attention"
  ) {
    return { ...base, background: "#FEE2E2", color: "#991B1B" };
  }
  if (flag === "Noindex" || flag === "Redirect" || flag === "Not in sitemap") {
    return { ...base, background: "#E5E7EB", color: "#374151" };
  }
  return { ...base, background: "#FEF3C7", color: "#92400E" };
}

export default function SeoOverviewPanel({
  role,
  onNavigate,
  getRoleHeaders,
}: Props) {
  const [data, setData] = useState<OverviewPayload | null>(null);
  const [memory, setMemory] = useState<MemoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [error, setError] = useState("");
  const [memoryError, setMemoryError] = useState("");
  const [reconcileMsg, setReconcileMsg] = useState("");
  const [reconciling, setReconciling] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState("");
  const [explainByIssue, setExplainByIssue] = useState<
    Record<string, IssueExplainState>
  >({});

  const explainIssue = async (
    issueId: string,
    provider: SeoAiProviderChoice
  ) => {
    setExplainByIssue((prev) => ({
      ...prev,
      [issueId]: { status: "loading", provider },
    }));
    try {
      const res = await fetch("/api/admin-seo-ai", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...getRoleHeaders(),
        },
        body: JSON.stringify({
          provider,
          task: "explain_issue",
          issueId,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setExplainByIssue((prev) => ({
          ...prev,
          [issueId]: {
            status: "error",
            provider,
            error:
              json.message ||
              json.error ||
              `HTTP ${res.status}`,
          },
        }));
        return;
      }
      setExplainByIssue((prev) => ({
        ...prev,
        [issueId]: {
          status: "ok",
          provider,
          explanation: json.explanation as SeoAiExplanation,
        },
      }));
    } catch {
      setExplainByIssue((prev) => ({
        ...prev,
        [issueId]: {
          status: "error",
          provider,
          error: "Explanation request failed.",
        },
      }));
    }
  };

  const loadMemory = useCallback(async () => {
    setMemoryLoading(true);
    setMemoryError("");
    try {
      const res = await fetch("/api/admin-seo-issues?status=all&limit=50", {
        credentials: "include",
        headers: { ...getRoleHeaders() },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMemory([]);
        setMemoryError(json.error || json.message || `HTTP ${res.status}`);
      } else {
        setMemory(Array.isArray(json.items) ? (json.items as MemoryRow[]) : []);
      }
    } catch {
      setMemory([]);
      setMemoryError("Failed to load issue memory");
    } finally {
      setMemoryLoading(false);
    }
  }, [getRoleHeaders]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin-seo-overview", {
        credentials: "include",
        headers: { ...getRoleHeaders() },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || json.message || `HTTP ${res.status}`);
        setData(null);
      } else {
        setData(json as OverviewPayload);
        // Sequential: overview first, then memory — no parallel fanout.
        await loadMemory();
      }
    } catch {
      setError("Failed to load SEO overview");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [getRoleHeaders, loadMemory]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/admin-seo-overview", {
          credentials: "include",
          headers: { ...getRoleHeaders() },
        });
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error || json.message || `HTTP ${res.status}`);
          setData(null);
        } else {
          setData(json as OverviewPayload);
          if (!cancelled) await loadMemory();
        }
      } catch {
        if (!cancelled) {
          setError("Failed to load SEO overview");
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Panel mounts only when SEO tab opens — fetch once per open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const can = (perm: Parameters<typeof hasAdminPermission>[1]) =>
    hasAdminPermission(role, perm);

  const canRecordAll = role === "super_admin";

  const recordCurrentDiagnostics = async () => {
    if (!canRecordAll || reconciling) return;
    setReconciling(true);
    setReconcileMsg("");
    try {
      const res = await fetch("/api/admin-seo-issues/reconcile", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...getRoleHeaders(),
        },
        body: JSON.stringify({ scope: "all" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setReconcileMsg(json.message || json.error || `HTTP ${res.status}`);
      } else {
        setReconcileMsg(
          `Recorded: detected ${json.detectedIssues}, opened ${json.opened}, updated ${json.updated}, reopened ${json.reopened}, resolved ${json.resolved}`
        );
        await load();
      }
    } catch {
      setReconcileMsg("Reconcile failed");
    } finally {
      setReconciling(false);
    }
  };

  const memoryByKey = new Map(memory.map((m) => [m.issue_key, m]));
  const resolvedRecent = memory
    .filter((m) => m.status === "resolved")
    .slice(0, 10);

  const copyUrl = async (url: string) => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.setAttribute("readonly", "");
        ta.style.position = "absolute";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopiedUrl(url);
      window.setTimeout(() => {
        setCopiedUrl((prev) => (prev === url ? "" : prev));
      }, 1600);
    } catch {
      setCopiedUrl("");
    }
  };

  const migrations = (data?.verificationQueue || []).filter(
    (i) => i.group === "priority-migrations"
  );
  const coreContent = (data?.verificationQueue || []).filter(
    (i) => i.group === "core-content"
  );
  const accountChecks = Array.isArray(data?.gscAccountChecks)
    ? data.gscAccountChecks
    : [];
  const showGscBlock =
    migrations.length > 0 || coreContent.length > 0 || accountChecks.length > 0;

  const renderQueueTable = (items: VerificationRow[]) => (
    <div style={{ overflowX: "auto" }}>
      <table className="data-table" style={{ width: "100%", minWidth: 720 }}>
        <thead>
          <tr>
            <th>Label</th>
            <th>URL</th>
            <th>Expected HTTP</th>
            <th>Target / Canonical</th>
            <th>Sitemap</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.url}>
              <td style={{ fontSize: 12, fontWeight: 600 }}>{item.label}</td>
              <td style={{ fontSize: 11, wordBreak: "break-all" }}>{item.url}</td>
              <td style={{ fontSize: 12 }}>
                {item.expectedStatus == null ? (
                  <span style={badgeStyle("Review")}>Review</span>
                ) : (
                  item.expectedStatus
                )}
              </td>
              <td style={{ fontSize: 11, wordBreak: "break-all" }}>
                {item.kind === "legacy-redirect" ? (
                  <>
                    <div>Redirect target: {item.expectedTarget || "—"}</div>
                    {item.expectedCanonical ? (
                      <div style={{ color: "#666", marginTop: 4 }}>
                        Canonical: {item.expectedCanonical}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <>Canonical: {item.expectedCanonical || "—"}</>
                )}
              </td>
              <td style={{ fontSize: 12 }}>
                {item.inSitemap == null ? "—" : item.inSitemap ? "Yes" : "No"}
              </td>
              <td>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                  <button
                    type="button"
                    className="action-btn btn-view"
                    onClick={() => void copyUrl(item.url)}
                  >
                    {copiedUrl === item.url ? "Copied" : "Copy URL"}
                  </button>
                  <a
                    className="action-btn btn-edit"
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ textDecoration: "none", display: "inline-block" }}
                  >
                    Open
                  </a>
                  <span style={badgeStyle("Review")}>Verify in GSC</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div>
      <div
        className="section-card"
        style={{
          marginBottom: 20,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>SEO Overview</div>
          <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
            Read-only technical state. Editing stays in existing Products, Blog,
            Content, and Settings tabs. No Google Search Console live data.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="action-btn btn-view" type="button" onClick={() => void load()} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          {can("products.manage") && (
            <button className="action-btn btn-edit" type="button" onClick={() => onNavigate("products")}>
              Open Products
            </button>
          )}
          {can("blog.manage") && (
            <button className="action-btn btn-edit" type="button" onClick={() => onNavigate("blog")}>
              Open Blog
            </button>
          )}
          {can("content.manage") && (
            <>
              <button className="action-btn btn-edit" type="button" onClick={() => onNavigate("pages")}>
                Open Content
              </button>
            </>
          )}
          {can("settings.manage") && (
            <button className="action-btn btn-edit" type="button" onClick={() => onNavigate("settings")}>
              Open Site Settings
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="section-card" style={{ marginBottom: 16, color: "#991B1B" }}>
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="section-card">Loading SEO overview…</div>
      )}

      {data?.diagnostics && (
        <div className="section-card" style={{ marginBottom: 20 }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              marginBottom: 6,
            }}
          >
            <div style={{ fontWeight: 700 }}>SEO Diagnostics</div>
            {canRecordAll ? (
              <button
                type="button"
                className="action-btn btn-edit"
                disabled={reconciling || loading}
                onClick={() => void recordCurrentDiagnostics()}
              >
                {reconciling ? "Recording…" : "Record current diagnostics"}
              </button>
            ) : null}
          </div>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 10 }}>
            Deterministic CMS checks only — not Google Search Console status or a
            ranking score. &quot;Healthy&quot; means no issue detected by this
            deterministic CMS ruleset. Issue memory is updated only by an
            explicit Record action — not by opening or refreshing this page.
          </div>
          {reconcileMsg ? (
            <div style={{ fontSize: 12, marginBottom: 10, color: "#166534" }}>
              {reconcileMsg}
            </div>
          ) : null}
          {memoryError ? (
            <div style={{ fontSize: 12, marginBottom: 10, color: "#991B1B" }}>
              Memory: {memoryError}
            </div>
          ) : null}
          {memoryLoading ? (
            <div style={{ fontSize: 12, color: "#666", marginBottom: 10 }}>
              Loading issue memory…
            </div>
          ) : null}

          {(() => {
            const s = data.diagnostics!.summary;
            const cards: Array<{ label: string; value: number; flag: string }> = [
              {
                label: "Needs attention",
                value: s.needsAttentionEntities,
                flag: "Needs attention",
              },
              { label: "Review", value: s.reviewEntities, flag: "Review" },
              { label: "Healthy", value: s.healthyEntities, flag: "Healthy" },
              { label: "Total issues", value: s.totalIssues, flag: "Review" },
            ];
            return (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 10,
                  marginBottom: 14,
                }}
              >
                {cards.map((c) => (
                  <div
                    key={c.label}
                    style={{
                      border: "1px solid #E5E7EB",
                      borderRadius: 8,
                      padding: "10px 14px",
                      minWidth: 120,
                    }}
                  >
                    <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>
                      {c.label}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 18 }}>{c.value}</span>
                      <span style={badgeStyle(c.flag)}>{c.label}</span>
                    </div>
                  </div>
                ))}
                <div
                  style={{
                    border: "1px solid #E5E7EB",
                    borderRadius: 8,
                    padding: "10px 14px",
                    minWidth: 120,
                  }}
                >
                  <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>
                    Eligible entities
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 18 }}>
                    {s.eligibleEntities}
                  </div>
                </div>
              </div>
            );
          })()}

          {data.diagnostics.issues.length === 0 ? (
            <div style={{ fontSize: 13 }}>
              <div>
                No deterministic SEO issues found in the current public
                Products/Blog scope.
              </div>
              <div style={{ color: "#666", marginTop: 8, fontSize: 12 }}>
                Google indexing and performance still require GSC verification.
              </div>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="data-table" style={{ width: "100%", minWidth: 1080 }}>
                <thead>
                  <tr>
                    <th>Severity</th>
                    <th>Type</th>
                    <th>Item</th>
                    <th>Issue</th>
                    <th>Evidence</th>
                    <th>Status</th>
                    <th>First seen</th>
                    <th>Last seen</th>
                    <th>Reopened</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.diagnostics.issues.map((issue) => {
                    const mem = memoryByKey.get(issue.id);
                    const explain = explainByIssue[issue.id];
                    const explaining = explain?.status === "loading";
                    return (
                      <Fragment key={issue.id}>
                        <tr>
                          <td>
                            <span
                              style={badgeStyle(
                                issue.severity === "needs-attention"
                                  ? "Needs attention"
                                  : "Review"
                              )}
                            >
                              {issue.severity === "needs-attention"
                                ? "Needs attention"
                                : "Review"}
                            </span>
                          </td>
                          <td style={{ fontSize: 12 }}>
                            {issue.entityType === "product" ? "Product" : "Blog"}
                          </td>
                          <td style={{ fontSize: 12 }}>
                            <div style={{ fontWeight: 600 }}>{issue.label}</div>
                            {issue.url ? (
                              <a
                                href={issue.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ fontSize: 11, wordBreak: "break-all" }}
                              >
                                Open
                              </a>
                            ) : null}
                          </td>
                          <td style={{ fontSize: 12 }}>{issue.message}</td>
                          <td style={{ fontSize: 11, color: "#555" }}>
                            {issue.evidence}
                          </td>
                          <td style={{ fontSize: 12 }}>
                            {mem
                              ? mem.status === "open"
                                ? "Open"
                                : "Resolved"
                              : "Not recorded"}
                          </td>
                          <td style={{ fontSize: 11 }}>
                            {mem ? formatMemoryWhen(mem.first_seen_at) : "—"}
                          </td>
                          <td style={{ fontSize: 11 }}>
                            {mem ? formatMemoryWhen(mem.last_seen_at) : "—"}
                          </td>
                          <td style={{ fontSize: 12 }}>
                            {mem && mem.reopened_count > 0
                              ? mem.reopened_count
                              : "—"}
                          </td>
                          <td>
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 6,
                                alignItems: "flex-start",
                              }}
                            >
                              <button
                                type="button"
                                className="action-btn btn-edit"
                                onClick={() =>
                                  onNavigate(
                                    issue.editTarget === "products"
                                      ? "products"
                                      : "blog"
                                  )
                                }
                              >
                                {issue.editTarget === "products"
                                  ? "Open Products"
                                  : "Open Blog"}
                              </button>
                              <button
                                type="button"
                                className="action-btn btn-view"
                                disabled={explaining}
                                onClick={() =>
                                  void explainIssue(issue.id, "gemini")
                                }
                              >
                                Explain with Gemini
                              </button>
                              <button
                                type="button"
                                className="action-btn btn-view"
                                disabled={explaining}
                                onClick={() =>
                                  void explainIssue(issue.id, "openai")
                                }
                              >
                                Explain with OpenAI
                              </button>
                            </div>
                          </td>
                        </tr>
                        {explain ? (
                          <tr>
                            <td
                              colSpan={10}
                              style={{
                                background: "#FAFAFA",
                                fontSize: 12,
                                color: "#333",
                              }}
                            >
                              {explain.status === "loading" ? (
                                <div>
                                  {explain.provider === "gemini"
                                    ? "Explaining with Gemini…"
                                    : "Explaining with OpenAI…"}
                                </div>
                              ) : null}
                              {explain.status === "error" ? (
                                <div style={{ color: "#991B1B" }}>
                                  {explain.error || "Explanation failed."}
                                </div>
                              ) : null}
                              {explain.status === "ok" && explain.explanation ? (
                                <div
                                  style={{
                                    display: "grid",
                                    gap: 8,
                                    maxWidth: 900,
                                  }}
                                >
                                  <div>
                                    <strong>Provider:</strong>{" "}
                                    {explain.provider === "gemini"
                                      ? "Gemini"
                                      : "OpenAI"}
                                  </div>
                                  <div>
                                    <strong>Summary:</strong>{" "}
                                    {explain.explanation.summary}
                                  </div>
                                  <div>
                                    <strong>Why it matters:</strong>{" "}
                                    {explain.explanation.why_it_matters}
                                  </div>
                                  <div>
                                    <strong>Recommended action:</strong>{" "}
                                    {explain.explanation.recommended_action}
                                  </div>
                                  {explain.explanation.cautions.length > 0 ? (
                                    <div>
                                      <strong>Cautions:</strong>
                                      <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                                        {explain.explanation.cautions.map((c) => (
                                          <li key={c}>{c}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  ) : null}
                                </div>
                              ) : null}
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ marginTop: 18 }}>
            <div style={{ fontWeight: 650, marginBottom: 8, fontSize: 13 }}>
              Recently resolved
            </div>
            {resolvedRecent.length === 0 ? (
              <div style={{ fontSize: 12, color: "#666" }}>
                No resolved diagnostic issues recorded yet.
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="data-table" style={{ width: "100%", minWidth: 720 }}>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Rule</th>
                      <th>Resolved</th>
                      <th>Reason</th>
                      <th>Reopened</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resolvedRecent.map((row) => (
                      <tr key={row.issue_key}>
                        <td style={{ fontSize: 12 }}>
                          {row.entity_label || `${row.entity_type}:${row.entity_id}`}
                        </td>
                        <td style={{ fontSize: 12 }}>{row.rule_code}</td>
                        <td style={{ fontSize: 11 }}>
                          {formatMemoryWhen(row.resolved_at)}
                        </td>
                        <td style={{ fontSize: 12 }}>
                          {resolutionLabel(row.resolution_reason)}
                        </td>
                        <td style={{ fontSize: 12 }}>{row.reopened_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {data?.site && (
        <div className="section-card" style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Site SEO</div>
          <table className="data-table" style={{ width: "100%" }}>
            <tbody>
              {Object.entries(data.site).map(([k, v]) => (
                <tr key={k}>
                  <td style={{ width: "32%", fontWeight: 600 }}>{k}</td>
                  <td style={{ wordBreak: "break-all", fontSize: 13 }}>
                    {v === null || v === undefined || v === ""
                      ? "—"
                      : String(v)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data?.product8 && (
        <div className="section-card" style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Product 8 recovery</div>
          <div style={{ fontSize: 13, marginBottom: 8 }}>
            Current:{" "}
            <code>{String(data.product8.currentUrl || "")}</code>
            {" · "}
            Sitemap: {data.product8.inSitemap ? "Yes" : "No"}
            {" · "}
            <span style={badgeStyle("Review")}>{String(data.product8.gscLabel)}</span>
          </div>
          <table className="data-table" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Legacy URL</th>
                <th>Destination</th>
                <th>Redirect</th>
              </tr>
            </thead>
            <tbody>
              {(Array.isArray(data.product8.legacy) ? data.product8.legacy : []).map(
                (row: any) => (
                  <tr key={row.fromSlug}>
                    <td style={{ wordBreak: "break-all", fontSize: 12 }}>{row.fromUrl}</td>
                    <td style={{ wordBreak: "break-all", fontSize: 12 }}>{row.toUrl}</td>
                    <td style={{ fontSize: 12 }}>{row.redirect}</td>
                  </tr>
                )
              )}
            </tbody>
          </table>
          <div style={{ fontSize: 11, color: "#666", marginTop: 8 }}>
            Redirects are hardcoded and not editable here.
          </div>
        </div>
      )}

      {Array.isArray(data?.products) && (
        <div className="section-card" style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>
            Products SEO ({data.products.length})
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="data-table" style={{ width: "100%", minWidth: 900 }}>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name / Slug</th>
                  <th>Title</th>
                  <th>Canonical</th>
                  <th>OG</th>
                  <th>Sitemap</th>
                  <th>Health</th>
                </tr>
              </thead>
              <tbody>
                {data.products.map((p) => (
                  <tr key={String(p.id)}>
                    <td>{String(p.id)}</td>
                    <td style={{ fontSize: 12 }}>
                      <div style={{ fontWeight: 600 }}>{String(p.name)}</div>
                      <code>{String(p.slug || "—")}</code>
                      {!p.active && (
                        <div>
                          <span style={badgeStyle("Inactive")}>Inactive</span>
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: 12, maxWidth: 220 }}>
                      {String(p.title || "—")}
                    </td>
                    <td style={{ fontSize: 11, wordBreak: "break-all" }}>
                      {String(p.canonical || "—")}
                    </td>
                    <td style={{ fontSize: 12 }}>{String(p.ogSource)}</td>
                    <td>{p.inSitemap ? "Yes" : "No"}</td>
                    <td>
                      {(Array.isArray(p.health) ? p.health : []).map((h: string) => (
                        <span key={h} style={badgeStyle(h)}>
                          {h}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {Array.isArray(data?.blog) && (
        <div className="section-card" style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>
            Blog SEO ({data.blog.length})
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="data-table" style={{ width: "100%", minWidth: 960 }}>
              <thead>
                <tr>
                  <th>Title / Slug</th>
                  <th>Status</th>
                  <th>Canonical health</th>
                  <th>Focus keyword</th>
                  <th>Sitemap</th>
                  <th>Health</th>
                </tr>
              </thead>
              <tbody>
                {data.blog.map((b) => (
                  <tr key={String(b.id)}>
                    <td style={{ fontSize: 12 }}>
                      <div style={{ fontWeight: 600 }}>{String(b.title)}</div>
                      <code>{String(b.slug || "—")}</code>
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {String(b.status)}
                      {!b.active ? " / inactive" : ""}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      <span style={badgeStyle(String(b.canonicalHealth))}>
                        {String(b.canonicalHealth)}
                      </span>
                      <div style={{ color: "#666", marginTop: 4 }}>
                        {String(b.canonicalDetail || "")}
                      </div>
                      <div style={{ wordBreak: "break-all", marginTop: 4 }}>
                        {String(b.effectiveCanonical || "")}
                      </div>
                    </td>
                    <td style={{ fontSize: 11 }}>
                      {String(b.focus_keyword || "—")}
                      <div style={{ color: "#666", marginTop: 4 }}>
                        {String(b.focusKeywordNote || "")}
                      </div>
                    </td>
                    <td>{b.inSitemap ? "Yes" : "No"}</td>
                    <td>
                      {(Array.isArray(b.health) ? b.health : []).map((h: string) => (
                        <span key={h} style={badgeStyle(h)}>
                          {h}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {Array.isArray(data?.keyPages) && (
        <div className="section-card" style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Key Pages</div>
          <div style={{ overflowX: "auto" }}>
            <table className="data-table" style={{ width: "100%", minWidth: 800 }}>
              <thead>
                <tr>
                  <th>Path</th>
                  <th>Index</th>
                  <th>Canonical</th>
                  <th>Sitemap</th>
                  <th>Source</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {data.keyPages.map((p) => (
                  <tr key={String(p.path)}>
                    <td>
                      <code>{String(p.path)}</code>
                    </td>
                    <td>
                      <span style={badgeStyle(String(p.indexState))}>
                        {String(p.indexState)}
                      </span>
                    </td>
                    <td style={{ fontSize: 11, wordBreak: "break-all" }}>
                      {String(p.canonical)}
                    </td>
                    <td>{p.inSitemap ? "Yes" : "No"}</td>
                    <td>{String(p.source)}</td>
                    <td style={{ fontSize: 11 }}>{String(p.note || "—")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data?.orderTracking && (
        <div className="section-card" style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Order tracking</div>
          <div style={{ fontSize: 13 }}>
            {String(data.orderTracking.url)} · Index · Self canonical · In sitemap
            · {String(data.orderTracking.note)}
          </div>
        </div>
      )}

      {Array.isArray(data?.redirects) && (
        <div className="section-card" style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>
            Redirects &amp; Canonicals (read-only)
          </div>
          <table className="data-table" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Mechanism</th>
                <th>Source</th>
                <th>Editable?</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {data.redirects.map((r, i) => (
                <tr key={i}>
                  <td>{r.mechanism}</td>
                  <td style={{ fontSize: 12 }}>{r.source}</td>
                  <td>{r.editable}</td>
                  <td style={{ fontSize: 12 }}>{r.detail || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data?.sitemap && (
        <div className="section-card" style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>
            Sitemap / Indexability
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Included</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                {data.sitemap.included.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Excluded</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                {data.sitemap.excluded.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
          </div>
          <div style={{ fontSize: 11, color: "#666", marginTop: 10 }}>
            {data.sitemap.note}
          </div>
        </div>
      )}

      {showGscBlock && (
        <div className="section-card" style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>
            Google Search Console Verification
          </div>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 14 }}>
            Not connected to Google. No live indexing / clicks / impressions status
            is shown. Technical expectations are Firestick4UK source truth only.
            Each URL must be verified manually in GSC.
          </div>

          {migrations.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>
                Priority URL Migrations
              </div>
              {renderQueueTable(migrations)}
            </div>
          )}

          {coreContent.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Core Content</div>
              {renderQueueTable(coreContent)}
            </div>
          )}

          {accountChecks.length > 0 && (
            <div>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>
                Account-Level GSC Checks
              </div>
              <div style={{ overflowX: "auto" }}>
                <table className="data-table" style={{ width: "100%" }}>
                  <thead>
                    <tr>
                      <th>Check</th>
                      <th>Instruction</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accountChecks.map((c) => (
                      <tr key={c.key}>
                        <td style={{ fontWeight: 600 }}>{c.label}</td>
                        <td style={{ fontSize: 12 }}>
                          Manual check required in Google Search Console.
                          <div style={{ color: "#666", marginTop: 4 }}>{c.note}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
