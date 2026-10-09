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
  "sitemap_outer_failsafe_around_cache",
  /getSitemapDynamicDataSafe/.test(sitemapData) &&
    /resolveSitemapDynamicDataWithFallback/.test(sitemapData) &&
    /emptySitemapDynamicData/.test(sitemapData) &&
    /loadSitemapDynamicData/.test(sitemapData)
);
ok(
  "sitemap_safe_lastmod_helper",
  /parseFactualLastModified/.test(sitemap) &&
    /parseFactualLastModified/.test(sitemapData) &&
    !/new Date\(p\.lastModified\)/.test(sitemap)
);
ok(
  "sitemap_cache_ttl_only_no_tag",
  /SITEMAP_CACHE_TTL_SECONDS\s*=\s*300/.test(sitemapData) &&
    /unstable_cache/.test(sitemapData) &&
    /sitemap-dynamic-data-v2/.test(sitemapData) &&
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
ok(
  "blog_api_invalidates_sitemap",
  /invalidateSitemapCache/.test(blogApi) &&
    /invalidateSitemapCache/.test(blogPersistence) &&
    (blogPersistence.match(/deps\.invalidateSitemapCache\(\)/g) || []).length >= 3
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

// --- Executable regressions for proven 500 mechanisms ---
function parseFactualLastModified(iso) {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
}

function resolveSitemapLike(data) {
  let content = "";
  for (const item of data) {
    content += `<loc>${item.url}</loc>\n`;
    if (item.lastModified) {
      const serializedDate =
        item.lastModified instanceof Date
          ? item.lastModified.toISOString()
          : item.lastModified;
      content += `<lastmod>${serializedDate}</lastmod>\n`;
    }
  }
  return content;
}

function mapUnsafe(lastModified) {
  return {
    url: "https://firestick4uk.com/products/x",
    ...(lastModified ? { lastModified: new Date(lastModified) } : {}),
  };
}

function mapSafe(lastModified) {
  const d = parseFactualLastModified(lastModified);
  return {
    url: "https://firestick4uk.com/products/x",
    ...(d ? { lastModified: d } : {}),
  };
}

let unsafeThrew = false;
try {
  resolveSitemapLike([mapUnsafe("not-a-real-date")]);
} catch (e) {
  unsafeThrew = e instanceof RangeError;
}
ok(
  "runtime_invalid_lastmod_throws_without_guard",
  unsafeThrew,
  "expected RangeError from Invalid Date.toISOString()"
);

let safeOk = false;
try {
  const xml = resolveSitemapLike([mapSafe("not-a-real-date")]);
  safeOk = !xml.includes("lastmod");
} catch {
  safeOk = false;
}
ok("runtime_invalid_lastmod_guarded", safeOk);

async function resolveWithFallback(primary, secondary, fallback) {
  try {
    return await primary();
  } catch {
    try {
      return await secondary();
    } catch {
      return fallback();
    }
  }
}

(async () => {
  const rescued = await resolveWithFallback(
    async () => {
      throw new Error("Invariant: incrementalCache missing in unstable_cache");
    },
    async () => {
      throw new Error("DB unavailable");
    },
    () => ({
      subscriptionUrl: "https://firestick4uk.com/iptv-subscriptions-uk",
      products: [],
      posts: [],
    })
  );
  ok(
    "runtime_cache_invariant_falls_back_to_static_payload",
    rescued.subscriptionUrl === "https://firestick4uk.com/iptv-subscriptions-uk" &&
      Array.isArray(rescued.products) &&
      rescued.products.length === 0 &&
      Array.isArray(rescued.posts) &&
      rescued.posts.length === 0
  );

  const fromSecondary = await resolveWithFallback(
    async () => {
      throw new Error("Invariant: incrementalCache missing in unstable_cache");
    },
    async () => ({
      subscriptionUrl: "https://firestick4uk.com/iptv-subscriptions-uk",
      products: [{ slug: "firestick-4k", lastModified: "2026-06-08T00:00:00.000Z" }],
      posts: [],
    }),
    () => ({
      subscriptionUrl: "https://firestick4uk.com/iptv-subscriptions-uk",
      products: [],
      posts: [],
    })
  );
  ok(
    "runtime_cache_fail_uses_uncached_loader_when_available",
    fromSecondary.products.length === 1 &&
      fromSecondary.products[0].slug === "firestick-4k"
  );

  console.log(
    `\nphase-hostinger-h5-sitemap-favicon: ${passed} passed, ${failed} failed`
  );
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
