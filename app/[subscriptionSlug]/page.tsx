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

/** Raw path segment with only leading/trailing slashes trimmed (case preserved). */
function rawSlugSegment(input: string): string {
  return String(input || "")
    .trim()
    .replace(/^\/+|\/+$/g, "");
}

export async function generateMetadata({ params }: PageProps) {
  const { subscriptionSlug } = await params;
  const raw = rawSlugSegment(subscriptionSlug);
  const requested = normalizeSubscriptionSlug(subscriptionSlug);
  const route = await getSubscriptionSlugConfig();

  if (requested === route.slug) {
    // Case variants redirect — do not advertise indexable metadata on the alternate.
    if (raw !== route.slug) {
      return { robots: { index: false, follow: true } };
    }
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
  const raw = rawSlugSegment(subscriptionSlug);
  const requested = normalizeSubscriptionSlug(subscriptionSlug);
  const route = await getSubscriptionSlugConfig();

  if (requested && requested === route.slug) {
    // Uppercase / mixed-case → permanent redirect to exact lowercase active slug.
    // Avoids duplicate 200s; target is no-slash pagePath (no loop with Next slash trim).
    if (raw !== route.slug) {
      permanentRedirect(route.pagePath);
    }
    return renderSubscriptionLandingPage();
  }

  if (
    requested &&
    route.previousSlug &&
    requested === route.previousSlug &&
    route.previousSlug !== route.slug
  ) {
    // Previous slug (any case, after normalize) → active lowercase path.
    permanentRedirect(route.pagePath);
  }

  notFound();
}
