/**
 * F4UK-MULTI-123 — atomic order delete, validated FAQ delete, coupon PUT 409.
 * Static checks + mocked pool/conn only. No real DB / network.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");
const { createHash } = require("crypto");

const ROOT = path.resolve(__dirname, "..");

/** Baseline hashes of untouched handler regions (computed at test start from current tree). */
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

function sha256(s) {
  return createHash("sha256").update(String(s), "utf8").digest("hex");
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

function nonDeleteAdminOrdersHash() {
  const s = read("pages/api/admin-orders.ts");
  const a = s.indexOf('if (req.method === "DELETE")');
  const b = s.indexOf("return res.status(405)", a);
  return sha256(s.slice(0, a) + s.slice(b));
}

function nonDeleteFaqsHash() {
  const s = read("pages/api/faqs.ts");
  const a = s.indexOf("if (req.method === 'DELETE')");
  const b = s.indexOf("return res.status(405)", a);
  return sha256(s.slice(0, a) + s.slice(b));
}

function nonPutCouponsHash() {
  const s = read("pages/api/coupons.ts");
  const a = s.indexOf("if (req.method === 'PUT')");
  const b = s.indexOf("if (req.method === 'DELETE')", a);
  return sha256(s.slice(0, a) + s.slice(b));
}

const EXPECTED = {
  adminOrders_nonDelete:
    "a74ee2cfe2b780bd898bbb1adef6387e3f1fdb0e90132c0802b27db007dc5f90",
  faqs_nonDelete: "dd0e190ea9edd6e6ec8479be3717a45c261d7b92affd475c348f2f6af7a33b1a",
  // Refresh MULTI-126: DELETE affectedRows hardening intentionally changes non-PUT surface.
  coupons_nonPut: "3ed00d3f93c9b4e44a382f7e1b87c5752ee41833d9fbab5ec9cf108419a91be0",
};

// ─── E1: admin-orders DELETE ───────────────────────────────────────────────

function makeOrdersHarness(opts = {}) {
  const order = opts.order || {
    order_id: "ORD-1730000000000123",
    status: "pending",
    total: 49.99,
  };
  const missing = opts.missing === true;
  const failOnOrdersDelete = opts.failOnOrdersDelete === true;
  const itemsAffected = opts.itemsAffected != null ? opts.itemsAffected : 2;

  const calls = [];
  const audits = [];
  let began = 0;
  let committed = 0;
  let rolled = 0;
  let released = 0;
  let deletedItems = false;
  let deletedOrder = false;

  const conn = {
    async beginTransaction() {
      began++;
    },
    async commit() {
      committed++;
    },
    async rollback() {
      rolled++;
    },
    release() {
      released++;
    },
    async query(sqlOrObj, maybeParams) {
      const sql =
        typeof sqlOrObj === "string" ? sqlOrObj : String(sqlOrObj?.sql || "");
      const params = sqlOrObj?.values || maybeParams || [];
      calls.push({ sql, params, via: "conn" });
      if (/SELECT order_id, status, total FROM orders WHERE order_id=\? FOR UPDATE/i.test(sql)) {
        if (missing) return [[], []];
        return [[{ ...order }], []];
      }
      if (/DELETE FROM order_items WHERE order_id=\?/i.test(sql)) {
        deletedItems = true;
        return [{ affectedRows: itemsAffected }, []];
      }
      if (/DELETE FROM orders WHERE order_id=\?/i.test(sql)) {
        if (failOnOrdersDelete) {
          const err = new Error("simulated orders delete failure");
          err.code = "ER_SIMULATED";
          throw err;
        }
        deletedOrder = true;
        return [{ affectedRows: 1 }, []];
      }
      return [[], []];
    },
  };

  const pool = {
    async getConnection() {
      return conn;
    },
    async query() {
      throw new Error("pool.query must not be used on DELETE path");
    },
  };

  const stubs = {
    "../../lib/db": pool,
    "../../lib/adminAuth": {
      getRequestMeta: () => ({ ip: "127.0.0.1" }),
      requireAdminPermission: async () => ({
        id: 1,
        email: "admin@test",
        role: "super_admin",
      }),
    },
    "../../lib/adminAudit": {
      recordAdminAudit: async (a) => {
        audits.push(a);
      },
    },
    "../../lib/adminNoStore": { setAdminNoStore: () => {} },
    "../../lib/adminPermissions": {
      hasAdminPermission: () => true,
    },
    "../../lib/adminOrdersQuery": {
      ORDER_STATUSES: ["pending", "confirmed", "dispatched", "delivered", "cancelled"],
      buildOrderWhere: () => ({ whereSql: "1=1", params: [] }),
      clampInt: (n, d) => Number(n) || d,
      isCancelReason: () => true,
      itemsListForOrderIds: async () => ({}),
      parseOrderFilters: () => ({}),
    },
  };

  const mod = loadTs("pages/api/admin-orders.ts", stubs);
  const handler = mod.default || mod;

  return {
    handler,
    calls,
    audits,
    stats: () => ({
      began,
      committed,
      rolled,
      released,
      deletedItems,
      deletedOrder,
    }),
  };
}

async function runE1() {
  {
    const h = makeOrdersHarness();
    const res = makeRes();
    await h.handler(
      { method: "DELETE", body: { order_id: "ORD-1730000000000123" }, headers: {}, query: {} },
      res
    );
    const st = h.stats();
    ok("e1_success_200", res.statusCode === 200);
    ok(
      "e1_response_shape",
      res.body &&
        res.body.success === true &&
        res.body.deleted_order_id === "ORD-1730000000000123" &&
        res.body.reversed_amount === 49.99 &&
        res.body.was_status === "pending" &&
        Object.keys(res.body).sort().join(",") ===
          "deleted_order_id,reversed_amount,success,was_status"
    );
    ok("e1_single_commit", st.began === 1 && st.committed === 1 && st.rolled === 0);
    ok("e1_both_deletes_on_conn", st.deletedItems && st.deletedOrder);
    ok(
      "e1_deletes_via_conn_only",
      h.calls.every((c) => c.via === "conn") &&
        h.calls.filter((c) => /DELETE FROM order_items/i.test(c.sql)).length === 1 &&
        h.calls.filter((c) => /DELETE FROM orders/i.test(c.sql)).length === 1
    );
    ok(
      "e1_audit_items_deleted",
      h.audits.length === 1 &&
        h.audits[0].action === "order.deleted" &&
        h.audits[0].metadata &&
        h.audits[0].metadata.items_deleted === 2 &&
        h.audits[0].metadata.was_status === "pending"
    );
    ok("e1_conn_released", st.released === 1);
  }

  {
    const h = makeOrdersHarness({ failOnOrdersDelete: true });
    const res = makeRes();
    await h.handler(
      { method: "DELETE", body: { order_id: "ORD-1730000000000123" }, headers: {}, query: {} },
      res
    );
    const st = h.stats();
    ok("e1_mid_fail_500", res.statusCode === 500);
    ok("e1_mid_fail_rollback", st.began === 1 && st.committed === 0 && st.rolled >= 1);
    ok("e1_mid_fail_no_audit", h.audits.length === 0);
    ok("e1_mid_fail_no_order_deleted_flag", st.deletedOrder === false);
  }

  {
    const h = makeOrdersHarness({ missing: true });
    const res = makeRes();
    await h.handler(
      { method: "DELETE", body: { order_id: "ORD-1730000000000999" }, headers: {}, query: {} },
      res
    );
    const st = h.stats();
    ok("e1_missing_404", res.statusCode === 404 && res.body?.error === "Order not found");
    ok("e1_missing_rollback_no_commit", st.committed === 0 && st.rolled >= 1);
    ok(
      "e1_missing_no_delete",
      !h.calls.some((c) => /DELETE/i.test(c.sql))
    );
  }

  {
    const h = makeOrdersHarness();
    const res = makeRes();
    await h.handler(
      { method: "DELETE", body: { order_id: "" }, headers: {}, query: {} },
      res
    );
    ok("e1_bad_empty_400", res.statusCode === 400);
  }
  {
    const h = makeOrdersHarness();
    const res = makeRes();
    await h.handler(
      { method: "DELETE", body: { order_id: "x".repeat(65) }, headers: {}, query: {} },
      res
    );
    ok("e1_bad_long_400", res.statusCode === 400);
  }
  {
    const h = makeOrdersHarness();
    const res = makeRes();
    await h.handler(
      { method: "DELETE", body: { order_id: null }, headers: {}, query: {} },
      res
    );
    ok("e1_bad_null_400", res.statusCode === 400);
  }
}

// ─── E2: faqs DELETE ───────────────────────────────────────────────────────

function makeFaqsHarness(opts = {}) {
  const row = opts.row || {
    id: 7,
    question: "Q?",
    category: "General",
  };
  const missing = opts.missing === true;
  const calls = [];
  const audits = [];
  let began = 0;
  let committed = 0;
  let rolled = 0;
  let released = 0;
  let deleted = false;

  const conn = {
    async beginTransaction() {
      began++;
    },
    async commit() {
      committed++;
    },
    async rollback() {
      rolled++;
    },
    release() {
      released++;
    },
    async query(sqlOrObj, maybeParams) {
      const sql =
        typeof sqlOrObj === "string" ? sqlOrObj : String(sqlOrObj?.sql || "");
      const params = sqlOrObj?.values || maybeParams || [];
      calls.push({ sql, params, via: "conn" });
      if (/SELECT id, question, category FROM faqs WHERE id=\? FOR UPDATE/i.test(sql)) {
        if (missing) return [[], []];
        return [[{ ...row }], []];
      }
      if (/DELETE FROM faqs WHERE id=\?/i.test(sql)) {
        deleted = true;
        return [{ affectedRows: 1 }, []];
      }
      return [[], []];
    },
  };

  const pool = {
    async getConnection() {
      return conn;
    },
    async query(sql, params) {
      calls.push({ sql: String(sql), params: params || [], via: "pool" });
      // GET / reorder / other paths may hit pool — DELETE must not
      return [[], []];
    },
  };

  const stubs = {
    "../../lib/db": pool,
    "../../lib/adminAuth": {
      getRequestMeta: () => ({ ip: "127.0.0.1" }),
      requireAdminPermission: async () => ({
        id: 1,
        email: "admin@test",
        role: "super_admin",
      }),
    },
    "../../lib/adminAudit": {
      recordAdminAudit: async (a) => {
        audits.push(a);
      },
    },
    "../../lib/adminNoStore": { setAdminNoStore: () => {} },
    "../../lib/rateLimit": {
      getClientIp: () => "127.0.0.1",
      RL_PUBLIC_GET: () => ({ allowed: true, retryAfterSec: 0 }),
    },
    "../../lib/faqBaseHash": {
      faqRowBaseHash: () => "hash",
    },
  };

  const mod = loadTs("pages/api/faqs.ts", stubs);
  return {
    handler: mod.default || mod,
    calls,
    audits,
    stats: () => ({ began, committed, rolled, released, deleted }),
  };
}

async function runE2() {
  {
    const h = makeFaqsHarness();
    const res = makeRes();
    await h.handler({ method: "DELETE", query: { id: "abc" }, headers: {}, body: {} }, res);
    ok("e2_invalid_id_400", res.statusCode === 400 && res.body?.error === "invalid_id");
    ok("e2_invalid_no_delete", !h.stats().deleted && !h.calls.some((c) => /DELETE/i.test(c.sql)));
  }
  {
    const h = makeFaqsHarness();
    const res = makeRes();
    await h.handler({ method: "DELETE", query: { id: "0" }, headers: {}, body: {} }, res);
    ok("e2_invalid_zero_400", res.statusCode === 400 && res.body?.error === "invalid_id");
  }
  {
    const h = makeFaqsHarness();
    const res = makeRes();
    await h.handler({ method: "DELETE", query: { id: "-3" }, headers: {}, body: {} }, res);
    ok("e2_invalid_neg_400", res.statusCode === 400 && res.body?.error === "invalid_id");
  }

  {
    const h = makeFaqsHarness({ missing: true });
    const res = makeRes();
    await h.handler({ method: "DELETE", query: { id: "99" }, headers: {}, body: {} }, res);
    ok("e2_missing_404", res.statusCode === 404 && res.body?.error === "not_found");
    ok("e2_missing_no_delete", !h.calls.some((c) => /DELETE FROM faqs/i.test(c.sql)));
    ok("e2_missing_no_audit", h.audits.length === 0);
  }

  {
    const longQ = "Q".repeat(250);
    const h = makeFaqsHarness({
      row: { id: 7, question: longQ, category: "Setup" },
    });
    const res = makeRes();
    await h.handler({ method: "DELETE", query: { id: "7" }, headers: {}, body: {} }, res);
    ok("e2_success_200", res.statusCode === 200 && res.body?.success === true);
    ok("e2_success_delete", h.stats().deleted && h.stats().committed === 1);
    ok(
      "e2_audit_question_category",
      h.audits.length === 1 &&
        h.audits[0].action === "faq.deleted" &&
        h.audits[0].metadata.category === "Setup" &&
        h.audits[0].metadata.question === "Q".repeat(200) &&
        h.audits[0].metadata.question.length === 200
    );
  }

  {
    const h = makeFaqsHarness({
      row: { id: 3, question: "Short?", category: "General" },
    });
    const res = makeRes();
    await h.handler({ method: "DELETE", query: { id: 3 }, headers: {}, body: {} }, res);
    ok(
      "e2_numeric_id_ok",
      res.statusCode === 200 && h.audits[0]?.metadata?.question === "Short?"
    );
  }
}

// ─── E3: coupons PUT ───────────────────────────────────────────────────────

function makeCouponsHarness(opts = {}) {
  const mode = opts.mode || "ok"; // ok | dup | other | missing
  const calls = [];
  const audits = [];

  const pool = {
    async query(sqlOrObj, maybeParams) {
      const sql =
        typeof sqlOrObj === "string" ? sqlOrObj : String(sqlOrObj?.sql || "");
      const params = sqlOrObj?.values || maybeParams || [];
      calls.push({ sql, params });
      if (/UPDATE coupons SET code=/i.test(sql)) {
        if (mode === "dup") {
          const err = new Error("Duplicate entry");
          err.code = "ER_DUP_ENTRY";
          err.errno = 1062;
          throw err;
        }
        if (mode === "other") {
          const err = new Error("boom");
          err.code = "ER_BAD_FIELD_ERROR";
          throw err;
        }
        if (mode === "missing") {
          return [{ affectedRows: 0 }, []];
        }
        return [{ affectedRows: 1 }, []];
      }
      if (/INSERT INTO coupons/i.test(sql)) {
        return [{ insertId: 1, affectedRows: 1 }, []];
      }
      if (/SELECT \* FROM coupons/i.test(sql)) {
        return [[], []];
      }
      if (/SELECT id, code FROM coupons/i.test(sql)) {
        return [[{ id: 1, code: "SAVE10" }], []];
      }
      if (/DELETE FROM coupons/i.test(sql)) {
        return [{ affectedRows: 1 }, []];
      }
      return [[], []];
    },
  };

  const stubs = {
    "../../lib/db": pool,
    "../../lib/adminAuth": {
      getRequestMeta: () => ({ ip: "127.0.0.1" }),
      requireAdminPermission: async () => ({
        id: 1,
        email: "admin@test",
        role: "super_admin",
      }),
    },
    "../../lib/adminAudit": {
      recordAdminAudit: async (a) => {
        audits.push(a);
      },
    },
    "../../lib/adminNoStore": { setAdminNoStore: () => {} },
    "../../lib/rateLimit": {
      getClientIp: () => "127.0.0.1",
      RL_GENERAL: () => ({ allowed: true }),
    },
    "../../lib/orderPricing": {
      calculateCouponDiscount: () => 0,
      normalizeCouponCode: (c) => String(c).toUpperCase(),
    },
    "../../lib/couponValidation": {
      parseCartTotal: () => ({ ok: true, value: 100 }),
      parseCouponAdminInput: (body) => {
        if (!body?.code) return { ok: false, error: "Code required" };
        return {
          ok: true,
          value: {
            code: String(body.code).toUpperCase(),
            type: body.type || "percentage",
            value: Number(body.value) || 10,
            minimumOrder: Number(body.minimum_order) || 0,
            usageLimit: body.usage_limit == null || body.usage_limit === "" ? null : Number(body.usage_limit),
            expiresAt: body.expires_at || null,
          },
        };
      },
      parseCouponCode: (c) =>
        c ? { ok: true, value: String(c) } : { ok: false, error: "Coupon code is required" },
      parseCouponId: (id) => {
        const n = Number(id);
        if (!Number.isInteger(n) || n <= 0) return { ok: false, error: "Invalid id" };
        return { ok: true, value: n };
      },
      parseIsActive: (v) => {
        if (v === true || v === 1 || v === "1") return { ok: true, value: true };
        if (v === false || v === 0 || v === "0") return { ok: true, value: false };
        return { ok: false, error: "Invalid is_active" };
      },
    },
  };

  const mod = loadTs("pages/api/coupons.ts", stubs);
  return { handler: mod.default || mod, calls, audits };
}

function putBody(over = {}) {
  return {
    id: 1,
    code: "SAVE10",
    type: "percentage",
    value: 10,
    minimum_order: 0,
    usage_limit: null,
    expires_at: null,
    is_active: 1,
    ...over,
  };
}

async function runE3() {
  {
    const h = makeCouponsHarness({ mode: "dup" });
    const res = makeRes();
    await h.handler(
      { method: "PUT", body: putBody({ code: "TAKEN" }), query: {}, headers: {} },
      res
    );
    ok(
      "e3_dup_409",
      res.statusCode === 409 && res.body?.error === "Coupon code already exists"
    );
    ok("e3_dup_no_audit", h.audits.length === 0);
  }
  {
    const h = makeCouponsHarness({ mode: "other" });
    const res = makeRes();
    await h.handler(
      { method: "PUT", body: putBody(), query: {}, headers: {} },
      res
    );
    ok("e3_other_500", res.statusCode === 500 && res.body?.error === "Request failed");
  }
  {
    const h = makeCouponsHarness({ mode: "ok" });
    const res = makeRes();
    await h.handler(
      { method: "PUT", body: putBody(), query: {}, headers: {} },
      res
    );
    ok("e3_ok_200", res.statusCode === 200 && res.body?.success === true);
    ok(
      "e3_ok_audit",
      h.audits.length === 1 && h.audits[0].action === "coupon.updated"
    );
    ok(
      "e3_ok_update_issued",
      h.calls.some((c) => /UPDATE coupons SET code=/i.test(c.sql))
    );
  }
}

// ─── Source / client checks ────────────────────────────────────────────────

function runSourceChecks() {
  ok(
    "src_admin_orders_non_delete_hash",
    nonDeleteAdminOrdersHash() === EXPECTED.adminOrders_nonDelete,
    nonDeleteAdminOrdersHash()
  );
  ok(
    "src_faqs_non_delete_hash",
    nonDeleteFaqsHash() === EXPECTED.faqs_nonDelete,
    nonDeleteFaqsHash()
  );
  ok(
    "src_coupons_non_put_hash",
    nonPutCouponsHash() === EXPECTED.coupons_nonPut,
    nonPutCouponsHash()
  );

  const ao = read("pages/api/admin-orders.ts");
  ok("src_e1_for_update", /SELECT order_id, status, total FROM orders WHERE order_id=\? FOR UPDATE/.test(ao));
  ok("src_e1_begin_tx", /beginTransaction/.test(ao) && /DELETE FROM order_items/.test(ao));
  ok("src_e1_items_deleted_meta", /items_deleted/.test(ao));
  ok("src_e1_orders_manage", /orders\.manage/.test(ao));

  const fq = read("pages/api/faqs.ts");
  const delIdx = fq.indexOf("if (req.method === 'DELETE')");
  const delBlock = fq.slice(delIdx, fq.indexOf("return res.status(405)", delIdx));
  ok("src_e2_invalid_id", /invalid_id/.test(delBlock));
  ok("src_e2_not_found", /not_found/.test(delBlock));
  ok("src_e2_for_update", /SELECT id, question, category FROM faqs WHERE id=\? FOR UPDATE/.test(delBlock));
  ok("src_e2_slice_200", /slice\(0,\s*200\)/.test(delBlock));
  ok("src_e2_no_cache_inv_in_delete", !/invalidatePublicCmsCache/.test(delBlock));

  const cp = read("pages/api/coupons.ts");
  const putIdx = cp.indexOf("if (req.method === 'PUT')");
  const putBlock = cp.slice(putIdx, cp.indexOf("if (req.method === 'DELETE')", putIdx));
  ok("src_e3_put_dup_409", /isDuplicateKeyError/.test(putBlock) && /409/.test(putBlock));
  ok("src_e3_put_msg", /Coupon code already exists/.test(putBlock));

  const sidhu = read("app/sidhu/page.tsx");
  ok(
    "src_client_order_delete_shows_error",
    /Delete failed: \$\{res\.error/.test(sidhu) || /Delete failed: \$\{res\.error \|\|/.test(sidhu)
  );
  ok(
    "src_client_faq_delete_shows_error",
    /dr\.error\|\|"Delete failed"/.test(sidhu) || /faqMsg.*dr\.error/.test(sidhu) ||
      /setFaqMsg\(`❌ \$\{dr\.error/.test(sidhu)
  );
  ok(
    "src_client_coupon_put_shows_error",
    /setCouponMsg\(`❌ \$\{tr\.error/.test(sidhu)
  );

  ok(
    "src_audit_doc_exists",
    fs.existsSync(path.join(ROOT, "docs/design/ADMIN-WRITE-PATHS-AUDIT.md"))
  );
}

async function main() {
  await runE1();
  await runE2();
  await runE3();
  runSourceChecks();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
