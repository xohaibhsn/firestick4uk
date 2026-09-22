import type { Metadata } from "next";
import { cache } from "react";
import { notFound, permanentRedirect } from "next/navigation";
import ProductDetail from "./ProductDetail";
import pool from "../../../lib/db";
import BreadcrumbSchema from "@/components/BreadcrumbSchema";
import JsonLd from "@/components/JsonLd";
import {
  defaultSocialImages,
  resolveSocialImagePrecedence,
} from "@/lib/socialMetadata";
import { getDefaultOgImageFromSettings } from "@/lib/socialMetadataServer";

interface Product {
  id: number;
  name: string;
  description: string;
  price: number;
  badge: string | null;
  image: string | null;
  category: string;
  stock: string;
  short_description: string | null;
  full_description: string | null;
  features: string | null;
  seo_title: string | null;
  meta_description: string | null;
  focus_keyword: string | null;
  og_image: string | null;
  slug: string | null;
  active?: number;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeRequestSlug(slug: string): string {
  return String(slug || "")
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, "");
}

/** Prefer DB slug; fall back to request slug only when product has no stored slug. */
function authoritativeProductSlug(product: Product, requestSlug: string): string {
  const stored = String(product.slug || "")
    .trim()
    .toLowerCase();
  return stored || normalizeRequestSlug(requestSlug);
}

function productPageTitle(seoTitle: string | null | undefined, name: string): string {
  const base = String(seoTitle || name || "")
    .trim()
    .replace(/\s+/g, " ");
  if (!base) return "Firestick4UK";
  // Avoid "... | Firestick4UK | Firestick4UK" when seo_title already ends with the brand
  if (/\|\s*Firestick4UK\s*$/i.test(base)) return base;
  if (/Firestick4UK\s*$/i.test(base) && !/\|\s*Firestick4UK\s*$/i.test(base)) {
    // e.g. "My Product Firestick4UK" — leave as stored; do not append again
    return base;
  }
  return `${base} | Firestick4UK`;
}

function productMetaDescription(product: Product): string {
  const raw =
    product.meta_description ||
    product.short_description ||
    product.description ||
    product.full_description ||
    "";
  return stripHtml(String(raw)).slice(0, 320);
}

function offerAvailability(stock: string | null | undefined): string {
  const s = String(stock || "")
    .trim()
    .toLowerCase();
  if (!s) return "https://schema.org/InStock";
  if (/out\s*of\s*stock|sold\s*out|unavailable|^0$/.test(s)) {
    return "https://schema.org/OutOfStock";
  }
  return "https://schema.org/InStock";
}

type ResolveResult =
  | { status: "ok"; product: Product }
  | { status: "redirect"; toSlug: string }
  | { status: "missing" };

/**
 * Exact DB slug first; name-derived alias only for redirect compatibility.
 * Deduped per-request via React cache.
 */
const resolveProduct = cache(async (rawSlug: string): Promise<ResolveResult> => {
  const s = normalizeRequestSlug(rawSlug);
  if (!s) return { status: "missing" };

  try {
    const [exactRows]: any = await pool.query(
      `SELECT * FROM products WHERE active = 1 AND slug = ? LIMIT 1`,
      [s]
    );
    if (exactRows?.[0]) return { status: "ok", product: exactRows[0] };

    const [legacyRows]: any = await pool.query(
      `SELECT * FROM products
       WHERE active = 1
         AND LOWER(REPLACE(REPLACE(name, ' ', '-'), '/', '')) = ?
       LIMIT 1`,
      [s]
    );
    const legacy = legacyRows?.[0];
    if (!legacy) return { status: "missing" };

    const auth = String(legacy.slug || "")
      .trim()
      .toLowerCase();
    if (auth && auth !== s) return { status: "redirect", toSlug: auth };
    return { status: "ok", product: legacy };
  } catch {
    return { status: "missing" };
  }
});

function buildProductJsonLd(product: Product, productUrl: string): Record<string, unknown> {
  const description = stripHtml(
    product.short_description || product.description || product.full_description || ""
  );
  const image = String(product.image || product.og_image || "").trim();

  const ld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    brand: {
      "@type": "Brand",
      name: "Firestick4UK",
    },
    offers: {
      "@type": "Offer",
      price: String(Number(product.price).toFixed(2)),
      priceCurrency: "GBP",
      availability: offerAvailability(product.stock),
      url: productUrl,
      seller: {
        "@type": "Organization",
        name: "Firestick4UK",
      },
    },
  };

  if (description) ld.description = description;
  if (image) ld.image = image;

  // No aggregateRating — project has no product-specific review datastore.
  return ld;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const resolved = await resolveProduct(slug);

  if (resolved.status === "redirect") {
    // Metadata for redirecting aliases is unused after permanentRedirect in page,
    // but keep canonical pointing at authoritative slug if this path is evaluated.
    return {
      alternates: { canonical: `https://firestick4uk.com/products/${resolved.toSlug}` },
    };
  }

  if (resolved.status === "missing") {
    return { title: "Product Not Found | Firestick4UK" };
  }

  const product = resolved.product;
  const canonicalSlug = authoritativeProductSlug(product, slug);
  const title = productPageTitle(product.seo_title, product.name);
  const description = productMetaDescription(product);
  const image = String(product.og_image || product.image || "").trim();
  const canonical = `https://firestick4uk.com/products/${canonicalSlug}`;
  const cmsDefault = await getDefaultOgImageFromSettings();
  const social = defaultSocialImages(
    resolveSocialImagePrecedence(image, cmsDefault),
    product.name
  );

  return {
    title,
    ...(description ? { description } : {}),
    ...(product.focus_keyword ? { keywords: product.focus_keyword } : {}),
    alternates: { canonical },
    openGraph: {
      title,
      ...(description ? { description } : {}),
      url: canonical,
      siteName: "Firestick4UK",
      type: "website",
      images: social.images,
    },
    twitter: {
      card: "summary_large_image",
      title,
      ...(description ? { description } : {}),
      images: social.twitterImages,
    },
  };
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const resolved = await resolveProduct(slug);

  if (resolved.status === "redirect") {
    permanentRedirect(`/products/${resolved.toSlug}`);
  }
  if (resolved.status === "missing") {
    notFound();
  }

  const product = resolved.product;
  const canonicalSlug = authoritativeProductSlug(product, slug);
  // Preserve raw request segment; redirect mixed-case / punctuated variants to DB slug.
  const rawTrimmed = String(slug || "")
    .trim()
    .replace(/^\/+|\/+$/g, "");
  if (rawTrimmed !== canonicalSlug) {
    permanentRedirect(`/products/${canonicalSlug}`);
  }

  const productUrl = `https://firestick4uk.com/products/${canonicalSlug}`;
  const productLd = buildProductJsonLd(product, productUrl);

  return (
    <>
      <BreadcrumbSchema
        items={[
          { name: "Home", url: "https://firestick4uk.com" },
          { name: "Products", url: "https://firestick4uk.com/products" },
          { name: product.name || canonicalSlug, url: productUrl },
        ]}
      />
      <JsonLd data={productLd} />
      <ProductDetail slug={canonicalSlug} initialProduct={product as any} />
    </>
  );
}
