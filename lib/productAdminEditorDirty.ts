/**
 * F4UK-MULTI-130 — pure dirty-check helpers for the product editor unsaved guard.
 */

const TRACKED_KEYS = [
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

export type ProductEditorDraftSnapshot = Record<(typeof TRACKED_KEYS)[number], string>;

function norm(v: unknown): string {
  if (v == null) return "";
  return String(v);
}

export function snapshotProductEditorDraft(
  editProduct: Record<string, unknown> | null | undefined
): ProductEditorDraftSnapshot {
  const src = editProduct || {};
  const out = {} as ProductEditorDraftSnapshot;
  for (const key of TRACKED_KEYS) {
    out[key] = norm(src[key]);
  }
  return out;
}

export function isProductEditorDraftDirty(
  current: Record<string, unknown> | null | undefined,
  baseline: ProductEditorDraftSnapshot | null | undefined
): boolean {
  if (!baseline) return false;
  const snap = snapshotProductEditorDraft(current);
  for (const key of TRACKED_KEYS) {
    if (snap[key] !== baseline[key]) return true;
  }
  return false;
}
