/**
 * F4UK-MULTI-153 — UX fix batch B (source assertions; no network).
 * Mobile checkout overflow, offer thumb a11y, tap targets.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const BASE = "0c66edc0a05e26d479a66d1d3768c5d9324db762";

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

function gitShow(revPath) {
  const r = spawnSync("git", ["show", revPath], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (r.status !== 0) return null;
  return r.stdout || "";
}

function extractCatBtnBase(src) {
  // First .cat-btn { ... } rule only (base, not media-query overrides)
  const m = src.match(/\.cat-btn \{[^}]+\}/);
  return m ? m[0] : null;
}

function main() {
  console.log("phase-multi-153-tests");
  console.log(`BASE=${BASE}`);

  const cart = read("app/cart/page.tsx");
  const offers = read("components/product/CurrentSeasonalOffers.tsx");
  const hero = read("components/HeroSlider.tsx");
  const faq = read("app/faq/FAQClient.tsx");
  const blog = read("app/blog/BlogClient.tsx");

  // --- UXB-01 cart ---
  ok(
    "cart_no_inline_1fr_1fr",
    !/gridTemplateColumns\s*:\s*["']1fr 1fr["']/.test(cart)
  );
  ok(
    "cart_has_checkout_city_row_class",
    /className\s*=\s*["']checkout-city-row["']/.test(cart)
  );
  ok(
    "cart_city_row_minmax_rules",
    /\.checkout-city-row\s*\{\s*display\s*:\s*grid\s*;\s*grid-template-columns\s*:\s*minmax\(0,\s*1fr\)\s+minmax\(0,\s*1fr\)\s*;\s*gap\s*:\s*14px\s*;\s*\}/.test(
      cart
    ) && /\.checkout-city-row input\s*\{\s*min-width\s*:\s*0\s*;\s*\}/.test(cart)
  );
  ok(
    "cart_mobile_checkout_grid_minmax",
    /@media\s*\(\s*max-width\s*:\s*900px\s*\)\s*\{[\s\S]*?\.checkout-grid\s*\{\s*grid-template-columns\s*:\s*minmax\(0,\s*1fr\)\s*;\s*\}/.test(
      cart
    )
  );
  ok(
    "cart_mobile_cart_layout_minmax",
    /@media\s*\(\s*max-width\s*:\s*900px\s*\)\s*\{[\s\S]*?\.cart-layout\s*\{\s*grid-template-columns\s*:\s*minmax\(0,\s*1fr\)\s*;\s*padding\s*:\s*0 24px 60px\s*;\s*\}/.test(
      cart
    )
  );
  ok(
    "cart_desktop_checkout_grid_unchanged",
    /\.checkout-grid\s*\{\s*display\s*:\s*grid\s*;\s*grid-template-columns\s*:\s*1fr 1fr\s*;\s*gap\s*:\s*28px\s*;\s*\}/.test(
      cart
    )
  );
  ok(
    "cart_desktop_cart_layout_unchanged",
    /\.cart-layout\s*\{[^}]*grid-template-columns\s*:\s*1fr 380px\s*;/.test(cart)
  );
  ok(
    "cart_min_width_0_children",
    /\.checkout-grid\s*>\s*\*\s*,\s*\.cart-layout\s*>\s*\*\s*\{\s*min-width\s*:\s*0\s*;\s*\}/.test(
      cart
    )
  );
  ok(
    "cart_city_id_autocomplete",
    /id\s*=\s*["']checkout-city["']/.test(cart) &&
      /autoComplete\s*=\s*["']address-level2["']/.test(cart)
  );
  ok(
    "cart_postcode_id_autocomplete",
    /id\s*=\s*["']checkout-postcode["']/.test(cart) &&
      /autoComplete\s*=\s*["']postal-code["']/.test(cart)
  );
  ok(
    "cart_city_row_360_stack",
    /@media\s*\(\s*max-width\s*:\s*360px\s*\)\s*\{\s*\.checkout-city-row\s*\{\s*grid-template-columns\s*:\s*minmax\(0,\s*1fr\)\s*;\s*gap\s*:\s*0\s*;\s*\}\s*\}/.test(
      cart
    )
  );

  // --- UXB-02 offers ---
  ok(
    "offers_thumb_aria_hidden_tabindex",
    /<a\s+href=\{href\}\s+style=\{\{\s*flexShrink:\s*0\s*\}\}\s+aria-hidden=["']true["']\s+tabIndex=\{-1\}/.test(
      offers
    )
  );
  ok("offers_alt_empty_present", /alt\s*=\s*["']["']/.test(offers));
  ok(
    "offers_href_expression_unchanged",
    /href=\{href\}/.test(offers)
  );

  // --- UXB-03 hero ---
  // Slice from the 640px media query to the closing of the <style> block.
  const mobileStart = hero.search(/@media\s*\(\s*max-width\s*:\s*640px\s*\)/);
  const styleEnd = hero.indexOf("</style>");
  const mobile =
    mobileStart >= 0 && styleEnd > mobileStart
      ? hero.slice(mobileStart, styleEnd)
      : "";
  ok("hero_mobile_block_present", mobile.includes("@media (max-width: 640px)"));
  ok(
    "hero_mobile_dot_44",
    /\.hero-slider-dot\s*\{[\s\S]*?width\s*:\s*44px\s*;[\s\S]*?height\s*:\s*44px\s*;/.test(
      mobile
    )
  );
  ok(
    "hero_mobile_before_14",
    /\.hero-slider-dot::before\s*\{[\s\S]*?width\s*:\s*14px\s*;[\s\S]*?height\s*:\s*14px\s*;/.test(
      mobile
    )
  );
  ok(
    "hero_mobile_active_before",
    /\.hero-slider-dot\.active::before\s*\{[\s\S]*?background\s*:\s*#FFFFFF\s*;/.test(
      mobile
    )
  );
  ok(
    "hero_desktop_dot_10px_unchanged",
    /\.hero-slider-dot\s*\{\s*width\s*:\s*10px\s*;\s*height\s*:\s*10px\s*;/.test(
      hero
    )
  );
  ok(
    "hero_aria_go_to_slide",
    /aria-label=\{`Go to slide \$\{i \+ 1\}`\}/.test(hero)
  );

  // --- UXB-04 cat-btn ---
  ok(
    "faq_cat_btn_min_height_44",
    /@media\s*\(\s*max-width\s*:\s*640px\s*\)\s*\{\s*\.cat-btn\s*\{\s*min-height\s*:\s*44px\s*;\s*\}\s*\}/.test(
      faq
    )
  );
  ok(
    "blog_cat_btn_min_height_44",
    /@media\s*\(\s*max-width\s*:\s*640px\s*\)\s*\{\s*\.cat-btn\s*\{\s*min-height\s*:\s*44px\s*;\s*\}\s*\}/.test(
      blog
    )
  );

  const faqBaseOld = extractCatBtnBase(
    gitShow(`${BASE}:app/faq/FAQClient.tsx`) || ""
  );
  const faqBaseNew = extractCatBtnBase(faq);
  ok(
    "faq_base_cat_btn_byte_identical",
    !!faqBaseOld && faqBaseOld === faqBaseNew,
    faqBaseOld === faqBaseNew ? "identical" : "mismatch"
  );

  const blogBaseOld = extractCatBtnBase(
    gitShow(`${BASE}:app/blog/BlogClient.tsx`) || ""
  );
  const blogBaseNew = extractCatBtnBase(blog);
  ok(
    "blog_base_cat_btn_byte_identical",
    !!blogBaseOld && blogBaseOld === blogBaseNew,
    blogBaseOld === blogBaseNew ? "identical" : "mismatch"
  );

  // --- Scope guard ---
  const allowed = new Set([
    "app/cart/page.tsx",
    "components/product/CurrentSeasonalOffers.tsx",
    "components/HeroSlider.tsx",
    "app/faq/FAQClient.tsx",
    "app/blog/BlogClient.tsx",
    "scripts/phase-multi-153-tests.js",
    // F4UK-MULTI-154: hero active-dot hotfix
    "components/HeroSlider.tsx",
    "scripts/phase-multi-154-tests.js",
    // F4UK-MULTI-155: promo bar styles
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
    // F4UK-MULTI-157: contrast batch D
    "app/globals.css",
    "app/faq/FAQClient.tsx",
    "app/order-tracking/page.tsx",
    "app/cart/page.tsx",
    "app/cart/success/page.tsx",
    "app/blog/BlogClient.tsx",
    "app/blog/[slug]/BlogPostClient.tsx",
    "app/about/page.tsx",
    "app/products/[slug]/ProductDetail.tsx",
    "app/products/ProductsClient.tsx",
    "app/HomeClient.tsx",
    "app/contact/page.tsx",
    "scripts/phase-multi-157-tests.js",
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

  // Scope: committed+working tree vs BASE must be ⊆ approved (+ phase allowlist widens)
  const bad = [...names].filter((n) => !allowed.has(n) && !phaseTestRe.test(n));
  ok("scope_guard", bad.length === 0, bad.length ? bad.join(",") : "ok");

  console.log(`\nMULTI-153 results: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main();
