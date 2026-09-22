import type { Metadata } from "next";

/** Approved branded fallback (mirrors CMS default OG asset). Not timestamp-bust. */
export const FALLBACK_OG_IMAGE = "https://firestick4uk.com/og-default.png";

/**
 * Social / Open Graph image URLs must be deterministic.
 * Do NOT apply timestamp cache-busting here (favicon handling is separate).
 */
export function stableSocialImageUrl(url: string): string {
  const raw = (url || "").trim().split("#")[0];
  if (!raw) return "";
  if (!raw.startsWith("http") && !raw.startsWith("/")) return "";
  return raw;
}

/** Prefer CMS og_default_image; otherwise the stable public fallback. */
export function resolveDefaultOgImage(cmsUrl?: string | null): string {
  const stable = stableSocialImageUrl(cmsUrl || "");
  return stable || FALLBACK_OG_IMAGE;
}

type OgImage = NonNullable<NonNullable<Metadata["openGraph"]>["images"]>;

/** Image descriptors for openGraph / twitter — dimensions omitted unless known accurate. */
export function defaultSocialImages(
  imageUrl: string,
  alt = "Firestick4UK"
): { images: OgImage; twitterImages: string[] } {
  const url = resolveDefaultOgImage(imageUrl);
  return {
    images: [{ url, alt }],
    twitterImages: [url],
  };
}
