/**
 * Hostinger H5 — sitemap + favicon resource optimization.
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

const sitemap = read("app/sitemap.ts");
const sitemapData = read("lib/sitemapDataServer.ts");
const faviconApi = read("pages/api/favicon.ts");
const faviconLib = read("lib/faviconUrlServer.ts");
const invalidation = read("lib/hostingerResourceInvalidation.ts");
const layout = read("app/layout.tsx");
const nextConfig = read("next.config.ts");
const adminProducts = read("pages/api/admin-products.ts");
const blogApi = read("pages/api/blog.ts");
const blogPersistence = read("lib/blogPersistenceServer.ts");
const siteContent = read("pages/api/site-content.ts");
const uploadFavicon = read("pages/api/upload-favicon.ts");
const provider = read("components/SiteContentProvider.tsx");
const blogSlug = read("app/blog/[slug]/page.tsx");
const db = read("lib/db.ts");
const home = read("app/page.tsx");
const socialMeta = read("lib/socialMetadataServer.ts");

// --- Sitemap ---
ok("sitemap_keeps_force_dynamic", /export const dynamic = ["']force-dynamic["']/.test(sitemap));
ok("sitemap_keeps_revalidate_0", /export const revalidate = 0/.test(sitemap));
ok(
  "sitemap_uses_cached_data_helper",
  /getSitemapDynamicDataSafe/.test(sitemap) &&
    /getCachedSitemapDynamicData/.test(sitemapData) &&
    /unstable_cache/.test(sitemapData)
);
ok(
  "sitemap_fail_closed_safe_wrapper",
  /getSitemapDynamicDataSafe/.test(sitemapData) &&
    /resolveSitemapDynamicDataWithFallback/.test(sitemapData) &&
    /parseFactualLastModified/.test(sitemapData) &&
    /parseFactualLastModified/.test(sitemap)
);
ok(
  "sitemap_cache_ttl_only_no_tag",
  /SITEMAP_CACHE_TTL_SECONDS\s*=\s*300/.test(sitemapData) &&
    /unstable_cache/.test(sitemapData) &&
    !/SITEMAP_CACHE_TAG/.test(sitemapData) &&
    !/tags:\s*\[/.test(sitemapData)
);
ok(
  "sitemap_ttl_conservative",
  /SITEMAP_CACHE_TTL_SECONDS\s*=\s*300/.test(sitemapData)
);
ok(
  "sitemap_no_request_time_now_lastmod",
  !/lastModified:\s*now/.test(sitemap) &&
    !/const now = new Date\(\)/.test(sitemap)
);
ok(
  "sitemap_static_pages_omit_lastModified",
  /url: baseUrl,\s*changeFrequency/.test(sitemap) &&
    !/url: baseUrl,[\s\S]{0,80}lastModified/.test(sitemap)
);
ok(
  "sitemap_products_authoritative_slugs",
  /active = 1/.test(sitemapData) &&
    /TRIM\(slug\)/.test(sitemapData)
);
ok(
  "sitemap_blogs_published_active",
  /status = ['"]published['"]/.test(sitemapData) &&
    /active = 1/.test(sitemapData)
);
ok(
  "sitemap_uses_created_at_not_fabricated_updated",
  /created_at/.test(sitemapData) &&
    !/updated_at/.test(sitemapData)
);
ok(
  "sitemap_factual_timestamp_helper",
  /factualTimestamp/.test(sitemapData) &&
    /toISOString/.test(sitemapData)
);
ok(
  "sitemap_db_failure_keeps_static",
  /empty products on failure|Keep static|catch \{/.test(sitemapData)
);
ok(
  "sitemap_subscription_from_config",
  /getSubscriptionSlugConfig/.test(sitemapData)
);

// Mutations invalidate sitemap
ok(
  "admin_products_invalidates_sitemap",
  /invalidateSitemapCache/.test(adminProducts) &&
    (adminProducts.match(/invalidateSitemapCache\(\)/g) || []).length >= 3
);
// Blog sitemap invalidation ownership (AB-2 persistence adapter):
// POST/PUT delegate to lib/blogPersistenceServer.ts; DELETE remains in the route.
const blogCreateFn =
  (blogPersistence.match(
    /export async function createBlogPost[\s\S]*?(?=export async function updateBlogPost)/
  ) || [""])[0];
const blogUpdateFn =
  (blogPersistence.match(
    /export async function updateBlogPost[\s\S]*?(?=export async function createAutonomousBlogDraft)/
  ) || [""])[0];
const blogDeleteBlock =
  (blogApi.match(/if \(req\.method === ['"]DELETE['"]\) \{[\s\S]*?(?=return res\.status\(405\))/) || [
    "",
  ])[0];

ok(
  "blog_post_delegates_createBlogPost",
  /req\.method === ['"]POST['"]/.test(blogApi) &&
    /await createBlogPost\(/.test(blogApi) &&
    !/INSERT INTO blog_posts/.test(blogApi)
);
ok(
  "blog_put_delegates_updateBlogPost",
  /req\.method === ['"]PUT['"]/.test(blogApi) &&
    /await updateBlogPost\(/.test(blogApi) &&
    !/UPDATE blog_posts SET/.test(blogApi)
);
ok(
  "blog_persistence_create_invalidates_sitemap",
  /deps\.invalidateSitemapCache\(\)/.test(blogCreateFn) &&
    /INSERT INTO blog_posts[\s\S]*deps\.invalidateSitemapCache\(\)/.test(blogCreateFn)
);
ok(
  "blog_persistence_update_noop_skips_sitemap_invalidate",
  /built\.changedFields\.length === 0/.test(blogUpdateFn) &&
    /changed_fields:\s*\[\]/.test(blogUpdateFn) &&
    !/built\.changedFields\.length === 0[\s\S]{0,400}invalidateSitemapCache/.test(
      blogUpdateFn
    )
);
ok(
  "blog_persistence_update_real_write_invalidates_sitemap",
  /wrote = true/.test(blogUpdateFn) &&
    /wrote = true[\s\S]*deps\.invalidateSitemapCache\(\)/.test(blogUpdateFn)
);
ok(
  "blog_delete_route_invalidates_sitemap",
  /invalidateSitemapCache\(\)/.test(blogDeleteBlock) &&
    (blogApi.match(/invalidateSitemapCache\(\)/g) || []).length === 1
);
ok(
  "blog_mutation_paths_no_revalidateTag_revalidatePath",
  !/revalidateTag\s*\(/.test(blogApi) &&
    !/revalidatePath\s*\(/.test(blogApi) &&
    !/revalidateTag\s*\(/.test(blogPersistence) &&
    !/revalidatePath\s*\(/.test(blogPersistence)
);
ok(
  "site_content_sitemap_only_slug_keys",
  /siteContentKeysAffectSitemap/.test(siteContent) &&
    /subscription_slug/.test(invalidation) &&
    /subscription_previous_slug/.test(invalidation) &&
    /subscription_canonical/.test(invalidation)
);
ok(
  "invalidation_ttl_only_shims_no_revalidateTag",
  /export function invalidateSitemapCache\(\):\s*void/.test(invalidation) &&
    /export function invalidateFaviconCache\(\):\s*void/.test(invalidation) &&
    !/revalidateTag\s*\(/.test(invalidation) &&
    !/revalidatePath\s*\(/.test(invalidation) &&
    /TTL-only compatibility shim/.test(invalidation)
);
ok(
  "invalidation_shims_do_not_log_errors",
  !/sitemap cache invalidate failed/.test(invalidation) &&
    !/favicon cache invalidate failed/.test(invalidation) &&
    !/console\.(error|warn|log)/.test(invalidation)
);

// --- Favicon ---
ok(
  "favicon_api_uses_cached_lookup",
  /getCachedFaviconRedirectUrl/.test(faviconApi) &&
    /unstable_cache/.test(faviconLib)
);
ok(
  "favicon_cms_key_authoritative",
  /content_key=['"]favicon_url['"]/.test(faviconLib) ||
    /content_key=.favicon_url./.test(faviconLib)
);
ok(
  "favicon_fallback_safe",
  /FAVICON_FALLBACK_URL\s*=\s*["']https:\/\/firestick4uk\.com\/og-default\.png["']/.test(
    faviconLib
  ) &&
    !/og-default\.jpg/.test(faviconLib) &&
    exists("public/og-default.png") &&
    !exists("public/og-default.jpg")
);
ok(
  "favicon_api_sets_public_max_age",
  /public, max-age=3600/.test(faviconApi)
);
ok(
  "favicon_config_overrides_api_no_store",
  /source:\s*["']\/api\/favicon["']/.test(nextConfig) &&
    /public, max-age=3600/.test(
      nextConfig.slice(nextConfig.indexOf('source: "/api/favicon"'))
    )
);
ok(
  "layout_no_date_now_favicon_bust",
  !/Date\.now\s*\(/.test(layout) &&
    !/withCacheBust/.test(layout) &&
    /faviconSizeUrl/.test(layout)
);
ok(
  "layout_og_comment_stable",
  /Social images must be stable/.test(layout) &&
    /resolveDefaultOgImage/.test(layout)
);
ok(
  "favicon_invalidation_on_key",
  /siteContentKeysAffectFavicon/.test(siteContent) &&
    /invalidateFaviconCache/.test(siteContent)
);
ok(
  "upload_favicon_invalidates",
  /invalidateFaviconCache/.test(uploadFavicon)
);

// --- Protections ---
ok(
  "h1_provider_remains",
  /fetch\(["']\/api\/site-content\?page=all["']\)/.test(provider)
);
ok(
  "h2_getPost_cache_remains",
  /const getPost = cache\(async/.test(blogSlug)
);
ok(
  "h3_api_no_store_remains",
  /source:\s*["']\/api\/:path\*["']/.test(nextConfig) &&
    /no-store, no-cache, must-revalidate/.test(nextConfig)
);
ok(
  "no_h4_isr_on_home",
  /force-dynamic/.test(home) && /revalidate = 0/.test(home)
);
ok(
  "og_helper_connection_untouched",
  /await connection\(\)/.test(socialMeta) &&
    /og_default_image/.test(socialMeta)
);
ok(
  "db_pool_untouched",
  /connectionLimit:\s*3/.test(db)
);
ok("erp_ui_absent_after_r2b", !exists("app/erp"));
ok("h5_test_exists", exists("scripts/phase-hostinger-h5-sitemap-favicon-tests.js"));

console.log(
  `\nphase-hostinger-h5-sitemap-favicon: ${passed} passed, ${failed} failed`
);
process.exit(failed ? 1 : 0);
