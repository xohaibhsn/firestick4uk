/**
 * Authenticated read-only SEO overview aggregate.
 * GET only. No mutations. No crawling. Bounded queries.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import pool from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import {
  hasAdminPermission,
  type AdminRoleName,
} from "@/lib/adminPermissions";
import {
  PRODUCT8_CANONICAL_SLUG,
  PRODUCT8_LEGACY_SLUG_REDIRECTS,
} from "@/lib/productLegacyRedirects";
import {
  DEFAULT_SUBSCRIPTION_SLUG,
  normalizeSubscriptionSlug,
  subscriptionPageUrl,
} from "@/lib/subscriptionSlug";
import { buildSeoDiagnostics } from "@/lib/seoDiagnostics";
import {
  normalizeBlogDiagnosticRow,
  normalizeProductDiagnosticRow,
} from "@/lib/seoDiagnosticRows";
import {
  GSC_ACCOUNT_CHECKS,
  PRODUCT8_CURRENT_SLUG,
  PRODUCT9_CURRENT_SLUG,
  SEO_SITE_ORIGIN,
  buildContentVerificationItems,
  buildKeyPageFacts,
  buildProductMigrationVerificationItems,
  productPublicUrl,
  type VerificationItem,
} from "@/lib/seoOverview";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const admin = await requireAdmin(req, res, { mutate: false });
  if (!admin) return;

  const role = admin.role as AdminRoleName;
  const canProducts = hasAdminPermission(role, "products.view");
  const canBlog = hasAdminPermission(role, "blog.manage");
  const canContent = hasAdminPermission(role, "content.manage");
  const canSettings = hasAdminPermission(role, "settings.manage");

  if (!canProducts && !canBlog && !canContent && !canSettings) {
    return res.status(403).json({
      error: "Forbidden",
      message: "You do not have permission to view the SEO overview.",
    });
  }

  const permissions = {
    products: canProducts,
    blog: canBlog,
    content: canContent,
    settings: canSettings,
    productsManage: hasAdminPermission(role, "products.manage"),
    blogManage: canBlog,
    contentManage: canContent,
    settingsManage: canSettings,
  };

  let subscriptionUrl = subscriptionPageUrl(DEFAULT_SUBSCRIPTION_SLUG);
  let subscriptionPrevious = "";
  let site: Record<string, unknown> | undefined;
  let products: unknown[] | undefined;
  let blog: unknown[] | undefined;
  let product8: Record<string, unknown> | undefined;

  // One bounded site_content query when settings and/or content access.
  if (canSettings || canContent) {
    const keys = [
      "subscription_slug",
      "subscription_previous_slug",
      "subscription_canonical",
      "subscription_meta_title",
      "subscription_meta_description",
      "og_default_image",
      "home_meta_title",
      "home_meta_description",
      "site_title",
      "site_tagline",
      "site_meta_description",
    ];
    try {
      const [rows]: any = await pool.query(
        `SELECT content_key, content_value
         FROM site_content
         WHERE content_key IN (${keys.map(() => "?").join(",")})`,
        keys
      );
      const map: Record<string, string> = {};
      for (const r of Array.isArray(rows) ? rows : []) {
        map[String(r.content_key)] = String(r.content_value || "");
      }
      const slug =
        normalizeSubscriptionSlug(map.subscription_slug || "") ||
        DEFAULT_SUBSCRIPTION_SLUG;
      subscriptionUrl = subscriptionPageUrl(slug);
      subscriptionPrevious = normalizeSubscriptionSlug(
        map.subscription_previous_slug || ""
      );
      if (subscriptionPrevious === slug) subscriptionPrevious = "";

      if (canSettings) {
        site = {
          site_title: map.site_title || "",
          site_tagline: map.site_tagline || "",
          site_meta_description: map.site_meta_description || "",
          site_meta_description_ui: map.site_meta_description
            ? "Present in CMS"
            : "Empty / missing in CMS (Settings UI gap noted in JSEO-A)",
          og_default_image: map.og_default_image || "",
          og_default_present: !!String(map.og_default_image || "").trim(),
          home_meta_title: map.home_meta_title || "",
          home_meta_description: map.home_meta_description || "",
        };
      } else if (canContent) {
        site = {
          home_meta_title: map.home_meta_title || "",
          home_meta_description: map.home_meta_description || "",
          subscription_slug: slug,
          subscription_url: subscriptionUrl,
          subscription_previous_slug: subscriptionPrevious || null,
          subscription_meta_title: map.subscription_meta_title || "",
          subscription_meta_description: map.subscription_meta_description || "",
          subscription_canonical: map.subscription_canonical || "",
          note: "Global Site Settings require settings.manage (Super Admin).",
        };
      }
    } catch {
      // keep defaults
    }
  }

  if (canProducts) {
    try {
      const [rows]: any = await pool.query(
        `SELECT id, name, slug, active, seo_title, meta_description, focus_keyword,
                image, og_image, short_description, description, full_description
         FROM products
         ORDER BY id ASC`
      );
      products = (Array.isArray(rows) ? rows : []).map((p: any) =>
        normalizeProductDiagnosticRow(p)
      );

      const p8Live = (products as any[]).some(
        (p) => p.active && p.slug === PRODUCT8_CANONICAL_SLUG
      );
      product8 = {
        currentSlug: PRODUCT8_CANONICAL_SLUG,
        currentUrl: productPublicUrl(PRODUCT8_CANONICAL_SLUG),
        canonical: productPublicUrl(PRODUCT8_CANONICAL_SLUG),
        inSitemap: p8Live,
        targetExists: p8Live,
        legacy: Object.entries(PRODUCT8_LEGACY_SLUG_REDIRECTS).map(
          ([from, to]) => ({
            fromUrl: productPublicUrl(from),
            fromSlug: from,
            toSlug: to,
            toUrl: productPublicUrl(to),
            redirect: "308 permanentRedirect (when target active)",
            active: p8Live,
          })
        ),
        gscLabel: "GSC verification required",
      };
    } catch {
      products = [];
    }
  }

  if (canBlog) {
    try {
      // Widened SELECT only — still a single blog_posts query (total remains 3).
      const [rows]: any = await pool.query(
        `SELECT id, title, slug, status, active, meta_title, meta_description,
                focus_keyword, canonical_url, featured_image, excerpt, content
         FROM blog_posts
         ORDER BY id DESC`
      );
      blog = (Array.isArray(rows) ? rows : []).map((b: any) =>
        normalizeBlogDiagnosticRow(b)
      );
    } catch {
      blog = [];
    }
  }

  const keyPages = canContent
    ? buildKeyPageFacts(subscriptionUrl)
    : undefined;

  const redirects: Array<Record<string, string>> = [];
  if (canProducts) {
    redirects.push({
      mechanism: "Product 8 legacy slug map",
      source: "lib/productLegacyRedirects.ts (hardcoded)",
      adminVisible: "SEO Overview (read-only)",
      editable: "no",
    });
    redirects.push({
      mechanism: "Product name-derived alias",
      source: "Automatic when request slug matches normalized product name",
      adminVisible: "SEO Overview (read-only)",
      editable: "no",
    });
  }
  if (canContent) {
    redirects.push({
      mechanism: "Subscription previous slug",
      source: "CMS auto on slug change",
      detail: subscriptionPrevious
        ? `/${subscriptionPrevious} → ${subscriptionUrl}`
        : "No previous slug stored",
      adminVisible: "yes (also in Subscription editor)",
      editable: "no (automatic)",
    });
    redirects.push({
      mechanism: "/admin → /",
      source: "app/admin/page.tsx server redirect()",
      adminVisible: "SEO Overview (read-only)",
      editable: "no",
    });
  }

  const sitemap = canContent
    ? {
        included: [
          "home",
          "products listing",
          "active product slugs",
          "blog listing",
          "published posts",
          "FAQ",
          "contact",
          "about",
          "subscription",
          "legal",
          "order-tracking",
        ],
        excluded: [
          "cart",
          "cart/success",
          "admin",
          "sidhu",
          "utilities (A1 / 5G / player)",
          "APIs",
          "ERP",
        ],
        note: "Derived from app/sitemap.ts rules — not a second datastore.",
      }
    : undefined;

  const verificationQueue: VerificationItem[] = [];
  const seen = new Set<string>();
  const pushUnique = (items: VerificationItem[]) => {
    for (const item of items) {
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      verificationQueue.push(item);
    }
  };
  if (canProducts) {
    const list = Array.isArray(products) ? (products as Array<{ slug?: string; active?: boolean }>) : [];
    const p8Active = list.some(
      (p) => p.active && String(p.slug || "") === PRODUCT8_CURRENT_SLUG
    );
    const p9Active = list.some(
      (p) => p.active && String(p.slug || "") === PRODUCT9_CURRENT_SLUG
    );
    pushUnique(buildProductMigrationVerificationItems({ p8Active, p9Active }));
  }
  if (canContent) pushUnique(buildContentVerificationItems(subscriptionUrl));
  // Published blog posts stay in the Blog SEO table — not this curated GSC queue.

  // Diagnostics reuse already-fetched product/blog rows — no additional DB reads.
  const diagnostics = buildSeoDiagnostics({
    products: canProducts && Array.isArray(products) ? (products as any[]) : undefined,
    blog: canBlog && Array.isArray(blog) ? (blog as any[]) : undefined,
  });

  return res.status(200).json({
    permissions,
    siteOrigin: SEO_SITE_ORIGIN,
    site,
    products,
    product8,
    blog,
    keyPages,
    redirects: redirects.length ? redirects : undefined,
    sitemap,
    verificationQueue,
    gscAccountChecks: [...GSC_ACCOUNT_CHECKS],
    diagnostics,
    orderTracking: canContent
      ? {
          url: `${SEO_SITE_ORIGIN}/order-tracking`,
          indexState: "index",
          canonical: "self",
          inSitemap: true,
          note: "GSC verification required — index intent unchanged",
        }
      : undefined,
  });
}
