import type { Metadata } from "next";
import { cache } from "react";
import { connection } from "next/server";
import pool from "@/lib/db";
import HomeClient from "./HomeClient";
import BreadcrumbSchema from "@/components/BreadcrumbSchema";
import { defaultSocialImages } from "@/lib/socialMetadata";
import { getDefaultOgImageFromSettings } from "@/lib/socialMetadataServer";
import { getPublicActiveProducts } from "@/lib/publicProductsServer";
import { isHubLiveMember } from "@/lib/productSeasonEligibility";
import {
  floorSecondUtcMs,
  parseUtcSqlToMs,
  utcMsToUtcIso,
} from "@/lib/productSeasonLondon";
import { resolveSeasonalHubPublicState } from "@/lib/seasonalHubPublic";
import { resolveHomeProducts } from "@/lib/homeProductOrder";
import {
  applySeasonalPromoText,
  DEFAULT_SEASONAL_PROMO_CTA,
} from "@/lib/seasonalCountdownLabel";
import {
  heroSlideSrc,
  heroSlideSrcSet,
  HERO_SIZES,
} from "@/lib/cloudinaryDelivery";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Request-scoped: generateMetadata + HomePage share one home content SELECT. */
const getHomeContent = cache(async (): Promise<Record<string, string>> => {
  await connection();
  try {
    const [rows]: any = await pool.query(
      `SELECT content_key, content_value
       FROM site_content
       WHERE page_name = 'home'
          OR content_key IN (
            'home_meta_title',
            'home_meta_description',
            'home_top_hero_title',
            'home_top_hero_subtitle',
            'home_hero_title',
            'home_hero_subtitle',
            'home_tagline',
            'seasonal_promo_text',
            'seasonal_promo_cta',
            'season_countdown_prefix',
            'season_countdown_upcoming_prefix',
            'home_product_ids',
            'hero_slide_1',
            'hero_slide_2',
            'hero_slide_3',
            'hero_slide_4'
          )`
    );
    const result: Record<string, string> = {};
    for (const r of rows) result[r.content_key] = r.content_value || "";
    return result;
  } catch {
    return {};
  }
});

export async function generateMetadata(): Promise<Metadata> {
  const content = await getHomeContent();
  const metaTitle =
    content.home_meta_title?.trim() ||
    "Firestick4UK — Best Streaming Service UK";
  const metaDesc =
    content.home_meta_description?.trim() ||
    "Premium Firestick subscriptions and streaming services in the UK. HD & 4K channels, live sports, movies and more.";
  // Child openGraph/twitter replace parent — must include CMS-aware stable images
  const social = defaultSocialImages(
    await getDefaultOgImageFromSettings(),
    "Firestick4UK"
  );

  return {
    title: { absolute: metaTitle },
    description: metaDesc,
    alternates: {
      canonical: "https://firestick4uk.com",
    },
    openGraph: {
      title: metaTitle,
      description: metaDesc,
      url: "https://firestick4uk.com",
      siteName: "Firestick4UK",
      type: "website",
      images: social.images,
    },
    twitter: {
      card: "summary_large_image",
      title: metaTitle,
      description: metaDesc,
      images: social.twitterImages,
    },
  };
}

export default async function HomePage() {
  const nowMs = floorSecondUtcMs();
  const [content, allProducts, hubState] = await Promise.all([
    getHomeContent(),
    getPublicActiveProducts(),
    resolveSeasonalHubPublicState(pool, { nowMs }),
  ]);
  const initialProducts = resolveHomeProducts(
    allProducts,
    content.home_product_ids
  );

  let seasonalPromo: {
    text: string;
    cta: string;
    href: string;
    endsAt?: string | null;
  } | null = null;

  if (hubState.effectivelyPublic) {
    const live = hubState.rows.filter((r: any) =>
      isHubLiveMember(r, nowMs, hubState.capability)
    );
    if (live.length > 0) {
      let earliest: {
        endMs: number;
        endRaw: string;
        slug: string;
        seasonName: string;
      } | null = null;
      for (const r of live) {
        const endMs = parseUtcSqlToMs(r.season_ends_at);
        if (endMs == null) continue;
        if (earliest == null || endMs < earliest.endMs) {
          earliest = {
            endMs,
            endRaw: utcMsToUtcIso(endMs),
            slug: String(r.slug || "").trim(),
            seasonName: String(r.season_name || "").trim(),
          };
        }
      }
      const singleSlug =
        live.length === 1
          ? String(live[0]?.slug || earliest?.slug || "").trim()
          : "";
      const href =
        live.length === 1 && singleSlug
          ? `/products/${singleSlug}`
          : "/seasonal-offers";
      seasonalPromo = {
        text: applySeasonalPromoText(
          content.seasonal_promo_text,
          earliest?.seasonName
        ),
        cta: content.seasonal_promo_cta?.trim() || DEFAULT_SEASONAL_PROMO_CTA,
        href,
        endsAt: earliest?.endRaw ?? null,
      };
    }
  }

  const initialSlides = [
    content.hero_slide_1,
    content.hero_slide_2,
    content.hero_slide_3,
    content.hero_slide_4,
  ]
    .map((u) => (typeof u === "string" ? u.trim() : ""))
    .filter(Boolean);
  const lcpSrc = initialSlides[0] ? heroSlideSrc(initialSlides[0]) : null;
  const lcpSrcSet = initialSlides[0] ? heroSlideSrcSet(initialSlides[0]) : "";

  return (
    <>
      {lcpSrcSet ? (
        <link
          rel="preload"
          as="image"
          imageSrcSet={lcpSrcSet}
          imageSizes={HERO_SIZES}
          fetchPriority="high"
        />
      ) : lcpSrc ? (
        <link
          rel="preload"
          as="image"
          href={lcpSrc}
          fetchPriority="high"
        />
      ) : null}
      <BreadcrumbSchema
        items={[{ name: "Home", url: "https://firestick4uk.com" }]}
      />
      <HomeClient
        topHeroTitle={
          content.home_top_hero_title?.trim() || "Best Firestick Service in UK"
        }
        topHeroSubtitle={
          content.home_top_hero_subtitle?.trim() ||
          "Premium Streaming Solutions for the UK"
        }
        heroTitle={
          content.home_hero_title?.trim() || "Premium UK Streaming Service"
        }
        heroSubtitle={
          content.home_hero_subtitle?.trim() ||
          "Firestick4UK provides premium UK streaming services for Firestick and Android Box users."
        }
        initialProducts={initialProducts}
        initialSlides={initialSlides}
        seasonalPromo={seasonalPromo}
        showSeasonalOffersLink={hubState.effectivelyPublic}
      />
    </>
  );
}
