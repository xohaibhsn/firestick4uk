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
            'home_product_ids'
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
    endsAt?: string | null;
    showCountdown?: boolean;
    prefix?: string;
    upcomingPrefix?: string;
  } | null = null;

  if (hubState.effectivelyPublic) {
    const live = hubState.rows.filter((r: any) =>
      isHubLiveMember(r, nowMs, hubState.capability)
    );
    if (live.length > 0) {
      let earliestEndMs: number | null = null;
      let earliestEndRaw: string | null = null;
      for (const r of live) {
        const endMs = parseUtcSqlToMs(r.season_ends_at);
        if (endMs == null) continue;
        if (earliestEndMs == null || endMs < earliestEndMs) {
          earliestEndMs = endMs;
          earliestEndRaw = utcMsToUtcIso(endMs);
        }
      }
      seasonalPromo = {
        text:
          content.seasonal_promo_text?.trim() ||
          "Seasonal offers are live — limited-time deals",
        cta: content.seasonal_promo_cta?.trim() || "View offers",
        endsAt: earliestEndRaw,
        showCountdown: Boolean(earliestEndRaw),
        prefix: content.season_countdown_prefix?.trim() || "Offer ends in",
        upcomingPrefix:
          content.season_countdown_upcoming_prefix?.trim() || "Offer starts in",
      };
    }
  }

  return (
    <>
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
        seasonalPromo={seasonalPromo}
        showSeasonalOffersLink={hubState.effectivelyPublic}
      />
    </>
  );
}
