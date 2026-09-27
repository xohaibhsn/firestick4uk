/**
 * JSEO-B1 — read-only SEO Overview tab + aggregate API.
 */
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

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

function loadTsModule(rel) {
  const src = read(rel);
  const { outputText } = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
    },
  });
  const sandbox = { exports: {} };
  const fn = new Function("exports", "module", "require", outputText);
  fn(sandbox.exports, sandbox, require);
  return sandbox.exports;
}

const perms = read("lib/adminPermissions.ts");
const api = read("pages/api/admin-seo-overview.ts");
const panel = read("components/admin/SeoOverviewPanel.tsx");
const sidhu = read("app/sidhu/page.tsx");
const seoHelper = read("lib/seoOverview.ts");
const productLegacy = read("lib/productLegacyRedirects.ts");

const so = loadTsModule("lib/seoOverview.ts");
const {
  canAccessSeoOverview,
  canAccessSidhuTab,
  hasAdminPermission,
  ROLE_PERMISSIONS,
} = loadTsModule("lib/adminPermissions.ts");

// --- TAB / PERMISSIONS ---
ok("sidhu_tab_includes_seo", /"seo"/.test(perms) && /\| "seo"/.test(perms));
ok(
  "no_seo_manage_permission",
  !/"seo\.manage"/.test(perms) && !/"seo\.view"/.test(perms)
);
ok(
  "canAccessSeoOverview_helper",
  /export function canAccessSeoOverview/.test(perms) &&
    /products\.view/.test(perms) &&
    /blog\.manage/.test(perms) &&
    /content\.manage/.test(perms) &&
    /settings\.manage/.test(perms)
);
ok(
  "canAccessSidhuTab_seo_special_case",
  /if \(tab === "seo"\) return canAccessSeoOverview\(role\)/.test(perms)
);

ok("super_admin_seo_access", canAccessSeoOverview("super_admin") === true);
ok("manager_seo_access", canAccessSeoOverview("manager") === true);
ok(
  "writer_seo_access_via_blog",
  canAccessSeoOverview("writer") === true &&
    hasAdminPermission("writer", "blog.manage")
);
ok("seo_tab_access_super", canAccessSidhuTab("super_admin", "seo") === true);
ok("seo_tab_access_writer", canAccessSidhuTab("writer", "seo") === true);
ok(
  "other_tabs_unchanged_writer_no_products",
  canAccessSidhuTab("writer", "products") === false &&
    canAccessSidhuTab("writer", "blog") === true
);
ok(
  "manager_still_no_settings",
  !ROLE_PERMISSIONS.manager.includes("settings.manage") &&
    canAccessSidhuTab("manager", "settings") === false
);

// --- API ---
ok("api_exists", exists("pages/api/admin-seo-overview.ts"));
ok("api_get_only", /req\.method !== ["']GET["']/.test(api) && /405/.test(api));
ok("api_requireAdmin", /requireAdmin\(req, res, \{ mutate: false \}\)/.test(api));
ok(
  "api_role_filtering",
  /hasAdminPermission\(role, "products\.view"\)/.test(api) &&
    /hasAdminPermission\(role, "blog\.manage"\)/.test(api) &&
    /hasAdminPermission\(role, "content\.manage"\)/.test(api) &&
    /hasAdminPermission\(role, "settings\.manage"\)/.test(api)
);
ok("api_403_without_capability", /status\(403\)/.test(api));
ok(
  "api_bounded_queries",
  (api.match(/pool\.query/g) || []).length <= 4 &&
    !/for\s*\([^)]*of[^)]*\)\s*\{[\s\S]*?pool\.query/.test(api)
);
ok(
  "api_select_includes_full_description",
  /short_description,\s*description,\s*full_description/.test(api) ||
    /description,\s*full_description/.test(api)
);
ok(
  "api_passes_full_description_to_derive",
  /full_description:\s*p\.full_description/.test(api)
);
ok(
  "api_does_not_expose_raw_full_description",
  /description,\s*full_description/.test(api) &&
    /full_description:\s*p\.full_description/.test(api) &&
    !/\breturn\s*\{[\s\S]*?\bfull_description\s*:/.test(
      api.slice(api.indexOf("products = "))
    )
);
ok(
  "api_no_http_crawler",
  !/fetch\s*\(/.test(api) &&
    !/https\.get/.test(api) &&
    !/axios/.test(api) &&
    !/invoke-webrequest/i.test(api)
);
ok("api_no_polling", !/setInterval/.test(api) && !/setTimeout/.test(api));
ok(
  "api_no_mutations",
  !/\bINSERT\b|\bUPDATE\b|\bDELETE\b/.test(api) &&
    !/method !== ["']GET["'][\s\S]{0,40}POST/.test(api)
);
ok(
  "api_no_customer_order_data",
  !/FROM orders/i.test(api) &&
    !/customer_email/i.test(api) &&
    !/FROM customers/i.test(api)
);

// --- PUBLIC PARITY GUARD (app/products/[slug]/page.tsx) ---
const productPage = read("app/products/[slug]/page.tsx");
ok(
  "public_product_title_brand_suffix",
  /function productPageTitle/.test(productPage) &&
    /\\\|\\s\*Firestick4UK\\s\*\$/.test(productPage) &&
    /Firestick4UK\\s\*\$/.test(productPage) &&
    /return `\$\{base\} \| Firestick4UK`/.test(productPage)
);
ok(
  "public_product_description_fallback_chain",
  /function productMetaDescription/.test(productPage) &&
    /product\.meta_description\s*\|\|/.test(productPage) &&
    /product\.short_description\s*\|\|/.test(productPage) &&
    /product\.description\s*\|\|/.test(productPage) &&
    /product\.full_description\s*\|\|/.test(productPage)
);
ok(
  "overview_mirrors_public_title_comment",
  /Mirrors app\/products\/\[slug\]\/page\.tsx productPageTitle/.test(seoHelper)
);
ok(
  "overview_mirrors_public_description_comment",
  /Mirrors app\/products\/\[slug\]\/page\.tsx productMetaDescription/.test(
    seoHelper
  )
);

// --- PRODUCT ---
const p = so.deriveProductHealth({
  name: "3 Years Subscription",
  slug: "3-years-subscription",
  active: true,
  seo_title: "3 Years Subscription UK",
  meta_description:
    "A solid meta description for the product page that is long enough.",
  image: "https://example.com/x.webp",
  og_image: "",
});
ok(
  "product_generated_canonical",
  p.canonical === "https://firestick4uk.com/products/3-years-subscription"
);
ok("product_active_in_sitemap", p.inSitemap === true);
ok("product_og_fallback_label", p.ogSource === "Product image fallback");
ok(
  "no_product_canonical_db_field_in_api",
  !/canonical_url/.test(api) || /blog/.test(api)
);
ok(
  "product8_from_legacy_source",
  /PRODUCT8_LEGACY_SLUG_REDIRECTS/.test(api) &&
    /world-cup-offer-3-years/.test(productLegacy)
);

const inactive = so.deriveProductHealth({
  name: "X",
  slug: "x",
  active: false,
  meta_description: "desc",
  image: "i",
});
ok("inactive_not_in_sitemap", inactive.inSitemap === false);

// --- TITLE PARITY (mirrors productPageTitle) ---
ok(
  "title_case_a_plain_appends_brand",
  so.productEffectiveTitle("3 Years Subscription UK", "ignored") ===
    "3 Years Subscription UK | Firestick4UK"
);
ok(
  "title_case_b_pipe_brand_unchanged",
  so.productEffectiveTitle(
    "3 Years Subscription UK | Firestick4UK",
    "ignored"
  ) === "3 Years Subscription UK | Firestick4UK"
);
ok(
  "title_case_c_brand_without_pipe_unchanged",
  so.productEffectiveTitle("My Product Firestick4UK", "ignored") ===
    "My Product Firestick4UK"
);
ok(
  "title_case_d_whitespace_normalized",
  so.productEffectiveTitle("   My   Product   ", "ignored") ===
    "My Product | Firestick4UK"
);
ok(
  "title_case_e_blank_title_and_name",
  so.productEffectiveTitle("", "") === "Firestick4UK" &&
    so.productEffectiveTitle(null, null) === "Firestick4UK"
);

// --- DESCRIPTION PARITY (mirrors productMetaDescription) ---
ok(
  "desc_case_a_meta_preferred",
  so.productEffectiveDescription({
    meta_description: "Meta wins",
    short_description: "Short",
    description: "Desc",
    full_description: "Full",
  }) === "Meta wins"
);
ok(
  "desc_case_b_short_when_meta_empty",
  so.productEffectiveDescription({
    meta_description: "",
    short_description: "Short only",
    description: "Desc",
    full_description: "Full",
  }) === "Short only"
);
ok(
  "desc_case_c_description_when_meta_short_empty",
  so.productEffectiveDescription({
    meta_description: "",
    short_description: "",
    description: "Body description",
    full_description: "Full",
  }) === "Body description"
);
ok(
  "desc_case_d_full_description_html_fallback",
  so.productEffectiveDescription({
    meta_description: "",
    short_description: "",
    description: "",
    full_description: "<p>Detailed product description only</p>",
  }) === "Detailed product description only"
);
const longHtml =
  "<div>" + "x".repeat(400) + "<b>tail</b></div>";
const descE = so.productEffectiveDescription({
  meta_description: "",
  short_description: "",
  description: "",
  full_description: longHtml,
});
ok(
  "desc_case_e_html_stripped_and_capped_320",
  !/</.test(descE) &&
    descE.length <= 320 &&
    descE.length === 320 &&
    descE.startsWith("x")
);
ok(
  "derive_uses_full_description_when_others_empty",
  so.deriveProductHealth({
    name: "N",
    slug: "n",
    active: true,
    full_description: "<p>Only full desc</p>",
  }).description === "Only full desc"
);

// --- BLOG CANONICAL ---
ok(
  "blog_canonical_blank_auto",
  so.analyzeBlogCanonical("", "hello").label === "Auto"
);
ok(
  "blog_canonical_ok_exact",
  so.analyzeBlogCanonical("https://firestick4uk.com/blog/hello", "hello")
    .label === "OK"
);
ok(
  "blog_canonical_http_review",
  so.analyzeBlogCanonical("http://firestick4uk.com/blog/hello", "hello")
    .label === "Review"
);
ok(
  "blog_canonical_host_review",
  so.analyzeBlogCanonical("https://evil.com/blog/hello", "hello").label ===
    "Review"
);
ok(
  "blog_canonical_slug_mismatch_review",
  so.analyzeBlogCanonical(
    "https://firestick4uk.com/blog/old-slug",
    "new-slug"
  ).label === "Review"
);
ok("api_no_canonical_mutation", !/UPDATE blog_posts/.test(api));

const draft = so.deriveBlogHealth({
  title: "T",
  slug: "t",
  status: "draft",
  active: true,
  meta_description: "d",
  featured_image: "f",
});
ok(
  "blog_draft_not_sitemap",
  draft.inSitemap === false && draft.flags.includes("Draft")
);

// --- KEY ROUTES ---
const pages = so.buildKeyPageFacts(
  "https://firestick4uk.com/iptv-subscriptions-uk"
);
const byPath = Object.fromEntries(pages.map((x) => [x.path, x]));
ok(
  "cart_noindex",
  byPath["/cart"].indexState === "noindex" && !byPath["/cart"].inSitemap
);
ok("success_noindex", byPath["/cart/success"].indexState === "noindex");
ok("sidhu_robots_disallow", byPath["/sidhu"].indexState === "robots-disallow");
ok("utilities_noindex", byPath["/player"].indexState === "noindex");
ok("admin_redirect", byPath["/admin"].indexState === "redirect");
ok(
  "order_tracking_index_sitemap",
  byPath["/order-tracking"].indexState === "index" &&
    byPath["/order-tracking"].inSitemap === true
);
ok("erp_frozen_note", /frozen/i.test(byPath["/erp"].note || ""));

// --- GSC ---
const v = so.buildProduct8VerificationItems();
ok(
  "gsc_verify_label",
  v.every((i) => /Verify in GSC/i.test(i.note)) &&
    !/Indexed|Impressions|Clicks/i.test(JSON.stringify(v))
);
ok("api_gsc_no_fake_metrics", !/impressions|clicks|google-selected/i.test(api));

// --- UI ---
ok("panel_exists", exists("components/admin/SeoOverviewPanel.tsx"));
ok("sidhu_imports_panel", /SeoOverviewPanel/.test(sidhu));
ok("sidhu_tab_type_seo", /"seo"/.test(sidhu));
ok(
  "panel_fetch_on_open_only",
  /\/api\/admin-seo-overview/.test(panel) &&
    /Panel mounts only when SEO tab opens/.test(panel) &&
    !/setInterval/.test(panel)
);
ok("panel_manual_refresh", /Refresh/.test(panel));
ok(
  "panel_no_duplicate_forms",
  !/seo_title/.test(panel) &&
    !/<input[^>]*meta_description/.test(panel) &&
    !/method:\s*["']PUT["']/.test(panel)
);
ok(
  "panel_nav_existing_tabs",
  /onNavigate\("products"\)/.test(panel) &&
    /onNavigate\("blog"\)/.test(panel) &&
    /onNavigate\("pages"\)/.test(panel) &&
    /onNavigate\("settings"\)/.test(panel)
);
ok(
  "helper_no_db_http",
  !/pool\.|from ["']@\/lib\/db["']/.test(seoHelper) &&
    !/fetch\s*\(/.test(seoHelper)
);

console.log(`\nJSEO-B1 overview: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
