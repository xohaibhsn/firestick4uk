"use client";

/**
 * Public-site admin edit bar (admins only). Read-only chrome — never POSTs content.
 * Loaded only via PublicAdminBarStub after f4uk_ah=1 hint is present.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  clearAdminHintCookie,
  hasAdminHintCookie,
} from "@/lib/adminHintCookie";
import {
  hasAdminPermission,
  type AdminPermission,
  type AdminRoleName,
} from "@/lib/adminPermissions";
import { fieldsForPublicPath } from "@/lib/publicAdminDeepLinks";

const COLLAPSE_KEY = "f4uk_admin_bar_collapsed";

type SessionRes = {
  authenticated?: boolean;
  role?: string;
  name?: string;
};

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCollapsed(v: boolean): void {
  try {
    window.localStorage.setItem(COLLAPSE_KEY, v ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function can(
  role: AdminRoleName | null,
  permission: AdminPermission
): boolean {
  if (!role) return false;
  return hasAdminPermission(role, permission);
}

export default function PublicAdminBar() {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [role, setRole] = useState<AdminRoleName | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [fieldQuery, setFieldQuery] = useState("");
  const [bottomOffset, setBottomOffset] = useState(16);
  const [pathname, setPathname] = useState("/");

  // Hide on /sidhu, cms_preview, iframe (defense in depth; stub also gates)
  const blocked = useMemo(() => {
    if (typeof window === "undefined") return true;
    const path = window.location.pathname || "/";
    if (path === "/sidhu" || path.startsWith("/sidhu/")) return true;
    try {
      if (new URLSearchParams(window.location.search).get("cms_preview") === "1") {
        return true;
      }
    } catch {
      /* ignore */
    }
    try {
      if (window.self !== window.top) return true;
    } catch {
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    if (blocked) return;
    setPathname(window.location.pathname || "/");
    setCollapsed(readCollapsed());

    let cancelled = false;
    (async () => {
      try {
        const res = (await fetch("/api/admin-session", {
          credentials: "include",
          cache: "no-store",
        }).then((r) => r.json())) as SessionRes;
        if (cancelled) return;
        if (!res?.authenticated) {
          clearAdminHintCookie();
          setAuthed(false);
          setReady(true);
          return;
        }
        const r = (res.role || "super_admin") as AdminRoleName;
        setRole(r);
        setAuthed(true);
        setReady(true);
      } catch {
        if (!cancelled) {
          clearAdminHintCookie();
          setAuthed(false);
          setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [blocked]);

  // Offset above mini-cart / consent (same markers as WhatsApp float)
  useEffect(() => {
    if (!authed || blocked) return;
    const sync = () => {
      const mini =
        document.body.classList.contains("minicart-bar-visible") ||
        document.documentElement.getAttribute("data-minicart-bar") === "1";
      const consent =
        document.body.classList.contains("consent-banner-visible") ||
        document.documentElement.getAttribute("data-consent-banner") === "1";
      let bottom = 16;
      if (consent) bottom = Math.max(bottom, 120);
      if (mini) bottom = Math.max(bottom, 88);
      setBottomOffset(bottom);
    };
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-minicart-bar", "data-consent-banner"],
    });
    return () => obs.disconnect();
  }, [authed, blocked]);

  const fields = useMemo(
    () => fieldsForPublicPath(pathname, 60),
    [pathname]
  );

  const filteredFields = useMemo(() => {
    const q = fieldQuery.trim().toLowerCase();
    if (!q) return fields;
    return fields.filter(
      (f) =>
        f.key.toLowerCase().includes(q) || f.label.toLowerCase().includes(q)
    );
  }, [fields, fieldQuery]);

  const toggleCollapse = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      writeCollapsed(next);
      if (next) setFieldsOpen(false);
      return next;
    });
  }, []);

  const openSidhu = useCallback((query?: string) => {
    const url = query ? `/sidhu?${query}` : "/sidhu";
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  if (blocked || !ready || !authed) return null;
  if (!hasAdminHintCookie()) return null;

  const showContent = can(role, "content.manage") || can(role, "settings.manage");
  const showProducts = can(role, "products.manage") || can(role, "products.view");
  const showBlog = can(role, "blog.manage");
  const showEdit =
    showContent ||
    showProducts ||
    showBlog ||
    can(role, "page_builder.manage");

  if (!showEdit && !showContent) return null;

  if (collapsed) {
    return (
      <button
        type="button"
        className="f4uk-pab-fab"
        style={{ bottom: bottomOffset }}
        aria-label="Show admin edit bar"
        title="Show admin edit bar"
        onClick={toggleCollapse}
      >
        ✏️
        <style>{FAB_CSS}</style>
      </button>
    );
  }

  return (
    <div
      className="f4uk-pab"
      style={{ bottom: bottomOffset }}
      role="region"
      aria-label="Admin edit bar"
      data-testid="public-admin-bar"
    >
      <style>{BAR_CSS}</style>
      <div className="f4uk-pab-row">
        {showEdit && (
          <button
            type="button"
            className="f4uk-pab-btn"
            aria-label="Edit this page"
            onClick={() =>
              openSidhu(`open=${encodeURIComponent(pathname || "/")}`)
            }
          >
            ✏️ Edit this page
          </button>
        )}
        {showContent && (
          <button
            type="button"
            className="f4uk-pab-btn"
            aria-label="Fields on this page"
            aria-expanded={fieldsOpen}
            onClick={() => setFieldsOpen((v) => !v)}
          >
            Fields on this page
          </button>
        )}
        <a
          className="f4uk-pab-btn f4uk-pab-link"
          href="/sidhu"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open CMS"
        >
          Open CMS
        </a>
        <button
          type="button"
          className="f4uk-pab-btn f4uk-pab-mute"
          aria-label="Hide bar"
          onClick={toggleCollapse}
        >
          Hide bar
        </button>
      </div>
      {fieldsOpen && showContent && (
        <div className="f4uk-pab-panel" data-testid="public-admin-fields">
          <input
            type="search"
            className="f4uk-pab-search"
            placeholder="Search fields…"
            value={fieldQuery}
            onChange={(e) => setFieldQuery(e.target.value)}
            aria-label="Search CMS fields on this page"
          />
          <ul className="f4uk-pab-list">
            {filteredFields.length === 0 && (
              <li className="f4uk-pab-empty">No fields mapped</li>
            )}
            {filteredFields.map((f) => (
              <li key={f.key}>
                <button
                  type="button"
                  className="f4uk-pab-field"
                  onClick={() =>
                    openSidhu(`field=${encodeURIComponent(f.key)}`)
                  }
                >
                  <span className="f4uk-pab-field-label">{f.label}</span>
                  <span className="f4uk-pab-field-key">{f.key}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const BAR_CSS = `
.f4uk-pab{
  position:fixed;left:12px;z-index:9996;
  max-width:min(420px,calc(100vw - 24px));
  background:#111827;color:#f9fafb;
  border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.28);
  font:500 12px/1.35 system-ui,-apple-system,Segoe UI,sans-serif;
  padding:8px 10px;
}
.f4uk-pab-row{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.f4uk-pab-btn{
  appearance:none;border:1px solid #374151;background:#1f2937;color:#f9fafb;
  border-radius:6px;padding:6px 8px;cursor:pointer;font:inherit
}
.f4uk-pab-btn:hover{background:#374151}
.f4uk-pab-link{text-decoration:none;display:inline-block}
.f4uk-pab-mute{opacity:.85}
.f4uk-pab-panel{margin-top:8px;border-top:1px solid #374151;padding-top:8px}
.f4uk-pab-search{
  width:100%;box-sizing:border-box;margin-bottom:6px;
  border:1px solid #4b5563;border-radius:6px;background:#0b1220;color:#f9fafb;
  padding:6px 8px;font:inherit
}
.f4uk-pab-list{list-style:none;margin:0;padding:0;max-height:220px;overflow:auto}
.f4uk-pab-field{
  width:100%;text-align:left;appearance:none;border:0;background:transparent;
  color:#f9fafb;padding:6px 4px;cursor:pointer;font:inherit;
  display:flex;flex-direction:column;gap:2px;border-radius:4px
}
.f4uk-pab-field:hover{background:#1f2937}
.f4uk-pab-field-label{font-weight:600}
.f4uk-pab-field-key{opacity:.7;font-size:11px}
.f4uk-pab-empty{opacity:.7;padding:6px 4px}
`;

const FAB_CSS = `
.f4uk-pab-fab{
  position:fixed;left:12px;z-index:9996;
  width:44px;height:44px;border-radius:50%;
  border:1px solid #374151;background:#111827;color:#f9fafb;
  box-shadow:0 8px 24px rgba(0,0,0,.28);cursor:pointer;font-size:18px;
}
`;
