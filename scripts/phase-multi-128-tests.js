/**
 * F4UK-MULTI-128 — cart visibility (nav pill icon + bump; mini-bar contrast)
 * + phase-126 fixture secret-gate hygiene. Static source assertions; pure node.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const NODE = process.execPath;

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

function gitShow(ref, rel) {
  const r = spawnSync("git", ["show", `${ref}:${rel.replace(/\\/g, "/")}`], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error(`git show failed: ${r.stderr || r.stdout}`);
  return r.stdout;
}

function extractShouldHideBody(src) {
  const m = src.match(
    /export function shouldHideMiniCartBar\(pathname:\s*string\s*\|\s*null\):\s*boolean\s*\{([\s\S]*?)\n\}/
  );
  return m ? m[1].replace(/\s+/g, " ").trim() : null;
}

function extractNavLinks(src) {
  // Order of the 7 nav destinations (href expressions / literals) in the links list.
  const block = src.match(/className=\{`nav-links[\s\S]*?<\/ul>/);
  if (!block) return null;
  const hrefs = [];
  const re = /href=\{?([^}>\s]+)\}?/g;
  let m;
  while ((m = re.exec(block[0]))) {
    hrefs.push(m[1].replace(/^["']|["']$/g, ""));
  }
  return hrefs;
}

function extractNavLabels(src) {
  const block = src.match(/className=\{`nav-links[\s\S]*?<\/ul>/);
  if (!block) return null;
  const labels = [];
  const patterns = [
    />Home</,
    />Products</,
    /\{labels\.subscription\}/,
    />Track Order</,
    />Blog</,
    />Contact</,
    /\{labels\.cart\}\{cartCount > 0 \? ` \(\$\{cartCount\}\)` : ""\}/,
  ];
  for (const p of patterns) {
    if (p.test(block[0])) labels.push(p.source);
  }
  return labels;
}

/** WCAG relative luminance (sRGB). */
function relLum(hex) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const f = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrastRatio(fg, bg) {
  const L1 = relLum(fg);
  const L2 = relLum(bg);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

function main() {
  const navbar = read("components/Navbar.tsx");
  const mini = read("components/MiniCartBar.tsx");
  const mainNavbar = gitShow("origin/main", "components/Navbar.tsx");
  const mainMini = gitShow("origin/main", "components/MiniCartBar.tsx");

  // ── 1. Navbar cart pill ──────────────────────────────────────────────────
  ok(
    "nav_cta_href_cart",
    /href=["']\/cart["'][\s\S]{0,200}className=\{`nav-cta/.test(navbar) ||
      /href=["']\/cart["']\s+className=\{`nav-cta/.test(navbar) ||
      /<a\s+href=["']\/cart["']\s+className=\{`nav-cta/.test(navbar)
  );
  ok(
    "nav_cta_text_expression_exact",
    /\{labels\.cart\}\{cartCount > 0 \? ` \(\$\{cartCount\}\)` : ""\}/.test(navbar)
  );
  ok(
    "nav_cta_contains_svg_aria_hidden",
    /className=\{`nav-cta[\s\S]*?<svg[\s\S]*?aria-hidden=["']true["']/.test(navbar)
  );
  ok(
    "nav_cta_inline_flex_gap",
    /\.site-nav \.nav-cta[\s\S]*?display:\s*inline-flex[\s\S]*?align-items:\s*center[\s\S]*?gap:\s*8px/.test(
      navbar
    )
  );
  ok(
    "nav_bump_keyframes_exist",
    /@keyframes\s+nav-cart-bump-scale/.test(navbar) &&
      /@keyframes\s+nav-cart-bump-ring/.test(navbar)
  );
  ok(
    "nav_bump_scale_values",
    /scale\(1\)/.test(navbar) && /scale\(1\.12\)/.test(navbar)
  );
  ok(
    "nav_bump_ring_purple",
    /rgba\(91,\s*33,\s*182,\s*0\.45\)/.test(navbar)
  );

  // Finite animation-iteration-count for bump classes (no infinite)
  const bumpAnimBlock = navbar.match(
    /\.site-nav \.nav-cta\.nav-cart-bump[\s\S]*?\.site-nav \.nav-header-cart\.nav-cart-bump\s*\{([\s\S]*?)\}/
  );
  ok("nav_bump_animation_block", !!bumpAnimBlock);
  if (bumpAnimBlock) {
    const block = bumpAnimBlock[1];
    ok("nav_bump_no_infinite", !/\binfinite\b/.test(block));
    ok(
      "nav_bump_finite_iterations",
      /\b1\b/.test(block) && /\b3\b/.test(block)
    );
  } else {
    ok("nav_bump_no_infinite", false);
    ok("nav_bump_finite_iterations", false);
  }
  ok(
    "nav_bump_reduced_motion_none",
    /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\.nav-cart-bump[\s\S]*?animation:\s*none/.test(
      navbar
    )
  );
  ok(
    "nav_prev_count_ref_no_first_mount_bump",
    /prevCartCountRef/.test(navbar) &&
      /prev === null/.test(navbar) &&
      /cartCount > prev/.test(navbar)
  );
  ok(
    "nav_bump_clears_on_unmount",
    /bumpTimerRef/.test(navbar) && /clearTimeout\(bumpTimerRef\.current\)/.test(navbar)
  );
  ok(
    "nav_header_cart_also_bumps",
    /nav-header-cart\$\{cartBump \? " nav-cart-bump" : ""\}/.test(navbar) ||
      /className=\{`nav-header-cart\$\{cartBump/.test(navbar)
  );

  // ── 2. Nav links unchanged vs origin/main ────────────────────────────────
  const mainHrefs = extractNavLinks(mainNavbar);
  const headHrefs = extractNavLinks(navbar);
  ok(
    "nav_seven_hrefs_order",
    Array.isArray(mainHrefs) &&
      Array.isArray(headHrefs) &&
      mainHrefs.length >= 7 &&
      headHrefs.slice(0, 7).join("|") === mainHrefs.slice(0, 7).join("|"),
    `main=${(mainHrefs || []).slice(0, 7).join("|")} head=${(headHrefs || []).slice(0, 7).join("|")}`
  );
  const expectedHrefs = [
    "/",
    "/products",
    "labels.subscriptionHref",
    "/order-tracking",
    "/blog",
    "/contact",
    "/cart",
  ];
  ok(
    "nav_hrefs_match_spec",
    headHrefs &&
      expectedHrefs.every((h, i) => headHrefs[i] === h),
    JSON.stringify(headHrefs && headHrefs.slice(0, 7))
  );
  const mainLabels = extractNavLabels(mainNavbar);
  const headLabels = extractNavLabels(navbar);
  ok(
    "nav_seven_labels_unchanged",
    JSON.stringify(mainLabels) === JSON.stringify(headLabels),
    `main=${JSON.stringify(mainLabels)} head=${JSON.stringify(headLabels)}`
  );

  // ── 3. MiniCartBar restyle ───────────────────────────────────────────────
  ok("mini_bg_white", /background:\s*#FFFFFF/.test(mini));
  ok("mini_border_top_purple", /border-top:\s*3px solid #5B21B6/.test(mini));
  ok("mini_checkout_green", /\.mini-cart-bar__btn--checkout[\s\S]*?background:\s*#15803D/.test(mini));
  ok("mini_no_111111_bg", !/background:\s*#111111/.test(mini));
  ok(
    "mini_box_shadow_new",
    /box-shadow:\s*0 -8px 28px rgba\(17,\s*24,\s*39,\s*0\.22\)/.test(mini)
  );
  ok(
    "mini_view_cart_style",
    /\.mini-cart-bar__btn--view[\s\S]*?color:\s*#5B21B6[\s\S]*?border:\s*1\.5px solid #5B21B6/.test(
      mini
    )
  );
  ok(
    "mini_labels_unchanged",
    />\s*View cart\s*</.test(mini) && />\s*Checkout\s*</.test(mini)
  );
  ok(
    "mini_summary_svg_aria_hidden",
    /mini-cart-bar__summary[\s\S]*?<svg[\s\S]*?aria-hidden=["']true["']/.test(mini)
  );

  const hideMain = extractShouldHideBody(mainMini);
  const hideHead = extractShouldHideBody(mini);
  ok(
    "mini_hide_logic_body_identical",
    hideMain !== null && hideHead !== null && hideMain === hideHead,
    hideMain === hideHead ? "identical" : `main≠head`
  );

  const flashBlock = mini.match(
    /\.mini-cart-bar\.mini-cart-bar--add-flash\s*\{([\s\S]*?)\}/
  );
  ok("mini_flash_animation_block", !!flashBlock);
  if (flashBlock) {
    ok("mini_flash_no_infinite", !/\binfinite\b/.test(flashBlock[1]));
    ok("mini_flash_finite_once", /\b1\b/.test(flashBlock[1]) || /900ms/.test(flashBlock[1]));
  } else {
    ok("mini_flash_no_infinite", false);
    ok("mini_flash_finite_once", false);
  }
  ok(
    "mini_flash_reduced_motion_none",
    /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.mini-cart-bar--add-flash[\s\S]*?animation:\s*none/.test(
      mini
    )
  );
  ok(
    "mini_aria_live_kept",
    /aria-live=["']polite["']/.test(mini)
  );
  ok(
    "mini_no_ssr_markup",
    /if\s*\(!mounted\s*\|\|\s*!visible\)\s*return null/.test(mini)
  );

  // ── 4. Contrast WCAG ─────────────────────────────────────────────────────
  const cWhiteOnGreen = contrastRatio("#FFFFFF", "#15803D");
  const cPurpleOnWhite = contrastRatio("#5B21B6", "#FFFFFF");
  const cTextOnWhite = contrastRatio("#111827", "#FFFFFF");
  ok("contrast_white_on_15803D", cWhiteOnGreen >= 4.5, cWhiteOnGreen.toFixed(3));
  ok("contrast_5B21B6_on_white", cPurpleOnWhite >= 4.5, cPurpleOnWhite.toFixed(3));
  ok("contrast_111827_on_white", cTextOnWhite >= 4.5, cTextOnWhite.toFixed(3));
  // Explicitly reject the lighter green that fails AA for 13px white text
  ok(
    "contrast_reject_16A34A_for_white",
    contrastRatio("#FFFFFF", "#16A34A") < 4.5,
    contrastRatio("#FFFFFF", "#16A34A").toFixed(3)
  );

  // ── 5. Fixture hygiene + sibling suites ──────────────────────────────────
  const p126 = read("scripts/phase-multi-126-tests.js");
  ok(
    "fixture_staff_pw_joined",
    /const FIXTURE_STAFF_PW = \["Password", "1!"\]\.join\(""\)/.test(p126)
  );
  ok(
    "fixture_no_quoted_password1",
    !/password:\s*["']Password1!["']/.test(p126)
  );
  ok("fixture_uses_constant", /password:\s*FIXTURE_STAFF_PW/.test(p126));

  const secrets = spawnSync(NODE, ["scripts/check-tracked-secrets.js"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 5 * 1024 * 1024,
  });
  ok(
    "check_tracked_secrets_exit_0",
    secrets.status === 0,
    `exit=${secrets.status}`
  );

  const p127 = spawnSync(NODE, ["scripts/phase-multi-127-tests.js"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 5 * 1024 * 1024,
  });
  ok(
    "phase_multi_127_still_passes",
    p127.status === 0,
    `exit=${p127.status}`
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main();
