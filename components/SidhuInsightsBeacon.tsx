"use client";

/**
 * Consent-gated Sidhu Insights beacon. Renders null.
 * Starts only when analytics consent is true, GPC is off, and path is not excluded.
 * Zero network requests when consent is off.
 *
 * Consecutive-204 rule: ingest returns 204 when recording is disabled. After
 * INSIGHTS_CONSECUTIVE_204_STOP (5) consecutive 204s within a document session,
 * the client stops sending for the rest of that session (no public settings poll).
 */

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  TRACKING_CONSENT_CHANGED_EVENT,
  readTrackingConsent,
  type TrackingConsentPreference,
} from "@/lib/trackingConsent";
import {
  INSIGHTS_SCROLL_MARKS,
  clearInsightsSessionId,
  createInsightsController,
  hasGlobalPrivacyControl,
  isInsightsExcludedPath,
  nextScrollWatermark,
  resolveClickTaxonomyId,
  sanitizeSearchTerm,
  scrollDepthPercent,
  shouldRecordInsights,
  type InsightsController,
} from "@/lib/insightsClient";

function scheduleIdle(fn: () => void, ms = 0): number | ReturnType<typeof setTimeout> {
  if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
    return window.requestIdleCallback(() => fn(), { timeout: Math.max(ms, 1) }) as unknown as number;
  }
  return setTimeout(fn, ms);
}

function clearIdle(id: number | ReturnType<typeof setTimeout>): void {
  if (
    typeof window !== "undefined" &&
    typeof window.cancelIdleCallback === "function" &&
    typeof id === "number"
  ) {
    try {
      window.cancelIdleCallback(id);
      return;
    } catch {
      /* fall through */
    }
  }
  clearTimeout(id as ReturnType<typeof setTimeout>);
}

export default function SidhuInsightsBeacon() {
  const pathname = usePathname() || "/";
  const controllerRef = useRef<InsightsController | null>(null);
  const preferenceRef = useRef<TrackingConsentPreference | null>(null);
  const scrollMaxRef = useRef(0);

  // Mount once: controller + global listeners
  useEffect(() => {
    if (typeof window === "undefined") return;

    preferenceRef.current = readTrackingConsent();

    const hooks = {
      getPathname: () => window.location.pathname || "/",
      getSearch: () => window.location.search || "",
      getReferrer: () => document.referrer || "",
      getTitle: () => document.title || "",
      getLanguage: () => navigator.language || "",
      getScreen: () => ({
        w: window.screen?.width || 0,
        h: window.screen?.height || 0,
      }),
      localStorage: window.localStorage,
      sessionStorage: window.sessionStorage,
      now: () => Date.now(),
      schedule: (fn: () => void, ms?: number) => scheduleIdle(fn, ms ?? 0),
      clearSchedule: (id: number | ReturnType<typeof setTimeout>) => clearIdle(id),
    };

    const controller = createInsightsController(hooks);
    controllerRef.current = controller;

    const maybeStart = (preference: TrackingConsentPreference | null) => {
      const path = window.location.pathname || "/";
      const gpc = hasGlobalPrivacyControl();
      if (!shouldRecordInsights({ preference, pathname: path, gpc, storage: window.localStorage })) {
        controller.stop({ dropQueue: true });
        return;
      }
      controller.start();
    };

    const onConsentChanged = (event: Event) => {
      const detail = (event as CustomEvent<TrackingConsentPreference>).detail;
      const previous = preferenceRef.current;
      const next =
        detail && typeof detail.analytics === "boolean"
          ? detail
          : readTrackingConsent();
      preferenceRef.current = next;

      const revoked = !!(previous?.analytics && next && !next.analytics);
      if (revoked || !next?.analytics) {
        clearInsightsSessionId(window.sessionStorage);
        controller.stop({ dropQueue: true });
        return;
      }
      maybeStart(next);
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") controller.flush();
    };
    const onPageHide = () => {
      controller.flush();
    };

    const onClick = (ev: Event) => {
      if (!controller.isRunning() || !controller.networkAllowed()) return;
      const target = ev.target;
      if (!(target instanceof Element)) return;
      const clickId = resolveClickTaxonomyId(target);
      if (!clickId) return;
      controller.enqueue({
        t: clickId.startsWith("pay_method")
          ? "checkout_payment"
          : clickId === "place_order"
            ? "checkout_place_order"
            : clickId === "cart_add"
              ? "cart_add"
              : clickId === "cart_view"
                ? "cart_view"
                : "click",
        ts: new Date().toISOString(),
        path: window.location.pathname || "/",
        click_id: clickId,
      });
    };

    const onScrollWatermark = () => {
      if (!controller.isRunning() || !controller.networkAllowed()) return;
      scheduleIdle(() => {
        const depth = scrollDepthPercent(
          window.scrollY || window.pageYOffset || 0,
          Math.max(
            document.documentElement?.scrollHeight || 0,
            document.body?.scrollHeight || 0
          ),
          window.innerHeight || 0
        );
        const hit = nextScrollWatermark(scrollMaxRef.current, depth, INSIGHTS_SCROLL_MARKS);
        if (hit == null) return;
        scrollMaxRef.current = hit;
        controller.enqueue({
          t: "scroll_depth",
          ts: new Date().toISOString(),
          path: window.location.pathname || "/",
          scroll_depth_pct: hit,
        });
      });
    };

    const onSearchClick = (ev: Event) => {
      if (!controller.isRunning() || !controller.networkAllowed()) return;
      const target = ev.target;
      if (!(target instanceof Element)) return;
      if (!target.classList.contains("search-btn") && !target.closest(".search-btn")) {
        return;
      }
      const wrap = target.closest(".search-bar, .search-wrap");
      const input = wrap?.querySelector(
        "input.search-input, input[type='search'], input"
      ) as HTMLInputElement | null;
      const term = sanitizeSearchTerm(input?.value || "");
      if (!term) return;
      controller.enqueue({
        t: "search",
        ts: new Date().toISOString(),
        path: window.location.pathname || "/",
        search_term: term,
      });
    };

    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key !== "Enter") return;
      if (!controller.isRunning() || !controller.networkAllowed()) return;
      const target = ev.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (!target.classList.contains("search-input")) return;
      const term = sanitizeSearchTerm(target.value || "");
      if (!term) return;
      controller.enqueue({
        t: "search",
        ts: new Date().toISOString(),
        path: window.location.pathname || "/",
        search_term: term,
      });
    };

    const onError = (ev: ErrorEvent) => {
      if (!controller.isRunning() || !controller.networkAllowed()) return;
      const name =
        ev.error && typeof ev.error === "object" && "name" in ev.error
          ? String((ev.error as { name?: string }).name || "Error")
          : "Error";
      controller.enqueue({
        t: "error",
        ts: new Date().toISOString(),
        path: window.location.pathname || "/",
        error_kind: "js_error",
        error_name: name.slice(0, 128),
      });
    };

    const onRejection = (ev: PromiseRejectionEvent) => {
      if (!controller.isRunning() || !controller.networkAllowed()) return;
      let name = "UnhandledRejection";
      const reason = ev.reason;
      if (reason && typeof reason === "object" && "name" in reason) {
        name = String((reason as { name?: string }).name || name);
      }
      controller.enqueue({
        t: "error",
        ts: new Date().toISOString(),
        path: window.location.pathname || "/",
        error_kind: "js_error",
        error_name: name.slice(0, 128),
      });
    };

    window.addEventListener(TRACKING_CONSENT_CHANGED_EVENT, onConsentChanged as EventListener);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("click", onClick, true);
    document.addEventListener("click", onSearchClick, true);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("scroll", onScrollWatermark, { passive: true });
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    maybeStart(preferenceRef.current);

    return () => {
      window.removeEventListener(TRACKING_CONSENT_CHANGED_EVENT, onConsentChanged as EventListener);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("click", onSearchClick, true);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("scroll", onScrollWatermark);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      controller.stop({ dropQueue: true });
      controllerRef.current = null;
    };
  }, []);

  // SPA navigation
  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    scrollMaxRef.current = 0;
    const pref = preferenceRef.current ?? readTrackingConsent();
    const gpc = hasGlobalPrivacyControl();

    if (
      isInsightsExcludedPath(pathname) ||
      !shouldRecordInsights({ preference: pref, pathname, gpc, storage: window.localStorage })
    ) {
      controller.stop({ dropQueue: true });
      return;
    }

    if (controller.isRunning()) {
      controller.handlePathChange(pathname);
    } else {
      controller.start();
    }
  }, [pathname]);

  return null;
}
