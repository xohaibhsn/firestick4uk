/**
 * Admin-only "Find text" helpers for /sidhu Content Editor.
 * Never returns payment/bank values or credential field snippets.
 */

import {
  ADMIN_CONTENT_SECTIONS,
  type AdminField,
} from "@/lib/adminContentFields";
import { getCmsAppearsOn } from "@/lib/cmsAppearsOn";

export type CmsFindHit = {
  key: string;
  page: string;
  section: string;
  label: string;
  /** Snippet with match; empty for contact_* (label-only). */
  snippet: string;
  matchIn: "value" | "label" | "key" | "product";
};

const VIEW_ON_SITE: Record<string, { label: string; href: string }> = {
  home: { label: "View on site", href: "/" },
  products: { label: "View on site", href: "/products" },
  about: { label: "View on site", href: "/about" },
  contact: { label: "View on site", href: "/contact" },
  faq: { label: "View on site", href: "/faq" },
  subscription: { label: "View on site", href: "/iptv-subscriptions-uk" },
  seasonal: { label: "View on site", href: "/seasonal-offers" },
  tracking: { label: "View on site", href: "/order-tracking" },
  cart: { label: "View on site", href: "/cart" },
  blog: { label: "View on site", href: "/blog" },
  footer: { label: "View on site", href: "/" },
  legal: { label: "View on site", href: "/privacy-policy" },
  global: { label: "View on site", href: "/" },
};

/** Sample product detail for "View on site" from Products section. */
export const CMS_VIEW_PRODUCT_SAMPLE = "/products/firestick-4k";

export function cmsViewOnSiteForPage(page: string): { label: string; href: string } | null {
  if (page === "products") {
    return { label: "View on site", href: CMS_VIEW_PRODUCT_SAMPLE };
  }
  return VIEW_ON_SITE[page] || null;
}

export function isCmsFindSensitiveKey(key: string): boolean {
  const k = String(key || "").toLowerCase();
  if (k.startsWith("bank_")) return true;
  if (k.startsWith("payment_") && !k.includes("label") && !k.includes("enabled")) {
    // payment_* values (not toggle labels) — treat value as sensitive
    return true;
  }
  if (/_password$|_secret$|_token$|_key$/.test(k)) return true;
  // Bank account data fields (already bank_*) covered; also ads labels stay searchable by label
  return false;
}

/** payment_* value keys whose values must never appear in snippets. */
export function isCmsFindHideValueKey(key: string): boolean {
  const k = String(key || "").toLowerCase();
  if (k.startsWith("bank_")) return true;
  if (k.startsWith("payment_")) return true;
  if (/_password$|_secret$|_token$|_key$/.test(k)) return true;
  if (k.startsWith("contact_") && /phone|email|whatsapp|telegram|address/.test(k)) {
    return true; // label only for contact coordinates
  }
  return false;
}

export function isCmsFindLabelOnlyKey(key: string): boolean {
  return String(key || "").toLowerCase().startsWith("contact_");
}

type FieldMeta = { key: string; label: string; page: string; section: string };

function collectFieldMeta(): FieldMeta[] {
  const out: FieldMeta[] = [];
  for (const [page, sections] of Object.entries(ADMIN_CONTENT_SECTIONS)) {
    for (const section of sections) {
      for (const field of section.fields as AdminField[]) {
        out.push({
          key: field.key,
          label: field.label,
          page,
          section: section.title,
        });
      }
    }
  }
  // Common sidhu-inline home fields (not all in ADMIN_CONTENT_SECTIONS)
  const inline: Array<[string, string, string]> = [
    ["home_top_hero_title", "Top Hero Title", "home"],
    ["home_top_hero_subtitle", "Top Hero Subtitle", "home"],
    ["home_hero_title", "Main Hero Title", "home"],
    ["home_hero_subtitle", "Main Hero Subtitle", "home"],
    ["home_hero_btn_text", "Primary Button Text", "home"],
    ["about_title", "Page Title", "about"],
    ["about_description", "Main Description", "about"],
    ["about_mission", "Mission Statement", "about"],
  ];
  for (const [key, label, page] of inline) {
    if (!out.some((f) => f.key === key)) {
      out.push({ key, label, page, section: "Page content" });
    }
  }
  return out;
}

const APPEARS_PAGE_TO_EDIT: Record<string, string> = {
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
  "Seasonal offers": "home",
  "Site Settings": "settings",
};

/** Exact key lookup for Find-text Go / deep links (null if unknown). */
export function lookupCmsFieldByKey(key: string): FieldMeta | null {
  const k = String(key || "").trim();
  if (!k) return null;
  const meta = collectFieldMeta();
  const hit = meta.find((m) => m.key === k);
  if (hit) return hit;
  const appears = getCmsAppearsOn(k);
  if (!appears) return null;
  const page = APPEARS_PAGE_TO_EDIT[appears.pageLabel];
  if (!page || page === "settings") return null;
  return {
    key: k,
    label: k.replace(/_/g, " "),
    page,
    section: appears.sectionLabel,
  };
}

function highlightSnippet(value: string, q: string): string {
  const raw = String(value || "").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();
  const qi = lower.indexOf(q);
  if (qi < 0) {
    return raw.length > 80 ? raw.slice(0, 77) + "…" : raw;
  }
  const start = Math.max(0, qi - 24);
  const end = Math.min(raw.length, qi + q.length + 40);
  let snip = raw.slice(start, end);
  if (start > 0) snip = "…" + snip;
  if (end < raw.length) snip = snip + "…";
  // Wrap match for display (caller may render as HTML-escaped + mark)
  const re = new RegExp(
    `(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
    "ig"
  );
  return snip.replace(re, "⟦$1⟧");
}

export function searchCmsContent(opts: {
  query: string;
  siteContent: Record<string, string>;
  productNames?: Array<{ id: number | string; name: string }>;
  max?: number;
}): CmsFindHit[] {
  const q = String(opts.query || "").trim().toLowerCase();
  if (!q) return [];
  const max = opts.max ?? 50;
  const hits: CmsFindHit[] = [];
  const meta = collectFieldMeta();
  const byKey = new Map(meta.map((m) => [m.key, m]));

  // Search known editor fields first
  for (const m of meta) {
    if (hits.length >= max) break;
    if (isCmsFindSensitiveKey(m.key) && !m.key.startsWith("contact_")) {
      // Still allow label/key match for bank_* but never value snippet
    }
    const value = String(opts.siteContent[m.key] ?? "");
    const labelHit = m.label.toLowerCase().includes(q);
    const keyHit = m.key.toLowerCase().includes(q);
    const valueHit =
      !isCmsFindHideValueKey(m.key) && value.toLowerCase().includes(q);

    if (!labelHit && !keyHit && !valueHit) continue;

    let snippet = "";
    let matchIn: CmsFindHit["matchIn"] = "label";
    if (isCmsFindLabelOnlyKey(m.key) || isCmsFindHideValueKey(m.key)) {
      snippet = "";
      matchIn = labelHit ? "label" : "key";
    } else if (valueHit) {
      snippet = highlightSnippet(value, q);
      matchIn = "value";
    } else if (labelHit) {
      snippet = highlightSnippet(m.label, q);
      matchIn = "label";
    } else {
      snippet = m.key;
      matchIn = "key";
    }

    hits.push({
      key: m.key,
      page: m.page,
      section: m.section,
      label: m.label,
      snippet,
      matchIn,
    });
  }

  // Also scan other loaded site_content keys (not in field meta) by key/value
  if (hits.length < max) {
    for (const [key, raw] of Object.entries(opts.siteContent)) {
      if (hits.length >= max) break;
      if (byKey.has(key)) continue;
      if (isCmsFindSensitiveKey(key) || isCmsFindHideValueKey(key)) {
        // label-only: key name match only
        if (key.toLowerCase().includes(q) && key.startsWith("contact_")) {
          hits.push({
            key,
            page: "contact",
            section: "Contact",
            label: key,
            snippet: "",
            matchIn: "key",
          });
        }
        continue;
      }
      const value = String(raw ?? "");
      const keyHit = key.toLowerCase().includes(q);
      const valueHit = value.toLowerCase().includes(q);
      if (!keyHit && !valueHit) continue;
      hits.push({
        key,
        page: guessPage(key),
        section: "Site content",
        label: key,
        snippet: valueHit ? highlightSnippet(value, q) : key,
        matchIn: valueHit ? "value" : "key",
      });
    }
  }

  // Product names
  if (opts.productNames && hits.length < max) {
    for (const p of opts.productNames) {
      if (hits.length >= max) break;
      const name = String(p.name || "");
      if (!name.toLowerCase().includes(q)) continue;
      hits.push({
        key: `product:${p.id}`,
        page: "products",
        section: "Products catalogue",
        label: name,
        snippet: highlightSnippet(name, q),
        matchIn: "product",
      });
    }
  }

  return hits.slice(0, max);
}

function guessPage(key: string): string {
  const prefixes: Array<[string, string]> = [
    ["home_", "home"],
    ["about_", "about"],
    ["contact_", "contact"],
    ["faq_", "faq"],
    ["products_", "products"],
    ["pd_", "products"],
    ["cart_", "cart"],
    ["bank_", "cart"],
    ["success_", "cart"],
    ["checkout_", "cart"],
    ["track_", "tracking"],
    ["blog_", "blog"],
    ["footer_", "footer"],
    ["nav_", "global"],
    ["subscription_", "subscription"],
    ["privacy_", "legal"],
    ["terms_", "legal"],
    ["refund_", "legal"],
  ];
  for (const [p, page] of prefixes) {
    if (key.startsWith(p)) return page;
  }
  return "global";
}

export function escapeCmsFindHtml(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatCmsFindSnippetHtml(snippet: string): string {
  const esc = escapeCmsFindHtml(snippet);
  return esc
    .replace(/⟦/g, "<mark>")
    .replace(/⟧/g, "</mark>");
}
