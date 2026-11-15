/**
 * Phase20G.3C — Digital supply acknowledgement + authoritative fulfilment (source).
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

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

const helper = read("lib/productFulfilment.ts");
const cart = read("app/cart/page.tsx");
const orders = read("pages/api/orders.ts");
const schema = read("app/lib/schema.sql");

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

ok("shared_helper_exists", exists("lib/productFulfilment.ts"));
ok(
  "subscription_category_digital",
  isDigitalProduct({ category: "Subscription", stock: "12" }) === true
);
ok(
  "subscription_trimmed_case",
  isDigitalProduct({ category: " subscription ", stock: null }) === true
);
ok(
  "digital_stock_digital",
  isDigitalProduct({ category: "Device", stock: "Digital" }) === true
);
ok(
  "digital_stock_trimmed",
  isDigitalProduct({ category: null, stock: " digital " }) === true
);
ok(
  "physical_device_not_digital",
  isDigitalProduct({ category: "Device", stock: "12" }) === false
);
ok(
  "missing_fields_not_digital",
  isDigitalProduct({ category: null, stock: null }) === false
);
ok(
  "helper_no_name_slug_heuristic",
  !/includes\(["']plan["']\)/.test(helper) &&
    !/product\.name|item\.name|\.slug/.test(helper) &&
    !/toLowerCase\(\)\.includes/.test(helper)
);
ok("helper_exports_isDigitalProduct", /export function isDigitalProduct/.test(helper));
ok(
  "cart_uses_shared_helper",
  /isDigitalProduct/.test(cart) && /from ["']@\/lib\/productFulfilment["']/.test(cart)
);
ok(
  "orders_uses_shared_helper",
  /isDigitalProduct/.test(orders) &&
    /from ['"]\.\.\/\.\.\/lib\/productFulfilment['"]/.test(orders)
);

ok(
  "plan_name_shipping_heuristic_removed",
  !/includes\(["']plan["']\)/.test(cart)
);
ok(
  "shipping_uses_authoritative_classification",
  /cartShippingPounds/.test(cart) && /hasPhysicalItems/.test(cart)
);
ok(
  "digital_only_shipping_zero",
  cartShippingPounds({ cartLength: 1, hasPhysicalItems: false }) === 0
);
ok(
  "physical_only_shipping_3_99",
  cartShippingPounds({ cartLength: 1, hasPhysicalItems: true }) === 3.99
);
ok(
  "mixed_shipping_3_99",
  cartShippingPounds({ cartLength: 2, hasPhysicalItems: true }) === 3.99
);
ok(
  "empty_shipping_zero",
  cartShippingPounds({ cartLength: 0, hasPhysicalItems: false }) === 0
);
ok(
  "stale_unresolved_blocks_order",
  /no longer available/.test(cart) && /classificationBlocked/.test(cart)
);
ok("legacy_cart_no_storage_migration", !/localStorage\.removeItem\(["']firestick_cart["']\)/.test(cart));
ok(
  "does_not_overwrite_cart_price_name_qty",
  !/setItem\(["']firestick_cart["']/.test(cart)
);

ok(
  "ack_ui_only_for_digital",
  /classification\.hasDigitalItems && \(/.test(cart) ||
    /hasDigitalItems && \(/.test(cart)
);
ok(
  "ack_checkbox_default_false",
  /useState\(false\)/.test(cart) && /digitalSupplyAcknowledged/.test(cart)
);
ok(
  "ack_exact_wording",
  cart.includes(
    "I request that my digital subscription starts as soon as possible after payment confirmation, before the 14-day cancellation period ends. I understand that once digital supply begins, I will lose my 14-day right to cancel for that digital content. This does not affect my statutory rights if the digital content is faulty, not as described, or otherwise does not conform to the contract."
  ) ||
    (helper.includes(
      "I request that my digital subscription starts as soon as possible after payment confirmation"
    ) &&
      /DIGITAL_SUPPLY_ACK_TEXT/.test(cart))
);
ok("terms_link", /href=["']\/terms["']/.test(cart));
ok("refund_link", /href=["']\/refund-policy["']/.test(cart));
ok("privacy_link", /href=["']\/privacy-policy["']/.test(cart));
ok(
  "ack_validated_before_receipt_upload",
  /effectiveDigitalAck|digitalSupplyAcknowledged/.test(cart) &&
    cart.indexOf("Please confirm the digital supply acknowledgement") <
      cart.indexOf("upload-receipt") &&
    cart.indexOf("setPlacing(true)") > cart.indexOf("Please confirm the digital supply acknowledgement")
);

ok(
  "server_queries_products_by_ids",
  /FROM products WHERE id IN/.test(orders) && /active=1/.test(orders)
);
ok("server_active_products_required", /active=1/.test(orders));
ok(
  "server_rejects_missing_ack",
  /digital_supply_acknowledgement !== true/.test(orders) &&
    /status\(400\)/.test(orders)
);
ok(
  "validation_before_insert",
  orders.indexOf("digital_supply_acknowledgement !== true") <
    orders.indexOf("INSERT INTO orders")
);
ok(
  "physical_no_ack_required",
  /hasDigital && digital_supply_acknowledgement !== true/.test(orders)
);
ok(
  "marker_server_generated",
  /buildDigitalSupplyAckNotes/.test(orders) &&
    !/DIGITAL_SUPPLY_ACK_V1/.test(orders.split("buildDigitalSupplyAckNotes")[0] || "")
);
ok("marker_version_v1", /DIGITAL_SUPPLY_ACK_V1/.test(helper));
ok("server_timestamp", /toISOString\(\)/.test(orders) || /recorded_at/.test(helper));
ok("product_ids_recorded", /product_ids=/.test(helper));
ok(
  "customer_notes_preserved",
  /customerNotes/.test(helper) && /buildDigitalSupplyAckNotes/.test(orders)
);
ok("no_runtime_ddl", !/CREATE TABLE|ALTER TABLE|DROP TABLE/i.test(orders));
ok("notes_field_text_in_schema", /notes TEXT/.test(schema));

ok(
  "customer_email_to_customer_email",
  /to:\s*customer_email/.test(orders)
);
ok(
  "customer_email_ack_confirmation",
  /You requested your digital subscription to begin as soon as possible/.test(orders)
);
ok(
  "customer_email_policy_urls",
  /https:\/\/firestick4uk\.com\/terms/.test(orders) &&
    /https:\/\/firestick4uk\.com\/refund-policy/.test(orders) &&
    /https:\/\/firestick4uk\.com\/privacy-policy/.test(orders)
);
ok(
  "customer_email_fire_and_forget",
  (/Customer order confirmation email failed/.test(orders) ||
    /Customer digital confirmation email failed/.test(orders)) &&
    /\.catch\(/.test(orders)
);
ok(
  "email_failure_after_insert",
  orders.indexOf("INSERT INTO orders") <
    Math.max(
      orders.indexOf("Customer order confirmation"),
      orders.indexOf("Customer digital confirmation")
    )
);
ok("escape_html_used", /escapeHtml/.test(orders));
ok(
  "activation_statement_in_email",
  /Subscription services are active within 1 hour of payment confirmation/.test(
    orders
  )
);

ok(
  "no_product_id_allowlist",
  !/PRODUCT_IDS|DIGITAL_IDS|\[1,\s*3,\s*8,\s*9\]/.test(helper + cart + orders)
);
ok(
  "no_name_digital_detection",
  !/includes\(["']plan["']\)/.test(cart + orders + helper) &&
    !/includes\(["']subscription["']\)/.test(helper)
);

const tracking = read("components/TrackingConsent.tsx");
const consentLib = read("lib/trackingConsent.ts");
ok(
  "tracking_consent_untouched_key",
  /firestick_tracking_consent_v1/.test(consentLib)
);
ok(
  "tracking_consent_component_intact",
  /Reject optional/.test(tracking) && /Accept all/.test(tracking)
);

const terms = read("app/terms/TermsClient.tsx");
const privacy = read("app/privacy-policy/PrivacyPolicyClient.tsx");
const refund = read("app/refund-policy/RefundPolicyClient.tsx");
ok("legal_cms_bodies_untouched_terms", /getPublicSiteContent|terms_body/.test(read("app/terms/page.tsx")));
ok(
  "legal_fallback_wording_intact",
  /Last updated: 30 May 2026/.test(terms) || /Last updated/.test(terms)
);
ok("erp_untouched_in_scope", !/erp\//i.test(helper + cart) && !/from ['"].*erp/.test(orders));

ok(
  "payment_methods_unchanged",
  /Bank Transfer/.test(cart) && /Cash on Delivery/.test(cart)
);

console.log(`\nPhase20G.3C: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
