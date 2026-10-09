/**
 * Hostinger H3 — remove global Cache-Control no-store; keep security headers;
 * apply no-store only to sensitive route classes.
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

const nextConfig = read("next.config.ts");
const favicon = read("pages/api/favicon.ts");
const sitemap = read("app/sitemap.xml/route.ts");
const provider = read("components/SiteContentProvider.tsx");
const blogSlug = read("app/blog/[slug]/page.tsx");
const db = read("lib/db.ts");
const home = read("app/page.tsx");
const layout = read("app/layout.tsx");
const contact = read("lib/contact-config.ts");

// --- Parse header blocks without executing TS ---
ok(
  "securityHeaders_defined",
  /const securityHeaders\s*=\s*\[/.test(nextConfig)
);

const securityBlockMatch = nextConfig.match(
  /const securityHeaders\s*=\s*\[([\s\S]*?)\];/
);
const securityBlock = securityBlockMatch ? securityBlockMatch[1] : "";
ok(
  "securityHeaders_no_cache_control",
  securityBlock.length > 0 && !/Cache-Control/i.test(securityBlock),
  securityBlock.includes("Cache-Control") ? "still has Cache-Control" : ""
);

ok(
  "security_x_content_type",
  /X-Content-Type-Options/.test(securityBlock) && /nosniff/.test(securityBlock)
);
ok(
  "security_x_frame",
  /X-Frame-Options/.test(securityBlock) && /DENY/.test(securityBlock)
);
ok(
  "security_xss",
  /X-XSS-Protection/.test(securityBlock)
);
ok(
  "security_referrer",
  /Referrer-Policy/.test(securityBlock)
);
ok(
  "security_permissions",
  /Permissions-Policy/.test(securityBlock)
);
ok(
  "security_csp",
  /Content-Security-Policy/.test(securityBlock)
);

ok(
  "noStoreHeaders_defined",
  /const noStoreHeaders\s*=\s*\[/.test(nextConfig)
);
const noStoreBlockMatch = nextConfig.match(
  /const noStoreHeaders\s*=\s*\[([\s\S]*?)\];/
);
const noStoreBlock = noStoreBlockMatch ? noStoreBlockMatch[1] : "";
ok(
  "noStoreHeaders_value",
  /no-store,\s*no-cache,\s*must-revalidate/.test(noStoreBlock)
);

ok(
  "global_source_uses_security_only",
  /source:\s*["']\/\(\.\*\)["']/.test(nextConfig) &&
    /headers:\s*securityHeaders/.test(nextConfig)
);

// Ensure global route block does not attach noStoreHeaders
const globalRouteMatch = nextConfig.match(
  /\{\s*source:\s*["']\/\(\.\*\)["']\s*,\s*headers:\s*(\w+)\s*,?\s*\}/
);
ok(
  "global_route_not_noStore",
  globalRouteMatch && globalRouteMatch[1] === "securityHeaders",
  globalRouteMatch ? globalRouteMatch[1] : "missing"
);

ok(
  "api_no_store_rule",
  /source:\s*["']\/api\/:path\*["']/.test(nextConfig)
);
ok(
  "sidhu_root_no_store",
  /source:\s*["']\/sidhu["']/.test(nextConfig)
);
ok(
  "sidhu_nested_no_store",
  /source:\s*["']\/sidhu\/:path\*["']/.test(nextConfig)
);
ok(
  "erp_no_store_removed",
  !/source:\s*["']\/erp["']/.test(nextConfig) &&
    !/source:\s*["']\/erp\/:path\*["']/.test(nextConfig)
);
ok(
  "cart_root_no_store",
  /source:\s*["']\/cart["']/.test(nextConfig)
);
ok(
  "cart_nested_no_store",
  /source:\s*["']\/cart\/:path\*["']/.test(nextConfig)
);

// Confirm each sensitive source is paired with noStoreHeaders nearby
function sourceUsesNoStore(sourceLiteral) {
  const idx = nextConfig.indexOf(`source: "${sourceLiteral}"`);
  if (idx < 0) return false;
  const snippet = nextConfig.slice(idx, idx + 180);
  return /headers:\s*noStoreHeaders/.test(snippet);
}
ok("api_paired_noStore", sourceUsesNoStore("/api/:path*"));
ok("sidhu_paired_noStore", sourceUsesNoStore("/sidhu"));
ok("sidhu_nested_paired_noStore", sourceUsesNoStore("/sidhu/:path*"));
ok("cart_paired_noStore", sourceUsesNoStore("/cart"));
ok("cart_nested_paired_noStore", sourceUsesNoStore("/cart/:path*"));

ok(
  "downloads_headers_remain",
  /source:\s*["']\/downloads\/:path\*["']/.test(nextConfig) &&
    /Content-Disposition/.test(nextConfig) &&
    /application\/vnd\.android\.package-archive/.test(nextConfig)
);

ok(
  "no_s_maxage_introduced",
  !/s-maxage/i.test(nextConfig)
);
ok(
  "no_stale_while_revalidate",
  !/stale-while-revalidate/i.test(nextConfig)
);
ok(
  "no_public_max_age_on_html_forced",
  // Favicon may set public max-age; HTML routes must not get a blanket public max-age.
  !/source:\s*["']\/\(\.\*\)["'][\s\S]{0,200}public,\s*max-age=/.test(nextConfig) &&
    !/source:\s*["']\/["'][\s\S]{0,120}public,\s*max-age=/.test(nextConfig)
);

ok(
  "home_force_dynamic_unchanged",
  /export const dynamic = ["']force-dynamic["']/.test(home) &&
    /export const revalidate = 0/.test(home)
);
ok(
  "sitemap_architecture_unchanged",
  /force-dynamic/.test(sitemap) && /revalidate = 0/.test(sitemap)
);
ok(
  "favicon_api_max_age_remains",
  /public, max-age=3600/.test(favicon) && /favicon_url/.test(favicon)
);
ok(
  "h1_provider_remains",
  /fetch\(["']\/api\/site-content\?page=all["']\)/.test(provider)
);
ok(
  "h2_getPost_cache_remains",
  /const getPost = cache\(async/.test(blogSlug)
);
ok(
  "h2_getSiteSettings_cache_remains",
  /getSiteSettings = cache\(async/.test(layout)
);
ok(
  "h2_getContactConfig_cache_remains",
  /export const getContactConfig = cache\(async/.test(contact)
);
ok(
  "db_pool_unchanged",
  /connectionLimit:\s*3/.test(db) && /NODE_ENV !== 'production'/.test(db)
);
ok(
  "erp_ui_absent_after_r2b",
  !exists("app/erp")
);
ok(
  "no_use_cache_directive",
  !/"use cache"/.test(home) && !/"use cache"/.test(blogSlug)
);
ok(
  "no_unstable_cache_isr_helpers",
  !/unstable_cache|revalidateTag|revalidatePath/.test(nextConfig) &&
    !/unstable_cache|revalidateTag/.test(home)
);
ok("h3_test_file_exists", exists("scripts/phase-hostinger-h3-cache-headers-tests.js"));

console.log(
  `\nphase-hostinger-h3-cache-headers: ${passed} passed, ${failed} failed`
);
process.exit(failed ? 1 : 0);
