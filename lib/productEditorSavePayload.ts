/**
 * Product editor save body (MULTI-102).
 * Extracted for fixture equality tests — must stay byte-identical to prior inline shape.
 */
export type ProductEditorDraft = {
  name: string;
  slug?: string;
  category: string;
  price: string;
  stock: string;
  image: string;
  short_description: string;
  full_description: string;
  features: string;
  seo_title: string;
  meta_description: string;
  focus_keyword: string;
  og_image: string;
};

export function buildProductEditorSavePayload(
  editProduct: ProductEditorDraft,
  opts: { slug: string; parsedPrice: number }
): Record<string, unknown> {
  return {
    name: editProduct.name,
    slug: opts.slug,
    description: editProduct.short_description || "",
    price: String(opts.parsedPrice),
    category: editProduct.category,
    badge: null,
    image: editProduct.image || null,
    stock: editProduct.stock || "Digital",
    short_description: editProduct.short_description || "",
    full_description: editProduct.full_description || "",
    features: editProduct.features || "",
    seo_title: editProduct.seo_title || "",
    meta_description: editProduct.meta_description || "",
    focus_keyword: editProduct.focus_keyword || "",
    og_image: editProduct.og_image || "",
  };
}
