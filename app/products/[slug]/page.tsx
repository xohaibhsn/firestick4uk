import type { Metadata } from "next";
import ProductDetail from "./ProductDetail";
import pool from "../../../lib/db";
import BreadcrumbSchema from "@/components/BreadcrumbSchema";
import JsonLd from "@/components/JsonLd";

interface Product {
  id: number; name: string; description: string;
  price: number; badge: string | null; image: string | null; category: string; stock: string;
  short_description: string | null; full_description: string | null;
  features: string | null; seo_title: string | null; meta_description: string | null;
  focus_keyword: string | null; og_image: string | null; slug: string | null;
}

async function getProduct(slug: string): Promise<Product | null> {
  try {
    const s = slug.toLowerCase();
    const [rows]: any = await pool.query(
      `SELECT * FROM products
       WHERE active = 1 AND (
         slug = ?
         OR LOWER(REPLACE(REPLACE(name, ' ', '-'), '/', '')) = ?
       )
       LIMIT 1`,
      [s, s]
    );
    return rows[0] || null;
  } catch {
    return null;
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) return { title: "Product Not Found | Firestick4UK" };

  const title = `${product.seo_title || product.name} | Firestick4UK`;
  const rawDescription =
    product.meta_description || product.short_description || product.description || "";
  const description = stripHtml(rawDescription);
  const image = product.og_image || product.image || "";

  return {
    title,
    description,
    keywords: product.focus_keyword || "",
    alternates: {
      canonical: `https://firestick4uk.com/products/${slug}`,
    },
    openGraph: {
      title,
      description,
      url: `https://firestick4uk.com/products/${slug}`,
      siteName: "Firestick4UK",
      type: "website",
      images: image ? [{ url: image, width: 1200, height: 630, alt: product.name }] : [],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: image ? [image] : [],
    },
  };
}

export default async function ProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getProduct(slug);
  const productUrl = `https://firestick4uk.com/products/${slug}`;

  const productLd = product
    ? {
        "@context": "https://schema.org",
        "@type": "Product",
        name: product.name,
        description: stripHtml(
          product.short_description || product.description || product.full_description || ""
        ),
        image: product.image || product.og_image || "",
        brand: {
          "@type": "Brand",
          name: "Firestick4UK",
        },
        offers: {
          "@type": "Offer",
          price: String(Number(product.price).toFixed(2)),
          priceCurrency: "GBP",
          availability: "https://schema.org/InStock",
          url: productUrl,
          seller: {
            "@type": "Organization",
            name: "Firestick4UK",
          },
        },
        aggregateRating: {
          "@type": "AggregateRating",
          ratingValue: "4.9",
          reviewCount: "500",
        },
      }
    : null;

  return (
    <>
      <BreadcrumbSchema
        items={[
          { name: "Home", url: "https://firestick4uk.com" },
          { name: "Products", url: "https://firestick4uk.com/products" },
          { name: product?.name || slug, url: productUrl },
        ]}
      />
      <JsonLd data={productLd} />
      <ProductDetail slug={slug} initialProduct={product as any} />
    </>
  );
}
