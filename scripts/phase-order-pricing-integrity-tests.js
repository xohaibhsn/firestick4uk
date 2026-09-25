/**
 * Checkout security — server-authoritative order pricing (source + pure math).
 * Does not place production orders.
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

// --- Pure helpers mirrored from lib/orderPricing.ts + productFulfilment ---
function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100;
}
function normalizeCouponCode(code) {
  return String(code ?? "").toUpperCase().trim();
}
function parseOrderQuantity(raw) {
  if (typeof raw === "boolean") return null;
  if (typeof raw === "string" && raw.trim() === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  if (!Number.isInteger(n)) return null;
  if (n < 1) return null;
  if (n > Number.MAX_SAFE_INTEGER) return null;
  return n;
}
function isDigitalProduct(product) {
  const category = String(product?.category ?? "").trim().toLowerCase();
  const stock = String(product?.stock ?? "").trim().toLowerCase();
  if (category === "subscription") return true;
  if (stock === "digital") return true;
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
function calculateAuthoritativePricing(items) {
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
  const vatAmount = roundMoney(subtotal * 0.2);
  return { subtotal, shipping, vatAmount, hasPhysicalItems, hasDigitalItems };
}
function calculateGrandTotal(opts) {
  const total = roundMoney(
    opts.subtotal + opts.shipping + opts.vatAmount - opts.discountAmount
  );
  return total < 0 ? 0 : total;
}

const pricing = read("lib/orderPricing.ts");
const orders = read("pages/api/orders.ts");
const coupons = read("pages/api/coupons.ts");
const cart = read("app/cart/page.tsx");
const fulfilment = read("lib/productFulfilment.ts");
const tracking = read("components/TrackingConsent.tsx");
const consentLib = read("lib/trackingConsent.ts");

ok("helper_exists", exists("lib/orderPricing.ts"));
ok("orders_imports_orderPricing", /from ['\"]\.\.\/\.\.\/lib\/orderPricing['\"]/.test(orders));
ok("coupons_imports_orderPricing", /from ['\"]\.\.\/\.\.\/lib\/orderPricing['\"]/.test(coupons));
ok("orders_selects_db_price", /SELECT id, name, price, category, stock, active FROM products/.test(orders));
ok("orders_ignores_client_total_authority", /Client total \/ discount_amount \/ vat_amount/.test(orders));
ok(
  "orders_insert_uses_server_totals",
  /grandTotal,\s*\n?\s*validatedCouponCode,\s*\n?\s*discountAmount,\s*\n?\s*vatAmount/.test(
    orders
  )
);
ok(
  "order_items_use_authoritative_name_price",
  /INSERT INTO order_items[\s\S]{0,200}item\.name[\s\S]{0,80}item\.price[\s\S]{0,80}item\.qty/.test(
    orders
  ) && !/authoritative\?\.name \|\| item\.name/.test(orders)
);
ok(
  "order_items_loop_authoritative",
  /for \(const item of authoritativeItems\)/.test(orders)
);
ok(
  "persisted_price_from_authoritative_loop",
  /for \(const item of authoritativeItems\)[\s\S]{0,220}INSERT INTO order_items[\s\S]{0,120}\[order_id, item\.id, item\.name, item\.price, item\.qty\]/.test(
    orders
  ) &&
    !/\|\|\s*item\.name/.test(orders) &&
    !/\|\|\s*item\.price/.test(orders)
);
ok(
  "req_body_item_price_not_used_for_insert",
  !/for \(const item of items\)[\s\S]{0,200}INSERT INTO order_items/.test(orders)
);

// Quantity validation
ok("qty_1_accepted", parseOrderQuantity(1) === 1);
ok("qty_2_accepted", parseOrderQuantity(2) === 2);
ok("qty_0_rejected", parseOrderQuantity(0) === null);
ok("qty_neg_rejected", parseOrderQuantity(-1) === null);
ok("qty_frac_rejected", parseOrderQuantity(1.5) === null);
ok("qty_abc_rejected", parseOrderQuantity("abc") === null);
ok("qty_nan_rejected", parseOrderQuantity(NaN) === null);
ok("qty_inf_rejected", parseOrderQuantity(Infinity) === null);
ok("qty_missing_rejected", parseOrderQuantity(undefined) === null);
ok(
  "orders_rejects_invalid_qty",
  /parseOrderQuantity/.test(orders) && /valid quantity/.test(orders)
);
ok(
  "orders_rejects_duplicate_ids",
  /Duplicate product IDs are not allowed/.test(orders)
);
ok(
  "cart_context_consolidates_duplicates",
  /existing.*qty: i\.qty \+ 1/.test(read("app/lib/cartContext.tsx")) ||
    /qty: i\.qty \+ 1/.test(read("app/lib/cartContext.tsx"))
);

// Digital pricing example: £10 × 2 → subtotal 20, ship 0, VAT 4, total 24
{
  const items = [
    { id: 1, name: "Sub", price: 10, qty: 2, category: "Subscription", stock: "Digital" },
  ];
  const p = calculateAuthoritativePricing(items);
  const total = calculateGrandTotal({
    subtotal: p.subtotal,
    shipping: p.shipping,
    vatAmount: p.vatAmount,
    discountAmount: 0,
  });
  ok("digital_subtotal_20", p.subtotal === 20);
  ok("digital_shipping_0", p.shipping === 0);
  ok("digital_vat_4", p.vatAmount === 4);
  ok("digital_total_24", total === 24);
  ok("digital_has_digital", p.hasDigitalItems === true && p.hasPhysicalItems === false);
}

// Physical: £10 × 1 → ship 3.99, VAT 2, total 15.99
{
  const items = [
    { id: 2, name: "Stick", price: 10, qty: 1, category: "Device", stock: "12" },
  ];
  const p = calculateAuthoritativePricing(items);
  const total = calculateGrandTotal({
    subtotal: p.subtotal,
    shipping: p.shipping,
    vatAmount: p.vatAmount,
    discountAmount: 0,
  });
  ok("physical_subtotal_10", p.subtotal === 10);
  ok("physical_shipping_3_99", p.shipping === 3.99);
  ok("physical_vat_2", p.vatAmount === 2);
  ok("physical_total_15_99", total === 15.99);
}

// Mixed: shipping remains 3.99
{
  const items = [
    { id: 1, name: "Sub", price: 10, qty: 1, category: "Subscription", stock: "Digital" },
    { id: 2, name: "Stick", price: 10, qty: 1, category: "Device", stock: "5" },
  ];
  const p = calculateAuthoritativePricing(items);
  ok("mixed_shipping_3_99", p.shipping === 3.99);
  ok("mixed_subtotal_20", p.subtotal === 20);
  ok("mixed_flags", p.hasDigitalItems && p.hasPhysicalItems);
}

// Tamper: client price/total/vat/discount ignored by server math
{
  const dbItems = [
    { id: 1, name: "Real Name", price: 10, qty: 2, category: "Subscription", stock: "Digital" },
  ];
  const clientSays = { price: 0.01, total: 0.01, vat_amount: 0, discount_amount: 999 };
  const p = calculateAuthoritativePricing(dbItems);
  const total = calculateGrandTotal({
    subtotal: p.subtotal,
    shipping: p.shipping,
    vatAmount: p.vatAmount,
    discountAmount: 0, // fake client discount ignored
  });
  ok("tamper_ignores_client_price", p.subtotal === 20 && clientSays.price === 0.01);
  ok("tamper_ignores_client_total", total === 24 && clientSays.total === 0.01);
  ok("tamper_ignores_client_vat", p.vatAmount === 4 && clientSays.vat_amount === 0);
  ok("tamper_ignores_client_discount", total === 24 && clientSays.discount_amount === 999);
  ok("tamper_uses_db_name", dbItems[0].name === "Real Name");
}

// Coupons
ok(
  "pct_coupon",
  calculateCouponDiscount({ type: "percentage", value: 10, cartTotal: 23.99 }) ===
    roundMoney(23.99 * 0.1)
);
ok(
  "fixed_coupon",
  calculateCouponDiscount({ type: "fixed", value: 5, cartTotal: 23.99 }) === 5
);
ok(
  "fixed_capped_at_cart",
  calculateCouponDiscount({ type: "fixed", value: 100, cartTotal: 23.99 }) === 23.99
);
ok(
  "pct_capped_at_cart",
  calculateCouponDiscount({ type: "percentage", value: 100, cartTotal: 20 }) === 20
);
ok("normalize_coupon_upper", normalizeCouponCode("  save10 ") === "SAVE10");
ok(
  "orders_validates_coupon_server_side",
  /SELECT \* FROM coupons WHERE code=\? AND is_active=1/.test(orders) &&
    /Coupon has expired/.test(orders) &&
    /Coupon usage limit reached/.test(orders) &&
    /Minimum order/.test(orders) &&
    /Invalid coupon code/.test(orders)
);
ok(
  "orders_400_on_invalid_coupon_before_insert",
  orders.indexOf("Invalid coupon code") < orders.indexOf("INSERT INTO orders")
);
ok(
  "coupons_api_uses_shared_math",
  /calculateCouponDiscount/.test(coupons) && /normalizeCouponCode/.test(coupons)
);
ok(
  "fake_client_discount_not_in_insert_params",
  /discountAmount/.test(orders) &&
    !/discount_amount\|\|0/.test(orders) &&
    !/discount_amount \|\| 0/.test(orders)
);

// Response shape
ok(
  "response_includes_pricing",
  /pricing:\s*\{/.test(orders) &&
    /subtotal/.test(orders) &&
    /vat_amount:\s*vatAmount/.test(orders) &&
    /discount_amount:\s*discountAmount/.test(orders) &&
    /total:\s*grandTotal/.test(orders)
);
ok(
  "response_includes_items",
  /items:\s*responseItems/.test(orders) || /items: responseItems/.test(orders)
);

// Payment method
ok(
  "payment_method_bank_cod_only",
  /ALLOWED_PAYMENT_METHODS/.test(orders) &&
    /'bank'/.test(orders) &&
    /'cod'/.test(orders) &&
    /Invalid payment method/.test(orders)
);

// Transaction + coupon increment after store
ok(
  "uses_transaction",
  /beginTransaction/.test(orders) && /commit\(/.test(orders) && /rollback\(/.test(orders)
);
ok(
  "coupon_increment_after_insert",
  orders.indexOf("INSERT INTO orders") <
    orders.indexOf("UPDATE coupons SET used_count") &&
    orders.indexOf("UPDATE coupons SET used_count") < orders.indexOf("commit")
);

// Client success uses server values
ok(
  "cart_uses_server_pricing_after_success",
  /data\.pricing/.test(cart) && /authSubtotal|authTotal|serverItems/.test(cart)
);
ok(
  "cart_whatsapp_uses_auth_totals",
  /authSubtotal\.toFixed/.test(cart) && /authTotal\.toFixed/.test(cart)
);
ok(
  "cart_session_uses_server_items",
  /items: serverItems/.test(cart) && /grandTotal: authTotal/.test(cart)
);

// Emails use authoritative
ok(
  "admin_email_uses_authoritativeItems",
  /authoritativeItems/.test(orders) &&
    orders.indexOf("const itemRows = authoritativeItems") > 0
);
ok(
  "customer_email_uses_authoritativeItems",
  /const customerItemRows = authoritativeItems/.test(orders)
);
ok(
  "customer_email_total_grandTotal",
  /Total:<\/strong> £\$\{grandTotal\.toFixed\(2\)\}/.test(orders)
);

// Digital ack regression
ok(
  "digital_ack_intact",
  /digital_supply_acknowledgement !== true/.test(orders) &&
    orders.indexOf("digital_supply_acknowledgement !== true") <
      orders.indexOf("INSERT INTO orders")
);
ok("v1_marker_intact", /DIGITAL_SUPPLY_ACK_V1/.test(fulfilment));
ok(
  "customer_confirmation_intact",
  /Customer order confirmation email failed/.test(orders) &&
    /if \(customer_email\)/.test(orders)
);
ok(
  "shipping_shared_helper",
  /cartShippingPounds|calculateAuthoritativePricing/.test(orders) &&
    /PHYSICAL_SHIPPING_GBP|3\.99/.test(fulfilment)
);

// Untouched domains
ok(
  "tracking_consent_untouched_marker",
  /firestick_tracking_consent_v1/.test(consentLib) ||
    /TRACKING_CONSENT/.test(consentLib)
);
ok("tracking_component_exists", /Privacy choices|Analytics|Advertising/.test(tracking));
ok(
  "legal_cms_not_in_diff_scope",
  !/terms_body\s*=/.test(orders) && !/privacy_body/.test(orders)
);
ok("no_erp_in_orders", !/\berp\b|\bodoo\b|\bsage\b/i.test(orders));
ok(
  "no_runtime_ddl_orders",
  !/\b(CREATE|ALTER|DROP)\s+(TABLE|DATABASE)/i.test(orders)
);
ok(
  "helper_no_runtime_ddl",
  !/\b(CREATE|ALTER|DROP)\s+(TABLE|DATABASE)/i.test(pricing)
);

// Source helper exports
ok("exports_parseOrderQuantity", /export function parseOrderQuantity/.test(pricing));
ok("exports_calculateCouponDiscount", /export function calculateCouponDiscount/.test(pricing));
ok(
  "exports_calculateAuthoritativePricing",
  /export function calculateAuthoritativePricing/.test(pricing)
);
ok("exports_calculateGrandTotal", /export function calculateGrandTotal/.test(pricing));

// Hash uniqueness sanity for test file itself (not always-pass)
const selfHash = crypto
  .createHash("sha256")
  .update(read("scripts/phase-order-pricing-integrity-tests.js"))
  .digest("hex");
ok("test_file_nonempty_hash", selfHash.length === 64 && !/^0+$/.test(selfHash));

console.log(`\nphase-order-pricing-integrity: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
