import type { MetadataRoute } from "next";
import {
  getSitemapDynamicDataSafe,
  parseFactualLastModified,
} from "@/lib/sitemapDataServer";

/**
 * Keep force-dynamic so Hostinger build never permanently caches an empty
 * product/blog sitemap when DB is unavailable at build time.
 * Expensive DB work is memoized via unstable_cache (see sitemapDataServer).
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = "https://firestick4uk.com";
  // Outer fail-safe: cache/runtime throws must not 500 the whole sitemap.
  const data = await getSitemapDynamicDataSafe();

  // Static/marketing URLs: omit lastModified — no reliable change timestamp;
  // never use request-time new Date() (false "always changed" signal).
  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, changeFrequency: "daily", priority: 1.0 },
    { url: `${baseUrl}/products`, changeFrequency: "daily", priority: 0.9 },
    {
      url: data.subscriptionUrl,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    { url: `${baseUrl}/blog`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${baseUrl}/contact`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${baseUrl}/about`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${baseUrl}/faq`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${baseUrl}/order-tracking`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${baseUrl}/terms`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${baseUrl}/privacy-policy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${baseUrl}/refund-policy`, changeFrequency: "yearly", priority: 0.3 },
  ];

  const productPages: MetadataRoute.Sitemap = data.products.map((p) => {
    const lastModified = parseFactualLastModified(p.lastModified);
    return {
      url: `${baseUrl}/products/${p.slug}`,
      ...(lastModified ? { lastModified } : {}),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    };
  });

  const blogPages: MetadataRoute.Sitemap = data.posts.map((p) => {
    const lastModified = parseFactualLastModified(p.lastModified);
    return {
      url: `${baseUrl}/blog/${p.slug}`,
      ...(lastModified ? { lastModified } : {}),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    };
  });

  return [...staticPages, ...productPages, ...blogPages];
}
