/**
 * Sidhu Insights client — pure helpers + optional runtime controller.
 * No network side effects at import time.
 *
 * Client-safe copies of ingest constants live here (do NOT import lib/insightsIngest —
 * that module pulls insightsGeo → Node `fs` into the browser bundle).
 */

import {
  CLARITY_EXCLUDED_QUERY_CONTAINS,
  CLARITY_EXCLUDED_QUERY_EQUALS,
  CLARITY_QUERY_ALLOWLIST,
} from "./clarityGating";
import { readTrackingConsent } from "./trackingConsent";

export const INSIGHTS_EXCLUDED_PATH_PREFIXES = [
  "/sidhu",
  "/api",
  "/erp",
  "/order-tracking",
] as const;

export const INSIGHTS_SEARCH_TERM_MAX = 128;

export const INSIGHTS_EVENT_TYPE_ALLOWLIST = new Set([
  "page_view",
  "scroll_depth",
  "click",
  "search",
  "error",
  "checkout_start",
  "checkout_step",
  "checkout_payment",
  "checkout_place_order",
  "cart_add",
  "cart_view",
  "cart_update",
  "order_linked",
]);

export const INSIGHTS_FORM_KEY_DENYLIST = [
  "email",
  "phone",
  "name",
  "address",
  "postcode",
  "postal",
  "zip",
  "notes",
  "coupon",
  "password",
  "card",
  "iban",
  "sort",
  "account",
  "cvv",
  "cvc",
  "pan",
  "ssn",
  "dob",
  "firstname",
  "lastname",
  "full_name",
  "receipt",
  "bank",
] as const;

export function isInsightsExcludedPath(path: string): boolean {
  const p = String(path || "").split("?")[0].toLowerCase();
  const normalized = p.startsWith("/") ? p : `/${p}`;
  return INSIGHTS_EXCLUDED_PATH_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(prefix + "/")
  );
}

export const INSIGHTS_VISITOR_KEY = "firestick_insights_vid_v1";
export const INSIGHTS_SESSION_KEY = "firestick_insights_sid_v1";
export const INSIGHTS_COLLECT_PATH = "/api/insights-collect";

export const INSIGHTS_VISITOR_TTL_MS = 180 * 24 * 60 * 60 * 1000;
export const INSIGHTS_SESSION_IDLE_MS = 30 * 60 * 1000;

export const INSIGHTS_BATCH_MAX_EVENTS = 10;
export const INSIGHTS_BATCH_MAX_BYTES = 8192;
export const INSIGHTS_BATCH_FLUSH_MS = 2000;

/** Stop sending after this many consecutive 204s in one page session (disabled ingest). */
export const INSIGHTS_CONSECUTIVE_204_STOP = 5;

export const INSIGHTS_SCROLL_MARKS = [25, 50, 75, 90, 100] as const;

export const INSIGHTS_CLICK_TAXONOMY: Record<string, string> = {
  cart_add: "cart_add",
  cart_view: "cart_view",
  mini_checkout: "mini_checkout",
  pdp_sticky_checkout: "pdp_sticky_checkout",
  place_order: "place_order",
  pay_method_bank: "pay_method_bank",
  pay_method_cod: "pay_method_cod",
};

export type InsightsStoredId = { id: string; createdAt: number; expiresAt: number };

export type InsightsClientEvent = {
  t: string;
  ts: string;
  path: string;
  title?: string;
  referrer_path?: string;
  props?: Record<string, unknown>;
  time_on_page_ms?: number;
  scroll_depth_pct?: number;
  click_id?: string;
  search_term?: string;
  http_status?: number;
  error_kind?: string;
  error_name?: string;
  order_id?: string;
};

export type InsightsCollectPayload = {
  v: 1;
  visitor_id: string;
  session_id: string;
  sent_at: string;
  consent_analytics: true;
  events: InsightsClientEvent[];
  language?: string;
  screen_w?: number;
  screen_h?: number;
  referrer?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  gclid?: string;
  fbclid?: string;
  msclkid?: string;
  wbraid?: string;
  gbraid?: string;
  landing_path?: string;
  is_bot?: boolean;
};

export type InsightsAttribution = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  gclid?: string;
  fbclid?: string;
  msclkid?: string;
  wbraid?: string;
  gbraid?: string;
  referrer_host?: string;
  landing_path?: string;
};

export function hasAnalyticsConsent(
  preference: { analytics?: boolean } | null | undefined
): boolean {
  return preference?.analytics === true;
}

/** Sec-GPC / navigator.globalPrivacyControl => treat as no recording. */
export function hasGlobalPrivacyControl(nav?: {
  globalPrivacyControl?: boolean;
}): boolean {
  try {
    if (nav && nav.globalPrivacyControl === true) return true;
    if (typeof navigator !== "undefined" && (navigator as { globalPrivacyControl?: boolean }).globalPrivacyControl === true) {
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export function shouldRecordInsights(opts: {
  preference: { analytics?: boolean } | null | undefined;
  pathname: string;
  gpc?: boolean;
}): boolean {
  if (opts.gpc === true) return false;
  if (hasGlobalPrivacyControl()) return false;
  if (!hasAnalyticsConsent(opts.preference)) return false;
  if (isInsightsExcludedPath(opts.pathname || "/")) return false;
  return true;
}

export function newInsightsUuid(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  // Non-crypto fallback for constrained test hosts only.
  const s: string[] = [];
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) s.push("-");
    else if (i === 14) s.push("4");
    else if (i === 19) s.push(((Math.random() * 4) | 8).toString(16));
    else s.push(((Math.random() * 16) | 0).toString(16));
  }
  return s.join("");
}

export function wrapInsightsId(id: string, nowMs: number, ttlMs: number): InsightsStoredId {
  return { id, createdAt: nowMs, expiresAt: nowMs + ttlMs };
}

export function readWrappedId(
  raw: string | null,
  nowMs: number
): InsightsStoredId | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as InsightsStoredId;
    if (!parsed || typeof parsed.id !== "string" || !parsed.id) return null;
    if (typeof parsed.expiresAt !== "number" || parsed.expiresAt <= nowMs) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function ensureVisitorId(storage: Storage, nowMs = Date.now()): string {
  const existing = readWrappedId(storage.getItem(INSIGHTS_VISITOR_KEY), nowMs);
  if (existing) return existing.id;
  const id = newInsightsUuid();
  storage.setItem(
    INSIGHTS_VISITOR_KEY,
    JSON.stringify(wrapInsightsId(id, nowMs, INSIGHTS_VISITOR_TTL_MS))
  );
  return id;
}

export type SessionIdState = {
  id: string;
  lastActivityAt: number;
};

export function readSessionState(raw: string | null): SessionIdState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SessionIdState;
    if (!parsed || typeof parsed.id !== "string" || !parsed.id) return null;
    if (typeof parsed.lastActivityAt !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function ensureSessionId(
  storage: Storage,
  nowMs = Date.now(),
  idleMs = INSIGHTS_SESSION_IDLE_MS
): string {
  const existing = readSessionState(storage.getItem(INSIGHTS_SESSION_KEY));
  if (existing && nowMs - existing.lastActivityAt <= idleMs) {
    const next = { id: existing.id, lastActivityAt: nowMs };
    storage.setItem(INSIGHTS_SESSION_KEY, JSON.stringify(next));
    return existing.id;
  }
  const id = newInsightsUuid();
  storage.setItem(
    INSIGHTS_SESSION_KEY,
    JSON.stringify({ id, lastActivityAt: nowMs } satisfies SessionIdState)
  );
  return id;
}

/** Clear session id on consent withdraw; keep visitor id. */
export function clearInsightsSessionId(storage: Storage): void {
  try {
    storage.removeItem(INSIGHTS_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function touchSessionActivity(storage: Storage, nowMs = Date.now()): void {
  const existing = readSessionState(storage.getItem(INSIGHTS_SESSION_KEY));
  if (!existing) return;
  storage.setItem(
    INSIGHTS_SESSION_KEY,
    JSON.stringify({ id: existing.id, lastActivityAt: nowMs })
  );
}

function isSensitiveQueryKey(key: string): boolean {
  const k = String(key || "").toLowerCase();
  if (!k) return false;
  if ((CLARITY_QUERY_ALLOWLIST as readonly string[]).includes(k)) return false;
  if ((CLARITY_EXCLUDED_QUERY_EQUALS as readonly string[]).includes(k)) return true;
  return (CLARITY_EXCLUDED_QUERY_CONTAINS as readonly string[]).some((tok) =>
    k.includes(tok)
  );
}

export function stripSensitiveQueryParams(search: string): URLSearchParams {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const src = new URLSearchParams(raw);
  const out = new URLSearchParams();
  src.forEach((value, key) => {
    if (isSensitiveQueryKey(key)) return;
    out.append(key, value);
  });
  return out;
}

export function captureAttributionOnce(input: {
  search: string;
  referrer: string;
  pathname: string;
}): InsightsAttribution {
  const params = stripSensitiveQueryParams(input.search || "");
  const pick = (k: string) => {
    const v = params.get(k);
    return v && v.trim() ? v.trim().slice(0, 128) : undefined;
  };
  let referrer_host: string | undefined;
  try {
    if (input.referrer) {
      const u = new URL(input.referrer);
      referrer_host = u.host || undefined;
    }
  } catch {
    referrer_host = undefined;
  }
  return {
    utm_source: pick("utm_source"),
    utm_medium: pick("utm_medium"),
    utm_campaign: pick("utm_campaign"),
    utm_term: pick("utm_term"),
    utm_content: pick("utm_content"),
    gclid: pick("gclid"),
    fbclid: pick("fbclid"),
    msclkid: pick("msclkid"),
    wbraid: pick("wbraid"),
    gbraid: pick("gbraid"),
    referrer_host,
    landing_path: String(input.pathname || "/").split("?")[0].slice(0, 512) || "/",
  };
}

export function scrollDepthPercent(scrollY: number, docHeight: number, viewH: number): number {
  const maxScroll = Math.max(0, docHeight - viewH);
  if (maxScroll <= 0) return 100;
  const pct = Math.round((scrollY / maxScroll) * 100);
  return Math.max(0, Math.min(100, pct));
}

export function nextScrollWatermark(
  currentMax: number,
  depthPct: number,
  marks: readonly number[] = INSIGHTS_SCROLL_MARKS
): number | null {
  let hit: number | null = null;
  for (const m of marks) {
    if (depthPct >= m && currentMax < m) hit = m;
  }
  return hit;
}

export function containsDeniedFormKey(key: string): boolean {
  const k = key.toLowerCase().replace(/[^a-z0-9_]/g, "");
  return INSIGHTS_FORM_KEY_DENYLIST.some((d) => k === d || k.includes(d));
}

export function sanitizeProps(
  props: Record<string, unknown> | null | undefined
): Record<string, unknown> | undefined {
  if (!props || typeof props !== "object") return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (containsDeniedFormKey(k)) continue;
    if (v == null) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      out[k] = typeof v === "string" ? v.slice(0, 256) : v;
    } else if (Array.isArray(v) && v.every((x) => typeof x === "number" || typeof x === "string")) {
      out[k] = v.slice(0, 40);
    }
  }
  return Object.keys(out).length ? out : undefined;
}

export function isEmailLike(value: string): boolean {
  return /[^\s@]+@[^\s@]+\.[^\s@]+/.test(value);
}

export function isPhoneLike(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 8 && /[\d\s+\-()]{8,}/.test(value);
}

export function sanitizeSearchTerm(raw: string): string | null {
  const s = String(raw || "").trim().slice(0, INSIGHTS_SEARCH_TERM_MAX);
  if (!s) return null;
  if (isEmailLike(s) || isPhoneLike(s)) return null;
  return s;
}

/**
 * Resolve click taxonomy from element identity only — never reads input values,
 * innerText of fields, or form content.
 */
export function resolveClickTaxonomyId(el: Element | null): string | null {
  let node: Element | null = el;
  for (let depth = 0; node && depth < 8; depth++, node = node.parentElement) {
    const dataId = node.getAttribute("data-insights-id");
    if (dataId && INSIGHTS_CLICK_TAXONOMY[dataId]) return INSIGHTS_CLICK_TAXONOMY[dataId];

    if (node.classList.contains("place-order-btn")) return "place_order";
    const placeOrder = node.getAttribute("data-place-order");
    if (placeOrder === "inline" || placeOrder === "sticky") return "place_order";

    if (node.classList.contains("pdp-sticky-atc__btn")) return "pdp_sticky_checkout";
    if (node.getAttribute("data-pdp-atc") === "sticky") return "pdp_sticky_checkout";
    if (node.classList.contains("mini-cart-bar__btn--view")) return "cart_view";
    if (node.classList.contains("mini-cart-bar__btn--checkout")) return "mini_checkout";

    const pay = node.getAttribute("data-payment-option");
    if (pay === "bank") return "pay_method_bank";
    if (pay === "cod") return "pay_method_cod";

    if (node.getAttribute("data-pdp-atc") === "inline") return "cart_add";
  }
  return null;
}

export function detectClientBotHint(nav?: {
  webdriver?: boolean;
  userAgent?: string;
}): boolean {
  try {
    const n = nav || (typeof navigator !== "undefined" ? navigator : undefined);
    if (!n) return false;
    if (n.webdriver === true) return true;
    const ua = String(n.userAgent || "").toLowerCase();
    return /bot|crawl|spider|headless|phantom|selenium/.test(ua);
  } catch {
    return false;
  }
}

export function readCartSnapshot(raw: string | null): {
  items: Array<{ id: string | number; qty: number }>;
  total: number;
} | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const items: Array<{ id: string | number; qty: number }> = [];
    let total = 0;
    for (const row of parsed) {
      if (!row || typeof row !== "object") continue;
      const id = (row as { id?: unknown }).id;
      const qty = Number((row as { qty?: unknown }).qty ?? (row as { quantity?: unknown }).quantity ?? 1);
      const price = Number((row as { price?: unknown }).price ?? 0);
      if (id == null) continue;
      const q = Number.isFinite(qty) && qty > 0 ? Math.floor(qty) : 1;
      items.push({ id: id as string | number, qty: q });
      if (Number.isFinite(price)) total += price * q;
    }
    return { items: items.slice(0, 40), total: Math.round(total * 100) / 100 };
  } catch {
    return null;
  }
}

export function readOrderIdFromSuccessState(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { order_id?: unknown; orderId?: unknown };
    const id = parsed.order_id ?? parsed.orderId;
    if (typeof id === "string" && id.trim()) return id.trim().slice(0, 64);
    if (typeof id === "number" && Number.isFinite(id)) return String(id).slice(0, 64);
  } catch {
    /* ignore */
  }
  return null;
}

export function estimatePayloadBytes(payload: InsightsCollectPayload): number {
  try {
    return new TextEncoder().encode(JSON.stringify(payload)).length;
  } catch {
    return JSON.stringify(payload).length;
  }
}

export function buildCollectPayload(input: {
  visitorId: string;
  sessionId: string;
  events: InsightsClientEvent[];
  attribution?: InsightsAttribution | null;
  language?: string;
  screenW?: number;
  screenH?: number;
  isBot?: boolean;
  nowIso?: string;
}): InsightsCollectPayload {
  const events = input.events
    .filter((e) => INSIGHTS_EVENT_TYPE_ALLOWLIST.has(e.t) || e.t === "click")
    .map((e) => {
      const next: InsightsClientEvent = {
        t: e.t,
        ts: e.ts,
        path: String(e.path || "/").slice(0, 512),
      };
      if (e.title) next.title = String(e.title).slice(0, 255);
      if (e.referrer_path) next.referrer_path = String(e.referrer_path).slice(0, 512);
      if (e.props) next.props = sanitizeProps(e.props);
      if (typeof e.time_on_page_ms === "number") next.time_on_page_ms = Math.max(0, Math.floor(e.time_on_page_ms));
      if (typeof e.scroll_depth_pct === "number") next.scroll_depth_pct = Math.max(0, Math.min(100, Math.floor(e.scroll_depth_pct)));
      if (e.click_id) next.click_id = String(e.click_id).slice(0, 64);
      if (e.search_term) next.search_term = String(e.search_term).slice(0, INSIGHTS_SEARCH_TERM_MAX);
      if (typeof e.http_status === "number") next.http_status = e.http_status;
      if (e.error_kind) next.error_kind = String(e.error_kind).slice(0, 64);
      if (e.error_name) next.error_name = String(e.error_name).slice(0, 128);
      if (e.order_id) next.order_id = String(e.order_id).slice(0, 64);
      return next;
    });

  const payload: InsightsCollectPayload = {
    v: 1,
    visitor_id: input.visitorId,
    session_id: input.sessionId,
    sent_at: input.nowIso || new Date().toISOString(),
    consent_analytics: true,
    events,
  };
  if (input.language) payload.language = input.language.slice(0, 32);
  if (typeof input.screenW === "number") payload.screen_w = input.screenW;
  if (typeof input.screenH === "number") payload.screen_h = input.screenH;
  if (input.isBot) payload.is_bot = true;
  const a = input.attribution;
  if (a) {
    if (a.utm_source) payload.utm_source = a.utm_source;
    if (a.utm_medium) payload.utm_medium = a.utm_medium;
    if (a.utm_campaign) payload.utm_campaign = a.utm_campaign;
    if (a.utm_term) payload.utm_term = a.utm_term;
    if (a.utm_content) payload.utm_content = a.utm_content;
    if (a.gclid) payload.gclid = a.gclid;
    if (a.fbclid) payload.fbclid = a.fbclid;
    if (a.msclkid) payload.msclkid = a.msclkid;
    if (a.wbraid) payload.wbraid = a.wbraid;
    if (a.gbraid) payload.gbraid = a.gbraid;
    if (a.referrer_host) payload.referrer = a.referrer_host;
    if (a.landing_path) payload.landing_path = a.landing_path;
  }
  return payload;
}

export type InsightsTransportResult = { status: number; ok: boolean };

export function sendInsightsPayload(
  payload: InsightsCollectPayload,
  opts?: {
    sendBeacon?: (url: string, data: Blob) => boolean;
    fetchFn?: typeof fetch;
    url?: string;
  }
): Promise<InsightsTransportResult> | InsightsTransportResult {
  const url = opts?.url || INSIGHTS_COLLECT_PATH;
  const body = JSON.stringify(payload);
  const blob = typeof Blob !== "undefined" ? new Blob([body], { type: "application/json" }) : null;
  const beacon = opts?.sendBeacon || (typeof navigator !== "undefined" ? navigator.sendBeacon?.bind(navigator) : undefined);

  if (beacon && blob) {
    try {
      const sent = beacon(url, blob);
      if (sent) return { status: 204, ok: true };
    } catch {
      /* fallback */
    }
  }

  const fetchFn = opts?.fetchFn || (typeof fetch !== "undefined" ? fetch : undefined);
  if (!fetchFn) return { status: 0, ok: false };

  return fetchFn(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
    credentials: "same-origin",
  }).then((res) => ({ status: res.status, ok: res.status === 204 || res.ok }));
}

export type InsightsRuntimeHooks = {
  getPathname: () => string;
  getSearch: () => string;
  getReferrer: () => string;
  getTitle: () => string;
  getLanguage: () => string;
  getScreen: () => { w: number; h: number };
  localStorage: Storage;
  sessionStorage: Storage;
  now: () => number;
  schedule: (fn: () => void, ms?: number) => number | ReturnType<typeof setTimeout>;
  clearSchedule: (id: number | ReturnType<typeof setTimeout>) => void;
  onFlushResult?: (result: InsightsTransportResult) => void;
  transport?: typeof sendInsightsPayload;
};

export type InsightsController = {
  start: () => void;
  stop: (opts?: { dropQueue?: boolean }) => void;
  isRunning: () => boolean;
  enqueue: (event: InsightsClientEvent) => void;
  flush: (opts?: { force?: boolean }) => void;
  getQueueLength: () => number;
  getConsecutive204s: () => number;
  handlePathChange: (pathname: string) => void;
  /** Test/inspection: whether network is allowed. */
  networkAllowed: () => boolean;
};

export function createInsightsController(hooks: InsightsRuntimeHooks): InsightsController {
  let running = false;
  let queue: InsightsClientEvent[] = [];
  let flushTimer: number | ReturnType<typeof setTimeout> | null = null;
  let attribution: InsightsAttribution | null = null;
  let pageStartedAt = 0;
  let scrollMax = 0;
  let consecutive204 = 0;
  let stoppedFor204 = false;
  let lastPath = "/";

  const transport = hooks.transport || sendInsightsPayload;

  const networkAllowed = () => running && !stoppedFor204 && consecutive204 < INSIGHTS_CONSECUTIVE_204_STOP;

  const clearFlushTimer = () => {
    if (flushTimer != null) {
      hooks.clearSchedule(flushTimer);
      flushTimer = null;
    }
  };

  const scheduleFlush = () => {
    if (flushTimer != null) return;
    flushTimer = hooks.schedule(() => {
      flushTimer = null;
      flush();
    }, INSIGHTS_BATCH_FLUSH_MS);
  };

  const flush = (opts?: { force?: boolean }) => {
    if (!networkAllowed() && !opts?.force) {
      queue = [];
      return;
    }
    if (!queue.length) return;
    clearFlushTimer();

    const visitorId = ensureVisitorId(hooks.localStorage, hooks.now());
    const sessionId = ensureSessionId(hooks.sessionStorage, hooks.now());
    touchSessionActivity(hooks.sessionStorage, hooks.now());

    const batch = queue.splice(0, INSIGHTS_BATCH_MAX_EVENTS);
    const payload = buildCollectPayload({
      visitorId,
      sessionId,
      events: batch,
      attribution,
      language: hooks.getLanguage(),
      screenW: hooks.getScreen().w,
      screenH: hooks.getScreen().h,
      isBot: detectClientBotHint(),
      nowIso: new Date(hooks.now()).toISOString(),
    });

    // Trim until under byte budget
    while (
      payload.events.length > 1 &&
      estimatePayloadBytes(payload) > INSIGHTS_BATCH_MAX_BYTES
    ) {
      const spilled = payload.events.pop();
      if (spilled) queue.unshift(spilled);
    }

    if (!payload.events.length) return;

    const result = transport(payload);
    const handle = (r: InsightsTransportResult) => {
      hooks.onFlushResult?.(r);
      if (r.status === 204) {
        consecutive204 += 1;
        if (consecutive204 >= INSIGHTS_CONSECUTIVE_204_STOP) {
          stoppedFor204 = true;
          queue = [];
          clearFlushTimer();
        }
      } else if (r.ok) {
        consecutive204 = 0;
      }
    };
    if (result && typeof (result as Promise<InsightsTransportResult>).then === "function") {
      (result as Promise<InsightsTransportResult>).then(handle).catch(() => {
        /* ignore transport errors */
      });
    } else {
      handle(result as InsightsTransportResult);
    }
  };

  const enqueue = (event: InsightsClientEvent) => {
    if (!networkAllowed()) return;
    if (isInsightsExcludedPath(event.path)) return;
    queue.push(event);
    touchSessionActivity(hooks.sessionStorage, hooks.now());
    if (queue.length >= INSIGHTS_BATCH_MAX_EVENTS) {
      flush();
    } else {
      scheduleFlush();
    }
  };

  const closePageTiming = () => {
    if (!pageStartedAt) return;
    const ms = Math.max(0, hooks.now() - pageStartedAt);
    // Timing/scroll watermark only — do not emit a second page_view (avoids double-count).
    enqueue({
      t: "scroll_depth",
      ts: new Date(hooks.now()).toISOString(),
      path: lastPath,
      time_on_page_ms: ms,
      scroll_depth_pct: scrollMax || 0,
    });
    pageStartedAt = 0;
  };

  const startPage = (pathname: string) => {
    lastPath = pathname || "/";
    pageStartedAt = hooks.now();
    scrollMax = 0;
    enqueue({
      t: "page_view",
      ts: new Date(hooks.now()).toISOString(),
      path: lastPath,
      title: hooks.getTitle().slice(0, 255),
    });

    if (lastPath === "/cart" || lastPath.startsWith("/cart/")) {
      try {
        const snap = readCartSnapshot(hooks.localStorage.getItem("firestick_cart"));
        if (snap) {
          enqueue({
            t: "cart_view",
            ts: new Date(hooks.now()).toISOString(),
            path: lastPath,
            props: sanitizeProps({ items: snap.items, total: snap.total }),
          });
        }
      } catch {
        /* ignore */
      }
    }

    if (lastPath === "/cart/success" || lastPath.startsWith("/cart/success")) {
      try {
        const orderId = readOrderIdFromSuccessState(
          hooks.sessionStorage.getItem("orderSuccess")
        );
        if (orderId) {
          enqueue({
            t: "order_linked",
            ts: new Date(hooks.now()).toISOString(),
            path: lastPath,
            order_id: orderId,
          });
        }
      } catch {
        /* ignore */
      }
    }
  };

  return {
    start() {
      if (running) return;
      const pref = readTrackingConsent();
      const path = hooks.getPathname();
      if (!shouldRecordInsights({ preference: pref, pathname: path })) return;
      running = true;
      stoppedFor204 = false;
      consecutive204 = 0;
      if (!attribution) {
        attribution = captureAttributionOnce({
          search: hooks.getSearch(),
          referrer: hooks.getReferrer(),
          pathname: path,
        });
      }
      ensureVisitorId(hooks.localStorage, hooks.now());
      ensureSessionId(hooks.sessionStorage, hooks.now());
      startPage(path);
    },
    stop(opts) {
      running = false;
      clearFlushTimer();
      if (opts?.dropQueue) queue = [];
      else if (queue.length) flush({ force: false });
      queue = [];
      pageStartedAt = 0;
    },
    isRunning: () => running,
    enqueue,
    flush,
    getQueueLength: () => queue.length,
    getConsecutive204s: () => consecutive204,
    handlePathChange(pathname: string) {
      if (!running) return;
      if (isInsightsExcludedPath(pathname)) {
        closePageTiming();
        this.stop({ dropQueue: true });
        return;
      }
      closePageTiming();
      startPage(pathname);
    },
    networkAllowed,
  };
}
