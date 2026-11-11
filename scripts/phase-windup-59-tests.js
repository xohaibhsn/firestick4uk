/**
 * F4UK-WINDUP-W1-59 — COD email wording, UX leftovers, allowlist.
 * Stub env + mocked nodemailer only. No real SMTP/DB/network.
 */
const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
process.env.DB_NAME = process.env.DB_NAME || "stub";
process.env.DB_HOST = process.env.DB_HOST || "127.0.0.1";
process.env.DB_USER = process.env.DB_USER || "stub";
delete process.env.DB_PASSWORD;
// Force email path with stub SMTP credentials (never printed).
process.env.SMTP_USER = "stub-smtp-user";
process.env.SMTP_PASS = "stub-smtp-pass";

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

const ALLOWLIST = new Set([
  "pages/api/orders.ts",
  "app/cart/success/page.tsx",
  "app/cart/page.tsx",
  "app/products/ProductsClient.tsx",
  "scripts/phase-jseo-b2-controls-tests.js",
  "scripts/phase-hostinger-h1-cms-bootstrap-tests.js",
  "scripts/phase-windup-59-tests.js",
  "scripts/phase-order-email-receipt-47-tests.js",
  // S3 CSS/component files are appended when present in the working tree / vs base.
]);

const BASE_SHA = "76067a765b091bbbf0f2d4375c3d17f0b3af53bc";

function diffAllowlistCheck() {
  let out = "";
  try {
    out = execSync(`git diff --name-only ${BASE_SHA}`, {
      cwd: ROOT,
      encoding: "utf8",
    });
  } catch (e) {
    ok("diff_allowlist", false, String(e.message || e));
    return;
  }
  const files = out
    .split(/\r?\n/)
    .map((s) => s.trim().replace(/\\/g, "/"))
    .filter(Boolean);
  const extras = files.filter((f) => {
    if (ALLOWLIST.has(f)) return false;
    // Allow S3 CSS under app/ or components/ when needed for focus rings.
    if (/^app\/.*\.(css|module\.css)$/.test(f)) return false;
    if (/^components\/.*\.(tsx|ts|css)$/.test(f) && !/Navbar|Footer/.test(f))
      return false;
    if (f === "app/globals.css" || f === "styles/globals.css") return false;
    return true;
  });
  const blocked = extras.filter(
    (f) =>
      /^lib\/insights/.test(f) ||
      /^pages\/api\/insights/.test(f) ||
      /^pages\/api\/admin-insights\//.test(f) ||
      f === "app/layout.tsx" ||
      /Navbar|Footer/.test(f)
  );
  ok(
    "diff_allowlist",
    extras.length === 0 && blocked.length === 0,
    extras.length
      ? `extra=${extras.join(",")}`
      : `ok files=${files.length || 0}`
  );
  ok(
    "diff_blocks_insights_seo_shell",
    blocked.length === 0,
    blocked.join(",") || "clean"
  );
}

// ——— Source shape (S1) ———
const orders = read("pages/api/orders.ts");
const success = read("app/cart/success/page.tsx");

ok(
  "s1_email_payment_helper",
  /emailPaymentMethodLabel/.test(orders) &&
    /Pay on Delivery \/ Activation/.test(orders) &&
    /Cash on Delivery/.test(orders) &&
    /Bank Transfer/.test(orders)
);
ok(
  "s1_cod_receipt_not_required",
  /Not required \(pay on delivery \/ activation\)/.test(orders)
);
ok(
  "s1_bank_receipt_strings_intact",
  /Attached — view in \/sidhu → Orders/.test(orders) &&
    /'Not uploaded'|\"Not uploaded\"/.test(orders)
);
ok(
  "s1_admin_notes_email_formatter",
  /formatAdminEmailNotesDisplay/.test(orders) &&
    /Digital supply acknowledgement: accepted/.test(orders) &&
    /\[DIGITAL_SUPPLY_ACK_V1\]/.test(orders)
);
ok(
  "s1_customer_cod_status_wording",
  /You chose to pay on delivery \/ activation/.test(orders) &&
    /You chose Cash on Delivery/.test(orders) &&
    /pending<\/strong> payment\/verification/.test(orders)
);
ok(
  "s1_subjects_unchanged",
  /subject:\s*`🛍️ New Order \$\{order_id\} — \$\{subjectCustomerName\}`/.test(
    orders
  ) &&
    /subject:\s*`Firestick4UK Order Confirmation — \$\{order_id\}`/.test(orders)
);
ok(
  "s1_sanitize_header_untouched_call",
  /sanitizeEmailHeaderText\(customer_name\)/.test(orders)
);
ok(
  "s1_success_cod_body",
  /success_body_cod/.test(success) &&
    /paymentMethod === ["']cod["']/.test(success) &&
    /You chose to pay on delivery \/ activation/.test(success)
);
ok(
  "s1_no_db_pattern_change_marker",
  /buildDigitalSupplyAckNotes/.test(orders) &&
    /INSERT INTO orders/.test(orders) &&
    /notesToStore/.test(orders)
);

// ——— Mocked order + email scenarios ———
const PRODUCTS = {
  1: {
    id: 1,
    name: "Firestick Device",
    price: 49.99,
    category: "Device",
    stock: "In Stock",
    active: 1,
  },
  3: {
    id: 3,
    name: "IPTV Subscription",
    price: 29.99,
    category: "Subscription",
    stock: "Digital",
    active: 1,
  },
};

const LEGACY_BASELINE_COLS = [
  "id",
  "name",
  "active",
  "price",
  "category",
  "stock",
  "slug",
  "description",
  "short_description",
  "full_description",
  "badge",
  "image",
  "features",
  "seo_title",
  "meta_description",
  "focus_keyword",
  "og_image",
];

let lastInsertNotes = null;
let lastInsertPayment = null;
let sentMails = [];

function sqlText(arg) {
  if (typeof arg === "string") return arg;
  if (arg && typeof arg === "object" && arg.sql) return String(arg.sql);
  return String(arg || "");
}
function sqlParams(arg, maybeParams) {
  if (arg && typeof arg === "object" && arg.sql) return arg.values || [];
  return maybeParams || [];
}

function makeConn() {
  return {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
    async query(arg, maybeParams) {
      const sql = sqlText(arg);
      const params = sqlParams(arg, maybeParams);
      if (/information_schema\.COLUMNS/i.test(sql)) {
        return [LEGACY_BASELINE_COLS.map((name) => ({ name })), []];
      }
      if (/FROM products WHERE id IN/i.test(sql) && /FOR UPDATE/i.test(sql)) {
        if (/lifecycle_mode|shop_listed|season_starts_at|product_version/i.test(sql)) {
          const err = new Error("Unknown column");
          err.code = "ER_BAD_FIELD_ERROR";
          throw err;
        }
        const ids = (params || []).map(Number);
        return [ids.map((id) => PRODUCTS[id]).filter(Boolean), []];
      }
      if (/INSERT INTO orders/i.test(sql)) {
        lastInsertNotes = params[7];
        lastInsertPayment = params[8];
        return [{ affectedRows: 1 }, []];
      }
      if (/INSERT INTO order_items/i.test(sql)) return [{ affectedRows: 1 }, []];
      if (/FROM coupons/i.test(sql)) return [[], []];
      if (/UPDATE coupons/i.test(sql)) return [{ affectedRows: 0 }, []];
      return [[], []];
    },
  };
}

const pool = {
  async getConnection() {
    return makeConn();
  },
  async query() {
    return [[], []];
  },
};

const cache = new Map();
function loadTs(rel, stubs = {}) {
  const abs = path.join(ROOT, rel);
  const key = abs + "::" + Object.keys(stubs).sort().join(",");
  if (cache.has(key)) return cache.get(key);
  const src = fs.readFileSync(abs, "utf8");
  const out = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
    },
    fileName: abs,
  }).outputText;
  const m = new Module(abs, module);
  m.filename = abs;
  m.paths = Module._nodeModulePaths(path.dirname(abs));
  const orig = m.require.bind(m);
  m.require = (id) => {
    if (stubs[id]) return stubs[id];
    if (id.startsWith("@/")) {
      const mapped = id.replace("@/", "");
      for (const c of [
        path.join(ROOT, mapped + ".ts"),
        path.join(ROOT, mapped + ".tsx"),
        path.join(ROOT, mapped + ".js"),
      ]) {
        if (fs.existsSync(c)) {
          return loadTs(path.relative(ROOT, c).replace(/\\/g, "/"), stubs);
        }
      }
    }
    if (id.startsWith("./") || id.startsWith("../")) {
      const resolved = path.normalize(path.join(path.dirname(abs), id));
      for (const c of [resolved + ".ts", resolved + ".tsx", resolved + ".js"]) {
        if (fs.existsSync(c)) {
          return loadTs(path.relative(ROOT, c).replace(/\\/g, "/"), stubs);
        }
      }
    }
    return orig(id);
  };
  m._compile(out, abs);
  cache.set(key, m.exports);
  return m.exports;
}

function sharedStubs() {
  return {
    "../../lib/db": pool,
    "@/lib/db": pool,
    "../../lib/rateLimit": {
      RL_GENERAL: () => ({ allowed: true, remaining: 99, retryAfterSec: 0 }),
      getClientIp: () => "127.0.0.1",
    },
    "../../lib/contact-config": {
      getContactConfig: async () => ({
        email: "orders@example.com",
        whatsappUrl: "https://wa.me/0",
        telegramUrl: "https://t.me/0",
      }),
    },
    nodemailer: {
      createTransport: () => ({
        sendMail: async (opts) => {
          sentMails.push(opts);
          return {};
        },
      }),
    },
  };
}

function loadOrdersHandler() {
  cache.clear();
  const stubs = sharedStubs();
  loadTs("lib/productSchemaCapability.ts", stubs);
  const capServer = loadTs("lib/productSchemaCapabilityServer.ts", stubs);
  if (typeof capServer.clearProductSchemaCapabilityCache === "function") {
    capServer.clearProductSchemaCapabilityCache({ db: pool });
  }
  const mod = loadTs("pages/api/orders.ts", stubs);
  return mod.default || mod;
}

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
  };
}

async function invoke(body) {
  lastInsertNotes = null;
  lastInsertPayment = null;
  sentMails = [];
  const handler = loadOrdersHandler();
  const req = {
    method: "POST",
    body,
    headers: {},
    socket: { remoteAddress: "127.0.0.1" },
  };
  const res = makeRes();
  await handler(req, res);
  // Allow fire-and-forget sendMail microtasks to flush
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  return res;
}

function baseBody(overrides = {}) {
  return {
    customer_name: "Test Buyer",
    customer_email: "buyer@example.com",
    customer_phone: "07123456789",
    delivery_address: "1 Test St",
    city: "London",
    postcode: "E1 1AA",
    notes: "Please leave at door",
    payment_method: "bank",
    receipt_path: "",
    items: [{ id: 3, qty: 1 }],
    coupon_code: "",
    payment_reference: "",
    digital_supply_acknowledgement: true,
    ...overrides,
  };
}

function adminMail() {
  return sentMails.find((m) => /New Order/.test(m.subject || ""));
}
function customerMail() {
  return sentMails.find((m) => /Order Confirmation/.test(m.subject || ""));
}

(async () => {
  // bank digital
  let res = await invoke(
    baseBody({
      payment_method: "bank",
      items: [{ id: 3, qty: 1 }],
      receipt_path: "/uploads/receipts/x.jpg",
      notes: "Customer note <b>hi</b>",
    })
  );
  ok("scenario_bank_digital_ok", res.statusCode === 200 && res.body?.success);
  let a = adminMail();
  let c = customerMail();
  ok(
    "bank_digital_subjects",
    a &&
      /^🛍️ New Order ORD-/.test(a.subject) &&
      c &&
      /^Firestick4UK Order Confirmation — ORD-/.test(c.subject)
  );
  ok(
    "bank_digital_payment_labels",
    /Bank Transfer/.test(a.html) && /Bank Transfer/.test(c.html)
  );
  ok(
    "bank_digital_receipt_attached",
    /Attached — view in \/sidhu → Orders/.test(a.html)
  );
  ok(
    "bank_digital_customer_pending",
    /pending<\/strong> payment\/verification/.test(c.html)
  );
  ok(
    "bank_digital_notes_readable_and_customer_text",
    /Digital supply acknowledgement: accepted/.test(a.html) &&
      /Customer note/.test(a.html) &&
      !/\[DIGITAL_SUPPLY_ACK_V1\]/.test(a.html)
  );
  const bankDigitalNotes = lastInsertNotes;
  ok(
    "bank_digital_db_notes_keep_marker",
    typeof bankDigitalNotes === "string" &&
      bankDigitalNotes.includes("[DIGITAL_SUPPLY_ACK_V1]") &&
      bankDigitalNotes.includes("Customer note <b>hi</b>")
  );
  ok("bank_digital_db_payment", lastInsertPayment === "bank_transfer");

  // bank physical
  res = await invoke(
    baseBody({
      payment_method: "bank",
      items: [{ id: 1, qty: 1 }],
      digital_supply_acknowledgement: false,
      receipt_path: "",
      notes: "Physical only",
    })
  );
  ok("scenario_bank_physical_ok", res.statusCode === 200 && res.body?.success);
  a = adminMail();
  c = customerMail();
  ok(
    "bank_physical_labels_and_receipt",
    /Bank Transfer/.test(a.html) &&
      /Bank Transfer/.test(c.html) &&
      />Not uploaded</.test(a.html)
  );
  ok(
    "bank_physical_db_notes_unchanged_plain",
    lastInsertNotes === "Physical only"
  );

  // cod digital-only
  res = await invoke(
    baseBody({
      payment_method: "cod",
      items: [{ id: 3, qty: 1 }],
      notes: "COD dig <script>x</script>",
      receipt_path: "should-ignore.jpg",
    })
  );
  ok("scenario_cod_digital_ok", res.statusCode === 200 && res.body?.success);
  a = adminMail();
  c = customerMail();
  ok(
    "cod_digital_subjects_unchanged",
    a &&
      /^🛍️ New Order ORD-/.test(a.subject) &&
      c &&
      /^Firestick4UK Order Confirmation — ORD-/.test(c.subject)
  );
  ok(
    "cod_digital_payment_labels",
    /Pay on Delivery \/ Activation/.test(a.html) &&
      /Pay on Delivery \/ Activation/.test(c.html) &&
      !/>Cash on Delivery</.test(a.html)
  );
  ok(
    "cod_digital_receipt_not_required",
    /Not required \(pay on delivery \/ activation\)/.test(a.html)
  );
  ok(
    "cod_digital_customer_wording",
    /You chose to pay on delivery \/ activation/.test(c.html) &&
      !/pending<\/strong> payment\/verification/.test(c.html)
  );
  ok(
    "cod_digital_notes_escaped_no_raw_script",
    /Digital supply acknowledgement: accepted/.test(a.html) &&
      /COD dig &lt;script&gt;x&lt;\/script&gt;/.test(a.html) &&
      !/<script>x<\/script>/.test(a.html) &&
      !/\[DIGITAL_SUPPLY_ACK_V1\]/.test(a.html)
  );
  const codDigNotes = lastInsertNotes;
  ok(
    "cod_digital_db_notes_byte_keep_marker_and_raw",
    codDigNotes.includes("[DIGITAL_SUPPLY_ACK_V1]") &&
      codDigNotes.includes("COD dig <script>x</script>")
  );
  ok("cod_digital_db_payment", lastInsertPayment === "cod");

  // cod physical
  res = await invoke(
    baseBody({
      payment_method: "cod",
      items: [{ id: 1, qty: 1 }],
      digital_supply_acknowledgement: false,
      notes: "COD phys",
    })
  );
  ok("scenario_cod_physical_ok", res.statusCode === 200 && res.body?.success);
  a = adminMail();
  c = customerMail();
  ok(
    "cod_physical_labels",
    /Cash on Delivery/.test(a.html) &&
      /Cash on Delivery/.test(c.html) &&
      !/Pay on Delivery \/ Activation/.test(a.html)
  );
  ok(
    "cod_physical_receipt_and_wording",
    /Not required \(pay on delivery \/ activation\)/.test(a.html) &&
      /You chose Cash on Delivery/.test(c.html)
  );
  ok("cod_physical_db_notes", lastInsertNotes === "COD phys");

  // cod mixed
  res = await invoke(
    baseBody({
      payment_method: "cod",
      items: [
        { id: 1, qty: 1 },
        { id: 3, qty: 1 },
      ],
      notes: "Mixed order",
    })
  );
  ok("scenario_cod_mixed_ok", res.statusCode === 200 && res.body?.success);
  a = adminMail();
  c = customerMail();
  ok(
    "cod_mixed_labels_cash",
    /Cash on Delivery/.test(a.html) &&
      /Cash on Delivery/.test(c.html) &&
      !/Pay on Delivery \/ Activation/.test(c.html)
  );
  ok(
    "cod_mixed_db_notes_keep_marker",
    lastInsertNotes.includes("[DIGITAL_SUPPLY_ACK_V1]") &&
      lastInsertNotes.includes("Mixed order")
  );

  // Header injection safety
  res = await invoke(
    baseBody({
      payment_method: "bank",
      customer_name: "Alice\r\nBcc: evil@x.com",
      items: [{ id: 1, qty: 1 }],
      digital_supply_acknowledgement: false,
      notes: "",
    })
  );
  a = adminMail();
  ok(
    "header_injection_subject_single_line",
    a &&
      !/[\r\n]/.test(a.subject) &&
      /Alice/.test(a.subject) &&
      /Bcc: evil@x.com/.test(a.subject)
  );

  // HTML escaping of customer fields in admin
  res = await invoke(
    baseBody({
      payment_method: "cod",
      customer_name: "<img src=x onerror=alert(1)>",
      customer_email: "a@b.com",
      items: [{ id: 3, qty: 1 }],
      notes: "<svg/onload=alert(1)>",
    })
  );
  a = adminMail();
  ok(
    "html_escape_admin_name_notes",
    a &&
      /&lt;img/.test(a.html) &&
      !/<img src=x/.test(a.html) &&
      /&lt;svg/.test(a.html)
  );

  // S3 source hooks (may soft-fail until S3 lands — check if files already updated)
  const cart = read("app/cart/page.tsx");
  const products = read("app/products/ProductsClient.tsx");
  const hasEmpty =
    /No products match/.test(products) || /no_products_match/.test(products);
  const hasReceiptHint =
    /cart_receipt_hint/.test(cart) ||
    /photo or choose a screenshot/.test(cart) ||
    /screenshot of the payment confirmation/.test(cart);
  const hasFocus =
    /:focus-visible/.test(cart) ||
    /:focus-visible/.test(products) ||
    /focus-visible/.test(read("app/globals.css"));
  // Only assert S3 when markers exist (S1 commit may land first)
  if (hasEmpty && hasReceiptHint) {
    ok("s3_empty_state_present", hasEmpty);
    ok("s3_receipt_hint_present", hasReceiptHint);
    ok("s3_focus_visible_present", hasFocus);
  } else {
    ok("s3_deferred_until_s3_commit", true, "S3 markers not required at S1");
  }

  diffAllowlistCheck();

  console.log(`\nphase-windup-59: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
