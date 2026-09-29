/**
 * SEO-R1 — index hygiene: cart/success/admin/sidhu + cart sitemap removal.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
let passed = 0;
let failed = 0;

function ok(name, cond, detail = "") {
  if (cond) {
    passed++;
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed++;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

const cartLayout = read("app/cart/layout.tsx");
const cartPage = exists("app/cart/page.tsx") ? read("app/cart/page.tsx") : "";
const successLayout = read("app/cart/success/layout.tsx");
const successPage = read("app/cart/success/page.tsx");
const adminPage = read("app/admin/page.tsx");
const sidhuLayout = read("app/sidhu/layout.tsx");
const sidhuPage = read("app/sidhu/page.tsx");
const sitemap = read("app/sitemap.ts");
const sitemapData = read("lib/sitemapDataServer.ts");
const robots = read("public/robots.txt");
const nextConfig = read("next.config.ts");

function hasNoIndexBlock(src) {
  return (
    /robots:\s*\{[\s\S]*?index:\s*false[\s\S]*?follow:\s*false[\s\S]*?googleBot:\s*\{[\s\S]*?index:\s*false[\s\S]*?follow:\s*false/.test(
      src
    )
  );
}

// --- CART ---
ok(
  "cart_robots_noindex_nofollow",
  hasNoIndexBlock(cartLayout),
  "index/follow false + googleBot"
);
ok(
  "cart_canonical_self",
  /alternates:\s*\{[\s\S]*?canonical:\s*["']https:\/\/firestick4uk\.com\/cart["']/.test(
    cartLayout
  )
);
ok(
  "cart_title_preserved",
  /title:\s*["']Cart & Checkout — Firestick4UK["']/.test(cartLayout)
);
ok(
  "cart_og_twitter_preserved",
  /openGraph:\s*\{/.test(cartLayout) && /twitter:\s*\{/.test(cartLayout)
);
ok(
  "cart_page_untouched_no_robots_rewrite",
  !/robots:\s*\{/.test(cartPage) || cartPage.length === 0
);
ok(
  "cart_h3_no_store_headers_intact",
  /source:\s*["']\/cart["']/.test(nextConfig) &&
    /source:\s*["']\/cart\/:path\*["']/.test(nextConfig) &&
    /no-store,\s*no-cache,\s*must-revalidate/.test(nextConfig)
);

// --- SUCCESS ---
ok("success_layout_exists", exists("app/cart/success/layout.tsx"));
ok(
  "success_robots_noindex_nofollow",
  hasNoIndexBlock(successLayout)
);
ok(
  "success_canonical_self",
  /canonical:\s*["']https:\/\/firestick4uk\.com\/cart\/success["']/.test(
    successLayout
  )
);
ok(
  "success_title_order_confirmation",
  /Order Confirmation — Firestick4UK/.test(successLayout)
);
ok(
  "success_metadata_no_order_or_customer_leaks",
  !/order_id|customer_email|sessionStorage|payment_reference/i.test(
    successLayout
  )
);
ok(
  "success_page_logic_untouched",
  /"use client"/.test(successPage) &&
    /sessionStorage/.test(successPage) &&
    !/generateMetadata|export const metadata/.test(successPage)
);

// --- ADMIN ---
ok("admin_not_use_client", !/"use client"/.test(adminPage));
ok("admin_no_useEffect", !/useEffect/.test(adminPage));
ok("admin_no_window_location", !/window\.location/.test(adminPage));
ok(
  "admin_uses_next_server_redirect",
  /from\s+["']next\/navigation["']/.test(adminPage) &&
    /redirect\s*\(\s*["']\/["']\s*\)/.test(adminPage)
);
ok(
  "admin_not_permanentRedirect",
  !/permanentRedirect/.test(adminPage)
);
ok("admin_destination_home_not_sidhu", /redirect\s*\(\s*["']\/["']\s*\)/.test(adminPage) && !/sidhu/.test(adminPage));

// --- SIDHU ---
ok("sidhu_layout_exists", exists("app/sidhu/layout.tsx"));
ok("sidhu_robots_noindex_nofollow", hasNoIndexBlock(sidhuLayout));
ok(
  "sidhu_canonical_self",
  /canonical:\s*["']https:\/\/firestick4uk\.com\/sidhu["']/.test(sidhuLayout)
);
ok(
  "sidhu_layout_passthrough_children_only",
  /return\s*<>\s*\{children\}\s*<\/>/.test(sidhuLayout) &&
    !/login|password|RBAC|session/i.test(sidhuLayout)
);
ok(
  "sidhu_page_auth_untouched",
  sidhuPage.length > 1000 &&
    !/export const metadata|generateMetadata/.test(sidhuPage)
);

// --- SITEMAP ---
ok(
  "sitemap_cart_removed",
  !/\/cart["'`]/.test(sitemap) &&
    !/firestick4uk\.com\/cart/.test(sitemap)
);
ok(
  "sitemap_order_tracking_retained",
  /\/order-tracking/.test(sitemap)
);
ok(
  "sitemap_h5_architecture_retained",
  /getCachedSitemapDynamicData/.test(sitemap) &&
    /export const dynamic = ["']force-dynamic["']/.test(sitemap) &&
    /export const revalidate = 0/.test(sitemap) &&
    /SITEMAP_CACHE_TAG\s*=\s*["']sitemap["']/.test(sitemapData) &&
    /SITEMAP_CACHE_TTL_SECONDS\s*=\s*300/.test(sitemapData)
);
ok(
  "sitemap_products_blog_subscription_retained",
  /data\.products/.test(sitemap) &&
    /data\.posts/.test(sitemap) &&
    /data\.subscriptionUrl/.test(sitemap)
);

// --- ROBOTS ---
ok(
  "robots_sidhu_disallow",
  /Disallow:\s*\/sidhu/.test(robots)
);
ok("robots_no_erp_disallow", !/Disallow:\s*\/erp\b/.test(robots));
ok("robots_api_disallow", /Disallow:\s*\/api\//.test(robots));
ok(
  "robots_no_global_disallow",
  !/Disallow:\s*\/\s*$/m.test(robots) && /Allow:\s*\//.test(robots)
);
ok(
  "robots_no_new_cart_or_admin_disallow",
  !/Disallow:\s*\/cart/.test(robots) && !/Disallow:\s*\/admin/.test(robots)
);
ok(
  "robots_file_exclusions_current",
  robots.includes("Disallow: /sidhu") &&
    !robots.includes("Disallow: /erp") &&
    robots.includes("Disallow: /api/")
);

// --- ERP retired ---
ok("erp_ui_absent_after_r2b", !fs.existsSync(path.join(ROOT, "app/erp")));

console.log(`\nSEO-R1 index hygiene: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
