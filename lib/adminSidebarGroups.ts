/**
 * Sidhu admin sidebar groups (MULTI-102).
 * Pure data + helpers — permission filtering stays with canAccessSidhuTab / hasAdminPermission.
 */

export type SidhuNavTabId =
  | "dashboard"
  | "orders"
  | "products"
  | "customers"
  | "leads"
  | "reviews"
  | "blog"
  | "seo"
  | "redirects"
  | "insights"
  | "media"
  | "history"
  | "coupons"
  | "builder"
  | "faqadmin"
  | "pages"
  | "staff"
  | "audit"
  | "settings";

export type SidebarNavItemDef = {
  id: SidhuNavTabId;
  icon: string;
  label: string;
  /** Shortcut that is not a real tab (opens wizard). Unique key for React list. */
  shortcut?: "seasonal_offer";
  /** Stable list key (required when shortcut duplicates a tab id). */
  navKey?: string;
};

export type SidebarGroupDef = {
  id: string;
  /** null = single item, no group header (Dashboard). */
  label: string | null;
  icon: string;
  items: SidebarNavItemDef[];
};

/** Exact 19 tabs + Catalog seasonal shortcut. Every real tab appears once. */
export const SIDEBAR_GROUPS: SidebarGroupDef[] = [
  {
    id: "dashboard",
    label: null,
    icon: "🏠",
    items: [{ id: "dashboard", icon: "📊", label: "Dashboard" }],
  },
  {
    id: "sales",
    label: "Sales",
    icon: "🛒",
    items: [
      { id: "orders", icon: "🛒", label: "Orders" },
      { id: "customers", icon: "👥", label: "Customers" },
      { id: "coupons", icon: "🎟️", label: "Coupons" },
      { id: "leads", icon: "💬", label: "Leads" },
    ],
  },
  {
    id: "catalog",
    label: "Catalog",
    icon: "📦",
    items: [
      { id: "products", icon: "📦", label: "Products" },
      { id: "reviews", icon: "⭐", label: "Reviews" },
      {
        id: "products",
        icon: "🎄",
        label: "New seasonal offer",
        shortcut: "seasonal_offer",
        navKey: "catalog-seasonal-offer",
      },
    ],
  },
  {
    id: "content",
    label: "Content",
    icon: "✍️",
    items: [
      { id: "pages", icon: "✏️", label: "Pages" },
      { id: "builder", icon: "🎨", label: "Page Builder" },
      { id: "blog", icon: "📝", label: "Blog" },
      { id: "faqadmin", icon: "❓", label: "FAQs" },
      { id: "media", icon: "🖼️", label: "Media Library" },
    ],
  },
  {
    id: "seo_marketing",
    label: "SEO & Marketing",
    icon: "📈",
    items: [
      { id: "seo", icon: "🔎", label: "SEO" },
      { id: "redirects", icon: "↪️", label: "Redirects" },
      { id: "insights", icon: "📈", label: "Insights" },
    ],
  },
  {
    id: "settings_team",
    label: "Settings & Team",
    icon: "⚙️",
    items: [
      { id: "settings", icon: "⚙️", label: "Site Settings" },
      { id: "staff", icon: "👤", label: "Staff Users" },
      { id: "audit", icon: "📜", label: "Activity Log" },
      { id: "history", icon: "🕘", label: "History" },
    ],
  },
];

/** All real tab ids (no shortcuts), each exactly once. */
export const ALL_SIDEBAR_TAB_IDS: SidhuNavTabId[] = [
  "dashboard",
  "orders",
  "customers",
  "coupons",
  "leads",
  "products",
  "reviews",
  "pages",
  "builder",
  "blog",
  "faqadmin",
  "media",
  "seo",
  "redirects",
  "insights",
  "settings",
  "staff",
  "audit",
  "history",
];

export const SIDEBAR_GROUP_STORAGE_KEY = "f4uk-sidhu-sidebar-groups-v1";

export function tabToGroupId(tabId: string): string | null {
  for (const g of SIDEBAR_GROUPS) {
    for (const item of g.items) {
      if (!item.shortcut && item.id === tabId) return g.id;
    }
  }
  return null;
}

export function mapTabsOnce(): {
  ok: boolean;
  missing: string[];
  duplicates: string[];
  mapped: Record<string, string>;
} {
  const mapped: Record<string, string> = {};
  const duplicates: string[] = [];
  for (const g of SIDEBAR_GROUPS) {
    for (const item of g.items) {
      if (item.shortcut) continue;
      if (mapped[item.id]) duplicates.push(item.id);
      else mapped[item.id] = g.id;
    }
  }
  const missing = ALL_SIDEBAR_TAB_IDS.filter((id) => !mapped[id]);
  const extra = Object.keys(mapped).filter(
    (id) => !ALL_SIDEBAR_TAB_IDS.includes(id as SidhuNavTabId)
  );
  return {
    ok: missing.length === 0 && duplicates.length === 0 && extra.length === 0,
    missing,
    duplicates,
    mapped,
  };
}

export function sumBadgeNumbers(
  badges: Array<string | number | null | undefined>
): number {
  let sum = 0;
  for (const b of badges) {
    if (b == null || b === "") continue;
    const n = Number(b);
    if (Number.isFinite(n)) sum += n;
  }
  return sum;
}

export type SidebarOpenState = Record<string, boolean>;

export function defaultSidebarOpenState(activeTab: string): SidebarOpenState {
  const activeGroup = tabToGroupId(activeTab) || "dashboard";
  const out: SidebarOpenState = {};
  for (const g of SIDEBAR_GROUPS) {
    out[g.id] = g.id === activeGroup;
  }
  return out;
}

export function readSidebarOpenState(
  activeTab: string,
  storage: { getItem(key: string): string | null } | null = null
): SidebarOpenState {
  const defaults = defaultSidebarOpenState(activeTab);
  if (!storage) return defaults;
  try {
    const raw = storage.getItem(SIDEBAR_GROUP_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as SidebarOpenState;
    if (!parsed || typeof parsed !== "object") return defaults;
    const merged: SidebarOpenState = { ...defaults };
    for (const g of SIDEBAR_GROUPS) {
      if (typeof parsed[g.id] === "boolean") merged[g.id] = parsed[g.id];
    }
    // Active group always open
    const activeGroup = tabToGroupId(activeTab);
    if (activeGroup) merged[activeGroup] = true;
    return merged;
  } catch {
    return defaults;
  }
}

export function writeSidebarOpenState(
  state: SidebarOpenState,
  storage: { setItem(key: string, value: string): void } | null = null
): void {
  if (!storage) return;
  try {
    storage.setItem(SIDEBAR_GROUP_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota / private mode */
  }
}

/** Site Settings accordion section ids (MULTI-102). */
export const SITE_SETTINGS_SECTIONS = [
  "branding",
  "hero_slides",
  "contact_whatsapp",
  "payments_bank",
  "vat_pricing",
  "seasonal_offers",
  "reviews",
  "tracking_ads",
  "server",
  "other",
] as const;

export type SiteSettingsSectionId = (typeof SITE_SETTINGS_SECTIONS)[number];

export const SITE_SETTINGS_SECTION_TITLES: Record<SiteSettingsSectionId, string> = {
  branding: "Branding",
  hero_slides: "Hero slides",
  contact_whatsapp: "Contact & WhatsApp",
  payments_bank: "Payments & Bank",
  vat_pricing: "VAT & Pricing",
  seasonal_offers: "Seasonal offers",
  reviews: "Reviews",
  tracking_ads: "Tracking & Ads labels",
  server: "Server",
  other: "Other settings",
};

/** Keys classified into Site Settings sections (excludes Server panel — not a site_content key). */
export const SITE_SETTINGS_FIELD_MAP: Record<
  Exclude<SiteSettingsSectionId, "server" | "payments_bank" | "other">,
  string[]
> = {
  branding: [
    "site_title",
    "site_tagline",
    "site_logo_url",
    "favicon_url",
    "og_default_image",
    "site_meta_description",
  ],
  hero_slides: ["hero_slide_1", "hero_slide_2", "hero_slide_3", "hero_slide_4"],
  contact_whatsapp: [
    "contact_whatsapp",
    "whatsapp_number",
    "contact_phone",
    "contact_email",
    "contact_telegram",
    "whatsapp_icon_url",
  ],
  vat_pricing: ["prices_include_vat"],
  seasonal_offers: ["seasonal_hub_published"],
  reviews: ["reviews_submission_enabled", "reviews_notify_admin"],
  tracking_ads: ["ads_conv_label_purchase", "ads_conv_label_whatsapp"],
};

/** Keys with no confident home → Other. Denylisted trust_activation (no public readers). */
export const SITE_SETTINGS_OTHER_KEYS: string[] = ["trust_activation"];

export const PRODUCT_EDITOR_SECTIONS = [
  "basic_info",
  "price_stock",
  "images",
  "description_features",
  "seo",
  "seasonal",
  "visibility",
] as const;

export type ProductEditorSectionId = (typeof PRODUCT_EDITOR_SECTIONS)[number];

export const PRODUCT_EDITOR_SECTION_TITLES: Record<ProductEditorSectionId, string> = {
  basic_info: "Basic info",
  price_stock: "Price & stock",
  images: "Images",
  description_features: "Description & features",
  seo: "SEO",
  seasonal: "Seasonal settings",
  visibility: "Visibility",
};

export const CMS_EXPAND_FIELD_EVENT = "f4uk-cms-expand-for-field";
/** Global admin search → Content Editor Find-text (detail.query string). */
export const CMS_FIND_QUERY_EVENT = "f4uk-cms-find-query";
