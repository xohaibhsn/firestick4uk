/**
 * Hostinger H2 — request-scope React cache() server DB dedupe.
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

const layout = read("app/layout.tsx");
const home = read("app/page.tsx");
const blogSlug = read("app/blog/[slug]/page.tsx");
const contact = read("lib/contact-config.ts");
const subSlug = read("lib/subscriptionSlugServer.ts");
const subLanding = read("lib/subscriptionLandingPage.tsx");
const productSlug = read("app/products/[slug]/page.tsx");
const og = read("lib/socialMetadataServer.ts");
const provider = read("components/SiteContentProvider.tsx");
const nextConfig = read("next.config.ts");
const db = read("lib/db.ts");
const sitemap = read("app/sitemap.xml/route.ts");
const favicon = read("pages/api/favicon.ts");
const siteContentApi = read("pages/api/site-content.ts");
const publicSite = read("lib/publicSiteContentServer.ts");
const useSite = read("hooks/useSiteContent.ts");
const useContactHook = read("hooks/useContactConfig.ts");

ok("layout_imports_react_cache", /import\s*\{\s*cache\s*\}\s*from\s*["']react["']/.test(layout));
ok(
  "getSiteSettings_cache_wrapped",
  /const getSiteSettings = cache\(async/.test(layout) ||
    /getSiteSettings = cache\(async/.test(layout)
);
ok(
  "getSiteSettings_sql_intact",
  /page_name = 'settings'/.test(layout) && /favicon_url/.test(layout)
);
ok(
  "layout_still_calls_settings_twice_in_source",
  (layout.match(/await getSiteSettings\(\)/g) || []).length === 2
);

ok(
  "contact_config_cache_wrapped",
  /export const getContactConfig = cache\(async/.test(contact)
);
ok(
  "contact_normalize_fallback_intact",
  /normalizeContactFromMap/.test(contact) &&
    /CONTACT_CONFIG_FALLBACK/.test(contact)
);
ok(
  "contact_sql_intact",
  /contact_whatsapp/.test(contact) && /contact_email/.test(contact)
);

ok("home_imports_react_cache", /import\s*\{\s*cache\s*\}\s*from\s*["']react["']/.test(home));
ok(
  "getHomeContent_cache_wrapped",
  /const getHomeContent = cache\(async/.test(home)
);
ok("home_connection_remains", /await connection\(\)/.test(home));
ok(
  "home_force_dynamic_unchanged",
  /export const dynamic = ["']force-dynamic["']/.test(home) &&
    /export const revalidate = 0/.test(home)
);
ok(
  "home_sql_purpose_unchanged",
  /page_name = 'home'/.test(home) && /home_meta_title/.test(home)
);

ok("blog_imports_react_cache", /import\s*\{\s*cache\s*\}\s*from\s*["']react["']/.test(blogSlug));
ok(
  "getPost_cache_wrapped",
  /const getPost = cache\(async/.test(blogSlug)
);
ok(
  "blog_published_active_filter",
  /status = "published"/.test(blogSlug) && /active = 1/.test(blogSlug)
);
ok(
  "blog_metadata_and_page_use_getPost",
  (blogSlug.match(/await getPost\(/g) || []).length >= 2
);

ok(
  "subscription_slug_cache_wrapped",
  /export const getSubscriptionSlugConfig = cache\(/.test(subSlug)
);
ok(
  "subscription_slug_keys_intact",
  /subscription_slug/.test(subSlug) &&
    /subscription_previous_slug/.test(subSlug) &&
    /subscription_canonical/.test(subSlug)
);

ok(
  "subscription_content_cache_wrapped",
  /const getSubscriptionContent = cache\(async/.test(subLanding)
);
ok("subscription_content_connection", /await connection\(\)/.test(subLanding));
ok(
  "subscription_content_sql",
  /page_name = 'subscription'/.test(subLanding) &&
    /subscription_%/.test(subLanding)
);
ok(
  "subscription_metadata_and_render_share_helpers",
  (subLanding.match(/getSubscriptionContent\(\)/g) || []).length >= 2 &&
    (subLanding.match(/getSubscriptionSlugConfig\(\)/g) || []).length >= 2
);

ok(
  "product_resolveProduct_still_cached",
  /const resolveProduct = cache\(async/.test(productSlug)
);
ok(
  "og_helper_still_cached",
  /export const getDefaultOgImageFromSettings = cache\(async/.test(og)
);

ok(
  "publicSiteContent_not_blindly_cached",
  !/cache\(/.test(publicSite) && /getPublicSiteContent/.test(publicSite)
);

ok(
  "h1_provider_owns_page_all",
  /fetch\(["']\/api\/site-content\?page=all["']\)/.test(provider)
);
ok(
  "h1_hooks_no_page_all",
  !/site-content\?page=all/.test(useSite) &&
    !/site-content\?page=all/.test(useContactHook)
);

// Exactly one public page=all bootstrap
const publicFetch = [];
function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === "erp") continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full);
    else if (/\.(tsx?|jsx?)$/.test(name)) {
      const rel = path.relative(ROOT, full).replace(/\\/g, "/");
      if (rel.startsWith("app/sidhu/") || rel.startsWith("app/erp/")) continue;
      const src = fs.readFileSync(full, "utf8");
      if (/\/api\/site-content\?page=all/.test(src)) publicFetch.push(rel);
    }
  }
}
walk(path.join(ROOT, "app"));
walk(path.join(ROOT, "components"));
walk(path.join(ROOT, "hooks"));
ok(
  "public_one_page_all_implementation",
  publicFetch.length === 1 &&
    publicFetch[0] === "components/SiteContentProvider.tsx",
  publicFetch.join(", ")
);

ok(
  "next_config_no_store_unchanged",
  /Cache-Control.*no-store, no-cache, must-revalidate/.test(nextConfig)
);
ok(
  "db_pool_untouched",
  /connectionLimit:\s*3/.test(db) &&
    /NODE_ENV !== 'production'/.test(db)
);
ok(
  "sitemap_no_cache_wrapper_change",
  /force-dynamic/.test(sitemap) && /revalidate = 0/.test(sitemap)
);
ok(
  "favicon_cms_authority_and_max_age",
  (/favicon_url/.test(favicon) || /favicon_url/.test(read("lib/faviconUrlServer.ts"))) &&
    /public, max-age=3600/.test(favicon)
);
ok(
  "site_content_api_no_http_cache_header",
  /getCachedPublicSiteContentAll/.test(siteContentApi) &&
    !/s-maxage/.test(siteContentApi)
);
ok(
  "no_use_cache_directive",
  !/"use cache"/.test(layout) &&
    !/"use cache"/.test(home) &&
    !/"use cache"/.test(blogSlug) &&
    !/"use cache"/.test(contact)
);
ok("erp_ui_absent_after_r2b", !exists("app/erp"));

console.log(`\nphase-hostinger-h2-server-dedupe: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
