"use client";

import { useMemo } from "react";
import { useSiteContentContext } from "@/components/SiteContentProvider";
import {
  CONTACT_CONFIG_FALLBACK,
  normalizeContactFromMap,
  type ContactConfig,
} from "@/lib/contactConfigNormalize";

export type ContactConfigClient = ContactConfig;

/**
 * Contact config from shared public CMS map (no independent page=all fetch).
 */
export function useContactConfig(
  initial?: ContactConfig | null
): ContactConfigClient {
  const { sc, loaded } = useSiteContentContext();

  return useMemo(() => {
    if (!loaded) {
      return initial || CONTACT_CONFIG_FALLBACK;
    }
    return normalizeContactFromMap(sc);
  }, [sc, loaded, initial]);
}
