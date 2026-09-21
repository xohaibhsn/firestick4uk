"use client";

import { useCallback, useEffect, useState } from "react";
import type { AdminRoleName } from "@/lib/adminPermissions";
import { revisionEntityTypesForRole } from "@/lib/contentRevisionsClient";

type RevisionItem = {
  id: number;
  entity_type: string;
  entity_id: string;
  entity_label: string | null;
  revision_action: string;
  changed_fields: string[];
  actor_name: string;
  actor_role: string;
  created_at: string;
};

type Props = {
  role: AdminRoleName;
  /** Optional filter when opened from an editor */
  initialEntityType?: string;
  initialEntityId?: string;
  embedded?: boolean;
};

const ACTION_LABELS: Record<string, string> = {
  update: "Update",
  delete: "Delete",
  restore: "Restore",
};

function canOfferRestore(item: RevisionItem, role: AdminRoleName): boolean {
  if (item.revision_action === "delete") {
    return item.entity_type === "site_content" || item.entity_type === "site_settings";
  }
  if (item.entity_type === "site_settings" && role !== "super_admin") return false;
  if (item.entity_type === "section" && role !== "super_admin") return false;
  if (item.entity_type === "product" || item.entity_type === "blog") {
    return role === "super_admin" || role === "manager" || (item.entity_type === "blog" && role === "writer");
  }
  if (item.entity_type === "site_content" || item.entity_type === "site_content_batch") {
    return role === "super_admin" || role === "manager";
  }
  return role === "super_admin";
}

export default function ContentHistoryPanel({
  role,
  initialEntityType = "",
  initialEntityId = "",
  embedded = false,
}: Props) {
  const allowedTypes = revisionEntityTypesForRole(role);
  const [entityType, setEntityType] = useState(initialEntityType);
  const [entityId, setEntityId] = useState(initialEntityId);
  const [action, setAction] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<RevisionItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [viewItem, setViewItem] = useState<any>(null);
  const [confirmRestore, setConfirmRestore] = useState<RevisionItem | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (pageNum = 1) => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          page: String(pageNum),
          limit: "25",
        });
        if (entityType) params.set("entity_type", entityType);
        if (entityId) params.set("entity_id", entityId);
        if (action) params.set("action", action);
        if (q.trim()) params.set("q", q.trim());
        const r = await fetch(`/api/admin-revisions?${params}`, { credentials: "include" });
        if (r.status === 401) {
          setError("Session expired");
          return;
        }
        if (r.status === 403) {
          setError("Permission denied");
          return;
        }
        const data = await r.json();
        setItems(Array.isArray(data.items) ? data.items : []);
        setTotal(Number(data.pagination?.total || 0));
        setTotalPages(Number(data.pagination?.totalPages || 1));
        setPage(Number(data.pagination?.page || pageNum));
      } catch {
        setError("Failed to load history");
      } finally {
        setLoading(false);
      }
    },
    [entityType, entityId, action, q]
  );

  useEffect(() => {
    load(1);
  }, [load]);

  const openView = async (id: number) => {
    setBusy(true);
    try {
      const r = await fetch(`/api/admin-revisions?id=${id}`, { credentials: "include" });
      const data = await r.json();
      if (!r.ok) {
        setMsg(`❌ ${data.error || "Failed to load revision"}`);
        return;
      }
      setViewItem(data);
    } catch {
      setMsg("❌ Failed to load revision");
    } finally {
      setBusy(false);
    }
  };

  const doRestore = async () => {
    if (!confirmRestore) return;
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/admin-revisions/restore", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision_id: confirmRestore.id }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMsg(`❌ ${data.error || "Restore failed"}`);
        return;
      }
      setMsg("✅ Version restored. Current state was saved to History first.");
      setConfirmRestore(null);
      setViewItem(null);
      await load(page);
    } catch {
      setMsg("❌ Restore failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {!embedded && (
        <div className="section-card" style={{ padding: 20, marginBottom: 16 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
            <div style={{ flex: "1 1 160px" }}>
              <label style={{ display: "block", fontSize: 11, color: "#888", marginBottom: 4 }}>Search label</label>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Entity name…"
                style={{ width: "100%", padding: "9px 12px", border: "1px solid #E5E5E5", borderRadius: 8, fontSize: 13 }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") load(1);
                }}
              />
            </div>
            <div style={{ flex: "0 1 150px" }}>
              <label style={{ display: "block", fontSize: 11, color: "#888", marginBottom: 4 }}>Entity type</label>
              <select
                value={entityType}
                onChange={(e) => setEntityType(e.target.value)}
                style={{ width: "100%", padding: "9px 12px", border: "1px solid #E5E5E5", borderRadius: 8, fontSize: 13, background: "#fff" }}
              >
                <option value="">All allowed</option>
                {allowedTypes.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: "0 1 130px" }}>
              <label style={{ display: "block", fontSize: 11, color: "#888", marginBottom: 4 }}>Action</label>
              <select
                value={action}
                onChange={(e) => setAction(e.target.value)}
                style={{ width: "100%", padding: "9px 12px", border: "1px solid #E5E5E5", borderRadius: 8, fontSize: 13, background: "#fff" }}
              >
                <option value="">All</option>
                <option value="update">Update</option>
                <option value="delete">Delete</option>
                <option value="restore">Restore</option>
              </select>
            </div>
            <div style={{ flex: "0 1 140px" }}>
              <label style={{ display: "block", fontSize: 11, color: "#888", marginBottom: 4 }}>Entity ID</label>
              <input
                value={entityId}
                onChange={(e) => setEntityId(e.target.value)}
                placeholder="Optional id/key"
                style={{ width: "100%", padding: "9px 12px", border: "1px solid #E5E5E5", borderRadius: 8, fontSize: 13 }}
              />
            </div>
            <button type="button" className="add-btn" onClick={() => load(1)} disabled={loading}>
              {loading ? "Loading…" : "Apply"}
            </button>
            <button type="button" className="action-btn btn-view" onClick={() => load(page)} disabled={loading}>
              Refresh
            </button>
          </div>
        </div>
      )}

      {embedded && (
        <div style={{ marginBottom: 12, display: "flex", gap: 8 }}>
          <button type="button" className="action-btn btn-view" onClick={() => load(page)} disabled={loading}>
            Refresh
          </button>
        </div>
      )}

      {msg && (
        <div
          style={{
            marginBottom: 12,
            padding: "10px 14px",
            borderRadius: 8,
            fontSize: 13,
            background: msg.startsWith("✅") ? "rgba(22,163,74,0.08)" : "rgba(220,38,38,0.08)",
            color: msg.startsWith("✅") ? "#16A34A" : "#DC2626",
          }}
        >
          {msg}
        </div>
      )}
      {error && <div style={{ marginBottom: 12, color: "#DC2626", fontSize: 13 }}>{error}</div>}

      <div style={{ fontSize: 12, color: "#888", marginBottom: 10 }}>
        {total} revision{total === 1 ? "" : "s"} · page {page} of {totalPages}
      </div>

      <div className="section-card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Entity</th>
                <th>Name</th>
                <th>Action</th>
                <th>Changed</th>
                <th>Actor</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: 28, color: "#888" }}>
                    No revisions yet. History starts when CMS content is updated.
                  </td>
                </tr>
              )}
              {items.map((item) => (
                <tr key={item.id}>
                  <td style={{ whiteSpace: "nowrap", fontSize: 12 }}>
                    {item.created_at ? new Date(item.created_at).toLocaleString() : "—"}
                  </td>
                  <td>
                    <span style={{ fontSize: 11, background: "#F5F3FF", color: "#5B21B6", padding: "2px 7px", borderRadius: 4 }}>
                      {item.entity_type}
                    </span>
                    <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{item.entity_id}</div>
                  </td>
                  <td style={{ fontWeight: 600 }}>{item.entity_label || "—"}</td>
                  <td>
                    {ACTION_LABELS[item.revision_action] || item.revision_action}
                    {item.revision_action === "delete" &&
                      (item.entity_type === "product" || item.entity_type === "blog") && (
                        <div style={{ fontSize: 10, color: "#B45309" }}>Deleted snapshot</div>
                      )}
                  </td>
                  <td style={{ fontSize: 11, maxWidth: 180 }}>
                    {(item.changed_fields || []).slice(0, 6).join(", ") || "—"}
                    {(item.changed_fields || []).length > 6 ? "…" : ""}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {item.actor_name}
                    <div style={{ color: "#888", fontSize: 10 }}>{item.actor_role}</div>
                  </td>
                  <td>
                    <button type="button" className="action-btn btn-view" onClick={() => openView(item.id)} disabled={busy}>
                      View
                    </button>
                    {canOfferRestore(item, role) && (
                      <button
                        type="button"
                        className="action-btn btn-edit"
                        onClick={() => setConfirmRestore(item)}
                        disabled={busy}
                      >
                        Restore
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 16, alignItems: "center" }}>
          <button type="button" className="action-btn btn-view" disabled={page <= 1 || loading} onClick={() => load(page - 1)}>
            ← Prev
          </button>
          <span style={{ fontSize: 12, color: "#666" }}>
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            className="action-btn btn-view"
            disabled={page >= totalPages || loading}
            onClick={() => load(page + 1)}
          >
            Next →
          </button>
        </div>
      )}

      {viewItem && (
        <div className="modal-overlay" style={{ zIndex: 1300 }} onClick={() => setViewItem(null)}>
          <div
            className="modal"
            style={{ maxWidth: 720, width: "95%", maxHeight: "90vh", overflow: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-title">Revision #{viewItem.id}</div>
            <div style={{ fontSize: 13, color: "#444", marginBottom: 12, lineHeight: 1.6 }}>
              <div><strong>Entity:</strong> {viewItem.entity_type} / {viewItem.entity_id}</div>
              <div><strong>Label:</strong> {viewItem.entity_label || "—"}</div>
              <div><strong>Action:</strong> {viewItem.revision_action}</div>
              <div><strong>Actor:</strong> {viewItem.actor_name} ({viewItem.actor_role})</div>
              <div><strong>When:</strong> {viewItem.created_at ? new Date(viewItem.created_at).toLocaleString() : "—"}</div>
              <div><strong>Changed:</strong> {(viewItem.changed_fields || []).join(", ") || "—"}</div>
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Snapshot (escaped text)</div>
            <pre
              style={{
                background: "#F8F8F8",
                border: "1px solid #E5E5E5",
                borderRadius: 8,
                padding: 12,
                fontSize: 11,
                maxHeight: 360,
                overflow: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {typeof viewItem.snapshot === "string"
                ? viewItem.snapshot
                : JSON.stringify(viewItem.snapshot, null, 2)}
            </pre>
            <div className="modal-actions">
              <button type="button" className="modal-cancel" onClick={() => setViewItem(null)}>Close</button>
              {canOfferRestore(
                {
                  id: viewItem.id,
                  entity_type: viewItem.entity_type,
                  entity_id: viewItem.entity_id,
                  entity_label: viewItem.entity_label,
                  revision_action: viewItem.revision_action,
                  changed_fields: viewItem.changed_fields || [],
                  actor_name: viewItem.actor_name,
                  actor_role: viewItem.actor_role,
                  created_at: viewItem.created_at,
                },
                role
              ) && (
                <button
                  type="button"
                  className="modal-save"
                  onClick={() =>
                    setConfirmRestore({
                      id: viewItem.id,
                      entity_type: viewItem.entity_type,
                      entity_id: viewItem.entity_id,
                      entity_label: viewItem.entity_label,
                      revision_action: viewItem.revision_action,
                      changed_fields: viewItem.changed_fields || [],
                      actor_name: viewItem.actor_name,
                      actor_role: viewItem.actor_role,
                      created_at: viewItem.created_at,
                    })
                  }
                >
                  Restore this version
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {confirmRestore && (
        <div className="modal-overlay" style={{ zIndex: 1400 }} onClick={() => setConfirmRestore(null)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Confirm restore</div>
            <p style={{ fontSize: 14, color: "#333", lineHeight: 1.55, marginBottom: 16 }}>
              You are about to restore an older version of{" "}
              <strong>{confirmRestore.entity_label || confirmRestore.entity_id}</strong>.
              <br />
              <br />
              The current version will be saved to History first, so this restore can be undone.
            </p>
            <div className="modal-actions">
              <button type="button" className="modal-cancel" onClick={() => setConfirmRestore(null)} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="modal-save" onClick={doRestore} disabled={busy}>
                {busy ? "Restoring…" : "Restore this version"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
