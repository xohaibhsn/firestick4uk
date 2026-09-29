/**
 * Admin order-notification email HTML escaping + subject CR/LF hardening.
 */
const fs = require("fs");
const path = require("path");
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

function loadContentHtmlHelpers() {
  const src = read("lib/contentHtml.ts");
  const { outputText } = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
    },
  });
  const exportsBag = {};
  const moduleBag = { exports: exportsBag };
  // Avoid identifier `module` — Next eslint bans assigning to it.
  const patched = outputText.replace(/\bmodule\b/g, "moduleBag");
  const run = new Function("exports", "moduleBag", "require", patched);
  run(exportsBag, moduleBag, require);
  return moduleBag.exports && Object.keys(moduleBag.exports).length
    ? moduleBag.exports
    : exportsBag;
}

const orders = read("pages/api/orders.ts");
const contentHtml = read("lib/contentHtml.ts");
const helpers = loadContentHtmlHelpers();
const {
  escapeHtml,
  escapeHtmlWithLineBreaks,
  sanitizeEmailHeaderText,
} = helpers;

ok("escapeHtml_exported", typeof escapeHtml === "function");
ok(
  "orders_imports_escape_helpers",
  /escapeHtml/.test(orders) &&
    /escapeHtmlWithLineBreaks/.test(orders) &&
    /sanitizeEmailHeaderText/.test(orders)
);

ok(
  "admin_safe_vars_defined",
  /safeAdminOrderId/.test(orders) &&
    /safeAdminCustomerName/.test(orders) &&
    /safeAdminCustomerEmail/.test(orders) &&
    /safeAdminCustomerPhone/.test(orders) &&
    /safeAdminAddress/.test(orders) &&
    /safeAdminPaymentReference/.test(orders) &&
    /safeAdminNotes/.test(orders) &&
    /safeAdminCouponCode/.test(orders)
);

// Admin HTML uses escaped vars (not raw customer_* in template after safe defs)
const adminHtmlSlice = orders.slice(
  orders.indexOf("safeAdminOrderId"),
  orders.indexOf("Customer order confirmation")
);
ok(
  "admin_html_uses_safe_name",
  /\$\{safeAdminCustomerName\}/.test(adminHtmlSlice) &&
    !/\$\{customer_name\}/.test(adminHtmlSlice)
);
ok(
  "admin_html_uses_safe_email",
  /\$\{safeAdminCustomerEmail\}/.test(adminHtmlSlice)
);
ok(
  "admin_html_uses_safe_phone",
  /\$\{safeAdminCustomerPhone\}/.test(adminHtmlSlice)
);
ok(
  "admin_html_uses_safe_address",
  /\$\{safeAdminAddress\}/.test(adminHtmlSlice) &&
    !/\$\{\[delivery_address/.test(adminHtmlSlice)
);
ok(
  "admin_html_uses_safe_payment_ref",
  /\$\{safeAdminPaymentReference\}/.test(adminHtmlSlice)
);
ok(
  "admin_html_uses_safe_notes",
  /\$\{safeAdminNotes\}/.test(adminHtmlSlice) &&
    !/\$\{notesToStore\}/.test(adminHtmlSlice.replace(/notesToStore \?/, ""))
);
ok(
  "admin_notes_escape_before_br",
  /escapeHtmlWithLineBreaks\(notesToStore\)/.test(orders) ||
    /escapeHtml\(String\(notesToStore[\s\S]{0,40}\)\.replace/.test(orders)
);
ok(
  "admin_product_names_escaped",
  /const safeName = escapeHtml\(String\(i\.name/.test(orders) &&
    /\$\{safeName\}/.test(adminHtmlSlice)
);
ok(
  "admin_coupon_escaped",
  /\$\{safeAdminCouponCode\}/.test(adminHtmlSlice)
);
ok(
  "admin_order_id_escaped",
  /\$\{safeAdminOrderId\}/.test(adminHtmlSlice)
);
ok(
  "admin_subject_uses_sanitized_name",
  /subjectCustomerName = sanitizeEmailHeaderText\(customer_name\)/.test(orders) &&
    /New Order \$\{order_id\} — \$\{subjectCustomerName\}/.test(orders)
);

// Customer confirmation still escapes
const customerSlice = orders.slice(orders.indexOf("Customer order confirmation"));
ok(
  "customer_confirmation_escapes_name",
  /safeName = escapeHtml\(String\(customer_name/.test(customerSlice)
);
ok(
  "customer_confirmation_escapes_order_id",
  /safeOrderId = escapeHtml\(String\(order_id/.test(customerSlice)
);
ok(
  "customer_confirmation_escapes_product_names",
  /const name = escapeHtml\(String\(i\.name/.test(customerSlice)
);
ok(
  "customer_subject_unchanged_order_id_only",
  /subject: `Firestick4UK Order Confirmation — \$\{order_id\}`/.test(customerSlice)
);

// Hostile pure-helper tests
const hostileName = '<img src=x onerror=alert(1)>';
const escapedName = escapeHtml(hostileName);
ok(
  "hostile_name_escaped",
  escapedName.includes("&lt;img") &&
    escapedName.includes("&gt;") &&
    !escapedName.includes("<img") &&
    escapedName === "&lt;img src=x onerror=alert(1)&gt;"
);

const hostileNotes = "hello<script>alert(1)</script>\nsecond line";
const notesHtml = escapeHtmlWithLineBreaks(hostileNotes);
ok(
  "hostile_notes_escape_before_br",
  notesHtml.includes("&lt;script&gt;") &&
    !notesHtml.includes("<script>") &&
    notesHtml.includes("hello&lt;script&gt;alert(1)&lt;/script&gt;<br />second line")
);

const hostileProduct = "<b>Plan</b>";
ok(
  "hostile_product_escaped",
  escapeHtml(hostileProduct) === "&lt;b&gt;Plan&lt;/b&gt;"
);

const hostileCoupon = "SAVE<script>";
ok(
  "hostile_coupon_escaped",
  escapeHtml(hostileCoupon).includes("&lt;script&gt;") &&
    !escapeHtml(hostileCoupon).includes("<script>")
);

const hostileRef = "ABC<img src=x>";
ok(
  "hostile_reference_escaped",
  escapeHtml(hostileRef).includes("&lt;img") && !escapeHtml(hostileRef).includes("<img")
);

const headerInject = "Alice\r\nBcc: attacker@example.com";
const sanitized = sanitizeEmailHeaderText(headerInject);
ok(
  "subject_crlf_stripped",
  !/[\r\n]/.test(sanitized) &&
    sanitized.includes("Alice") &&
    sanitized.includes("Bcc: attacker@example.com") &&
    sanitized === "Alice Bcc: attacker@example.com"
);

const subjectLine = `🛍️ New Order ORD-1 — ${sanitized}`;
ok(
  "subject_single_line",
  !/[\r\n]/.test(subjectLine)
);

// Order flow protections unchanged
ok(
  "authoritative_pricing_intact",
  /calculateAuthoritativePricing/.test(orders) &&
    /calculateGrandTotal/.test(orders)
);
ok(
  "digital_ack_intact",
  /buildDigitalSupplyAckNotes/.test(orders) ||
    /DIGITAL_SUPPLY_ACK_V1/.test(orders) ||
    /digital_supply_acknowledgement/.test(orders)
);
ok(
  "transaction_intact",
  /beginTransaction/.test(orders) &&
    /conn\.commit\(\)/.test(orders) &&
    /conn\.release\(\)/.test(orders)
);
ok(
  "response_pricing_intact",
  /pricing:\s*\{/.test(orders) && /vat_amount/.test(orders)
);
ok(
  "no_smtp_env_hardcode_change",
  /smtp\.hostinger\.com/.test(orders) && /SMTP_USER/.test(orders)
);
ok(
  "erp_untouched",
  !/erp\//.test(orders) && !fs.existsSync(path.join(ROOT, "app/erp"))
);
ok(
  "helper_order_escape_then_br",
  /escapeHtml\(String\(value[\s\S]*?\)\)\.replace\(\/\\r\\n\|\\r\|\\n\/g,\s*["']<br \/>["']\)/.test(
    contentHtml
  ) || /escapeHtmlWithLineBreaks[\s\S]*escapeHtml[\s\S]*replace/.test(contentHtml)
);

console.log(`\nphase-admin-email-escaping: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
