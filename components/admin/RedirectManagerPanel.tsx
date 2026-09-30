"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AdminRoleName } from "@/lib/adminPermissions";
import { hasAdminPermission } from "@/lib/adminPermissions";
import { URL_REDIRECT_TYPE_V1 } from "@/lib/urlRedirects";

export type RedirectRow = {
  id: number;
  source_path: string;
  destination_path: string;
  redirect_type: number;
  active: 0 | 1;
  created_at?: string | Date | null;
  updated_at?: string | Date | null;
};

type AdminApiResult = { ok: boolean; status: number; data: any };

type Props = {
  role: AdminRoleName;
  adminApi: (url: string, init?: RequestInit) => Promise<AdminApiResult>;
};

type FormState = {
  id: number | null;
  source_path: string;
  destination_path: string;
  redirect_type: number;
  active: 0 | 1;
};

const EMPTY_FORM: FormState = {
  id: null,
  source_path: "",
  destination_path: "",
  redirect_type: URL_REDIRECT_TYPE_V1,
  active: 1,
};

function formatUpdated(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Lightweight UX-only checks — server validation remains authoritative. */
export function clientValidateRedirectPaths(
  sourceRaw: string,
  destRaw: string
): string | null {
  const source = String(sourceRaw || "").trim();
  const dest = String(destRaw || "").trim();
  if (!source) return "Source path is required";
  if (!dest) return "Destination path is required";
  if (/^[a-z][a-z0-9+.-]*:/i.test(source) || /^\/\//.test(source)) {
    return "Source must be an internal path, not an absolute URL";
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(dest) || /^\/\//.test(dest)) {
    return "Destination must be an internal path, not an absolute URL";
  }
  if (source.includes("?") || source.includes("#")) {
    return "Source path must not include a query string or fragment";
  }
  if (dest.includes("?") || dest.includes("#")) {
    return "Destination path must not include a query string or fragment";
  }
  if (source.toLowerCase() === dest.toLowerCase()) {
    return "Source and destination must be different";
  }
  return null;
}

function safeError(data: any, fallback: string): string {
  const msg = String(data?.error || data?.message || "").trim();
  if (!msg) return fallback;
  if (/stack|exception|errno|sql/i.test(msg) && msg.length > 180) return fallback;
  return msg;
}

export default function RedirectManagerPanel({ role, adminApi }: Props) {
  const canManage = hasAdminPermission(role, "redirects.manage");
  const adminApiRef = useRef(adminApi);
  useEffect(() => {
    adminApiRef.current = adminApi;
  }, [adminApi]);
  const [rows, setRows] = useState<RedirectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [modal, setModal] = useState<"new" | "edit" | null>(null);
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    if (!canManage) {
      setLoading(false);
      setRows([]);
      return;
    }
    setLoading(true);
    const res = await adminApiRef.current("/api/admin-redirects");
    if (res.ok && Array.isArray(res.data)) {
      setRows(res.data as RedirectRow[]);
    } else if (res.status !== 401 && res.status !== 403) {
      setMsg("❌ " + safeError(res.data, `Failed to load redirects (HTTP ${res.status || "error"})`));
      setRows([]);
    }
    setLoading(false);
  }, [canManage]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!canManage) return null;

  const openNew = () => {
    setForm(EMPTY_FORM);
    setFormError("");
    setModal("new");
  };

  const openEdit = (row: RedirectRow) => {
    setForm({
      id: row.id,
      source_path: row.source_path,
      destination_path: row.destination_path,
      redirect_type: URL_REDIRECT_TYPE_V1,
      active: Number(row.active) === 1 ? 1 : 0,
    });
    setFormError("");
    setModal("edit");
  };

  const save = async () => {
    const clientErr = clientValidateRedirectPaths(form.source_path, form.destination_path);
    if (clientErr) {
      setFormError(clientErr);
      return;
    }
    setBusy(true);
    setFormError("");
    if (modal === "new") {
      const res = await adminApiRef.current("/api/admin-redirects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_path: form.source_path.trim(),
          destination_path: form.destination_path.trim(),
          redirect_type: URL_REDIRECT_TYPE_V1,
          active: form.active,
        }),
      });
      setBusy(false);
      if (!res.ok) {
        setFormError(safeError(res.data, `Could not create redirect (HTTP ${res.status})`));
        return;
      }
      setModal(null);
      setMsg("✅ Redirect created");
      await load();
      return;
    }

    if (modal === "edit" && form.id != null) {
      const res = await adminApiRef.current("/api/admin-redirects", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: form.id,
          source_path: form.source_path.trim(),
          destination_path: form.destination_path.trim(),
          redirect_type: URL_REDIRECT_TYPE_V1,
          active: form.active,
        }),
      });
      setBusy(false);
      if (!res.ok) {
        setFormError(safeError(res.data, `Could not update redirect (HTTP ${res.status})`));
        return;
      }
      setModal(null);
      setMsg("✅ Redirect updated");
      await load();
      return;
    }
    setBusy(false);
  };

  const setActive = async (row: RedirectRow, active: 0 | 1) => {
    setBusy(true);
    const res = await adminApiRef.current("/api/admin-redirects", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id, active }),
    });
    setBusy(false);
    if (!res.ok) {
      setMsg("❌ " + safeError(res.data, `Could not ${active ? "enable" : "disable"} redirect`));
      return;
    }
    setMsg(active ? "✅ Redirect enabled" : "✅ Redirect disabled");
    await load();
  };

  const remove = async (row: RedirectRow) => {
    const okConfirm = confirm(
      `Delete redirect "${row.source_path}"?\nThis cannot be undone from Redirect Manager.`
    );
    if (!okConfirm) return;
    setBusy(true);
    const res = await adminApiRef.current(`/api/admin-redirects?id=${row.id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      setMsg("❌ " + safeError(res.data, "Could not delete redirect"));
      return;
    }
    setMsg("✅ Redirect deleted");
    await load();
  };

  return (
    <div>
      {msg && (
        <div
          style={{
            marginBottom: 16,
            padding: "10px 16px",
            background: msg.startsWith("✅") ? "rgba(22,163,74,0.1)" : "rgba(220,38,38,0.1)",
            border: `1px solid ${msg.startsWith("✅") ? "rgba(22,163,74,0.3)" : "rgba(220,38,38,0.25)"}`,
            borderRadius: 10,
            fontSize: 13,
            color: msg.startsWith("✅") ? "#16A34A" : "#DC2626",
          }}
        >
          {msg}
        </div>
      )}

      <div style={{ marginBottom: 16, maxWidth: 640 }}>
        <p style={{ fontSize: 14, color: "#444", lineHeight: 1.65, margin: 0 }}>
          Manage permanent redirects for old or moved URLs. Rules are stored here and will be
          activated by the Redirect Manager runtime.
        </p>
        <p style={{ fontSize: 12, color: "#888", margin: "8px 0 0", lineHeight: 1.5 }}>
          Runtime activation is pending.
        </p>
      </div>

      <div className="section-card">
        <div className="section-header">
          <div className="section-title">Redirects ({rows.length})</div>
          <button className="add-btn" type="button" onClick={openNew} disabled={busy}>
            + Add Redirect
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Source</th>
                <th>Destination</th>
                <th>Type</th>
                <th>Status</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", color: "#999", padding: 24 }}>
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", color: "#999", padding: 24 }}>
                    No redirects yet.
                  </td>
                </tr>
              )}
              {!loading &&
                rows.map((row) => {
                  const active = Number(row.active) === 1;
                  return (
                    <tr key={row.id}>
                      <td style={{ fontFamily: "monospace", fontSize: 12 }}>{row.source_path}</td>
                      <td style={{ fontFamily: "monospace", fontSize: 12 }}>{row.destination_path}</td>
                      <td>Permanent (308)</td>
                      <td>
                        <span
                          className="status-badge"
                          style={{
                            background: active ? "rgba(22,163,74,0.1)" : "rgba(107,114,128,0.12)",
                            border: `1px solid ${active ? "rgba(22,163,74,0.3)" : "rgba(107,114,128,0.25)"}`,
                            color: active ? "#16A34A" : "#6B7280",
                          }}
                        >
                          {active ? "Active" : "Disabled"}
                        </span>
                      </td>
                      <td>{formatUpdated(row.updated_at)}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button
                          className="action-btn btn-edit"
                          type="button"
                          disabled={busy}
                          onClick={() => openEdit(row)}
                        >
                          Edit
                        </button>
                        {active ? (
                          <button
                            className="action-btn btn-view"
                            type="button"
                            disabled={busy}
                            onClick={() => void setActive(row, 0)}
                          >
                            Disable
                          </button>
                        ) : (
                          <button
                            className="action-btn btn-verify"
                            type="button"
                            disabled={busy}
                            onClick={() => void setActive(row, 1)}
                          >
                            Enable
                          </button>
                        )}
                        <button
                          className="action-btn btn-delete"
                          type="button"
                          disabled={busy}
                          onClick={() => void remove(row)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      <p style={{ marginTop: 12, fontSize: 12, color: "#888", lineHeight: 1.5, maxWidth: 640 }}>
        Only internal paths are allowed. System/admin routes and existing code-owned migration URLs
        are protected.
      </p>

      {modal && (
        <div className="modal-overlay">
          <div
            className="modal"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-title">{modal === "new" ? "Add Redirect" : "Edit Redirect"}</div>
            {formError && (
              <div style={{ marginBottom: 10, color: "#DC2626", fontSize: 13 }}>{formError}</div>
            )}
            <div className="modal-field">
              <label>Source path *</label>
              <input
                value={form.source_path}
                onChange={(e) => setForm((f) => ({ ...f, source_path: e.target.value }))}
                placeholder="/old-page"
                autoComplete="off"
              />
            </div>
            <div className="modal-field">
              <label>Destination path *</label>
              <input
                value={form.destination_path}
                onChange={(e) => setForm((f) => ({ ...f, destination_path: e.target.value }))}
                placeholder="/new-page"
                autoComplete="off"
              />
            </div>
            <div className="modal-field">
              <label>Redirect type</label>
              <select
                value={String(URL_REDIRECT_TYPE_V1)}
                disabled
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: "1px solid #E5E5E5",
                  borderRadius: 8,
                  fontSize: 14,
                  background: "#F5F5F5",
                  color: "#111",
                }}
              >
                <option value={String(URL_REDIRECT_TYPE_V1)}>Permanent (308)</option>
              </select>
            </div>
            <div className="modal-field">
              <label>Active</label>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  fontSize: 14,
                  color: "#333",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={form.active === 1}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, active: e.target.checked ? 1 : 0 }))
                  }
                />
                Active (enabled when checked)
              </label>
            </div>
            <div className="modal-actions">
              <button
                className="modal-cancel"
                type="button"
                disabled={busy}
                onClick={() => setModal(null)}
              >
                Cancel
              </button>
              <button className="modal-save" type="button" disabled={busy} onClick={() => void save()}>
                {busy ? "Saving…" : modal === "new" ? "Create Redirect" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
