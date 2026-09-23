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
