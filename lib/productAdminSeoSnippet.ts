/**
 * F4UK-MULTI-130 — pure Google-style SERP snippet preview helpers.
 * Fallback rules match editor placeholders / API save behaviour.
 */

export function buildProductSeoSnippetPreview(opts: {
  name: string;
  slug: string;
  seoTitle: string;
  metaDescription: string;
  shortDescription?: string;
}): { title: string; url: string; description: string } {
  const name = String(opts.name || "").trim();
  const slug = String(opts.slug || "").trim() || "product-slug";
  const seoTitle = String(opts.seoTitle || "").trim();
  const meta = String(opts.metaDescription || "").trim();
  const short = String(opts.shortDescription || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const title = seoTitle || name || "Product Name | Firestick4UK";
  const description = meta || short || "";
  const url = `firestick4uk.com/products/${slug}`;

  return { title, url, description };
}
