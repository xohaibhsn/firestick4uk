"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useSiteContentContext } from "@/components/SiteContentProvider";
import { readClarityCmsSettings } from "@/lib/clarityConfig";
import {
  applyClarityConsentV2,
  revokeClarityAnalyticsStoppingRecording,
  type ClarityWindowApi,
} from "@/lib/clarityConsent";
import {
  clarityTagScriptUrl,
  isClarityExcludedRoute,
  shouldLoadClarity,
} from "@/lib/clarityGating";
import {
  TRACKING_CONSENT_CHANGED_EVENT,
  readTrackingConsent,
  type TrackingConsentPreference,
} from "@/lib/trackingConsent";

declare global {
  interface Window {
    clarity?: ClarityWindowApi;
  }
}

const CLARITY_SCRIPT_ID = "firestick-clarity-tag";

/** Survives remounts within the same full document load. */
const session = {
  scriptInjected: false,
  projectId: "" as string,
  consentSignalled: false,
};

function ensureClarityStub(): void {
  if (typeof window.clarity === "function") return;
  const stub: ClarityWindowApi = function clarity() {
    // eslint-disable-next-line prefer-rest-params -- Clarity queue uses Arguments-like push
    (stub.q = stub.q || []).push(arguments);
  } as ClarityWindowApi;
  stub.q = stub.q || [];
  window.clarity = stub;
}

function injectClarityScript(projectId: string): void {
  if (session.scriptInjected) return;
  if (document.getElementById(CLARITY_SCRIPT_ID)) {
    session.scriptInjected = true;
    session.projectId = projectId;
    return;
  }
  ensureClarityStub();
  const script = document.createElement("script");
  script.id = CLARITY_SCRIPT_ID;
  script.async = true;
  script.src = clarityTagScriptUrl(projectId);
  document.head.appendChild(script);
  session.scriptInjected = true;
  session.projectId = projectId;
}

function currentSearch(): string {
  if (typeof window === "undefined") return "";
  return window.location.search || "";
}

function currentHostname(): string {
  if (typeof window === "undefined") return "";
  return window.location.hostname || "";
}

/**
 * Client-only Clarity loader. Injects after hydration when CMS + hostname +
 * analytics consent + route gates all pass. Never SSR-injects the tag.
 *
 * Web client API has no pause/stop (see Clarity client API docs). When Clarity
 * was already injected and the visitor client-navigates to an excluded route,
 * we force a full document load so the script is absent on the excluded page.
 */
export default function MicrosoftClarity() {
  const pathname = usePathname() || "/";
  const { sc, loaded: cmsLoaded } = useSiteContentContext();
  const preferenceRef = useRef<TrackingConsentPreference | null>(null);
  const forcingReloadRef = useRef(false);

  useEffect(() => {
    preferenceRef.current = readTrackingConsent();

    const evaluate = (preference: TrackingConsentPreference | null) => {
      if (!cmsLoaded || forcingReloadRef.current) return;

      const cms = readClarityCmsSettings(sc);
      const search = currentSearch();
      const hostname = currentHostname();
      const excluded = isClarityExcludedRoute({ pathname, search });

      // Already recording, then SPA-navigated into a private/excluded route:
      // no official web pause API → full document load so the tag is absent.
      if (session.scriptInjected && excluded) {
        forcingReloadRef.current = true;
        const target =
          window.location.pathname +
          window.location.search +
          window.location.hash;
        window.location.replace(target);
        return;
      }

      const decision = shouldLoadClarity({
        cms,
        hostname,
        analyticsConsent: !!preference?.analytics,
        pathname,
        search,
      });

      if (!decision.load) return;

      injectClarityScript(cms.projectId);
      applyClarityConsentV2(window.clarity, {
        analytics: true,
        advertising: !!preference?.advertising,
      });
      session.consentSignalled = true;
    };

    const onConsentChanged = (event: Event) => {
      const detail = (event as CustomEvent<TrackingConsentPreference>).detail;
      const previous = preferenceRef.current;
      const next =
        detail && typeof detail.analytics === "boolean"
          ? detail
          : readTrackingConsent();
      preferenceRef.current = next;

      const analyticsRevoked = !!(previous?.analytics && next && !next.analytics);
      if (analyticsRevoked) {
        // Consent API v2: denial alone leaves no-consent recording on this
        // document. After signalling + cookie erase, defer a full reload so
        // TrackingConsent Google cleanup can finish; do not rely on its reload.
        revokeClarityAnalyticsStoppingRecording(
          { clarity: window.clarity },
          { scriptInjected: session.scriptInjected }
        );
        session.consentSignalled = false;
        return;
      }
      evaluate(next);
    };

    window.addEventListener(
      TRACKING_CONSENT_CHANGED_EVENT,
      onConsentChanged as EventListener
    );
    evaluate(preferenceRef.current);
    return () => {
      window.removeEventListener(
        TRACKING_CONSENT_CHANGED_EVENT,
        onConsentChanged as EventListener
      );
    };
  }, [cmsLoaded, sc, pathname]);

  return null;
}
