/**
 * F4UK-UX-FIX-53 — WhatsApp overlap, cart thumbnail, sticky place-order, bank block.
 * Plain Node asserts (no browser, no orders).
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

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

const wa = read("components/WhatsAppButton.tsx");
const cart = read("app/cart/page.tsx");
const success = read("app/cart/success/page.tsx");
const products = read("app/products/ProductsClient.tsx");

// D1 — WA hidden on /cart and /cart/success
ok(
  "wa_hides_on_cart_and_success_routes",
  /isWaHiddenRoute/.test(wa) &&
    /\/cart/.test(wa) &&
    /\/cart\/success/.test(wa) &&
    /hideOnRoute/.test(wa) &&
    /data-wa-route-hidden/.test(wa)
);
ok(
  "wa_hidden_includes_route_in_hidden_flag",
  /hideOnRoute\s*\|\|\s*hideForConsent\s*\|\|\s*hideForStickyCheckout/.test(wa) ||
    /const hidden = hideOnRoute \|\| hideForConsent \|\| hideForStickyCheckout/.test(wa)
);
ok(
  "cart_page_has_inline_wa_help",
  /data-cart-help-wa=["']1["']/.test(cart) &&
    /cart_wa_btn/.test(cart) &&
    /contact\.whatsappUrl/.test(cart)
);
ok(
  "success_page_keeps_inline_wa_telegram",
  /className=["']wa-btn["']/.test(success) &&
    /telegram-btn/.test(success) &&
    /success_wa/.test(success)
);

// D1 — mobile size / opacity / safe pad / products left
ok(
  "wa_mobile_size_48",
  /@media\s*\(max-width:\s*900px\)[\s\S]*?\.wa-float\s*\{[^}]*width:\s*48px/.test(wa) &&
    /height:\s*48px/.test(wa)
);
ok("wa_mobile_opacity_085", /opacity:\s*0\.85/.test(wa));
ok(
  "wa_safe_pad_72",
  /wa-float-safe-pad/.test(wa) && /padding-bottom:\s*72px/.test(wa)
);
ok(
  "wa_products_bottom_left",
  /data-products-page/.test(wa) &&
    /left:\s*16px/.test(wa) &&
    /right:\s*auto/.test(wa)
);
ok(
  "products_grid_extra_bottom_pad",
  /\.products-grid\{[^}]*padding:0 12px 72px/.test(products)
);

// D1 — batch 51 offset/hide rules still present
ok(
  "wa_keeps_minicart_offset_88",
  /wa-float--above-minicart/.test(wa) &&
    /minicart-bar-visible/.test(wa) &&
    /bottom:\s*88px/.test(wa)
);
ok(
  "wa_hides_for_consent_or_sticky_checkout",
  /hideForConsent/.test(wa) &&
    /hideForStickyCheckout/.test(wa) &&
    /consent-banner-visible/.test(wa) &&
    /sticky-checkout-bar-visible/.test(wa) &&
    /wa-float--hidden/.test(wa)
);
ok(
  "wa_no_longer_lifts_on_cart_page",
  !/body\[data-cart-page=["']1["']\][\s\S]{0,80}bottom:\s*96px/.test(wa) &&
    !/wa-float--cart-page/.test(wa)
);

// D2 — cart line layout
ok(
  "cart_item_flex_row",
  /\.cart-item\s*\{[^}]*display:\s*flex/.test(cart) &&
    /flex-direction:\s*row/.test(cart)
);
ok(
  "cart_thumb_flex_shrink_0",
  /\.cart-item-image\s*\{[^}]*flex-shrink:\s*0/.test(cart) &&
    (/width:\s*72px/.test(cart) || /width:\s*64px/.test(cart))
);
ok(
  "cart_details_min_width_0",
  /\.cart-item-details\s*\{[^}]*min-width:\s*0/.test(cart)
);

// D3 — sticky place order margins / safe-area
ok(
  "sticky_place_order_side_margins",
  /\.sticky-place-order[\s\S]{0,400}left:\s*max\(12px,\s*env\(safe-area-inset-left/.test(cart) &&
    /right:\s*max\(12px,\s*env\(safe-area-inset-right/.test(cart)
);
ok(
  "sticky_place_order_box_sizing",
  /\.sticky-place-order[\s\S]{0,500}box-sizing:\s*border-box/.test(cart)
);
ok(
  "sticky_ack_keyboard_intact",
  /data-sticky-place-order=["']1["']/.test(cart) &&
    /is-keyboard-hidden/.test(cart) &&
    /data-place-order=["']sticky["'][\s\S]*onClick=\{handleOrder\}/.test(cart)
);

// D4 — bank block
ok(
  "bank_details_full_width",
  /\.bank-details\s*\{[^}]*width:\s*100%/.test(cart) &&
    !/\.bank-details\s*\{[^}]*margin-right:\s*72px/.test(cart) &&
    !/bank-details \{ padding-bottom:24px; margin-right:72px/.test(cart)
);
ok(
  "bank_sort_account_amount_nowrap",
  /bank-row-value__text--nowrap/.test(cart) &&
    /bank-row--sort/.test(cart) &&
    /bank-row--account/.test(cart) &&
    /bank-row--amount/.test(cart)
);
ok(
  "bank_account_name_wraps",
  /bank-row--name/.test(cart) && /bank-row-value__text--wrap/.test(cart)
);
ok(
  "bank_copy_aria_live_intact",
  /CopyButton/.test(cart) && /bank_sort_code/.test(cart)
);
ok(
  "checkout_steps_spacing_16",
  /\.checkout-steps\s*\{[^}]*margin:\s*16px\s+0\s+18px/.test(cart)
);

// Allowlist
const allowed = new Set([
  "app/cart/page.tsx",
  "app/cart/success/page.tsx",
  "app/products/ProductsClient.tsx",
  "components/WhatsAppButton.tsx",
  "app/globals.css",
  "scripts/phase-ux-fix-53-tests.js",
  // Allow batch-51 allowlist update so new fix-53 script is recognized
  "scripts/phase-ux-batch-51-tests.js",
  // COD restore-54: second payment option + digital label tests
  "scripts/phase-cod-restore-54-tests.js",
  // F4UK-HOME-REVIEWS-R1-61
  "app/HomeClient.tsx",
  "lib/homeTestimonials.ts",
  "app/sidhu/page.tsx",
  "scripts/phase-home-reviews-61-tests.js",
  "scripts/phase-home-testimonials-foundation-tests.js",
  "scripts/phase-windup-59-tests.js",
  "scripts/phase-ux-batch-51-tests.js",
  "scripts/phase-sidhu-insights-57-tests.js",
  // F4UK-W4-INSIGHTS-LIVE-63
  "components/TrackingConsent.tsx",
  "lib/trackingConsent.ts",
  "scripts/phase-city-cleanup-64-tests.js",
  "lib/insightsClient.ts",
  "components/SidhuInsightsBeacon.tsx",
  "components/sidhu/insights/SettingsScreen.tsx",
  "scripts/phase-insights-live-63-tests.js",
  "scripts/phase20g3b-tracking-consent-tests.js",
  "scripts/phase-clarity-35-tests.js",
  "scripts/phase-tracking-consent-final-tests.js",
  "scripts/phase-home-reviews-61-tests.js",
]);
let changed = [];
try {
  changed = execSync("git diff --name-only HEAD", { cwd: ROOT, encoding: "utf8" })
    .split(/\r?\n/)
    .map((s) => s.trim().replace(/\\/g, "/"))
    .filter(Boolean);
} catch {
  changed = [];
}
const untracked = execSync("git ls-files --others --exclude-standard", {
  cwd: ROOT,
  encoding: "utf8",
})
  .split(/\r?\n/)
  .map((s) => s.trim().replace(/\\/g, "/"))
  .filter(Boolean);
const allTouched = [...new Set([...changed, ...untracked])];
const unexpected = allTouched.filter((f) => !allowed.has(f));
const forbidden = allTouched.filter((f) =>
  /^(pages\/api\/|.*sitemap|.*robots|.*layout\.tsx$|Navbar\.tsx$|Footer\.tsx$|lib\/seo)/i.test(
    f
  )
);
ok(
  "diff_allowlist_only",
  unexpected.length === 0 && forbidden.length === 0,
  unexpected.length || forbidden.length
    ? `unexpected=${unexpected.join(",")} forbidden=${forbidden.join(",")}`
    : `touched=${allTouched.join(",") || "none"}`
);

console.log(`\nUX-FIX-53: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
