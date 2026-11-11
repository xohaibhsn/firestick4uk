/**
 * F4UK-CART-VISIBILITY-AND-ORDER-EMAIL-47 — admin order email receipt status.
 * Plain Node + mocked mailer (no SMTP, no DB writes).
 */
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..");
let passed = 0;
let failed = 0;

function ok(name, cond, detail) {
  if (cond) {
    passed++;
    console.log("PASS  " + name + (detail ? " — " + detail : ""));
  } else {
    failed++;
    console.error("FAIL  " + name + (detail ? " — " + detail : ""));
  }
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const orders = read("pages/api/orders.ts");

ok("receipt_status_attached_phrase", /Receipt:\s*attached/.test(orders));
ok("receipt_status_not_uploaded_phrase", /Receipt:\s*not uploaded/.test(orders));
ok(
  "receipt_sidhu_hint_when_attached",
  /view in \/sidhu → Orders/.test(orders) || /view in \/sidhu/.test(orders)
);
ok(
  "receipt_status_html_escaped",
  /safeAdminReceiptStatus\s*=\s*escapeHtml\(receiptStatusLine\)/.test(orders) &&
    /\$\{safeAdminReceiptStatus\}/.test(orders)
);
ok(
  "no_receipt_file_attachment",
  !/attachments\s*:/.test(orders) &&
    !/attach\(/.test(orders) &&
    !/contentType:\s*['"]application\//.test(orders)
);
ok(
  "no_public_receipt_url_in_admin_email",
  !/uploads\/receipts/.test(
    orders.slice(
      orders.indexOf("New Order Received"),
      orders.indexOf("Customer order confirmation")
    )
  ) &&
    !/\$\{receipt_path\}/.test(
      orders.slice(
        orders.indexOf("New Order Received"),
        orders.indexOf("Customer order confirmation")
      )
    )
);
ok(
  "admin_subject_unchanged",
  /subject:\s*`🛍️ New Order \$\{order_id\} — \$\{subjectCustomerName\}`/.test(orders)
);
ok("admin_to_still_contact_email", /to:\s*contact\.email/.test(orders));
ok(
  "email_still_sent_without_receipt_gate",
  /receiptUploaded/.test(orders) &&
    !/if\s*\(\s*receiptUploaded\s*\)\s*\{[\s\S]{0,80}sendMail/.test(orders) &&
    /transporter\.sendMail\(/.test(orders)
);
ok(
  "generic_500_unchanged",
  /Unable to create order\. Please try again\./.test(orders)
);
ok(
  "bank_cod_validation_unchanged",
  /isPublicPaymentMethod/.test(orders) && /toDbPaymentMethod/.test(orders)
);

const helpers = (function () {
  const src = read("lib/contentHtml.ts");
  const out = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
    },
  }).outputText;
  const sandbox = { exports: {}, module: { exports: {} } };
  const fn = new Function("exports", "module", "require", out);
  fn(sandbox.exports, sandbox.module, require);
  return sandbox.module.exports && Object.keys(sandbox.module.exports).length
    ? sandbox.module.exports
    : sandbox.exports;
})();

const escapeHtml = helpers.escapeHtml;
ok("escapeHtml_loaded", typeof escapeHtml === "function");

function buildReceiptStatusLine(receipt_path) {
  const receiptUploaded = Boolean(String(receipt_path || "").trim());
  return receiptUploaded
    ? "Receipt: attached — view in /sidhu → Orders"
    : "Receipt: not uploaded";
}

const withReceipt = buildReceiptStatusLine("/uploads/receipts/123-x.jpg");
const withoutReceipt = buildReceiptStatusLine("");

ok("mock_receipt_attached_text", withReceipt.startsWith("Receipt: attached"));
ok("mock_receipt_not_uploaded_text", withoutReceipt === "Receipt: not uploaded");
ok(
  "escapeHtml_hostile_works",
  escapeHtml("<img src=x onerror=alert(1)>").includes("&lt;img") &&
    !escapeHtml("<img src=x onerror=alert(1)>").includes("<img")
);
ok(
  "status_line_does_not_embed_receipt_path",
  !withReceipt.includes("/uploads/receipts") &&
    !withReceipt.includes("123-x.jpg")
);

function simulateAdminSend(receipt_path) {
  const mails = [];
  const transporter = {
    sendMail: function (opts) {
      mails.push(opts);
      return Promise.resolve({});
    },
  };
  const receiptStatusLine = buildReceiptStatusLine(receipt_path);
  const safeAdminReceiptStatus = escapeHtml(receiptStatusLine);
  const html = "<tr><td>Receipt</td><td>" + safeAdminReceiptStatus + "</td></tr>";
  transporter.sendMail({
    from: '"Firestick4UK Orders" <noreply@firestick4uk.com>',
    to: "orders@example.com",
    subject: "🛍️ New Order ORD-1 — Test",
    html: html,
  });
  return mails;
}

const m1 = simulateAdminSend("/uploads/receipts/abc.jpg");
const m0 = simulateAdminSend("");
ok("mock_mail_sent_with_receipt", m1.length === 1 && /Receipt: attached/.test(m1[0].html));
ok("mock_mail_sent_without_receipt", m0.length === 1 && /Receipt: not uploaded/.test(m0[0].html));
ok(
  "mock_mail_no_attachments_field",
  m1[0].attachments === undefined && m0[0].attachments === undefined
);
ok("mock_mail_subject_shape", /^🛍️ New Order ORD-1 — Test$/.test(m1[0].subject));
ok("mock_mail_to_unchanged", m1[0].to === "orders@example.com");

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
