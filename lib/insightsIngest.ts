/**
 * Sidhu Insights ingest validation + persistence (1–2 round trips).
 */

import { lookupInsightsGeo, type InsightsGeoResult } from "./insightsGeo";
import type { InsightsSettings } from "./insightsSettings";

export const INSIGHTS_MAX_BODY_BYTES = 16384;
export const INSIGHTS_PATH_MAX = 512;
export const INSIGHTS_SEARCH_TERM_MAX = 128;
export const INSIGHTS_PROPS_JSON_MAX = 2048;

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

export const INSIGHTS_TOP_LEVEL_KEYS = new Set([
  "v",
  "visitor_id",
  "session_id",
  "sent_at",
  "consent_analytics",
  "events",
  "ua_hint",
  "language",
  "screen_w",
  "screen_h",
  "referrer",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
  "msclkid",
  "wbraid",
  "gbraid",
  "landing_path",
  "is_bot",
]);

export const INSIGHTS_EVENT_KEYS = new Set([
  "t",
  "ts",
  "path",
  "title",
  "referrer_path",
  "props",
  "time_on_page_ms",
  "scroll_depth_pct",
  "click_id",
  "search_term",
  "http_status",
  "error_kind",
  "error_name",
  "order_id",
]);

/** Form-like / PII-ish keys — reject anywhere in payload props or top-level extras. */
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
];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const INSIGHTS_EXCLUDED_PATH_PREFIXES = ["/sidhu", "/api", "/erp", "/order-tracking"];

export type ValidatedInsightsEvent = {
  event_type: string;
  event_time: string;
  path: string;
  title: string | null;
  referrer_path: string | null;
  props_json: string | null;
  time_on_page_ms: number | null;
  scroll_depth_pct: number | null;
  click_id: string | null;
  search_term: string | null;
  http_status: number | null;
  error_kind: string | null;
  error_name: string | null;
  order_id: string | null;
};

export type ValidatedInsightsPayload = {
  visitor_id: string;
  session_id: string;
  consent_analytics: true;
  language: string | null;
  screen_w: number | null;
  screen_h: number | null;
  referrer_host: string | null;
  referrer_path: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  gclid: string | null;
  fbclid: string | null;
  msclkid: string | null;
  wbraid: string | null;
  gbraid: string | null;
  landing_path: string;
  client_is_bot: boolean;
  events: ValidatedInsightsEvent[];
};

export type IngestValidationFailure = { ok: false; status: 400 | 413; code: string };
export type IngestValidationSuccess = { ok: true; payload: ValidatedInsightsPayload };
export type IngestValidationResult = IngestValidationFailure | IngestValidationSuccess;

function containsDeniedKey(key: string): boolean {
  const k = key.toLowerCase().replace(/[^a-z0-9_]/g, "");
  return INSIGHTS_FORM_KEY_DENYLIST.some((d) => k === d || k.includes(d));
}

function scanObjectKeys(obj: unknown, depth = 0): string | null {
  if (!obj || typeof obj !== "object" || depth > 4) return null;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const hit = scanObjectKeys(item, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (containsDeniedKey(k)) return k;
    const hit = scanObjectKeys(v, depth + 1);
    if (hit) return hit;
  }
  return null;
}

export function isInsightsExcludedPath(path: string): boolean {
  const p = String(path || "").split("?")[0].toLowerCase();
  const normalized = p.startsWith("/") ? p : `/${p}`;
  return INSIGHTS_EXCLUDED_PATH_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(prefix + "/")
  );
}

export function detectInsightsBot(ua: string, clientHint?: boolean): { is_bot: number; bot_score: number } {
  if (clientHint) return { is_bot: 1, bot_score: 90 };
  const s = String(ua || "").toLowerCase();
  const patterns = [
    "bot",
    "spider",
    "crawl",
    "slurp",
    "facebookexternalhit",
    "pingdom",
    "yandex",
    "baidu",
    "semrush",
    "ahrefs",
    "curl/",
    "wget/",
    "python-requests",
    "httpclient",
    "headless",
    "phantom",
    "selenium",
  ];
  for (const p of patterns) {
    if (s.includes(p)) return { is_bot: 1, bot_score: 80 };
  }
  if (!s) return { is_bot: 1, bot_score: 60 };
  return { is_bot: 0, bot_score: 0 };
}

function capStr(v: unknown, max: number): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.slice(0, max);
}

function parseIso(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const d = Date.parse(v);
  if (!Number.isFinite(d)) return null;
  return new Date(d).toISOString();
}

export function validateInsightsCollectBody(
  raw: unknown,
  opts?: { maxBodyBytes?: number; rawByteLength?: number }
): IngestValidationResult {
  const maxBytes = opts?.maxBodyBytes ?? INSIGHTS_MAX_BODY_BYTES;
  if (typeof opts?.rawByteLength === "number" && opts.rawByteLength > maxBytes) {
    return { ok: false, status: 413, code: "body_too_large" };
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, status: 400, code: "invalid_json" };
  }
  const body = raw as Record<string, unknown>;

  for (const k of Object.keys(body)) {
    if (!INSIGHTS_TOP_LEVEL_KEYS.has(k) || containsDeniedKey(k)) {
      return { ok: false, status: 400, code: "key_not_allowed" };
    }
  }

  const denied = scanObjectKeys(body);
  if (denied) return { ok: false, status: 400, code: "form_key_rejected" };

  if (body.v !== 1 && body.v !== "1") {
    return { ok: false, status: 400, code: "bad_version" };
  }
  if (body.consent_analytics !== true) {
    return { ok: false, status: 400, code: "consent_required" };
  }

  const visitor_id = String(body.visitor_id || "");
  const session_id = String(body.session_id || "");
  if (!UUID_RE.test(visitor_id) || !UUID_RE.test(session_id)) {
    return { ok: false, status: 400, code: "bad_ids" };
  }

  if (!Array.isArray(body.events) || body.events.length === 0 || body.events.length > 20) {
    return { ok: false, status: 400, code: "bad_events" };
  }

  const events: ValidatedInsightsEvent[] = [];
  for (const ev of body.events) {
    if (!ev || typeof ev !== "object" || Array.isArray(ev)) {
      return { ok: false, status: 400, code: "bad_event" };
    }
    const e = ev as Record<string, unknown>;
    for (const k of Object.keys(e)) {
      if (!INSIGHTS_EVENT_KEYS.has(k) || containsDeniedKey(k)) {
        return { ok: false, status: 400, code: "event_key_not_allowed" };
      }
    }
    const t = String(e.t || "");
    if (!INSIGHTS_EVENT_TYPE_ALLOWLIST.has(t) && !t.startsWith("checkout_")) {
      return { ok: false, status: 400, code: "event_type_not_allowed" };
    }
    // checkout_* still limited
    if (t.startsWith("checkout_") && !INSIGHTS_EVENT_TYPE_ALLOWLIST.has(t)) {
      // allow only known checkout_* already in set
      return { ok: false, status: 400, code: "event_type_not_allowed" };
    }

    const path = capStr(e.path, INSIGHTS_PATH_MAX) || "/";
    if (isInsightsExcludedPath(path)) {
      // skip excluded paths silently at event level
      continue;
    }

    let props_json: string | null = null;
    if (e.props != null) {
      if (typeof e.props !== "object" || Array.isArray(e.props)) {
        return { ok: false, status: 400, code: "bad_props" };
      }
      const propDenied = scanObjectKeys(e.props);
      if (propDenied) return { ok: false, status: 400, code: "form_key_rejected" };
      try {
        const s = JSON.stringify(e.props);
        if (s.length > INSIGHTS_PROPS_JSON_MAX) {
          return { ok: false, status: 400, code: "props_too_large" };
        }
        props_json = s;
      } catch {
        return { ok: false, status: 400, code: "bad_props" };
      }
    }

    const ts = parseIso(e.ts) || new Date().toISOString();
    const search_term = capStr(e.search_term, INSIGHTS_SEARCH_TERM_MAX);
    events.push({
      event_type: t.slice(0, 64),
      event_time: ts.slice(0, 30),
      path: path.slice(0, INSIGHTS_PATH_MAX),
      title: capStr(e.title, 255),
      referrer_path: capStr(e.referrer_path, INSIGHTS_PATH_MAX),
      props_json,
      time_on_page_ms:
        typeof e.time_on_page_ms === "number" && e.time_on_page_ms >= 0
          ? Math.min(Math.floor(e.time_on_page_ms), 86_400_000)
          : null,
      scroll_depth_pct:
        typeof e.scroll_depth_pct === "number" && e.scroll_depth_pct >= 0
          ? Math.min(Math.floor(e.scroll_depth_pct), 100)
          : null,
      click_id: capStr(e.click_id, 64),
      search_term: search_term ? search_term.toLowerCase() : null,
      http_status:
        typeof e.http_status === "number" && e.http_status >= 100 && e.http_status < 600
          ? Math.floor(e.http_status)
          : null,
      error_kind: capStr(e.error_kind, 64),
      error_name: capStr(e.error_name, 128),
      order_id: capStr(e.order_id, 64),
    });
  }

  if (events.length === 0) {
    // all excluded — treat as valid empty accept (caller may 204 without write)
    return {
      ok: true,
      payload: {
        visitor_id,
        session_id,
        consent_analytics: true,
        language: capStr(body.language, 32),
        screen_w: typeof body.screen_w === "number" ? Math.min(Math.floor(body.screen_w), 65535) : null,
        screen_h: typeof body.screen_h === "number" ? Math.min(Math.floor(body.screen_h), 65535) : null,
        referrer_host: null,
        referrer_path: null,
        utm_source: capStr(body.utm_source, 128),
        utm_medium: capStr(body.utm_medium, 128),
        utm_campaign: capStr(body.utm_campaign, 128),
        utm_term: capStr(body.utm_term, 128),
        utm_content: capStr(body.utm_content, 128),
        gclid: capStr(body.gclid, 128),
        fbclid: capStr(body.fbclid, 128),
        msclkid: capStr(body.msclkid, 128),
        wbraid: capStr(body.wbraid, 128),
        gbraid: capStr(body.gbraid, 128),
        landing_path: capStr(body.landing_path, INSIGHTS_PATH_MAX) || events[0]?.path || "/",
        client_is_bot: body.is_bot === true,
        events: [],
      },
    };
  }

  let referrer_host: string | null = null;
  let referrer_path: string | null = null;
  const ref = capStr(body.referrer, 1024);
  if (ref) {
    try {
      const u = new URL(ref);
      referrer_host = u.host.slice(0, 255);
      referrer_path = (u.pathname + u.search).slice(0, INSIGHTS_PATH_MAX);
    } catch {
      referrer_path = ref.slice(0, INSIGHTS_PATH_MAX);
    }
  }

  return {
    ok: true,
    payload: {
      visitor_id,
      session_id,
      consent_analytics: true,
      language: capStr(body.language, 32),
      screen_w: typeof body.screen_w === "number" ? Math.min(Math.floor(body.screen_w), 65535) : null,
      screen_h: typeof body.screen_h === "number" ? Math.min(Math.floor(body.screen_h), 65535) : null,
      referrer_host,
      referrer_path,
      utm_source: capStr(body.utm_source, 128),
      utm_medium: capStr(body.utm_medium, 128),
      utm_campaign: capStr(body.utm_campaign, 128),
      utm_term: capStr(body.utm_term, 128),
      utm_content: capStr(body.utm_content, 128),
      gclid: capStr(body.gclid, 128),
      fbclid: capStr(body.fbclid, 128),
      msclkid: capStr(body.msclkid, 128),
      wbraid: capStr(body.wbraid, 128),
      gbraid: capStr(body.gbraid, 128),
      landing_path: capStr(body.landing_path, INSIGHTS_PATH_MAX) || events[0].path,
      client_is_bot: body.is_bot === true,
      events,
    },
  };
}

export type PersistDeps = {
  query: (sql: string, params?: unknown[]) => Promise<[unknown, unknown?]>;
  settings: InsightsSettings;
  ip: string;
  userAgent: string;
  geo?: InsightsGeoResult;
  now?: Date;
};

export type PersistResult = { stored: boolean; eventCount: number; skipped?: string };

function sourceBucket(p: ValidatedInsightsPayload): string {
  if (p.gclid) return "google_ads";
  if (p.utm_source || p.utm_medium) return "utm";
  if (p.referrer_host) return "referral";
  return "direct";
}

/**
 * Persist session upsert + multi-row events + cheap daily rollup increments.
 * Expects recording already gated by caller.
 */
export async function persistInsightsIngest(
  payload: ValidatedInsightsPayload,
  deps: PersistDeps
): Promise<PersistResult> {
  if (!payload.events.length) {
    return { stored: false, eventCount: 0, skipped: "no_events" };
  }

  const bot = detectInsightsBot(deps.userAgent, payload.client_is_bot);
  const geo =
    deps.geo ||
    lookupInsightsGeo(deps.ip, { geoCityEnabled: deps.settings.geo_city_enabled === true });
  const now = deps.now || new Date();
  const nowIso = now.toISOString().slice(0, 23).replace("T", " ");
  const summaryDate = now.toISOString().slice(0, 10);

  const pageviews = payload.events.filter((e) => e.event_type === "page_view").length;
  const eventCount = payload.events.length;
  const landing = payload.landing_path || payload.events[0].path;
  const exitPath = payload.events[payload.events.length - 1].path;
  const orderId =
    payload.events.map((e) => e.order_id).find((x) => !!x) || null;

  // Round-trip 1: session upsert
  await deps.query(
    `INSERT INTO insights_sessions (
      session_id, visitor_id, started_at, last_seen_at,
      is_new_visitor, is_returning, is_bot, bot_score,
      landing_path, exit_path, referrer_host, referrer_path,
      utm_source, utm_medium, utm_campaign, utm_term, utm_content,
      gclid, fbclid, msclkid, wbraid, gbraid,
      ip_address, ip_masked,
      country_code, country_name, region_name, city_name,
      asn, network_provider, geo_source,
      device_type, language, screen_w, screen_h,
      pageview_count, event_count, order_id, consent_analytics
    ) VALUES (
      ?, ?, ?, ?,
      1, 0, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, 0,
      ?, ?, ?, ?,
      ?, ?, ?,
      'unknown', ?, ?, ?,
      ?, ?, ?, 1
    )
    ON DUPLICATE KEY UPDATE
      last_seen_at = VALUES(last_seen_at),
      exit_path = VALUES(exit_path),
      pageview_count = pageview_count + VALUES(pageview_count),
      event_count = event_count + VALUES(event_count),
      order_id = COALESCE(VALUES(order_id), order_id),
      is_bot = GREATEST(is_bot, VALUES(is_bot))`,
    [
      payload.session_id,
      payload.visitor_id,
      nowIso,
      nowIso,
      bot.is_bot,
      bot.bot_score || null,
      landing.slice(0, INSIGHTS_PATH_MAX),
      exitPath.slice(0, INSIGHTS_PATH_MAX),
      payload.referrer_host,
      payload.referrer_path,
      payload.utm_source,
      payload.utm_medium,
      payload.utm_campaign,
      payload.utm_term,
      payload.utm_content,
      payload.gclid,
      payload.fbclid,
      payload.msclkid,
      payload.wbraid,
      payload.gbraid,
      deps.ip.slice(0, 45),
      geo.country_code === "XX" ? null : geo.country_code,
      geo.country_name === "unknown" ? null : geo.country_name,
      geo.region_name === "unknown" ? null : geo.region_name,
      geo.city_name === "unknown" ? null : geo.city_name,
      geo.asn,
      geo.network_provider,
      geo.geo_source,
      payload.language,
      payload.screen_w,
      payload.screen_h,
      pageviews,
      eventCount,
      orderId,
    ]
  );

  // Round-trip 2: multi-row event insert
  const placeholders: string[] = [];
  const params: unknown[] = [];
  for (const ev of payload.events) {
    placeholders.push("(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
    const evTime = ev.event_time.replace("T", " ").replace("Z", "").slice(0, 23);
    params.push(
      payload.session_id,
      payload.visitor_id,
      evTime,
      ev.event_type,
      ev.path,
      ev.title,
      ev.referrer_path,
      ev.props_json,
      ev.time_on_page_ms,
      ev.scroll_depth_pct,
      ev.click_id,
      ev.search_term,
      ev.http_status,
      ev.error_kind,
      ev.error_name,
      ev.order_id
    );
  }

  await deps.query(
    `INSERT INTO insights_events (
      session_id, visitor_id, event_time, event_type, path, title, referrer_path,
      props_json, time_on_page_ms, scroll_depth_pct, click_id, search_term,
      http_status, error_kind, error_name, order_id
    ) VALUES ${placeholders.join(",")}`,
    params
  );

  // Cheap daily rollup increments (same request)
  const atc = payload.events.filter((e) => e.event_type === "cart_add" || e.click_id === "cart_add").length;
  const checkoutStarts = payload.events.filter((e) => e.event_type === "checkout_start").length;
  const placeOrders = payload.events.filter(
    (e) => e.event_type === "checkout_place_order" || e.click_id === "place_order"
  ).length;

  await deps.query(
    `INSERT INTO insights_daily_summary (
      summary_date, sessions, pageviews, bot_sessions, add_to_cart, checkout_starts, place_order_clicks
    ) VALUES (?, 1, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      sessions = sessions + 1,
      pageviews = pageviews + VALUES(pageviews),
      bot_sessions = bot_sessions + VALUES(bot_sessions),
      add_to_cart = add_to_cart + VALUES(add_to_cart),
      checkout_starts = checkout_starts + VALUES(checkout_starts),
      place_order_clicks = place_order_clicks + VALUES(place_order_clicks)`,
    [summaryDate, pageviews, bot.is_bot, atc, checkoutStarts, placeOrders]
  );

  await deps.query(
    `INSERT INTO insights_geo_daily (
      summary_date, country_code, country_name, region_name, city_name, sessions, pageviews
    ) VALUES (?, ?, ?, ?, ?, 1, ?)
    ON DUPLICATE KEY UPDATE
      sessions = sessions + 1,
      pageviews = pageviews + VALUES(pageviews)`,
    [
      summaryDate,
      geo.country_code === "XX" ? "" : geo.country_code,
      geo.country_name === "unknown" ? "" : geo.country_name,
      geo.region_name === "unknown" ? "" : geo.region_name,
      geo.city_name === "unknown" ? "" : geo.city_name,
      pageviews,
    ]
  );

  const bucket = sourceBucket(payload);
  await deps.query(
    `INSERT INTO insights_source_daily (
      summary_date, source_bucket, utm_source, utm_medium, utm_campaign, sessions
    ) VALUES (?, ?, ?, ?, ?, 1)
    ON DUPLICATE KEY UPDATE sessions = sessions + 1`,
    [
      summaryDate,
      bucket,
      payload.utm_source || "",
      payload.utm_medium || "",
      payload.utm_campaign || "",
    ]
  );

  // page daily — aggregate by path in this batch
  const byPath = new Map<string, number>();
  for (const ev of payload.events) {
    if (ev.event_type === "page_view") {
      byPath.set(ev.path, (byPath.get(ev.path) || 0) + 1);
    }
  }
  for (const [path, pv] of byPath) {
    await deps.query(
      `INSERT INTO insights_page_daily (summary_date, path, pageviews, unique_sessions)
       VALUES (?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE
         pageviews = pageviews + VALUES(pageviews),
         unique_sessions = unique_sessions + 1`,
      [summaryDate, path.slice(0, INSIGHTS_PATH_MAX), pv]
    );
  }

  return { stored: true, eventCount };
}
