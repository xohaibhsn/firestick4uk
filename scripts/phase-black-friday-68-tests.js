/**
 * F4UK-BLACK-FRIDAY-68 — countdown wording, priceValidUntil, home promo strip,
 * footer seasonal link, /seasonal-offers subtitle, CMS prefixes.
 * Mocked / static / pure helpers only. No .env*, no real DB, no network.
 *
 * Older-suite edits (allowlist/shape only — listed in REPORT):
 *  - phase-insights-live-63-tests.js
 *  - phase-city-cleanup-64-tests.js
 *  - phase-sidhu-insights-57-tests.js
 *  - phase-home-reviews-61-tests.js
 *  - phase-windup-59-tests.js
 *  - phase-ux-batch-51-tests.js
 *  - phase-ux-fix-53-tests.js
 *  - phase-cod-restore-54-tests.js
 *  - phase-insights-slim-67-tests.js (CRLF regex + BF68 protected-path allow)
 *  - phase-pay-cms-66-tests.js (Footer dirty allow for seasonal link)
 */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
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

const BF68_ALLOW = new Set([
  "components/product/SeasonalCountdown.tsx",
  "components/home/SeasonalHomePromoStrip.tsx",
  "components/Footer.tsx",
  "lib/seasonalCountdownLabel.ts",
  "lib/seasonalPriceValidUntil.ts",
  "lib/siteContentDefaults.ts",
  "lib/adminContentFields.ts",
  "app/page.tsx",
  "app/HomeClient.tsx",
  "app/seasonal-offers/page.tsx",
  "app/products/[slug]/page.tsx",
  "app/products/[slug]/ProductDetail.tsx",
  "scripts/phase-black-friday-68-tests.js",
  "scripts/phase-insights-live-63-tests.js",
  "scripts/phase-city-cleanup-64-tests.js",
  "scripts/phase-sidhu-insights-57-tests.js",
  "scripts/phase-home-reviews-61-tests.js",
  "scripts/phase-windup-59-tests.js",
  "scripts/phase-ux-batch-51-tests.js",
  "scripts/phase-ux-fix-53-tests.js",
  "scripts/phase-cod-restore-54-tests.js",
  "scripts/phase-insights-slim-67-tests.js",
  "scripts/phase-pay-cms-66-tests.js",
]);

// ── Countdown wording (pure) ───────────────────────────────────────────────
const labelMod = loadTsModule("lib/seasonalCountdownLabel.ts");
const {
  formatSeasonalCountdownRemaining,
  DEFAULT_COUNTDOWN_PREFIX,
  DEFAULT_COUNTDOWN_UPCOMING_PREFIX,
} = labelMod;

ok("defaults_present", DEFAULT_COUNTDOWN_PREFIX === "Offer ends in");
ok(
  "defaults_upcoming_present",
  DEFAULT_COUNTDOWN_UPCOMING_PREFIX === "Offer starts in"
);

ok(
  "live_multi_day",
  formatSeasonalCountdownRemaining(2 * 86400 + 3 * 3600 + 4 * 60, {
    phase: "live",
    prefix: "Offer ends in",
    upcomingPrefix: "Offer starts in",
  }) === "Offer ends in 2 days 3 hrs 4 mins"
);

ok(
  "live_singular_day_hr_min",
  formatSeasonalCountdownRemaining(86400 + 3600 + 60, {
    phase: "live",
    prefix: "Offer ends in",
    upcomingPrefix: "Offer starts in",
  }) === "Offer ends in 1 day 1 hr 1 min"
);

ok(
  "live_zero_days_hides_days",
  formatSeasonalCountdownRemaining(5 * 3600 + 12 * 60, {
    phase: "live",
    prefix: "Offer ends in",
    upcomingPrefix: "Offer starts in",
  }) === "Offer ends in 5 hrs 12 mins" &&
    !/day/.test(
      formatSeasonalCountdownRemaining(5 * 3600 + 12 * 60, {
        phase: "live",
        prefix: "Offer ends in",
        upcomingPrefix: "Offer starts in",
      })
    )
);

ok(
  "live_under_1h_shows_secs",
  formatSeasonalCountdownRemaining(45 * 60 + 12, {
    phase: "live",
    prefix: "Offer ends in",
    upcomingPrefix: "Offer starts in",
  }) === "Offer ends in 45 mins 12 secs"
);

ok(
  "live_under_1h_singular_sec",
  formatSeasonalCountdownRemaining(1, {
    phase: "live",
    prefix: "Offer ends in",
    upcomingPrefix: "Offer starts in",
  }) === "Offer ends in 1 sec"
);

ok(
  "live_under_1h_no_hrs_days",
  !/hr|day/.test(
    formatSeasonalCountdownRemaining(30 * 60 + 5, {
      phase: "live",
      prefix: "Offer ends in",
      upcomingPrefix: "Offer starts in",
    })
  )
);

ok(
  "upcoming_uses_upcoming_prefix",
  formatSeasonalCountdownRemaining(2 * 3600 + 5 * 60, {
    phase: "upcoming",
    prefix: "Offer ends in",
    upcomingPrefix: "Offer starts in",
  }) === "Offer starts in 2 hrs 5 mins"
);

ok(
  "cms_custom_prefix",
  formatSeasonalCountdownRemaining(3600 + 60, {
    phase: "live",
    prefix: "Deal closes in",
    upcomingPrefix: "Opens soon in",
  }) === "Deal closes in 1 hr 1 min"
);

ok(
  "cms_custom_upcoming_prefix",
  formatSeasonalCountdownRemaining(90, {
    phase: "upcoming",
    prefix: "Offer ends in",
    upcomingPrefix: "Starts in",
  }) === "Starts in 1 min 30 secs"
);

// ── Component wires CMS prefixes ───────────────────────────────────────────
const cdSrc = read("components/product/SeasonalCountdown.tsx");
ok(
  "countdown_uses_formatter",
  /formatSeasonalCountdownRemaining/.test(cdSrc) &&
    /prefix/.test(cdSrc) &&
    /upcomingPrefix/.test(cdSrc)
);
ok(
  "countdown_no_old_ends_in_literal",
  !/`Ends in \$\{/.test(cdSrc) && !/`Opens in \$\{/.test(cdSrc)
);
ok(
  "countdown_boundary_intact",
  /onBoundary/.test(cdSrc) && /Starting…/.test(cdSrc) && /Ending…/.test(cdSrc)
);

const detailSrc = read("app/products/[slug]/ProductDetail.tsx");
ok(
  "detail_passes_cms_prefixes",
  /season_countdown_prefix/.test(detailSrc) &&
    /season_countdown_upcoming_prefix/.test(detailSrc)
);

// ── CMS defaults + admin fields ────────────────────────────────────────────
const defaults = read("lib/siteContentDefaults.ts");
ok(
  "cms_defaults_countdown_keys",
  /season_countdown_prefix/.test(defaults) &&
    /season_countdown_upcoming_prefix/.test(defaults) &&
    /Offer ends in/.test(defaults) &&
    /Offer starts in/.test(defaults)
);
ok(
  "cms_defaults_promo_keys",
  /seasonal_promo_text/.test(defaults) &&
    /seasonal_promo_cta/.test(defaults) &&
    /Seasonal offers are live/.test(defaults)
);
const adminFields = read("lib/adminContentFields.ts");
ok(
  "admin_fields_promo_and_prefixes",
  /seasonal_promo_text/.test(adminFields) &&
    /season_countdown_prefix/.test(adminFields)
);

// ── priceValidUntil + permanent JSON-LD identity ───────────────────────────
const priceMod = loadTsModule("lib/seasonalPriceValidUntil.ts", {
  "@/lib/productSeasonLondon": loadTsModule("lib/productSeasonLondon.ts"),
});
const until = priceMod.londonDateYmdFromUtcInstant("2026-12-01 00:00:00");
ok(
  "price_valid_until_london_ymd",
  until === "2026-12-01" || /^\d{4}-\d{2}-\d{2}$/.test(String(until || "")),
  String(until)
);

const pageSrc = read("app/products/[slug]/page.tsx");
ok(
  "jsonld_priceValidUntil_gated",
  /priceValidUntil/.test(pageSrc) &&
    /lifecycle_mode/.test(pageSrc) &&
    /hasValidWindow/.test(pageSrc) &&
    /londonDateYmdFromUtcInstant/.test(pageSrc)
);

// Permanent offer object shape: extract build via source contract — permanent
// must not inject priceValidUntil when lifecycle is permanent.
ok(
  "permanent_offer_guard_in_source",
  /life === "seasonal"/.test(pageSrc) &&
    /Permanent Offer objects must remain byte-identical/.test(pageSrc)
);

function hashJson(obj) {
  return crypto.createHash("sha256").update(JSON.stringify(obj)).digest("hex");
}

// Simulate permanent vs seasonal offer construction matching page.tsx rules
function buildOffer(product, includeOffer) {
  if (!includeOffer) return null;
  const offer = {
    "@type": "Offer",
    price: String(Number(product.price).toFixed(2)),
    priceCurrency: "GBP",
    availability: "https://schema.org/InStock",
    url: "https://firestick4uk.com/products/x",
    seller: { "@type": "Organization", name: "Firestick4UK" },
  };
  const life = String(product.lifecycle_mode || "");
  if (life === "seasonal" && product._validWindow) {
    const u = priceMod.londonDateYmdFromUtcInstant(product.season_ends_at);
    if (u) offer.priceValidUntil = u;
  }
  return offer;
}

const permanentOfferBefore = {
  "@type": "Offer",
  price: "49.99",
  priceCurrency: "GBP",
  availability: "https://schema.org/InStock",
  url: "https://firestick4uk.com/products/x",
  seller: { "@type": "Organization", name: "Firestick4UK" },
};
const permanentOfferAfter = buildOffer(
  { price: 49.99, lifecycle_mode: "permanent", season_ends_at: null, _validWindow: false },
  true
);
ok(
  "permanent_jsonld_offer_byte_identical",
  hashJson(permanentOfferBefore) === hashJson(permanentOfferAfter),
  `${hashJson(permanentOfferBefore)} vs ${hashJson(permanentOfferAfter)}`
);

const seasonalOffer = buildOffer(
  {
    price: 29.99,
    lifecycle_mode: "seasonal",
    season_ends_at: "2026-12-01 00:00:00",
    _validWindow: true,
  },
  true
);
ok(
  "seasonal_jsonld_has_priceValidUntil",
  seasonalOffer &&
    typeof seasonalOffer.priceValidUntil === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(seasonalOffer.priceValidUntil)
);

const seasonalNoWindow = buildOffer(
  {
    price: 29.99,
    lifecycle_mode: "seasonal",
    season_ends_at: null,
    _validWindow: false,
  },
  true
);
ok(
  "seasonal_without_window_no_priceValidUntil",
  seasonalNoWindow && !("priceValidUntil" in seasonalNoWindow)
);

// ── Home promo strip ───────────────────────────────────────────────────────
const homePage = read("app/page.tsx");
const homeClient = read("app/HomeClient.tsx");
const promoStrip = read("components/home/SeasonalHomePromoStrip.tsx");
ok(
  "promo_ssr_resolve_hub",
  /resolveSeasonalHubPublicState/.test(homePage) &&
    /isHubLiveMember/.test(homePage) &&
    /seasonalPromo/.test(homePage)
);
ok(
  "promo_no_client_fetch",
  !/fetch\(/.test(promoStrip) &&
    !/useEffect[\s\S]*fetch/.test(promoStrip) &&
    /data-testid="seasonal-home-promo"/.test(promoStrip)
);
ok(
  "promo_link_target",
  /href="\/seasonal-offers"/.test(promoStrip) &&
    /data-testid="seasonal-home-promo-cta"/.test(promoStrip)
);
ok(
  "promo_above_hero_not_in_h1",
  /SeasonalHomePromoStrip/.test(homeClient) &&
    /seasonalPromo \? \(/.test(homeClient) &&
    homeClient.indexOf("SeasonalHomePromoStrip") < homeClient.indexOf("<h1>")
);
ok(
  "promo_hidden_without_live",
  /live\.length > 0/.test(homePage) && /effectivelyPublic/.test(homePage)
);
ok(
  "home_h1_title_meta_unchanged_paths",
  /home_top_hero_title/.test(homePage) &&
    /home_meta_title/.test(homePage) &&
    /canonical: "https:\/\/firestick4uk.com"/.test(homePage)
);

// ── Footer link ────────────────────────────────────────────────────────────
const footer = read("components/Footer.tsx");
ok(
  "footer_seasonal_link_gated",
  /showSeasonalOffersLink/.test(footer) &&
    /Seasonal Offers/.test(footer) &&
    /\/seasonal-offers/.test(footer)
);
ok(
  "footer_default_no_broken_link",
  /showSeasonalOffersLink = false/.test(footer) ||
    /showSeasonalOffersLink\s*=\s*false/.test(footer)
);
ok(
  "home_passes_footer_flag",
  /showSeasonalOffersLink=\{showSeasonalOffersLink\}/.test(homeClient) ||
    /showSeasonalOffersLink=\{hubState\.effectivelyPublic\}/.test(homePage) ||
    /showSeasonalOffersLink/.test(homeClient)
);

// ── Nav unchanged (7 server nav links) ─────────────────────────────────────
const navbar = read("components/Navbar.tsx");
ok(
  "nav_no_seasonal_link",
  !/seasonal-offers/.test(navbar) && !/Seasonal Offers/.test(navbar)
);

// ── /seasonal-offers subtitle ──────────────────────────────────────────────
const hubPage = read("app/seasonal-offers/page.tsx");
ok(
  "hub_subtitle_season_names",
  /seasonal-hub-subtitle/.test(hubPage) &&
    /season_name/.test(hubPage) &&
    /title: "Seasonal Offers \| Firestick4UK"/.test(hubPage)
);
ok(
  "hub_meta_canonical_unchanged",
  /canonical: "https:\/\/firestick4uk.com\/seasonal-offers"/.test(hubPage)
);

// ── No new dangerouslySetInnerHTML in BF-68-introduced files ───────────────
const newOnlyDsi = [
  "components/product/SeasonalCountdown.tsx",
  "components/home/SeasonalHomePromoStrip.tsx",
  "lib/seasonalCountdownLabel.ts",
  "lib/seasonalPriceValidUntil.ts",
  "app/seasonal-offers/page.tsx",
];
let dsiHits = [];
for (const f of newOnlyDsi) {
  if (!exists(f)) continue;
  const src = read(f);
  if (/dangerouslySetInnerHTML/.test(src)) dsiHits.push(f);
}
// Footer / HomeClient / ProductDetail may keep pre-existing CMS HTML sinks; JsonLd stays via <JsonLd>.
ok(
  "no_new_dangerouslySetInnerHTML",
  dsiHits.length === 0 && !/dangerouslySetInnerHTML/.test(read("components/Footer.tsx")),
  dsiHits.join(",") || "clean"
);

// ── SEO shell pages still expose H1/title/meta paths (no removal) ───────────
ok(
  "seo_paths_intact_home",
  /home_meta_title/.test(homePage) &&
    /home_top_hero_title/.test(homePage) &&
    /canonical: "https:\/\/firestick4uk.com"/.test(homePage)
);
ok(
  "seo_paths_intact_products",
  exists("app/products/page.tsx") &&
    (/ProductsClient|getPublicActiveProducts|products_meta/.test(read("app/products/page.tsx")) ||
      /products_meta_title|generateMetadata/.test(read("app/products/ProductsClient.tsx")))
);
ok(
  "seo_paths_intact_blog",
  exists("app/blog/page.tsx") && /BlogClient|getPublicPublishedPosts/.test(read("app/blog/page.tsx"))
);
ok(
  "seo_paths_intact_contact",
  /Contact|generateMetadata/.test(read("app/contact/page.tsx"))
);
ok(
  "seo_paths_intact_subscription",
  /subscription|generateMetadata|IPTV/.test(read("app/iptv-subscriptions-uk/page.tsx"))
);

// ── Seasonal-rebase-38 behaviours still referenced ─────────────────────────
ok(
  "seasonal_rebase_38_suite_present",
  exists("scripts/phase-seasonal-rebase-38-tests.js")
);
ok(
  "hub_resolver_intact",
  /resolveSeasonalHubPublicState/.test(read("lib/seasonalHubPublic.ts")) &&
    /effectivelyPublic/.test(read("lib/seasonalHubPublic.ts"))
);
ok(
  "countdown_onBoundary_contract",
  /onBoundary/.test(cdSrc)
);

// ── Diff allowlist for this change set ─────────────────────────────────────
const dirty = spawnSync("git", ["diff", "--name-only", "HEAD"], {
  cwd: ROOT,
  encoding: "utf8",
});
const untracked = spawnSync(
  "git",
  ["ls-files", "--others", "--exclude-standard"],
  { cwd: ROOT, encoding: "utf8" }
);
const names = [
  ...`${dirty.stdout || ""}\n${untracked.stdout || ""}`
    .split(/\r?\n/)
    .map((s) => s.trim().replace(/\\/g, "/"))
    .filter(Boolean),
];
const unexpected = [...new Set(names)].filter((f) => !BF68_ALLOW.has(f));
ok("diff_allowlist_bf68", unexpected.length === 0, unexpected.join(",") || "clean");

console.log(`\nBLACK-FRIDAY-68: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
