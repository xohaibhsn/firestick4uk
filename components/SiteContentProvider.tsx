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
  /** True only after the full /api/site-content?page=all fetch settles (success or failure). */
  loaded: boolean;
  /**
   * True when an SSR seed was provided (e.g. VAT suffix keys).
   * Used ONLY by PriceDisplay so "incl. VAT" can render before the full CMS fetch.
   * Does not mean the full CMS map is ready — use `loaded` for that.
   */
  seeded: boolean;
};

const SiteContentContext = createContext<SiteContentContextValue | null>(null);

type SiteContentProviderProps = {
  children: ReactNode;
  /**
   * Optional SSR seed (e.g. prices_include_vat + price_incl_vat_suffix).
   * When provided, `seeded` is true so PriceDisplay can show the VAT suffix on
   * first paint; `loaded` stays false until the full client fetch completes.
   * Client still fetches page=all and merges with the full map (full map wins).
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
  const seedMap =
    initialContent &&
    typeof initialContent === "object" &&
    !Array.isArray(initialContent)
      ? initialContent
      : null;
  const isSeeded = Boolean(seedMap);
  const [sc, setSc] = useState<SiteContentMap>(() => seedMap || {});
  // loaded = full CMS fetch settled — never true from SSR seed alone (pre-MULTI-88 semantics).
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/site-content?page=all")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data && typeof data === "object" && !Array.isArray(data)) {
          // Merge seed with full map; full map wins on key conflicts.
          setSc({ ...(seedMap || {}), ...(data as SiteContentMap) });
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
    // seedMap is stable for the provider lifetime (SSR prop); omit from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo(
    () => ({ sc, loaded, seeded: isSeeded }),
    [sc, loaded, isSeeded]
  );

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
    return { sc: {}, loaded: false, seeded: false };
  }
  return ctx;
}

export function useSharedCmsHelpers() {
  const { sc, loaded, seeded } = useSiteContentContext();
  const t = (key: string, fallback = "") => cms(sc, key, fallback);
  const j = <T,>(key: string, fallback: T) => cmsJson<T>(sc, key, fallback);
  return { sc, loaded, seeded, t, j };
}
