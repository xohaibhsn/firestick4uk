import type { Metadata } from "next";
import { connection } from "next/server";
import pool from "@/lib/db";
import HomeClient from "./HomeClient";
import BreadcrumbSchema from "@/components/BreadcrumbSchema";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function getHomeContent(): Promise<Record<string, string>> {
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
            'home_tagline'
          )`
    );
    const result: Record<string, string> = {};
    for (const r of rows) result[r.content_key] = r.content_value || "";
    return result;
  } catch {
    return {};
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const content = await getHomeContent();
  const metaTitle =
    content.home_meta_title?.trim() ||
    "Firestick4UK — Best Streaming Service UK";
  const metaDesc =
    content.home_meta_description?.trim() ||
    "Premium Firestick subscriptions and streaming services in the UK. HD & 4K channels, live sports, movies and more.";

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
    },
    twitter: {
      card: "summary_large_image",
      title: metaTitle,
      description: metaDesc,
    },
  };
}

export default async function HomePage() {
  const content = await getHomeContent();

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
      />
    </>
  );
}
