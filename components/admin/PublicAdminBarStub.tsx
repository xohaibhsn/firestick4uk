"use client";

/**
 * Tiny always-loaded stub: if f4uk_ah=1 is absent → null (no fetch, no chunk).
 * If present (and not /sidhu*, not cms_preview=1, not iframe) → dynamic-import the bar.
 */

import { useEffect, useState, type ComponentType } from "react";
import { hasAdminHintCookie } from "@/lib/adminHintCookie";

export default function PublicAdminBarStub() {
  const [Bar, setBar] = useState<ComponentType | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    if (!hasAdminHintCookie()) return;

    const path = window.location.pathname || "/";
    if (path === "/sidhu" || path.startsWith("/sidhu/")) return;

    try {
      const sp = new URLSearchParams(window.location.search || "");
      if (sp.get("cms_preview") === "1") return;
    } catch {
      /* ignore */
    }

    try {
      if (window.self !== window.top) return;
    } catch {
      return; // cross-origin iframe
    }

    let cancelled = false;
    import("./PublicAdminBar")
      .then((m) => {
        if (!cancelled) setBar(() => m.default);
      })
      .catch(() => {
        /* ignore load failure */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!Bar) return null;
  return <Bar />;
}
