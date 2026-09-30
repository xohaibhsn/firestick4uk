/** Client-side tracking preference model (no identity, no DB). */

export const TRACKING_CONSENT_STORAGE_KEY = "firestick_tracking_consent_v1";
export const TRACKING_CONSENT_VERSION = 1;
export const TRACKING_OPEN_PREFERENCES_EVENT = "firestick:open-tracking-preferences";

export const GA_MEASUREMENT_ID = "G-055GHH06KD";
export const GOOGLE_ADS_ID = "AW-18404353244";

export type TrackingConsentPreference = {
  version: typeof TRACKING_CONSENT_VERSION;
  analytics: boolean;
  advertising: boolean;
  updatedAt?: string;
};

export function isTrackingConsentPreference(
  value: unknown
): value is TrackingConsentPreference {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    v.version === TRACKING_CONSENT_VERSION &&
    typeof v.analytics === "boolean" &&
    typeof v.advertising === "boolean"
  );
}

export function readTrackingConsent(): TrackingConsentPreference | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(TRACKING_CONSENT_STORAGE_KEY);
    if (!raw || !String(raw).trim()) return null;
    const parsed = JSON.parse(raw);
    if (!isTrackingConsentPreference(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeTrackingConsent(
  preference: Omit<TrackingConsentPreference, "version" | "updatedAt"> & {
    analytics: boolean;
    advertising: boolean;
  }
): TrackingConsentPreference {
  const next: TrackingConsentPreference = {
    version: TRACKING_CONSENT_VERSION,
    analytics: !!preference.analytics,
    advertising: !!preference.advertising,
    updatedAt: new Date().toISOString(),
  };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(
        TRACKING_CONSENT_STORAGE_KEY,
        JSON.stringify(next)
      );
    } catch {
      /* ignore quota / private mode */
    }
  }
  return next;
}

export function openTrackingPreferences(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(TRACKING_OPEN_PREFERENCES_EVENT));
}

export function anyOptionalTrackingGranted(
  preference: TrackingConsentPreference | null
): boolean {
  return !!(preference && (preference.analytics || preference.advertising));
}

/**
 * GA4 / gtag first-party cookie names used with G-055GHH06KD.
 * Does not match unrelated names that merely contain "ga".
 */
export function isGoogleAnalyticsCookieName(name: string): boolean {
  const n = String(name || "");
  if (n === "_ga" || n === "_gid") return true;
  if (n.startsWith("_ga_")) return true;
  if (n.startsWith("_gat")) return true;
  return false;
}

/**
 * Google Ads conversion-linker / click first-party cookies (_gcl_*, _gac_*).
 */
export function isGoogleAdsCookieName(name: string): boolean {
  const n = String(name || "");
  return n.startsWith("_gcl_") || n.startsWith("_gac_");
}

/** Pure selector — never returns cart/admin/consent keys. */
export function selectGoogleTrackingCookiesToClear(
  cookieNames: string[],
  opts: { clearAnalytics: boolean; clearAdvertising: boolean }
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of cookieNames) {
    const name = String(raw || "").trim();
    if (!name || seen.has(name)) continue;
    if (
      name === TRACKING_CONSENT_STORAGE_KEY ||
      name === "firestick_cart" ||
      name === "orderSuccess" ||
      name.startsWith("admin")
    ) {
      continue;
    }
    const hitA = opts.clearAnalytics && isGoogleAnalyticsCookieName(name);
    const hitAd = opts.clearAdvertising && isGoogleAdsCookieName(name);
    if (!hitA && !hitAd) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

function cookieDomainCandidates(hostname: string): Array<string | null> {
  const host = String(hostname || "").trim().toLowerCase();
  const domains: Array<string | null> = [null];
  if (!host || host === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    return domains;
  }
  domains.push(host);
  if (!host.startsWith(".")) domains.push(`.${host}`);
  const parts = host.replace(/^\./, "").split(".");
  if (parts.length >= 2) {
    const base = parts.slice(-2).join(".");
    domains.push(`.${base}`);
  }
  return [...new Set(domains)];
}

/**
 * Expire only selected Google tracking cookies for path=/ on host-only and
 * apex Domain variants. Does not touch localStorage / sessionStorage.
 */
export function clearRevokedGoogleTrackingCookies(opts: {
  clearAnalytics: boolean;
  clearAdvertising: boolean;
}): string[] {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return [];
  }
  if (!opts.clearAnalytics && !opts.clearAdvertising) return [];

  const names = (document.cookie || "")
    .split(";")
    .map((part) => part.split("=")[0].trim())
    .filter(Boolean);
  const targets = selectGoogleTrackingCookiesToClear(names, opts);
  if (!targets.length) return [];

  const domains = cookieDomainCandidates(window.location.hostname);
  const expired = "Thu, 01 Jan 1970 00:00:00 GMT";
  for (const name of targets) {
    for (const domain of domains) {
      const domainAttr = domain ? `; domain=${domain}` : "";
      document.cookie = `${name}=; expires=${expired}; path=/${domainAttr}`;
    }
  }
  return targets;
}
