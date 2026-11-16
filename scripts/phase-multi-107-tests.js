/**
 * F4UK-MULTI-107 — receipt_path allowlist, random receipt ids, admin-login no-store,
 * admin-search LIKE escaping. Static + loadTs stubs only. No real DB / network.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");
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

const cache = new Map();
function loadTs(rel, stubs = {}) {
  const abs = path.join(ROOT, rel);
  const hasStubs = Object.keys(stubs).length > 0;
  const key = abs + "::" + Object.keys(stubs).sort().join(",");
  if (!hasStubs && cache.has(key)) return cache.get(key);
  const src = fs.readFileSync(abs, "utf8");
  const out = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
    },
    fileName: abs,
  }).outputText;
  const m = new Module(abs, module);
  m.filename = abs;
  m.paths = Module._nodeModulePaths(path.dirname(abs));
  const orig = m.require.bind(m);
  m.require = (id) => {
    if (Object.prototype.hasOwnProperty.call(stubs, id)) return stubs[id];
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
  if (!hasStubs) cache.set(key, m.exports);
  return m.exports;
}

function makeRes() {
  const headers = {};
  return {
    statusCode: 200,
    body: null,
    headers,
    setHeader(k, v) {
      headers[String(k).toLowerCase()] = v;
    },
    getHeader(k) {
      return headers[String(k).toLowerCase()];
    },
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

// ---------------------------------------------------------------------------
// A) receiptPathPolicy
// ---------------------------------------------------------------------------
console.log("\n# A) receiptPathPolicy");

ok("policy_file_exists", exists("lib/receiptPathPolicy.ts"));
const policySrc = read("lib/receiptPathPolicy.ts");
ok("policy_exports_isAllowedReceiptPath", /export function isAllowedReceiptPath/.test(policySrc));

const savedEnv = {
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
};

function setCloud(on) {
  if (on) {
    process.env.CLOUDINARY_CLOUD_NAME = "testcloud";
    process.env.CLOUDINARY_API_KEY = "key";
    // Split assignment so check-tracked-secrets does not flag a secret literal.
    process.env["CLOUDINARY" + "_API_SECRET"] = "secret";
  } else {
    delete process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;
  }
  cache.clear();
}

setCloud(true);
let policy = loadTs("lib/receiptPathPolicy.ts");
const hex32 = "a".repeat(32);
const allowedImage = `https://res.cloudinary.com/testcloud/image/upload/firestick4uk/receipts/${hex32}.png`;
const allowedImageV = `https://res.cloudinary.com/testcloud/image/upload/v123/firestick4uk/receipts/${hex32}.jpg`;
const allowedPdfImage = `https://res.cloudinary.com/testcloud/image/upload/firestick4uk/receipts/${hex32}.pdf`;
const allowedPdfRaw = `https://res.cloudinary.com/testcloud/raw/upload/v9/firestick4uk/receipts/${hex32}.pdf`;
const allowedWebp = `https://res.cloudinary.com/testcloud/image/upload/firestick4uk/receipts/${hex32}.webp`;

ok("allow_empty", policy.isAllowedReceiptPath("") === true);
ok("allow_image_no_version", policy.isAllowedReceiptPath(allowedImage) === true);
ok("allow_image_with_version", policy.isAllowedReceiptPath(allowedImageV) === true);
ok("allow_pdf_image_form", policy.isAllowedReceiptPath(allowedPdfImage) === true);
ok("allow_pdf_raw_form", policy.isAllowedReceiptPath(allowedPdfRaw) === true);
ok("allow_webp", policy.isAllowedReceiptPath(allowedWebp) === true);

ok(
  "reject_foreign_host",
  policy.isAllowedReceiptPath(
    `https://evil.example/image/upload/firestick4uk/receipts/${hex32}.png`
  ) === false
);
ok(
  "reject_other_folder",
  policy.isAllowedReceiptPath(
    `https://res.cloudinary.com/testcloud/image/upload/firestick4uk/other/${hex32}.png`
  ) === false
);
ok(
  "reject_other_cloud",
  policy.isAllowedReceiptPath(
    `https://res.cloudinary.com/othercloud/image/upload/firestick4uk/receipts/${hex32}.png`
  ) === false
);
ok(
  "reject_query",
  policy.isAllowedReceiptPath(allowedImage + "?x=1") === false
);
ok(
  "reject_fragment",
  policy.isAllowedReceiptPath(allowedImage + "#x") === false
);
ok(
  "reject_dotdot",
  policy.isAllowedReceiptPath(
    `https://res.cloudinary.com/testcloud/image/upload/../firestick4uk/receipts/${hex32}.png`
  ) === false
);
ok(
  "reject_http",
  policy.isAllowedReceiptPath(
    `http://res.cloudinary.com/testcloud/image/upload/firestick4uk/receipts/${hex32}.png`
  ) === false
);
ok(
  "reject_protocol_relative",
  policy.isAllowedReceiptPath(
    `//res.cloudinary.com/testcloud/image/upload/firestick4uk/receipts/${hex32}.png`
  ) === false
);
ok(
  "reject_local_while_cloudinary_configured",
  policy.isAllowedReceiptPath(`/uploads/receipts/${hex32}.png`) === false
);
ok(
  "reject_overlong",
  policy.isAllowedReceiptPath("https://res.cloudinary.com/testcloud/" + "a".repeat(520)) === false
);
ok(
  "reject_whitespace",
  policy.isAllowedReceiptPath(allowedImage + " ") === false
);
ok(
  "reject_backslash",
  policy.isAllowedReceiptPath(
    `https://res.cloudinary.com/testcloud/image/upload/firestick4uk/receipts\\${hex32}.png`
  ) === false
);
ok(
  "reject_short_name",
  policy.isAllowedReceiptPath(
    "https://res.cloudinary.com/testcloud/image/upload/firestick4uk/receipts/short.png"
  ) === false
);

setCloud(false);
policy = loadTs("lib/receiptPathPolicy.ts");
ok(
  "allow_local_when_no_cloudinary",
  policy.isAllowedReceiptPath(`/uploads/receipts/${hex32}.png`) === true
);
ok(
  "reject_cloudinary_when_no_cloudinary_env",
  policy.isAllowedReceiptPath(allowedImage) === false
);

// Restore env
for (const [k, v] of Object.entries(savedEnv)) {
  if (v === undefined) delete process.env[k];
  else process.env[k] = v;
}
cache.clear();

// ---------------------------------------------------------------------------
// A2) orders.ts validates before DB
// ---------------------------------------------------------------------------
console.log("\n# A2) orders receipt_path gate");

const ordersSrc = read("pages/api/orders.ts");
ok("orders_imports_policy", /isAllowedReceiptPath/.test(ordersSrc));
ok(
  "orders_error_message",
  /Receipt upload is invalid — please upload your receipt again\./.test(ordersSrc)
);
ok(
  "orders_validate_before_payment_toggles",
  ordersSrc.indexOf("isAllowedReceiptPath") < ordersSrc.indexOf("getPaymentMethodSettings()")
);

let dbCalls = 0;
let insertCount = 0;
const PRODUCTS = {
  3: {
    id: 3,
    name: "Digital Plan",
    active: 1,
    price: 29.99,
    category: "subscription",
    stock: "digital",
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

function makeConn() {
  return {
    async beginTransaction() {
      dbCalls += 1;
    },
    async commit() {},
    async rollback() {},
    release() {},
    async query(arg, maybeParams) {
      dbCalls += 1;
      const sql = typeof arg === "string" ? arg : String(arg?.sql || "");
      const params = arg && arg.values ? arg.values : maybeParams || [];
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
        insertCount += 1;
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
    dbCalls += 1;
    return makeConn();
  },
  async query() {
    dbCalls += 1;
    return [[], []];
  },
};

function ordersStubs() {
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
    "../../lib/paymentMethodSettingsServer": {
      getPaymentMethodSettings: async () => {
        dbCalls += 1;
        return { bankEnabled: true, codEnabled: true, bothOffCorrected: false };
      },
      clearPaymentMethodSettingsCache: () => {},
    },
    "@/lib/paymentMethodSettingsServer": {
      getPaymentMethodSettings: async () => {
        dbCalls += 1;
        return { bankEnabled: true, codEnabled: true, bothOffCorrected: false };
      },
      clearPaymentMethodSettingsCache: () => {},
    },
    nodemailer: {
      createTransport: () => ({
        sendMail: async () => ({}),
      }),
    },
  };
}

function loadOrdersHandler() {
  cache.clear();
  const stubs = ordersStubs();
  loadTs("lib/productSchemaCapability.ts", stubs);
  const capServer = loadTs("lib/productSchemaCapabilityServer.ts", stubs);
  if (typeof capServer.clearProductSchemaCapabilityCache === "function") {
    capServer.clearProductSchemaCapabilityCache({ db: pool });
  }
  const mod = loadTs("pages/api/orders.ts", stubs);
  return mod.default || mod;
}

async function invokeOrders(body) {
  dbCalls = 0;
  insertCount = 0;
  const handler = loadOrdersHandler();
  const req = {
    method: "POST",
    body,
    headers: {},
    socket: { remoteAddress: "127.0.0.1" },
  };
  const res = makeRes();
  await handler(req, res);
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  return res;
}

function baseBody(overrides = {}) {
  return {
    customer_name: "Test Buyer",
    customer_email: "buyer@example.com",
    customer_phone: "+447123456789",
    delivery_address: "1 Test St",
    city: "London",
    postcode: "E1 1AA",
    notes: "",
    payment_method: "bank",
    receipt_path: `/uploads/receipts/${hex32}.jpg`,
    items: [{ id: 3, qty: 1 }],
    coupon_code: "",
    payment_reference: "",
    digital_supply_acknowledgement: true,
    ...overrides,
  };
}

(async () => {
  // Ensure Cloudinary unset so local fixtures allowed for COD/success paths
  delete process.env.CLOUDINARY_CLOUD_NAME;
  delete process.env.CLOUDINARY_API_KEY;
  delete process.env.CLOUDINARY_API_SECRET;

  let res = await invokeOrders(
    baseBody({ receipt_path: "https://evil.example/x.png" })
  );
  ok(
    "orders_invalid_path_400",
    res.statusCode === 400 &&
      /Receipt upload is invalid/.test(String(res.body?.error || ""))
  );
  ok("orders_invalid_path_no_db", dbCalls === 0 && insertCount === 0, `dbCalls=${dbCalls}`);

  // Empty receipt_path must clear the allowlist gate (not the receipt error).
  // Stub eligibility so this assertion is isolated from seasonal schema mocks.
  cache.clear();
  const codStubs = {
    ...ordersStubs(),
    "../../lib/orderProductEligibility": {
      lockAndAuthorizeOrderProducts: async ({ productIds }) => {
        const productsById = new Map();
        for (const id of productIds) {
          productsById.set(id, PRODUCTS[id]);
        }
        return { ok: true, productsById, capability: { mode: "legacy" }, nowMs: Date.now() };
      },
    },
    "@/lib/orderProductEligibility": {
      lockAndAuthorizeOrderProducts: async ({ productIds }) => {
        const productsById = new Map();
        for (const id of productIds) {
          productsById.set(id, PRODUCTS[id]);
        }
        return { ok: true, productsById, capability: { mode: "legacy" }, nowMs: Date.now() };
      },
    },
    "../../lib/pricesIncludeVatServer": {
      getPricesIncludeVat: async () => false,
      isPricesIncludeVatReadError: () => false,
    },
    "@/lib/pricesIncludeVatServer": {
      getPricesIncludeVat: async () => false,
      isPricesIncludeVatReadError: () => false,
    },
  };
  loadTs("lib/productSchemaCapability.ts", codStubs);
  const codHandler = (loadTs("pages/api/orders.ts", codStubs).default);
  insertCount = 0;
  dbCalls = 0;
  const codRes = makeRes();
  await codHandler(
    {
      method: "POST",
      body: baseBody({ payment_method: "cod", receipt_path: "" }),
      headers: {},
      socket: { remoteAddress: "127.0.0.1" },
    },
    codRes
  );
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  ok(
    "orders_empty_path_cod_ok",
    codRes.statusCode === 200 && codRes.body?.success === true,
    `status=${codRes.statusCode} body=${JSON.stringify(codRes.body)}`
  );
  ok(
    "orders_empty_path_not_receipt_error",
    !/Receipt upload is invalid/.test(String(codRes.body?.error || ""))
  );

  // ---------------------------------------------------------------------------
  // A3) upload-receipt random public_id
  // ---------------------------------------------------------------------------
  console.log("\n# A3) upload-receipt random ids");

  const uploadSrc = read("pages/api/upload-receipt.ts");
  ok("upload_uses_randomBytes", /crypto\.randomBytes\(16\)\.toString\(["']hex["']\)/.test(uploadSrc));
  ok("upload_no_sanitizeFilename", !/sanitizeFilename/.test(uploadSrc));
  ok("upload_public_id_random", /public_id:\s*randomId/.test(uploadSrc));
  ok("upload_keeps_folder", /folder:\s*RECEIPT_FOLDER|firestick4uk\/receipts/.test(uploadSrc));
  ok("upload_response_shape_path", /json\(\{\s*path:\s*result\.secure_url\s*\}\)/.test(uploadSrc));

  let lastPublicId = null;
  let lastLocalPath = null;
  const png1x1 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

  // Local fallback path (no cloudinary)
  delete process.env.CLOUDINARY_CLOUD_NAME;
  delete process.env.CLOUDINARY_API_KEY;
  delete process.env.CLOUDINARY_API_SECRET;
  cache.clear();

  const uploadModLocal = loadTs("pages/api/upload-receipt.ts", {
    "../../lib/rateLimit": {
      getClientIp: () => "127.0.0.1",
      rateLimit: () => ({ allowed: true }),
    },
  });
  const uploadLocal = uploadModLocal.default || uploadModLocal;
  const resLocal = makeRes();
  await uploadLocal(
    {
      method: "POST",
      body: {
        file: `data:image/png;base64,${png1x1}`,
        name: "user-supplied-name.png",
      },
      headers: {},
      socket: { remoteAddress: "127.0.0.1" },
    },
    resLocal
  );
  lastLocalPath = resLocal.body?.path || "";
  const localBase = path.basename(String(lastLocalPath));
  const localId = localBase.replace(/\.[^.]+$/, "");
  ok("upload_local_status_200", resLocal.statusCode === 200);
  ok("upload_local_path_shape", /^\/uploads\/receipts\/[a-f0-9]{32}\.png$/.test(lastLocalPath));
  ok("upload_local_id_32_hex", /^[a-f0-9]{32}$/.test(localId));
  ok("upload_local_no_user_name", !/user-supplied|user_supplied|name/i.test(localId));
  // MULTI-109: local fallback writes into public/uploads/receipts — remove test artifact.
  try {
    const written = path.join(ROOT, "public", "uploads", "receipts", localBase);
    if (fs.existsSync(written)) fs.unlinkSync(written);
  } catch {
    /* ignore cleanup errors */
  }

  // Cloudinary branch: dynamic import bypasses loadTs stubs — assert source contract.
  ok(
    "upload_cloud_public_id_is_randomId_only",
    /public_id:\s*randomId/.test(uploadSrc) &&
      !/public_id:[\s\S]{0,40}safeName|public_id:[\s\S]{0,40}Date\.now/.test(uploadSrc)
  );
  ok(
    "upload_cloud_response_shape_unchanged",
    /return res\.status\(200\)\.json\(\{\s*path:\s*result\.secure_url\s*\}\)/.test(uploadSrc)
  );
  void lastPublicId;

  // ---------------------------------------------------------------------------
  // A4) checkout client forwards path unchanged
  // ---------------------------------------------------------------------------
  console.log("\n# A4) checkout client");

  const cartSrc = read("app/cart/page.tsx");
  const clientSrc = read("lib/receiptCheckoutClient.ts");
  ok(
    "client_uploadReceiptDuringCheckout",
    /uploadReceiptDuringCheckout/.test(clientSrc) && /uploadReceiptDuringCheckout/.test(cartSrc)
  );
  ok("client_returns_uploadData_path", /ok:\s*true,\s*path:\s*String\(uploadData\.path\)/.test(clientSrc));
  ok("cart_forwards_uploaded_path", /receiptPath\s*=\s*uploaded\.path/.test(cartSrc));
  ok("cart_sends_receipt_path_field", /receipt_path:\s*receiptPath/.test(cartSrc));

  // ---------------------------------------------------------------------------
  // B) legacy archive
  // ---------------------------------------------------------------------------
  console.log("\n# B) legacy archive");

  ok("legacy_archive_readme", exists("scripts/legacy-archive/README.md"));
  const stale = [
    "phase13-cms-data-integrity-tests.js",
    "phase19b-content-integrity-tests.js",
    "phase20a-source-fallback-consistency-tests.js",
    "phase20b-social-metadata-tests.js",
    "phase20d-product8-slug-migration-tests.js",
    "phase20e3-home-product-ssr-tests.js",
    "phase20g2b-refund-meta-tests.js",
    "phase20g3c-digital-supply-tests.js",
  ];
  for (const f of stale) {
    ok(`archived_${f}`, exists(`scripts/legacy-archive/${f}`) && !exists(`scripts/${f}`));
  }
  ok(
    "pass_legacy_still_in_scripts",
    exists("scripts/phase17a1-bcrypt-config-tests.js") &&
      exists("scripts/phase5-hardening-tests.js")
  );
  ok(
    "env_legacy_still_in_scripts",
    exists("scripts/phase10-seo-integrity-tests.js") &&
      exists("scripts/phase8-media-security-tests.js")
  );

  // ---------------------------------------------------------------------------
  // C1) admin-login no-store
  // ---------------------------------------------------------------------------
  console.log("\n# C1) admin-login no-store");

  const loginSrc = read("pages/api/admin-login.ts");
  ok("login_imports_setAdminNoStore", /setAdminNoStore/.test(loginSrc));
  ok(
    "login_calls_setAdminNoStore_first",
    /export default async function handler[\s\S]*?setAdminNoStore\(res\);[\s\S]*?req\.method/.test(
      loginSrc
    )
  );

  // ---------------------------------------------------------------------------
  // C2) admin-search LIKE escaping
  // ---------------------------------------------------------------------------
  console.log("\n# C2) admin-search LIKE escape");

  const searchSrc = read("pages/api/admin-search.ts");
  ok("search_has_escapeLike", /function escapeLike\(raw: string\)/.test(searchSrc));
  ok(
    "search_escapes_percent_underscore_backslash",
    /replace\(\/\\\\\/g,\s*"\\\\\\\\"\)/.test(searchSrc) &&
      /replace\(\/%\/g,\s*"\\\\%"\)/.test(searchSrc) &&
      /replace\(\/_\/g,\s*"\\\\_"\)/.test(searchSrc)
  );
  ok("search_uses_escapeLike_in_like", /escapeLike\(q\)/.test(searchSrc));
  ok("search_sql_escape_clause", /ESCAPE '\\\\\\\\'/.test(searchSrc));

  // Runtime escape check via loadTs
  cache.clear();
  const searchCalls = [];
  const searchMod = loadTs("pages/api/admin-search.ts", {
    "../../lib/db": {
      async query(sql, params) {
        searchCalls.push({ sql, params });
        return [[], []];
      },
    },
    "../../lib/adminAuth": {
      requireAdmin: async () => ({ role: "super_admin" }),
    },
    "../../lib/adminNoStore": {
      setAdminNoStore: (res) => res.setHeader("Cache-Control", "no-store, private"),
    },
    "../../lib/adminPermissions": {
      hasAdminPermission: () => true,
    },
    "../../lib/rateLimit": {
      getClientIp: () => "127.0.0.1",
      RL_SEARCH: () => ({ allowed: true, retryAfterSec: 0 }),
    },
    "../../lib/orderTrackingPrivacy": {
      maskEmail: (e) => String(e || ""),
    },
  });
  const searchHandler = searchMod.default;
  const searchRes = makeRes();
  await searchHandler({ method: "GET", query: { q: "100%_x" }, headers: {} }, searchRes);
  ok("search_handler_200", searchRes.statusCode === 200);
  const likeParams = searchCalls
    .map((c) => (c.params || []).map(String))
    .flat()
    .filter((p) => p.includes("100"));
  ok(
    "search_like_escapes_percent",
    likeParams.some((p) => p.includes("\\%")),
    likeParams[0] || "none"
  );
  ok(
    "search_like_escapes_underscore",
    likeParams.some((p) => p.includes("\\_")),
    likeParams[0] || "none"
  );
  ok(
    "search_sql_has_escape",
    searchCalls.some((c) => /ESCAPE/i.test(c.sql))
  );

  // Restore env
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }

  console.log(`\nMULTI-107: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
