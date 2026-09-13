import pool from "@/lib/db";
import {
  DEFAULT_SUBSCRIPTION_SLUG,
  normalizeSubscriptionSlug,
  resolveSubscriptionCanonical,
  subscriptionPagePath,
  subscriptionPageUrl,
} from "@/lib/subscriptionSlug";

export type SubscriptionSlugConfig = {
  slug: string;
  previousSlug: string;
  canonicalRaw: string;
  pageUrl: string;
  pagePath: string;
  canonical: string;
};

export async function getSubscriptionSlugConfig(): Promise<SubscriptionSlugConfig> {
  let slugRaw = "";
  let previousRaw = "";
  let canonicalRaw = "";

  try {
    const [rows]: any = await pool.query(
      `SELECT content_key, content_value
       FROM site_content
       WHERE content_key IN (
         'subscription_slug',
         'subscription_previous_slug',
         'subscription_canonical'
       )`
    );
    for (const row of rows || []) {
      if (row.content_key === "subscription_slug") slugRaw = row.content_value || "";
      if (row.content_key === "subscription_previous_slug") previousRaw = row.content_value || "";
      if (row.content_key === "subscription_canonical") canonicalRaw = row.content_value || "";
    }
  } catch {
    // fall through to defaults
  }

  const slug = normalizeSubscriptionSlug(slugRaw) || DEFAULT_SUBSCRIPTION_SLUG;
  const previousSlug = normalizeSubscriptionSlug(previousRaw);
  const safePrevious = previousSlug && previousSlug !== slug ? previousSlug : "";

  return {
    slug,
    previousSlug: safePrevious,
    canonicalRaw,
    pageUrl: subscriptionPageUrl(slug),
    pagePath: subscriptionPagePath(slug),
    canonical: resolveSubscriptionCanonical(slug, canonicalRaw, safePrevious),
  };
}
