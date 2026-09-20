"use client";

import { useCallback, useEffect, useState } from "react";
import {
  formatBytes,
  formatDimensions,
  mediaLibraryUploadPurposes,
  mediaPurposesForRole,
  type MediaLibraryPurpose,
} from "@/lib/mediaLibrary";
import type { AdminRoleName } from "@/lib/adminPermissions";

type MediaAsset = {
  id: number;
  url: string;
  provider: string;
  purpose: string;
  original_name?: string | null;
  bytes?: number | null;
  width?: number | null;
  height?: number | null;
  created_at?: string;
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
          height: 140,
          background: "#F3F0FF",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#5B21B6",
          fontSize: 32,
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
      style={{ width: "100%", height: 140, objectFit: "cover", display: "block", background: "#F5F5F5" }}
    />
  );
}

export default function MediaLibraryPanel({ role }: { role: AdminRoleName }) {
  const viewPurposes = mediaPurposesForRole(role);
  const uploadPurposes = mediaLibraryUploadPurposes(role);

  const [q, setQ] = useState("");
  const [purpose, setPurpose] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<MediaAsset[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadPurpose, setUploadPurpose] = useState(uploadPurposes[0] || "blog");
  const [msg, setMsg] = useState("");
  const [copyFlash, setCopyFlash] = useState<number | null>(null);

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

        const r = await fetch(`/api/admin-media?${params}`, { credentials: "include" });
        if (r.status === 401) {
          setError("Session expired — please sign in again.");
          return;
        }
        if (r.status === 403) {
          setError("You do not have permission to view this media.");
          return;
        }
        const data = await r.json();
        setItems(Array.isArray(data.items) ? data.items : []);
        setTotal(Number(data.pagination?.total || 0));
        setTotalPages(Number(data.pagination?.totalPages || 1));
        setPage(Number(data.pagination?.page || pageNum));
      } catch {
        setError("Failed to load media library");
      } finally {
        setLoading(false);
      }
    },
    [q, purpose]
  );

  useEffect(() => {
    load(1);
  }, [load]);

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
      setMsg("✅ Media uploaded");
      await load(1);
    } catch {
      setMsg("❌ Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const emptyNoMedia = !loading && total === 0 && !q && !purpose;
  const emptyFiltered = !loading && items.length === 0 && !!(q || purpose);

  return (
    <div>
      <div className="section-card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 200px" }}>
            <label style={{ display: "block", fontSize: 11, color: "#888", marginBottom: 4 }}>Search</label>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filename, URL, public id…"
              style={{ width: "100%", padding: "9px 12px", border: "1px solid #E5E5E5", borderRadius: 8, fontSize: 13 }}
              onKeyDown={(e) => {
                if (e.key === "Enter") load(1);
              }}
            />
          </div>
          <div style={{ flex: "0 1 160px" }}>
            <label style={{ display: "block", fontSize: 11, color: "#888", marginBottom: 4 }}>Purpose</label>
            <select
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              style={{ width: "100%", padding: "9px 12px", border: "1px solid #E5E5E5", borderRadius: 8, fontSize: 13, background: "#fff" }}
            >
              <option value="">All allowed</option>
              {viewPurposes.map((p) => (
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
              marginTop: 14,
              paddingTop: 14,
              borderTop: "1px solid #E5E5E5",
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600, color: "#333" }}>Upload Media</span>
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
              {uploading ? "Uploading…" : "Choose file"}
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
            {msg && (
              <span style={{ fontSize: 12, color: msg.startsWith("✅") ? "#16A34A" : "#DC2626" }}>{msg}</span>
            )}
          </div>
        )}
      </div>

      {error && (
        <div
          style={{
            marginBottom: 12,
            padding: "10px 14px",
            background: "rgba(255,68,68,0.08)",
            border: "1px solid rgba(255,68,68,0.2)",
            borderRadius: 8,
            color: "#DC2626",
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ fontSize: 12, color: "#888", marginBottom: 10 }}>
        {total} asset{total === 1 ? "" : "s"} · page {page} of {totalPages}
      </div>

      {emptyNoMedia && (
        <div className="section-card" style={{ textAlign: "center", padding: "48px 20px" }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🖼️</div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>No media uploaded yet</div>
          <div style={{ fontSize: 13, color: "#666" }}>
            Upload JPEG, PNG, WEBP, or GIF images to build your reusable CMS library.
          </div>
        </div>
      )}

      {emptyFiltered && (
        <div className="section-card" style={{ textAlign: "center", padding: "40px 20px" }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>No media matches your filters</div>
          <div style={{ fontSize: 13, color: "#666" }}>Clear search or pick another purpose.</div>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: 14,
        }}
      >
        {items.map((asset) => (
          <div
            key={asset.id}
            className="section-card"
            style={{ padding: 0, overflow: "hidden", margin: 0 }}
          >
            <Thumb url={asset.url} alt={asset.original_name || "media"} />
            <div style={{ padding: 12 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  marginBottom: 6,
                }}
                title={asset.original_name || asset.url}
              >
                {asset.original_name || "Untitled image"}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                <span
                  style={{
                    fontSize: 10,
                    background: "rgba(91,33,182,0.12)",
                    color: "#5B21B6",
                    padding: "2px 7px",
                    borderRadius: 4,
                    fontWeight: 600,
                  }}
                >
                  {PURPOSE_LABELS[asset.purpose] || asset.purpose}
                </span>
                <span style={{ fontSize: 10, color: "#888" }}>{asset.provider}</span>
              </div>
              <div style={{ fontSize: 11, color: "#888", marginBottom: 10, lineHeight: 1.5 }}>
                {formatDimensions(asset.width, asset.height)}
                <br />
                {formatBytes(asset.bytes)}
                {asset.created_at ? (
                  <>
                    <br />
                    {new Date(asset.created_at).toLocaleString()}
                  </>
                ) : null}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                <button
                  type="button"
                  className="action-btn btn-view"
                  style={{ padding: "6px 10px", fontSize: 12 }}
                  onClick={() => {
                    navigator.clipboard?.writeText(asset.url).then(() => {
                      setCopyFlash(asset.id);
                      setTimeout(() => setCopyFlash(null), 1200);
                    }).catch(() => {});
                  }}
                >
                  {copyFlash === asset.id ? "Copied" : "Copy URL"}
                </button>
                <a
                  href={asset.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="action-btn btn-edit"
                  style={{ padding: "6px 10px", fontSize: 12, textDecoration: "none" }}
                >
                  Open
                </a>
              </div>
            </div>
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 18, alignItems: "center" }}>
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
            Page {page} of {totalPages}
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
  );
}
