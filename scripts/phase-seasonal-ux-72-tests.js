/**
 * F4UK-SEASONAL-UX-72 — list DTO season keys, card countdown, shared ticker,
 * PDP "Current Seasonal Offers", home product order, CMS keys, Sidhu CMS-RT,
 * admin no-store, SEO stability, diff allowlist.
 * Static + pure helpers only. No .env*, no real DB, no network.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const { spawnSync } = require("child_process");

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

const cache = new Map();

function loadTsModule(rel, stubs = {}) {
  const stubKey = Object.keys(stubs)
    .sort()
    .map((k) => k + "=" + typeof stubs[k])
    .join(",");
  const key = rel + "::" + stubKey;
  if (cache.has(key)) return cache.get(key);
  const src = read(rel);
  const { outputText } = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
    },
  });
  const exportsObj = {};
  const moduleObj = { exports: exportsObj };
  const localRequire = (id) => {
    if (Object.prototype.hasOwnProperty.call(stubs, id)) return stubs[id];
    if (id.startsWith(".") || id.startsWith("..") || id.startsWith("@/")) {
      let resolved = id;
      if (id.startsWith("@/")) resolved = path.join(ROOT, id.slice(2));
      else resolved = path.normalize(path.join(path.dirname(path.join(ROOT, rel)), id));
      for (const c of [resolved + ".ts", resolved + ".js", path.join(resolved, "index.ts")]) {
        if (fs.existsSync(c)) {
          return loadTsModule(path.relative(ROOT, c).replace(/\\/g, "/"), stubs);
        }
      }
    }
    return require(id);
  };
  const fn = new Function("exports", "module", "require", outputText);
  fn(exportsObj, moduleObj, localRequire);
  const mod = moduleObj.exports;
  cache.set(key, mod);
  return mod;
}

// ── 1. List DTO (pure) ─────────────────────────────────────────────────────
const dto = loadTsModule("lib/productPublicDto.ts");
const NOW = Date.UTC(2026, 10, 20, 12, 0, 0); // 2026-11-20T12:00:00Z
const EXPANDED = {
  mode: "expanded",
  present: [],
  missing: [],
  reason: "all_seasonal_columns_present",
};
const LEGACY = { mode: "legacy", present: [], missing: [], reason: "no_seasonal_columns_present" };

const baseRow = {
  id: 7,
  name: "Seasonal Pack",
  description: "d",
  short_description: "sd",
  slug: "seasonal-pack",
  price: "19.99",
  badge: "Hot",
  image: "/img/a.jpg",
  category: "Fire Stick",
  active: 1,
  stock: "In Stock",
};
const liveSeasonalRow = {
  ...baseRow,
  product_version: 1,
  lifecycle_mode: "seasonal",
  shop_listed: 1,
  season_paused: 0,
  season_starts_at: "2026-11-01 00:00:00",
  season_ends_at: "2026-11-30 23:59:59",
};
const permanentRow = {
  ...baseRow,
  id: 8,
  product_version: 1,
  lifecycle_mode: "permanent",
  shop_listed: 1,
  season_paused: 0,
  season_starts_at: null,
  season_ends_at: null,
};
const endedSeasonalRow = {
  ...liveSeasonalRow,
  id: 9,
  season_starts_at: "2026-10-01 00:00:00",
  season_ends_at: "2026-10-31 23:59:59",
};

ok("dto_exports_toPublicListProduct", typeof dto.toPublicListProduct === "function");

const noOpts = dto.toPublicListProduct(liveSeasonalRow);
ok(
  "dto_no_opts_no_season_keys",
  !("season_ends_at" in noOpts) && !("season_phase" in noOpts)
);
const LEGACY_KEYS = [
  "id",
  "name",
  "description",
  "short_description",
  "slug",
  "price",
  "badge",
  "image",
  "category",
];
ok(
  "dto_no_opts_legacy_key_set",
  JSON.stringify(Object.keys(noOpts).sort()) === JSON.stringify([...LEGACY_KEYS].sort())
);

const live = dto.toPublicListProduct(liveSeasonalRow, { nowMs: NOW, capability: EXPANDED });
ok("dto_live_hub_member_has_season_phase_live", live.season_phase === "live");
ok(
  "dto_live_hub_member_has_season_ends_at_iso",
  live.season_ends_at === "2026-11-30T23:59:59.000Z" ||
    (typeof live.season_ends_at === "string" && /^2026-11-30T23:59:59/.test(live.season_ends_at)),
  String(live.season_ends_at)
);
ok(
  "dto_live_keeps_price_unchanged",
  live.price === liveSeasonalRow.price && live.id === 7 && live.slug === "seasonal-pack"
);

const permNoOpts = dto.toPublicListProduct(permanentRow);
const permOpts = dto.toPublicListProduct(permanentRow, { nowMs: NOW, capability: EXPANDED });
ok(
  "dto_permanent_with_opts_no_season_keys",
  !("season_ends_at" in permOpts) && !("season_phase" in permOpts)
);
ok(
  "dto_permanent_with_opts_byte_identical",
  JSON.stringify(permOpts) === JSON.stringify(permNoOpts)
);

const endedOpts = dto.toPublicListProduct(endedSeasonalRow, { nowMs: NOW, capability: EXPANDED });
ok(
  "dto_ended_seasonal_no_season_keys",
  !("season_ends_at" in endedOpts) && !("season_phase" in endedOpts)
);
const legacyOpts = dto.toPublicListProduct(baseRow, { nowMs: NOW, capability: LEGACY });
ok(
  "dto_legacy_capability_byte_identical",
  JSON.stringify(legacyOpts) === JSON.stringify(dto.toPublicListProduct(baseRow))
);

// ── 2. Card countdown format (pure) ────────────────────────────────────────
const label = loadTsModule("lib/seasonalCountdownLabel.ts");
const { formatSeasonalCardCountdown, splitCountdownParts } = label;
ok("card_fmt_exported", typeof formatSeasonalCardCountdown === "function");
ok(
  "card_fmt_days_format",
  formatSeasonalCardCountdown(18 * 86400 + 3 * 3600 + 12 * 60 + 45) === "⏳ Ends in 18d 03:12:45"
);
ok("card_fmt_hide_zero_days", formatSeasonalCardCountdown(3 * 3600 + 5 * 60 + 9) === "⏳ Ends in 03:05:09");
ok("card_fmt_no_0d_literal", !/0d/.test(formatSeasonalCardCountdown(59)));
ok("card_fmt_ended_zero", formatSeasonalCardCountdown(0) === "Offer ended");
ok("card_fmt_ended_negative", formatSeasonalCardCountdown(-5) === "Offer ended");
ok("card_fmt_pad2_hours", formatSeasonalCardCountdown(1 * 86400 + 1 * 3600) === "⏳ Ends in 1d 01:00:00");
ok("card_fmt_pad2_all", formatSeasonalCardCountdown(1) === "⏳ Ends in 00:00:01");
ok(
  "split_parts_correct",
  JSON.stringify(splitCountdownParts(90061)) ===
    JSON.stringify({ days: 1, hours: 1, mins: 1, secs: 1 })
);
ok(
  "split_parts_clamps_negative",
  JSON.stringify(splitCountdownParts(-10)) === JSON.stringify({ days: 0, hours: 0, mins: 0, secs: 0 })
);

// ── 3. Shared ticker ───────────────────────────────────────────────────────
ok("ticker_file_exists", exists("hooks/useSharedSecondTicker.ts"));
const tickerSrc = read("hooks/useSharedSecondTicker.ts");
ok(
  "ticker_single_setInterval",
  (tickerSrc.match(/setInterval\(/g) || []).length === 1
);
ok("ticker_listeners_set", /new Set<Listener>\(\)/.test(tickerSrc) && /listeners\.add\(/.test(tickerSrc));
ok(
  "ticker_releases_when_idle",
  /listeners\.size\s*>\s*0/.test(tickerSrc) && /clearInterval/.test(tickerSrc)
);
ok("ticker_exports_hook", /export function useSharedSecondTicker/.test(tickerSrc));

// ── 4. SeasonalCardCountdown.tsx ───────────────────────────────────────────
const cardSrc = read("components/product/SeasonalCardCountdown.tsx");
ok("card_aria_live_off", /aria-live="off"/.test(cardSrc));
ok("card_role_timer", /role="timer"/.test(cardSrc));
ok("card_uses_shared_ticker", /useSharedSecondTicker/.test(cardSrc) && !/setInterval/.test(cardSrc));
ok("card_uses_formatter", /formatSeasonalCardCountdown/.test(cardSrc));

// ── 5. SeasonalCountdown.tsx ───────────────────────────────────────────────
const cdSrc = read("components/product/SeasonalCountdown.tsx");
ok(
  "countdown_boxes_days_hrs_mins_secs",
  /"DAYS"/.test(cdSrc) && /"HRS"/.test(cdSrc) && /"MINS"/.test(cdSrc) && /"SECS"/.test(cdSrc)
);
ok("countdown_seconds_always_shown", /label:\s*"SECS"/.test(cdSrc) && !/secs\s*>\s*0\s*&&/.test(cdSrc));
ok("countdown_testid", /data-testid="seasonal-countdown"/.test(cdSrc));
ok(
  "countdown_cms_prefixes_used",
  /DEFAULT_COUNTDOWN_PREFIX/.test(cdSrc) &&
    /DEFAULT_COUNTDOWN_UPCOMING_PREFIX/.test(cdSrc) &&
    /\bprefix\b/.test(cdSrc) &&
    /upcomingPrefix/.test(cdSrc)
);
ok("countdown_uses_splitCountdownParts", /splitCountdownParts/.test(cdSrc));

// ── 6. CurrentSeasonalOffers.tsx ───────────────────────────────────────────
const offersSrc = read("components/product/CurrentSeasonalOffers.tsx");
ok("offers_hidden_when_disabled_or_empty", /!enabled\s*\|\|\s*!offers\.length/.test(offersSrc));
ok("offers_uses_useCart", /useCart/.test(offersSrc) && /addToCart/.test(offersSrc));
ok("offers_add_to_cart_label", /Add to Cart/.test(offersSrc));
ok("offers_uses_card_countdown", /SeasonalCardCountdown/.test(offersSrc));
const pdpPageSrc = read("app/products/[slug]/page.tsx");
ok(
  "offers_excludes_self_via_pickCurrentSeasonalOffers",
  /pickCurrentSeasonalOffers\(\s*liveMembers,\s*Number\(product\.id\),\s*3\s*\)/.test(pdpPageSrc)
);
ok(
  "offers_props_passed_to_detail",
  /currentSeasonalOffers=\{currentSeasonalOffers\}/.test(pdpPageSrc) &&
    /currentSeasonalOffersEnabled=\{seasonalOffersEnabled\}/.test(pdpPageSrc) &&
    /currentSeasonalOffersHeading=\{seasonalOffersHeading\}/.test(pdpPageSrc)
);

// ── 7. homeProductOrder (pure) ─────────────────────────────────────────────
const hpo = loadTsModule("lib/homeProductOrder.ts");
const mk = (id, extra = {}) => ({
  id,
  name: `P${id}`,
  description: "",
  price: 10 + id,
  badge: null,
  image: null,
  category: "x",
  ...extra,
});
const ALL = Array.from({ length: 12 }, (_, i) => mk(i + 1));
ok(
  "home_order_follows_ids",
  hpo.resolveHomeProducts(ALL, "5,2,9").map((p) => p.id).join(",") === "5,2,9"
);
ok("home_order_max_8", hpo.resolveHomeProducts(ALL, "1,2,3,4,5,6,7,8,9,10,11").length === 8);
ok(
  "home_order_skips_missing",
  hpo.resolveHomeProducts(ALL, "3,999,4,0,abc").map((p) => p.id).join(",") === "3,4"
);
ok(
  "home_order_dedupes",
  hpo.resolveHomeProducts(ALL, "3,3,4").map((p) => p.id).join(",") === "3,4"
);
ok(
  "home_order_empty_first_8",
  hpo.resolveHomeProducts(ALL, "").map((p) => p.id).join(",") === "1,2,3,4,5,6,7,8"
);
ok(
  "home_order_null_first_8",
  hpo.resolveHomeProducts(ALL, null).length === 8 && hpo.resolveHomeProducts(ALL, undefined).length === 8
);

const mkLive = (id, endsAt) =>
  mk(id, { slug: `s-${id}`, season_ends_at: endsAt, season_phase: "live" });
const LIVE = [
  mkLive(1, "2026-12-10T00:00:00.000Z"),
  mkLive(2, "2026-11-25T00:00:00.000Z"),
  mkLive(3, "2026-12-01T00:00:00.000Z"),
  mkLive(4, "2026-11-22T00:00:00.000Z"),
  mkLive(5, "2026-12-20T00:00:00.000Z"),
];
const picked = hpo.pickCurrentSeasonalOffers(LIVE, 4, 3);
ok("pick_excludes_self", !picked.some((p) => p.id === 4));
ok("pick_earliest_end_first", picked.map((p) => p.id).join(",") === "2,3,1");
ok("pick_max_3_default", hpo.pickCurrentSeasonalOffers(LIVE, 999).length === 3);
ok(
  "pick_all_marked_live",
  picked.every((p) => p.season_phase === "live" && typeof p.season_ends_at === "string")
);
ok(
  "pick_skips_missing_end",
  hpo.pickCurrentSeasonalOffers([mk(1, { season_ends_at: null }), mkLive(2, "2026-12-01T00:00:00.000Z")], 99)
    .map((p) => p.id)
    .join(",") === "2"
);

// ── 8. CMS defaults ────────────────────────────────────────────────────────
const defaultsSrc = read("lib/siteContentDefaults.ts");
ok("cms_home_product_ids_key", /\['home_product_ids',\s*'',\s*'text',\s*'home'/.test(defaultsSrc));
ok(
  "cms_pd_seasonal_offers_enabled_default_1",
  /\['pd_seasonal_offers_enabled',\s*'1'/.test(defaultsSrc)
);
ok("cms_pd_seasonal_offers_heading_key", /\['pd_seasonal_offers_heading',\s*'[^']+'/.test(defaultsSrc));
const adminFieldsSrc = read("lib/adminContentFields.ts");
ok(
  "cms_admin_fields_expose_offers_keys",
  /pd_seasonal_offers_enabled/.test(adminFieldsSrc) && /pd_seasonal_offers_heading/.test(adminFieldsSrc)
);

// ── 9. CMS-RT (Sidhu) ──────────────────────────────────────────────────────
const sidhuSrc = read("app/sidhu/page.tsx");
const deleteOrderIdx = sidhuSrc.indexOf("const deleteOrder = async");
const deleteOrderBlock = deleteOrderIdx >= 0 ? sidhuSrc.slice(deleteOrderIdx, deleteOrderIdx + 4500) : "";
ok(
  "sidhu_deleteOrder_removes_from_recentOrders",
  /setRecentOrders\(\(prev\)\s*=>\s*prev\.filter\(\(o\)\s*=>\s*o\.id\s*!==\s*orderId\)\)/.test(deleteOrderBlock)
);
ok("sidhu_deleteOrder_calls_refreshAfterOrderMutation", /refreshAfterOrderMutation\(/.test(deleteOrderBlock));
ok("sidhu_refreshAfterOrderMutation_defined", /const refreshAfterOrderMutation = async/.test(sidhuSrc));
ok("sidhu_auto_refresh_60000", /setInterval\(\(\)\s*=>\s*\{\s*void tick\(\);\s*\},\s*60000\)/.test(sidhuSrc));
ok("sidhu_auto_refresh_pauses_when_hidden", /document\.hidden/.test(sidhuSrc));
ok(
  "sidhu_home_product_ids_panel",
  /"home_product_ids"/.test(sidhuSrc) && /siteContent\.home_product_ids/.test(sidhuSrc)
);

// ── 10. Admin no-store ─────────────────────────────────────────────────────
ok("admin_nostore_helper_exists", exists("lib/adminNoStore.ts"));
const nsSrc = read("lib/adminNoStore.ts");
ok(
  "admin_nostore_helper_shape",
  /no-store, private/.test(nsSrc) && /export function setAdminNoStore/.test(nsSrc)
);
const apiDir = path.join(ROOT, "pages", "api");
const adminTop = fs
  .readdirSync(apiDir)
  .filter((f) => /^admin-.*\.ts$/.test(f))
  // Auth-entry and POST-only routes (no admin GET data to cache); untouched by this feature.
  .filter(
    (f) =>
      ![
        "admin-login.ts",
        "admin-logout.ts",
        "admin-staff-password.ts",
        "admin-blog-research.ts",
        "admin-product-url-migration.ts",
        "admin-seo-ai.ts",
      ].includes(f)
  );
const missingNoStore = adminTop.filter((f) => {
  const s = fs.readFileSync(path.join(apiDir, f), "utf8");
  return !(/setAdminNoStore/.test(s) || /no-store, private/.test(s) || /no-store/.test(s));
});
ok(
  "admin_top_level_api_no_store",
  adminTop.length >= 10 && missingNoStore.length === 0,
  missingNoStore.join(",") || `${adminTop.length} files`
);
const touchedAdmin = [
  "admin-audit.ts",
  "admin-media-usage.ts",
  "admin-media.ts",
  "admin-orders-export.ts",
  "admin-orders.ts",
  "admin-products.ts",
  "admin-profile.ts",
  "admin-redirects.ts",
  "admin-revisions.ts",
  "admin-seo-issues.ts",
  "admin-seo-overview.ts",
  "admin-server-runtime.ts",
  "admin-session.ts",
  "admin-staff.ts",
];
ok(
  "admin_touched_routes_use_setAdminNoStore_or_private",
  touchedAdmin.every((f) => {
    const s = read(`pages/api/${f}`);
    return /setAdminNoStore|no-store, private/.test(s);
  })
);
ok(
  "admin_insights_and_leads_no_store",
  ["export", "geo", "pages", "returning", "settings", "sources"].every((n) =>
    /setAdminNoStore|no-store, private/.test(read(`pages/api/admin-insights/${n}.ts`))
  ) && /setAdminNoStore|no-store, private/.test(read("pages/api/admin/leads.ts"))
);
ok(
  "public_cms_apis_have_no_store_helper_or_header",
  ["blog", "coupons", "faqs", "sections"].every((n) =>
    /setAdminNoStore|no-store, private/.test(read(`pages/api/${n}.ts`))
  )
);

// ── 11. Card countdown wired in lists ──────────────────────────────────────
ok("home_client_imports_card_countdown", /import SeasonalCardCountdown from "@\/components\/product\/SeasonalCardCountdown"/.test(read("app/HomeClient.tsx")));
ok("products_client_imports_card_countdown", /import SeasonalCardCountdown from "@\/components\/product\/SeasonalCardCountdown"/.test(read("app/products/ProductsClient.tsx")));
ok("home_client_renders_card_countdown", /<SeasonalCardCountdown/.test(read("app/HomeClient.tsx")));
ok("products_client_renders_card_countdown", /<SeasonalCardCountdown/.test(read("app/products/ProductsClient.tsx")));

// ── 12. ProductDetail ──────────────────────────────────────────────────────
const pdSrc = read("app/products/[slug]/ProductDetail.tsx");
ok(
  "product_detail_imports_current_seasonal_offers",
  /from "@\/components\/product\/CurrentSeasonalOffers"/.test(pdSrc)
);
ok("product_detail_renders_current_seasonal_offers", /<CurrentSeasonalOffers/.test(pdSrc));

// ── 13. list server wiring ─────────────────────────────────────────────────
ok(
  "publicProductsServer_passes_nowMs_capability",
  /toPublicListProduct\(r,\s*\{\s*nowMs,\s*capability\s*\}\)/.test(read("lib/publicProductsServer.ts"))
);
ok(
  "api_products_passes_nowMs_capability",
  /toPublicListProduct\(r,\s*\{\s*nowMs,\s*capability\s*\}\)/.test(read("pages/api/products.ts"))
);

// ── 14. No new dangerouslySetInnerHTML ─────────────────────────────────────
for (const f of [
  "components/product/SeasonalCardCountdown.tsx",
  "components/product/CurrentSeasonalOffers.tsx",
  "components/product/SeasonalCountdown.tsx",
]) {
  ok(`no_dangerouslySetInnerHTML_${path.basename(f, ".tsx")}`, !/dangerouslySetInnerHTML|innerHTML\s*=/.test(read(f)));
}

// ── 15. SEO stability ──────────────────────────────────────────────────────
const homePageSrc = read("app/page.tsx");
ok("seo_home_generateMetadata_present", /export async function generateMetadata\(\)/.test(homePageSrc));
ok(
  "seo_home_canonical_unchanged",
  /canonical:\s*"https:\/\/firestick4uk\.com"/.test(homePageSrc)
);
ok("seo_pdp_generateMetadata_present", /export async function generateMetadata\(/.test(pdpPageSrc));
ok(
  "seo_pdp_canonical_pattern_unchanged",
  /const canonical = `https:\/\/firestick4uk\.com\/products\/\$\{canonicalSlug\}`;/.test(pdpPageSrc) &&
    /alternates:\s*\{\s*canonical\s*\}/.test(pdpPageSrc)
);
ok(
  "seo_pdp_jsonld_product_offer_intact",
  /"@type":\s*"Product"/.test(pdpPageSrc) &&
    /"@type":\s*"Offer"/.test(pdpPageSrc) &&
    /priceCurrency:\s*"GBP"/.test(pdpPageSrc)
);
ok("seo_pdp_still_uses_product_price", /product\.price/.test(pdSrc) && /Number\(product\.price\)/.test(pdSrc));

function gitLines(args) {
  const r = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
  if (r.status !== 0) return null;
  return String(r.stdout || "");
}
{
  const d = gitLines(["diff", "HEAD", "-U0", "--", "app/page.tsx", "app/products/[slug]/page.tsx"]);
  const changed = (d || "")
    .split(/\r?\n/)
    .filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---)/.test(l));
  const seoTouch = changed.filter((l) =>
    /canonical|title:|description:|openGraph|application\/ld\+json|"@type"|<h1|priceValidUntil|robots/.test(l)
  );
  ok("seo_diff_no_meta_h1_canonical_jsonld_edits", d !== null && seoTouch.length === 0, seoTouch.join(" | ") || "clean");
}

// ── 16. Diff allowlist (working tree + untracked) ──────────────────────────
const UX72_ALLOW = new Set([
  "lib/productPublicDto.ts",
  "lib/publicProductsServer.ts",
  "lib/seasonalCountdownLabel.ts",
  "lib/homeProductOrder.ts",
  "lib/adminNoStore.ts",
  "lib/siteContentDefaults.ts",
  "lib/adminContentFields.ts",
  "hooks/useSharedSecondTicker.ts",
  "components/product/SeasonalCardCountdown.tsx",
  "components/product/SeasonalCountdown.tsx",
  "components/product/CurrentSeasonalOffers.tsx",
  "components/home/SeasonalHomePromoStrip.tsx",
  "components/sidhu/insights/insightsServer.ts",
  "app/page.tsx",
  "app/HomeClient.tsx",
  "app/products/ProductsClient.tsx",
  "app/products/[slug]/page.tsx",
  "app/products/[slug]/ProductDetail.tsx",
  "app/sidhu/page.tsx",
  "pages/api/products.ts",
  "pages/api/blog.ts",
  "pages/api/coupons.ts",
  "pages/api/faqs.ts",
  "pages/api/sections.ts",
  "scripts/phase-seasonal-ux-72-tests.js",
  "scripts/phase-proc-clarity-71-tests.js",
  "scripts/phase-black-friday-68-tests.js",
  "scripts/phase-promo-bar-75-tests.js",
  "scripts/phase-seasonal-rebase-38-tests.js",
  "scripts/phase-hostinger-h1-cms-bootstrap-tests.js",
  // F4UK-ADS-CSP-77
  "next.config.ts",
  "scripts/phase-ads-csp-77-tests.js",
  "scripts/phase-csp-report-only-tests.js",
]);
function ux72Allowed(f) {
  if (UX72_ALLOW.has(f)) return true;
  if (/^pages\/api\/admin-[^/]+\.ts$/.test(f)) return true;
  if (/^pages\/api\/admin-insights\/[^/]+\.ts$/.test(f)) return true;
  if (f === "pages/api/admin/leads.ts") return true;
  return false;
}
{
  const tracked = gitLines(["diff", "--name-only", "HEAD"]);
  const untracked = gitLines(["ls-files", "--others", "--exclude-standard"]);
  const names = new Set(
    `${tracked || ""}\n${untracked || ""}`
      .split(/\r?\n/)
      .map((s) => s.trim().replace(/\\/g, "/"))
      .filter(Boolean)
  );
  const bad = [...names].filter((n) => !ux72Allowed(n));
  ok(
    "diff_allowlist_ux72",
    tracked !== null && untracked !== null && bad.length === 0,
    bad.join(", ") || "clean"
  );
  ok(
    "diff_has_no_env_files",
    ![...names].some((n) => /(^|\/)\.env/.test(n))
  );
}

console.log(`\nF4UK-SEASONAL-UX-72: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
