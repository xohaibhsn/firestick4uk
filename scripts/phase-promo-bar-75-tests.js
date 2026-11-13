/**
 * F4UK-PROMO-BAR-75 — slim clickable seasonal announcement bar below navbar.
 * Static + pure helpers only. No .env*, no real DB, no network.
 *
 * Older-suite edits (list each):
 *  - phase-black-friday-68-tests.js (promo link target, CMS default text, hero guard)
 *  - phase-seasonal-ux-72-tests.js (working-tree allowlist: strip + promo-bar-75 suite)
 */
"use strict";

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

const strip = read("components/home/SeasonalHomePromoStrip.tsx");
const homePage = read("app/page.tsx");
const homeClient = read("app/HomeClient.tsx");
const defaults = read("lib/siteContentDefaults.ts");
const label = loadTsModule("lib/seasonalCountdownLabel.ts");
const pdpCd = read("components/product/SeasonalCountdown.tsx");
const cardCd = read("components/product/SeasonalCardCountdown.tsx");
const navbar = read("components/Navbar.tsx");

// 1–2 compact countdown only (no big boxes in home bar)
ok(
  "bar_no_days_hrs_mins_secs_boxes",
  !/"DAYS"/.test(strip) &&
    !/"HRS"/.test(strip) &&
    !/"MINS"/.test(strip) &&
    !/"SECS"/.test(strip) &&
    !/SeasonalCountdown/.test(strip)
);
ok(
  "bar_uses_compact_hms_formatter",
  /formatSeasonalCompactHms/.test(strip) &&
    /useSharedSecondTicker/.test(strip) &&
    /data-testid="seasonal-home-promo-countdown"/.test(strip)
);

// 3 single whole-bar link
ok(
  "bar_single_anchor_link",
  /<a[\s\S]*data-testid="seasonal-home-promo"/.test(strip) &&
    (strip.match(/<a\b/g) || []).length === 1 &&
    !/<button/.test(strip)
);

// 4–5 target rule encoded in page.tsx
ok(
  "target_one_live_to_product_slug",
  /live\.length === 1/.test(homePage) &&
    /\/products\/\$\{/.test(homePage)
);
ok(
  "target_two_plus_to_seasonal_offers",
  /\/seasonal-offers/.test(homePage) &&
    /live\.length === 1/.test(homePage)
);

// 6 hidden with no live offers
ok(
  "hidden_without_live_offers",
  /live\.length > 0/.test(homePage) &&
    /effectivelyPublic/.test(homePage) &&
    /seasonalPromo = \{/.test(homePage)
);

// 7–9 {season} replacement + defaults only when empty
ok(
  "season_token_helper",
  typeof label.applySeasonalPromoText === "function" &&
    label.applySeasonalPromoText("{season} deal is live", "Black Friday") ===
      "Black Friday deal is live"
);
ok(
  "defaults_only_when_empty_text",
  label.DEFAULT_SEASONAL_PROMO_TEXT === "{season} deal is live" &&
    label.applySeasonalPromoText("", "Xmas") === "Xmas deal is live" &&
    label.applySeasonalPromoText("Custom {season} sale", "BF") ===
      "Custom BF sale" &&
    label.applySeasonalPromoText("Owner edit kept", "BF") === "Owner edit kept"
);
ok(
  "defaults_only_when_empty_cta_and_cms",
  label.DEFAULT_SEASONAL_PROMO_CTA === "Shop now" &&
    /\{season\} deal is live/.test(defaults) &&
    /Shop now/.test(defaults) &&
    /DEFAULT_SEASONAL_PROMO_CTA/.test(homePage) &&
    /applySeasonalPromoText/.test(homePage)
);

// 10–12 placement: fixed below navbar, offset, no white-gap spacer
ok(
  "bar_fixed_below_navbar",
  /position:\s*"fixed"/.test(strip) &&
    /HOME_NAV_OFFSET_PX/.test(strip) &&
    /top:\s*HOME_NAV_OFFSET_PX/.test(strip)
);
ok(
  "home_offset_accounts_for_nav_plus_bar",
  /page-wrapper--promo/.test(homeClient) &&
    /HOME_NAV_OFFSET_PX \+ HOME_PROMO_BAR_HEIGHT_PX/.test(homeClient) &&
    /promoActive/.test(homeClient)
);
ok(
  "no_in_flow_white_gap_spacer",
  /padding-top:\$\{HOME_NAV_OFFSET_PX\}px/.test(homeClient) &&
    !/flexBasis:\s*"100%"/.test(strip) &&
    /HOME_PROMO_BAR_HEIGHT_PX/.test(strip)
);

// 13 SSR — no client fetch
ok(
  "ssr_no_client_fetch",
  !/fetch\(/.test(strip) &&
    !/useEffect[\s\S]{0,80}fetch/.test(strip) &&
    /resolveSeasonalHubPublicState/.test(homePage)
);

// 14 aria-label
ok(
  "aria_label_opens_offer",
  /opens offer/.test(strip) && /aria-label=\{ariaLabel\}/.test(strip)
);

// 15 hide on countdown 0
ok(
  "hides_when_countdown_zero",
  /onEnded/.test(strip) &&
    /setHidden\(true\)/.test(strip) &&
    /remainingSec <= 0/.test(strip)
);

// 16 reserved height / CLS
ok(
  "reserved_height_no_cls",
  /HOME_PROMO_BAR_HEIGHT_PX\s*=\s*44/.test(strip) &&
    /minHeight:\s*HOME_PROMO_BAR_HEIGHT_PX/.test(strip) &&
    /height:\s*HOME_PROMO_BAR_HEIGHT_PX/.test(strip)
);

// 17–18 compact formatter pure checks
ok(
  "compact_hms_hide_zero_days",
  label.formatSeasonalCompactHms(3 * 3600 + 5 * 60 + 9) === "03:05:09" &&
    !/0d/.test(label.formatSeasonalCompactHms(59))
);
ok(
  "compact_hms_with_days",
  label.formatSeasonalCompactHms(18 * 86400 + 3 * 3600 + 12 * 60 + 45) ===
    "18d 03:12:45"
);

// 19 focus ring
ok(
  "visible_focus_ring",
  /focus-visible/.test(strip) && /outline/.test(strip)
);

// 20 purple / white contrast surface
ok(
  "purple_bg_white_text",
  /#4C1D95/.test(strip) && /#FFFFFF/.test(strip)
);

// 21–22 no SEO / nav / H1 / metadata change
ok(
  "seo_home_paths_unchanged",
  /home_meta_title/.test(homePage) &&
    /home_top_hero_title/.test(homePage) &&
    /canonical: "https:\/\/firestick4uk.com"/.test(homePage) &&
    homeClient.indexOf("SeasonalHomePromoStrip") < homeClient.indexOf("<h1>")
);
ok(
  "nav_unchanged_no_seasonal_link",
  !/seasonal-offers/.test(navbar) && !/Seasonal Offers/.test(navbar)
);

// 23–24 PDP big boxes + card pills unchanged
ok(
  "pdp_countdown_boxes_unchanged",
  /"DAYS"/.test(pdpCd) &&
    /"HRS"/.test(pdpCd) &&
    /"MINS"/.test(pdpCd) &&
    /"SECS"/.test(pdpCd) &&
    /data-testid="seasonal-countdown"/.test(pdpCd)
);
ok(
  "card_countdown_pill_unchanged",
  /formatSeasonalCardCountdown/.test(cardCd) &&
    /data-testid="seasonal-card-countdown"/.test(cardCd) &&
    /useSharedSecondTicker/.test(cardCd)
);

// 25 bar above hero, not inside H1
ok(
  "bar_above_hero_not_in_h1",
  /SeasonalHomePromoStrip/.test(homeClient) &&
    homeClient.indexOf("SeasonalHomePromoStrip") < homeClient.indexOf("<h1>") &&
    /HeroSlider/.test(homeClient)
);

console.log(`\npromo-bar-75: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
