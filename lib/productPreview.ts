/**
 * F4UK-MULTI-132 — live PDP preview channel (client-only).
 * Preview never persists; listener is inert for normal visitors.
 * Reuses CMS preview gate / trust conditions from lib/cmsPreview.ts.
 */

import {
  cmsPreviewHref,
  shouldAttachCmsPreviewListener,
  type CmsPreviewMessage,
} from "@/lib/cmsPreview";

export const PRODUCT_PREVIEW_MSG_TYPE = "f4uk-product-preview" as const;

/** PDP-visible draft fields only — never SEO / seasonal / cart / category. */
export const PRODUCT_PREVIEW_OVERRIDE_KEYS = [
  "name",
  "short_description",
  "full_description",
  "features",
  "price",
  "badge",
  "image",
  "stock",
] as const;

export type ProductPreviewOverrideKey = (typeof PRODUCT_PREVIEW_OVERRIDE_KEYS)[number];

export type ProductPreviewMessage = {
  type: typeof PRODUCT_PREVIEW_MSG_TYPE;
  overrides: Record<string, string>;
};

export type ProductPreviewDraft = Partial<
  Record<ProductPreviewOverrideKey, unknown>
>;

const ALLOW_SET = new Set<string>(PRODUCT_PREVIEW_OVERRIDE_KEYS);

export { shouldAttachCmsPreviewListener, cmsPreviewHref };

export function isProductPreviewOverrideKey(
  key: string
): key is ProductPreviewOverrideKey {
  return ALLOW_SET.has(key);
}

/** Build postMessage overrides from editor draft — allowlisted keys only, as strings. */
export function buildProductPreviewOverrides(
  draft: ProductPreviewDraft | Record<string, unknown> | null | undefined
): Record<string, string> {
  const src = draft || {};
  const out: Record<string, string> = {};
  for (const key of PRODUCT_PREVIEW_OVERRIDE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(src, key)) continue;
    const v = (src as Record<string, unknown>)[key];
    if (typeof v === "string") out[key] = v;
    else if (v == null) out[key] = "";
    else if (typeof v === "number" || typeof v === "boolean") out[key] = String(v);
  }
  return out;
}

/**
 * Coerce unknown overrides to strings and drop non-allowlisted keys.
 * Mirrors sanitizePreviewOverrides coercion rules, scoped to PDP fields.
 */
export function sanitizeProductPreviewOverrides(
  raw: Record<string, unknown> | null | undefined
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    if (!isProductPreviewOverrideKey(k)) continue;
    if (typeof v === "string") out[k] = v;
    else if (v == null) out[k] = "";
    else if (typeof v === "number" || typeof v === "boolean") out[k] = String(v);
  }
  return out;
}

/**
 * Same trust conditions as isTrustedCmsPreviewEvent:
 * same origin + event.source === parent + typed payload with overrides object.
 * Message type is the product channel (not CMS).
 */
export function isTrustedProductPreviewEvent(
  event: { origin: string; source: MessageEventSource | null; data: unknown },
  locationOrigin: string,
  parentWindow: Window | null
): event is MessageEvent & { data: ProductPreviewMessage } {
  if (event.origin !== locationOrigin) return false;
  if (!parentWindow || event.source !== parentWindow) return false;
  const data = event.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const d = data as Record<string, unknown>;
  if (d.type !== PRODUCT_PREVIEW_MSG_TYPE) return false;
  if (!d.overrides || typeof d.overrides !== "object" || Array.isArray(d.overrides)) {
    return false;
  }
  return true;
}

/** Reject CMS-typed messages on the product channel (and vice versa shape). */
export function isCmsTypedPreviewPayload(data: unknown): data is CmsPreviewMessage {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  return (data as Record<string, unknown>).type === "f4uk-cms-preview";
}

export type ProductPreviewToggleInput = {
  /** True for "new" / unsaved product editor session. */
  isNew: boolean;
  productId?: number | string | null;
  /** SAVED slug only (permalink) — never the dirty draft slug. */
  savedSlug?: string | null;
  /** Saved active flag (1 = public). */
  active?: number | string | boolean | null;
};

/**
 * Returns null when Preview may open; otherwise a visible disabled reason.
 */
export function productPreviewDisabledReason(
  opts: ProductPreviewToggleInput
): string | null {
  if (opts.isNew) return "Save the product first to preview";
  const id = opts.productId;
  const hasId = id != null && String(id).trim() !== "" && Number(id) > 0;
  const slug = String(opts.savedSlug || "").trim();
  if (!hasId || !slug) return "Save the product first to preview";
  const activeNum = Number(opts.active);
  if (activeNum !== 1) {
    return "Make Public to preview - private pages return 404";
  }
  return null;
}

/** Merge sanitized string overrides over a product-like object for rendering only. */
export function applyProductPreviewOverrides<T extends Record<string, unknown>>(
  product: T,
  overrides: Record<string, string> | null | undefined
): T {
  if (!overrides || Object.keys(overrides).length === 0) return product;
  const next: Record<string, unknown> = { ...product };
  for (const key of PRODUCT_PREVIEW_OVERRIDE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(overrides, key)) continue;
    const val = overrides[key];
    if (key === "badge" || key === "image") {
      next[key] = val === "" ? null : val;
    } else if (key === "price") {
      // Keep draft string as-is for PriceDisplay — no parse side effects.
      next[key] = val;
    } else {
      next[key] = val;
    }
  }
  return next as T;
}
