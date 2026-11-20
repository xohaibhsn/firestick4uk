/**
 * F4UK-MULTI-150 — pure client-safe product draft helpers (Draft/Publish D4).
 * No Node imports, no DB, no server-only modules.
 */
import { formatDraftBanner } from "./contentDraftClient";
import type { EditProductDraft } from "./productContentDraftClient";

export { formatDraftBanner };

export const PRODUCT_DRAFT_ENTITY_TYPE = "product" as const;

export const PRODUCT_DRAFT_FIELD_KEYS = [
  "name",
  "slug",
  "category",
  "price",
  "stock",
  "image",
  "short_description",
  "full_description",
  "features",
  "seo_title",
  "meta_description",
  "focus_keyword",
  "og_image",
] as const;

export type ProductDraftFields = Partial<
  Record<(typeof PRODUCT_DRAFT_FIELD_KEYS)[number], string>
>;

export type ProductDraftPayload = {
  fields: Record<(typeof PRODUCT_DRAFT_FIELD_KEYS)[number], string>;
  base_version: number;
};

/** Build the PUT body.changes payload: all 13 fields + base_version. */
export function buildProductDraftPayload(
  editProduct: EditProductDraft,
  baseVersion: number
): ProductDraftPayload {
  const fields = {} as Record<(typeof PRODUCT_DRAFT_FIELD_KEYS)[number], string>;
  for (const key of PRODUCT_DRAFT_FIELD_KEYS) {
    fields[key] = String(editProduct?.[key] ?? "");
  }
  return {
    fields,
    base_version: Number.isFinite(baseVersion) ? Math.floor(baseVersion) : 0,
  };
}

/** True when any of the 13 draft fields differs from the current editor values. */
export function productDraftDiffers(
  draftFields: ProductDraftFields | null | undefined,
  editProduct: EditProductDraft
): boolean {
  if (!draftFields || typeof draftFields !== "object") return false;
  for (const key of PRODUCT_DRAFT_FIELD_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(draftFields, key)) continue;
    if (String(draftFields[key] ?? "") !== String(editProduct?.[key] ?? "")) {
      return true;
    }
  }
  return false;
}

/** True when the draft was saved against a product_version older than live. */
export function draftBaseIsStale(
  draft: { base_version?: number | null; changes?: { base_version?: number | null } } | null | undefined,
  liveVersion: number | null | undefined
): boolean {
  if (liveVersion == null || !Number.isFinite(Number(liveVersion))) return false;
  const base =
    draft && typeof draft === "object"
      ? draft.base_version != null
        ? Number(draft.base_version)
        : draft.changes && typeof draft.changes === "object"
          ? Number(draft.changes.base_version)
          : NaN
      : NaN;
  if (!Number.isFinite(base)) return false;
  return base < Number(liveVersion);
}
