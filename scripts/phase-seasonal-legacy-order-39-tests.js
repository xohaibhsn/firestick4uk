/**
 * F4UK-SEASONAL-REBASE-38-CLOSEOUT-39 Part B —
 * Legacy-mode checkout proof via mocked mysql2 + real orders handler modules.
 * Stub DB only. No network. No production credentials.
 */
const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..");
process.env.DB_NAME = process.env.DB_NAME || "stub";
process.env.DB_HOST = process.env.DB_HOST || "127.0.0.1";
process.env.DB_USER = process.env.DB_USER || "stub";
// Pool is mocked — do not set a DB_PASSWORD literal fallback.
delete process.env.DB_PASSWORD;
// Ensure SMTP path is skipped
delete process.env.SMTP_USER;
delete process.env.SMTP_PASS;

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

const SEASONAL_COLS = [
  "product_version",
  "lifecycle_mode",
  "shop_listed",
  "season_name",
  "season_starts_at",
  "season_ends_at",
  "season_paused",
  "season_show_countdown",
  "season_ended_notice",
  "available_offers_heading",
  "season_available_ids",
  "season_upcoming_ids",
];

const PRODUCTS = {
  1: {
    id: 1,
    name: "Active Firestick Setup",
    price: 49.99,
    category: "Device",
    stock: "In Stock",
    active: 1,
  },
  2: {
    id: 2,
    name: "Inactive Legacy Item",
    price: 9.99,
    category: "Device",
    stock: "Out",
    active: 0,
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

/** @type {'legacy'|'partial'|'error'} */
let schemaMode = "legacy";
let forceDbErrorOnInsert = false;
let getConnectionCalls = 0;
let lastTx = { begin: 0, commit: 0, rollback: 0, release: 0 };
let insertedPaymentMethod = null;
let insertedTotal = null;

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
  const conn = {
    async beginTransaction() {
      lastTx.begin += 1;
    },
    async commit() {
      lastTx.commit += 1;
    },
    async rollback() {
      lastTx.rollback += 1;
    },
    release() {
      lastTx.release += 1;
    },
    async query(arg, maybeParams) {
      const sql = sqlText(arg);
      const params = sqlParams(arg, maybeParams);

      if (/information_schema\.COLUMNS/i.test(sql)) {
        if (schemaMode === "error") {
          throw new Error("information_schema unavailable (mock)");
        }
        let names = [...LEGACY_BASELINE_COLS];
        if (schemaMode === "partial") {
          names = [...LEGACY_BASELINE_COLS, "product_version", "lifecycle_mode"];
        }
        return [names.map((name) => ({ name })), []];
      }

      if (/FROM products WHERE id IN/i.test(sql) && /FOR UPDATE/i.test(sql)) {
        // Expanded select references seasonal columns — fail on legacy/partial mock.
        if (/lifecycle_mode|shop_listed|season_starts_at|product_version/i.test(sql)) {
          const err = new Error("Unknown column 'lifecycle_mode' in 'field list'");
          err.code = "ER_BAD_FIELD_ERROR";
          err.errno = 1054;
          throw err;
        }
        const ids = (params || []).map(Number);
        const rows = ids.map((id) => PRODUCTS[id]).filter(Boolean);
        return [rows, []];
      }

      if (/INSERT INTO orders/i.test(sql)) {
        if (forceDbErrorOnInsert) {
          const err = new Error("ER_MOCK_INSERT_FAIL sensitive details should not leak");
          err.code = "ER_MOCK_INSERT_FAIL";
          throw err;
        }
        // params: order_id, name, email, phone, addr, city, postcode, notes, payment_method, receipt, total, ...
        insertedPaymentMethod = params[8];
        insertedTotal = params[10];
        return [{ affectedRows: 1 }, []];
      }

      if (/INSERT INTO order_items/i.test(sql)) {
        return [{ affectedRows: 1 }, []];
      }

      if (/FROM coupons/i.test(sql)) {
        return [[], []];
      }

      if (/UPDATE coupons/i.test(sql)) {
        return [{ affectedRows: 0 }, []];
      }

      return [[], []];
    },
  };
  return conn;
}

const pool = {
  async getConnection() {
    getConnectionCalls += 1;
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
  if (cache.has(key) && !stubs.__nocache) return cache.get(key);
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
      for (const c of [path.join(ROOT, mapped + ".ts"), path.join(ROOT, mapped + ".tsx")]) {
        if (fs.existsSync(c)) return loadTs(path.relative(ROOT, c), stubs);
      }
    }
    if (id.startsWith("./") || id.startsWith("../")) {
      const resolved = path.normalize(path.join(path.dirname(abs), id));
      for (const c of [resolved + ".ts", resolved + ".tsx", resolved + ".js"]) {
        if (fs.existsSync(c)) {
          const relPath = path.relative(ROOT, c).replace(/\\/g, "/");
          // Always inject shared stubs for db when loading relative deps of orders tree
          return loadTs(relPath, stubs);
        }
      }
    }
    if (id === "react") {
      return { cache: (fn) => fn };
    }
    return orig(id);
  };
  m._compile(out, abs);
  if (!stubs.__nocache) cache.set(key, m.exports);
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
        sendMail: async () => ({}),
      }),
    },
  };
}

function loadOrdersHandler() {
  // Bust cache so schemaMode / force flags apply to capability cache keys via new pool identity? 
  // Capability cache is keyed by adapter — same pool object. Clear via exported clearer.
  cache.clear();
  const stubs = sharedStubs();
  // Preload capability server / eligibility with same stubs so they share pool mock
  loadTs("lib/productSchemaCapability.ts", stubs);
  const capServer = loadTs("lib/productSchemaCapabilityServer.ts", stubs);
  if (typeof capServer.clearProductSchemaCapabilityCache === "function") {
    capServer.clearProductSchemaCapabilityCache({ db: pool });
    try {
      capServer.clearAllProductSchemaCapabilityCaches?.();
    } catch {
      /* optional */
    }
  }
  // Also clear global cache helper if present
  const cap = loadTs("lib/productSchemaCapability.ts", stubs);
  if (typeof cap.clearSchemaCapabilityCache === "function") {
    cap.clearSchemaCapabilityCache();
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
  getConnectionCalls = 0;
  lastTx = { begin: 0, commit: 0, rollback: 0, release: 0 };
  insertedPaymentMethod = null;
  insertedTotal = null;
  forceDbErrorOnInsert = false;
  const handler = loadOrdersHandler();
  const req = { method: "POST", body, headers: {}, socket: { remoteAddress: "127.0.0.1" } };
  const res = makeRes();
  await handler(req, res);
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
    notes: "",
    payment_method: "bank",
    receipt_path: "",
    items: [{ id: 1, qty: 1, price: 0.01, name: "TAMPERED" }],
    coupon_code: "",
    payment_reference: "",
    digital_supply_acknowledgement: true,
    total: 0.01,
    discount_amount: 999,
    vat_amount: 0,
    ...overrides,
  };
}

(async () => {
  console.log("=== Part B legacy checkout proofs ===");

  // bank → bank_transfer
  schemaMode = "legacy";
  let res = await invoke(baseBody({ payment_method: "bank" }));
  ok("legacy_bank_maps_to_bank_transfer", res.statusCode === 200 && insertedPaymentMethod === "bank_transfer", JSON.stringify(res.body));
  ok("legacy_bank_commits_and_releases", lastTx.commit === 1 && lastTx.release === 1 && lastTx.rollback === 0);

  // cod → cod
  res = await invoke(baseBody({ payment_method: "cod" }));
  ok("legacy_cod_maps_to_cod", res.statusCode === 200 && insertedPaymentMethod === "cod");

  // invalid method
  res = await invoke(baseBody({ payment_method: "paypal" }));
  ok(
    "legacy_invalid_payment_rejected",
    res.statusCode === 400 && /invalid payment/i.test(String(res.body?.error || ""))
  );
  ok("legacy_invalid_payment_no_getConnection", getConnectionCalls === 0);

  // DB price wins over client price (DB 49.99, client 0.01); shipping/VAT may apply.
  res = await invoke(baseBody({ payment_method: "bank", items: [{ id: 1, qty: 2, price: 0.01 }] }));
  ok(
    "legacy_total_from_db_price_not_client",
    res.statusCode === 200 &&
      Number(res.body?.items?.[0]?.price) === 49.99 &&
      Number(res.body?.pricing?.subtotal) === 99.98 &&
      Number(res.body?.pricing?.total) !== 0.01 &&
      Number(insertedTotal) === Number(res.body?.pricing?.total) &&
      Number(insertedTotal) > 99.98,
    `total=${res.body?.pricing?.total} subtotal=${res.body?.pricing?.subtotal} inserted=${insertedTotal}`
  );

  // active purchasable
  res = await invoke(baseBody({ items: [{ id: 1, qty: 1, price: 1 }] }));
  ok("legacy_active_product_purchasable", res.statusCode === 200 && res.body?.success === true);

  // inactive rejected
  res = await invoke(baseBody({ items: [{ id: 2, qty: 1, price: 1 }] }));
  ok(
    "legacy_inactive_product_rejected",
    res.statusCode === 400 && /no longer available/i.test(String(res.body?.error || ""))
  );
  ok("legacy_inactive_rollback_release", lastTx.rollback === 1 && lastTx.release === 1 && lastTx.commit === 0);

  // unknown schema (information_schema error) deny
  schemaMode = "error";
  res = await invoke(baseBody({ items: [{ id: 1, qty: 1, price: 1 }] }));
  ok(
    "unknown_schema_denies_purchase",
    res.statusCode === 400 && /no longer available/i.test(String(res.body?.error || "")),
    JSON.stringify(res.body)
  );

  // partial seasonal columns → unknown → deny
  schemaMode = "partial";
  res = await invoke(baseBody({ items: [{ id: 1, qty: 1, price: 1 }] }));
  ok(
    "partial_schema_denies_purchase",
    res.statusCode === 400 && /no longer available/i.test(String(res.body?.error || "")),
    JSON.stringify(res.body)
  );

  // identity before getConnection
  schemaMode = "legacy";
  res = await invoke(
    baseBody({
      customer_name: "   ",
      customer_email: "",
      customer_phone: "",
      items: [{ id: 1, qty: 1, price: 1 }],
    })
  );
  ok(
    "identity_rejected_before_getConnection",
    res.statusCode === 400 && getConnectionCalls === 0,
    `status=${res.statusCode} getConn=${getConnectionCalls} body=${JSON.stringify(res.body)}`
  );

  // generic 500 on DB error, no raw text
  schemaMode = "legacy";
  getConnectionCalls = 0;
  lastTx = { begin: 0, commit: 0, rollback: 0, release: 0 };
  insertedPaymentMethod = null;
  forceDbErrorOnInsert = true;
  {
    const handler = loadOrdersHandler();
    // re-apply force after handler load
    forceDbErrorOnInsert = true;
    const req = {
      method: "POST",
      body: baseBody({ payment_method: "bank" }),
      headers: {},
      socket: { remoteAddress: "127.0.0.1" },
    };
    const r = makeRes();
    await handler(req, r);
    ok(
      "db_error_generic_500",
      r.statusCode === 500 &&
        r.body?.error === "Unable to create order. Please try again." &&
        !/ER_MOCK|sensitive/i.test(JSON.stringify(r.body))
    );
    ok("db_error_rollback_and_release", lastTx.rollback === 1 && lastTx.release === 1 && lastTx.commit === 0);
  }
  forceDbErrorOnInsert = false;

  // Legacy listing/detail SQL has no seasonal columns
  const dto = read("lib/productPublicDto.ts");
  const productsApi = read("pages/api/products.ts");
  const listSql = dto.match(/export const PUBLIC_LIST_SQL =\s*"([^"]+)"/)?.[1] || "";
  const detailLegacy =
    dto.match(/export const PUBLIC_DETAIL_SQL_LEGACY =\s*"([^"]+)"/)?.[1] || "";
  ok(
    "legacy_list_sql_no_seasonal_columns",
    listSql.length > 0 &&
      !SEASONAL_COLS.some((c) => listSql.includes(c)) &&
      /price/.test(listSql)
  );
  ok(
    "legacy_detail_sql_no_seasonal_columns",
    detailLegacy.length > 0 &&
      !SEASONAL_COLS.some((c) => detailLegacy.includes(c)) &&
      /price/.test(detailLegacy) &&
      /PUBLIC_DETAIL_SQL_LEGACY/.test(productsApi) &&
      /capability\.mode === 'expanded' \? PUBLIC_DETAIL_SQL_EXPANDED : PUBLIC_DETAIL_SQL_LEGACY/.test(
        productsApi
      )
  );

  console.log("");
  console.log(`RESULT  passed=${passed} failed=${failed}`);
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error("FATAL", err);
  process.exit(1);
});
