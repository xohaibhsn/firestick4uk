/**
 * Hard-coded Microsoft Clarity load gates and route exclusions.
 * Exclusions are NOT CMS-editable.
 */

import {
  isValidClarityProjectId,
  type ClarityCmsSettings,
} from "./clarityConfig";

/** Exact production hostname only — no staging, localhost, www, or preview hosts. */
export const CLARITY_PRODUCTION_HOSTNAME = "firestick4uk.com";

/** Query keys that exclude when the lower-cased key CONTAINS the token. */
export const CLARITY_EXCLUDED_QUERY_CONTAINS = [
  "order",
  "email",
  "token",
  "receipt",
  "phone",
  "address",
] as const;

/** Query keys that exclude only on exact equality (lower-cased). */
export const CLARITY_EXCLUDED_QUERY_EQUALS = ["id", "ref"] as const;

/**
 * Click-id / marketing / listing keys that must NOT exclude even if they
 * contain letters overlapping sensitive tokens (e.g. gclid contains no
 * sensitive substring today; listed explicitly for the C4 contract).
 */
export const CLARITY_QUERY_ALLOWLIST = [
  "gclid",
  "fbclid",
  "msclkid",
  "wbraid",
  "gbraid",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "q",
  "page",
  "sort",
  "category",
] as const;

export type ClarityRouteInput = {
  pathname: string;
  search?: string;
};

/**
 * True when the current route must never be recorded.
 * Paths: /sidhu (+nested), /api (+nested), /cart (+nested including /cart/success),
 * /order-tracking (+nested). Also any URL whose query string includes a sensitive key.
 */
export function isClarityExcludedRoute(input: ClarityRouteInput): boolean {
  const pathname = normalizePathname(input.pathname);
  if (pathname === "/sidhu" || pathname.startsWith("/sidhu/")) return true;
  if (pathname === "/api" || pathname.startsWith("/api/")) return true;
  if (pathname === "/cart" || pathname.startsWith("/cart/")) return true;
  if (
    pathname === "/order-tracking" ||
    pathname.startsWith("/order-tracking/")
  ) {
    return true;
  }
  if (queryHasExcludedKey(input.search || "")) return true;
  return false;
}

export function isClarityProductionHostname(hostname: string): boolean {
  return String(hostname || "").trim().toLowerCase() === CLARITY_PRODUCTION_HOSTNAME;
}

export type ClarityLoadDecision = {
  load: boolean;
  reason:
    | "ok"
    | "cms_disabled"
    | "invalid_project_id"
    | "hostname"
    | "analytics_consent"
    | "excluded_route";
};

/**
 * R2 load matrix — ALL conditions must hold.
 * Does not inject; pure decision helper for tests and the client loader.
 */
export function shouldLoadClarity(opts: {
  cms: ClarityCmsSettings;
  hostname: string;
  analyticsConsent: boolean;
  pathname: string;
  search?: string;
}): ClarityLoadDecision {
  if (!opts.cms.enabled) {
    return { load: false, reason: "cms_disabled" };
  }
  if (!isValidClarityProjectId(opts.cms.projectId)) {
    return { load: false, reason: "invalid_project_id" };
  }
  if (!isClarityProductionHostname(opts.hostname)) {
    return { load: false, reason: "hostname" };
  }
  if (!opts.analyticsConsent) {
    return { load: false, reason: "analytics_consent" };
  }
  if (
    isClarityExcludedRoute({
      pathname: opts.pathname,
      search: opts.search,
    })
  ) {
    return { load: false, reason: "excluded_route" };
  }
  return { load: true, reason: "ok" };
}

export function clarityTagScriptUrl(projectId: string): string {
  return `https://www.clarity.ms/tag/${encodeURIComponent(projectId)}`;
}

/** Exported for unit tests — single query-key decision. */
export function isClarityExcludedQueryKey(rawKey: string): boolean {
  const key = String(rawKey || "").trim().toLowerCase();
  if (!key) return false;
  if ((CLARITY_QUERY_ALLOWLIST as readonly string[]).includes(key)) {
    return false;
  }
  if ((CLARITY_EXCLUDED_QUERY_EQUALS as readonly string[]).includes(key)) {
    return true;
  }
  if (key.endsWith("_id") || key.endsWith("-id")) {
    return true;
  }
  for (const token of CLARITY_EXCLUDED_QUERY_CONTAINS) {
    if (key.includes(token)) return true;
  }
  return false;
}

function normalizePathname(pathname: string): string {
  let p = String(pathname || "").trim().toLowerCase() || "/";
  if (!p.startsWith("/")) p = `/${p}`;
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p;
}

function queryHasExcludedKey(search: string): boolean {
  const raw = String(search || "").trim();
  if (!raw || raw === "?") return false;
  const qs = raw.startsWith("?") ? raw.slice(1) : raw;
  if (!qs) return false;
  const params = new URLSearchParams(qs);
  for (const key of params.keys()) {
    if (isClarityExcludedQueryKey(key)) return true;
  }
  return false;
}
