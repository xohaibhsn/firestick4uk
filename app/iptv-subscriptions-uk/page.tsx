import { permanentRedirect } from "next/navigation";
import {
  generateSubscriptionMetadata,
  renderSubscriptionLandingPage,
} from "@/lib/subscriptionLandingPage";
import { getSubscriptionSlugConfig } from "@/lib/subscriptionSlugServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const LEGACY_SLUG = "iptv-subscriptions-uk";

export async function generateMetadata() {
  const route = await getSubscriptionSlugConfig();
  if (route.slug === LEGACY_SLUG) {
    return generateSubscriptionMetadata();
  }
  return { robots: { index: false, follow: true } };
}

/**
 * Compatibility route for the original hardcoded path.
 * Renders when the CMS active slug is still iptv-subscriptions-uk;
 * otherwise permanently redirects to the active CMS slug (no loop).
 */
export default async function LegacySubscriptionPathPage() {
  const route = await getSubscriptionSlugConfig();
  if (route.slug === LEGACY_SLUG) {
    return renderSubscriptionLandingPage();
  }
  permanentRedirect(route.pagePath);
}
