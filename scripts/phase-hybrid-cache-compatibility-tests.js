/**
 * Hybrid cache compatibility — Pages Router must not call revalidateTag/Path.
 * TTL-only freshness for sitemap (300s), public CMS (60s), favicon (300s).
 * Static source invariants. Does not mutate the database.
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

function walkFiles(dir, filter, acc = []) {
  if (!exists(dir)) return acc;
  for (const name of fs.readdirSync(path.join(ROOT, dir))) {
    const rel = path.join(dir, name).replace(/\\/g, "/");
    const abs = path.join(ROOT, rel);
    const st = fs.statSync(abs);
    if (st.isDirectory()) walkFiles(rel, filter, acc);
    else if (filter(rel)) acc.push(rel);
  }
  return acc;
}

const invalidation = read("lib/hostingerResourceInvalidation.ts");
const publicCms = read("lib/publicCmsDataServer.ts");
const faviconLib = read("lib/faviconUrlServer.ts");
const sitemapData = read("lib/sitemapDataServer.ts");
const redirectRuntime = read("lib/urlRedirectRuntime.ts");
const db = read("lib/db.ts");

const pagesApiFiles = walkFiles("pages/api", (rel) =>
  /\.(ts|js)$/.test(rel)
);

// A–B
ok("A_hostinger_no_revalidateTag", !/revalidateTag\s*\(/.test(invalidation));
ok("B_hostinger_no_revalidatePath", !/revalidatePath\s*\(/.test(invalidation));

// C–D
ok("C_publicCms_no_revalidateTag", !/revalidateTag\s*\(/.test(publicCms));
ok("D_publicCms_no_revalidatePath", !/revalidatePath\s*\(/.test(publicCms));

// E–F
let pagesImportRevalidateTag = false;
let pagesImportRevalidatePath = false;
for (const rel of pagesApiFiles) {
  const src = read(rel);
  if (
    /from\s+["']next\/cache["']/.test(src) &&
    /revalidateTag/.test(src)
  ) {
    pagesImportRevalidateTag = true;
  }
  if (
    /from\s+["']next\/cache["']/.test(src) &&
    /revalidatePath/.test(src)
  ) {
    pagesImportRevalidatePath = true;
  }
  if (/\brevalidateTag\b/.test(src) && /import\s*\{[^}]*revalidateTag/.test(src)) {
    pagesImportRevalidateTag = true;
  }
  if (/\brevalidatePath\b/.test(src) && /import\s*\{[^}]*revalidatePath/.test(src)) {
    pagesImportRevalidatePath = true;
  }
}
ok("E_pages_api_no_revalidateTag_import", !pagesImportRevalidateTag);
ok("F_pages_api_no_revalidatePath_import", !pagesImportRevalidatePath);

// G–I
ok(
  "G_sitemap_ttl_300",
  /SITEMAP_CACHE_TTL_SECONDS\s*=\s*300/.test(sitemapData)
);
ok(
  "H_public_cms_ttl_60",
  /PUBLIC_CMS_CACHE_TTL_SECONDS\s*=\s*60/.test(publicCms)
);
ok(
  "I_favicon_ttl_300",
  /FAVICON_CACHE_TTL_SECONDS\s*=\s*300/.test(faviconLib)
);

// J–L
ok(
  "J_sitemap_reader_cached",
  /unstable_cache/.test(sitemapData) &&
    /getCachedSitemapDynamicData/.test(sitemapData) &&
    /revalidate:\s*SITEMAP_CACHE_TTL_SECONDS/.test(sitemapData)
);
ok(
  "K_public_cms_readers_cached",
  /unstable_cache/.test(publicCms) &&
    /getCachedPublicSiteContentAll/.test(publicCms) &&
    /getCachedPublicVisibleSections/.test(publicCms)
);
ok(
  "L_favicon_reader_cached",
  /unstable_cache/.test(faviconLib) &&
    /getCachedFaviconRedirectUrl/.test(faviconLib)
);

// M–P
ok(
  "M_invalidateSitemapCache_shim",
  /export function invalidateSitemapCache\(\):\s*void\s*\{/.test(invalidation) &&
    !/revalidateTag\s*\(/.test(invalidation) &&
    /TTL-only compatibility shim/.test(invalidation) &&
    /300 seconds/.test(invalidation)
);
ok(
  "N_invalidatePublicCmsCache_shim",
  /export function invalidatePublicCmsCache\(\):\s*void\s*\{/.test(publicCms) &&
    !/revalidateTag\s*\(/.test(publicCms) &&
    /TTL-only/.test(publicCms) &&
    /60 seconds/.test(publicCms)
);
ok(
  "O_invalidateFaviconCache_shim",
  /export function invalidateFaviconCache\(\):\s*void\s*\{/.test(invalidation) &&
    /≤300 seconds|<=300 seconds|300 seconds/.test(invalidation)
);
ok(
  "P_shims_do_not_log_fake_errors",
  !/sitemap cache invalidate failed/.test(invalidation) &&
    !/favicon cache invalidate failed/.test(invalidation) &&
    !/public cache invalidate failed/.test(publicCms) &&
    !/console\.(error|warn|log)/.test(invalidation) &&
    !/console\.(error|warn|log)/.test(
      publicCms.slice(publicCms.indexOf("invalidatePublicCmsCache"))
    )
);

// Q–R
const apiRoutes = walkFiles("pages/api", (rel) => /\.(ts|js)$/.test(rel)).concat(
  walkFiles("app", (rel) => /\/route\.(ts|js)$/.test(rel) || /\/actions\.(ts|js)$/.test(rel))
);
let hasInternalHttpInvalidation = false;
let hasServerActionInvalidation = false;
for (const rel of apiRoutes) {
  const src = read(rel);
  if (
    /invalidate.*(sitemap|favicon|cms|cache)/i.test(rel) ||
    (/revalidateTag|revalidatePath/.test(src) &&
      /fetch\s*\(\s*["'`]https?:\/\/(localhost|127\.0\.0\.1|firestick4uk)/.test(src))
  ) {
    hasInternalHttpInvalidation = true;
  }
  if (/["']use server["']/.test(src) && /revalidateTag|revalidatePath/.test(src)) {
    hasServerActionInvalidation = true;
  }
}
ok(
  "Q_no_internal_http_invalidation_route",
  !exists("pages/api/internal-revalidate.ts") &&
    !exists("pages/api/internal-cache.ts") &&
    !exists("app/api/revalidate/route.ts") &&
    !hasInternalHttpInvalidation
);
ok("R_no_server_action_invalidation", !hasServerActionInvalidation);

// S–V
ok(
  "S_redirect_registry_ttl_60",
  /URL_REDIRECT_REGISTRY_TTL_SECONDS\s*=\s*60/.test(redirectRuntime)
);
ok(
  "T_db_pool_unchanged",
  /connectionLimit:\s*3/.test(db) && /queueLimit:\s*5/.test(db)
);
ok(
  "U_no_runtime_ddl",
  !/CREATE TABLE|ALTER TABLE|DROP TABLE/.test(invalidation) &&
    !/CREATE TABLE|ALTER TABLE|DROP TABLE/.test(publicCms) &&
    !/CREATE TABLE|ALTER TABLE|DROP TABLE/.test(faviconLib) &&
    !/CREATE TABLE|ALTER TABLE|DROP TABLE/.test(sitemapData)
);
ok(
  "V_no_schema_migration_in_scope",
  !/CREATE TABLE|ALTER TABLE|DROP TABLE|prisma|drizzle/.test(invalidation) &&
    !/CREATE TABLE|ALTER TABLE|DROP TABLE/.test(publicCms) &&
    !exists("scripts/migrate-hybrid-cache") &&
    !fs
      .readdirSync(path.join(ROOT, "scripts"))
      .some((n) => /hybrid.?cache.*migrat/i.test(n))
);

// W–X
ok(
  "W_siteContentKeysAffectSitemap_preserved",
  /export function siteContentKeysAffectSitemap/.test(invalidation) &&
    /subscription_slug/.test(invalidation)
);
ok(
  "X_siteContentKeysAffectFavicon_preserved",
  /export function siteContentKeysAffectFavicon/.test(invalidation) &&
    /favicon_url/.test(invalidation)
);

// Y–Z–AA
ok(
  "Y_sitemap_query_semantics",
  /active = 1/.test(sitemapData) &&
    /status = ['"]published['"]/.test(sitemapData) &&
    /getSubscriptionSlugConfig/.test(sitemapData) &&
    /created_at/.test(sitemapData) &&
    !/updated_at/.test(sitemapData)
);
ok(
  "Z_favicon_transform_fallback",
  /c_fit,w_48,h_48,f_png,q_auto/.test(faviconLib) &&
    /FAVICON_FALLBACK_URL\s*=\s*["']https:\/\/firestick4uk\.com\/og-default\.png["']/.test(
      faviconLib
    )
);
ok(
  "AA_cms_query_mapping_unchanged",
  /SELECT content_key, content_value, content_type, page_name, label FROM site_content ORDER BY id ASC/.test(
    publicCms
  ) &&
    /content_type="json" AND is_visible=1/.test(publicCms) &&
    /JSON\.parse\(r\.content_value\)/.test(publicCms)
);

console.log(
  `\nphase-hybrid-cache-compatibility: ${passed} passed, ${failed} failed`
);
process.exit(failed ? 1 : 0);
