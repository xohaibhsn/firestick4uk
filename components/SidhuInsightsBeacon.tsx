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
  buildClickLabel,
  clearInsightsSessionId,
  createInsightsController,
  findClickableInsightsTarget,
  hasGlobalPrivacyControl,
  isInsightsExcludedPath,
  resolveClickTaxonomyId,
  roundPctTo2,
  sanitizeSearchTerm,
  scrollDepthPercent,
  shouldRecordInsights,
  viewportBucket,
  type InsightsController,
} from "@/lib/insightsClient";

function clickEventType(clickId: string | null): string {
  if (!clickId) return "click";
  if (clickId.startsWith("pay_method")) return "checkout_payment";
  if (clickId === "place_order") return "checkout_place_order";
  if (clickId === "cart_add") return "cart_add";
  if (clickId === "cart_view") return "cart_view";
  return "click";
}

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
      isVisible: () => document.visibilityState !== "hidden",
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

    // Engaged time: the controller only accumulates while the tab is visible.
    const onVisibility = () => {
      if (document.visibilityState === "hidden") controller.pageHidden();
      else controller.setVisible(true);
    };
    const onPageHide = () => {
      controller.pageHidden();
    };

    // Capture-phase click capture: element identity + position only, never field values.
    const onClick = (ev: MouseEvent) => {
      if (!controller.isRunning() || !controller.networkAllowed()) return;
      const target = ev.target;
      if (!(target instanceof Element)) return;
      const taxonomyId = resolveClickTaxonomyId(target);
      const clickable = findClickableInsightsTarget(target);
      if (!taxonomyId && !clickable) return;
      const el: Element = clickable || target;

      const docEl = document.documentElement;
      const docW = Math.max(docEl?.scrollWidth || 0, docEl?.clientWidth || 0, window.innerWidth || 0, 1);
      const docH = Math.max(
        docEl?.scrollHeight || 0,
        document.body?.scrollHeight || 0,
        window.innerHeight || 0,
        1
      );
      let pageX = ev.pageX;
      let pageY = ev.pageY;
      if (ev.detail === 0 || (ev.clientX === 0 && ev.clientY === 0)) {
        const r = el.getBoundingClientRect();
        pageX = r.left + r.width / 2 + (window.scrollX || 0);
        pageY = r.top + r.height / 2 + (window.scrollY || 0);
      }

      controller.recordClick({
        t: clickEventType(taxonomyId),
        clickId: taxonomyId || "el",
        tag: el.tagName.toLowerCase(),
        label: buildClickLabel(el as HTMLElement, { origin: window.location.origin }),
        xPct: roundPctTo2((pageX / docW) * 100),
        yPct: roundPctTo2((pageY / docH) * 100),
        vw: viewportBucket(window.innerWidth || 0),
        x: pageX,
        y: pageY,
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
        controller.recordScroll(depth);
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
    document.addEventListener("click", onClick, { capture: true, passive: true });
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
