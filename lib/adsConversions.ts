/**
 * Consent-gated Google Ads conversion + GA4 purchase/lead helpers (client-only).
 * Labels come from CMS (ads_conv_label_*). Never sends PII.
 */

import { GOOGLE_ADS_ID, readTrackingConsent } from "./trackingConsent";

export const ADS_CONV_LABEL_PURCHASE_KEY = "ads_conv_label_purchase";
export const ADS_CONV_LABEL_WHATSAPP_KEY = "ads_conv_label_whatsapp";

/** Label part only after AW-…/ — alphanumeric, underscore, hyphen; 6–64 chars. */
export const ADS_CONV_LABEL_PATTERN = /^[A-Za-z0-9_-]{6,64}$/;

export type AdsConvLabels = {
  purchase: string;
  whatsapp: string;
};

export type PurchaseItemInput = {
  item_id?: string;
  item_name?: string;
  price?: number;
  quantity?: number;
};

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

/** Module cache of latest CMS map (updated by AdsConversionTracking). */
let cachedContentMap: Record<string, string> = {};

export function setAdsConversionContentMap(
  map: Record<string, string> | null | undefined
): void {
  cachedContentMap = map && typeof map === "object" ? { ...map } : {};
}

export function isValidAdsConvLabel(raw: unknown): boolean {
  const v = String(raw ?? "").trim();
  if (!v) return false;
  // Reject full send_to / tag prefixes accidentally pasted into CMS.
  if (v.includes("/") || /^AW-/i.test(v)) return false;
  return ADS_CONV_LABEL_PATTERN.test(v);
}

export function normalizeAdsConvLabel(raw: unknown): string {
  const v = String(raw ?? "").trim();
  return isValidAdsConvLabel(v) ? v : "";
}

export function getAdsLabels(
  map?: Record<string, string> | null
): AdsConvLabels {
  const m = map && typeof map === "object" ? map : cachedContentMap;
  return {
    purchase: normalizeAdsConvLabel(m[ADS_CONV_LABEL_PURCHASE_KEY]),
    whatsapp: normalizeAdsConvLabel(m[ADS_CONV_LABEL_WHATSAPP_KEY]),
  };
}

export function isSidhuPath(pathname?: string): boolean {
  const p =
    pathname != null
      ? String(pathname)
      : typeof window !== "undefined"
        ? window.location.pathname || ""
        : "";
  return p === "/sidhu" || p.startsWith("/sidhu/");
}

export function isWhatsAppHref(href: string, baseHref?: string): boolean {
  const raw = String(href || "").trim();
  if (!raw) return false;
  if (/^whatsapp:/i.test(raw)) return true;
  try {
    const base =
      baseHref ||
      (typeof window !== "undefined"
        ? window.location.href
        : "https://firestick4uk.com/");
    const u = new URL(raw, base);
    const host = u.hostname.toLowerCase();
    return (
      host === "wa.me" ||
      host === "api.whatsapp.com" ||
      host === "web.whatsapp.com"
    );
  } catch {
    return false;
  }
}

/**
 * Per-channel purchase guards (sessionStorage).
 *
 * - Ads: `ads_purchase_fired_<orderId>` — set only when the Ads conversion fires.
 * - GA4: `ga4_purchase_fired_<orderId>` — set only when the GA4 purchase fires.
 *
 * Backward compatibility: the legacy key name `ads_purchase_fired_*` is kept as
 * the Ads-channel guard. Pre-MULTI-89 code set that same key when *either*
 * channel fired; we still treat a present legacy key as "Ads already fired"
 * (conservative: may skip one late Ads conversion in a stale same-tab session).
 * New code never sets `ads_purchase_fired_*` unless the Ads branch actually fires.
 */
function adsPurchaseGuardKey(orderId: string): string {
  return `ads_purchase_fired_${orderId}`;
}

function ga4PurchaseGuardKey(orderId: string): string {
  return `ga4_purchase_fired_${orderId}`;
}

function hasSessionGuard(key: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    return !!window.sessionStorage.getItem(key);
  } catch {
    return true;
  }
}

function setSessionGuard(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, "1");
  } catch {
    /* ignore */
  }
}

function sanitizePurchaseItems(
  items: PurchaseItemInput[] | undefined
): Array<{
  item_id: string;
  item_name: string;
  price: number;
  quantity: number;
}> | undefined {
  if (!Array.isArray(items) || !items.length) return undefined;
  const out: Array<{
    item_id: string;
    item_name: string;
    price: number;
    quantity: number;
  }> = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const item_id = String(raw.item_id ?? "").trim();
    const item_name = String(raw.item_name ?? "").trim();
    const price = Number(raw.price);
    const quantity = Number(raw.quantity);
    if (!item_id && !item_name) continue;
    if (!Number.isFinite(price) || !Number.isFinite(quantity)) continue;
    out.push({
      item_id: item_id || item_name,
      item_name: item_name || item_id,
      price,
      quantity,
    });
  }
  return out.length ? out : undefined;
}

/**
 * Fire Google Ads conversion and/or GA4 purchase per channel, at most once each
 * per orderId. Channels are independent: GA4 firing must not block a later Ads
 * conversion when the purchase label arrives in the same page view.
 * No-ops on /sidhu, missing gtag/consent/label (Ads), or when that channel already fired.
 */
export function firePurchase(opts: {
  orderId: string;
  value: number;
  currency?: string;
  items?: PurchaseItemInput[];
  contentMap?: Record<string, string> | null;
}): void {
  if (typeof window === "undefined") return;
  if (isSidhuPath()) return;

  const orderId = String(opts.orderId || "").trim();
  if (!orderId) return;

  const value = Number(opts.value);
  if (!Number.isFinite(value)) return;
  const currency = String(opts.currency || "GBP");

  const pref = readTrackingConsent();
  const labels = getAdsLabels(opts.contentMap);
  const gtagOk = typeof window.gtag === "function";

  const adsKey = adsPurchaseGuardKey(orderId);
  const ga4Key = ga4PurchaseGuardKey(orderId);
  const adsAlready = hasSessionGuard(adsKey);
  const ga4Already = hasSessionGuard(ga4Key);

  if (adsAlready && ga4Already) return;

  if (!adsAlready && pref?.advertising && gtagOk && labels.purchase) {
    window.gtag!("event", "conversion", {
      send_to: `${GOOGLE_ADS_ID}/${labels.purchase}`,
      value,
      currency,
      transaction_id: orderId,
    });
    setSessionGuard(adsKey);
  }

  if (!ga4Already && pref?.analytics && gtagOk) {
    const payload: Record<string, unknown> = {
      transaction_id: orderId,
      value,
      currency,
    };
    const items = sanitizePurchaseItems(opts.items);
    if (items) payload.items = items;
    window.gtag!("event", "purchase", payload);
    setSessionGuard(ga4Key);
  }
}

/**
 * Fire WhatsApp conversion + GA4 generate_lead.
 * No value on Ads conversion; transport_type beacon.
 */
export function fireWhatsAppClick(
  source: string,
  contentMap?: Record<string, string> | null
): void {
  if (typeof window === "undefined") return;
  if (isSidhuPath()) return;

  const pref = readTrackingConsent();
  const labels = getAdsLabels(contentMap);
  const gtagOk = typeof window.gtag === "function";

  if (pref?.advertising && gtagOk && labels.whatsapp) {
    window.gtag!("event", "conversion", {
      send_to: `${GOOGLE_ADS_ID}/${labels.whatsapp}`,
      transport_type: "beacon",
    });
  }

  if (pref?.analytics && gtagOk) {
    window.gtag!("event", "generate_lead", {
      method: "whatsapp",
      source: String(source || ""),
    });
  }
}

/** Pure: closest-anchor WhatsApp click detection (no preventDefault). */
export function resolveWhatsAppClickTarget(
  target: EventTarget | null
): HTMLAnchorElement | null {
  if (!target || typeof (target as Node).nodeType !== "number") return null;
  let el: Element | null =
    (target as Node).nodeType === 1
      ? (target as Element)
      : (target as Node).parentElement;
  while (el) {
    if (el.tagName === "A") {
      const a = el as HTMLAnchorElement;
      const href = a.getAttribute("href") || a.href || "";
      if (isWhatsAppHref(href)) return a;
      return null;
    }
    el = el.parentElement;
  }
  return null;
}
