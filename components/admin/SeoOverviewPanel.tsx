"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import type { AdminRoleName, SidhuTab } from "@/lib/adminPermissions";
import { hasAdminPermission } from "@/lib/adminPermissions";

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
  verificationQueue?: Array<{ url: string; label: string; note: string }>;
  orderTracking?: Record<string, unknown>;
};

type Props = {
  role: AdminRoleName;
  onNavigate: (tab: SidhuTab) => void;
  getRoleHeaders: () => Record<string, string>;
};

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
  if (flag === "OK" || flag === "Auto") {
    return { ...base, background: "#DCFCE7", color: "#166534" };
  }
  if (flag === "Missing" || flag === "Inactive" || flag === "Draft") {
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
      }
    } catch {
      setError("Failed to load SEO overview");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [getRoleHeaders]);

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

      {Array.isArray(data?.verificationQueue) && data.verificationQueue.length > 0 && (
        <div className="section-card" style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>
            Google Search Console Verification
          </div>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 12 }}>
            Not connected to Google. Each URL must be verified manually in GSC.
            No indexed / clicks / impressions status is shown.
          </div>
          <table className="data-table" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Label</th>
                <th>URL</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {data.verificationQueue.map((item) => (
                <tr key={item.url}>
                  <td>{item.label}</td>
                  <td style={{ fontSize: 11, wordBreak: "break-all" }}>{item.url}</td>
                  <td>
                    <span style={badgeStyle("Review")}>Verify in GSC</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
