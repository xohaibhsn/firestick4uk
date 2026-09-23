"use client";

import { useCallback, useEffect, useId, useState } from "react";
import {
  GA_MEASUREMENT_ID,
  GOOGLE_ADS_ID,
  TRACKING_OPEN_PREFERENCES_EVENT,
  anyOptionalTrackingGranted,
  readTrackingConsent,
  writeTrackingConsent,
  type TrackingConsentPreference,
} from "@/lib/trackingConsent";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const GTAG_SCRIPT_ID = "firestick-gtag-js";

/** Session guards — survive remounts in the same page load. */
const session = {
  scriptInjected: false,
  gtagJsIssued: false,
  gaConfigured: false,
  adsConfigured: false,
  consentDefaultsIssued: false,
};

function ensureGtagStub(): void {
  window.dataLayer = window.dataLayer || [];
  if (typeof window.gtag !== "function") {
    window.gtag = function gtag(...args: unknown[]) {
      window.dataLayer!.push(args);
    };
  }
}

function issueConsentDefaults(): void {
  if (session.consentDefaultsIssued) return;
  ensureGtagStub();
  window.gtag!("consent", "default", {
    analytics_storage: "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
  session.consentDefaultsIssued = true;
}

function issueConsentUpdate(preference: TrackingConsentPreference): void {
  ensureGtagStub();
  window.gtag!("consent", "update", {
    analytics_storage: preference.analytics ? "granted" : "denied",
    ad_storage: preference.advertising ? "granted" : "denied",
    ad_user_data: preference.advertising ? "granted" : "denied",
    ad_personalization: preference.advertising ? "granted" : "denied",
  });
}

function injectGtagScriptOnce(): void {
  if (session.scriptInjected) return;
  if (document.getElementById(GTAG_SCRIPT_ID)) {
    session.scriptInjected = true;
    return;
  }
  const script = document.createElement("script");
  script.id = GTAG_SCRIPT_ID;
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(script);
  session.scriptInjected = true;
}

function issueGtagJsOnce(): void {
  if (session.gtagJsIssued) return;
  ensureGtagStub();
  window.gtag!("js", new Date());
  session.gtagJsIssued = true;
}

function configurePermittedProducts(preference: TrackingConsentPreference): void {
  ensureGtagStub();
  if (preference.analytics && !session.gaConfigured) {
    window.gtag!("config", GA_MEASUREMENT_ID);
    session.gaConfigured = true;
  }
  if (preference.advertising && !session.adsConfigured) {
    window.gtag!("config", GOOGLE_ADS_ID);
    session.adsConfigured = true;
  }
}

/**
 * Initialize Google tags only when at least one optional purpose is granted.
 * Does not load gtag.js for deny / no-choice visitors.
 */
function purposeRevoked(
  previous: TrackingConsentPreference | null,
  next: TrackingConsentPreference
): boolean {
  if (!previous) return false;
  return (
    (previous.analytics && !next.analytics) ||
    (previous.advertising && !next.advertising)
  );
}

function applyTrackingPreference(
  preference: TrackingConsentPreference,
  options?: { reloadIfRevoked?: boolean; previous?: TrackingConsentPreference | null }
): void {
  const previous = options?.previous ?? null;
  const hadOptional =
    previous != null && anyOptionalTrackingGranted(previous);
  const hasOptional = anyOptionalTrackingGranted(preference);
  const revoked = purposeRevoked(previous, preference);

  if (!hasOptional) {
    if (typeof window.gtag === "function") {
      issueConsentUpdate(preference);
    }
    if (
      options?.reloadIfRevoked &&
      (hadOptional || session.scriptInjected || session.gaConfigured || session.adsConfigured)
    ) {
      window.location.reload();
    }
    return;
  }

  // If a previously granted purpose was turned off, reload for a clean
  // session so the denied product is not left configured.
  if (options?.reloadIfRevoked && revoked && (session.gaConfigured || session.adsConfigured)) {
    issueConsentUpdate(preference);
    window.location.reload();
    return;
  }

  issueConsentDefaults();
  issueConsentUpdate(preference);
  injectGtagScriptOnce();
  issueGtagJsOnce();
  configurePermittedProducts(preference);
}

export default function TrackingConsent() {
  const [hydrated, setHydrated] = useState(false);
  const [preference, setPreference] = useState<TrackingConsentPreference | null>(
    null
  );
  const [bannerVisible, setBannerVisible] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draftAnalytics, setDraftAnalytics] = useState(false);
  const [draftAdvertising, setDraftAdvertising] = useState(false);
  const titleId = useId();
  const analyticsId = useId();
  const advertisingId = useId();

  useEffect(() => {
    const saved = readTrackingConsent();
    setPreference(saved);
    setBannerVisible(saved == null);
    setHydrated(true);
    if (saved && anyOptionalTrackingGranted(saved)) {
      applyTrackingPreference(saved);
    }
  }, []);

  const openDialog = useCallback((fromPreference?: TrackingConsentPreference | null) => {
    const base = fromPreference ?? readTrackingConsent();
    setDraftAnalytics(base?.analytics ?? false);
    setDraftAdvertising(base?.advertising ?? false);
    setDialogOpen(true);
    setBannerVisible(false);
  }, []);

  useEffect(() => {
    const onOpen = () => openDialog(readTrackingConsent());
    window.addEventListener(TRACKING_OPEN_PREFERENCES_EVENT, onOpen);
    return () => window.removeEventListener(TRACKING_OPEN_PREFERENCES_EVENT, onOpen);
  }, [openDialog]);

  const persistAndApply = useCallback(
    (
      next: { analytics: boolean; advertising: boolean },
      opts?: { reloadIfRevoked?: boolean }
    ) => {
      const previous = preference ?? readTrackingConsent();
      const saved = writeTrackingConsent(next);
      setPreference(saved);
      setBannerVisible(false);
      setDialogOpen(false);
      applyTrackingPreference(saved, {
        previous,
        reloadIfRevoked: opts?.reloadIfRevoked ?? true,
      });
    },
    [preference]
  );

  const acceptAll = useCallback(() => {
    persistAndApply({ analytics: true, advertising: true }, { reloadIfRevoked: false });
  }, [persistAndApply]);

  const rejectOptional = useCallback(() => {
    persistAndApply({ analytics: false, advertising: false }, { reloadIfRevoked: true });
  }, [persistAndApply]);

  const savePreferences = useCallback(() => {
    persistAndApply(
      { analytics: draftAnalytics, advertising: draftAdvertising },
      { reloadIfRevoked: true }
    );
  }, [draftAnalytics, draftAdvertising, persistAndApply]);

  if (!hydrated) return null;

  return (
    <>
      <style>{`
        .tc-banner {
          position: fixed; z-index: 9998; left: 0; right: 0; bottom: 0;
          background: #111111; color: #fff; border-top: 1px solid rgba(255,255,255,0.12);
          padding: 16px 20px; box-shadow: 0 -8px 24px rgba(0,0,0,0.35);
        }
        .tc-banner-inner {
          max-width: 1100px; margin: 0 auto;
          display: flex; flex-wrap: wrap; gap: 14px 20px; align-items: center;
          justify-content: space-between;
        }
        .tc-banner-copy { flex: 1 1 280px; font-size: 14px; line-height: 1.45; color: rgba(255,255,255,0.88); }
        .tc-banner-copy strong { color: #fff; font-weight: 600; }
        .tc-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
        .tc-btn {
          appearance: none; border: 1px solid transparent; border-radius: 6px;
          font-size: 13px; font-weight: 600; padding: 10px 14px; cursor: pointer;
          font-family: inherit; line-height: 1.2;
        }
        .tc-btn:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
        .tc-btn-primary { background: #fff; color: #111; }
        .tc-btn-primary:hover { background: #f0f0f0; }
        .tc-btn-secondary {
          background: transparent; color: #fff; border-color: rgba(255,255,255,0.45);
        }
        .tc-btn-secondary:hover { border-color: #fff; }
        .tc-btn-ghost {
          background: transparent; color: rgba(255,255,255,0.9);
          text-decoration: underline; text-underline-offset: 3px; border: none; padding: 10px 8px;
        }
        .tc-btn-ghost:hover { color: #fff; }
        .tc-dialog-backdrop {
          position: fixed; inset: 0; z-index: 9999;
          background: rgba(0,0,0,0.55); display: flex; align-items: flex-end;
          justify-content: center; padding: 16px;
        }
        @media (min-width: 640px) {
          .tc-dialog-backdrop { align-items: center; }
        }
        .tc-dialog {
          width: min(440px, 100%); max-height: min(90vh, 640px); overflow: auto;
          background: #161616; color: #fff; border-radius: 10px;
          border: 1px solid rgba(255,255,255,0.12); padding: 20px 18px 16px;
          box-shadow: 0 16px 40px rgba(0,0,0,0.45);
        }
        .tc-dialog h2 { margin: 0 0 8px; font-size: 18px; font-weight: 700; }
        .tc-dialog-lead { margin: 0 0 16px; font-size: 13px; line-height: 1.45; color: rgba(255,255,255,0.75); }
        .tc-row {
          display: flex; gap: 12px; align-items: flex-start; justify-content: space-between;
          padding: 12px 0; border-top: 1px solid rgba(255,255,255,0.1);
        }
        .tc-row-text { flex: 1; min-width: 0; }
        .tc-row-title { font-size: 14px; font-weight: 600; margin: 0 0 4px; }
        .tc-row-desc { margin: 0; font-size: 12px; line-height: 1.4; color: rgba(255,255,255,0.65); }
        .tc-badge {
          flex-shrink: 0; font-size: 11px; font-weight: 600; padding: 6px 8px;
          border-radius: 4px; background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.85);
        }
        .tc-switch {
          position: relative; width: 44px; height: 26px; flex-shrink: 0; margin-top: 2px;
        }
        .tc-switch input {
          position: absolute; inset: 0; opacity: 0; width: 100%; height: 100%; cursor: pointer; margin: 0;
        }
        .tc-switch-track {
          display: block; width: 44px; height: 26px; border-radius: 999px;
          background: rgba(255,255,255,0.2); transition: background 0.15s;
          pointer-events: none;
        }
        .tc-switch-track::after {
          content: ""; position: absolute; top: 3px; left: 3px;
          width: 20px; height: 20px; border-radius: 50%; background: #fff;
          transition: transform 0.15s;
        }
        .tc-switch input:checked + .tc-switch-track { background: #3d8bfd; }
        .tc-switch input:checked + .tc-switch-track::after { transform: translateX(18px); }
        .tc-switch input:focus-visible + .tc-switch-track { outline: 2px solid #fff; outline-offset: 2px; }
        .tc-dialog-actions {
          display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px;
          padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.1);
        }
        .tc-dialog-actions .tc-btn { flex: 1 1 auto; }
        @media (max-width: 480px) {
          .tc-banner { padding: 14px 14px calc(14px + env(safe-area-inset-bottom, 0px)); }
          .tc-actions { width: 100%; }
          .tc-actions .tc-btn { flex: 1 1 calc(50% - 8px); text-align: center; }
          .tc-actions .tc-btn-ghost { flex: 1 1 100%; }
        }
      `}</style>

      {bannerVisible && (
        <div
          className="tc-banner"
          role="region"
          aria-label="Privacy choices"
        >
          <div className="tc-banner-inner">
            <p className="tc-banner-copy">
              <strong>Privacy choices.</strong> We use optional analytics and
              advertising technologies to understand site use and measure ads.
              Essential features (cart, checkout, login) work without them. You
              can change this anytime via Privacy choices in the footer.
            </p>
            <div className="tc-actions">
              <button type="button" className="tc-btn tc-btn-primary" onClick={acceptAll}>
                Accept all
              </button>
              <button
                type="button"
                className="tc-btn tc-btn-secondary"
                onClick={rejectOptional}
              >
                Reject optional
              </button>
              <button
                type="button"
                className="tc-btn tc-btn-ghost"
                onClick={() => openDialog(null)}
              >
                Choose preferences
              </button>
            </div>
          </div>
        </div>
      )}

      {dialogOpen && (
        <div
          className="tc-dialog-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDialogOpen(false);
          }}
        >
          <div
            className="tc-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
          >
            <h2 id={titleId}>Tracking preferences</h2>
            <p className="tc-dialog-lead">
              Choose which optional technologies this site may use. Essential
              features always stay on.
            </p>

            <div className="tc-row">
              <div className="tc-row-text">
                <p className="tc-row-title">Essential</p>
                <p className="tc-row-desc">
                  Needed for the site to work — cart, checkout, security, and
                  remembering these privacy choices.
                </p>
              </div>
              <span className="tc-badge">Always on</span>
            </div>

            <div className="tc-row">
              <div className="tc-row-text">
                <label className="tc-row-title" htmlFor={analyticsId}>
                  Analytics
                </label>
                <p className="tc-row-desc">
                  Helps us understand how pages are used (Google Analytics). No
                  effect on cart or checkout.
                </p>
              </div>
              <div className="tc-switch">
                <input
                  id={analyticsId}
                  type="checkbox"
                  role="switch"
                  checked={draftAnalytics}
                  aria-checked={draftAnalytics}
                  onChange={(e) => setDraftAnalytics(e.target.checked)}
                />
                <span className="tc-switch-track" aria-hidden="true" />
              </div>
            </div>

            <div className="tc-row">
              <div className="tc-row-text">
                <label className="tc-row-title" htmlFor={advertisingId}>
                  Advertising
                </label>
                <p className="tc-row-desc">
                  Used to measure and improve ads (Google Ads). Separate from
                  analytics.
                </p>
              </div>
              <div className="tc-switch">
                <input
                  id={advertisingId}
                  type="checkbox"
                  role="switch"
                  checked={draftAdvertising}
                  aria-checked={draftAdvertising}
                  onChange={(e) => setDraftAdvertising(e.target.checked)}
                />
                <span className="tc-switch-track" aria-hidden="true" />
              </div>
            </div>

            <div className="tc-dialog-actions">
              <button type="button" className="tc-btn tc-btn-primary" onClick={savePreferences}>
                Save preferences
              </button>
              <button type="button" className="tc-btn tc-btn-secondary" onClick={acceptAll}>
                Accept all
              </button>
              <button type="button" className="tc-btn tc-btn-secondary" onClick={rejectOptional}>
                Reject optional
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
