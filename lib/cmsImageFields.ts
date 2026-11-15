/**
 * Admin image URL fields that must expose Media Library picker + thumbnail.
 * Settings keys remain gated by settings.manage / SA-only list.
 */

export type CmsImageFieldMeta = {
  key: string;
  label: string;
  purpose: "hero" | "logo" | "og" | "whatsapp" | "favicon" | "products" | "blog";
  /** Where the image appears (hint). */
  appearsOn: string;
  surface: "settings" | "page_builder" | "products" | "blog";
};

/** Settings / branding image URL keys. */
export const CMS_SETTINGS_IMAGE_FIELDS: readonly CmsImageFieldMeta[] = [
  {
    key: "site_logo_url",
    label: "Site logo",
    purpose: "logo",
    appearsOn: "Global → Navbar / Footer",
    surface: "settings",
  },
  {
    key: "favicon_url",
    label: "Favicon",
    purpose: "favicon",
    appearsOn: "Global → Browser tab icon",
    surface: "settings",
  },
  {
    key: "og_default_image",
    label: "Default share image",
    purpose: "og",
    appearsOn: "Global → Social share preview",
    surface: "settings",
  },
  {
    key: "whatsapp_icon_url",
    label: "WhatsApp button icon",
    purpose: "whatsapp",
    appearsOn: "Global → Floating WhatsApp button",
    surface: "settings",
  },
  {
    key: "hero_slide_1",
    label: "Hero slide 1",
    purpose: "hero",
    appearsOn: "Home → Top hero slider",
    surface: "settings",
  },
  {
    key: "hero_slide_2",
    label: "Hero slide 2",
    purpose: "hero",
    appearsOn: "Home → Top hero slider",
    surface: "settings",
  },
  {
    key: "hero_slide_3",
    label: "Hero slide 3",
    purpose: "hero",
    appearsOn: "Home → Top hero slider",
    surface: "settings",
  },
  {
    key: "hero_slide_4",
    label: "Hero slide 4",
    purpose: "hero",
    appearsOn: "Home → Top hero slider",
    surface: "settings",
  },
  {
    key: "subscription_og_image",
    label: "Subscription OG image",
    purpose: "og",
    appearsOn: "Subscriptions → SEO",
    surface: "settings",
  },
] as const;

/** Page Builder JSON image property names (hero_image etc.). */
export const CMS_PAGE_BUILDER_IMAGE_KEYS = ["hero_image", "image", "icon", "avatar"] as const;

export const CMS_IMAGE_FIELD_KEYS: readonly string[] = CMS_SETTINGS_IMAGE_FIELDS.map(
  (f) => f.key
);

export function isCmsSettingsImageKey(key: string): boolean {
  return CMS_IMAGE_FIELD_KEYS.includes(String(key || "").trim());
}
