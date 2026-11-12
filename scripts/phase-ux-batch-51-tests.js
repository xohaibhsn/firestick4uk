/**
 * F4UK-UX-BATCH-51 — mobile conversion UX (floats, autofill, copy, sticky CTAs, COD, PDP/listing).
 * Plain Node asserts (no browser, no orders).
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
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

function transpileTs(rel) {
  const src = read(rel);
  const out = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
    },
    fileName: rel,
  });
  return out.outputText;
}

function loadTsModule(rel) {
  const code = transpileTs(rel);
  const fakeModule = { exports: {} };
  const dirname = path.join(ROOT, path.dirname(rel));
  const filename = path.join(ROOT, rel);
  const req = (id) => {
    if (id.startsWith("@/")) {
      const mapped = id.replace(/^@\//, "");
      const candidates = [
        path.join(ROOT, mapped + ".ts"),
        path.join(ROOT, mapped + ".tsx"),
        path.join(ROOT, mapped + ".js"),
        path.join(ROOT, mapped, "index.ts"),
      ];
      for (const c of candidates) {
        if (fs.existsSync(c)) {
          return loadTsModule(path.relative(ROOT, c).replace(/\\/g, "/"));
        }
      }
    }
    return require(id);
  };
  const fn = new Function(
    "require",
    "module",
    "exports",
    "__dirname",
    "__filename",
    code
  );
  fn(req, fakeModule, fakeModule.exports, dirname, filename);
  return fakeModule.exports;
}

const cart = read("app/cart/page.tsx");
const wa = read("components/WhatsAppButton.tsx");
const consent = read("components/TrackingConsent.tsx");
const mini = read("components/MiniCartBar.tsx");
const pd = read("app/products/[slug]/ProductDetail.tsx");
const products = read("app/products/ProductsClient.tsx");
const copyBtn = read("components/CopyButton.tsx");
const clip = read("lib/clipboardCopy.ts");
// B — autocomplete / inputmode / name (React props + object literals)
ok(
  "checkout_autocomplete_name_email_tel",
  /autoComplete:\s*["']name["']/.test(cart) &&
    /autoComplete:\s*["']email["']/.test(cart) &&
    /autoComplete:\s*["']tel["']/.test(cart) &&
    /autoComplete=\{f\.autoComplete\}/.test(cart)
);
ok(
  "checkout_autocomplete_address_fields",
  /autoComplete:\s*["']street-address["']/.test(cart) &&
    /autoComplete=["']address-level2["']/.test(cart) &&
    /autoComplete=["']postal-code["']/.test(cart) &&
    /autoComplete=["']country["']/.test(cart)
);
ok(
  "checkout_inputmode_email_tel",
  /inputMode=["']email["']/.test(cart) || /inputMode:\s*["']email["']/.test(cart)
);
ok(
  "checkout_inputmode_tel",
  /inputMode=["']tel["']/.test(cart) || /inputMode:\s*["']tel["']/.test(cart)
);
ok(
  "checkout_postcode_text_not_numeric_inputmode",
  /name=["']postal-code["']/.test(cart) &&
    !/postal-code[\s\S]{0,160}inputMode=["']numeric["']/.test(cart)
);
ok(
  "checkout_name_attrs_present",
  /name:\s*["']name["']/.test(cart) &&
    /name:\s*["']email["']/.test(cart) &&
    /name:\s*["']tel["']/.test(cart) &&
    /name:\s*["']street-address["']/.test(cart) &&
    /name=\{f\.name\}/.test(cart)
);

// C — copy buttons + fallback
ok(
  "copy_button_component_present",
  fs.existsSync(path.join(ROOT, "components/CopyButton.tsx")) &&
    /aria-live=["']polite["']/.test(copyBtn) &&
    /Copied/.test(copyBtn)
);
ok(
  "clipboard_fallback_execCommand",
  /navigator\.clipboard/.test(clip) && /execCommand\(["']copy["']\)/.test(clip)
);
ok(
  "bank_copy_buttons_wired",
  /CopyButton/.test(cart) &&
    /bank_sort_code/.test(cart) &&
    /bank_account_no/.test(cart) &&
    /bank_account_name/.test(cart) &&
    /grandTotal\.toFixed\(2\)/.test(cart)
);

// E — second payment option on all carts (COD restore 54).
// Edited vs batch-51: was "COD hidden for digital-only" (showCodOption /
// hasPhysicalItems). Now shown once classification.ready for every cart;
// digital-only uses cart_pay_cod_digital*; pending still hides (no wrong-label flash).
// cod-digital-count expectation (batch-51 screenshots): was 0, now 1 when ready.
ok(
  "cod_shown_when_classification_ready",
  /showSecondPaymentOption/.test(cart) &&
    /classification\.ready\s*===\s*true/.test(cart) &&
    /showSecondPaymentOption\s*\?/.test(cart) &&
    /codOptionLabel/.test(cart) &&
    !/showCodOption/.test(cart)
);
ok(
  "cod_digital_label_keys",
  /cart_pay_cod_digital/.test(cart) &&
    /Pay on Delivery \/ Activation/.test(cart) &&
    /cart_pay_cod_digital_sub/.test(cart) &&
    /Pay when your order is delivered or activated/.test(cart)
);
ok(
  "cod_no_flash_while_pending",
  /showSecondPaymentOption/.test(cart) &&
    /classification\.ready\s*===\s*true/.test(cart) &&
    /paymentToggles\.codEnabled/.test(cart) &&
    /digitalOnlyCart/.test(cart) &&
    /never flashes "Cash on Delivery"/.test(cart)
);
ok(
  "payment_radio_accessible_names",
  /aria-label=\{p\.label\}/.test(cart) && /name=["']payment_method["']/.test(cart)
);

// D — sticky place order + ack gating intact
ok(
  "sticky_place_order_present",
  /data-sticky-place-order=["']1["']/.test(cart) &&
    /sticky-place-order/.test(cart) &&
    /safe-area-inset-bottom/.test(cart)
);
ok(
  "sticky_place_order_uses_same_handleOrder",
  /data-place-order=["']sticky["'][\s\S]*onClick=\{handleOrder\}/.test(cart)
);
ok(
  "digital_ack_gating_intact",
  /classification\.hasDigitalItems && !effectiveDigitalAck/.test(cart) &&
    /digital_supply_acknowledgement:\s*true/.test(cart) &&
    /DIGITAL_SUPPLY_ACK_TEXT/.test(cart)
);
ok(
  "sticky_hides_on_keyboard_focus",
  /is-keyboard-hidden/.test(cart) && /keyboardOpen/.test(cart)
);

// A — WA / consent / minicart collisions
ok(
  "consent_banner_body_class",
  /consent-banner-visible/.test(consent) && /data-consent-banner/.test(consent)
);
ok(
  "wa_hides_for_consent_or_sticky_checkout",
  /hideForConsent/.test(wa) &&
    /hideForStickyCheckout/.test(wa) &&
    /wa-float--hidden/.test(wa)
);
ok(
  "wa_keeps_minicart_offset",
  /wa-float--above-minicart/.test(wa) &&
    /minicart-bar-visible/.test(wa) &&
    /bottom:\s*88px/.test(wa)
);
ok(
  "minicart_hides_for_pdp_sticky_atc",
  /pdp-sticky-atc-visible/.test(mini) && /data-pdp-sticky-atc/.test(mini)
);
ok(
  "minicart_body_class_mechanism_intact",
  /minicart-bar-visible/.test(mini) && /data-minicart-bar/.test(mini)
);

// H — PDP
ok(
  "pdp_sticky_atc_present",
  /data-pdp-sticky-atc-bar=["']1["']/.test(pd) && /pdp-sticky-atc/.test(pd)
);
ok(
  "pdp_sticky_atc_aria_live",
  /pdp-sticky-atc__live/.test(pd) && /aria-live=["']polite["']/.test(pd)
);
ok(
  "physical_pdp_hides_activation_badge",
  /isDigitalProduct/.test(pd) &&
    /isDigital \? \(/.test(pd) &&
    /data-activation-badge/.test(pd)
);
ok(
  "stock_badge_uses_helper",
  /stockBadgeLabel\(product\.stock\)/.test(pd) &&
    /data-stock-badge=["']1["']/.test(pd)
);

// stock badge rules unit
try {
  const mod = loadTsModule("lib/stockBadgeLabel.ts");
  const label = mod.stockBadgeLabel;
  ok("stock_badge_in_stock_for_12", label("12") === "In stock");
  ok("stock_badge_only_n_left_for_3", label("3") === "Only 3 left");
  ok("stock_badge_only_5_left", label("5") === "Only 5 left");
  ok("stock_badge_digital_in_stock", label("digital") === "In stock");
  ok("stock_badge_empty_in_stock", label("") === "In stock" || label(null) === "In stock");
} catch (err) {
  ok("stock_badge_unit_load", false, String(err && err.message ? err.message : err));
}

// F — cart polish
ok(
  "cart_line_uses_image_with_emoji_fallback",
  /item\.image \?/.test(cart) && /📦/.test(cart)
);
ok("qty_btn_min_44", /\.qty-btn[^}]*min-height:\s*44px/.test(cart));
ok(
  "filter_chip_min_44",
  /\.filter-btn[^}]*min-height:\s*44px/.test(products)
);
ok(
  "preparing_checkout_smooth_state",
  /Preparing checkout\.\.\./.test(cart) &&
    /checkout-btn\.preparing/.test(cart) &&
    /aria-busy/.test(cart)
);

// I — mobile filters collapse (SSR keeps chip text)
ok(
  "products_filters_collapse_mobile",
  /filters-mobile-toggle/.test(products) &&
    /filters-collapsible/.test(products) &&
    /Subscription/.test(products) &&
    /Device/.test(products)
);
ok(
  "products_filter_toggle_client_only",
  /filtersHydrated/.test(products)
);

// G — step indicator
ok(
  "checkout_step_indicator_present",
  /data-checkout-steps=["']1["']/.test(cart) &&
    /Cart/.test(cart) &&
    /Checkout/.test(cart) &&
    /Done/.test(cart)
);

// Allowlist: no SEO/API/nav/sitemap/metadata/json-ld files changed vs HEAD
const forbidden = [
  /^pages\/api\//,
  /sitemap/i,
  /robots/i,
  /layout\.tsx$/,
  /metadata/i,
  /JsonLd/i,
  /json-ld/i,
  /Navbar\.tsx$/,
  /Footer\.tsx$/,
];
let changed = [];
try {
  changed = execSync("git diff --name-only HEAD", { cwd: ROOT, encoding: "utf8" })
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
} catch (e) {
  changed = [];
}
const untracked = execSync("git ls-files --others --exclude-standard", {
  cwd: ROOT,
  encoding: "utf8",
})
  .split(/\r?\n/)
  .map((s) => s.trim())
  .filter(Boolean);
const allTouched = [...new Set([...changed, ...untracked])];
const payCms66ApiAllow = new Set(["pages/api/orders.ts"]);
// F4UK-INSIGHTS-SLIM-67: Insights ingest/admin API edits are expected in this working tree
const slim67Api = (n) => n.startsWith("pages/api/admin-insights/") || n === "pages/api/insights-collect.ts";
const blocked = allTouched.filter((f) => {
  const n = f.replace(/\\/g, "/");
  if (payCms66ApiAllow.has(n) || slim67Api(n)) return false;
  return forbidden.some((re) => re.test(n));
});
ok(
  "no_forbidden_seo_api_nav_files_changed",
  blocked.length === 0,
  blocked.length ? blocked.join(", ") : `touched=${allTouched.length}`
);

const allowedPrefixes = [
  "app/cart/",
  "app/products/",
  "app/HomeClient.tsx",
  "app/lib/cartContext.tsx",
  "components/WhatsAppButton.tsx",
  "components/TrackingConsent.tsx",
  "components/MiniCartBar.tsx",
  "components/CopyButton.tsx",
  "lib/clipboardCopy.ts",
  "lib/stockBadgeLabel.ts",
  "scripts/phase-ux-batch-51-tests.js",
  "scripts/phase-ux-fix-53-tests.js",
  "scripts/phase-cod-restore-54-tests.js",
  "lib/homeTestimonials.ts",
  "app/sidhu/page.tsx",
  "scripts/phase-home-reviews-61-tests.js",
  "scripts/phase-home-testimonials-foundation-tests.js",
  "scripts/phase-windup-59-tests.js",
  "scripts/phase-sidhu-insights-57-tests.js",
  // F4UK-W4-INSIGHTS-LIVE-63
  "lib/trackingConsent.ts",
  "lib/insightsClient.ts",
  "components/SidhuInsightsBeacon.tsx",
  "components/sidhu/insights/SettingsScreen.tsx",
  "scripts/phase-city-cleanup-64-tests.js",
  "scripts/phase-insights-live-63-tests.js",
  "scripts/phase20g3b-tracking-consent-tests.js",
  "scripts/phase-clarity-35-tests.js",
  "scripts/phase-tracking-consent-final-tests.js",
  "scripts/phase-home-reviews-61-tests.js",
  "scripts/phase-windup-59-tests.js",
  "scripts/phase-ux-fix-53-tests.js",
  "scripts/phase-cod-restore-54-tests.js",
  // F4UK-PAY-CMS-66
  "lib/paymentMethodSettings.ts",
  "lib/paymentMethodSettingsServer.ts",
  "lib/siteContentDefaults.ts",
  "pages/api/orders.ts",
  "scripts/phase-pay-cms-66-tests.js",
  "REPO_AUDIT_REPORT.md",
  // F4UK-INSIGHTS-SLIM-67
  "components/sidhu/insights/",
  "pages/api/admin-insights/",
  "lib/insightsIngest.ts", "lib/insightsGeo.ts", "pages/api/insights-collect.ts", "package.json", "package-lock.json", "scripts/phase-sidhu-insights-56-tests.js", "scripts/phase-insights-w2-60-tests.js", "scripts/phase-insights-slim-67-tests.js",
];
const unexpected = allTouched.filter((f) => {
  const n = f.replace(/\\/g, "/");
  return !allowedPrefixes.some(
    (p) => n === p || n.startsWith(p) || (p.endsWith("/") && n.startsWith(p))
  );
});
ok(
  "diff_allowlist_client_ux_only",
  unexpected.length === 0,
  unexpected.length ? unexpected.join(", ") : "ok"
);

console.log(`\nUX-BATCH-51: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
