/**
 * F4UK-MULTI-155 — CMS-selectable seasonal promo bar styles (source assertions; no network).
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const BASE = "9e3e9e8055d832860f30bf60f231c390d8d8fbb8";

let passed = 0;
let failed = 0;

function ok(name, cond, detail) {
  if (cond) {
    passed++;
    console.log(`PASS  ${name}${detail ? " — " + detail : ""}`);
  } else {
    failed++;
    console.log(`FAIL  ${name}${detail ? " — " + detail : ""}`);
  }
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function main() {
  console.log("phase-multi-155-tests");
  console.log(`BASE=${BASE}`);

  // Load normalize via require of compiled-ish path: evaluate by reading + Function
  // Prefer requiring the TS via a tiny inline reimplementation check matching source.
  const styleSrc = read("lib/seasonalPromoStyle.ts");
  ok(
    "default_is_red_alert",
    /DEFAULT_SEASONAL_PROMO_STYLE:\s*SeasonalPromoStyle\s*=\s*"red-alert"/.test(
      styleSrc
    )
  );

  // Evaluate normalize by extracting — use node to require after transpile? Instead
  // spawn a one-liner that imports via ts-node is forbidden. Re-implement mirror assert
  // by running the function body extracted from source with vm after stripping types.
  const vm = require("vm");
  const stripped = styleSrc
    .replace(/export type[\s\S]*?;\n/, "")
    .replace(/export const/g, "const")
    .replace(/export function/g, "function")
    .replace(/:\s*SeasonalPromoStyle/g, "")
    .replace(/:\s*unknown/g, "")
    .replace(/as const/g, "");
  const sandbox = { module: { exports: {} }, exports: {} };
  vm.runInNewContext(
    stripped +
      "\nmodule.exports = { normalizeSeasonalPromoStyle, DEFAULT_SEASONAL_PROMO_STYLE, SEASONAL_PROMO_STYLE_OPTIONS };",
    sandbox
  );
  const {
    normalizeSeasonalPromoStyle,
    DEFAULT_SEASONAL_PROMO_STYLE,
    SEASONAL_PROMO_STYLE_OPTIONS,
  } = sandbox.module.exports;

  ok("default_const", DEFAULT_SEASONAL_PROMO_STYLE === "red-alert");
  const cases = [
    ["", "red-alert"],
    [undefined, "red-alert"],
    [null, "red-alert"],
    ["RED-ALERT ", "red-alert"],
    ["Classic", "classic"],
    ["black-friday", "black-friday"],
    ["timer-pulse", "timer-pulse"],
    ["neon", "red-alert"],
    [5, "red-alert"],
  ];
  for (const [raw, expected] of cases) {
    ok(
      `normalize_${String(raw)}`,
      normalizeSeasonalPromoStyle(raw) === expected,
      `${JSON.stringify(raw)} → ${normalizeSeasonalPromoStyle(raw)}`
    );
  }

  ok("options_length_4", SEASONAL_PROMO_STYLE_OPTIONS.length === 4);
  ok(
    "options_order_labels",
    SEASONAL_PROMO_STYLE_OPTIONS[0].value === "classic" &&
      SEASONAL_PROMO_STYLE_OPTIONS[0].label === "Brand Purple (Classic)" &&
      SEASONAL_PROMO_STYLE_OPTIONS[1].value === "red-alert" &&
      SEASONAL_PROMO_STYLE_OPTIONS[1].label === "Red Alert (Blinking)" &&
      SEASONAL_PROMO_STYLE_OPTIONS[2].value === "black-friday" &&
      SEASONAL_PROMO_STYLE_OPTIONS[2].label ===
        "Black Friday (Black + Amber)" &&
      SEASONAL_PROMO_STYLE_OPTIONS[3].value === "timer-pulse" &&
      SEASONAL_PROMO_STYLE_OPTIONS[3].label === "Purple + Red Timer (Pulse)"
  );

  const strip = read("components/home/SeasonalHomePromoStrip.tsx");
  ok("token_classic_bar", /classic:[\s\S]*?barBg:\s*"#4C1D95"/.test(strip));
  ok("token_classic_pill", /classic:[\s\S]*?pillBg:\s*"rgba\(255,255,255,0\.22\)"/.test(strip));
  ok("token_red_alert_bar", /"red-alert":[\s\S]*?barBg:\s*"#C81E1E"/.test(strip));
  ok("token_red_alert_pill", /"red-alert":[\s\S]*?pillBg:\s*"#FFFFFF"[\s\S]*?pillColor:\s*"#B91C1C"/.test(strip));
  ok("token_bf_bar", /"black-friday":[\s\S]*?barBg:\s*"#111111"/.test(strip));
  ok("token_bf_pill", /"black-friday":[\s\S]*?pillBg:\s*"#FBBF24"[\s\S]*?pillColor:\s*"#111111"/.test(strip));
  ok("token_bf_cta", /"black-friday":[\s\S]*?ctaColor:\s*"#FBBF24"/.test(strip));
  ok("token_timer_bar", /"timer-pulse":[\s\S]*?barBg:\s*"#4C1D95"/.test(strip));
  ok("token_timer_pill", /"timer-pulse":[\s\S]*?pillBg:\s*"#DC2626"/.test(strip));
  ok("hex_4C1D95_present", /#4C1D95/.test(strip));
  ok("hex_FFFFFF_present", /#FFFFFF/.test(strip));
  ok(
    "blink_keyframes",
    /@keyframes f4ukPromoBlink/.test(strip) &&
      /1s steps\(1,end\) 0s 5/.test(strip)
  );
  ok(
    "reduced_motion_both",
    /@media \(prefers-reduced-motion: reduce\)/.test(strip) &&
      /seasonal-home-promo-bar--red-alert/.test(strip) &&
      /seasonal-home-promo-bar--timer-pulse \[data-testid="seasonal-home-promo-countdown"\]/.test(
        strip
      )
  );
  const keyframesBlocks = strip.match(/@keyframes[\s\S]*?\}[\s\S]*?\}/g) || [];
  ok(
    "no_opacity_in_keyframes",
    keyframesBlocks.every((b) => !/opacity/i.test(b))
  );
  ok(
    "testids_role_aria_live",
    /data-testid="seasonal-home-promo-countdown"/.test(strip) &&
      /role="timer"/.test(strip) &&
      /aria-live="off"/.test(strip) &&
      /data-testid="seasonal-home-promo-cta"/.test(strip)
  );
  ok("height_44", /HOME_PROMO_BAR_HEIGHT_PX\s*=\s*44/.test(strip));
  ok("nav_offset_80", /HOME_NAV_OFFSET_PX\s*=\s*80/.test(strip));

  const page = read("app/page.tsx");
  const basePage =
    spawnSync("git", ["show", `${BASE}:app/page.tsx`], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    }).stdout || "";
  ok("page_in_list", /'seasonal_promo_style'/.test(page));
  ok("page_normalize_used", /normalizeSeasonalPromoStyle\(content\.seasonal_promo_style\)/.test(page));

  function extractExpr(src, key) {
    // Pull the seasonalPromo = { ... } block expressions for text/cta/href/endsAt
    const m = src.match(
      /seasonalPromo\s*=\s*\{([\s\S]*?)\n\s*\};/
    );
    if (!m) return null;
    const block = m[1];
    const re = new RegExp(
      key === "text"
        ? /text:\s*applySeasonalPromoText\(\s*content\.seasonal_promo_text,\s*earliest\?\.seasonName\s*\)/
        : key === "cta"
          ? /cta:\s*content\.seasonal_promo_cta\?\.trim\(\)\s*\|\|\s*DEFAULT_SEASONAL_PROMO_CTA/
          : key === "href"
            ? /href,/
            : /endsAt:\s*earliest\?\.endRaw\s*\?\?\s*null/
    );
    const hit = block.match(re);
    return hit ? hit[0].replace(/\s+/g, " ").trim() : null;
  }
  for (const key of ["text", "cta", "href", "endsAt"]) {
    const a = extractExpr(page, key);
    const b = extractExpr(basePage, key);
    ok(`page_${key}_byte_identical`, !!a && a === b, a === b ? "ok" : `${a} vs ${b}`);
  }

  const fields = read("lib/adminContentFields.ts");
  ok(
    "admin_field_select",
    /key:\s*"seasonal_promo_style"/.test(fields) &&
      /type:\s*"select"/.test(fields) &&
      /options:\s*SEASONAL_PROMO_STYLE_OPTIONS/.test(fields)
  );
  const ctaIdx = fields.indexOf('key: "seasonal_promo_cta"');
  const styleIdx = fields.indexOf('key: "seasonal_promo_style"');
  ok("field_after_cta", ctaIdx >= 0 && styleIdx > ctaIdx);

  const panel = read("components/admin/AdminContentPanel.tsx");
  ok(
    "panel_select_branch",
    /field\.type === "select"/.test(panel) &&
      /Default \(Red Alert \(Blinking\)\)/.test(panel)
  );

  const allowed = new Set([
    "lib/seasonalPromoStyle.ts",
    "components/home/SeasonalHomePromoStrip.tsx",
    "app/HomeClient.tsx",
    "app/page.tsx",
    "lib/adminContentFields.ts",
    "components/admin/AdminContentPanel.tsx",
    "scripts/phase-multi-155-tests.js",
    // F4UK-MULTI-156: polish batch C
    "app/cart/page.tsx",
    "app/products/ProductsClient.tsx",
    "app/contact/page.tsx",
    "app/HomeClient.tsx",
    "app/order-tracking/page.tsx",
    "app/products/[slug]/ProductDetail.tsx",
    "app/blog/[slug]/BlogPostClient.tsx",
    "scripts/phase-multi-156-tests.js",
  ]);
  const phaseTestRe = /^scripts\/phase-[a-z0-9-]+-tests\.js$/;

  const diff = spawnSync("git", ["diff", "--name-only", `${BASE}..HEAD`], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const unstaged = spawnSync("git", ["diff", "--name-only"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const staged = spawnSync("git", ["diff", "--name-only", "--cached"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const untracked = spawnSync(
    "git",
    ["ls-files", "--others", "--exclude-standard"],
    { cwd: ROOT, encoding: "utf8" }
  );

  ok(
    "git_commands_ok",
    diff.status === 0 &&
      unstaged.status === 0 &&
      staged.status === 0 &&
      untracked.status === 0
  );

  const names = new Set(
    [diff.stdout, unstaged.stdout, staged.stdout, untracked.stdout]
      .join("\n")
      .split(/\r?\n/)
      .map((s) => s.trim().replace(/\\/g, "/"))
      .filter(Boolean)
  );

  const bad = [...names].filter((n) => !allowed.has(n) && !phaseTestRe.test(n));
  ok("scope_guard", bad.length === 0, bad.length ? bad.join(",") : "ok");

  console.log(`\nMULTI-155 results: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main();
