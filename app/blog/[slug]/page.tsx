import type { Metadata } from "next";
import { notFound } from "next/navigation";
import BlogPostClient from "./BlogPostClient";
import pool from "../../../lib/db";
import BreadcrumbSchema from "@/components/BreadcrumbSchema";
import JsonLd from "@/components/JsonLd";

interface Post {
  id: number; title: string; slug: string; content: string; excerpt: string;
  category: string; emoji: string; badge: string; badgeText: string;
  featured_image: string; meta_title: string; meta_description: string;
  created_at: string; updated_at?: string | null; canonical_url: string | null;
  faqs: Array<{question:string;answer:string}> | string | null;
}

async function getPost(slug: string): Promise<Post | null> {
  try {
    const [rows]: any = await pool.query(
      'SELECT * FROM blog_posts WHERE slug = ? AND status = "published" AND active = 1 LIMIT 1',
      [slug]
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
  const post = await getPost(slug);
  if (!post) return { title: "Post Not Found | Firestick4UK Blog" };

  const title = `${post.meta_title || post.title} | Firestick4UK Blog`;
  const description = stripHtml(post.meta_description || post.excerpt || "");
  const canonical = post.canonical_url || `https://firestick4uk.com/blog/${post.slug || slug}`;
  const image = String(post.featured_image || "").trim();

  return {
    title,
    ...(description ? { description } : {}),
    keywords: "",
    alternates: { canonical },
    openGraph: {
      title,
      ...(description ? { description } : {}),
      url: canonical,
      siteName: "Firestick4UK",
      type: "article",
      publishedTime: post.created_at,
      ...(image ? { images: [{ url: image, width: 1200, height: 630 }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      ...(description ? { description } : {}),
      ...(image ? { images: [image] } : {}),
    },
  };
}

export default async function BlogSlugPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();

  const canonical = post.canonical_url || `https://firestick4uk.com/blog/${post.slug || slug}`;
  const faqsArr = post.faqs
    ? (typeof post.faqs === "string" ? JSON.parse(post.faqs) : post.faqs) as Array<{question:string;answer:string}>
    : [];
  const image = String(post.featured_image || "").trim();
  const description = stripHtml(post.excerpt || post.meta_description || "");

  const articleLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    datePublished: post.created_at,
    dateModified: post.updated_at || post.created_at,
    author: {
      "@type": "Organization",
      name: "Firestick4UK",
      url: "https://firestick4uk.com",
    },
    publisher: {
      "@type": "Organization",
      name: "Firestick4UK",
      logo: {
        "@type": "ImageObject",
        url: "https://firestick4uk.com/logo.png",
      },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
  };
  if (description) articleLd.description = description;
  if (image) articleLd.image = image;

  const faqLd =
    faqsArr.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faqsArr.map((f) => ({
            "@type": "Question",
            name: f.question,
            acceptedAnswer: { "@type": "Answer", text: f.answer },
          })),
        }
      : null;

  return (
    <>
      <BreadcrumbSchema
        items={[
          { name: "Home", url: "https://firestick4uk.com" },
          { name: "Blog", url: "https://firestick4uk.com/blog" },
          { name: post.title || slug, url: canonical },
        ]}
      />
      <JsonLd data={articleLd} />
      <JsonLd data={faqLd} />
      <BlogPostClient post={post as any} />
    </>
  );
}
