/**
 * F4UK-MULTI-157 — contrast batch D (source assertions; no network).
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const BASE = "bb328cc4c443b4d5bc5270b22571c7a6540de960";

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

function gitShow(sha, rel) {
  const r = spawnSync("git", ["show", `${sha}:${rel}`], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  return r.status === 0 ? r.stdout : "";
}

function extractTKeys(src) {
  const keys = [];
  const re = /\bt\(\s*["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(src))) keys.push(m[1]);
  return keys.sort();
}

function extractHrefs(src) {
  const keys = [];
  const re = /\bhref\s*=\s*(?:\{([^}]*)\}|"([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(src))) {
    keys.push((m[1] || m[2] || m[3] || "").replace(/\s+/g, " ").trim());
  }
  return keys.sort();
}

function extractLayoutDecls(src) {
  const keys = [];
  const re = /(font-size|padding|margin|margin-top|margin-bottom|margin-left|margin-right|padding-top|padding-bottom|padding-left|padding-right|width|height|min-height|min-width|max-width|max-height)\s*:\s*([^;}\n]+)/gi;
  let m;
  while ((m = re.exec(src))) keys.push(m[1].toLowerCase() + ":" + m[2].trim());
  return keys.sort();
}

function sameMultiset(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

const APPROVED_APP = [
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
];

function main() {
  console.log("phase-multi-157-tests");
  console.log(`BASE=${BASE}`);

  const globals = read("app/globals.css");
  const globalsBase = gitShow(BASE, "app/globals.css");
  ok("globals_append_only_prefix", globals.startsWith(globalsBase) && globals.length > globalsBase.length);
  const append = globals.slice(globalsBase.length);
  ok(
    "globals_append_block_selectors",
    /\/\* F4UK-MULTI-157: headings on dark surfaces \*\//.test(append) &&
      /html body \.help-box \.help-title/.test(append) &&
      /html body \.help-card \.help-text h4/.test(append) &&
      /html body \.cta-band \.cta-box h2/.test(append) &&
      (append.match(/#FFFFFF !important/g) || []).length >= 2
  );

  const faq = read("app/faq/FAQClient.tsx");
  ok("faq_help_sub_b3", /html body \.help-box \.help-sub\s*\{\s*color:#B3B3B3 !important/.test(faq));
  ok("faq_help_sub_old_gone", !/\.help-sub\s*\{\s*color:rgba\(255,255,255,0\.7\)/.test(faq));
  ok("faq_telegram_bg", /\.btn-telegram\s*\{\s*background:#0A6FA6/.test(faq));
  ok("faq_telegram_old_gone", !/\.btn-telegram\s*\{\s*background:#229ED9/.test(faq));
  ok("faq_telegram_hover", /\.btn-telegram:hover\s*\{\s*background:#085A87/.test(faq));

  const cart = read("app/cart/page.tsx");
  ok("cart_remove_737373", /\.remove-btn\s*\{\s*background:none;\s*border:none;\s*color:#737373/.test(cart));
  ok("cart_remove_old_gone", !/\.remove-btn\s*\{\s*background:none;\s*border:none;\s*color:#CCCCCC/.test(cart));
  ok("cart_remove_hover_kept", /\.remove-btn:hover\s*\{\s*color:#DC2626/.test(cart));
  ok("cart_help_wa_15803d", /\.cart-help-wa\s*\{[^}]*color:#15803D/.test(cart));
  ok("cart_help_wa_old_gone", !/\.cart-help-wa\s*\{[^}]*color:#25d366/.test(cart));
  ok("cart_payment_sub", /\.payment-option-sub\s*\{\s*font-size:12px;\s*color:#5B5B5B/.test(cart));
  ok("cart_payment_sub_old_gone", !/\.payment-option-sub\s*\{\s*font-size:12px;\s*color:#888888/.test(cart));
  ok("cart_steps_span", /\.checkout-steps span\s*\{\s*color:#737373/.test(cart));
  ok("cart_step_done", /\.checkout-steps \.step-done\s*\{\s*color:#15803D/.test(cart));
  ok("cart_step_done_old_gone", !/\.checkout-steps \.step-done\s*\{\s*color:#16A34A/.test(cart));

  const blogPost = read("app/blog/[slug]/BlogPostClient.tsx");
  ok("blog_post_meta_737373", /html body \.post-meta,html body \.post-meta span\{color:#737373 !important/.test(blogPost));
  ok("blog_post_meta_old_888_rule_gone", !/\.post-meta\{color:#888888/.test(blogPost));

  const blog = read("app/blog/BlogClient.tsx");
  ok("blog_badge_guide", /\.post-badge\.guide\s*\{\s*background:#15803D/.test(blog));
  ok("blog_badge_guide_old_gone", !/\.post-badge\.guide\s*\{\s*background:#16A34A/.test(blog));

  const about = read("app/about/page.tsx");
  ok("about_tl_dot_white", /\.tl-dot\s*\{[^}]*color:#FFFFFF !important/.test(about));

  const tracking = read("app/order-tracking/page.tsx");
  ok("track_field_help", /\.field-help\s*\{\s*font-size:12px;\s*color:#666666/.test(tracking));
  ok("track_field_help_old_gone", !/\.field-help\s*\{\s*font-size:12px;\s*color:#777777/.test(tracking));
  ok("track_telegram_bg", /background:"#0A6FA6"/.test(tracking));
  ok("track_telegram_old_gone", !/background:"#229ED9"/.test(tracking));
  ok("track_telegram_hover", /a\.wa-btn\[style\*="#0A6FA6"\]:hover\s*\{\s*background:#085A87 !important/.test(tracking));

  const success = read("app/cart/success/page.tsx");
  ok("success_telegram_bg", /\.telegram-btn\s*\{[^}]*background:#0A6FA6/.test(success));
  ok("success_telegram_old_gone", !/\.telegram-btn\s*\{[^}]*background:#229ED9/.test(success));
  ok("success_telegram_hover", /\.telegram-btn:hover\s*\{[^}]*background:#085A87/.test(success));

  const home = read("app/HomeClient.tsx");
  ok("home_reviews_subtitle", /\.reviews-subtitle\s*\{[^}]*color:#475569/.test(home));
  ok("home_reviews_helper", /\.reviews-write-helper\s*\{[^}]*color:#475569/.test(home));
  ok("home_hero_subtitle", /\.hero-subtitle\s*\{[^}]*color:#475569/.test(home));
  ok(
    "home_slate_old_gone",
    !/\.reviews-subtitle\s*\{[^}]*color:#64748b/.test(home) &&
      !/\.reviews-write-helper\s*\{[^}]*color:#64748b/.test(home) &&
      !/\.hero-subtitle\s*\{[^}]*color:#64748b/.test(home)
  );

  const pdp = read("app/products/[slug]/ProductDetail.tsx");
  ok("pdp_sticky_vat_suffix", /\.pdp-sticky-atc \.price-incl-vat-suffix\{color:#D1D5DB !important;\}/.test(pdp));
  ok("pdp_sticky_disabled_bg", /\.pdp-sticky-atc__btn:disabled\{background:#6B7280/.test(pdp));
  ok("pdp_sticky_disabled_old_gone", !/\.pdp-sticky-atc__btn:disabled\{background:#9CA3AF/.test(pdp));
  ok("pdp_add_btn_disabled_inline", /background:\s*"#6B7280"/.test(pdp));
  ok("pdp_add_btn_disabled_old_gone", !/background:\s*"#9CA3AF"/.test(pdp));

  const contact = read("app/contact/page.tsx");
  ok(
    "contact_submit_disabled",
    /\.submit-btn:disabled\s*\{\s*opacity:1;\s*background:#6B7280;\s*color:#FFFFFF/.test(contact)
  );
  ok("contact_submit_old_opacity_gone", !/\.submit-btn:disabled\s*\{\s*opacity:0\.5/.test(contact));

  const priceDisplay = read("components/PriceDisplay.tsx");
  const priceBase = gitShow(BASE, "components/PriceDisplay.tsx");
  ok("price_display_unchanged", priceDisplay === priceBase);

  const subPage = read("components/subscription/SubscriptionPageClient.tsx");
  const subBase = gitShow(BASE, "components/subscription/SubscriptionPageClient.tsx");
  ok("subscription_page_unchanged", subPage === subBase);

  for (const rel of APPROVED_APP) {
    if (rel === "app/globals.css") continue;
    const cur = read(rel);
    const base = gitShow(BASE, rel);
    if (!base) {
      ok(`tkeys_${rel}`, true, "skip-missing-base");
      ok(`hrefs_${rel}`, true, "skip-missing-base");
      ok(`layout_${rel}`, true, "skip-missing-base");
      continue;
    }
    if (cur === base) {
      ok(`tkeys_${path.basename(rel)}`, true, "unchanged");
      ok(`hrefs_${path.basename(rel)}`, true, "unchanged");
      ok(`layout_${path.basename(rel)}`, true, "unchanged");
      continue;
    }
    ok(`tkeys_${path.basename(rel)}`, sameMultiset(extractTKeys(cur), extractTKeys(base)));
    ok(`hrefs_${path.basename(rel)}`, sameMultiset(extractHrefs(cur), extractHrefs(base)));
    ok(`layout_${path.basename(rel)}`, sameMultiset(extractLayoutDecls(cur), extractLayoutDecls(base)), `cur=${extractLayoutDecls(cur).length} base=${extractLayoutDecls(base).length}`);
  }

  const allowed = new Set([
    ...APPROVED_APP,
    "scripts/phase-multi-157-tests.js",
    // old-suite allowlist/strip plumbing
    "scripts/phase-multi-116-tests.js",
    "scripts/phase-multi-130-tests.js",
    "scripts/phase-multi-131-tests.js",
    "scripts/phase-multi-132-tests.js",
    "scripts/phase-multi-133-tests.js",
    "scripts/phase-multi-136-tests.js",
    "scripts/phase-multi-138-tests.js",
    "scripts/phase-multi-139-tests.js",
    "scripts/phase-multi-140-tests.js",
    "scripts/phase-multi-142-tests.js",
    "scripts/phase-multi-143-tests.js",
    "scripts/phase-multi-144-tests.js",
    "scripts/phase-multi-145-tests.js",
    "scripts/phase-multi-146-tests.js",
    "scripts/phase-multi-147-tests.js",
    "scripts/phase-multi-148-tests.js",
    "scripts/phase-multi-149-tests.js",
    "scripts/phase-multi-150-tests.js",
    "scripts/phase-multi-151-tests.js",
    "scripts/phase-multi-153-tests.js",
    "scripts/phase-multi-154-tests.js",
    "scripts/phase-multi-155-tests.js",
    "scripts/phase-multi-156-tests.js",
  ]);

  const names = new Set();
  for (const args of [
    ["diff", "--name-only", `${BASE}..HEAD`],
    ["diff", "--name-only"],
    ["diff", "--name-only", "--cached"],
    ["ls-files", "--others", "--exclude-standard"],
  ]) {
    const r = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
    for (const n of (r.stdout || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean)) names.add(n);
  }
  const bad = [...names].filter((n) => !allowed.has(n) && !/^scripts\/phase-multi-\d+-tests\.js$/.test(n));
  // phase test files that are allowlist plumbing are listed; any other non-allowed fails
  const bad2 = [...names].filter((n) => !allowed.has(n));
  ok("scope_guard", bad2.length === 0, bad2.join(","));

  console.log(`\nMULTI-157 results: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main();
