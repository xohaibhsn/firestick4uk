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

/**
 * Single public storefront CMS bootstrap.
 * Performs ONE GET /api/site-content?page=all for the whole tree.
 */
export function SiteContentProvider({ children }: { children: ReactNode }) {
  const [sc, setSc] = useState<SiteContentMap>({});
  const [loaded, setLoaded] = useState(false);

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
