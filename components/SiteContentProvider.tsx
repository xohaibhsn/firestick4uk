"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { cms, cmsJson, type SiteContentMap } from "@/lib/cms";

type SiteContentContextValue = {
  sc: SiteContentMap;
  loaded: boolean;
};

const SiteContentContext = createContext<SiteContentContextValue | null>(null);

type SiteContentProviderProps = {
  children: ReactNode;
  /**
   * Optional SSR seed (e.g. prices_include_vat + price_incl_vat_suffix).
   * When provided, `loaded` starts true so first paint matches hydration.
   * Client still fetches page=all and merges/replaces with the full map.
   */
  initialContent?: SiteContentMap;
};

/**
 * Single public storefront CMS bootstrap.
 * Performs ONE GET /api/site-content?page=all for the whole tree.
 */
export function SiteContentProvider({
  children,
  initialContent,
}: SiteContentProviderProps) {
  const seeded =
    initialContent &&
    typeof initialContent === "object" &&
    !Array.isArray(initialContent)
      ? initialContent
      : null;
  const [sc, setSc] = useState<SiteContentMap>(() => seeded || {});
  const [loaded, setLoaded] = useState(() => Boolean(seeded));

  useEffect(() => {
    let cancelled = false;
    fetch("/api/site-content?page=all")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data && typeof data === "object" && !Array.isArray(data)) {
          setSc(data as SiteContentMap);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(() => ({ sc, loaded }), [sc, loaded]);

  return (
    <SiteContentContext.Provider value={value}>
      {children}
    </SiteContentContext.Provider>
  );
}

export function useSiteContentContext(): SiteContentContextValue {
  const ctx = useContext(SiteContentContext);
  if (!ctx) {
    // Safe fallback if a consumer mounts outside provider (should not happen in root layout).
    return { sc: {}, loaded: false };
  }
  return ctx;
}

export function useSharedCmsHelpers() {
  const { sc, loaded } = useSiteContentContext();
  const t = (key: string, fallback = "") => cms(sc, key, fallback);
  const j = <T,>(key: string, fallback: T) => cmsJson<T>(sc, key, fallback);
  return { sc, loaded, t, j };
}
