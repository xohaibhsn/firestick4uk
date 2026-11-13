"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useSiteContentContext } from "@/components/SiteContentProvider";
import {
  fireWhatsAppClick,
  isSidhuPath,
  resolveWhatsAppClickTarget,
  setAdsConversionContentMap,
} from "@/lib/adsConversions";

/**
 * Keeps CMS conversion labels cached and mounts one delegated WhatsApp
 * click listener (wa.me / api.whatsapp.com / web.whatsapp.com / whatsapp:).
 * Does not change link behaviour (no preventDefault).
 */
export default function AdsConversionTracking() {
  const pathname = usePathname() || "/";
  const { sc, loaded } = useSiteContentContext();

  useEffect(() => {
    if (!loaded) return;
    setAdsConversionContentMap(sc as Record<string, string>);
  }, [sc, loaded]);

  useEffect(() => {
    if (isSidhuPath(pathname)) return;

    const onClick = (event: MouseEvent) => {
      if (isSidhuPath()) return;
      const anchor = resolveWhatsAppClickTarget(event.target);
      if (!anchor) return;
      const source =
        typeof window !== "undefined"
          ? window.location.pathname || pathname || "/"
          : pathname || "/";
      fireWhatsAppClick(source);
    };

    document.addEventListener("click", onClick, false);
    return () => document.removeEventListener("click", onClick, false);
  }, [pathname]);

  return null;
}
