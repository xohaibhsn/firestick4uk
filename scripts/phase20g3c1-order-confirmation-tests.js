/**
 * Phase20G.3C.1 — Universal customer order confirmation + checkout policy links.
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

const orders = read("pages/api/orders.ts");
const cart = read("app/cart/page.tsx");
const helper = read("lib/productFulfilment.ts");
const tracking = read("components/TrackingConsent.tsx");
const consentLib = read("lib/trackingConsent.ts");

const customerSendIdx = orders.indexOf("Customer order confirmation email failed");
const insertIdx = orders.indexOf("INSERT INTO orders");
const hasDigitalGate = /if\s*\(\s*hasDigital\s*&&\s*customer_email\s*\)/.test(orders);
const customerEmailGate = /if\s*\(\s*customer_email\s*\)/.test(orders);

ok("customer_email_not_gated_by_hasDigital", !hasDigitalGate);
ok("customer_email_requires_customer_email", customerEmailGate);
ok(
  "exactly_one_customer_confirmation_send",
  (orders.match(/to:\s*customer_email/g) || []).length === 1
);
ok(
  "physical_gets_base_confirmation",
  customerEmailGate &&
    /Firestick4UK Order Confirmation/.test(orders) &&
    /pending/.test(orders)
);
ok(
  "digital_section_conditional",
  /const digitalSection = hasDigital/.test(orders) ||
    /digitalSection = hasDigital/.test(orders)
);
ok(
  "digital_section_includes_ack",
  /You requested your digital subscription to begin as soon as possible/.test(
    orders
  )
);
ok(
  "digital_section_includes_activation",
  /Subscription services are active within 1 hour of payment confirmation/.test(
    orders
  )
);
ok(
  "digital_section_includes_statutory",
  /does not affect your statutory rights if the digital content is faulty/.test(
    orders
  )
);
ok(
  "physical_email_omits_digital_when_false",
  /digitalSection/.test(orders) &&
    /\$\{digitalSection\}/.test(orders) &&
    /hasDigital[\s\S]{0,80}\?/.test(orders)
);
ok(
  "mixed_receives_digital_section_via_hasDigital",
  /hasDigital/.test(orders) && /digitalSection/.test(orders)
);
ok("terms_url", /https:\/\/firestick4uk\.com\/terms/.test(orders));
ok(
  "refund_url",
  /https:\/\/firestick4uk\.com\/refund-policy/.test(orders)
);
ok(
  "privacy_url",
  /https:\/\/firestick4uk\.com\/privacy-policy/.test(orders)
);

ok(
  "checkout_universal_policy_copy",
  /Please review our/.test(cart) &&
    /before placing your order/.test(cart)
);
ok("checkout_terms_link", /href=["']\/terms["']/.test(cart));
ok("checkout_refund_link", /href=["']\/refund-policy["']/.test(cart));
ok("checkout_privacy_link", /href=["']\/privacy-policy["']/.test(cart));
ok(
  "duplicate_digital_policy_link_row_removed",
  !/digital-ack-links/.test(cart)
);
ok(
  "digital_checkbox_remains",
  /digital-ack/.test(cart) &&
    /type="checkbox"/.test(cart) &&
    /classification\.hasDigitalItems/.test(cart)
);
ok(
  "exact_digital_ack_text_remains",
  /DIGITAL_SUPPLY_ACK_TEXT/.test(cart) &&
    helper.includes(
      "I request that my digital subscription starts as soon as possible after payment confirmation"
    )
);
ok(
  "customer_email_after_insert",
  insertIdx >= 0 &&
    customerSendIdx > insertIdx &&
    orders.indexOf("to: customer_email") > insertIdx
);
ok(
  "email_fire_and_forget",
  /\.catch\(/.test(orders) &&
    /Customer order confirmation email failed/.test(orders)
);
ok(
  "email_failure_does_not_affect_response",
  orders.indexOf("return res.status(200)") >
    orders.indexOf("to: customer_email")
);
ok(
  "digital_v1_marker_untouched",
  /DIGITAL_SUPPLY_ACK_V1/.test(helper) &&
    /buildDigitalSupplyAckNotes/.test(orders)
);
ok(
  "server_ack_enforcement_untouched",
  /digital_supply_acknowledgement !== true/.test(orders) &&
    /status\(400\)/.test(orders)
);
ok(
  "classification_untouched",
  /export function isDigitalProduct/.test(helper) &&
    /category === "subscription"/.test(helper) &&
    /stock === "digital"/.test(helper)
);
ok(
  "shipping_helper_untouched",
  /export function cartShippingPounds/.test(helper) &&
    /PHYSICAL_SHIPPING_GBP = 3\.99/.test(helper)
);
ok(
  "tracking_consent_untouched",
  /firestick_tracking_consent_v1/.test(consentLib) &&
    /Reject optional/.test(tracking)
);
ok(
  "legal_cms_untouched",
  /getPublicSiteContent/.test(read("app/terms/page.tsx")) &&
    /getPublicSiteContent/.test(read("app/privacy-policy/page.tsx"))
);
ok("no_runtime_ddl", !/CREATE TABLE|ALTER TABLE|DROP TABLE/i.test(orders + cart));
ok("erp_untouched", !/erp\//i.test(orders) && !/erp\//i.test(cart));
ok("escapeHtml_used", /escapeHtml/.test(orders));
ok(
  "policy_links_before_place_order",
  cart.indexOf("checkout-policy-links") < cart.indexOf("place-order-btn") ||
    cart.indexOf("Please review our") <
      cart.indexOf('t("cart_place_order"')
);
ok(
  "only_one_sendMail_to_customer",
  (orders.match(/to:\s*customer_email/g) || []).length === 1 &&
    (orders.match(/Firestick4UK Order Confirmation/g) || []).length === 1
);

console.log(`\nPhase20G.3C.1: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
