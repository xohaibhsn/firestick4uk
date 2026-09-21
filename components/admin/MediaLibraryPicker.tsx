"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  formatBytes,
  formatDimensions,
  mediaLibraryUploadPurposes,
  type MediaLibraryPurpose,
} from "@/lib/mediaLibrary";
import type { AdminRoleName } from "@/lib/adminPermissions";

export type MediaAsset = {
  id: number;
  url: string;
  public_id?: string | null;
  provider: string;
  purpose: string;
  original_name?: string | null;
  mime_type?: string | null;
  format?: string | null;
  bytes?: number | null;
  width?: number | null;
  height?: number | null;
  created_at?: string;
};

type Props = {
  open: boolean;
  role: AdminRoleName;
  /** Restrict picker purposes further (intersection with role-allowed). */
  allowedPurposes?: MediaLibraryPurpose[];
  onSelect: (asset: MediaAsset) => void;
  onClose: () => void;
  title?: string;
};

const PURPOSE_LABELS: Record<string, string> = {
  blog: "Blog",
  products: "Products",
  logo: "Logo",
  og: "Default OG",
  whatsapp: "WhatsApp Icon",
  hero: "Hero Slide",
  favicon: "Favicon",
};

const PURPOSE_FOLDERS: Record<string, string> = {
  blog: "firestick4uk/blog",
  products: "firestick4uk/products",
  logo: "firestick4uk/logo",
  og: "firestick4uk/og",
  whatsapp: "firestick4uk/whatsapp-icon",
  hero: "firestick4uk/hero-slides",
};

function Thumb({ url, alt }: { url: string; alt: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <div
        style={{
          width: "100%",
          height: 120,
          background: "#F3F0FF",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#5B21B6",
          fontSize: 28,
        }}
      >
        🖼️
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      onError={() => setBroken(true)}
      style={{ width: "100%", height: 120, objectFit: "cover", display: "block", background: "#F5F5F5" }}
    />
  );
}

export default function MediaLibraryPicker({
  open,
  role,
  allowedPurposes,
  onSelect,
  onClose,
  title = "Choose from Library",
}: Props) {
  // Contextual pickers: only allow uploads into the intersection of role + allowedPurposes
  const uploadPurposes = useMemo(() => {
    const roleOnes = mediaLibraryUploadPurposes(role);
    if (allowedPurposes?.length) {
      return roleOnes.filter((p) => allowedPurposes.includes(p));
    }
    return roleOnes;
  }, [role, allowedPurposes]);

  const [q, setQ] = useState("");
  const [purpose, setPurpose] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<MediaAsset[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadPurpose, setUploadPurpose] = useState<MediaLibraryPurpose>("blog");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (uploadPurposes.length === 0) return;
    if (!uploadPurposes.includes(uploadPurpose)) {
      setUploadPurpose(uploadPurposes[0]);
    }
  }, [uploadPurposes, uploadPurpose]);

  const load = useCallback(
    async (pageNum = 1) => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          page: String(pageNum),
          limit: "24",
        });
        if (q.trim()) params.set("q", q.trim());
        if (purpose) params.set("purpose", purpose);
        else if (allowedPurposes?.length === 1) params.set("purpose", allowedPurposes[0]);

        const r = await fetch(`/api/admin-media?${params}`, { credentials: "include" });
        if (r.status === 401) {
          setError("Session expired");
          return;
        }
        if (r.status === 403) {
          setError("Permission denied");
          return;
        }
        const data = await r.json();
        let list: MediaAsset[] = Array.isArray(data.items) ? data.items : [];
        if (allowedPurposes?.length) {
          const set = new Set(allowedPurposes);
          list = list.filter((a) => set.has(a.purpose as MediaLibraryPurpose));
        }
        setItems(list);
        setTotal(Number(data.pagination?.total || 0));
        setTotalPages(Number(data.pagination?.totalPages || 1));
        setPage(Number(data.pagination?.page || pageNum));
      } catch {
        setError("Failed to load media");
      } finally {
        setLoading(false);
      }
    },
    [q, purpose, allowedPurposes]
  );

  useEffect(() => {
    if (open) {
      setMsg("");
      load(1);
    }
  }, [open, load]);

  if (!open) return null;

  const purposeOptions = (allowedPurposes?.length
    ? allowedPurposes
    : role === "super_admin"
      ? (["blog", "products", "logo", "og", "whatsapp", "hero", "favicon"] as MediaLibraryPurpose[])
      : uploadPurposes.includes("products")
        ? (["blog", "products"] as MediaLibraryPurpose[])
        : (["blog"] as MediaLibraryPurpose[])
  );

  const handleUpload = async (file: File) => {
    if (!uploadPurpose || !PURPOSE_FOLDERS[uploadPurpose]) return;
    setUploading(true);
    setMsg("");
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const r = await fetch("/api/upload", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file: base64,
          name: file.name,
          folder: PURPOSE_FOLDERS[uploadPurpose],
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMsg(`❌ ${data.error || data.message || "Upload failed"}`);
        return;
      }
      setMsg("✅ Uploaded");
      await load(1);
    } catch {
      setMsg("❌ Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const emptyNoMedia = !loading && total === 0 && !q && !purpose;
  const emptyFiltered = !loading && items.length === 0 && (q || purpose);

  return (
    <div
      className="modal-overlay"
      style={{ zIndex: 1200 }}
      onClick={onClose}
    >
      <div
        className="modal"
        style={{ maxWidth: 920, width: "95%", maxHeight: "90vh", overflow: "auto" }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div className="modal-title" style={{ margin: 0 }}>{title}</div>
          <button type="button" className="modal-cancel" onClick={onClose}>Close</button>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 14, alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 180px" }}>
            <label style={{ display: "block", fontSize: 11, color: "#888", marginBottom: 4 }}>Search</label>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filename, URL…"
              style={{ width: "100%", padding: "9px 12px", border: "1px solid #E5E5E5", borderRadius: 8, fontSize: 13 }}
              onKeyDown={(e) => {
                if (e.key === "Enter") load(1);
              }}
            />
          </div>
          <div style={{ flex: "0 1 150px" }}>
            <label style={{ display: "block", fontSize: 11, color: "#888", marginBottom: 4 }}>Purpose</label>
            <select
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              style={{ width: "100%", padding: "9px 12px", border: "1px solid #E5E5E5", borderRadius: 8, fontSize: 13, background: "#fff" }}
            >
              <option value="">All allowed</option>
              {purposeOptions.map((p) => (
                <option key={p} value={p}>{PURPOSE_LABELS[p] || p}</option>
              ))}
            </select>
          </div>
          <button type="button" className="add-btn" onClick={() => load(1)} disabled={loading}>
            {loading ? "Loading…" : "Search"}
          </button>
          <button type="button" className="action-btn btn-view" onClick={() => load(page)} disabled={loading}>
            Refresh
          </button>
        </div>

        {uploadPurposes.length > 0 && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              alignItems: "center",
              marginBottom: 14,
              padding: 12,
              background: "#F8F5FF",
              border: "1px solid #EDE7FF",
              borderRadius: 10,
            }}
          >
            <select
              value={uploadPurpose}
              onChange={(e) => setUploadPurpose(e.target.value as MediaLibraryPurpose)}
              style={{ padding: "8px 10px", border: "1px solid #E5E5E5", borderRadius: 8, fontSize: 13, background: "#fff" }}
            >
              {uploadPurposes.map((p) => (
                <option key={p} value={p}>{PURPOSE_LABELS[p] || p}</option>
              ))}
            </select>
            <label
              style={{
                cursor: uploading ? "wait" : "pointer",
                background: "#5B21B6",
                color: "#fff",
                padding: "8px 14px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {uploading ? "Uploading…" : "Upload Media"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                style={{ display: "none" }}
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload(f);
                  e.target.value = "";
                }}
              />
            </label>
            {msg && <span style={{ fontSize: 12, color: msg.startsWith("✅") ? "#16A34A" : "#DC2626" }}>{msg}</span>}
          </div>
        )}

        {error && (
          <div style={{ marginBottom: 12, color: "#DC2626", fontSize: 13 }}>{error}</div>
        )}

        {emptyNoMedia && (
          <div style={{ textAlign: "center", padding: "40px 16px", color: "#666" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🖼️</div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>No media uploaded yet</div>
            <div style={{ fontSize: 13 }}>Upload an image above to start your library.</div>
          </div>
        )}

        {emptyFiltered && (
          <div style={{ textAlign: "center", padding: "40px 16px", color: "#666" }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>No media matches your filters</div>
            <div style={{ fontSize: 13 }}>Try a different search or purpose.</div>
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: 12,
          }}
        >
          {items.map((asset) => (
            <div
              key={asset.id}
              style={{
                border: "1px solid #E5E5E5",
                borderRadius: 10,
                overflow: "hidden",
                background: "#fff",
              }}
            >
              <Thumb url={asset.url} alt={asset.original_name || "media"} />
              <div style={{ padding: 10 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    marginBottom: 4,
                  }}
                  title={asset.original_name || asset.url}
                >
                  {asset.original_name || "Untitled image"}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
                  <span
                    style={{
                      fontSize: 10,
                      background: "rgba(91,33,182,0.12)",
                      color: "#5B21B6",
                      padding: "2px 6px",
                      borderRadius: 4,
                      fontWeight: 600,
                    }}
                  >
                    {PURPOSE_LABELS[asset.purpose] || asset.purpose}
                  </span>
                  <span style={{ fontSize: 10, color: "#888" }}>{asset.provider}</span>
                </div>
                <div style={{ fontSize: 11, color: "#888", marginBottom: 8 }}>
                  {formatDimensions(asset.width, asset.height)} · {formatBytes(asset.bytes)}
                  {asset.created_at ? (
                    <>
                      <br />
                      {new Date(asset.created_at).toLocaleDateString()}
                    </>
                  ) : null}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  <button
                    type="button"
                    className="modal-save"
                    style={{ padding: "6px 10px", fontSize: 12 }}
                    onClick={() => onSelect(asset)}
                  >
                    Use / Select
                  </button>
                  <button
                    type="button"
                    className="action-btn btn-view"
                    style={{ padding: "6px 8px", fontSize: 11 }}
                    onClick={() => {
                      navigator.clipboard?.writeText(asset.url).catch(() => {});
                    }}
                  >
                    Copy URL
                  </button>
                  <a
                    href={asset.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="action-btn btn-view"
                    style={{ padding: "6px 8px", fontSize: 11, textDecoration: "none" }}
                  >
                    Open
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>

        {totalPages > 1 && (
          <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 16, alignItems: "center" }}>
            <button
              type="button"
              className="action-btn btn-view"
              disabled={page <= 1 || loading}
              onClick={() => load(page - 1)}
              style={{ opacity: page <= 1 ? 0.4 : 1 }}
            >
              ← Prev
            </button>
            <span style={{ fontSize: 12, color: "#666" }}>
              Page {page} of {totalPages} · {total} items
            </span>
            <button
              type="button"
              className="action-btn btn-view"
              disabled={page >= totalPages || loading}
              onClick={() => load(page + 1)}
              style={{ opacity: page >= totalPages ? 0.4 : 1 }}
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
