/**
 * F4UK-MULTI-87 — mobile card price row wrap + home CTA fallback + harness hygiene.
 * Stub/static only — no live orders, no DB writes.
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

const priceDisplay = read("components/PriceDisplay.tsx");
const home = read("app/HomeClient.tsx");
const products = read("app/products/ProductsClient.tsx");
const harden = read("scripts/phase-harden-79-tests.js");
const hyg = read("scripts/phase-hygiene-80-tests.js");
const ads77 = read("scripts/phase-ads-csp-77-tests.js");
const ux72 = read("scripts/phase-seasonal-ux-72-tests.js");

// A) Price row allows wrapping / stacking on mobile; incl. VAT text unchanged
ok(
  "A_price_display_wrap_marker",
  /data-price-row=["']wrap["']/.test(priceDisplay) &&
    /price-display-wrap/.test(priceDisplay)
);
ok(
  "A_price_display_mobile_stack_css",
  /@media\s*\(\s*max-width:\s*520px\s*\)/.test(priceDisplay) &&
    /flex-direction:\s*column/.test(priceDisplay) &&
    /price-incl-vat-suffix/.test(priceDisplay)
);
ok(
  "A_incl_vat_fallback_unchanged",
  /t\(\s*["']price_incl_vat_suffix["']\s*,\s*["']incl\. VAT["']\s*\)/.test(
    priceDisplay
  )
);
ok(
  "A_home_product_footer_mobile_stack",
  /\.product-footer\{flex-direction:column;align-items:stretch;\}/.test(home) &&
    /\.add-btn\{[^}]*width:100%/.test(home)
);
ok(
  "A_products_product_footer_mobile_stack",
  /\.product-footer\{flex-direction:column;align-items:stretch;\}/.test(
    products
  ) && /\.add-btn\{[^}]*width:100%/.test(products)
);
ok(
  "A_product_footer_flex_wrap",
  /product-footer[^;{]*\{[^}]*flex-wrap:\s*wrap/.test(home) &&
    /product-footer[^;{]*\{[^}]*flex-wrap:\s*wrap/.test(products)
);

// B) Home hero secondary CTA fallback matches CMS
ok(
  "B_home_cta_fallback_about",
  /secondaryText:\s*["']About Firestick4UK["']/.test(home) &&
    /\|\|\s*["']About Firestick4UK["']/.test(home) &&
    /secondary_button_text:\s*["']About Firestick4UK["']/.test(home)
);
ok(
  "B_home_cta_no_learn_more_fallback",
  !/\|\|\s*["']Learn More["']/.test(home) &&
    !/secondaryText:\s*["']Learn More["']/.test(home)
);
ok(
  "B_home_h1_path_untouched_marker",
  /home-seo-hero/.test(home) || /Premium UK Streaming/.test(home)
);

// C) Harness allowlists scoped to historical ranges (not origin/main...HEAD / wt)
ok(
  "C_harden79_scoped_range",
  /HARDEN79_RANGE_BASE/.test(harden) &&
    /HARDEN79_RANGE_END/.test(harden) &&
    !/git diff --name-only origin\/main\.\.\.HEAD/.test(harden)
);
ok(
  "C_hyg80_scoped_range",
  /HYG80_RANGE_BASE/.test(hyg) &&
    /HYG80_RANGE_END/.test(hyg) &&
    !/git diff --name-only origin\/main\.\.\.HEAD/.test(hyg)
);
ok(
  "C_ads77_scoped_range",
  /ADS77_RANGE_BASE/.test(ads77) &&
    /ADS77_RANGE_END/.test(ads77) &&
    !/git diff --name-only origin\/main\.\.\.HEAD/.test(ads77)
);
ok(
  "C_ux72_scoped_range",
  /UX72_RANGE_BASE/.test(ux72) &&
    /UX72_RANGE_END/.test(ux72) &&
    !/diff",\s*"--name-only",\s*"HEAD"/.test(ux72)
);

ok(
  "C_harness_notes_not_applicable_later_head",
  /not applicable against later HEAD/.test(harden) &&
    /not applicable against later HEAD/.test(hyg) &&
    /not applicable against later HEAD/.test(ads77) &&
    /not applicable against later HEAD/.test(ux72)
);

console.log(`\nMULTI-87: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
