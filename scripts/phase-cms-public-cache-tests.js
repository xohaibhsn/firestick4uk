/**
 * Public CMS Data Cache — page=all and visible sections only.
 * Static invariants. Does not mutate the database.
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

const helper = read("lib/publicCmsDataServer.ts");
const siteContent = read("pages/api/site-content.ts");
const sections = read("pages/api/sections.ts");
const faviconUpload = read("pages/api/upload-favicon.ts");
const restore = read("pages/api/admin-revisions/restore.ts");
const nextConfig = read("next.config.ts");
const provider = read("components/SiteContentProvider.tsx");
const homeClient = read("app/HomeClient.tsx");
const db = read("lib/db.ts");

ok("A_page_all_uses_cached_loader", /page === 'all'[\s\S]{0,180}getCachedPublicSiteContentAll\(/.test(siteContent));
ok(
  "B_non_all_get_still_queries",
  /if \(page === 'all'\)/.test(siteContent) &&
    /FROM site_content/.test(siteContent) &&
    /ORDER BY id ASC/.test(siteContent)
);
ok(
  "C_mutations_do_not_read_public_cache",
  (siteContent.match(/getCachedPublicSiteContentAll\(/g) || []).length === 1 &&
    !/req\.method === 'POST'[\s\S]*getCachedPublicSiteContentAll/.test(siteContent) &&
    !/req\.method === 'PUT'[\s\S]*getCachedPublicSiteContentAll/.test(siteContent) &&
    !/req\.method === 'DELETE'[\s\S]*getCachedPublicSiteContentAll/.test(siteContent)
);
ok(
  "D_site_content_writers_invalidate",
  (siteContent.match(/invalidatePublicCmsCache\(\)/g) || []).length >= 3 &&
    /invalidatePublicCmsCache\(\)/.test(faviconUpload) &&
    (restore.match(/invalidatePublicCmsCache\(\)/g) || []).length >= 2
);
ok(
  "E_public_sections_use_cached_loader",
  /getCachedPublicVisibleSections\(pageArg\)/.test(sections)
);
ok(
  "F_sections_all_bypasses_cache",
  /if \(!all && typeof pageArg === 'string'\)/.test(sections) &&
    (sections.match(/getCachedPublicVisibleSections\(/g) || []).length === 1
);
ok(
  "G_sections_mutations_invalidate",
  (sections.match(/invalidatePublicCmsCache\(\)/g) || []).length >= 3
);
const allLoader = helper.slice(
  helper.indexOf("async function loadPublicSiteContentAll"),
  helper.indexOf("async function loadPublicVisibleSections")
);
const sectionLoader = helper.slice(
  helper.indexOf("async function loadPublicVisibleSections"),
  helper.indexOf("export const getCachedPublicSiteContentAll")
);
ok(
  "H_loaders_do_not_cache_empty_on_db_error",
  !/catch/.test(allLoader) &&
    !/return \{\}/.test(allLoader) &&
    !/return \[\]/.test(sectionLoader) &&
    /pool\.query/.test(allLoader) &&
    /pool\.query/.test(sectionLoader)
);
ok("I_ttl_is_60", /PUBLIC_CMS_CACHE_TTL_SECONDS = 60/.test(helper) && /revalidate: PUBLIC_CMS_CACHE_TTL_SECONDS/.test(helper));
ok(
  "J_ttl_only_shim_no_tag",
  !/PUBLIC_CMS_CACHE_TAG/.test(helper) &&
    !/tags:\s*\[/.test(helper) &&
    !/revalidateTag\s*\(/.test(helper) &&
    /export function invalidatePublicCmsCache\(\):\s*void/.test(helper) &&
    /TTL-only/.test(helper)
);
ok(
  "K_no_session_fields_cached",
  !/password|session|cookie|role/.test(helper)
);
ok(
  "L_no_http_cache_broadening",
  /Cache-Control", value: "no-store, no-cache, must-revalidate"/.test(nextConfig) &&
    !/s-maxage|Cache-Control/.test(siteContent) &&
    !/s-maxage|Cache-Control/.test(sections) &&
    !/s-maxage|Cache-Control/.test(helper)
);
ok(
  "M_no_client_fetch_loop",
  /fetch\("\/api\/site-content\?page=all"\)/.test(provider) &&
    /\[\]\)/.test(provider) &&
    (provider.match(/fetch\("\/api\/site-content\?page=all"\)/g) || []).length === 1 &&
    (homeClient.match(/fetch\('\/api\/sections\?page=home'\)/g) || []).length === 1
);
ok("N_player_remains_retired", !exists("pages/api/player/proxy.ts") && !exists("pages/api/player"));
ok("O_no_xmlrpc_route", !exists("pages/api/xmlrpc.ts") && !exists("app/xmlrpc.php"));
ok("cache_keys", /public-site-content-all-v1/.test(helper) && /public-sections-visible-v1/.test(helper));
ok("db_pool_unchanged", /connectionLimit:\s*3/.test(db) && /queueLimit:\s*5/.test(db));

console.log(`\nphase-cms-public-cache: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
