import type { Metadata } from "next";
import pool from "@/lib/db";
import HomeClient from "./HomeClient";

export const dynamic = "force-dynamic";

async function getHomeContent(): Promise<Record<string, string>> {
  try {
    const [rows]: any = await pool.query(
      "SELECT content_key, content_value FROM site_content WHERE page_name = 'home'"
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
    content.home_meta_title || "Firestick4UK — Best Streaming Service UK";
  const metaDesc =
    content.home_meta_description ||
    "Premium Firestick subscriptions and streaming services in the UK. HD & 4K channels, live sports, movies and more.";

  return {
    title: metaTitle,
    description: metaDesc,
    alternates: {
      canonical: "https://firestick4uk.com",
    },
  };
}

export default async function HomePage() {
  const content = await getHomeContent();

  return (
    <HomeClient
      heroTitle={
        content.home_hero_title || "Best Firestick Subscription Service in UK"
      }
      heroSubtitle={
        content.home_hero_subtitle ||
        "Premium streaming for Firestick, Android Box, Smart TV & more"
      }
    />
  );
}
