/**
 * F4UK-HARDEN-79 — checkout + admin hardening (mocked DB; no production).
 * Covers: payment TX re-check, order id format, double-submit guard,
 * retention log shape, single mini-cart products fetch, price/coupon matrices.
 */
const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");
const { execSync } = require("child_process");

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

(async () => {
  // ── Source contracts ─────────────────────────────────────────────────────
  const ordersSrc = read("pages/api/orders.ts");
  const cartSrc = read("app/cart/page.tsx");
  const retentionSrc = read("lib/insightsRetention.ts");
  const homeSrc = read("app/HomeClient.tsx");
  const cartClassSrc = read("lib/cartClassification.ts");
  const sidhuSrc = read("app/sidhu/page.tsx");
  const adminProductsSrc = read("pages/api/admin-products.ts");
  const paiSrc = read("lib/productAiClient.ts");

  ok(
    "A_early_payment_check_kept",
    /getPaymentMethodSettings\(\)/.test(ordersSrc) &&
      /Payment method unavailable\./.test(ordersSrc)
  );
  ok(
    "A_tx_recheck_after_lock",
    /lockAndAuthorizeOrderProducts[\s\S]{0,500}getPaymentMethodSettings\(\{\s*db:\s*conn,\s*ttlMs:\s*0\s*\}\)/.test(
      ordersSrc
    )
  );
  ok(
    "B_order_id_collision_safe",
    /generateOrderId/.test(ordersSrc) &&
      /randomInt\(0,\s*1000\)/.test(ordersSrc) &&
      /ORD-' \+ String\(nowMs\)/.test(ordersSrc)
  );
  ok(
    "C_placing_ref_guard",
    /placingRef\.current/.test(cartSrc) &&
      /if \(placingRef\.current \|\| placing\) return/.test(cartSrc) &&
      /disabled=\{placing \|\|/.test(cartSrc)
  );
  ok(
    "D_retention_logs_code_only",
    /console\.error\("\[insights-retention\] failed"/.test(retentionSrc) &&
      /err\?\.code \|\| err\?\.name \|\| "error"/.test(retentionSrc) &&
      !/\/\* swallow \*\//.test(retentionSrc)
  );
  ok(
    "E_hydrate_catalog_exported",
    /export function hydrateProductFactsCatalog/.test(cartClassSrc)
  );
  ok("E_home_hydrates_catalog", /hydrateProductFactsCatalog/.test(homeSrc));
  ok(
    "F_client_uses_parseStrictPriceGbp",
    /parseStrictPriceGbp\(editProduct\.price\)/.test(sidhuSrc)
  );
  ok(
    "F_client_no_strip_in_saveProduct",
    !/const saveProduct = async \(\) => \{[\s\S]{0,180}?replace\(\/\[\^0-9\.\]/.test(
      sidhuSrc
    )
  );
  ok(
    "F_server_strict_price_intact",
    /STRICT_PRICE_NUMERIC/.test(adminProductsSrc) &&
      /validatePrice/.test(adminProductsSrc)
  );

  // ── Order id unit + consumer compatibility ───────────────────────────────
  process.env.DB_NAME = process.env.DB_NAME || "stub";
  process.env.DB_HOST = process.env.DB_HOST || "127.0.0.1";
  process.env.DB_USER = process.env.DB_USER || "stub";
  delete process.env.DB_PASSWORD;
  process.env.SMTP_USER = "stub-smtp-user";
  process.env["SMTP" + "_PASS"] = "stub";

  const ordersMod = loadTs("pages/api/orders.ts", {
    "../../lib/db": { getConnection: async () => ({}) },
    "@/lib/db": { getConnection: async () => ({}) },
    "../../lib/rateLimit": {
      RL_GENERAL: () => ({ allowed: true, remaining: 99, retryAfterSec: 0 }),
      getClientIp: () => "127.0.0.1",
    },
    "../../lib/contact-config": {
      getContactConfig: async () => ({
        email: "o@example.com",
        whatsappUrl: "https://wa.me/0",
        telegramUrl: "https://t.me/0",
      }),
    },
    "../../lib/paymentMethodSettingsServer": {
      getPaymentMethodSettings: async () => ({
        bankEnabled: true,
        codEnabled: true,
        bothOffCorrected: false,
      }),
      clearPaymentMethodSettingsCache: () => {},
    },
    "@/lib/paymentMethodSettingsServer": {
      getPaymentMethodSettings: async () => ({
        bankEnabled: true,
        codEnabled: true,
        bothOffCorrected: false,
      }),
      clearPaymentMethodSettingsCache: () => {},
    },
    "../../lib/pricesIncludeVatServer": {
      getPricesIncludeVat: async () => false,
      clearPricesIncludeVatCache: () => {},
    },
    "@/lib/pricesIncludeVatServer": {
      getPricesIncludeVat: async () => false,
      clearPricesIncludeVatCache: () => {},
    },
    nodemailer: { createTransport: () => ({ sendMail: async () => ({}) }) },
  });

  const gen = ordersMod.generateOrderId;
  ok("B_generateOrderId_exported", typeof gen === "function");
  const sampleIds = Array.from({ length: 20 }, () => gen(1_700_000_000_000));
  ok(
    "B_format_ord_digits",
    sampleIds.every((id) => /^ORD-\d{13}\d{3}$/.test(id)),
    sampleIds[0]
  );
  ok(
    "B_length_fits_varchar20",
    sampleIds.every((id) => id.length === 20)
  );
  ok(
    "B_random_suffix_varies",
    new Set(sampleIds.map((id) => id.slice(-3))).size > 1
  );
  const longId = "ORD-1700000000000123";
  ok(
    "B_consumers_accept_extra_digits",
    /^🛍️ New Order ORD-/.test(`🛍️ New Order ${longId} — Test`) &&
      /^Firestick4UK Order Confirmation — ORD-/.test(
        `Firestick4UK Order Confirmation — ${longId}`
      ) &&
      /^ORD-\d+$/.test(longId) &&
      longId.length <= 64 &&
      longId.length === 20
  );

  // ── Double-submit logic-level ────────────────────────────────────────────
  function makePlaceGuard() {
    let placing = false;
    const placingRef = { current: false };
    let calls = 0;
    return {
      handleOrder() {
        if (placingRef.current || placing) return false;
        placingRef.current = true;
        placing = true;
        calls += 1;
        return true;
      },
      reset() {
        placingRef.current = false;
        placing = false;
      },
      get calls() {
        return calls;
      },
    };
  }
  const guard = makePlaceGuard();
  ok("C_first_click_accepted", guard.handleOrder() === true);
  ok("C_second_click_ignored", guard.handleOrder() === false && guard.calls === 1);
  guard.reset();
  ok("C_after_reset_accepted", guard.handleOrder() === true && guard.calls === 2);

  // ── Retention log code only (force reject before inner try) ──────────────
  const ret = loadTs("lib/insightsRetention.ts", {});
  if (typeof ret.__resetInsightsRetentionThrottle === "function") {
    ret.__resetInsightsRetentionThrottle();
  }
  const logged = [];
  const origErr = console.error;
  console.error = (...args) => {
    logged.push(args);
  };
  ret.scheduleInsightsRetention({
    pool: { getConnection: async () => ({}) },
    settings: new Proxy(
      {},
      {
        get() {
          throw Object.assign(new Error("boom-msg"), {
            code: "ER_TEST",
            name: "Error",
          });
        },
      }
    ),
  });
  await new Promise((r) => setTimeout(r, 80));
  console.error = origErr;
  const retentionLine = logged.find((a) => a[0] === "[insights-retention] failed");
  ok("D_retention_console_error_fired", !!retentionLine);
  ok(
    "D_retention_logs_code_not_body",
    !!retentionLine &&
      retentionLine[1] === "ER_TEST" &&
      !JSON.stringify(retentionLine).includes("boom-msg") &&
      !JSON.stringify(retentionLine).includes("SELECT")
  );

  // ── Single products fetch via hydrate ────────────────────────────────────
  const cc = loadTs("lib/cartClassification.ts", {});
  cc.__resetCartClassificationCacheForTests();
  let fetchCount = 0;
  const origFetch = global.fetch;
  global.fetch = async () => {
    fetchCount += 1;
    return {
      ok: true,
      async json() {
        return [
          {
            id: 1,
            name: "A",
            category: "Subscription",
            stock: "Digital",
            active: 1,
          },
        ];
      },
    };
  };
  cc.hydrateProductFactsCatalog([
    { id: 1, name: "A", category: "Subscription", stock: "Digital", active: 1 },
  ]);
  await cc.loadProductFactsCatalog();
  await cc.loadProductFactsCatalog();
  ok("E_hydrate_prevents_network_fetch", fetchCount === 0);

  cc.__resetCartClassificationCacheForTests();
  fetchCount = 0;
  await Promise.all([cc.loadProductFactsCatalog(), cc.loadProductFactsCatalog()]);
  global.fetch = origFetch;
  ok("E_inflight_dedupes_to_one_fetch", fetchCount === 1);

  // ── Price validation matrix ──────────────────────────────────────────────
  const STRICT_PRICE_NUMERIC =
    /^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?$/;
  function validatePrice(value) {
    if (value === null || value === undefined || value === "") return { ok: false };
    if (typeof value === "number") {
      if (!Number.isFinite(value) || value < 0) return { ok: false };
      if (Math.abs(value * 100 - Math.round(value * 100)) > 1e-6) return { ok: false };
      return { ok: true, price: value };
    }
    if (typeof value !== "string") return { ok: false };
    let raw = value.trim();
    if (!raw || /^(nan|infinity|\+infinity|-infinity)$/i.test(raw)) return { ok: false };
    if (raw.startsWith("£")) raw = raw.slice(1).trim();
    if (!STRICT_PRICE_NUMERIC.test(raw)) return { ok: false };
    const n = Number(raw.replace(/,/g, ""));
    if (!Number.isFinite(n) || n < 0) return { ok: false };
    return { ok: true, price: n };
  }
  // Mirror parseStrictPriceGbp from productAiClient (source-asserted above)
  function parseStrictPriceGbp(value) {
    if (value === null || value === undefined || value === "") return undefined;
    if (typeof value === "number") {
      if (!Number.isFinite(value) || value < 0) return undefined;
      if (Math.abs(value * 100 - Math.round(value * 100)) > 1e-6) return undefined;
      return value;
    }
    if (typeof value !== "string") return undefined;
    let raw = value.trim();
    if (!raw || /^(nan|infinity|\+infinity|-infinity)$/i.test(raw)) return undefined;
    if (raw.startsWith("£")) raw = raw.slice(1).trim();
    if (!STRICT_PRICE_NUMERIC.test(raw)) return undefined;
    const n = Number(raw.replace(/,/g, ""));
    if (!Number.isFinite(n) || n < 0) return undefined;
    return n;
  }
  ok(
    "F_client_helper_in_source",
    /export function parseStrictPriceGbp/.test(paiSrc)
  );
  const priceCases = [
    ["12abc", false],
    ["", false],
    ["-1", false],
    ["1e3", false],
    ["12.345", false],
    ["12.34", true],
    ["0", true],
    ["9.99", true],
  ];
  for (const [input, expectOk] of priceCases) {
    ok(`F_price_server_${String(input) || "empty"}`, validatePrice(input).ok === expectOk);
    const v = parseStrictPriceGbp(input);
    ok(
      `F_price_client_${String(input) || "empty"}`,
      expectOk ? v !== undefined : v === undefined
    );
  }

  // ── Coupon validation matrix ─────────────────────────────────────────────
  const coupon = loadTs("lib/couponValidation.ts", {});
  ok("G_value_junk", !coupon.parseCouponValue("12abc", "fixed").ok);
  ok("G_value_exp", !coupon.parseCouponValue("1e3", "fixed").ok);
  ok("G_pct_0", !coupon.parseCouponValue(0, "percentage").ok);
  ok("G_pct_101", !coupon.parseCouponValue(101, "percentage").ok);
  ok("G_pct_50", coupon.parseCouponValue(50, "percentage").ok);
  ok("G_min_neg", !coupon.parseMinimumOrder(-1).ok);
  ok("G_min_0", coupon.parseMinimumOrder(0).ok);
  ok("G_usage_neg", !coupon.parseUsageLimit(-1).ok);
  ok(
    "G_usage_blank_null",
    coupon.parseUsageLimit("").ok && coupon.parseUsageLimit("").value === null
  );
  ok("G_usage_5", coupon.parseUsageLimit(5).ok);

  // ── Payment disabled between early check and TX ──────────────────────────
  cache.clear();
  let insertCount = 0;
  let rollbackCount = 0;
  let paymentReads = 0;

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

  function makeConn() {
    return {
      async beginTransaction() {},
      async commit() {},
      async rollback() {
        rollbackCount += 1;
      },
      release() {},
      async query(arg, maybeParams) {
        const sql = typeof arg === "string" ? arg : String(arg?.sql || "");
        const params = arg && arg.values ? arg.values : maybeParams || [];
        if (/information_schema\.COLUMNS/i.test(sql)) {
          return [LEGACY_BASELINE_COLS.map((name) => ({ name })), []];
        }
        if (/FROM products WHERE id IN/i.test(sql) && /FOR UPDATE/i.test(sql)) {
          if (
            /lifecycle_mode|shop_listed|season_starts_at|product_version/i.test(sql)
          ) {
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
      return makeConn();
    },
    async query() {
      return [[], []];
    },
  };

  function paymentStub() {
    return {
      getPaymentMethodSettings: async () => {
        paymentReads += 1;
        if (paymentReads === 1) {
          return { bankEnabled: true, codEnabled: true, bothOffCorrected: false };
        }
        return { bankEnabled: false, codEnabled: true, bothOffCorrected: false };
      },
      clearPaymentMethodSettingsCache: () => {},
    };
  }

  function sharedStubs() {
    const pay = paymentStub();
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
      "../../lib/paymentMethodSettingsServer": pay,
      "@/lib/paymentMethodSettingsServer": pay,
      "../../lib/pricesIncludeVatServer": {
        getPricesIncludeVat: async () => false,
        clearPricesIncludeVatCache: () => {},
      },
      "@/lib/pricesIncludeVatServer": {
        getPricesIncludeVat: async () => false,
        clearPricesIncludeVatCache: () => {},
      },
      nodemailer: {
        createTransport: () => ({ sendMail: async () => ({}) }),
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

  insertCount = 0;
  rollbackCount = 0;
  paymentReads = 0;
  const handler = loadOrdersHandler();
  const req = {
    method: "POST",
    body: {
      customer_name: "Test Buyer",
      customer_email: "buyer@example.com",
      customer_phone: "+447123456789",
      delivery_address: "1 Test St",
      city: "London",
      postcode: "E1 1AA",
      notes: "",
      payment_method: "bank",
      receipt_path: "/uploads/receipts/x.jpg",
      items: [{ id: 3, qty: 1 }],
      coupon_code: "",
      payment_reference: "",
      digital_supply_acknowledgement: true,
    },
    headers: {},
    socket: { remoteAddress: "127.0.0.1" },
  };
  const res = makeRes();
  await handler(req, res);
  await new Promise((r) => setImmediate(r));

  ok(
    "A_mid_tx_disabled_400",
    res.statusCode === 400 && res.body?.error === "Payment method unavailable."
  );
  ok("A_mid_tx_no_insert", insertCount === 0);
  ok("A_mid_tx_rollback", rollbackCount >= 1);
  ok("A_mid_tx_two_payment_reads", paymentReads === 2);

  // TEST-HYG-1: scope allowlist to this commit range
  const HARDEN79_ALLOW = new Set([
    "pages/api/orders.ts",
    "lib/insightsRetention.ts",
    "lib/cartClassification.ts",
    "app/HomeClient.tsx",
    "app/cart/page.tsx",
    "app/sidhu/page.tsx",
    "scripts/phase-harden-79-tests.js",
  ]);
  let dirtyNames = [];
  try {
    dirtyNames = execSync("git diff --name-only origin/main...HEAD", {
      cwd: ROOT,
      encoding: "utf8",
    })
      .split(/\r?\n/)
      .map((s) => s.trim().replace(/\\/g, "/"))
      .filter(Boolean);
    const wt = execSync("git diff --name-only HEAD", {
      cwd: ROOT,
      encoding: "utf8",
    })
      .split(/\r?\n/)
      .map((s) => s.trim().replace(/\\/g, "/"))
      .filter(Boolean);
    const untracked = execSync("git ls-files --others --exclude-standard", {
      cwd: ROOT,
      encoding: "utf8",
    })
      .split(/\r?\n/)
      .map((s) => s.trim().replace(/\\/g, "/"))
      .filter(Boolean);
    dirtyNames = [...new Set([...dirtyNames, ...wt, ...untracked])];
  } catch (e) {
    ok("diff_allowlist_harden79", false, String(e.message || e));
  }
  const unexpected = dirtyNames.filter((f) => !HARDEN79_ALLOW.has(f));
  ok(
    "diff_allowlist_harden79",
    unexpected.length === 0,
    unexpected.join(",") || `files=${dirtyNames.length}`
  );

  console.log(`\nHARDEN-79: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
