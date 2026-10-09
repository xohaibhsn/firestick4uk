import type { SitemapDynamicData } from "@/lib/sitemapDataServer";
import { parseFactualLastModified } from "@/lib/sitemapDataServer";

const BASE_URL = "https://firestick4uk.com";

type SitemapEntry = {
  url: string;
  lastModified?: Date;
  changeFrequency?: string;
  priority?: number;
};

export function buildStaticSitemapEntries(
  subscriptionUrl: string = `${BASE_URL}/iptv-subscriptions-uk`
): SitemapEntry[] {
  return [
    { url: BASE_URL, changeFrequency: "daily", priority: 1.0 },
    { url: `${BASE_URL}/products`, changeFrequency: "daily", priority: 0.9 },
    { url: subscriptionUrl, changeFrequency: "weekly", priority: 0.9 },
    { url: `${BASE_URL}/blog`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE_URL}/contact`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE_URL}/about`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE_URL}/faq`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE_URL}/order-tracking`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE_URL}/terms`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE_URL}/privacy-policy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE_URL}/refund-policy`, changeFrequency: "yearly", priority: 0.3 },
  ];
}

export function buildSitemapEntries(data: SitemapDynamicData): SitemapEntry[] {
  const products = Array.isArray(data.products) ? data.products : [];
  const posts = Array.isArray(data.posts) ? data.posts : [];
  const subscriptionUrl =
    typeof data.subscriptionUrl === "string" && data.subscriptionUrl
      ? data.subscriptionUrl
      : `${BASE_URL}/iptv-subscriptions-uk`;

  const productPages: SitemapEntry[] = [];
  for (const p of products) {
    const slug = String(p?.slug || "").trim();
    if (!slug) continue;
    const lastModified = parseFactualLastModified(p.lastModified ?? null);
    productPages.push({
      url: `${BASE_URL}/products/${slug}`,
      ...(lastModified ? { lastModified } : {}),
      changeFrequency: "weekly",
      priority: 0.8,
    });
  }

  const blogPages: SitemapEntry[] = [];
  for (const p of posts) {
    const slug = String(p?.slug || "").trim();
    if (!slug) continue;
    const lastModified = parseFactualLastModified(p.lastModified ?? null);
    blogPages.push({
      url: `${BASE_URL}/blog/${slug}`,
      ...(lastModified ? { lastModified } : {}),
      changeFrequency: "weekly",
      priority: 0.7,
    });
  }

  return [
    ...buildStaticSitemapEntries(subscriptionUrl),
    ...productPages,
    ...blogPages,
  ];
}

/** Manual XML serializer — never calls toISOString on Invalid Date. */
export function serializeSitemapXml(entries: SitemapEntry[]): string {
  let content = '<?xml version="1.0" encoding="UTF-8"?>\n';
  content += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  for (const item of entries) {
    if (!item?.url) continue;
    content += "<url>\n";
    content += `<loc>${item.url}</loc>\n`;
    if (item.lastModified instanceof Date && !Number.isNaN(item.lastModified.getTime())) {
      content += `<lastmod>${item.lastModified.toISOString()}</lastmod>\n`;
    }
    if (item.changeFrequency) {
      content += `<changefreq>${item.changeFrequency}</changefreq>\n`;
    }
    if (typeof item.priority === "number") {
      content += `<priority>${item.priority}</priority>\n`;
    }
    content += "</url>\n";
  }
  content += "</urlset>\n";
  return content;
}

export function staticSitemapXml(): string {
  return serializeSitemapXml(buildStaticSitemapEntries());
}
