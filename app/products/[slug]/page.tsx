import type { Metadata } from "next";
import ProductDetail from "./ProductDetail";

interface Product {
  id: number; name: string; description: string;
  price: number; badge: string | null; image: string | null; category: string; stock: string;
  short_description: string | null; full_description: string | null;
  features: string | null; seo_title: string | null; meta_description: string | null;
  focus_keyword: string | null; og_image: string | null; slug: string | null;
}

async function getProduct(slug: string): Promise<Product | null> {
  try {
    const mysql = require("mysql2/promise");
    const conn = await Promise.race([
      mysql.createConnection({
        host: process.env.DB_HOST || "srv497.hstgr.io",
        user: process.env.DB_USER || "u992747032_firestick4uk",
        password: process.env.DB_PASSWORD || "Firestick@2026",
        database: process.env.DB_NAME || "u992747032_firestick4uk",
        port: Number(process.env.DB_PORT) || 3306,
        connectTimeout: 5000,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 6000)),
    ]) as any;
    const [rows]: any = await conn.query(
      "SELECT * FROM products WHERE active = 1 AND LOWER(REPLACE(REPLACE(name, ' ', '-'), '/', '')) = ? LIMIT 1",
      [slug.toLowerCase()]
    );
    await conn.end();
    return rows[0] || null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) return { title: "Product Not Found | Firestick4UK" };

  const title = `${product.seo_title || product.name} | Firestick4UK`;
  const description = product.meta_description || product.short_description || product.description || "";
  const image = product.og_image || product.image || "";

  return {
    title,
    description,
    keywords: product.focus_keyword || "",
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

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://firestick4uk.com" },
      { "@type": "ListItem", position: 2, name: "Products", item: "https://firestick4uk.com/products" },
      { "@type": "ListItem", position: 3, name: product?.name || slug, item: `https://firestick4uk.com/products/${slug}` },
    ],
  };

  const productLd = product ? {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.full_description || product.short_description || product.description || "",
    image: product.image || "",
    offers: {
      "@type": "Offer",
      price: String(Number(product.price).toFixed(2)),
      priceCurrency: "GBP",
      availability: "https://schema.org/InStock",
      url: `https://firestick4uk.com/products/${slug}`,
    },
  } : null;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      {productLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(productLd) }}
        />
      )}
      <ProductDetail slug={slug} initialProduct={product as any} />
    </>
  );
}
