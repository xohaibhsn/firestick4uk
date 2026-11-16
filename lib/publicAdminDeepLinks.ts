/**
 * Pure helpers for public → /sidhu deep links and field panels.
 * No network, no content values — labels/keys and path mapping only.
 */

import { ADMIN_CONTENT_SECTIONS } from "@/lib/adminContentFields";
import { INLINE_APPEARS_ON, cmsAppearsOnMap } from "@/lib/cmsAppearsOn";
import { CMS_PAGES_OVERVIEW } from "@/lib/cmsPagesOverview";

export type DeepLinkField = { key: string; label: string };

export type OpenDeepLinkTarget =
  | { kind: "content_page"; editPage: string; overviewId?: string }
  | { kind: "product_slug"; slug: string }
  | { kind: "blog_slug"; slug: string }
  | { kind: "blog_tab" }
  | { kind: "overview_unknown" };

const FIELD_KEY_RE = /^[a-z0-9_]{1,80}$/;

/** Validate ?field= key. */
export function isValidDeepLinkFieldKey(key: string): boolean {
  return FIELD_KEY_RE.test(String(key || ""));
}

/**
 * Validate ?open= path: starts with "/", length ≤ 200, no "//", no scheme.
 */
export function isValidDeepLinkPath(path: string): boolean {
  const p = String(path || "");
  if (!p.startsWith("/")) return false;
  if (p.length > 200) return false;
  if (p.includes("//")) return false;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(p)) return false;
  if (/^(javascript|data|vbscript):/i.test(p)) return false;
  return true;
}

/** Normalize pathname (strip query/hash; collapse trailing slash except root). */
export function normalizePublicPath(input: string): string {
  let p = String(input || "").trim();
  try {
    if (p.includes("://")) {
      const u = new URL(p);
      p = u.pathname || "/";
    }
  } catch {
    /* keep raw */
  }
  const q = p.indexOf("?");
  if (q >= 0) p = p.slice(0, q);
  const h = p.indexOf("#");
  if (h >= 0) p = p.slice(0, h);
  if (!p.startsWith("/")) p = "/" + p;
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p || "/";
}

/** Exact path → Content Editor page (Pages overview). */
const EXACT_PATH_TO_EDIT: Record<string, { editPage: string; overviewId?: string }> = {
  "/": { editPage: "home", overviewId: "home" },
  "/products": { editPage: "products", overviewId: "products_listing" },
  "/about": { editPage: "about", overviewId: "about" },
  "/faq": { editPage: "faq", overviewId: "faq" },
  "/contact": { editPage: "contact", overviewId: "contact" },
  "/iptv-subscriptions-uk": { editPage: "subscription", overviewId: "subscription" },
  "/seasonal-offers": { editPage: "home", overviewId: "seasonal" },
  "/order-tracking": { editPage: "tracking", overviewId: "tracking" },
  "/cart": { editPage: "cart", overviewId: "cart" },
  "/blog": { editPage: "blog", overviewId: undefined },
  "/privacy-policy": { editPage: "legal", overviewId: "legal" },
  "/terms": { editPage: "legal", overviewId: "legal" },
  "/terms-and-conditions": { editPage: "legal", overviewId: "legal" },
  "/refund-policy": { editPage: "legal", overviewId: "legal" },
  "/refund": { editPage: "legal", overviewId: "legal" },
};

/**
 * Map a public path to a /sidhu open target.
 * Caller must validate with isValidDeepLinkPath first.
 */
export function resolveOpenDeepLink(pathRaw: string): OpenDeepLinkTarget {
  const path = normalizePublicPath(pathRaw);
  const exact = EXACT_PATH_TO_EDIT[path];
  if (exact) {
    return {
      kind: "content_page",
      editPage: exact.editPage,
      overviewId: exact.overviewId,
    };
  }

  const productMatch = path.match(/^\/products\/([^/]+)$/);
  if (productMatch) {
    return { kind: "product_slug", slug: decodeURIComponent(productMatch[1]) };
  }

  const blogMatch = path.match(/^\/blog\/([^/]+)$/);
  if (blogMatch) {
    return { kind: "blog_slug", slug: decodeURIComponent(blogMatch[1]) };
  }

  return { kind: "overview_unknown" };
}

/** Page label → content editor page key (for fields panel). */
const PAGE_LABEL_TO_EDIT: Record<string, string> = {
  Home: "home",
  About: "about",
  Contact: "contact",
  FAQ: "faq",
  Footer: "footer",
  Products: "products",
  "Cart / Checkout": "cart",
  "Order tracking": "tracking",
  Blog: "blog",
  Legal: "legal",
  Global: "global",
  Subscriptions: "subscription",
  "Seasonal offers": "seasonal",
  "Site Settings": "settings",
};

function editPageForPublicPath(path: string): string | null {
  const exact = EXACT_PATH_TO_EDIT[path];
  if (exact) return exact.editPage;
  if (/^\/products\/[^/]+$/.test(path)) return "products";
  if (/^\/blog\/[^/]+$/.test(path)) return "blog";
  // Match overview cards by href
  for (const card of CMS_PAGES_OVERVIEW) {
    if (normalizePublicPath(card.href) === path) return card.editPage;
  }
  return null;
}

/**
 * Static field list for "Fields on this page" (labels + keys only, max 60).
 * Uses ADMIN_CONTENT_SECTIONS + INLINE_APPEARS_ON / cmsAppearsOn — no content fetch.
 */
export function fieldsForPublicPath(pathRaw: string, max = 60): DeepLinkField[] {
  const path = normalizePublicPath(pathRaw);
  const editPage = editPageForPublicPath(path);
  const out: DeepLinkField[] = [];
  const seen = new Set<string>();

  const push = (key: string, label: string) => {
    if (seen.has(key) || out.length >= max) return;
    seen.add(key);
    out.push({ key, label });
  };

  if (editPage && ADMIN_CONTENT_SECTIONS[editPage]) {
    for (const section of ADMIN_CONTENT_SECTIONS[editPage]) {
      for (const f of section.fields) {
        push(f.key, f.label);
        if (out.length >= max) return out;
      }
    }
  }

  // Inline appears-on keys for the same page label
  const wantLabels = new Set<string>();
  if (editPage === "home") wantLabels.add("Home");
  if (editPage === "about") wantLabels.add("About");
  if (editPage === "subscription") wantLabels.add("Subscriptions");
  if (editPage === "products") wantLabels.add("Products");
  if (editPage === "seasonal" || (editPage === "home" && path === "/seasonal-offers")) {
    wantLabels.add("Home");
    wantLabels.add("Seasonal offers");
  }

  for (const [key, meta] of Object.entries(INLINE_APPEARS_ON)) {
    if (wantLabels.has(meta.pageLabel)) {
      // Prefer a readable label from the key when no section field label
      const label = key
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
      push(key, label);
      if (out.length >= max) return out;
    }
  }

  // Fallback: filter cmsAppearsOn by page label match to edit page
  if (out.length === 0 && editPage) {
    const map = cmsAppearsOnMap();
    for (const [key, meta] of map) {
      if (PAGE_LABEL_TO_EDIT[meta.pageLabel] === editPage) {
        push(key, key.replace(/_/g, " "));
        if (out.length >= max) break;
      }
    }
  }

  return out;
}

/** Re-export for tests / bar panel search. */
export { EXACT_PATH_TO_EDIT };
