/**
 * Pure CMS role → capability policy.
 * No DB, no secrets. Server and Sidhu UI share this source of truth.
 */

export type AdminRoleName = "super_admin" | "manager" | "writer";

export type AdminPermission =
  | "dashboard.view"
  | "orders.view"
  | "orders.manage"
  | "customers.view"
  | "products.view"
  | "products.manage"
  | "leads.view"
  | "leads.manage"
  | "training.manage"
  | "blog.manage"
  | "faqs.manage"
  | "content.manage"
  | "coupons.manage"
  | "page_builder.manage"
  | "settings.manage"
  | "staff.manage"
  | "media.upload"
  | "blog_media.upload";

export type SidhuTab =
  | "dashboard"
  | "orders"
  | "products"
  | "customers"
  | "leads"
  | "training"
  | "blog"
  | "coupons"
  | "builder"
  | "faqadmin"
  | "pages"
  | "staff"
  | "settings";

const ALL_PERMISSIONS: readonly AdminPermission[] = [
  "dashboard.view",
  "orders.view",
  "orders.manage",
  "customers.view",
  "products.view",
  "products.manage",
  "leads.view",
  "leads.manage",
  "training.manage",
  "blog.manage",
  "faqs.manage",
  "content.manage",
  "coupons.manage",
  "page_builder.manage",
  "settings.manage",
  "staff.manage",
  "media.upload",
  "blog_media.upload",
] as const;

const MANAGER_PERMISSIONS: readonly AdminPermission[] = [
  "dashboard.view",
  "orders.view",
  "orders.manage",
  "customers.view",
  "products.view",
  "products.manage",
  "leads.view",
  "leads.manage",
  "training.manage",
  "blog.manage",
  "faqs.manage",
  "content.manage",
  "media.upload",
  "blog_media.upload",
] as const;

const WRITER_PERMISSIONS: readonly AdminPermission[] = [
  "dashboard.view",
  "blog.manage",
  "blog_media.upload",
] as const;

export const ROLE_PERMISSIONS: Record<AdminRoleName, readonly AdminPermission[]> = {
  super_admin: ALL_PERMISSIONS,
  manager: MANAGER_PERMISSIONS,
  writer: WRITER_PERMISSIONS,
};

const TAB_PERMISSION: Record<SidhuTab, AdminPermission> = {
  dashboard: "dashboard.view",
  orders: "orders.view",
  products: "products.view",
  customers: "customers.view",
  leads: "leads.view",
  training: "training.manage",
  blog: "blog.manage",
  coupons: "coupons.manage",
  builder: "page_builder.manage",
  faqadmin: "faqs.manage",
  pages: "content.manage",
  staff: "staff.manage",
  settings: "settings.manage",
};

/**
 * Explicit Super Admin–only Site Settings keys (branding + core business contacts).
 * Content Editor may still edit descriptive contact copy (titles, hours labels, etc.).
 * Core coordinates are SA-only — especially contact_email (order notification recipient).
 */
export const SUPER_ADMIN_SITE_SETTINGS_KEYS = new Set<string>([
  "site_title",
  "site_tagline",
  "site_logo_url",
  "favicon_url",
  "og_default_image",
  "whatsapp_icon_url",
  "hero_slide_1",
  "hero_slide_2",
  "hero_slide_3",
  "hero_slide_4",
  "site_meta_description",
  "contact_email",
  "contact_whatsapp",
  "whatsapp_number",
  "contact_phone",
  "contact_telegram",
]);

export function isSuperAdminSettingsKey(key: string): boolean {
  return SUPER_ADMIN_SITE_SETTINGS_KEYS.has(String(key || "").trim());
}

export function hasAdminPermission(role: AdminRoleName, permission: AdminPermission): boolean {
  const caps = ROLE_PERMISSIONS[role];
  return Array.isArray(caps) && caps.includes(permission);
}

export function allowedRolesFor(permission: AdminPermission): AdminRoleName[] {
  return (Object.keys(ROLE_PERMISSIONS) as AdminRoleName[]).filter((role) =>
    hasAdminPermission(role, permission)
  );
}

export function canAccessSidhuTab(role: AdminRoleName, tab: SidhuTab): boolean {
  const perm = TAB_PERMISSION[tab];
  return perm ? hasAdminPermission(role, perm) : false;
}

/** Approved Cloudinary/local upload purposes — never trust arbitrary browser folders. */
export type UploadPurpose =
  | "blog"
  | "products"
  | "logo"
  | "og"
  | "whatsapp"
  | "hero"
  | "favicon"
  | "receipts";

const UPLOAD_PURPOSE_FOLDERS: Record<UploadPurpose, string> = {
  blog: "firestick4uk/blog",
  products: "firestick4uk/products",
  logo: "firestick4uk/logo",
  og: "firestick4uk/og",
  whatsapp: "firestick4uk/whatsapp-icon",
  hero: "firestick4uk/hero-slides",
  favicon: "firestick4uk/favicon",
  receipts: "firestick4uk/receipts",
};

const ROLE_UPLOAD_PURPOSES: Record<AdminRoleName, readonly UploadPurpose[]> = {
  super_admin: ["blog", "products", "logo", "og", "whatsapp", "hero", "favicon", "receipts"],
  manager: ["blog", "products", "receipts"],
  writer: ["blog"],
};

/** Map client folder string → approved purpose, or null if unapproved. */
export function resolveUploadPurpose(folder: unknown): { purpose: UploadPurpose; folder: string } | null {
  const raw = String(folder || "")
    .trim()
    .replace(/^\/+|\/+$/g, "");
  const normalized = raw || UPLOAD_PURPOSE_FOLDERS.products;

  for (const [purpose, approved] of Object.entries(UPLOAD_PURPOSE_FOLDERS) as Array<
    [UploadPurpose, string]
  >) {
    if (normalized === approved || normalized.startsWith(approved + "/")) {
      return { purpose, folder: approved };
    }
  }
  return null;
}

export function canUploadPurpose(role: AdminRoleName, purpose: UploadPurpose): boolean {
  return ROLE_UPLOAD_PURPOSES[role]?.includes(purpose) ?? false;
}

export const ROLE_UI_DESCRIPTIONS: Record<AdminRoleName, string> = {
  super_admin: "Full CMS and administration",
  manager: "Orders, customers, products, leads, training, blog, FAQs and content",
  writer: "Blog authoring only",
};
