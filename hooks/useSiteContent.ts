"use client";

import { useSharedCmsHelpers } from "@/components/SiteContentProvider";

/**
 * Public CMS helper — reads shared SiteContentProvider (no network fetch).
 */
export function useSiteContent() {
  return useSharedCmsHelpers();
}
