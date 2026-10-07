/**
 * Order customer identity — at least one of name / email / phone after trim.
 * Source + pure gate simulation. Does not place orders or mutate DB.
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

// --- Mirrors lib/orderCustomerIdentity.ts ---
const CUSTOMER_IDENTITY_REQUIRED_MSG =
  "Please provide your name, email address, or WhatsApp / phone number.";

function normalizeCustomerIdentityField(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOrderCustomerIdentity(input) {
  return {
    customer_name: normalizeCustomerIdentityField(input.customer_name),
    customer_email: normalizeCustomerIdentityField(input.customer_email),
    customer_phone: normalizeCustomerIdentityField(input.customer_phone),
  };
}

function hasMeaningfulCustomerIdentity(identity) {
  return Boolean(
    identity.customer_name ||
      identity.customer_email ||
      identity.customer_phone
  );
}

const ALLOWED_PAYMENT_METHODS = new Set(["bank", "cod"]);

/** Early API pipeline through identity + payment method (no DB). */
function earlyOrderGate(body) {
  const identity = normalizeOrderCustomerIdentity(body);
  if (!hasMeaningfulCustomerIdentity(identity)) {
    return { status: 400, error: CUSTOMER_IDENTITY_REQUIRED_MSG, identity };
  }
  if (!ALLOWED_PAYMENT_METHODS.has(String(body.payment_method || ""))) {
    return { status: 400, error: "Invalid payment method.", identity };
  }
  return { status: "passed_identity_gate", identity };
}

const helper = read("lib/orderCustomerIdentity.ts");
const orders = read("pages/api/orders.ts");
const cart = read("app/cart/page.tsx");

ok("helper_exists", exists("lib/orderCustomerIdentity.ts"));
ok(
  "helper_exports_normalize",
  /export function normalizeOrderCustomerIdentity/.test(helper)
);
ok(
  "helper_exports_hasMeaningful",
  /export function hasMeaningfulCustomerIdentity/.test(helper)
);
ok(
  "helper_msg_constant",
  helper.includes(CUSTOMER_IDENTITY_REQUIRED_MSG)
);

ok(
  "orders_imports_identity_helper",
  /from ['\"]\.\.\/\.\.\/lib\/orderCustomerIdentity['\"]/.test(orders)
);
ok(
  "orders_rejects_blank_identity",
  /hasMeaningfulCustomerIdentity/.test(orders) &&
    /CUSTOMER_IDENTITY_REQUIRED_MSG/.test(orders) &&
    /status\(400\)/.test(orders)
);

const identityIdx = orders.indexOf("hasMeaningfulCustomerIdentity");
const paymentIdx = orders.indexOf("ALLOWED_PAYMENT_METHODS.has");
const poolIdx = orders.indexOf("pool.query");
const insertIdx = orders.indexOf("INSERT INTO orders");
ok(
  "orders_identity_before_payment_check",
  identityIdx > 0 && paymentIdx > identityIdx
);
ok(
  "orders_identity_before_db_query",
  identityIdx > 0 && poolIdx > identityIdx
);
ok(
  "orders_identity_before_insert",
  identityIdx > 0 && insertIdx > identityIdx
);
ok(
  "orders_uses_normalized_identity_fields",
  /normalizeOrderCustomerIdentity/.test(orders) &&
    /customer_name, customer_email, customer_phone/.test(orders)
);

ok(
  "cart_imports_identity_helper",
  /from ['\"]@\/lib\/orderCustomerIdentity['\"]/.test(cart)
);
ok(
  "cart_checks_identity_before_receipt_upload",
  (() => {
    const idCheck = cart.indexOf("hasMeaningfulCustomerIdentity");
    const upload = cart.indexOf("/api/upload-receipt");
    const ordersCall = cart.indexOf('fetch("/api/orders"');
    return idCheck > 0 && upload > idCheck && ordersCall > idCheck;
  })()
);
ok(
  "cart_shows_identity_error_ui",
  /CUSTOMER_IDENTITY_REQUIRED_MSG/.test(cart) && /setOrderError/.test(cart)
);

ok(
  "cart_wa_uses_normalized_name",
  /`👤 \*Name:\* \$\{identity\.customer_name\}`/.test(cart) &&
    !/`👤 \*Name:\* \$\{form\.name\}`/.test(cart)
);
ok(
  "cart_wa_uses_normalized_email",
  /`📧 \*Email:\* \$\{identity\.customer_email\}`/.test(cart) &&
    !/`📧 \*Email:\* \$\{form\.email\}`/.test(cart)
);
ok(
  "cart_wa_uses_normalized_phone",
  /`📱 \*Phone:\* \$\{identity\.customer_phone\}`/.test(cart) &&
    !/`📱 \*Phone:\* \$\{form\.phone\}`/.test(cart)
);
ok(
  "cart_orderSuccess_stores_normalized_form",
  /const normalizedForm = \{[\s\S]*?name:\s*identity\.customer_name[\s\S]*?email:\s*identity\.customer_email[\s\S]*?phone:\s*identity\.customer_phone[\s\S]*?\}/.test(
    cart
  ) && /form:\s*normalizedForm/.test(cart) && !/couponApplied: authCouponApplied, form, paymentMethod/.test(cart)
);

// TEST 1 — all empty
{
  const r = earlyOrderGate({
    customer_name: "",
    customer_email: "",
    customer_phone: "",
    payment_method: "bank",
  });
  ok(
    "blank_identity_rejected_400",
    r.status === 400 && r.error === CUSTOMER_IDENTITY_REQUIRED_MSG
  );
}

// TEST 2 — whitespace only
{
  const r = earlyOrderGate({
    customer_name: "   ",
    customer_email: " ",
    customer_phone: "\t",
    payment_method: "bank",
  });
  ok(
    "whitespace_identity_rejected_400",
    r.status === 400 && r.error === CUSTOMER_IDENTITY_REQUIRED_MSG
  );
}

// TEST 3 — name only passes identity gate (fails later on payment)
{
  const r = earlyOrderGate({
    customer_name: "John Smith",
    customer_email: "",
    customer_phone: "",
    payment_method: "not-a-method",
  });
  ok(
    "name_only_passes_identity_gate",
    r.status === 400 &&
      r.error === "Invalid payment method." &&
      r.identity.customer_name === "John Smith"
  );
}

// TEST 4 — email only
{
  const r = earlyOrderGate({
    customer_name: "",
    customer_email: "john@example.com",
    customer_phone: null,
    payment_method: "paypal",
  });
  ok(
    "email_only_passes_identity_gate",
    r.status === 400 &&
      r.error === "Invalid payment method." &&
      r.identity.customer_email === "john@example.com"
  );
}

// TEST 5 — phone only
{
  const r = earlyOrderGate({
    customer_name: undefined,
    customer_email: 123,
    customer_phone: "+44 7700 900000",
    payment_method: "",
  });
  ok(
    "phone_only_passes_identity_gate",
    r.status === 400 &&
      r.error === "Invalid payment method." &&
      r.identity.customer_phone === "+44 7700 900000" &&
      r.identity.customer_name === "" &&
      r.identity.customer_email === ""
  );
}

ok(
  "non_string_identity_normalizes_empty",
  normalizeOrderCustomerIdentity({
    customer_name: null,
    customer_email: { x: 1 },
    customer_phone: ["a"],
  }).customer_name === "" &&
    normalizeOrderCustomerIdentity({
      customer_name: null,
      customer_email: { x: 1 },
      customer_phone: ["a"],
    }).customer_email === "" &&
    normalizeOrderCustomerIdentity({
      customer_name: null,
      customer_email: { x: 1 },
      customer_phone: ["a"],
    }).customer_phone === ""
);

ok(
  "trim_preserves_meaningful_value",
  normalizeOrderCustomerIdentity({
    customer_name: "  Ada  ",
    customer_email: " ",
    customer_phone: "\t",
  }).customer_name === "Ada"
);

ok("no_runtime_ddl_helper", !/\b(CREATE|ALTER|DROP)\s+(TABLE|DATABASE)/i.test(helper));
ok("no_erp_in_helper", !/\berp\b|\bodoo\b|\bsage\b/i.test(helper));

console.log(`\nphase-order-customer-identity: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
