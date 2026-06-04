import type { Metadata } from "next";
import BlogPostClient from "./BlogPostClient";
import pool from "../../../lib/db";

interface Post {
  id: number; title: string; slug: string; content: string; excerpt: string;
  category: string; emoji: string; badge: string; badgeText: string;
  featured_image: string; meta_title: string; meta_description: string;
  created_at: string; canonical_url: string | null;
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

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return { title: "Post Not Found | Firestick4UK Blog" };

  const title = `${post.meta_title || post.title} | Firestick4UK Blog`;
  const description = post.meta_description || post.excerpt || "";
  const canonical = post.canonical_url || `https://firestick4uk.com/blog/${slug}`;

  return {
    title,
    description,
    keywords: "",
    alternates: { canonical },
    openGraph: {
      title, description,
      url: canonical,
      siteName: "Firestick4UK",
      type: "article",
      publishedTime: post.created_at,
      images: post.featured_image ? [{ url: post.featured_image, width: 1200, height: 630 }] : [],
    },
    twitter: { card: "summary_large_image", title, description, images: post.featured_image ? [post.featured_image] : [] },
  };
}

export default async function BlogSlugPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPost(slug);

  const canonical = post?.canonical_url || `https://firestick4uk.com/blog/${slug}`;
  const faqsArr = post?.faqs
    ? (typeof post.faqs === "string" ? JSON.parse(post.faqs) : post.faqs) as Array<{question:string;answer:string}>
    : [];

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://firestick4uk.com" },
      { "@type": "ListItem", position: 2, name: "Blog", item: "https://firestick4uk.com/blog" },
      { "@type": "ListItem", position: 3, name: post?.title || slug, item: canonical },
    ],
  };

  const articleLd = post ? {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.meta_title || post.title,
    description: post.meta_description || post.excerpt || "",
    image: post.featured_image || "",
    datePublished: post.created_at,
    dateModified: post.created_at,
    author: { "@type": "Organization", name: "Firestick4UK" },
    publisher: { "@type": "Organization", name: "Firestick4UK", url: "https://firestick4uk.com" },
    mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
  } : null;

  const faqLd = faqsArr.length > 0 ? {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqsArr.map(f => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  } : null;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      {articleLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd) }} />}
      {faqLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />}
      <BlogPostClient post={post as any} />
    </>
  );
}
