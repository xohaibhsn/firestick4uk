/**
 * F4UK-COD-RESTORE-54 — second payment option on all carts; digital label;
 * bank details only while Bank Transfer selected. Plain Node asserts.
 *
 * Pending strategy (documented): keep the second option HIDDEN until
 * classification.ready so a digital-only cart never flashes the physical
 * "Cash on Delivery" label then switches.
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

const cart = read("app/cart/page.tsx");

let originalCart = "";
try {
  originalCart = execSync("git show 755f5b5:app/cart/page.tsx", {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 5 * 1024 * 1024,
  });
} catch (_) {
  originalCart = "";
}
ok(
  "original_default_is_bank",
  /useState<"bank" \| "cod">\("bank"\)/.test(originalCart),
  "755f5b5 default paymentMethod=bank"
);
ok(
  "original_bank_details_only_when_bank",
  /\{paymentMethod === ["']bank["'] && \(/.test(originalCart)
);
ok(
  "current_default_is_bank",
  /useState<"bank" \| "cod">\("bank"\)/.test(cart)
);
ok("no_showCodOption_physical_gate", !/\bshowCodOption\b/.test(cart));
ok(
  "second_option_gated_only_on_classification_ready",
  /showSecondPaymentOption\s*=\s*classification\.ready\s*===\s*true/.test(cart) &&
    /showSecondPaymentOption\s*\?/.test(cart) &&
    /val:\s*["']cod["']\s*as\s*const/.test(cart)
);
ok(
  "digitalOnlyCart_classified",
  /const digitalOnlyCart\s*=/.test(cart) &&
    /classification\.hasDigitalItems/.test(cart) &&
    /!classification\.hasPhysicalItems/.test(cart)
);
ok(
  "pending_hides_second_option_no_wrong_label_flash",
  /never flashes "Cash on Delivery"/.test(cart) &&
    /!showSecondPaymentOption && paymentMethod === ["']cod["']/.test(cart)
);
ok(
  "physical_mixed_cod_keys",
  /t\(\s*["']cart_pay_cod["']\s*,\s*["']Cash on Delivery["']\s*\)/.test(cart) &&
    /t\(\s*["']cart_pay_cod_sub["']\s*,\s*["']Pay when your order arrives["']\s*\)/.test(
      cart
    )
);
ok(
  "digital_cod_keys",
  /t\(\s*["']cart_pay_cod_digital["']\s*,\s*["']Pay on Delivery \/ Activation["']\s*\)/.test(
    cart
  ) &&
    /t\(\s*["']cart_pay_cod_digital_sub["']\s*,\s*["']Pay when your order is delivered or activated["']\s*\)/.test(
      cart
    )
);
ok(
  "digital_label_only_when_digitalOnlyCart",
  /digitalOnlyCart\s*\?[\s\S]*cart_pay_cod_digital[\s\S]*:\s*t\(\s*["']cart_pay_cod["']/.test(
    cart
  )
);
ok(
  "posted_values_remain_bank_and_cod",
  /payment_method:\s*paymentMethod/.test(cart) &&
    /useState<"bank" \| "cod">/.test(cart) &&
    /value=\{p\.val\}/.test(cart) &&
    /val:\s*["']bank["']\s*as\s*const/.test(cart) &&
    /val:\s*["']cod["']\s*as\s*const/.test(cart)
);
ok(
  "no_new_payment_promise_deadline_discount_claim",
  !/within\s+\d+\s*(hour|day|minute)/i.test(
    (cart.match(/cart_pay_cod_digital[\s\S]{0,220}/) || [""])[0]
  ) &&
    !/%\s*off/i.test((cart.match(/cart_pay_cod_digital[\s\S]{0,220}/) || [""])[0])
);
ok(
  "bank_details_gated_on_bank",
  /\{paymentMethod === ["']bank["'] && \(/.test(cart) &&
    /data-bank-details=["']1["']/.test(cart)
);
ok(
  "copy_buttons_inside_bank_gate",
  (() => {
    const m = cart.match(
      /\{paymentMethod === ["']bank["'] && \(([\s\S]*?)\n\s*\)\}\s*\n\s*\{paymentMethod === ["']cod["']/
    );
    if (!m) return false;
    const block = m[1];
    return (
      /CopyButton/.test(block) &&
      /bank_upload_label/.test(block) &&
      /type=["']file["']/.test(block) &&
      /bank_ref_input_label/.test(block)
    );
  })()
);
ok(
  "cod_branch_has_no_bank_copy_or_receipt_upload",
  (() => {
    const m = cart.match(
      /\{paymentMethod === ["']cod["'] && \(([\s\S]*?)\n\s*\)\}\s*\n\s*<div className=["']summary-body["']/
    );
    if (!m) return false;
    const block = m[1];
    return (
      !/CopyButton/.test(block) &&
      !/type=["']file["']/.test(block) &&
      !/data-bank-details/.test(block) &&
      (/cart_cod_heading/.test(block) || /cart_pay_cod_digital/.test(block))
    );
  })()
);
ok(
  "receipt_clears_when_leaving_bank",
  /choosePaymentMethod/.test(cart) &&
    /next !== ["']bank["']/.test(cart) &&
    /clearReceiptSelection/.test(cart)
);
ok(
  "digital_ack_gating_intact",
  /classification\.hasDigitalItems && !effectiveDigitalAck/.test(cart) &&
    /digital_supply_acknowledgement:\s*true/.test(cart)
);
ok(
  "sticky_place_order_intact",
  /data-sticky-place-order=["']1["']/.test(cart) &&
    /sticky-place-order/.test(cart) &&
    /is-keyboard-hidden/.test(cart)
);
ok("preparing_checkout_intact", /Preparing checkout\.\.\./.test(cart));

let changed = [];
try {
  changed = execSync("git diff --name-only HEAD", { cwd: ROOT, encoding: "utf8" })
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
} catch (_) {
  changed = [];
}
const untracked = execSync("git ls-files --others --exclude-standard", {
  cwd: ROOT,
  encoding: "utf8",
})
  .split(/\r?\n/)
  .map((s) => s.trim())
  .filter(Boolean);
const allTouched = [...new Set([...changed, ...untracked])].map((f) =>
  f.replace(/\\/g, "/")
);
const allow = new Set([
  "app/cart/page.tsx",
  "scripts/phase-cod-restore-54-tests.js",
  "scripts/phase-ux-batch-51-tests.js",
  "scripts/phase-ux-fix-53-tests.js",
  // F4UK-HOME-REVIEWS-R1-61
  "app/HomeClient.tsx",
  "lib/homeTestimonials.ts",
  "app/sidhu/page.tsx",
  "scripts/phase-home-reviews-61-tests.js",
  "scripts/phase-home-testimonials-foundation-tests.js",
  "scripts/phase-windup-59-tests.js",
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
const unexpected = allTouched.filter((f) => !allow.has(f));
ok(
  "diff_allowlist",
  unexpected.length === 0,
  unexpected.length ? unexpected.join(", ") : `touched=${allTouched.join(",")}`
);

console.log(`\nCOD-RESTORE-54: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
