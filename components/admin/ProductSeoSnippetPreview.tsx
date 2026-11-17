"use client";

import { buildProductSeoSnippetPreview } from "@/lib/productAdminSeoSnippet";

export { buildProductSeoSnippetPreview };

type Props = {
  name: string;
  slug: string;
  seoTitle: string;
  metaDescription: string;
  shortDescription?: string;
};

/**
 * Google-style SERP snippet preview.
 * Fallback rules match the editor placeholders / API save behaviour:
 * - title: seo_title or name (placeholder also shows "| Firestick4UK" advisory)
 * - description: meta_description or short_description
 * - URL: firestick4uk.com/products/{slug}
 */
export default function ProductSeoSnippetPreview({
  name,
  slug,
  seoTitle,
  metaDescription,
  shortDescription = "",
}: Props) {
  const preview = buildProductSeoSnippetPreview({
    name,
    slug,
    seoTitle,
    metaDescription,
    shortDescription,
  });

  const titleLen = String(seoTitle || "").length;
  const metaLen = String(metaDescription || "").length;

  return (
    <div
      data-testid="product-seo-snippet-preview"
      style={{
        marginBottom: 14,
        padding: "14px 16px",
        background: "#fff",
        border: "1px solid #E5E5E5",
        borderRadius: 10,
        color: "#202124",
      }}
    >
      <div style={{ fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: "#666", marginBottom: 10, fontWeight: 600 }}>
        Snippet preview
      </div>
      <div
        data-testid="product-seo-snippet-url"
        style={{ fontSize: 12, color: "#202124", marginBottom: 4, wordBreak: "break-all" }}
      >
        {preview.url}
      </div>
      <div
        data-testid="product-seo-snippet-title"
        style={{
          fontSize: 18,
          lineHeight: 1.3,
          color: "#1a0dab",
          marginBottom: 4,
          fontWeight: 400,
        }}
      >
        {preview.title}
      </div>
      <div
        data-testid="product-seo-snippet-description"
        style={{ fontSize: 13, lineHeight: 1.5, color: "#4d5156" }}
      >
        {preview.description || "Meta description will appear here."}
      </div>
      <div
        style={{
          marginTop: 10,
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
          fontSize: 11,
          color: "#666",
        }}
      >
        <span data-testid="product-seo-snippet-title-count">
          Title {titleLen}/60
        </span>
        <span data-testid="product-seo-snippet-meta-count">
          Description {metaLen}/180
        </span>
      </div>
    </div>
  );
}
