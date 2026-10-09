/**
 * SEO-R2 — utility route index hygiene (A1 / 5G Next; player retired in ERP-R2B).
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

function hasNoIndexBlock(src) {
  return (
    /robots:\s*\{[\s\S]*?index:\s*false[\s\S]*?follow:\s*false[\s\S]*?googleBot:\s*\{[\s\S]*?index:\s*false[\s\S]*?follow:\s*false/.test(
      src
    )
  );
}

const a1Layout = read("app/A1iptvDownload/layout.tsx");
const a1Page = read("app/A1iptvDownload/page.tsx");
const g5Layout = read("app/5GNextDownload/layout.tsx");
const g5Page = read("app/5GNextDownload/page.tsx");
const sitemap = read("app/sitemap.xml/route.ts");
const sitemapXmlLib = read("lib/sitemapXml.ts");
const sitemapData = read("lib/sitemapDataServer.ts");
const robots = read("public/robots.txt");
const orderTracking = read("app/order-tracking/layout.tsx");
const sitemapSurface = sitemap + "\n" + sitemapXmlLib;

// --- A1 ---
ok("a1_layout_exists", exists("app/A1iptvDownload/layout.tsx"));
ok("a1_robots_noindex_nofollow", hasNoIndexBlock(a1Layout));
ok(
  "a1_canonical_self",
  /canonical:\s*["']https:\/\/firestick4uk\.com\/A1iptvDownload["']/.test(
    a1Layout
  )
);
ok(
  "a1_title_exact",
  /A1 IPTV Player Download — Firestick4UK/.test(a1Layout)
);
ok(
  "a1_apk_path_preserved",
  /\/downloads\/A1IPTVPlayer-latest\.apk/.test(a1Page)
);
ok("a1_page_still_client", /['"]use client['"]/.test(a1Page));

// --- 5G ---
ok("g5_layout_exists", exists("app/5GNextDownload/layout.tsx"));
ok("g5_robots_noindex_nofollow", hasNoIndexBlock(g5Layout));
ok(
  "g5_canonical_self",
  /canonical:\s*["']https:\/\/firestick4uk\.com\/5GNextDownload["']/.test(
    g5Layout
  )
);
ok(
  "g5_title_exact",
  /5G Next VPN Download — Firestick4UK/.test(g5Layout)
);
ok(
  "g5_apk_path_preserved",
  /\/downloads\/5GNext-vpn\.apk/.test(g5Page)
);
ok("g5_page_still_client", /['"]use client['"]/.test(g5Page));

// --- PLAYER retired ---
ok("player_ui_absent", !exists("app/player"));
ok("player_api_absent", !exists("pages/api/player"));

// --- SITEMAP ---
ok(
  "sitemap_utilities_absent",
  !/A1iptvDownload/.test(sitemapSurface) &&
    !/5GNextDownload/.test(sitemapSurface) &&
    !/\/player["'`]/.test(sitemapSurface) &&
    !/\/erp["'`]/.test(sitemapSurface)
);
ok("sitemap_order_tracking_retained", /\/order-tracking/.test(sitemapXmlLib));
ok(
  "sitemap_h5_architecture_unchanged",
  /getSitemapDynamicDataSafe/.test(sitemap) &&
    /getCachedSitemapDynamicData/.test(sitemapData) &&
    /export async function GET\(/.test(sitemap) &&
    /export const dynamic = ["']force-dynamic["']/.test(sitemap) &&
    /SITEMAP_CACHE_TTL_SECONDS\s*=\s*300/.test(sitemapData) &&
    /unstable_cache/.test(sitemapData) &&
    /data\.products/.test(sitemapXmlLib) &&
    /data\.posts/.test(sitemapXmlLib) &&
    /subscriptionUrl/.test(sitemapXmlLib)
);

// --- ROBOTS ---
ok("robots_sidhu_disallow", /Disallow:\s*\/sidhu/.test(robots));
ok("robots_no_erp_disallow", !/Disallow:\s*\/erp\b/.test(robots));
ok("robots_api_disallow", /Disallow:\s*\/api\//.test(robots));
ok(
  "robots_no_utility_disallow",
  !/Disallow:\s*\/A1iptvDownload/.test(robots) &&
    !/Disallow:\s*\/5GNextDownload/.test(robots) &&
    !/Disallow:\s*\/player/.test(robots)
);

// --- ORDER TRACKING ---
ok(
  "order_tracking_self_canonical_remains",
  /canonical:\s*["']https:\/\/firestick4uk\.com\/order-tracking["']/.test(
    orderTracking
  )
);
ok(
  "order_tracking_not_noindex_in_r2",
  !/index:\s*false/.test(orderTracking)
);

// --- ERP retired (UI + API gone; R2C no tombstone) ---
ok("erp_ui_absent", !exists("app/erp"));
ok("erp_api_absent", !exists("pages/api/erp"));
ok("erp_tombstone_absent", !exists("pages/api/erp/[...path].ts"));

console.log(`\nSEO-R2 utility index: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
