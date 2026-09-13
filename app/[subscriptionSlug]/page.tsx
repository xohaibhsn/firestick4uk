import { notFound, permanentRedirect } from "next/navigation";
import {
  generateSubscriptionMetadata,
  renderSubscriptionLandingPage,
} from "@/lib/subscriptionLandingPage";
import { normalizeSubscriptionSlug } from "@/lib/subscriptionSlug";
import { getSubscriptionSlugConfig } from "@/lib/subscriptionSlugServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  params: Promise<{ subscriptionSlug: string }>;
};

export async function generateMetadata({ params }: PageProps) {
  const { subscriptionSlug } = await params;
  const requested = normalizeSubscriptionSlug(subscriptionSlug);
  const route = await getSubscriptionSlugConfig();

  if (requested === route.slug) {
    return generateSubscriptionMetadata();
  }

  if (route.previousSlug && requested === route.previousSlug) {
    return {
      robots: { index: false, follow: true },
    };
  }

  return {};
}

export default async function SubscriptionSlugPage({ params }: PageProps) {
  const { subscriptionSlug } = await params;
  const requested = normalizeSubscriptionSlug(subscriptionSlug);
  const route = await getSubscriptionSlugConfig();

  if (requested && requested === route.slug) {
    return renderSubscriptionLandingPage();
  }

  if (
    requested &&
    route.previousSlug &&
    requested === route.previousSlug &&
    route.previousSlug !== route.slug
  ) {
    permanentRedirect(route.pagePath);
  }

  notFound();
}
