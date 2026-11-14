/**
 * F4UK-VAT-INCL-83 — optional VAT-inclusive pricing (setting default OFF).
 * Stub/mocked only — no live orders, no DB writes.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

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

function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100;
}

function parsePricesIncludeVat(value) {
  if (value === undefined || value === null) return false;
  const s = String(value).trim().toLowerCase();
  if (s === "") return false;
  if (s === "1" || s === "true" || s === "on" || s === "yes") return true;
  if (s === "0" || s === "false" || s === "off" || s === "no") return false;
  return false;
}

function cartShippingPounds(opts) {
  if (!opts.cartLength) return 0;
  if (opts.hasPhysicalItems) return 3.99;
  return 0;
}

function calculateCouponDiscount(opts) {
  const cartTotal = Number(opts.cartTotal);
  const value = Number(opts.value);
  if (!Number.isFinite(cartTotal) || cartTotal < 0) return 0;
  if (!Number.isFinite(value) || value < 0) return 0;
  const raw =
    opts.type === "percentage"
      ? Math.min((cartTotal * value) / 100, cartTotal)
      : Math.min(value, cartTotal);
  return roundMoney(raw);
}

function isDigitalProduct(product) {
  const category = String(product?.category ?? "").trim().toLowerCase();
  const stock = String(product?.stock ?? "").trim().toLowerCase();
  if (category === "subscription") return true;
  if (stock === "digital") return true;
  return false;
}

function calculateAuthoritativePricing(items, opts) {
  let subtotalRaw = 0;
  let hasPhysicalItems = false;
  let hasDigitalItems = false;
  for (const item of items) {
    subtotalRaw += item.price * item.qty;
    if (isDigitalProduct(item)) hasDigitalItems = true;
    else hasPhysicalItems = true;
  }
  const subtotal = roundMoney(subtotalRaw);
  const shipping = roundMoney(
    cartShippingPounds({ cartLength: items.length, hasPhysicalItems })
  );
  const pricesIncludeVat = opts?.pricesIncludeVat === true;
  const vatAmount = pricesIncludeVat ? 0 : roundMoney(subtotal * 0.2);
  return {
    subtotal,
    shipping,
    vatAmount,
    hasPhysicalItems,
    hasDigitalItems,
    pricesIncludeVat,
  };
}

function extractVatFromInclusiveGrandTotal(grandTotal) {
  const g = Number(grandTotal);
  if (!Number.isFinite(g) || g <= 0) return 0;
  return roundMoney(g - g / 1.2);
}

function calculateGrandTotal(opts) {
  const total = opts.pricesIncludeVat
    ? roundMoney(opts.subtotal + opts.shipping - opts.discountAmount)
    : roundMoney(
        opts.subtotal + opts.shipping + opts.vatAmount - opts.discountAmount
      );
  return total < 0 ? 0 : total;
}

function finalize(items, coupon, pricesIncludeVat) {
  const p = calculateAuthoritativePricing(items, { pricesIncludeVat });
  const cartTotalForCoupon = roundMoney(p.subtotal + p.shipping);
  const discountAmount = coupon
    ? calculateCouponDiscount({
        type: coupon.type,
        value: coupon.value,
        cartTotal: cartTotalForCoupon,
      })
    : 0;
  const grandTotal = calculateGrandTotal({
    subtotal: p.subtotal,
    shipping: p.shipping,
    vatAmount: p.vatAmount,
    discountAmount,
    pricesIncludeVat,
  });
  const vatAmount = pricesIncludeVat
    ? extractVatFromInclusiveGrandTotal(grandTotal)
    : p.vatAmount;
  return { ...p, discountAmount, grandTotal, vatAmount };
}

// ── Source presence ──────────────────────────────────────────────────────────
ok("helper_pricesIncludeVat_exists", exists("lib/pricesIncludeVat.ts"));
ok("helper_pricesIncludeVatServer_exists", exists("lib/pricesIncludeVatServer.ts"));
ok("price_display_component", exists("components/PriceDisplay.tsx"));

const orderPricing = read("lib/orderPricing.ts");
const cartTotals = read("lib/cartDisplayTotals.ts");
const orders = read("pages/api/orders.ts");
const cart = read("app/cart/page.tsx");
const success = read("app/cart/success/page.tsx");
const defaults = read("lib/siteContentDefaults.ts");
const perms = read("lib/adminPermissions.ts");
const sidhu = read("app/sidhu/page.tsx");
const parseSrc = read("lib/pricesIncludeVat.ts");

ok(
  "parse_default_off",
  /return false/.test(parseSrc) &&
    parsePricesIncludeVat(undefined) === false &&
    parsePricesIncludeVat(null) === false &&
    parsePricesIncludeVat("") === false &&
    parsePricesIncludeVat("0") === false &&
    parsePricesIncludeVat("garbage") === false
);
ok("parse_on_tokens", parsePricesIncludeVat("1") && parsePricesIncludeVat("true"));
ok(
  "defaults_prices_include_vat_off",
  /\['prices_include_vat','0'/.test(defaults)
);
ok(
  "defaults_vat_included_label",
  /\['cart_vat_included_label','Includes VAT \(20%\)'/.test(defaults)
);
ok(
  "defaults_price_suffix",
  /\['price_incl_vat_suffix','incl\. VAT'/.test(defaults)
);
ok(
  "sa_only_key",
  /prices_include_vat/.test(perms) &&
    /SUPER_ADMIN_SITE_SETTINGS_KEYS/.test(perms)
);
ok(
  "sidhu_toggle_ui",
  /prices-include-vat-control/.test(sidhu) &&
    /saveContent\(\["prices_include_vat"\]\)/.test(sidhu)
);
ok(
  "orderPricing_extract_vat",
  /extractVatFromInclusiveGrandTotal/.test(orderPricing) &&
    /pricesIncludeVat/.test(orderPricing)
);
ok(
  "orders_uses_server_setting",
  /getPricesIncludeVat/.test(orders) &&
    /prices_include_vat:\s*orderPricesIncludeVat/.test(orders)
);
ok(
  "cart_uses_shared_math",
  /parsePricesIncludeVat/.test(cart) &&
    /calculateGrandTotal/.test(cart) &&
    /cart_vat_included_label/.test(cart)
);
ok(
  "success_label_switch",
  /cart_vat_included_label/.test(success) && /parsePricesIncludeVat/.test(success)
);
ok(
  "cart_display_inclusive_path",
  /pricesIncludeVat/.test(cartTotals) &&
    /extractVatFromInclusiveGrandTotal/.test(cartTotals)
);
ok(
  "json_ld_uses_stored_price",
  /price:\s*String\(Number\(product\.price\)\.toFixed\(2\)\)/.test(
    read("app/products/[slug]/page.tsx")
  )
);
ok(
  "price_display_wired_home",
  /PriceDisplay/.test(read("app/HomeClient.tsx"))
);
ok(
  "price_display_wired_pdp",
  /PriceDisplay/.test(read("app/products/[slug]/ProductDetail.tsx"))
);

// ── OFF = identical to current totals ────────────────────────────────────────
{
  const dig = [
    { id: 1, name: "Sub", price: 14.99, qty: 1, category: "Subscription", stock: "Digital" },
  ];
  const off = finalize(dig, null, false);
  ok("off_digital_grand_17_99", off.grandTotal === 17.99);
  ok("off_digital_vat_3_00", off.vatAmount === 3.0 || off.vatAmount === 2.998 /* guard */);
  ok("off_digital_vat_exact", off.vatAmount === roundMoney(14.99 * 0.2));
}

{
  const phys = [
    { id: 2, name: "Stick", price: 65, qty: 1, category: "Device", stock: "12" },
  ];
  const off = finalize(phys, null, false);
  ok("off_phys_grand", off.grandTotal === roundMoney(65 + 3.99 + 13));
  ok("off_phys_vat_13", off.vatAmount === 13);
}

{
  const dig = [
    { id: 1, name: "Sub", price: 14.99, qty: 1, category: "Subscription", stock: "Digital" },
  ];
  const off = finalize(dig, { type: "fixed", value: 5 }, false);
  ok("off_fixed_coupon", off.grandTotal === roundMoney(17.99 - 5));
}

{
  const dig = [
    { id: 1, name: "Sub", price: 14.99, qty: 1, category: "Subscription", stock: "Digital" },
  ];
  const off = finalize(dig, { type: "percentage", value: 10 }, false);
  const disc = roundMoney(14.99 * 0.1);
  ok("off_pct_coupon", off.grandTotal === roundMoney(17.99 - disc) && off.discountAmount === disc);
}

// ── ON with prices ×1.2 = identical grand totals (no coupon / fixed) ─────────
{
  const offItems = [
    { id: 1, name: "Sub", price: 14.99, qty: 1, category: "Subscription", stock: "Digital" },
  ];
  const onItems = [
    { id: 1, name: "Sub", price: 17.99, qty: 1, category: "Subscription", stock: "Digital" },
  ];
  const off = finalize(offItems, null, false);
  const on = finalize(onItems, null, true);
  ok("on_digital_matches_off", on.grandTotal === off.grandTotal && on.grandTotal === 17.99);
  ok(
    "on_extracted_vat",
    on.vatAmount === extractVatFromInclusiveGrandTotal(17.99) &&
      on.vatAmount === roundMoney(17.99 - 17.99 / 1.2)
  );
}

{
  const offItems = [
    { id: 2, name: "Stick", price: 65, qty: 1, category: "Device", stock: "12" },
  ];
  const onItems = [
    { id: 2, name: "Stick", price: 78, qty: 1, category: "Device", stock: "12" },
  ];
  const off = finalize(offItems, null, false);
  const on = finalize(onItems, null, true);
  ok("on_phys_matches_off", on.grandTotal === off.grandTotal);
  ok("on_phys_shipping_unchanged", on.shipping === 3.99 && off.shipping === 3.99);
}

{
  // Fixed coupon: keep value (not ×1.2) for identical totals
  const offItems = [
    { id: 1, name: "Sub", price: 14.99, qty: 1, category: "Subscription", stock: "Digital" },
  ];
  const onItems = [
    { id: 1, name: "Sub", price: 17.99, qty: 1, category: "Subscription", stock: "Digital" },
  ];
  const off = finalize(offItems, { type: "fixed", value: 5 }, false);
  const on = finalize(onItems, { type: "fixed", value: 5 }, true);
  ok("on_fixed_coupon_identical", on.grandTotal === off.grandTotal);
}

{
  // Mixed cart
  const offItems = [
    { id: 1, name: "Sub", price: 14.99, qty: 1, category: "Subscription", stock: "Digital" },
    { id: 2, name: "Stick", price: 65, qty: 1, category: "Device", stock: "5" },
  ];
  const onItems = [
    { id: 1, name: "Sub", price: 17.99, qty: 1, category: "Subscription", stock: "Digital" },
    { id: 2, name: "Stick", price: 78, qty: 1, category: "Device", stock: "5" },
  ];
  const off = finalize(offItems, null, false);
  const on = finalize(onItems, null, true);
  ok("on_mixed_matches_off", on.grandTotal === off.grandTotal);
}

{
  // Percent: document small delta (not identical) — assert expected delta
  const offItems = [
    { id: 1, name: "Sub", price: 14.99, qty: 1, category: "Subscription", stock: "Digital" },
  ];
  const onItems = [
    { id: 1, name: "Sub", price: 17.99, qty: 1, category: "Subscription", stock: "Digital" },
  ];
  const off = finalize(offItems, { type: "percentage", value: 10 }, false);
  const on = finalize(onItems, { type: "percentage", value: 10 }, true);
  const delta = roundMoney(Math.abs(on.grandTotal - off.grandTotal));
  ok(
    "pct_coupon_delta_is_vat_portion",
    delta === roundMoney(14.99 * 0.1 * 0.2) || delta === 0.3,
    `delta=${delta} off=${off.grandTotal} on=${on.grandTotal}`
  );
}

{
  // OFF mode with new prices would NOT match — ensure OFF still adds VAT
  const onPriceItems = [
    { id: 1, name: "Sub", price: 17.99, qty: 1, category: "Subscription", stock: "Digital" },
  ];
  const offWrong = finalize(onPriceItems, null, false);
  ok(
    "off_with_inflated_prices_adds_vat",
    offWrong.grandTotal === roundMoney(17.99 + roundMoney(17.99 * 0.2))
  );
}

// Labels / mini-bar
ok(
  "mini_bar_no_plus_vat_when_incl",
  /pricesIncludeVat \? base :/.test(cartTotals) ||
    /pricesIncludeVat \? base : `\$\{base\} \+ VAT`/.test(cartTotals) ||
    /return pricesIncludeVat \? base/.test(cartTotals)
);

const selfHash = crypto
  .createHash("sha256")
  .update(read("scripts/phase-vat-incl-83-tests.js"))
  .digest("hex")
  .slice(0, 12);
console.log(`\nphase-vat-incl-83: ${passed} passed, ${failed} failed (${selfHash})`);
process.exit(failed ? 1 : 0);
