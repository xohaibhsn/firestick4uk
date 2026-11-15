/**
 * F4UK-MULTI-101 — CMS live preview channel (client-only).
 * Preview never persists; listener is inert for normal visitors.
 */

export const CMS_PREVIEW_MSG_TYPE = "f4uk-cms-preview" as const;
export const CMS_PREVIEW_QUERY = "cms_preview";
export const CMS_PREVIEW_PARAM = "1";

/** Field keys whose rendered text is fed only from SSR props / server reads — not live from the provider map. */
export const CMS_PREVIEW_SSR_ONLY_KEYS: readonly string[] = [
  // Home LCP heroes (app/page.tsx → HomeClient props)
  "home_top_hero_title",
  "home_top_hero_subtitle",
  "home_hero_title",
  "home_hero_subtitle",
  "home_meta_title",
  "home_meta_description",
  "hero_slide_1",
  "hero_slide_2",
  "hero_slide_3",
  "hero_slide_4",
  "home_product_ids",
  "seasonal_promo_text",
  "seasonal_promo_cta",
  // Legal / SEO pages loaded via getPublicSiteContent in server components
  "privacy_meta_title",
  "privacy_meta_description",
  "terms_meta_title",
  "terms_meta_description",
  "refund_meta_title",
  "refund_meta_description",
] as const;

export type CmsPreviewMessage = {
  type: typeof CMS_PREVIEW_MSG_TYPE;
  overrides: Record<string, string>;
};

export function isCmsPreviewQueryParam(search: string | null | undefined): boolean {
  if (!search) return false;
  try {
    const q = search.startsWith("?") ? search.slice(1) : search;
    const params = new URLSearchParams(q);
    return params.get(CMS_PREVIEW_QUERY) === CMS_PREVIEW_PARAM;
  } catch {
    return false;
  }
}

export function cmsPreviewHref(path: string): string {
  const base = path.startsWith("/") ? path : `/${path}`;
  const joiner = base.includes("?") ? "&" : "?";
  return `${base}${joiner}${CMS_PREVIEW_QUERY}=${CMS_PREVIEW_PARAM}`;
}

/** Strip cms_preview from a pathname+search for clean canonical. */
export function cleanUrlWithoutCmsPreview(pathname: string, search = ""): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  params.delete(CMS_PREVIEW_QUERY);
  const q = params.toString();
  return q ? `${pathname}?${q}` : pathname;
}

export function buildDirtyOverrides(
  current: Record<string, string>,
  saved: Record<string, string>
): Record<string, string> {
  const keys = new Set([...Object.keys(current), ...Object.keys(saved)]);
  const out: Record<string, string> = {};
  for (const k of keys) {
    const cur = String(current[k] ?? "");
    const sav = String(saved[k] ?? "");
    if (cur !== sav) out[k] = cur;
  }
  return out;
}

export function isCmsPreviewSsrOnlyKey(key: string): boolean {
  return (CMS_PREVIEW_SSR_ONLY_KEYS as readonly string[]).includes(key);
}

/**
 * Parent is /sidhu — prefer window.parent.location.pathname; fall back to document.referrer path.
 */
export function parentIsSidhuAdmin(opts: {
  tryParentPathname: () => string | null;
  referrer: string;
}): boolean {
  try {
    const p = opts.tryParentPathname();
    if (typeof p === "string" && (p === "/sidhu" || p.startsWith("/sidhu/"))) {
      return true;
    }
  } catch {
    /* cross-origin parent — fall through to referrer */
  }
  try {
    if (!opts.referrer) return false;
    const u = new URL(opts.referrer);
    return u.pathname === "/sidhu" || u.pathname.startsWith("/sidhu/");
  } catch {
    return false;
  }
}

/**
 * Whether the preview message listener may attach.
 * ALL four conditions required.
 */
export function shouldAttachCmsPreviewListener(opts: {
  search: string;
  isIframe: boolean;
  parentIsSidhu: boolean;
}): boolean {
  return (
    isCmsPreviewQueryParam(opts.search) &&
    opts.isIframe === true &&
    opts.parentIsSidhu === true
  );
}

export function isTrustedCmsPreviewEvent(
  event: { origin: string; source: MessageEventSource | null; data: unknown },
  locationOrigin: string,
  parentWindow: Window | null
): event is MessageEvent & { data: CmsPreviewMessage } {
  if (event.origin !== locationOrigin) return false;
  if (!parentWindow || event.source !== parentWindow) return false;
  const data = event.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const d = data as Record<string, unknown>;
  if (d.type !== CMS_PREVIEW_MSG_TYPE) return false;
  if (!d.overrides || typeof d.overrides !== "object" || Array.isArray(d.overrides)) {
    return false;
  }
  return true;
}

export function sanitizePreviewOverrides(
  raw: Record<string, unknown>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof k !== "string" || !k) continue;
    if (typeof v === "string") out[k] = v;
    else if (v == null) out[k] = "";
    else if (typeof v === "number" || typeof v === "boolean") out[k] = String(v);
  }
  return out;
}
