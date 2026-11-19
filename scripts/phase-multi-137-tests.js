/**
 * F4UK-MULTI-137 — stale-write tokens for coupons PUT, FAQ reorder and
 * admin-review moderation (approve / reject / edit / delete).
 *
 * Static / git-baseline checks + mocked pool/conn ONLY. No real DB / network.
 * Baseline commit: be56a5c1aa0ca127846785b666376689dc4da9d5
 */
"use strict";

const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");
const { createHash } = require("crypto");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const BASE = "be56a5c1aa0ca127846785b666376689dc4da9d5";

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

function norm(s) {
  return String(s).replace(/\r\n/g, "\n");
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

/** Run a handler with console.log/error silenced (handlers log noisy diagnostics). */
async function run(handler, req) {
  const res = makeRes();
  const origLog = console.log;
  const origErr = console.error;
  console.log = () => {};
  console.error = () => {};
  try {
    await handler({ headers: {}, query: {}, body: {}, ...req }, res);
  } finally {
    console.log = origLog;
    console.error = origErr;
  }
  return res;
}

function git(args) {
  const r = spawnSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return { status: r.status, stdout: r.stdout || "", stderr: r.stderr || "", error: r.error };
}

function gitShowBase(rel) {
  const r = git(["show", `${BASE}:${rel}`]);
  if (r.status !== 0) throw new Error(`git show failed for ${rel}: ${r.stderr}`);
  return r.stdout;
}

// Shared real hash modules (stand-ins for the stubbed ../../lib hash modules).
const couponHashMod = loadTs("lib/couponBaseHash.ts");
const reviewHashMod = loadTs("lib/reviewModerationHash.ts");
const faqHashMod = loadTs("lib/faqBaseHash.ts");
const { couponRowBaseHash, COUPON_WRITE_COLUMNS } = couponHashMod;
const { reviewModerationBaseHash, REVIEW_MODERATION_COLUMNS } = reviewHashMod;
const { faqRowBaseHash } = faqHashMod;

// ─── Generic mocked connection ─────────────────────────────────────────────

function makeConn(onQuery) {
  const stats = { began: 0, committed: 0, rolled: 0, released: 0 };
  const calls = [];
  const events = [];
  const conn = {
    async beginTransaction() {
      stats.began++;
      events.push("begin");
      if (onQuery.beginThrows) throw new Error("begin failed");
    },
    async commit() {
      stats.committed++;
      events.push("commit");
    },
    async rollback() {
      stats.rolled++;
      events.push("rollback");
    },
    release() {
      stats.released++;
      events.push("release");
    },
    async query(sqlOrObj, maybeParams) {
      const sql = typeof sqlOrObj === "string" ? sqlOrObj : String(sqlOrObj?.sql || "");
      const params = (typeof sqlOrObj === "object" && sqlOrObj?.values) || maybeParams || [];
      calls.push({ sql, params });
      events.push("query");
      return onQuery(sql, params);
    },
  };
  return { conn, stats, calls, events };
}

// ─── 1) Hash helpers ───────────────────────────────────────────────────────

function runHashTests() {
  const couponRow = {
    code: "SAVE10",
    type: "percentage",
    value: "10.00",
    minimum_order: "0.00",
    usage_limit: null,
    expires_at: null,
    is_active: 1,
    used_count: 3,
    created_at: "2024-01-01 00:00:00",
  };

  ok(
    "hash_coupon_deterministic",
    couponRowBaseHash(couponRow) === couponRowBaseHash({ ...couponRow }) &&
      /^[0-9a-f]{64}$/.test(couponRowBaseHash(couponRow))
  );
  ok(
    "hash_coupon_matches_column_order_json",
    Array.isArray(COUPON_WRITE_COLUMNS) &&
      couponRowBaseHash(couponRow) ===
        sha256(JSON.stringify(COUPON_WRITE_COLUMNS.map((k) => couponRow[k] ?? null)))
  );
  ok(
    "hash_coupon_key_insertion_order_irrelevant",
    couponRowBaseHash({ is_active: 1, code: "A", type: "fixed", value: 5 }) ===
      couponRowBaseHash({ value: 5, type: "fixed", code: "A", is_active: 1 })
  );
  ok(
    "hash_coupon_column_order_matters",
    couponRowBaseHash({ code: "A", type: "B" }) !== couponRowBaseHash({ code: "B", type: "A" }) &&
      couponRowBaseHash({ minimum_order: 1, value: 2 }) !==
        couponRowBaseHash({ minimum_order: 2, value: 1 })
  );
  ok(
    "hash_coupon_null_vs_empty_string_distinct",
    couponRowBaseHash({ ...couponRow, usage_limit: null }) !==
      couponRowBaseHash({ ...couponRow, usage_limit: "" }) &&
      couponRowBaseHash({ ...couponRow, expires_at: null }) !==
        couponRowBaseHash({ ...couponRow, expires_at: "" })
  );
  ok(
    "hash_coupon_missing_key_equals_null",
    couponRowBaseHash({ code: "A" }) ===
      couponRowBaseHash({
        code: "A",
        type: null,
        value: null,
        minimum_order: null,
        usage_limit: null,
        expires_at: null,
        is_active: null,
      }) &&
      couponRowBaseHash(null) === couponRowBaseHash({}) &&
      couponRowBaseHash(undefined) === couponRowBaseHash({})
  );
  ok(
    "hash_coupon_ignores_used_count_created_at",
    couponRowBaseHash(couponRow) ===
      couponRowBaseHash({ ...couponRow, used_count: 999, created_at: "2030-01-01 00:00:00" }) &&
      couponRowBaseHash(couponRow) === couponRowBaseHash({ ...couponRow, id: 42, extra: "x" })
  );
  ok(
    "hash_coupon_writable_columns_change_hash",
    ["code", "type", "value", "minimum_order", "usage_limit", "expires_at", "is_active"].every(
      (k) =>
        couponRowBaseHash(couponRow) !== couponRowBaseHash({ ...couponRow, [k]: "changed-" + k })
    )
  );
  ok(
    "hash_coupon_no_trimming",
    couponRowBaseHash({ ...couponRow, code: "SAVE10" }) !==
      couponRowBaseHash({ ...couponRow, code: " SAVE10" })
  );

  const reviewRow = {
    id: 1,
    status: "pending",
    display_name: "Alice",
    rating: 5,
    review_text: "Great stick",
    edited_at: null,
    created_at: "2024-01-01 00:00:00",
    moderated_by: null,
  };
  const rh = reviewModerationBaseHash(reviewRow);
  ok(
    "hash_review_deterministic",
    rh === reviewModerationBaseHash({ ...reviewRow }) && /^[0-9a-f]{64}$/.test(rh)
  );
  ok(
    "hash_review_matches_column_order_json",
    Array.isArray(REVIEW_MODERATION_COLUMNS) &&
      rh === sha256(JSON.stringify(REVIEW_MODERATION_COLUMNS.map((k) => reviewRow[k] ?? null)))
  );
  ok(
    "hash_review_column_order_matters",
    reviewModerationBaseHash({ status: "a", display_name: "b" }) !==
      reviewModerationBaseHash({ status: "b", display_name: "a" })
  );
  ok(
    "hash_review_changes_on_status",
    rh !== reviewModerationBaseHash({ ...reviewRow, status: "approved" })
  );
  ok(
    "hash_review_changes_on_text",
    rh !== reviewModerationBaseHash({ ...reviewRow, review_text: "Great stick!" })
  );
  ok(
    "hash_review_changes_on_edited_at",
    rh !== reviewModerationBaseHash({ ...reviewRow, edited_at: "2024-02-02T00:00:00.000Z" })
  );
  ok(
    "hash_review_changes_on_name_and_rating",
    rh !== reviewModerationBaseHash({ ...reviewRow, display_name: "Bob" }) &&
      rh !== reviewModerationBaseHash({ ...reviewRow, rating: 4 })
  );
  ok(
    "hash_review_null_vs_empty_string_distinct",
    reviewModerationBaseHash({ ...reviewRow, edited_at: null }) !==
      reviewModerationBaseHash({ ...reviewRow, edited_at: "" }) &&
      reviewModerationBaseHash({ ...reviewRow, review_text: null }) !==
        reviewModerationBaseHash({ ...reviewRow, review_text: "" })
  );
  const d = new Date("2024-03-04T05:06:07.890Z");
  ok(
    "hash_review_date_normalised_via_toISOString",
    reviewModerationBaseHash({ ...reviewRow, edited_at: d }) ===
      reviewModerationBaseHash({ ...reviewRow, edited_at: d.toISOString() }) &&
      reviewModerationBaseHash({ ...reviewRow, edited_at: d }) !==
        reviewModerationBaseHash({ ...reviewRow, edited_at: null }) &&
      reviewModerationBaseHash({ ...reviewRow, edited_at: d }) !==
        reviewModerationBaseHash({ ...reviewRow, edited_at: new Date("2024-03-04T05:06:07.891Z") })
  );
  ok(
    "hash_review_ignores_unrelated_columns",
    rh ===
      reviewModerationBaseHash({
        ...reviewRow,
        id: 999,
        created_at: "2030-01-01",
        moderated_by: "x",
        original_text: "orig",
      })
  );
}

// ─── 2) coupons PUT ────────────────────────────────────────────────────────

function makeCouponsHarness(opts = {}) {
  const current =
    opts.current === null
      ? null
      : opts.current || {
          id: 1,
          code: "SAVE10",
          type: "percentage",
          value: "10.00",
          minimum_order: "0.00",
          usage_limit: null,
          expires_at: null,
          is_active: 1,
          used_count: 2,
          created_at: "2024-01-01 00:00:00",
        };
  const updateMode = opts.updateMode || "ok"; // ok | dup | boom | zero
  const afterRow = opts.afterRow;
  const audits = [];
  const poolCalls = [];
  let adminCalls = 0;

  const h = makeConn((sql) => {
    if (/SELECT \* FROM coupons WHERE id=\? FOR UPDATE/i.test(sql)) {
      if (opts.selectThrows) throw new Error("select failed");
      return [current ? [{ ...current }] : [], []];
    }
    if (/UPDATE coupons SET code=/i.test(sql)) {
      if (updateMode === "dup") {
        const e = new Error("Duplicate entry");
        e.code = "ER_DUP_ENTRY";
        e.errno = 1062;
        throw e;
      }
      if (updateMode === "boom") {
        const e = new Error("boom");
        e.code = "ER_BAD_FIELD_ERROR";
        throw e;
      }
      if (updateMode === "zero") return [{ affectedRows: 0 }, []];
      return [{ affectedRows: 1 }, []];
    }
    if (/SELECT \* FROM coupons WHERE id=\?/i.test(sql)) {
      return [afterRow ? [afterRow] : [], []];
    }
    return [[], []];
  });
  if (opts.beginThrows) {
    const orig = h.conn.beginTransaction;
    h.conn.beginTransaction = async () => {
      await orig();
      throw new Error("begin failed");
    };
  }

  const pool = {
    async getConnection() {
      return h.conn;
    },
    async query(sql, params) {
      poolCalls.push({ sql: String(sql), params: params || [] });
      if (opts.poolQuery) return opts.poolQuery(String(sql), params || []);
      return [[], []];
    },
  };

  const stubs = {
    "../../lib/db": pool,
    "../../lib/adminAuth": {
      getRequestMeta: () => ({ ip: "127.0.0.1" }),
      requireAdminPermission: async () => {
        adminCalls++;
        if (opts.adminThrows) throw new Error("requireAdminPermission must not be called");
        return { id: 1, email: "admin@test", role: "super_admin" };
      },
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
      calculateCouponDiscount: () => 10,
      normalizeCouponCode: (c) => String(c).toUpperCase(),
    },
    "../../lib/couponValidation": {
      parseCartTotal: (v) =>
        Number.isFinite(Number(v)) ? { ok: true, value: Number(v) } : { ok: false, error: "bad total" },
      parseCouponAdminInput: (body) => {
        if (!body?.code) return { ok: false, error: "Code required" };
        return {
          ok: true,
          value: {
            code: String(body.code).toUpperCase(),
            type: body.type || "percentage",
            value: Number(body.value) || 10,
            minimumOrder: Number(body.minimum_order) || 0,
            usageLimit:
              body.usage_limit == null || body.usage_limit === "" ? null : Number(body.usage_limit),
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
    "../../lib/couponBaseHash": couponHashMod,
  };

  const mod = loadTs("pages/api/coupons.ts", stubs);
  return {
    handler: mod.default || mod,
    audits,
    poolCalls,
    calls: h.calls,
    stats: h.stats,
    events: h.events,
    adminCalls: () => adminCalls,
    updates: () => h.calls.filter((c) => /UPDATE coupons SET code=/i.test(c.sql)),
    current,
  };
}

function couponPutBody(over = {}) {
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

async function runCouponsPut() {
  // matching base_hash -> UPDATE + commit + new base_hash
  {
    const afterRow = {
      id: 1,
      code: "SAVE10",
      type: "percentage",
      value: "15.00",
      minimum_order: "0.00",
      usage_limit: null,
      expires_at: null,
      is_active: 1,
      used_count: 2,
    };
    const h = makeCouponsHarness({ afterRow });
    const oldHash = couponRowBaseHash(h.current);
    const res = await run(h.handler, {
      method: "PUT",
      body: couponPutBody({ value: 15, base_hash: oldHash }),
    });
    ok("coupon_put_match_200", res.statusCode === 200 && res.body?.success === true);
    ok("coupon_put_match_update_issued", h.updates().length === 1);
    ok(
      "coupon_put_match_commit_no_rollback",
      h.stats.began === 1 && h.stats.committed === 1 && h.stats.rolled === 0
    );
    ok(
      "coupon_put_match_returns_new_base_hash",
      typeof res.body?.base_hash === "string" &&
        res.body.base_hash === couponRowBaseHash(afterRow) &&
        res.body.base_hash !== oldHash
    );
    ok(
      "coupon_put_match_audit",
      h.audits.length === 1 && h.audits[0].action === "coupon.updated"
    );
    ok(
      "coupon_put_commit_before_release",
      h.events.indexOf("commit") !== -1 && h.events.indexOf("commit") < h.events.indexOf("release")
    );
    ok("coupon_put_match_released", h.stats.released === 1);
  }

  // mismatch -> 409 stale
  {
    const h = makeCouponsHarness();
    const res = await run(h.handler, {
      method: "PUT",
      body: couponPutBody({ base_hash: "0".repeat(64) }),
    });
    ok("coupon_put_mismatch_409", res.statusCode === 409);
    ok(
      "coupon_put_mismatch_human_error",
      typeof res.body?.error === "string" && /changed by someone else/i.test(res.body.error)
    );
    ok("coupon_put_mismatch_code_stale", res.body?.code === "stale");
    ok(
      "coupon_put_mismatch_rollback_no_commit",
      h.stats.rolled >= 1 && h.stats.committed === 0
    );
    ok("coupon_put_mismatch_no_update", h.updates().length === 0);
    ok("coupon_put_mismatch_no_audit", h.audits.length === 0);
    ok("coupon_put_mismatch_released", h.stats.released === 1);
  }

  // no base_hash -> legacy UPDATE
  {
    const h = makeCouponsHarness();
    const res = await run(h.handler, { method: "PUT", body: couponPutBody() });
    ok("coupon_put_legacy_200", res.statusCode === 200 && res.body?.success === true);
    ok("coupon_put_legacy_update_issued", h.updates().length === 1);
    ok("coupon_put_legacy_commit", h.stats.committed === 1 && h.stats.released === 1);
    ok(
      "coupon_put_legacy_base_hash_returned",
      typeof res.body?.base_hash === "string" && res.body.base_hash.length === 64
    );
  }

  // non-string base_hash treated as absent (legacy)
  {
    const h = makeCouponsHarness();
    const res = await run(h.handler, { method: "PUT", body: couponPutBody({ base_hash: 123 }) });
    ok("coupon_put_nonstring_base_hash_legacy", res.statusCode === 200 && h.updates().length === 1);
  }

  // force:true -> UPDATE despite mismatch
  {
    const h = makeCouponsHarness();
    const res = await run(h.handler, {
      method: "PUT",
      body: couponPutBody({ base_hash: "f".repeat(64), force: true }),
    });
    ok("coupon_put_force_200", res.statusCode === 200 && res.body?.success === true);
    ok("coupon_put_force_update_issued", h.updates().length === 1);
    ok("coupon_put_force_commit", h.stats.committed === 1 && h.stats.rolled === 0);
    ok("coupon_put_force_released", h.stats.released === 1);
  }

  // force must be strictly true
  {
    const h = makeCouponsHarness();
    const res = await run(h.handler, {
      method: "PUT",
      body: couponPutBody({ base_hash: "f".repeat(64), force: "true" }),
    });
    ok("coupon_put_force_string_not_honoured", res.statusCode === 409 && h.updates().length === 0);
  }

  // missing row -> 404 rollback
  {
    const h = makeCouponsHarness({ current: null });
    const res = await run(h.handler, {
      method: "PUT",
      body: couponPutBody({ base_hash: "a".repeat(64) }),
    });
    ok("coupon_put_missing_404", res.statusCode === 404 && res.body?.error === "Coupon not found");
    ok("coupon_put_missing_rollback", h.stats.rolled >= 1 && h.stats.committed === 0);
    ok("coupon_put_missing_no_update", h.updates().length === 0);
    ok("coupon_put_missing_released", h.stats.released === 1);
  }

  // dup key
  {
    const h = makeCouponsHarness({ updateMode: "dup" });
    const res = await run(h.handler, {
      method: "PUT",
      body: couponPutBody({ code: "TAKEN", base_hash: couponRowBaseHash({ ...(makeCouponsHarness().current) }) }),
    });
    ok(
      "coupon_put_dup_409",
      res.statusCode === 409 && res.body?.error === "Coupon code already exists"
    );
    ok("coupon_put_dup_rollback_no_commit", h.stats.rolled >= 1 && h.stats.committed === 0);
    ok("coupon_put_dup_no_audit", h.audits.length === 0);
    ok("coupon_put_dup_released", h.stats.released === 1);
  }

  // zero affectedRows -> 404
  {
    const h = makeCouponsHarness({ updateMode: "zero" });
    const res = await run(h.handler, { method: "PUT", body: couponPutBody() });
    ok(
      "coupon_put_zero_affected_404",
      res.statusCode === 404 && h.stats.committed === 0 && h.stats.rolled >= 1 && h.stats.released === 1
    );
  }

  // thrown errors -> 500, connection always released
  {
    const h = makeCouponsHarness({ updateMode: "boom" });
    const res = await run(h.handler, { method: "PUT", body: couponPutBody() });
    ok("coupon_put_throw_500", res.statusCode === 500 && res.body?.error === "Request failed");
    ok(
      "coupon_put_throw_rollback_released",
      h.stats.rolled >= 1 && h.stats.committed === 0 && h.stats.released === 1
    );
    ok("coupon_put_throw_no_audit", h.audits.length === 0);
  }
  {
    const h = makeCouponsHarness({ selectThrows: true });
    const res = await run(h.handler, { method: "PUT", body: couponPutBody() });
    ok(
      "coupon_put_select_throw_released",
      res.statusCode === 500 && h.stats.released === 1 && h.stats.committed === 0
    );
  }
  {
    const h = makeCouponsHarness({ beginThrows: true });
    const res = await run(h.handler, { method: "PUT", body: couponPutBody() });
    ok(
      "coupon_put_begin_throw_released",
      res.statusCode === 500 && h.stats.released === 1 && h.updates().length === 0
    );
  }

  // validation 400s do not take a connection
  {
    const h = makeCouponsHarness();
    const res = await run(h.handler, { method: "PUT", body: couponPutBody({ id: "abc" }) });
    ok("coupon_put_bad_id_400_no_conn", res.statusCode === 400 && h.stats.began === 0);
  }
}

// ─── 3) coupons GET + public validate branch ───────────────────────────────

function sliceValidate(src) {
  const s = norm(src);
  const a = s.indexOf("if (req.method === 'POST' && action === 'validate')");
  const b = s.indexOf("requireAdminPermission", a);
  if (a < 0 || b < 0) return null;
  return s.slice(a, b);
}

async function runCouponsGetAndValidate() {
  // GET rows carry base_hash
  {
    const rows = [
      { id: 1, code: "A", type: "percentage", value: "10.00", minimum_order: "0.00", usage_limit: null, expires_at: null, is_active: 1, used_count: 0, created_at: "2024-01-01" },
      { id: 2, code: "B", type: "fixed", value: "5.00", minimum_order: "20.00", usage_limit: 10, expires_at: "2030-01-01", is_active: 0, used_count: 4, created_at: "2024-01-02" },
    ];
    const h = makeCouponsHarness({ poolQuery: async () => [rows.map((r) => ({ ...r })), []] });
    const res = await run(h.handler, { method: "GET" });
    ok(
      "coupon_get_200_array",
      res.statusCode === 200 && Array.isArray(res.body) && res.body.length === 2
    );
    ok(
      "coupon_get_rows_have_base_hash",
      Array.isArray(res.body) &&
        res.body.every((r, i) => r.base_hash === couponRowBaseHash(rows[i])) &&
        res.body[0].base_hash !== res.body[1].base_hash
    );
    ok(
      "coupon_get_rows_preserve_columns",
      res.body[0].code === "A" && res.body[1].used_count === 4 && res.body[1].id === 2
    );
    ok("coupon_get_requires_admin", h.adminCalls() === 1);
  }

  // Public validate branch byte-identical to baseline
  {
    const cur = sliceValidate(read("pages/api/coupons.ts"));
    let base = null;
    let err = "";
    try {
      base = sliceValidate(gitShowBase("pages/api/coupons.ts"));
    } catch (e) {
      err = String(e.message || e);
    }
    ok("coupon_validate_slice_extracted", !!cur && !!base && cur.length > 200, err);
    ok(
      "coupon_validate_slice_sha256_equals_baseline",
      !!cur && !!base && sha256(cur) === sha256(base),
      cur && base ? `${sha256(cur).slice(0, 12)} vs ${sha256(base).slice(0, 12)}` : err
    );
  }

  // Runtime: validate never requires admin
  {
    const row = {
      id: 1,
      code: "SAVE10",
      type: "percentage",
      value: "10.00",
      minimum_order: "0.00",
      usage_limit: null,
      used_count: 0,
      expires_at: null,
      is_active: 1,
    };
    const h = makeCouponsHarness({
      adminThrows: true,
      poolQuery: async (sql) =>
        /SELECT \* FROM coupons WHERE code=\?/i.test(sql) ? [[row], []] : [[], []],
    });
    const res = await run(h.handler, {
      method: "POST",
      query: { action: "validate" },
      body: { code: "save10", cart_total: 100 },
    });
    ok(
      "coupon_validate_runtime_valid_no_admin",
      res.statusCode === 200 && res.body?.valid === true && h.adminCalls() === 0
    );
    ok("coupon_validate_runtime_no_connection", h.stats.began === 0);
  }
  {
    const h = makeCouponsHarness({ adminThrows: true });
    const res = await run(h.handler, {
      method: "POST",
      query: { action: "validate" },
      body: { code: "NOPE", cart_total: 50 },
    });
    ok(
      "coupon_validate_runtime_invalid_no_admin",
      res.statusCode === 200 && res.body?.valid === false && h.adminCalls() === 0
    );
  }
  {
    const h = makeCouponsHarness({ adminThrows: true });
    const res = await run(h.handler, {
      method: "POST",
      query: { action: "validate" },
      body: { cart_total: 50 },
    });
    ok(
      "coupon_validate_runtime_400_no_admin",
      res.statusCode === 400 && res.body?.valid === false && h.adminCalls() === 0
    );
  }
}

// ─── 4) faqs reorder ───────────────────────────────────────────────────────

function makeFaqRows() {
  return [
    { id: 1, question: "Q1", answer: "A1", category: "General", sort_order: 10, is_visible: 1 },
    { id: 2, question: "Q2", answer: "A2", category: "General", sort_order: 20, is_visible: 1 },
    { id: 3, question: "Q3", answer: "A3", category: "Setup", sort_order: 10, is_visible: 0 },
  ];
}

function makeFaqsHarness(opts = {}) {
  const rows = opts.rows || makeFaqRows();
  const audits = [];
  const h = makeConn((sql) => {
    if (/SELECT \* FROM faqs FOR UPDATE/i.test(sql)) return [rows.map((r) => ({ ...r })), []];
    if (/UPDATE faqs SET sort_order/i.test(sql)) return [{ affectedRows: 1 }, []];
    return [[], []];
  });
  const pool = {
    async getConnection() {
      return h.conn;
    },
    async query() {
      throw new Error("pool.query must not be used on reorder path");
    },
  };
  const stubs = {
    "../../lib/db": pool,
    "../../lib/adminAuth": {
      getRequestMeta: () => ({ ip: "127.0.0.1" }),
      requireAdminPermission: async () => ({ id: 1, email: "admin@test", role: "super_admin" }),
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
    "../../lib/faqBaseHash": faqHashMod,
  };
  const mod = loadTs("pages/api/faqs.ts", stubs);
  return {
    handler: mod.default || mod,
    rows,
    audits,
    stats: h.stats,
    calls: h.calls,
    updates: () => h.calls.filter((c) => /UPDATE faqs SET sort_order/i.test(c.sql)),
  };
}

function hashesFor(rows) {
  const out = {};
  for (const r of rows) out[r.id] = faqRowBaseHash(r);
  return out;
}

async function runFaqsReorder() {
  // matching base_hashes
  {
    const h = makeFaqsHarness();
    const res = await run(h.handler, {
      method: "POST",
      body: { action: "reorder", ids: [3, 1, 2], base_hashes: hashesFor(h.rows) },
    });
    ok("faq_reorder_match_200", res.statusCode === 200 && res.body?.success === true && res.body?.count === 3);
    ok("faq_reorder_match_updates", h.updates().length === 3);
    ok(
      "faq_reorder_match_sort_orders",
      h.updates()[0].params[0] === 10 &&
        h.updates()[0].params[1] === 3 &&
        h.updates()[1].params[0] === 20 &&
        h.updates()[1].params[1] === 1 &&
        h.updates()[2].params[0] === 30 &&
        h.updates()[2].params[1] === 2
    );
    ok("faq_reorder_match_commit", h.stats.began === 1 && h.stats.committed === 1 && h.stats.rolled === 0);
    ok("faq_reorder_match_released", h.stats.released === 1);
    ok("faq_reorder_match_audit", h.audits.length === 1 && h.audits[0].action === "faq.reordered");
  }

  // string-key / numeric-key lookups both fine (JSON keys are strings)
  {
    const h = makeFaqsHarness();
    const bh = JSON.parse(JSON.stringify(hashesFor(h.rows)));
    const res = await run(h.handler, {
      method: "POST",
      body: { action: "reorder", ids: [1, 2, 3], base_hashes: bh },
    });
    ok("faq_reorder_json_string_keys_ok", res.statusCode === 200 && h.updates().length === 3);
  }

  // one mismatch
  {
    const h = makeFaqsHarness();
    const bh = hashesFor(h.rows);
    bh[2] = "0".repeat(64);
    const res = await run(h.handler, {
      method: "POST",
      body: { action: "reorder", ids: [1, 2, 3], base_hashes: bh },
    });
    ok("faq_reorder_mismatch_409", res.statusCode === 409);
    ok("faq_reorder_mismatch_error_stale", res.body?.error === "stale");
    ok(
      "faq_reorder_mismatch_message",
      typeof res.body?.message === "string" && /FAQs/.test(res.body.message) && /changed/i.test(res.body.message)
    );
    ok("faq_reorder_mismatch_no_update", h.updates().length === 0);
    ok("faq_reorder_mismatch_rollback_no_commit", h.stats.rolled >= 1 && h.stats.committed === 0);
    ok("faq_reorder_mismatch_no_audit", h.audits.length === 0);
    ok("faq_reorder_mismatch_released", h.stats.released === 1);
  }

  // missing entry in base_hashes
  {
    const h = makeFaqsHarness();
    const bh = hashesFor(h.rows);
    delete bh[3];
    const res = await run(h.handler, {
      method: "POST",
      body: { action: "reorder", ids: [1, 2, 3], base_hashes: bh },
    });
    ok(
      "faq_reorder_missing_entry_409",
      res.statusCode === 409 && res.body?.error === "stale" && h.updates().length === 0
    );
    ok("faq_reorder_missing_entry_rollback_released", h.stats.rolled >= 1 && h.stats.released === 1);
  }

  // absent base_hashes -> legacy
  {
    const h = makeFaqsHarness();
    const res = await run(h.handler, {
      method: "POST",
      body: { action: "reorder", ids: [2, 1, 3] },
    });
    ok("faq_reorder_legacy_200", res.statusCode === 200 && res.body?.success === true);
    ok("faq_reorder_legacy_updates", h.updates().length === 3 && h.stats.committed === 1);
  }

  // id-set mismatch still 400
  {
    const h = makeFaqsHarness();
    const res = await run(h.handler, {
      method: "POST",
      body: { action: "reorder", ids: [1, 2], base_hashes: hashesFor(h.rows) },
    });
    ok(
      "faq_reorder_idset_short_400",
      res.statusCode === 400 && res.body?.error === "Invalid id list" && h.updates().length === 0
    );
    ok("faq_reorder_idset_short_rollback", h.stats.rolled >= 1 && h.stats.committed === 0 && h.stats.released === 1);
  }
  {
    const h = makeFaqsHarness();
    const res = await run(h.handler, {
      method: "POST",
      body: { action: "reorder", ids: [1, 2, 99], base_hashes: hashesFor(h.rows) },
    });
    ok(
      "faq_reorder_idset_unknown_400",
      res.statusCode === 400 && res.body?.error === "Invalid id list" && h.updates().length === 0
    );
  }
  {
    const h = makeFaqsHarness();
    const res = await run(h.handler, {
      method: "POST",
      body: { action: "reorder", ids: [1, 1, 2] },
    });
    ok("faq_reorder_dup_ids_400", res.statusCode === 400 && h.stats.began === 0);
  }

  // force:true
  {
    const h = makeFaqsHarness();
    const bh = hashesFor(h.rows);
    bh[1] = "bad";
    const res = await run(h.handler, {
      method: "POST",
      body: { action: "reorder", ids: [1, 2, 3], base_hashes: bh, force: true },
    });
    ok("faq_reorder_force_200", res.statusCode === 200 && res.body?.success === true);
    ok("faq_reorder_force_updates", h.updates().length === 3 && h.stats.committed === 1);
    ok("faq_reorder_force_released", h.stats.released === 1);
  }

  // mismatch still 400 on id-set even with force
  {
    const h = makeFaqsHarness();
    const res = await run(h.handler, {
      method: "POST",
      body: { action: "reorder", ids: [1, 2], base_hashes: {}, force: true },
    });
    ok("faq_reorder_force_idset_still_400", res.statusCode === 400 && h.updates().length === 0);
  }
}

// ─── 5) admin-reviews ──────────────────────────────────────────────────────

function makeReviewsHarness(opts = {}) {
  const existing =
    opts.existing === null
      ? null
      : opts.existing || {
          id: 5,
          status: "pending",
          display_name: "Alice",
          rating: 5,
          review_text: "Great stick",
          original_text: null,
          edited_at: null,
          product_id: null,
          order_id: null,
          is_verified: 0,
          consent_at: null,
          created_at: "2024-01-01 00:00:00",
          moderated_at: null,
          moderated_by: null,
          edit_note: null,
        };
  const audits = [];
  const clearCalls = { n: 0 };
  let events;

  const h = makeConn((sql) => {
    if (/FROM customer_reviews WHERE id = \? LIMIT 1 FOR UPDATE/i.test(sql)) {
      return [existing ? [{ ...existing }] : [], []];
    }
    if (/UPDATE customer_reviews/i.test(sql)) {
      if (opts.updateThrows) throw new Error("update failed");
      return [{ affectedRows: 1 }, []];
    }
    if (/DELETE FROM customer_reviews/i.test(sql)) {
      if (opts.deleteThrows) throw new Error("delete failed");
      return [{ affectedRows: 1 }, []];
    }
    return [[], []];
  });
  events = h.events;

  const pool = {
    async getConnection() {
      return h.conn;
    },
    async query() {
      throw new Error("pool.query must not be used on PATCH/DELETE paths");
    },
  };

  const stubs = {
    "../../lib/db": pool,
    "../../lib/adminAuth": {
      getRequestMeta: () => ({ ip: "127.0.0.1" }),
      requireAdminPermission: async () => ({
        id: 1,
        email: "admin@test",
        name: "Admin Tester",
        role: "super_admin",
      }),
    },
    "../../lib/adminAudit": {
      recordAdminAudit: async (a) => {
        audits.push(a);
      },
    },
    "../../lib/adminNoStore": { setAdminNoStore: () => {} },
    "../../lib/customerReviews": {
      validateReviewFields: (f) => ({
        ok: true,
        display_name: String(f.display_name),
        rating: Number(f.rating),
        review_text: String(f.review_text),
      }),
    },
    "../../lib/customerReviewsHash": {
      reviewTextHash: (t) => "texthash:" + String(t).length,
    },
    "../../lib/customerReviewsServer": {
      clearPublicReviewsCache: () => {
        clearCalls.n++;
        events.push("clear");
      },
    },
    "../../lib/reviewModerationHash": reviewHashMod,
  };

  const mod = loadTs("pages/api/admin-reviews.ts", stubs);
  return {
    handler: mod.default || mod,
    existing,
    audits,
    clearCalls,
    events,
    stats: h.stats,
    calls: h.calls,
    updates: () => h.calls.filter((c) => /UPDATE customer_reviews/i.test(c.sql)),
    deletes: () => h.calls.filter((c) => /DELETE FROM customer_reviews/i.test(c.sql)),
  };
}

async function runAdminReviews() {
  // approve with matching expected_status
  {
    const h = makeReviewsHarness();
    const res = await run(h.handler, {
      method: "PATCH",
      body: { id: 5, action: "approve", expected_status: "pending" },
    });
    ok(
      "rev_approve_match_200",
      res.statusCode === 200 && res.body?.success === true && res.body?.status === "approved"
    );
    ok(
      "rev_approve_match_update",
      h.updates().length === 1 && h.updates()[0].params[0] === "approved"
    );
    ok("rev_approve_match_commit", h.stats.committed === 1 && h.stats.rolled === 0);
    ok("rev_approve_match_cache_cleared_once", h.clearCalls.n === 1);
    ok(
      "rev_approve_cache_cleared_after_commit",
      h.events.indexOf("commit") !== -1 &&
        h.events.indexOf("clear") > h.events.indexOf("commit")
    );
    ok("rev_approve_match_audit", h.audits.length === 1 && h.audits[0].action === "review.approved");
    ok("rev_approve_match_released", h.stats.released === 1);
  }

  // reject with matching expected_status
  {
    const h = makeReviewsHarness();
    const res = await run(h.handler, {
      method: "PATCH",
      body: { id: 5, action: "reject", expected_status: "pending" },
    });
    ok(
      "rev_reject_match_200",
      res.statusCode === 200 && res.body?.status === "rejected" && h.updates().length === 1
    );
  }

  // approve mismatch
  {
    const h = makeReviewsHarness({ existing: { ...makeReviewsHarness().existing, status: "approved" } });
    const res = await run(h.handler, {
      method: "PATCH",
      body: { id: 5, action: "approve", expected_status: "pending" },
    });
    ok("rev_approve_mismatch_409", res.statusCode === 409);
    ok(
      "rev_approve_mismatch_body",
      res.body?.code === "stale" &&
        res.body?.current_status === "approved" &&
        typeof res.body?.error === "string" &&
        res.body.error.length > 0
    );
    ok("rev_approve_mismatch_no_update", h.updates().length === 0);
    ok("rev_approve_mismatch_rollback", h.stats.rolled >= 1 && h.stats.committed === 0);
    ok("rev_approve_mismatch_no_cache_clear", h.clearCalls.n === 0);
    ok("rev_approve_mismatch_no_audit", h.audits.length === 0);
    ok("rev_approve_mismatch_released", h.stats.released === 1);
  }

  // reject mismatch
  {
    const h = makeReviewsHarness({ existing: { ...makeReviewsHarness().existing, status: "rejected" } });
    const res = await run(h.handler, {
      method: "PATCH",
      body: { id: 5, action: "reject", expected_status: "pending" },
    });
    ok(
      "rev_reject_mismatch_409",
      res.statusCode === 409 &&
        res.body?.current_status === "rejected" &&
        h.updates().length === 0 &&
        h.clearCalls.n === 0
    );
  }

  // legacy approve (no token)
  {
    const h = makeReviewsHarness({ existing: { ...makeReviewsHarness().existing, status: "rejected" } });
    const res = await run(h.handler, { method: "PATCH", body: { id: 5, action: "approve" } });
    ok(
      "rev_approve_legacy_200",
      res.statusCode === 200 && h.updates().length === 1 && h.clearCalls.n === 1
    );
  }

  // edit: base_hash match
  {
    const h = makeReviewsHarness();
    const bh = reviewModerationBaseHash(h.existing);
    const res = await run(h.handler, {
      method: "PATCH",
      body: {
        id: 5,
        action: "edit",
        display_name: "Alice B",
        rating: 4,
        review_text: "Edited text",
        edit_note: "typo",
        base_hash: bh,
      },
    });
    ok("rev_edit_match_200", res.statusCode === 200 && res.body?.success === true);
    ok(
      "rev_edit_match_update",
      h.updates().length === 1 && h.updates()[0].params[0] === "Alice B" && h.updates()[0].params[2] === "Edited text"
    );
    ok("rev_edit_match_commit_then_clear", h.stats.committed === 1 && h.clearCalls.n === 1 && h.events.indexOf("clear") > h.events.indexOf("commit"));
    ok("rev_edit_match_audit", h.audits.length === 1 && h.audits[0].action === "review.edited");
    ok("rev_edit_match_released", h.stats.released === 1);
  }

  // edit: Date edited_at in row still matches an ISO-derived token
  {
    const when = new Date("2024-05-05T10:00:00.000Z");
    const base = makeReviewsHarness().existing;
    const h = makeReviewsHarness({ existing: { ...base, edited_at: when } });
    const bh = reviewModerationBaseHash({ ...base, edited_at: when.toISOString() });
    const res = await run(h.handler, {
      method: "PATCH",
      body: { id: 5, action: "edit", review_text: "x", edit_note: "n", base_hash: bh },
    });
    ok("rev_edit_date_normalised_match_200", res.statusCode === 200 && h.updates().length === 1);
  }

  // edit: mismatch
  {
    const h = makeReviewsHarness();
    const res = await run(h.handler, {
      method: "PATCH",
      body: {
        id: 5,
        action: "edit",
        review_text: "Edited text",
        edit_note: "typo",
        base_hash: "0".repeat(64),
      },
    });
    ok("rev_edit_mismatch_409", res.statusCode === 409);
    ok(
      "rev_edit_mismatch_body",
      res.body?.code === "stale" &&
        res.body?.current_status === "pending" &&
        /changed by someone else/i.test(String(res.body?.error || ""))
    );
    ok("rev_edit_mismatch_no_update", h.updates().length === 0);
    ok("rev_edit_mismatch_rollback_no_commit", h.stats.rolled >= 1 && h.stats.committed === 0);
    ok("rev_edit_mismatch_no_cache_clear", h.clearCalls.n === 0);
    ok("rev_edit_mismatch_released", h.stats.released === 1);
  }

  // edit: legacy (no base_hash)
  {
    const h = makeReviewsHarness();
    const res = await run(h.handler, {
      method: "PATCH",
      body: { id: 5, action: "edit", review_text: "Edited text", edit_note: "typo" },
    });
    ok("rev_edit_legacy_200", res.statusCode === 200 && h.updates().length === 1 && h.clearCalls.n === 1);
  }

  // edit missing note -> 400 (unchanged), no cache clear
  {
    const h = makeReviewsHarness();
    const res = await run(h.handler, {
      method: "PATCH",
      body: { id: 5, action: "edit", review_text: "Edited text" },
    });
    ok(
      "rev_edit_no_note_400_no_clear",
      res.statusCode === 400 && h.clearCalls.n === 0 && h.stats.released === 1 && h.updates().length === 0
    );
  }

  // missing row -> 404
  {
    const h = makeReviewsHarness({ existing: null });
    const res = await run(h.handler, {
      method: "PATCH",
      body: { id: 5, action: "approve", expected_status: "pending" },
    });
    ok(
      "rev_patch_missing_404",
      res.statusCode === 404 && h.clearCalls.n === 0 && h.stats.rolled >= 1 && h.stats.released === 1
    );
  }

  // thrown error -> 500, released, no cache clear
  {
    const h = makeReviewsHarness({ updateThrows: true });
    const res = await run(h.handler, {
      method: "PATCH",
      body: { id: 5, action: "approve", expected_status: "pending" },
    });
    ok(
      "rev_patch_throw_500_released",
      res.statusCode === 500 &&
        h.stats.released === 1 &&
        h.stats.committed === 0 &&
        h.clearCalls.n === 0
    );
  }

  // DELETE expected_status match
  {
    const h = makeReviewsHarness();
    const res = await run(h.handler, {
      method: "DELETE",
      query: { id: "5", expected_status: "pending" },
    });
    ok("rev_delete_match_200", res.statusCode === 200 && res.body?.success === true);
    ok("rev_delete_match_deleted", h.deletes().length === 1 && h.stats.committed === 1);
    ok(
      "rev_delete_match_cache_after_commit",
      h.clearCalls.n === 1 && h.events.indexOf("clear") > h.events.indexOf("commit")
    );
    ok("rev_delete_match_audit", h.audits.length === 1 && h.audits[0].action === "review.deleted");
    ok("rev_delete_match_released", h.stats.released === 1);
  }

  // DELETE mismatch
  {
    const h = makeReviewsHarness({ existing: { ...makeReviewsHarness().existing, status: "approved" } });
    const res = await run(h.handler, {
      method: "DELETE",
      query: { id: "5", expected_status: "pending" },
    });
    ok("rev_delete_mismatch_409", res.statusCode === 409);
    ok(
      "rev_delete_mismatch_body",
      res.body?.code === "stale" && res.body?.current_status === "approved"
    );
    ok("rev_delete_mismatch_no_delete", h.deletes().length === 0);
    ok("rev_delete_mismatch_rollback_no_commit", h.stats.rolled >= 1 && h.stats.committed === 0);
    ok("rev_delete_mismatch_no_cache_clear", h.clearCalls.n === 0);
    ok("rev_delete_mismatch_no_audit", h.audits.length === 0);
    ok("rev_delete_mismatch_released", h.stats.released === 1);
  }

  // DELETE legacy
  {
    const h = makeReviewsHarness();
    const res = await run(h.handler, { method: "DELETE", query: { id: "5" } });
    ok(
      "rev_delete_legacy_200",
      res.statusCode === 200 && h.deletes().length === 1 && h.clearCalls.n === 1
    );
  }

  // DELETE missing / throw
  {
    const h = makeReviewsHarness({ existing: null });
    const res = await run(h.handler, { method: "DELETE", query: { id: "5", expected_status: "pending" } });
    ok(
      "rev_delete_missing_404",
      res.statusCode === 404 && h.deletes().length === 0 && h.clearCalls.n === 0 && h.stats.released === 1
    );
  }
  {
    const h = makeReviewsHarness({ deleteThrows: true });
    const res = await run(h.handler, { method: "DELETE", query: { id: "5" } });
    ok(
      "rev_delete_throw_500_released",
      res.statusCode === 500 && h.stats.released === 1 && h.clearCalls.n === 0 && h.stats.committed === 0
    );
  }
}

// ─── 6) Source assertions ──────────────────────────────────────────────────

/** Remove the lines of `  const <name> = async (...) => { ... \n  };` block; returns {rest, block}. */
function extractConstArrowBlock(src, name) {
  const lines = norm(src).split("\n");
  const startRe = new RegExp(`^  const ${name} = async\\b`);
  const start = lines.findIndex((l) => startRe.test(l));
  if (start < 0) return null;
  let end = -1;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i] === "  };") {
      end = i;
      break;
    }
  }
  if (end < 0) return null;
  return {
    block: lines.slice(start, end + 1).join("\n"),
    rest: lines.slice(0, start).concat(["/*__BLOCK__*/"], lines.slice(end + 1)).join("\n"),
  };
}

/** Find 1-based inclusive line range of a 2-space-indented `function name(` block. */
function functionRange(lines, name) {
  const startRe = new RegExp(`^  (async )?function ${name}\\b`);
  const start = lines.findIndex((l) => startRe.test(l));
  if (start < 0) return null;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i] === "  }") return { start: start + 1, end: i + 1 };
  }
  return null;
}

/** Parse `git diff -U0` output into hunks with old range and changed lines. */
function parseHunks(diffText) {
  const hunks = [];
  let cur = null;
  for (const line of norm(diffText).split("\n")) {
    const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (m) {
      cur = {
        oldStart: Number(m[1]),
        oldCount: m[2] === undefined ? 1 : Number(m[2]),
        lines: [],
      };
      hunks.push(cur);
      continue;
    }
    if (!cur) continue;
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+") || line.startsWith("-")) cur.lines.push(line);
  }
  return hunks;
}

function runSourceAssertions() {
  // app/sidhu/page.tsx — only saveFaqOrder changed
  {
    let baseSrc = "";
    let err = "";
    try {
      baseSrc = gitShowBase("app/sidhu/page.tsx");
    } catch (e) {
      err = String(e.message || e);
    }
    const curSrc = read("app/sidhu/page.tsx");
    const cur = extractConstArrowBlock(curSrc, "saveFaqOrder");
    const base = baseSrc ? extractConstArrowBlock(baseSrc, "saveFaqOrder") : null;
    ok("src_sidhu_saveFaqOrder_found", !!cur && !!base, err);
    ok(
      "src_sidhu_saveFaqOrder_changed",
      !!cur && !!base && cur.block !== base.block && /base_hashes/.test(cur.block)
    );
    ok(
      "src_sidhu_rest_of_file_equals_baseline",
      !!cur && !!base && cur.rest === base.rest,
      cur && base && cur.rest !== base.rest ? "content outside saveFaqOrder differs" : ""
    );

    const d = git(["diff", "-U0", BASE, "--", "app/sidhu/page.tsx"]);
    const hunks = parseHunks(d.stdout);
    const baseLines = norm(baseSrc).split("\n");
    const startIdx = baseLines.findIndex((l) => /^  const saveFaqOrder = async\b/.test(l));
    let endIdx = -1;
    for (let i = startIdx + 1; i < baseLines.length; i++) {
      if (baseLines[i] === "  };") {
        endIdx = i;
        break;
      }
    }
    const lo = startIdx + 1;
    const hi = endIdx + 1;
    ok(
      "src_sidhu_diff_hunks_inside_saveFaqOrder",
      d.status === 0 &&
        hunks.length > 0 &&
        startIdx >= 0 &&
        endIdx > startIdx &&
        hunks.every((h) => {
          const first = h.oldCount === 0 ? h.oldStart + 1 : h.oldStart;
          const last = h.oldCount === 0 ? h.oldStart : h.oldStart + h.oldCount - 1;
          return first >= lo && last <= hi;
        }),
      `hunks=${hunks.length}`
    );
  }

  // components/sidhu/ReviewsPanel.tsx — only patchAction/saveEdit/confirmDelete (+ ReviewItem type)
  {
    let baseSrc = "";
    let err = "";
    try {
      baseSrc = gitShowBase("components/sidhu/ReviewsPanel.tsx");
    } catch (e) {
      err = String(e.message || e);
    }
    const baseLines = norm(baseSrc).split("\n");
    const ranges = ["patchAction", "openEdit", "saveEdit", "confirmDelete"].map((n) =>
      functionRange(baseLines, n)
    );
    ok("src_reviews_baseline_functions_found", ranges.every(Boolean), err);

    const d = git(["diff", "-U0", BASE, "--", "components/sidhu/ReviewsPanel.tsx"]);
    const hunks = parseHunks(d.stdout);
    const inFns = (h) => {
      const first = h.oldCount === 0 ? h.oldStart + 1 : h.oldStart;
      const last = h.oldCount === 0 ? h.oldStart : h.oldStart + h.oldCount - 1;
      return ranges.some((r) => r && first >= r.start && last <= r.end);
    };
    // Lines outside the functions that are still allowed: ReviewItem type plumbing
    // and the patchAction call sites that forward expected status.
    const allowedOutside = (l) => {
      const body = l.slice(1).trim();
      return (
        /^type ReviewItem = AdminCustomerReview & \{ base_hash\?: string \};$/.test(body) ||
        /^items: (AdminCustomerReview|ReviewItem)\[\];$/.test(body) ||
        /^const \[(editTarget|deleteTarget), set(EditTarget|DeleteTarget)\] = useState<(AdminCustomerReview|ReviewItem) \| null>\(null\);$/.test(body) ||
        /^onClick=\{\(\) => void patchAction\(item\.id, "(approve|reject)"(, item\.status)?\)\}$/.test(body) ||
        body === ""
      );
    };
    const offenders = [];
    for (const h of hunks) {
      if (inFns(h)) continue;
      for (const l of h.lines) {
        if (!allowedOutside(l)) offenders.push(l.trim());
      }
    }
    ok(
      "src_reviews_diff_limited",
      d.status === 0 && hunks.length > 0 && offenders.length === 0,
      offenders.length ? `unexpected: ${offenders.slice(0, 3).join(" | ")}` : `hunks=${hunks.length}`
    );

    const cur = read("components/sidhu/ReviewsPanel.tsx");
    ok(
      "src_reviews_has_ReviewItem_type",
      /type ReviewItem = AdminCustomerReview & \{ base_hash\?: string \};/.test(cur)
    );
    ok(
      "src_reviews_sends_tokens",
      /expected_status/.test(cur) && /base_hash: editTarget\.base_hash/.test(cur)
    );
    // No new top-level function headers introduced vs baseline
    const hdr = (s) =>
      norm(s)
        .split("\n")
        .filter((l) => /^\s*(export\s+)?(default\s+)?(async\s+)?function\s+\w+/.test(l))
        .map((l) => l.trim());
    ok(
      "src_reviews_function_headers_unchanged_except_patchAction",
      (() => {
        const norm2 = (arr) =>
          arr.map((l) => l.replace(/\(\s*$/, "(").replace(/\bAdminCustomerReview\b/g, "ReviewItem")).sort();
        return JSON.stringify(norm2(hdr(cur))) === JSON.stringify(norm2(hdr(baseSrc)));
      })()
    );
  }

  // Zero diff files
  {
    const files = [
      "lib/faqBaseHash.ts",
      "lib/couponValidation.ts",
      "lib/orderPricing.ts",
      "lib/customerReviews.ts",
      "lib/customerReviewsHash.ts",
      "lib/customerReviewsServer.ts",
    ];
    for (const f of files) {
      const d = git(["diff", BASE, "--", f]);
      const exists = fs.existsSync(path.join(ROOT, f));
      ok(
        `src_zero_diff_${f.replace(/[^a-zA-Z0-9]+/g, "_")}`,
        exists && d.status === 0 && d.stdout.trim() === "",
        d.stdout.trim() ? "diff present" : ""
      );
    }
  }

  // pages/api diff limited to MULTI-137 surfaces (+ later MULTI-139 password/reconcile).
  {
    const allowed137 = new Set([
      "pages/api/coupons.ts",
      "pages/api/faqs.ts",
      "pages/api/admin-reviews.ts",
    ]);
    // F4UK-MULTI-139: atomic staff password + SEO reconcile lock.
    const allowed139 = new Set([
      "pages/api/admin-profile.ts",
      "pages/api/admin-staff-password.ts",
      "pages/api/admin-seo-issues/reconcile.ts",
    ]);
    // F4UK-MULTI-142: admin drafts API for CMS pages (Draft/Publish D2).
    const allowed142 = new Set(["pages/api/admin-drafts.ts"]);
    const allowed = new Set([...allowed137, ...allowed139, ...allowed142]);
    const changed = git(["diff", "--name-only", BASE, "--", "pages/api"]);
    const untracked = git(["ls-files", "--others", "--exclude-standard", "--", "pages/api"]);
    const names = (changed.stdout + "\n" + untracked.stdout)
      .split(/\r?\n/)
      .map((s) => s.trim().replace(/\\/g, "/"))
      .filter(Boolean);
    const unexpected = names.filter((n) => !allowed.has(n));
    ok(
      "src_pages_api_diff_limited",
      changed.status === 0 && untracked.status === 0 && unexpected.length === 0,
      unexpected.length ? `unexpected: ${unexpected.join(", ")}` : `changed=${[...new Set(names)].join(",")}`
    );
    ok(
      "src_pages_api_expected_files_changed",
      [...allowed137].every((f) => names.includes(f))
    );
  }
}

async function main() {
  runHashTests();
  await runCouponsPut();
  await runCouponsGetAndValidate();
  await runFaqsReorder();
  await runAdminReviews();
  runSourceAssertions();
  console.log(`\nphase-multi-137: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
