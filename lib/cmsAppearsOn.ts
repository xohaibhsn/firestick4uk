/**
 * "Appears on: Page → Section" hints for Content Editor fields (admin UX only).
 */

import {
  ADMIN_CONTENT_SECTIONS,
  type AdminField,
} from "@/lib/adminContentFields";
import { CMS_SETTINGS_IMAGE_FIELDS } from "@/lib/cmsImageFields";

export type CmsAppearsOn = {
  pageLabel: string;
  sectionLabel: string;
};

const PAGE_LABELS: Record<string, string> = {
  home: "Home",
  about: "About",
  contact: "Contact",
  faq: "FAQ",
  footer: "Footer",
  products: "Products",
  cart: "Cart / Checkout",
  tracking: "Order tracking",
  blog: "Blog",
  legal: "Legal",
  global: "Global",
  subscription: "Subscriptions",
  seasonal: "Seasonal offers",
  settings: "Site Settings",
};

/** Inline sidhu fields not listed in ADMIN_CONTENT_SECTIONS. */
const INLINE_APPEARS_ON: Record<string, CmsAppearsOn> = {
  home_meta_title: { pageLabel: "Home", sectionLabel: "SEO" },
  home_meta_description: { pageLabel: "Home", sectionLabel: "SEO" },
  home_top_hero_title: { pageLabel: "Home", sectionLabel: "Top hero" },
  home_top_hero_subtitle: { pageLabel: "Home", sectionLabel: "Top hero" },
  home_hero_title: { pageLabel: "Home", sectionLabel: "Main hero" },
  home_hero_subtitle: { pageLabel: "Home", sectionLabel: "Main hero" },
  home_hero_btn_text: { pageLabel: "Home", sectionLabel: "Main hero" },
  home_hero_btn_link: { pageLabel: "Home", sectionLabel: "Main hero" },
  home_hero_btn_show: { pageLabel: "Home", sectionLabel: "Main hero" },
  home_hero_btn2_text: { pageLabel: "Home", sectionLabel: "Main hero" },
  home_hero_btn2_link: { pageLabel: "Home", sectionLabel: "Main hero" },
  home_hero_btn2_show: { pageLabel: "Home", sectionLabel: "Main hero" },
  home_features_list: { pageLabel: "Home", sectionLabel: "Main hero" },
  home_stat1_num: { pageLabel: "Home", sectionLabel: "Stats" },
  home_stat1_label: { pageLabel: "Home", sectionLabel: "Stats" },
  home_stat2_num: { pageLabel: "Home", sectionLabel: "Stats" },
  home_stat2_label: { pageLabel: "Home", sectionLabel: "Stats" },
  home_stat3_num: { pageLabel: "Home", sectionLabel: "Stats" },
  home_stat3_label: { pageLabel: "Home", sectionLabel: "Stats" },
  home_product_ids: { pageLabel: "Home", sectionLabel: "Featured products" },
  about_title: { pageLabel: "About", sectionLabel: "Page headers" },
  about_description: { pageLabel: "About", sectionLabel: "Story" },
  about_mission: { pageLabel: "About", sectionLabel: "Story" },
  // Subscription landing (SubscriptionContentEditor)
  subscription_slug: { pageLabel: "Subscriptions", sectionLabel: "URL" },
  subscription_hero_eyebrow: { pageLabel: "Subscriptions", sectionLabel: "Hero" },
  subscription_hero_title: { pageLabel: "Subscriptions", sectionLabel: "Hero" },
  subscription_hero_intro: { pageLabel: "Subscriptions", sectionLabel: "Hero" },
  subscription_hero_primary_cta: { pageLabel: "Subscriptions", sectionLabel: "Hero" },
  subscription_hero_wa_cta: { pageLabel: "Subscriptions", sectionLabel: "Hero" },
  subscription_benefits_title: { pageLabel: "Subscriptions", sectionLabel: "Benefits" },
  subscription_benefits_intro: { pageLabel: "Subscriptions", sectionLabel: "Benefits" },
  subscription_benefits_json: { pageLabel: "Subscriptions", sectionLabel: "Benefits" },
  subscription_plans_title: { pageLabel: "Subscriptions", sectionLabel: "Plans" },
  subscription_plans_intro: { pageLabel: "Subscriptions", sectionLabel: "Plans" },
  subscription_plans_cta: { pageLabel: "Subscriptions", sectionLabel: "Plans" },
  subscription_plans_help_cta: { pageLabel: "Subscriptions", sectionLabel: "Plans" },
  subscription_guarantee_text: { pageLabel: "Subscriptions", sectionLabel: "Plans" },
  subscription_product_ids: { pageLabel: "Subscriptions", sectionLabel: "Plans" },
  subscription_devices_title: { pageLabel: "Subscriptions", sectionLabel: "Devices" },
  subscription_devices_intro: { pageLabel: "Subscriptions", sectionLabel: "Devices" },
  subscription_devices_json: { pageLabel: "Subscriptions", sectionLabel: "Devices" },
  subscription_how_title: { pageLabel: "Subscriptions", sectionLabel: "How it works" },
  subscription_how_intro: { pageLabel: "Subscriptions", sectionLabel: "How it works" },
  subscription_how_json: { pageLabel: "Subscriptions", sectionLabel: "How it works" },
  subscription_rich_title: { pageLabel: "Subscriptions", sectionLabel: "Rich content" },
  subscription_rich_content: { pageLabel: "Subscriptions", sectionLabel: "Rich content" },
  subscription_faq_title: { pageLabel: "Subscriptions", sectionLabel: "FAQ" },
  subscription_faq_intro: { pageLabel: "Subscriptions", sectionLabel: "FAQ" },
  subscription_faq_ids: { pageLabel: "Subscriptions", sectionLabel: "FAQ" },
  subscription_cta_title: { pageLabel: "Subscriptions", sectionLabel: "Final CTA" },
  subscription_cta_desc: { pageLabel: "Subscriptions", sectionLabel: "Final CTA" },
  subscription_cta_primary: { pageLabel: "Subscriptions", sectionLabel: "Final CTA" },
  subscription_cta_wa: { pageLabel: "Subscriptions", sectionLabel: "Final CTA" },
  subscription_meta_title: { pageLabel: "Subscriptions", sectionLabel: "SEO" },
  subscription_meta_description: { pageLabel: "Subscriptions", sectionLabel: "SEO" },
  subscription_focus_keyword: { pageLabel: "Subscriptions", sectionLabel: "SEO" },
  subscription_canonical: { pageLabel: "Subscriptions", sectionLabel: "SEO" },
  subscription_og_image: { pageLabel: "Subscriptions", sectionLabel: "SEO" },
};

function buildMap(): Map<string, CmsAppearsOn> {
  const map = new Map<string, CmsAppearsOn>();
  for (const [page, sections] of Object.entries(ADMIN_CONTENT_SECTIONS)) {
    const pageLabel = PAGE_LABELS[page] || page;
    for (const section of sections) {
      for (const field of section.fields as AdminField[]) {
        map.set(field.key, { pageLabel, sectionLabel: section.title });
      }
    }
  }
  for (const [key, meta] of Object.entries(INLINE_APPEARS_ON)) {
    if (!map.has(key)) map.set(key, meta);
  }
  for (const img of CMS_SETTINGS_IMAGE_FIELDS) {
    const [pageLabel, sectionLabel] = img.appearsOn.split(" → ");
    map.set(img.key, {
      pageLabel: pageLabel || "Site Settings",
      sectionLabel: sectionLabel || img.label,
    });
  }
  return map;
}

let _cache: Map<string, CmsAppearsOn> | null = null;

export function cmsAppearsOnMap(): Map<string, CmsAppearsOn> {
  if (!_cache) _cache = buildMap();
  return _cache;
}

export function getCmsAppearsOn(key: string): CmsAppearsOn | null {
  return cmsAppearsOnMap().get(String(key || "").trim()) || null;
}

export function formatCmsAppearsOnHint(key: string): string {
  const m = getCmsAppearsOn(key);
  if (!m) return "";
  return `Appears on: ${m.pageLabel} → ${m.sectionLabel}`;
}

/** All keys that must have an appears-on mapping (Content Editor registry + images + inline). */
export function allCmsMappedFieldKeys(): string[] {
  return Array.from(cmsAppearsOnMap().keys()).sort();
}
