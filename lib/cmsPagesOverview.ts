/**
 * Content Editor — Pages overview cards (admin UX only).
 * Counts come from ADMIN_CONTENT_SECTIONS (+ known inline editors).
 */

import { ADMIN_CONTENT_SECTIONS } from "@/lib/adminContentFields";
import { cmsViewOnSiteForPage } from "@/lib/cmsFindText";

export type CmsOverviewCard = {
  id: string;
  title: string;
  /** Content Editor page key to open on Edit (empty = settings / non-editable). */
  editPage: string;
  href: string;
  sectionCount: number;
  fieldCount: number;
  note?: string;
};

function countsFor(page: string): { sectionCount: number; fieldCount: number } {
  const sections = ADMIN_CONTENT_SECTIONS[page] || [];
  return {
    sectionCount: sections.length,
    fieldCount: sections.reduce((n, s) => n + s.fields.length, 0),
  };
}

/** Extra inline fields rendered in sidhu (not in ADMIN_CONTENT_SECTIONS). */
const INLINE_FIELD_EXTRA: Record<string, number> = {
  home: 20, // meta, top/main hero, buttons, stats, products picker
  about: 3, // title, description, mission
  contact: 0,
  cart: 0,
  subscription: 25, // SubscriptionContentEditor SAVE_KEYS approx; overview uses fixed below
};

/** Canonical Pages overview list (display order). */
export const CMS_PAGES_OVERVIEW: CmsOverviewCard[] = (() => {
  const home = countsFor("home");
  const products = countsFor("products");
  const listingFields = (ADMIN_CONTENT_SECTIONS.products?.[0]?.fields.length || 0);
  const detailFields = (ADMIN_CONTENT_SECTIONS.products?.[1]?.fields.length || 0);
  const about = countsFor("about");
  const contact = countsFor("contact");
  const faq = countsFor("faq");
  const cart = countsFor("cart");
  const tracking = countsFor("tracking");
  const blog = countsFor("blog");
  const legal = countsFor("legal");
  const footer = countsFor("footer");
  const global = countsFor("global");

  // Success fields are the success_* keys inside cart sections
  const successFields = (ADMIN_CONTENT_SECTIONS.cart || [])
    .flatMap((s) => s.fields)
    .filter((f) => f.key.startsWith("success_")).length;

  return [
    {
      id: "home",
      title: "Home",
      editPage: "home",
      href: "/",
      sectionCount: home.sectionCount + 1,
      fieldCount: home.fieldCount + (INLINE_FIELD_EXTRA.home || 0),
    },
    {
      id: "products_listing",
      title: "Products listing",
      editPage: "products",
      href: "/products",
      sectionCount: 1,
      fieldCount: listingFields,
    },
    {
      id: "product_detail",
      title: "Product detail",
      editPage: "products",
      href: "/products/firestick-4k",
      sectionCount: 1,
      fieldCount: detailFields,
    },
    {
      id: "about",
      title: "About",
      editPage: "about",
      href: "/about",
      sectionCount: about.sectionCount + 1,
      fieldCount: about.fieldCount + (INLINE_FIELD_EXTRA.about || 0),
    },
    {
      id: "contact",
      title: "Contact",
      editPage: "contact",
      href: "/contact",
      sectionCount: contact.sectionCount,
      fieldCount: contact.fieldCount,
    },
    {
      id: "faq",
      title: "FAQ",
      editPage: "faq",
      href: "/faq",
      sectionCount: faq.sectionCount,
      fieldCount: faq.fieldCount,
    },
    {
      id: "subscription",
      title: "Subscriptions",
      editPage: "subscription",
      href: "/iptv-subscriptions-uk",
      sectionCount: 8,
      fieldCount: 35,
      note: "Edited via Subscription panel",
    },
    {
      id: "seasonal",
      title: "Seasonal offers",
      editPage: "home",
      href: "/seasonal-offers",
      sectionCount: 1,
      fieldCount: 2,
      note: "Promo strip on Home; hub publish in Site Settings",
    },
    {
      id: "tracking",
      title: "Order tracking",
      editPage: "tracking",
      href: "/order-tracking",
      sectionCount: tracking.sectionCount,
      fieldCount: tracking.fieldCount,
    },
    {
      id: "cart",
      title: "Cart / Checkout",
      editPage: "cart",
      href: "/cart",
      sectionCount: Math.max(1, cart.sectionCount),
      fieldCount: Math.max(0, cart.fieldCount - successFields),
    },
    {
      id: "success",
      title: "Success",
      editPage: "cart",
      href: "/cart",
      sectionCount: 1,
      fieldCount: successFields,
      note: "Order success copy (Cart editor)",
    },
    {
      id: "footer_global",
      title: "Footer / Global",
      editPage: "footer",
      href: "/",
      sectionCount: footer.sectionCount + global.sectionCount,
      fieldCount: footer.fieldCount + global.fieldCount,
    },
    {
      id: "legal",
      title: "Legal pages",
      editPage: "legal",
      href: "/privacy-policy",
      sectionCount: legal.sectionCount,
      fieldCount: legal.fieldCount,
    },
  ];
})();

export function cmsOverviewViewHref(card: CmsOverviewCard): string {
  const fromMap = cmsViewOnSiteForPage(card.editPage);
  if (card.href) return card.href;
  return fromMap?.href || "/";
}
