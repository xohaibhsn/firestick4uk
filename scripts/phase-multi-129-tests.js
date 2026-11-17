/**
 * F4UK-MULTI-129 — order idempotency runtime (Idempotency-Key + request hash).
 * Mocked pool/conn + nodemailer only. NEVER a real DB.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const NODE = process.execPath;

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

function loadTs(rel, stubs = {}) {
  const abs = path.join(ROOT, rel);
  const src = fs.readFileSync(abs, "utf8");
  const out = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
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
    if (Object.prototype.hasOwnProperty.call(stubs, id)) return stubs[id];
    if (id.startsWith("@/")) {
      const mapped = id.slice(2);
      for (const candidate of [
        path.join(ROOT, mapped + ".ts"),
        path.join(ROOT, mapped + ".tsx"),
        path.join(ROOT, mapped + ".js"),
      ]) {
        if (fs.existsSync(candidate)) {
          return loadTs(path.relative(ROOT, candidate).replace(/\\/g, "/"), stubs);
        }
      }
    }
    if (id.startsWith("./") || id.startsWith("../")) {
      const base = path.normalize(path.join(path.dirname(abs), id));
      for (const candidate of [base + ".ts", base + ".tsx", base + ".js"]) {
        if (fs.existsSync(candidate)) {
          return loadTs(path.relative(ROOT, candidate).replace(/\\/g, "/"), stubs);
        }
      }
    }
    return orig(id);
  };
  m._compile(out, abs);
  return m.exports;
}

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(k, v) {
      this.headers[String(k).toLowerCase()] = v;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

const PRODUCT = {
  id: 3,
  name: "Digital Plan",
  active: 1,
  price: 29.99,
  category: "subscription",
  stock: "digital",
};

const VALID_KEY = "a1b2c3d4-e5f6-4789-a012-3456789abcde";
const VALID_KEY_2 = "b2c3d4e5-f6a7-4890-b123-456789abcdef";

function hex64(seed) {
  return crypto.createHash("sha256").update(String(seed)).digest("hex");
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
    payment_method: "cod",
    receipt_path: "",
    items: [{ id: 3, qty: 1 }],
    coupon_code: "",
    payment_reference: "",
    digital_supply_acknowledgement: true,
    ...overrides,
  };
}

function makeHarness(opts = {}) {
  const calls = [];
  const poolCalls = [];
  let began = 0;
  let committed = 0;
  let rolled = 0;
  let released = 0;
  let getConnectionCount = 0;
  let mailCalls = 0;
  let orderInsertCount = 0;
  let couponUpdateCount = 0;
  let idemInsertCount = 0;
  let createAttempts = 0;

  const mode = opts.mode || "success";
  // collision modes: fail first N order inserts / idem inserts with specific dup keys
  let orderDupLeft = opts.orderDupTimes || 0;
  let idemPrimaryDupLeft = opts.idemPrimaryDupTimes || 0;
  let idemUqDupLeft = opts.idemUqDupTimes || 0;
  const replayHash = opts.replayHash || null;
  const replayOrderId = opts.replayOrderId || "ORD-EXISTING0000001";
  const replayOrderMissing = opts.replayOrderMissing === true;
  const replayKeyMissing = opts.replayKeyMissing === true;
  const orphanThenSuccess = opts.orphanThenSuccess === true;
  let orphanDeleted = false;
  let keyMissingRestarts = 0;

  const conn = {
    async beginTransaction() {
      began += 1;
      createAttempts += 1;
    },
    async commit() {
      committed += 1;
    },
    async rollback() {
      rolled += 1;
    },
    release() {
      released += 1;
    },
    async query(sqlOrObj, maybeParams) {
      const sql =
        typeof sqlOrObj === "string" ? sqlOrObj : String(sqlOrObj?.sql || "");
      const params = sqlOrObj?.values || maybeParams || [];
      calls.push({ sql, params, via: "conn" });

      if (/INSERT INTO order_idempotency_keys/i.test(sql)) {
        idemInsertCount += 1;
        if (idemPrimaryDupLeft > 0) {
          idemPrimaryDupLeft -= 1;
          const err = new Error(
            "Duplicate entry for key 'PRIMARY'"
          );
          err.code = "ER_DUP_ENTRY";
          err.errno = 1062;
          err.sqlMessage = "Duplicate entry 'x' for key 'PRIMARY'";
          throw err;
        }
        if (idemUqDupLeft > 0) {
          idemUqDupLeft -= 1;
          const err = new Error(
            "Duplicate entry for key 'uq_oik_order_id'"
          );
          err.code = "ER_DUP_ENTRY";
          err.errno = 1062;
          err.sqlMessage = "Duplicate entry 'x' for key 'uq_oik_order_id'";
          throw err;
        }
        return [{ affectedRows: 1 }, []];
      }

      if (/INSERT INTO orders/i.test(sql)) {
        orderInsertCount += 1;
        if (orderDupLeft > 0) {
          orderDupLeft -= 1;
          const err = new Error("Duplicate entry for key 'order_id'");
          err.code = "ER_DUP_ENTRY";
          err.errno = 1062;
          err.sqlMessage = "Duplicate entry 'x' for key 'order_id'";
          throw err;
        }
        return [{ affectedRows: 1 }, []];
      }
      if (/INSERT INTO order_items/i.test(sql)) return [{ affectedRows: 1 }, []];
      if (/FROM coupons/i.test(sql)) return [[], []];
      if (/UPDATE coupons SET used_count/i.test(sql)) {
        couponUpdateCount += 1;
        return [{ affectedRows: 1 }, []];
      }
      return [[], []];
    },
  };

  const pool = {
    async getConnection() {
      getConnectionCount += 1;
      return conn;
    },
    async query(sqlOrObj, maybeParams) {
      const sql =
        typeof sqlOrObj === "string" ? sqlOrObj : String(sqlOrObj?.sql || "");
      const params = sqlOrObj?.values || maybeParams || [];
      poolCalls.push({ sql, params, via: "pool" });

      if (/SELECT request_hash, order_id FROM order_idempotency_keys/i.test(sql)) {
        if (replayKeyMissing) {
          keyMissingRestarts += 1;
          // First replay: missing; after restart create succeeds (no more dup).
          if (keyMissingRestarts === 1) return [[], []];
        }
        if (orphanThenSuccess && orphanDeleted) {
          // After orphan delete + restart, create path should not hit replay again.
          return [[], []];
        }
        return [
          [
            {
              request_hash: replayHash,
              order_id: replayOrderId,
            },
          ],
          [],
        ];
      }
      if (
        /SELECT order_id, total, discount_amount, vat_amount, coupon_code FROM orders/i.test(
          sql
        )
      ) {
        if (replayOrderMissing || (orphanThenSuccess && !orphanDeleted)) {
          return [[], []];
        }
        return [
          [
            {
              order_id: replayOrderId,
              total: 29.99,
              discount_amount: 0,
              vat_amount: 0,
              coupon_code: null,
            },
          ],
          [],
        ];
      }
      if (/SELECT product_id, product_name, price, quantity FROM order_items/i.test(sql)) {
        return [
          [
            {
              product_id: 3,
              product_name: "Digital Plan",
              price: 29.99,
              quantity: 1,
              id: 1,
            },
          ],
          [],
        ];
      }
      if (/DELETE FROM order_idempotency_keys WHERE idempotency_key=\? AND order_id=\?/i.test(sql)) {
        orphanDeleted = true;
        return [{ affectedRows: 1 }, []];
      }
      return [[], []];
    },
  };

  const stubs = {
    "../../lib/db": { __esModule: true, default: pool },
    "@/lib/db": { __esModule: true, default: pool },
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
    "../../lib/orderProductEligibility": {
      lockAndAuthorizeOrderProducts: async ({ productIds }) => ({
        ok: true,
        productsById: new Map(productIds.map((id) => [id, PRODUCT])),
        capability: { mode: "legacy" },
        nowMs: Date.now(),
      }),
    },
    "@/lib/orderProductEligibility": {
      lockAndAuthorizeOrderProducts: async ({ productIds }) => ({
        ok: true,
        productsById: new Map(productIds.map((id) => [id, PRODUCT])),
        capability: { mode: "legacy" },
        nowMs: Date.now(),
      }),
    },
    "../../lib/pricesIncludeVatServer": {
      getPricesIncludeVat: async () => false,
      isPricesIncludeVatReadError: () => false,
    },
    "@/lib/pricesIncludeVatServer": {
      getPricesIncludeVat: async () => false,
      isPricesIncludeVatReadError: () => false,
    },
    nodemailer: {
      createTransport: () => ({
        sendMail: async () => {
          mailCalls += 1;
          return {};
        },
      }),
    },
  };

  // Ensure SMTP so email path can fire (must not on replay).
  const prevUser = process.env.SMTP_USER;
  const prevPass = process.env.SMTP_PASS;
  process.env.SMTP_USER = "fixture@example.com";
  process.env.SMTP_PASS = "fixture-pass";

  const mod = loadTs("pages/api/orders.ts", stubs);
  const handler = mod.default || mod;

  function restoreEnv() {
    if (prevUser === undefined) delete process.env.SMTP_USER;
    else process.env.SMTP_USER = prevUser;
    if (prevPass === undefined) delete process.env.SMTP_PASS;
    else process.env.SMTP_PASS = prevPass;
  }

  return {
    handler,
    calls,
    poolCalls,
    restoreEnv,
    stats: () => ({
      began,
      committed,
      rolled,
      released,
      getConnectionCount,
      mailCalls,
      orderInsertCount,
      couponUpdateCount,
      idemInsertCount,
      createAttempts,
      orphanDeleted,
    }),
  };
}

async function invoke(handler, { body, headers }) {
  const res = makeRes();
  await handler(
    {
      method: "POST",
      body,
      headers: headers || {},
      socket: { remoteAddress: "127.0.0.1" },
    },
    res
  );
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  return res;
}

function loadHelpers() {
  return loadTs("lib/orderIdempotency.ts");
}

async function runOrdersTests() {
  console.log("\n# Orders idempotency");

  // 1) No header → no idempotency table; legacy sequence
  {
    const h = makeHarness();
    const res = await invoke(h.handler, { body: baseBody(), headers: {} });
    h.restoreEnv();
    ok("t1_legacy_200", res.statusCode === 200 && res.body?.success === true);
    ok("t1_no_replayed", res.body?.replayed !== true);
    ok(
      "t1_no_idem_queries",
      !h.calls.some((c) => /order_idempotency_keys/i.test(c.sql)) &&
        !h.poolCalls.some((c) => /order_idempotency_keys/i.test(c.sql))
    );
    const connSql = h.calls.map((c) => c.sql.replace(/\s+/g, " ").trim());
    ok(
      "t1_has_orders_insert",
      connSql.some((s) => /INSERT INTO orders/i.test(s))
    );
    ok("t1_mail_fired", h.stats().mailCalls >= 1);
  }

  // 2) Valid key → first TX query is key INSERT; 200 without replayed
  {
    const h = makeHarness();
    const res = await invoke(h.handler, {
      body: baseBody(),
      headers: { "idempotency-key": VALID_KEY },
    });
    h.restoreEnv();
    ok("t2_200", res.statusCode === 200 && res.body?.success === true);
    ok("t2_not_replayed", res.body?.replayed !== true);
    const firstAfterBegin = h.calls[0];
    ok(
      "t2_first_is_idem_insert",
      firstAfterBegin &&
        /INSERT INTO order_idempotency_keys/i.test(firstAfterBegin.sql)
    );
    ok(
      "t2_insert_params",
      firstAfterBegin &&
        firstAfterBegin.params[0] === VALID_KEY &&
        /^[a-f0-9]{64}$/.test(String(firstAfterBegin.params[1])) &&
        typeof firstAfterBegin.params[2] === "string" &&
        /^ORD-/.test(String(firstAfterBegin.params[2]))
    );
    ok("t2_mail_fired", h.stats().mailCalls >= 1);
  }

  // 3) Dup PRIMARY + same hash + order present → replayed
  {
    const helpers = loadHelpers();
    const hash = helpers.computeOrderRequestHash({
      items: [{ id: 3, qty: 1 }],
      couponCode: "",
      paymentMethod: "cod",
      email: "buyer@example.com",
    });
    const h = makeHarness({
      idemPrimaryDupTimes: 1,
      replayHash: hash,
      replayOrderId: "ORD-REPLAY000000001",
    });
    const res = await invoke(h.handler, {
      body: baseBody(),
      headers: { "idempotency-key": VALID_KEY },
    });
    h.restoreEnv();
    ok(
      "t3_replay_200",
      res.statusCode === 200 &&
        res.body?.replayed === true &&
        res.body?.order_id === "ORD-REPLAY000000001"
    );
    ok(
      "t3_no_orders_insert",
      h.stats().orderInsertCount === 0
    );
    ok("t3_no_coupon_update", h.stats().couponUpdateCount === 0);
    ok("t3_no_mail", h.stats().mailCalls === 0);
    ok(
      "t3_items_pricing",
      Array.isArray(res.body?.items) &&
        res.body.items[0]?.id === 3 &&
        res.body.pricing?.subtotal === 29.99 &&
        res.body.pricing?.total === 29.99
    );
  }

  // 4) Dup PRIMARY + different hash → 422
  {
    const h = makeHarness({
      idemPrimaryDupTimes: 1,
      replayHash: hex64("other-request"),
    });
    const res = await invoke(h.handler, {
      body: baseBody(),
      headers: { "idempotency-key": VALID_KEY },
    });
    h.restoreEnv();
    ok(
      "t4_422_reused",
      res.statusCode === 422 && res.body?.code === "idempotency_key_reused"
    );
    ok("t4_no_orders_insert", h.stats().orderInsertCount === 0);
    ok("t4_no_mail", h.stats().mailCalls === 0);
  }

  // 5) Malformed / uppercase / array header → 400; getConnection never called
  {
    for (const [label, headers] of [
      ["malformed", { "idempotency-key": "NOT-A-UUID" }],
      ["uppercase", { "idempotency-key": VALID_KEY.toUpperCase() }],
      ["array", { "idempotency-key": [VALID_KEY, VALID_KEY] }],
    ]) {
      const h = makeHarness();
      const res = await invoke(h.handler, {
        body: baseBody(),
        headers,
      });
      h.restoreEnv();
      ok(
        `t5_${label}_400`,
        res.statusCode === 400 && res.body?.code === "invalid_idempotency_key"
      );
      ok(`t5_${label}_no_conn`, h.stats().getConnectionCount === 0);
    }
  }

  // 6) Dup on uq_oik_order_id → one retry → 200
  {
    const h = makeHarness({ idemUqDupTimes: 1 });
    const res = await invoke(h.handler, {
      body: baseBody(),
      headers: { "idempotency-key": VALID_KEY_2 },
    });
    h.restoreEnv();
    ok("t6_200_after_retry", res.statusCode === 200 && res.body?.success === true);
    ok("t6_two_attempts", h.stats().began === 2);
    ok("t6_committed_once", h.stats().committed === 1);
  }

  // 7) Dup on INSERT orders → one retry → 200; second collision → 500
  {
    const h = makeHarness({ orderDupTimes: 1 });
    const res = await invoke(h.handler, {
      body: baseBody(),
      headers: {},
    });
    h.restoreEnv();
    ok("t7a_retry_200", res.statusCode === 200 && res.body?.success === true);
    ok("t7a_two_attempts", h.stats().began === 2);
  }
  {
    const h = makeHarness({ orderDupTimes: 2 });
    const res = await invoke(h.handler, {
      body: baseBody(),
      headers: {},
    });
    h.restoreEnv();
    ok("t7b_second_collision_500", res.statusCode === 500);
    ok(
      "t7b_generic_error",
      /Unable to create order/.test(String(res.body?.error || ""))
    );
  }

  // 8) Orphan key → DELETE + one restart → 200; ≤2 restarts
  {
    const helpers = loadHelpers();
    const hash = helpers.computeOrderRequestHash({
      items: [{ id: 3, qty: 1 }],
      couponCode: "",
      paymentMethod: "cod",
      email: "buyer@example.com",
    });
    const h = makeHarness({
      idemPrimaryDupTimes: 1,
      replayHash: hash,
      replayOrderId: "ORD-ORPHAN000000001",
      orphanThenSuccess: true,
    });
    const res = await invoke(h.handler, {
      body: baseBody(),
      headers: { "idempotency-key": VALID_KEY },
    });
    h.restoreEnv();
    ok("t8_orphan_200", res.statusCode === 200 && res.body?.success === true);
    ok("t8_orphan_deleted", h.stats().orphanDeleted === true);
    ok(
      "t8_orphan_delete_params",
      h.poolCalls.some(
        (c) =>
          /DELETE FROM order_idempotency_keys WHERE idempotency_key=\? AND order_id=\?/i.test(
            c.sql
          ) &&
          c.params[0] === VALID_KEY &&
          c.params[1] === "ORD-ORPHAN000000001"
      )
    );
    ok("t8_at_most_two_restarts", h.stats().began <= 3);
  }

  // 9) Key row missing on replay → one restart → 200
  {
    const h = makeHarness({
      idemPrimaryDupTimes: 1,
      replayKeyMissing: true,
    });
    const res = await invoke(h.handler, {
      body: baseBody(),
      headers: { "idempotency-key": VALID_KEY },
    });
    h.restoreEnv();
    ok("t9_missing_restart_200", res.statusCode === 200 && res.body?.success === true);
    ok("t9_two_begins", h.stats().began === 2);
  }
}

function runHelperTests() {
  console.log("\n# Pure helpers");
  const h = loadHelpers();

  const a = h.computeOrderRequestHash({
    items: [
      { id: 2, qty: 1 },
      { id: 1, qty: 3 },
    ],
    couponCode: "SAVE10",
    paymentMethod: "cod",
    email: "A@Example.COM",
  });
  const b = h.computeOrderRequestHash({
    items: [
      { id: 1, qty: 3 },
      { id: 2, qty: 1 },
    ],
    couponCode: "SAVE10",
    paymentMethod: "cod",
    email: "a@example.com",
  });
  ok("t10_hash_stable_order_email", a === b && /^[a-f0-9]{64}$/.test(a));

  const cQty = h.computeOrderRequestHash({
    items: [
      { id: 1, qty: 4 },
      { id: 2, qty: 1 },
    ],
    couponCode: "SAVE10",
    paymentMethod: "cod",
    email: "a@example.com",
  });
  ok("t10_hash_changes_qty", cQty !== a);

  const cCoupon = h.computeOrderRequestHash({
    items: [
      { id: 1, qty: 3 },
      { id: 2, qty: 1 },
    ],
    couponCode: "OTHER",
    paymentMethod: "cod",
    email: "a@example.com",
  });
  ok("t10_hash_changes_coupon", cCoupon !== a);

  const cPay = h.computeOrderRequestHash({
    items: [
      { id: 1, qty: 3 },
      { id: 2, qty: 1 },
    ],
    couponCode: "SAVE10",
    paymentMethod: "bank",
    email: "a@example.com",
  });
  ok("t10_hash_changes_payment", cPay !== a);

  const cEmail = h.computeOrderRequestHash({
    items: [
      { id: 1, qty: 3 },
      { id: 2, qty: 1 },
    ],
    couponCode: "SAVE10",
    paymentMethod: "cod",
    email: "other@example.com",
  });
  ok("t10_hash_changes_email", cEmail !== a);

  ok("t11_valid_v4", h.isValidIdempotencyKey(VALID_KEY) === true);
  ok("t11_reject_upper", h.isValidIdempotencyKey(VALID_KEY.toUpperCase()) === false);
  ok("t11_reject_v1", h.isValidIdempotencyKey("a1b2c3d4-e5f6-1789-a012-3456789abcde") === false);
  ok("t11_reject_nil", h.isValidIdempotencyKey("not-a-uuid") === false);
  ok("t11_reject_number", h.isValidIdempotencyKey(123) === false);

  ok("t_dup_entry_code", h.isDupEntry({ code: "ER_DUP_ENTRY" }) === true);
  ok("t_dup_entry_errno", h.isDupEntry({ errno: 1062 }) === true);
  ok(
    "t_dup_key_primary",
    h.dupKeyName({ sqlMessage: "Duplicate entry 'x' for key 'PRIMARY'" }) ===
      "PRIMARY"
  );
  ok(
    "t_dup_key_qualified",
    h.dupKeyName({
      message: "Duplicate entry 'x' for key 'order_idempotency_keys.PRIMARY'",
    }) === "order_idempotency_keys.PRIMARY"
  );
  ok("t_is_primary_simple", h.isPrimaryDupKey("PRIMARY") === true);
  ok(
    "t_is_primary_qualified",
    h.isPrimaryDupKey("order_idempotency_keys.PRIMARY") === true
  );
}

async function runAdminDeleteTests() {
  console.log("\n# admin-orders DELETE cleanup");

  const calls = [];
  let began = 0;
  let committed = 0;
  let rolled = 0;
  let released = 0;
  let failMode = false;

  const conn = {
    async beginTransaction() {
      began += 1;
    },
    async commit() {
      committed += 1;
    },
    async rollback() {
      rolled += 1;
    },
    release() {
      released += 1;
    },
    async query(sqlOrObj, maybeParams) {
      const sql =
        typeof sqlOrObj === "string" ? sqlOrObj : String(sqlOrObj?.sql || "");
      const params = sqlOrObj?.values || maybeParams || [];
      calls.push({ sql, params });
      if (/SELECT order_id, status, total FROM orders WHERE order_id=\? FOR UPDATE/i.test(sql)) {
        return [[{ order_id: "ORD-1", status: "pending", total: 10 }], []];
      }
      if (/DELETE FROM order_items/i.test(sql)) return [{ affectedRows: 1 }, []];
      if (/DELETE FROM orders WHERE order_id=\?/i.test(sql)) {
        if (failMode) {
          const err = new Error("fail");
          err.code = "ER_SIMULATED";
          throw err;
        }
        return [{ affectedRows: 1 }, []];
      }
      if (/DELETE FROM order_idempotency_keys WHERE order_id=\?/i.test(sql)) {
        return [{ affectedRows: 1 }, []];
      }
      return [[], []];
    },
  };

  const stubs = {
    "../../lib/db": {
      async getConnection() {
        return conn;
      },
    },
    "../../lib/adminAuth": {
      getRequestMeta: () => ({ ip: "127.0.0.1" }),
      requireAdminPermission: async () => ({
        id: 1,
        email: "admin@test",
        role: "super_admin",
      }),
    },
    "../../lib/adminAudit": { recordAdminAudit: async () => {} },
    "../../lib/adminNoStore": { setAdminNoStore: () => {} },
    "../../lib/adminPermissions": { hasAdminPermission: () => true },
    "../../lib/adminOrdersQuery": {
      ORDER_STATUSES: ["pending"],
      buildOrderWhere: () => ({ whereSql: "1=1", params: [] }),
      clampInt: (n, d) => Number(n) || d,
      isCancelReason: () => true,
      itemsListForOrderIds: async () => ({}),
      parseOrderFilters: () => ({}),
    },
  };

  const mod = loadTs("pages/api/admin-orders.ts", stubs);
  const handler = mod.default || mod;

  {
    began = committed = rolled = released = 0;
    calls.length = 0;
    failMode = false;
    const res = makeRes();
    await handler(
      { method: "DELETE", body: { order_id: "ORD-1" }, headers: {}, query: {} },
      res
    );
    ok("t12_200", res.statusCode === 200);
    const idxItems = calls.findIndex((c) => /DELETE FROM order_items/i.test(c.sql));
    const idxOrders = calls.findIndex((c) => /DELETE FROM orders WHERE order_id=\?/i.test(c.sql));
    const idxIdem = calls.findIndex((c) =>
      /DELETE FROM order_idempotency_keys WHERE order_id=\?/i.test(c.sql)
    );
    ok(
      "t12_order_idem_delete_after_orders",
      idxOrders >= 0 && idxIdem > idxOrders && idxItems >= 0 && idxItems < idxOrders
    );
    ok("t12_before_commit", committed === 1 && rolled === 0);
    ok(
      "t12_idem_params",
      idxIdem >= 0 && calls[idxIdem].params[0] === "ORD-1"
    );
  }

  {
    began = committed = rolled = released = 0;
    calls.length = 0;
    failMode = true;
    const res = makeRes();
    await handler(
      { method: "DELETE", body: { order_id: "ORD-1" }, headers: {}, query: {} },
      res
    );
    ok("t12_rollback_path", res.statusCode === 500 && rolled >= 1 && committed === 0);
    ok(
      "t12_rollback_no_idem_delete",
      !calls.some((c) => /order_idempotency_keys/i.test(c.sql))
    );
  }
}

function runCartStaticChecks() {
  console.log("\n# Cart page static");
  const cart = read("app/cart/page.tsx");
  ok(
    "t13_sends_idempotency_header",
    /["']Idempotency-Key["']\s*:\s*checkoutKey/.test(cart)
  );
  ok(
    "t13_session_key_name",
    /sessionStorage\.getItem\(\s*["']f4uk_checkout_key["']\s*\)/.test(cart)
  );
  ok(
    "t13_read_try_catch",
    /try\s*\{[\s\S]*?sessionStorage\.getItem\(\s*["']f4uk_checkout_key["']/.test(cart)
  );
  ok(
    "t13_reuse_when_sig_matches",
    /parsed\.sig === checkoutSig/.test(cart)
  );
  ok(
    "t13_remove_on_success",
    /if \(data\.order_id\)\s*\{[\s\S]*?sessionStorage\.removeItem\(\s*["']f4uk_checkout_key["']\s*\)/.test(
      cart
    )
  );
  ok(
    "t13_remove_on_reused",
    /idempotency_key_reused[\s\S]*?sessionStorage\.removeItem\(\s*["']f4uk_checkout_key["']\s*\)/.test(
      cart
    ) ||
      /code === ["']idempotency_key_reused["'][\s\S]*?removeItem\(\s*["']f4uk_checkout_key["']/.test(
        cart
      )
  );
  // No new user-visible copy for this feature (header/sessionStorage only).
  ok(
    "t13_no_new_visible_idem_label",
    !/Idempotency Key|Checkout session key/.test(cart)
  );
  ok(
    "t13_no_visible_idempotency_copy",
    !/>\s*[^<{]*[Ii]dempotency[^<]*</.test(cart) &&
      !/t\(\s*["'][^"']*[Ii]dempotency/.test(cart)
  );
}

function runDdlGate() {
  console.log("\n# check-runtime-ddl");
  const r = spawnSync(NODE, [path.join(ROOT, "scripts", "check-runtime-ddl.js")], {
    cwd: ROOT,
    encoding: "utf8",
  });
  ok("t14_check_runtime_ddl", r.status === 0, (r.stdout || r.stderr || "").trim());

  const runtimeFiles = [
    "pages/api/orders.ts",
    "pages/api/admin-orders.ts",
    "lib/orderIdempotency.ts",
    "app/cart/page.tsx",
  ];
  for (const f of runtimeFiles) {
    const src = read(f);
    ok(
      `t14_no_ddl_${path.basename(f)}`,
      !/CREATE\s+TABLE/i.test(src) &&
        !/ALTER\s+TABLE/i.test(src) &&
        !/ADD\s+COLUMN/i.test(src)
    );
  }
}

async function main() {
  await runOrdersTests();
  runHelperTests();
  await runAdminDeleteTests();
  runCartStaticChecks();
  runDdlGate();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
