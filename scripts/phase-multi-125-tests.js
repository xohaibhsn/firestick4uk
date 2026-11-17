/**
 * F4UK-MULTI-125 — atomic order status PATCH (lock + stale + rollback),
 * locked site-content DELETE, validated/locked blog DELETE.
 * Mocked pool/conn only — no real DB / network.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");
const { createHash } = require("crypto");
const { spawnSync } = require("child_process");

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

function sha256(s) {
  return createHash("sha256").update(String(s), "utf8").digest("hex");
}

function gitShow(rel) {
  const r = spawnSync("git", ["show", `HEAD:${rel.replace(/\\/g, "/")}`], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error(`git show failed: ${r.stderr || r.stdout}`);
  return r.stdout;
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

function extractMethod(src, method, nextMethods) {
  const startRe = new RegExp(`if \\(req\\.method === ['"]${method}['"]\\)`);
  const start = src.search(startRe);
  if (start < 0) return null;
  let end = src.length;
  for (const n of nextMethods) {
    const re = new RegExp(`if \\(req\\.method === ['"]${n}['"]\\)`);
    const idx = src.search(re);
    if (idx > start && idx < end) end = idx;
  }
  const ret405 = src.indexOf("return res.status(405)", start);
  if (ret405 > start && ret405 < end) end = ret405;
  return src.slice(start, end);
}

// ─── O1: admin-orders PATCH harness ────────────────────────────────────────

function makePatchHarness(opts = {}) {
  const order = opts.order || {
    order_id: "ORD-1730000000000123",
    status: "pending",
    cancel_reason: null,
  };
  const missing = opts.missing === true;
  const enumMismatch = opts.enumMismatch === true;
  const badFieldOn = opts.badFieldOn || null;
  const calls = [];
  const audits = [];
  let began = 0;
  let committed = 0;
  let rolled = 0;
  let released = 0;
  let row = missing ? null : { ...order };

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
      if (badFieldOn === "select" && /SELECT order_id, status, cancel_reason/i.test(sql)) {
        const err = new Error("bad field");
        err.code = "ER_BAD_FIELD_ERROR";
        throw err;
      }
      if (/SELECT order_id, status, cancel_reason FROM orders WHERE order_id = \? FOR UPDATE/i.test(sql)) {
        return [row ? [{ ...row }] : [], []];
      }
      if (/UPDATE orders SET status = \?, cancel_reason = \? WHERE order_id = \?/i.test(sql)) {
        if (badFieldOn === "update") {
          const err = new Error("bad field");
          err.code = "ER_BAD_FIELD_ERROR";
          throw err;
        }
        if (row) {
          if (enumMismatch) {
            row.status = "";
            row.cancel_reason = params[1];
          } else {
            row.status = params[0];
            row.cancel_reason = params[1];
          }
        }
        return [{ affectedRows: 1 }, []];
      }
      if (/SELECT status, cancel_reason FROM orders WHERE order_id = \? LIMIT 1/i.test(sql)) {
        if (badFieldOn === "verify") {
          const err = new Error("bad field");
          err.code = "ER_BAD_FIELD_ERROR";
          throw err;
        }
        return [
          row
            ? [{ status: row.status, cancel_reason: row.cancel_reason }]
            : [],
          [],
        ];
      }
      return [[], []];
    },
  };

  const pool = {
    async getConnection() {
      return conn;
    },
    async query(sqlOrObj, maybeParams) {
      const sql =
        typeof sqlOrObj === "string" ? sqlOrObj : String(sqlOrObj?.sql || "");
      const params = sqlOrObj?.values || maybeParams || [];
      calls.push({ sql, params, via: "pool" });
      throw new Error("unexpected pool.query on PATCH path: " + sql.slice(0, 80));
    },
  };

  const stubs = {
    "../../lib/db": { __esModule: true, default: pool },
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
      CANCEL_REASONS: [
        "customer_cancelled",
        "cod_refused",
        "no_response",
        "duplicate_test",
        "payment_not_received",
        "other",
      ],
      buildOrderWhere: () => ({ whereSql: "1=1", params: [] }),
      clampInt: (n, d) => Number(n) || d,
      isCancelReason: (v) =>
        typeof v === "string" &&
        [
          "customer_cancelled",
          "cod_refused",
          "no_response",
          "duplicate_test",
          "payment_not_received",
          "other",
        ].includes(v),
      itemsListForOrderIds: async () => ({}),
      parseOrderFilters: () => ({}),
    },
  };

  const mod = loadTs("pages/api/admin-orders.ts", stubs);
  return {
    handler: mod.default || mod,
    calls,
    audits,
    stats: () => ({ began, committed, rolled, released }),
    getRow: () => row,
  };
}

async function invokePatch(body, opts = {}) {
  const h = makePatchHarness(opts);
  const res = makeRes();
  await h.handler(
    { method: "PATCH", body, headers: {}, query: {} },
    res
  );
  return { ...h, res };
}

// ─── S1: site-content DELETE harness ───────────────────────────────────────

function makeSiteDeleteHarness(opts = {}) {
  const key = opts.key || "home_hero_title";
  const missing = opts.missing === true;
  const revisionTooLarge = opts.revisionTooLarge === true;
  const row = missing
    ? null
    : {
        content_key: key,
        content_value: opts.value !== undefined ? opts.value : "old-title",
        content_type: "text",
        page_name: "home",
        label: "Hero Title",
      };
  const calls = [];
  const audits = [];
  const revisions = [];
  let began = 0;
  let committed = 0;
  let rolled = 0;
  let released = 0;
  let role = opts.role || "super_admin";
  let perm = opts.perm !== undefined ? opts.perm : true;

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
      if (/FOR UPDATE/i.test(sql)) {
        return [row ? [row] : [], []];
      }
      if (/DELETE FROM site_content/i.test(sql)) {
        return [{ affectedRows: 1 }, []];
      }
      return [[], []];
    },
  };

  const pool = {
    async getConnection() {
      return conn;
    },
    async query(sqlOrObj, maybeParams) {
      const sql =
        typeof sqlOrObj === "string" ? sqlOrObj : String(sqlOrObj?.sql || "");
      calls.push({ sql, params: maybeParams || [], via: "pool" });
      // loadKeysSnapshot must NOT be used on DELETE path anymore
      throw new Error("unexpected pool.query on site-content DELETE: " + sql.slice(0, 80));
    },
  };

  const stubs = {
    "../../lib/db": { __esModule: true, default: pool },
    "../../lib/siteContentSeed": { SITE_CONTENT_DEFAULTS: [] },
    "../../lib/subscriptionSlug": {
      DEFAULT_SUBSCRIPTION_SLUG: "subscription",
      isAutoSubscriptionCanonical: () => false,
      normalizeSubscriptionSlug: (v) => String(v || ""),
      subscriptionPageUrl: (v) => `/subscriptions/${v}`,
      validateSubscriptionSlug: (v) => ({ ok: true, slug: String(v) }),
    },
    "../../lib/adminAuth": {
      requireAdmin: async () => ({ id: 1, username: "tester", role }),
      getRequestMeta: () => ({ ip: "127.0.0.1" }),
    },
    "../../lib/adminPermissions": {
      hasAdminPermission: () => perm,
      isSuperAdminSettingsKey: (k) =>
        k === "favicon_url" || k === "seasonal_hub_published" || k === "site_title",
    },
    "../../lib/adminAudit": {
      recordAdminAudit: async (entry) => {
        audits.push(entry);
      },
    },
    "../../lib/contentRevisions": {
      classifySiteContentEntityType: (keys) =>
        keys.some((k) => k === "favicon_url" || k === "site_title")
          ? "site_settings"
          : "site_content",
      recordContentRevision: async (payload) => {
        if (revisionTooLarge) {
          const err = new Error("Revision too large");
          err.code = "REVISION_TOO_LARGE";
          throw err;
        }
        revisions.push(payload);
      },
    },
    "../../lib/hostingerResourceInvalidation": {
      invalidateFaviconCache() {},
      invalidateSitemapCache() {},
      siteContentKeysAffectFavicon: () => false,
      siteContentKeysAffectSitemap: () => false,
    },
    "../../lib/publicCmsDataServer": {
      getCachedPublicSiteContentAll: async () => ({}),
      loadSiteContentAllUncached: async () => ({}),
      invalidatePublicCmsCache() {},
    },
    "../../lib/publicSiteContentFilter": {
      filterPublicSiteContentMap: (v) => v,
    },
    "../../lib/seasonalHubPublic": {
      SEASONAL_HUB_PUBLISHED_KEY: "seasonal_hub_published",
      validateSeasonalHubPublicationWrite: async () => ({ ok: true }),
    },
    "../../lib/siteContentBaseHash": {
      hashSiteContentValue: () => "hash",
    },
  };

  const mod = loadTs("pages/api/site-content.ts", stubs);
  return {
    handler: mod.default || mod,
    calls,
    audits,
    revisions,
    stats: () => ({ began, committed, rolled, released }),
  };
}

async function invokeSiteDelete(key, opts = {}) {
  const h = makeSiteDeleteHarness({ ...opts, key });
  const res = makeRes();
  await h.handler(
    {
      method: "DELETE",
      query: { key },
      body: {},
      headers: {},
      __adminIdentity: { id: 1, username: "tester", role: opts.role || "super_admin" },
    },
    res
  );
  return { ...h, res };
}

// ─── B1: blog DELETE harness ───────────────────────────────────────────────

function makeBlogDeleteHarness(opts = {}) {
  const post = opts.post || {
    id: 42,
    title: "Hello",
    slug: "hello",
    status: "published",
    active: 1,
  };
  const missing = opts.missing === true;
  const revisionTooLarge = opts.revisionTooLarge === true;
  const calls = [];
  const audits = [];
  const revisions = [];
  const seoCalls = [];
  let sitemapInvalidated = 0;
  let began = 0;
  let committed = 0;
  let rolled = 0;
  let released = 0;
  let row = missing ? null : { ...post };

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
      if (/SELECT \* FROM blog_posts WHERE id = \? FOR UPDATE/i.test(sql)) {
        return [row ? [{ ...row }] : [], []];
      }
      if (/DELETE FROM blog_posts WHERE id = \?/i.test(sql)) {
        row = null;
        return [{ affectedRows: 1 }, []];
      }
      return [[], []];
    },
  };

  const pool = {
    async getConnection() {
      return conn;
    },
    async query(sqlOrObj, maybeParams) {
      const sql =
        typeof sqlOrObj === "string" ? sqlOrObj : String(sqlOrObj?.sql || "");
      calls.push({ sql, params: maybeParams || [], via: "pool" });
      throw new Error("unexpected pool.query on blog DELETE: " + sql.slice(0, 80));
    },
  };

  const stubs = {
    "../../lib/db": { __esModule: true, default: pool },
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
    "../../lib/contentRevisions": {
      snapshotBlog: (row) => ({ id: row.id, title: row.title, slug: row.slug }),
      recordContentRevision: async (payload) => {
        if (revisionTooLarge) {
          const err = new Error("Revision too large");
          err.code = "REVISION_TOO_LARGE";
          throw err;
        }
        revisions.push(payload);
      },
    },
    "../../lib/hostingerResourceInvalidation": {
      invalidateSitemapCache() {
        sitemapInvalidated++;
      },
    },
    "../../lib/postSaveSeoGuard": {
      runPostSaveSeoGuard: async (args) => {
        seoCalls.push(args);
        return { ok: true };
      },
    },
    "../../lib/blogPersistenceServer": {
      BlogPersistenceError: class BlogPersistenceError extends Error {},
      createBlogPost: async () => ({}),
      updateBlogPost: async () => ({}),
      requireExplicitBlogStatus: () => "draft",
      requireSuppliedBlogStatus: () => "draft",
    },
    "../../lib/blogBaseHash": {
      blogRowBaseHash: () => "hash",
    },
    "../../lib/rateLimit": {
      getClientIp: () => "127.0.0.1",
      RL_PUBLIC_GET: () => ({ allowed: true, retryAfterSec: 0 }),
    },
  };

  const mod = loadTs("pages/api/blog.ts", stubs);
  return {
    handler: mod.default || mod,
    calls,
    audits,
    revisions,
    seoCalls,
    getSitemapInvalidated: () => sitemapInvalidated,
    stats: () => ({ began, committed, rolled, released }),
  };
}

async function invokeBlogDelete(id, opts = {}) {
  const h = makeBlogDeleteHarness(opts);
  const res = makeRes();
  await h.handler(
    { method: "DELETE", query: { id }, body: {}, headers: {} },
    res
  );
  return { ...h, res };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

async function runO1() {
  console.log("\n# O1 admin-orders PATCH");

  let run = await invokePatch({
    order_id: "ORD-1730000000000123",
    status: "confirmed",
  });
  ok("o1_success_200", run.res.statusCode === 200 && run.res.body?.success === true);
  ok(
    "o1_locked_read_update_verify_one_conn",
    run.calls.length >= 3 &&
      run.calls.every((c) => c.via === "conn") &&
      run.calls.some((c) => /FOR UPDATE/i.test(c.sql)) &&
      run.calls.some((c) => /UPDATE orders SET status/i.test(c.sql)) &&
      run.calls.some((c) => /SELECT status, cancel_reason FROM orders/i.test(c.sql))
  );
  ok(
    "o1_success_tx",
    run.stats().began === 1 &&
      run.stats().committed === 1 &&
      run.stats().rolled === 0 &&
      run.stats().released === 1
  );
  ok(
    "o1_success_audit_locked_old",
    run.audits.length === 1 &&
      run.audits[0].action === "order.status_changed" &&
      run.audits[0].metadata?.old_status === "pending" &&
      run.audits[0].metadata?.new_status === "confirmed"
  );

  run = await invokePatch(
    {
      order_id: "ORD-1730000000000123",
      status: "confirmed",
      base_status: "pending",
    },
    { order: { order_id: "ORD-1730000000000123", status: "dispatched", cancel_reason: null } }
  );
  ok(
    "o1_stale_409",
    run.res.statusCode === 409 &&
      run.res.body?.error === "stale" &&
      run.res.body?.current_status === "dispatched"
  );
  ok(
    "o1_stale_no_update",
    !run.calls.some((c) => /UPDATE orders SET status/i.test(c.sql))
  );
  ok("o1_stale_no_audit", run.audits.length === 0);
  ok("o1_stale_rollback", run.stats().rolled >= 1 && run.stats().committed === 0);

  run = await invokePatch({
    order_id: "ORD-1730000000000123",
    status: "confirmed",
  });
  ok(
    "o1_no_base_status_allowed",
    run.res.statusCode === 200 && run.res.body?.success === true
  );

  run = await invokePatch({
    order_id: "ORD-1730000000000123",
    status: "pending",
  });
  ok(
    "o1_noop_changed_0",
    run.res.statusCode === 200 &&
      run.res.body?.success === true &&
      run.res.body?.changed === 0
  );
  ok("o1_noop_no_audit", run.audits.length === 0);
  ok(
    "o1_noop_no_update",
    !run.calls.some((c) => /UPDATE orders SET status/i.test(c.sql))
  );
  ok("o1_noop_commit", run.stats().committed === 1);

  run = await invokePatch(
    { order_id: "ORD-1730000000000123", status: "confirmed" },
    { enumMismatch: true }
  );
  ok(
    "o1_enum_mismatch_500",
    run.res.statusCode === 500 &&
      run.res.body?.error ===
        "Status could not be saved. Please contact the site admin."
  );
  ok("o1_enum_rollback", run.stats().rolled >= 1 && run.stats().committed === 0);
  ok(
    "o1_enum_no_compensating_update",
    run.calls.filter((c) => /UPDATE orders SET status/i.test(c.sql)).length === 1
  );
  ok(
    "o1_enum_failed_audit",
    run.audits.length === 1 &&
      run.audits[0].action === "order.status_change_failed" &&
      run.audits[0].metadata?.old_status === "pending"
  );

  run = await invokePatch({ order_id: "", status: "confirmed" });
  ok("o1_bad_empty_order_id_400", run.res.statusCode === 400);
  run = await invokePatch({ order_id: "x".repeat(65), status: "confirmed" });
  ok("o1_bad_long_order_id_400", run.res.statusCode === 400);
  run = await invokePatch({ order_id: null, status: "confirmed" });
  ok("o1_bad_null_order_id_400", run.res.statusCode === 400);

  run = await invokePatch(
    { order_id: "ORD-missing", status: "confirmed" },
    { missing: true }
  );
  ok(
    "o1_missing_404",
    run.res.statusCode === 404 && run.res.body?.error === "Order not found"
  );

  run = await invokePatch({
    order_id: "ORD-1730000000000123",
    status: "cancelled",
  });
  ok(
    "o1_cancel_reason_required",
    run.res.statusCode === 400 &&
      run.res.body?.error === "cancel_reason required"
  );

  run = await invokePatch({
    order_id: "ORD-1730000000000123",
    status: "cancelled",
    cancel_reason: "customer_cancelled",
  });
  ok(
    "o1_cancel_ok",
    run.res.statusCode === 200 &&
      run.audits[0]?.metadata?.cancel_reason === "customer_cancelled"
  );

  run = await invokePatch({
    order_id: "ORD-1730000000000123",
    status: "cancelled",
    cancel_reason: "not_a_real_reason",
  });
  ok("o1_cancel_invalid_reason_400", run.res.statusCode === 400);

  const sidhu = read("app/sidhu/page.tsx");
  const updStart = sidhu.indexOf("const updateStatus = (");
  const updEnd = sidhu.indexOf("const requestStatusChange", updStart);
  const updBlock = sidhu.slice(updStart, updEnd);
  ok("o1_client_sends_base_status", /base_status/.test(updBlock));
  ok(
    "o1_client_409_stale_alert",
    /r\.status === 409/.test(updBlock) &&
      /updated by someone else/.test(updBlock) &&
      /refreshAfterOrderMutation/.test(updBlock)
  );
  ok(
    "o1_client_409_no_optimistic_before_return",
    (() => {
      const staleAt = updBlock.indexOf("r.status === 409");
      const returnAt = updBlock.indexOf("return;", staleAt);
      const optAt = updBlock.indexOf("setOrders((prev)", staleAt);
      return staleAt >= 0 && returnAt > staleAt && (optAt < 0 || optAt > returnAt);
    })()
  );
}

async function runS1() {
  console.log("\n# S1 site-content DELETE");

  let run = await invokeSiteDelete("home_hero_title");
  ok("s1_success_200", run.res.statusCode === 200 && run.res.body?.success === true);
  ok(
    "s1_for_update_on_tx_conn",
    run.calls.some(
      (c) =>
        c.via === "conn" &&
        /FROM site_content WHERE content_key=\? FOR UPDATE/i.test(c.sql)
    )
  );
  ok(
    "s1_no_pool_read",
    !run.calls.some((c) => c.via === "pool")
  );
  ok(
    "s1_revision_shape",
    run.revisions.length === 1 &&
      run.revisions[0].snapshot?.content_key === "home_hero_title" &&
      run.revisions[0].snapshot?.values?.home_hero_title === "old-title" &&
      run.revisions[0].snapshot?.metadata?.rows?.home_hero_title?.content_type ===
        "text" &&
      run.revisions[0].revisionAction === "delete"
  );
  ok(
    "s1_tx_commit",
    run.stats().began === 1 &&
      run.stats().committed === 1 &&
      run.stats().rolled === 0
  );

  // Missing-key: behaviour-identical to pre-MULTI-125 (200 + audit, no revision)
  run = await invokeSiteDelete("missing_key_xyz", { missing: true });
  ok(
    "s1_missing_200_success",
    run.res.statusCode === 200 && run.res.body?.success === true
  );
  ok("s1_missing_no_revision", run.revisions.length === 0);
  ok(
    "s1_missing_audit",
    run.audits.length === 1 &&
      run.audits[0].metadata?.deleted === true &&
      Array.isArray(run.audits[0].metadata?.keys)
  );
  ok(
    "s1_missing_rollback_no_commit",
    run.stats().committed === 0 && run.stats().rolled >= 1
  );
  ok(
    "s1_missing_no_delete",
    !run.calls.some((c) => /DELETE FROM site_content/i.test(c.sql))
  );

  run = await invokeSiteDelete("home_hero_title", { revisionTooLarge: true });
  ok(
    "s1_revision_too_large_400",
    run.res.statusCode === 400 && /Revision too large/.test(String(run.res.body?.error || ""))
  );
}

async function runB1() {
  console.log("\n# B1 blog DELETE");

  let run = await invokeBlogDelete("abc");
  ok(
    "b1_invalid_id_400",
    run.res.statusCode === 400 && run.res.body?.error === "invalid_id"
  );
  ok("b1_invalid_no_tx", run.stats().began === 0);

  run = await invokeBlogDelete("0");
  ok("b1_zero_id_400", run.res.statusCode === 400 && run.res.body?.error === "invalid_id");

  run = await invokeBlogDelete("-3");
  ok("b1_neg_id_400", run.res.statusCode === 400 && run.res.body?.error === "invalid_id");

  run = await invokeBlogDelete("1.5");
  ok("b1_float_id_400", run.res.statusCode === 400 && run.res.body?.error === "invalid_id");

  run = await invokeBlogDelete("99", { missing: true, post: { id: 99, title: "x" } });
  ok(
    "b1_missing_404",
    run.res.statusCode === 404 && run.res.body?.error === "not_found"
  );
  ok(
    "b1_missing_no_delete",
    !run.calls.some((c) => /DELETE FROM blog_posts/i.test(c.sql))
  );
  ok("b1_missing_no_audit", run.audits.length === 0);
  ok("b1_missing_no_sitemap", run.getSitemapInvalidated() === 0);
  ok("b1_missing_no_seo", run.seoCalls.length === 0);
  ok("b1_missing_rollback", run.stats().rolled >= 1 && run.stats().committed === 0);

  run = await invokeBlogDelete("42");
  ok("b1_success_200", run.res.statusCode === 200 && run.res.body?.success === true);
  ok(
    "b1_locked_read",
    run.calls.some(
      (c) => c.via === "conn" && /SELECT \* FROM blog_posts WHERE id = \? FOR UPDATE/i.test(c.sql)
    )
  );
  ok("b1_revision", run.revisions.length === 1 && run.revisions[0].entityType === "blog");
  ok(
    "b1_delete_on_conn",
    run.calls.some((c) => c.via === "conn" && /DELETE FROM blog_posts/i.test(c.sql))
  );
  ok(
    "b1_tx_commit",
    run.stats().began === 1 &&
      run.stats().committed === 1 &&
      run.stats().rolled === 0
  );
  ok(
    "b1_audit_after",
    run.audits.length === 1 && run.audits[0].action === "blog.deleted"
  );
  ok("b1_sitemap_after", run.getSitemapInvalidated() === 1);
  ok(
    "b1_seo_after",
    run.seoCalls.length === 1 &&
      run.seoCalls[0].operation === "delete" &&
      run.seoCalls[0].entityId === "42"
  );

  run = await invokeBlogDelete("42", { revisionTooLarge: true });
  ok(
    "b1_revision_too_large_400",
    run.res.statusCode === 400 && /Revision too large/.test(String(run.res.body?.error || ""))
  );
  ok("b1_rtl_no_audit", run.audits.length === 0);
  ok("b1_rtl_no_sitemap", run.getSitemapInvalidated() === 0);

  const sidhu = read("app/sidhu/page.tsx");
  const delStart = sidhu.indexOf("const deleteBlog = async");
  const delEnd = sidhu.indexOf("const deleteProduct = async", delStart);
  const delBlock = sidhu.slice(delStart, delEnd);
  ok(
    "b1_client_shows_server_error",
    /res\.error/.test(delBlock) &&
      (/adminAlert\(errMsg\)/.test(delBlock) || /setBlogMsg\(`❌ \$\{/.test(delBlock))
  );
}

function runSourceChecks() {
  console.log("\n# Source byte-identical (other methods vs HEAD)");

  const aoNow = read("pages/api/admin-orders.ts");
  const aoHead = gitShow("pages/api/admin-orders.ts");
  const aoDelNow = extractMethod(aoNow, "DELETE", []);
  const aoDelHead = extractMethod(aoHead, "DELETE", []);
  // GET region = from handler start through before PATCH
  const aoGetNow = aoNow.slice(
    aoNow.indexOf("export default"),
    aoNow.search(/if \(req\.method === ["']PATCH["']\)/)
  );
  const aoGetHead = aoHead.slice(
    aoHead.indexOf("export default"),
    aoHead.search(/if \(req\.method === ["']PATCH["']\)/)
  );
  ok(
    "src_admin_orders_get_identical",
    sha256(aoGetNow) === sha256(aoGetHead),
    sha256(aoGetNow).slice(0, 12)
  );
  ok(
    "src_admin_orders_delete_identical",
    !!aoDelNow && !!aoDelHead && sha256(aoDelNow) === sha256(aoDelHead),
    aoDelNow ? sha256(aoDelNow).slice(0, 12) : "missing"
  );

  const scNow = read("pages/api/site-content.ts");
  const scHead = gitShow("pages/api/site-content.ts");
  const scPostNow = extractMethod(scNow, "POST", ["PUT", "DELETE"]);
  const scPostHead = extractMethod(scHead, "POST", ["PUT", "DELETE"]);
  const scPutNow = extractMethod(scNow, "PUT", ["DELETE"]);
  const scPutHead = extractMethod(scHead, "PUT", ["DELETE"]);
  ok(
    "src_site_content_post_identical",
    !!scPostNow && !!scPostHead && sha256(scPostNow) === sha256(scPostHead)
  );
  ok(
    "src_site_content_put_identical",
    !!scPutNow && !!scPutHead && sha256(scPutNow) === sha256(scPutHead)
  );

  const blNow = read("pages/api/blog.ts");
  const blHead = gitShow("pages/api/blog.ts");
  const blGetNow = extractMethod(blNow, "GET", ["POST", "PUT", "DELETE"]);
  const blGetHead = extractMethod(blHead, "GET", ["POST", "PUT", "DELETE"]);
  const blPostNow = extractMethod(blNow, "POST", ["PUT", "DELETE"]);
  const blPostHead = extractMethod(blHead, "POST", ["PUT", "DELETE"]);
  const blPutNow = extractMethod(blNow, "PUT", ["DELETE"]);
  const blPutHead = extractMethod(blHead, "PUT", ["DELETE"]);
  ok(
    "src_blog_get_identical",
    !!blGetNow && !!blGetHead && sha256(blGetNow) === sha256(blGetHead)
  );
  ok(
    "src_blog_post_identical",
    !!blPostNow && !!blPostHead && sha256(blPostNow) === sha256(blPostHead)
  );
  ok(
    "src_blog_put_identical",
    !!blPutNow && !!blPutHead && sha256(blPutNow) === sha256(blPutHead)
  );

  const aoPatch = extractMethod(aoNow, "PATCH", ["DELETE"]);
  ok("src_o1_for_update", /FOR UPDATE/.test(aoPatch || ""));
  ok("src_o1_stale_409", /error:\s*["']stale["']/.test(aoPatch || ""));
  ok("src_o1_no_compensating_restore", !/status restore failed/.test(aoPatch || ""));
  ok("src_o1_rollback_on_mismatch", /rollback/.test(aoPatch || ""));

  const scDel = extractMethod(scNow, "DELETE", []);
  ok("src_s1_for_update", /FOR UPDATE/.test(scDel || ""));
  ok(
    "src_s1_no_pool_select_before_tx",
    !/loadKeysSnapshot\(\[key\]\)/.test(scDel || "")
  );

  const blDel = extractMethod(blNow, "DELETE", []);
  ok("src_b1_invalid_id", /invalid_id/.test(blDel || ""));
  ok("src_b1_not_found", /not_found/.test(blDel || ""));
  ok("src_b1_for_update", /FOR UPDATE/.test(blDel || ""));
  ok("src_b1_no_blind_delete", !/else\s*\{\s*await pool\.query\('DELETE FROM blog_posts/.test(blDel || ""));

  ok(
    "src_audit_doc",
    fs.existsSync(path.join(ROOT, "docs/design/ADMIN-WRITE-PATHS-AUDIT.md")) &&
      /MULTI-125/.test(read("docs/design/ADMIN-WRITE-PATHS-AUDIT.md"))
  );
}

async function main() {
  await runO1();
  await runS1();
  await runB1();
  runSourceChecks();
  console.log(`\nphase-multi-125: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error("FAIL  suite_exception —", err?.stack || err);
  process.exit(1);
});
