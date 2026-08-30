import type { Metadata } from "next";
import { connection } from "next/server";
import pool from "@/lib/db";
import { getContactConfig } from "@/lib/contact-config";
import { cms, cmsJson } from "@/lib/cms";
import BreadcrumbSchema from "@/components/BreadcrumbSchema";
import SubscriptionPageClient from "./SubscriptionPageClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PAGE_URL = "https://firestick4uk.com/iptv-subscriptions-uk/";
const DEFAULT_CANONICAL = PAGE_URL;

type SiteMap = Record<string, string>;

type ProductRow = {
  id: number;
  name: string;
  price: number | string;
  slug: string;
  image?: string | null;
  badge?: string | null;
  features?: string | null;
  short_description?: string | null;
  category?: string;
  active?: number;
};

type FaqRow = {
  id: number;
  question: string;
  answer: string;
  category?: string;
  is_visible?: number;
};

async function getSubscriptionContent(): Promise<SiteMap> {
  await connection();
  try {
    const [rows]: any = await pool.query(
      `SELECT content_key, content_value
       FROM site_content
       WHERE page_name = 'subscription'
          OR content_key LIKE 'subscription_%'
          OR content_key IN ('og_default_image', 'nav_subscription_label', 'site_logo_url')`
    );
    const result: SiteMap = {};
    for (const r of rows || []) result[r.content_key] = r.content_value || "";
    return result;
  } catch {
    return {};
  }
}

function parseIdList(raw: string): number[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0);
  } catch {
    return [];
  }
}

async function getSubscriptionProducts(selectedIds: number[]): Promise<ProductRow[]> {
  try {
    const [rows]: any = await pool.query(
      `SELECT id, name, price, slug, image, badge, features, short_description, category, active
       FROM products
       WHERE active = 1 AND category = 'Subscription'
       ORDER BY price ASC, id ASC`
    );
    const list: ProductRow[] = Array.isArray(rows) ? rows : [];
    if (!selectedIds.length) return list;
    const byId = new Map(list.map((p) => [p.id, p]));
    return selectedIds.map((id) => byId.get(id)).filter(Boolean) as ProductRow[];
  } catch {
    return [];
  }
}

async function getSelectedFaqs(selectedIds: number[]): Promise<FaqRow[]> {
  try {
    const [rows]: any = await pool.query(
      `SELECT id, question, answer, category, is_visible
       FROM faqs
       WHERE is_visible = 1
       ORDER BY category, sort_order ASC, id ASC`
    );
    const list: FaqRow[] = Array.isArray(rows) ? rows : [];
    if (!selectedIds.length) {
      return list
        .filter((f) =>
          /subscription|device|trial|payment|refund|activate|compatible/i.test(
            `${f.question} ${f.answer} ${f.category || ""}`
          )
        )
        .slice(0, 8);
    }
    const byId = new Map(list.map((f) => [f.id, f]));
    return selectedIds.map((id) => byId.get(id)).filter(Boolean) as FaqRow[];
  } catch {
    return [];
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const content = await getSubscriptionContent();
  const title =
    content.subscription_meta_title?.trim() ||
    "IPTV Subscriptions UK | Firestick Streaming Plans | Firestick4UK";
  const description =
    content.subscription_meta_description?.trim() ||
    "Compare Firestick4UK IPTV subscriptions and UK streaming plans for Firestick, Smart TV and Android devices. Order online with UK support.";
  const canonical =
    content.subscription_canonical?.trim() || DEFAULT_CANONICAL;
  const ogImage =
    content.subscription_og_image?.trim() ||
    content.og_default_image?.trim() ||
    undefined;

  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: "Firestick4UK",
      type: "website",
      ...(ogImage ? { images: [{ url: ogImage }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
  };
}

export default async function IptvSubscriptionsUkPage() {
  const content = await getSubscriptionContent();
  const contact = await getContactConfig();
  const productIds = parseIdList(content.subscription_product_ids || "");
  const faqIds = parseIdList(content.subscription_faq_ids || "");
  const products = await getSubscriptionProducts(productIds);
  const faqs = await getSelectedFaqs(faqIds);

  const pageTitle =
    cms(content, "subscription_hero_title", "IPTV Subscriptions UK — Flexible Plans for Firestick & Smart Devices");

  const webPageSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: pageTitle,
    url: PAGE_URL,
    description:
      cms(
        content,
        "subscription_meta_description",
        "Compare Firestick4UK IPTV subscriptions and UK streaming plans."
      ),
    isPartOf: {
      "@type": "WebSite",
      name: "Firestick4UK",
      url: "https://firestick4uk.com",
    },
  };

  const serviceSchema = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "Firestick4UK IPTV / Streaming Subscription",
    serviceType: "Streaming Subscription",
    provider: {
      "@type": "Organization",
      name: "Firestick4UK",
      url: "https://firestick4uk.com",
    },
    areaServed: {
      "@type": "Country",
      name: "United Kingdom",
    },
    url: PAGE_URL,
    description: cms(
      content,
      "subscription_hero_intro",
      "UK streaming subscriptions for Firestick and compatible devices."
    ),
  };

  const faqSchema =
    faqs.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faqs.map((f) => ({
            "@type": "Question",
            name: f.question,
            acceptedAnswer: {
              "@type": "Answer",
              text: f.answer,
            },
          })),
        }
      : null;

  const benefits = cmsJson(content, "subscription_benefits_json", [
    {
      icon: "UK",
      title: "UK-Based Support",
      desc: "Real help via WhatsApp when you need setup or order assistance.",
    },
    {
      icon: "CK",
      title: "Simple Checkout",
      desc: "Order through our existing store with bank transfer or cash on delivery where available.",
    },
    {
      icon: "DV",
      title: "Device Friendly",
      desc: "Designed for Firestick / Fire TV and other compatible streaming devices.",
    },
    {
      icon: "AC",
      title: "Fast Activation",
      desc: "Subscription services are typically active within 1 hour of payment confirmation.",
    },
  ]);

  const devices = cmsJson(content, "subscription_devices_json", [
    {
      icon: "FS",
      title: "Firestick / Fire TV",
      desc: "Amazon Fire TV Stick and Fire TV devices commonly used with our streaming apps.",
    },
    {
      icon: "TV",
      title: "Smart TV",
      desc: "Compatible Smart TVs such as supported Samsung and LG models where the app is available.",
    },
    {
      icon: "AT",
      title: "Android TV / Android Box",
      desc: "Android TV devices and Android boxes that support the required player apps.",
    },
    {
      icon: "MB",
      title: "Mobile & Tablet",
      desc: "Android phones and tablets, plus iPhone where the supported apps are available.",
    },
    {
      icon: "PC",
      title: "Windows / Computer",
      desc: "Windows PCs and compatible computer setups using supported streaming apps.",
    },
  ]);

  const howSteps = cmsJson(content, "subscription_how_json", [
    {
      step: "1",
      title: "Choose a subscription plan",
      desc: "Compare the plans below and open the plan that fits your needs.",
    },
    {
      step: "2",
      title: "Place your order in our store",
      desc: "Add the plan to your cart and complete your delivery and contact details.",
    },
    {
      step: "3",
      title: "Complete payment",
      desc: "Pay by UK bank transfer or cash on delivery where offered for your order.",
    },
    {
      step: "4",
      title: "We confirm your payment",
      desc: "After payment is verified, your order is confirmed in our system.",
    },
    {
      step: "5",
      title: "Activation & setup support",
      desc: "Your subscription is activated and our team can help with setup via WhatsApp if you need it.",
    },
  ]);

  return (
    <>
      <BreadcrumbSchema
        items={[
          { name: "Home", url: "https://firestick4uk.com" },
          { name: "IPTV Subscriptions UK", url: PAGE_URL },
        ]}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceSchema) }}
      />
      {faqSchema ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
        />
      ) : null}

      <SubscriptionPageClient
        content={content}
        products={products}
        faqs={faqs}
        benefits={benefits}
        devices={devices}
        howSteps={howSteps}
        whatsappUrl={contact.whatsappUrl}
      />
    </>
  );
}
