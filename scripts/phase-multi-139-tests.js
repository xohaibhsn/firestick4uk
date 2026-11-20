/**
 * F4UK-MULTI-139 — atomic staff password change + session revoke;
 * serialise SEO issue reconcile with named advisory lock.
 * Mocked pool/conn only — no real DB / network.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const BASE = "49f156bf829940c448dee85b220b389359011996";

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
      const stubKey = "@/lib/" + mapped.replace(/^lib\//, "");
      if (Object.prototype.hasOwnProperty.call(stubs, stubKey)) return stubs[stubKey];
      if (Object.prototype.hasOwnProperty.call(stubs, mapped)) return stubs[mapped];
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

// ─── applyStaffPasswordChange ──────────────────────────────────────────────

function makePwHarness(opts = {}) {
  const calls = [];
  const row =
    opts.row === null
      ? null
      : opts.row || { id: 7, password_hash: "hash-a", active: 1 };
  let deleteThrows = !!opts.deleteThrows;
  const conn = {
    async beginTransaction() {
      calls.push({ op: "beginTransaction" });
    },
    async commit() {
      calls.push({ op: "commit" });
    },
    async rollback() {
      calls.push({ op: "rollback" });
    },
    async query(sql, params) {
      const s = String(sql).replace(/\s+/g, " ");
      calls.push({ op: "query", sql: s, params });
      if (/SELECT id, password_hash, active FROM admin_staff.*FOR UPDATE/i.test(s)) {
        return [row ? [row] : [], []];
      }
      if (/UPDATE admin_staff/i.test(s)) {
        return [{ affectedRows: 1 }, []];
      }
      if (/DELETE FROM admin_sessions/i.test(s)) {
        if (deleteThrows) {
          const err = new Error("delete boom");
          throw err;
        }
        return [{ affectedRows: 2 }, []];
      }
      return [[], []];
    },
    release() {
      calls.push({ op: "release" });
    },
    destroy() {
      calls.push({ op: "destroy" });
    },
  };
  const poolQueries = [];
  const pool = {
    async getConnection() {
      calls.push({ op: "getConnection" });
      return conn;
    },
    async query(sql, params) {
      poolQueries.push({ sql: String(sql), params });
      return [[], []];
    },
  };
  const mod = loadTs("lib/adminStaffPasswordTx.ts", {
    "./db": { __esModule: true, default: pool },
    // F4UK-MULTI-145: createStaffSessionIfUnchanged imports adminAuth (applyStaffPasswordChange unchanged).
    "./adminAuth": {
      ADMIN_SESSION_TTL_MS: 12 * 60 * 60 * 1000,
      generateSessionToken: () => "a".repeat(64),
      hashSessionToken: (t) => "hash:" + String(t),
      isAdminRole: (v) =>
        typeof v === "string" &&
        ["super_admin", "manager", "writer"].includes(v),
    },
  });
  return { mod, calls, poolQueries, conn };
}

async function runPasswordTx() {
  console.log("\n# applyStaffPasswordChange");

  {
    const h = makePwHarness();
    const r = await h.mod.applyStaffPasswordChange(7, "new-hash");
    ok("pw_happy_ok", r && r.ok === true);
    const ops = h.calls.map((c) => c.op);
    const qOps = h.calls.filter((c) => c.op === "query").map((c) => c.sql);
    ok(
      "pw_happy_order",
      ops[0] === "getConnection" &&
        ops[1] === "beginTransaction" &&
        /FOR UPDATE/i.test(qOps[0]) &&
        /UPDATE admin_staff/i.test(qOps[1]) &&
        /DELETE FROM admin_sessions/i.test(qOps[2]) &&
        ops.includes("commit") &&
        ops[ops.length - 1] === "release"
    );
    const beginIdx = ops.indexOf("beginTransaction");
    const selIdx = ops.findIndex(
      (o, i) => o === "query" && /FOR UPDATE/i.test(h.calls[i].sql)
    );
    const updIdx = ops.findIndex(
      (o, i) => o === "query" && /UPDATE admin_staff/i.test(h.calls[i].sql)
    );
    const delIdx = ops.findIndex(
      (o, i) => o === "query" && /DELETE FROM admin_sessions/i.test(h.calls[i].sql)
    );
    const commitIdx = ops.indexOf("commit");
    ok(
      "pw_happy_exact_sequence",
      beginIdx < selIdx &&
        selIdx < updIdx &&
        updIdx < delIdx &&
        delIdx < commitIdx &&
        commitIdx < ops.lastIndexOf("release")
    );
    ok("pw_happy_no_pool_query", h.poolQueries.length === 0);
  }

  {
    const h = makePwHarness({
      row: { id: 7, password_hash: "hash-b", active: 1 },
    });
    const r = await h.mod.applyStaffPasswordChange(7, "new-hash", {
      expectedHash: "hash-a",
    });
    ok("pw_stale_code", r && r.ok === false && r.code === "stale");
    ok(
      "pw_stale_rollback_no_update_delete",
      h.calls.some((c) => c.op === "rollback") &&
        !h.calls.some((c) => c.op === "query" && /UPDATE admin_staff/i.test(c.sql)) &&
        !h.calls.some(
          (c) => c.op === "query" && /DELETE FROM admin_sessions/i.test(c.sql)
        ) &&
        h.calls.some((c) => c.op === "release")
    );
  }

  {
    const h = makePwHarness({ row: null });
    const r = await h.mod.applyStaffPasswordChange(99, "new-hash");
    ok("pw_not_found", r && r.ok === false && r.code === "not_found");
    ok(
      "pw_not_found_rollback",
      h.calls.some((c) => c.op === "rollback") &&
        !h.calls.some((c) => c.op === "commit")
    );
  }

  {
    const h = makePwHarness({
      row: { id: 7, password_hash: "hash-a", active: 0 },
    });
    const r = await h.mod.applyStaffPasswordChange(7, "new-hash", {
      requireActive: true,
    });
    ok(
      "pw_require_active_zero",
      r && r.ok === false && r.code === "not_found"
    );
  }

  {
    const h = makePwHarness({ deleteThrows: true });
    let threw = null;
    try {
      await h.mod.applyStaffPasswordChange(7, "new-hash");
    } catch (e) {
      threw = e;
    }
    ok("pw_delete_rethrows", threw && threw.message === "delete boom");
    ok(
      "pw_delete_rollback_release",
      h.calls.some((c) => c.op === "rollback") &&
        h.calls.some((c) => c.op === "release") &&
        !h.calls.some((c) => c.op === "commit")
    );
  }
}

// ─── namedLock helpers ─────────────────────────────────────────────────────

async function runNamedLock() {
  console.log("\n# namedLock helpers");
  const src = read("lib/namedLock.ts");
  ok(
    "nl_existing_exports_unchanged",
    /export class LockTimeoutError/.test(src) &&
      /export async function withNamedLock/.test(src) &&
      /export const LOCK_ADMIN_STAFF = "f4uk_admin_staff"/.test(src) &&
      /export const LOCK_REDIRECTS = "f4uk_redirects"/.test(src)
  );
  ok(
    "nl_new_constant",
    /export const LOCK_SEO_ISSUE_RECONCILE = "f4uk_seo_issue_reconcile"/.test(src)
  );

  function lockHarness(getLockResult) {
    const queries = [];
    const conn = {
      async query(sql, params) {
        queries.push({ sql: String(sql), params });
        if (/GET_LOCK/.test(sql)) return [[{ got: getLockResult }], []];
        if (/RELEASE_LOCK/.test(sql)) return [[{}], []];
        return [[], []];
      },
    };
    const mod = loadTs("lib/namedLock.ts", {
      "./db": {
        __esModule: true,
        default: { async getConnection() { return conn; } },
      },
    });
    return { mod, queries, conn };
  }

  {
    const h = lockHarness(1);
    await h.mod.acquireNamedLockOnConn(h.conn, "f4uk_seo_issue_reconcile", 5);
    ok(
      "nl_acquire_got_1",
      h.queries.some(
        (q) =>
          /GET_LOCK/.test(q.sql) &&
          q.params[0] === "f4uk_seo_issue_reconcile" &&
          q.params[1] === 5
      )
    );
  }

  for (const got of [0, null]) {
    const h = lockHarness(got);
    let err = null;
    try {
      await h.mod.acquireNamedLockOnConn(h.conn, "f4uk_seo_issue_reconcile", 5);
    } catch (e) {
      err = e;
    }
    ok(
      `nl_acquire_got_${got === null ? "null" : got}_timeout`,
      err && err.name === "LockTimeoutError"
    );
  }

  {
    const h = lockHarness(1);
    const released = await h.mod.releaseNamedLockOnConn(
      h.conn,
      "f4uk_seo_issue_reconcile"
    );
    ok("nl_release_ok_true", released === true);
  }

  {
    const queries = [];
    const conn = {
      async query(sql) {
        queries.push(sql);
        if (/RELEASE_LOCK/.test(sql)) throw new Error("release fail");
        return [[], []];
      },
    };
    const mod = loadTs("lib/namedLock.ts", {
      "./db": {
        __esModule: true,
        default: { async getConnection() { return conn; } },
      },
    });
    let threw = false;
    let result = null;
    try {
      result = await mod.releaseNamedLockOnConn(conn, "f4uk_seo_issue_reconcile");
    } catch {
      threw = true;
    }
    ok("nl_release_fail_false_no_throw", threw === false && result === false);
  }
}

// ─── source: admin-profile / admin-staff-password ───────────────────────────

function runPasswordSource() {
  console.log("\n# password API source");
  const profile = read("pages/api/admin-profile.ts");
  const staffPw = read("pages/api/admin-staff-password.ts");
  const tx = read("lib/adminStaffPasswordTx.ts");

  ok(
    "src_profile_imports_helper",
    /applyStaffPasswordChange/.test(profile) &&
      /from ["'].*adminStaffPasswordTx["']/.test(profile)
  );
  ok(
    "src_profile_no_standalone_destroy_sessions",
    !/destroyAdminSessionsForStaff/.test(profile)
  );
  ok(
    "src_profile_stale_409",
    /status\(409\)/.test(profile) &&
      /code:\s*["']stale["']/.test(profile) &&
      /Your password was changed elsewhere/.test(profile)
  );
  ok(
    "src_profile_not_found_401",
    /applied\.code === ["']stale["'][\s\S]*401[\s\S]*Unauthorized/.test(profile) ||
      (/code === ["']stale["']/.test(profile) &&
        /status\(401\)\.json\(\{\s*error:\s*["']Unauthorized["']\s*\}\)/.test(profile))
  );
  ok(
    "src_profile_success_json",
    /success:\s*true/.test(profile) &&
      /reLoginRequired:\s*true/.test(profile) &&
      /Password changed\. Please sign in again\./.test(profile)
  );
  ok(
    "src_profile_master_branch",
    /principalType === ["']master["']/.test(profile) &&
      /passwordManagedByEnv:\s*true/.test(profile)
  );
  ok(
    "src_profile_missing_staffId",
    /!admin\.staffId/.test(profile) && /Staff identity required/.test(profile)
  );
  ok(
    "src_profile_hash_before_helper",
    /hashStaffPassword[\s\S]*applyStaffPasswordChange/.test(profile)
  );
  ok(
    "src_profile_keeps_cookie_destroy_audit",
    /destroyAdminSessionByToken/.test(profile) &&
      /clearAdminSessionCookie/.test(profile) &&
      /profile\.password_changed/.test(profile)
  );
  ok(
    "src_profile_expected_hash_require_active",
    /expectedHash:\s*String\(staff\.password_hash/.test(profile) &&
      /requireActive:\s*true/.test(profile)
  );

  ok(
    "src_staff_pw_imports_helper",
    /applyStaffPasswordChange/.test(staffPw) &&
      /from ["'].*adminStaffPasswordTx["']/.test(staffPw)
  );
  ok(
    "src_staff_pw_no_standalone_destroy",
    !/destroyAdminSessionsForStaff/.test(staffPw)
  );
  ok(
    "src_staff_pw_404",
    /Staff user not found/.test(staffPw) && /status\(404\)/.test(staffPw)
  );
  ok(
    "src_staff_pw_success_json",
    /success:\s*true,\s*sessionsRevoked:\s*true/.test(staffPw)
  );
  ok(
    "src_staff_pw_hash_before_helper",
    /hashStaffPassword[\s\S]*applyStaffPasswordChange/.test(staffPw)
  );
  ok(
    "src_staff_pw_no_expected_hash",
    /applyStaffPasswordChange\(staffId,\s*passwordHash\)/.test(staffPw)
  );
  ok("src_staff_pw_audit", /staff\.password_reset/.test(staffPw));

  ok(
    "src_tx_for_update_same_conn_delete",
    /FOR UPDATE/.test(tx) &&
      /DELETE FROM admin_sessions WHERE staff_id = \?/.test(tx) &&
      /password_changed_at = NOW\(\)/.test(tx)
  );
}

// ─── reconcile lock behaviour ──────────────────────────────────────────────

async function runReconcile() {
  console.log("\n# seo reconcile lock");
  const serverSrc = read("lib/seoIssueMemoryServer.ts");
  const reconSrc = read("pages/api/admin-seo-issues/reconcile.ts");
  const guardSrc = read("lib/postSaveSeoGuard.ts");

  ok(
    "src_recon_lock_before_begin",
    /acquireNamedLockOnConn\(\s*conn,\s*LOCK_SEO_ISSUE_RECONCILE,\s*5\s*\)/.test(
      serverSrc
    ) &&
      /lockHeld = true[\s\S]*beginTransaction/.test(serverSrc)
  );
  ok(
    "src_recon_release_or_destroy",
    /releaseNamedLockOnConn/.test(serverSrc) &&
      /released === false[\s\S]*conn\.destroy\(\)/.test(serverSrc) &&
      /conn\.release\(\)/.test(serverSrc)
  );
  ok(
    "src_recon_handler_409_busy",
    /LockTimeoutError/.test(reconSrc) &&
      /status\(409\)/.test(reconSrc) &&
      /Reconcile busy/.test(reconSrc) &&
      /code:\s*["']busy["']/.test(reconSrc)
  );
  ok(
    "src_recon_handler_500_unchanged",
    /Reconcile failed/.test(reconSrc) &&
      /Authoritative diagnostic reconcile did not complete/.test(reconSrc)
  );
  ok(
    "src_post_save_guard_unavailable",
    /status:\s*["']unavailable["']/.test(guardSrc) &&
      /SEO check temporarily unavailable/.test(guardSrc)
  );

  // Mocked: LockTimeoutError before beginTransaction
  {
    const calls = [];
    const conn = {
      async beginTransaction() {
        calls.push("beginTransaction");
      },
      async commit() {
        calls.push("commit");
      },
      async rollback() {
        calls.push("rollback");
      },
      async query() {
        calls.push("query");
        return [[], []];
      },
      release() {
        calls.push("release");
      },
      destroy() {
        calls.push("destroy");
      },
    };
    class LockTimeoutError extends Error {
      constructor(name) {
        super(`Lock busy or unavailable: ${name}`);
        this.name = "LockTimeoutError";
        this.lockName = name;
      }
    }
    const mod = loadTs("lib/seoIssueMemoryServer.ts", {
      "@/lib/db": {
        __esModule: true,
        default: {
          async getConnection() {
            calls.push("getConnection");
            return conn;
          },
          async query() {
            return [[], []];
          },
        },
      },
      "@/lib/namedLock": {
        LOCK_SEO_ISSUE_RECONCILE: "f4uk_seo_issue_reconcile",
        LockTimeoutError,
        async acquireNamedLockOnConn() {
          calls.push("acquire");
          throw new LockTimeoutError("f4uk_seo_issue_reconcile");
        },
        async releaseNamedLockOnConn() {
          calls.push("releaseLock");
          return true;
        },
      },
    });
    let err = null;
    try {
      await mod.reconcileSeoIssueMemory({ scope: "products" });
    } catch (e) {
      err = e;
    }
    ok(
      "recon_timeout_is_lock_error",
      err && err.name === "LockTimeoutError"
    );
    ok(
      "recon_timeout_no_begin_no_rollback",
      !calls.includes("beginTransaction") && !calls.includes("rollback")
    );
    ok(
      "recon_timeout_releases_conn",
      calls.includes("release") && !calls.includes("destroy")
    );
  }

  // Mocked: release failure -> destroy
  {
    const calls = [];
    const conn = {
      async beginTransaction() {
        calls.push("beginTransaction");
      },
      async commit() {
        calls.push("commit");
      },
      async rollback() {
        calls.push("rollback");
      },
      async query(sql) {
        const s = String(sql);
        calls.push("query:" + (s.includes("FROM products") ? "products" : s.includes("seo_diagnostic") ? "seo" : "other"));
        if (/FROM products/i.test(s)) return [[], []];
        if (/FROM blog_posts/i.test(s)) return [[], []];
        if (/seo_diagnostic_issues/i.test(s)) return [[], []];
        return [[], []];
      },
      release() {
        calls.push("release");
      },
      destroy() {
        calls.push("destroy");
      },
    };
    const mod = loadTs("lib/seoIssueMemoryServer.ts", {
      "@/lib/db": {
        __esModule: true,
        default: {
          async getConnection() {
            return conn;
          },
          async query() {
            return [[], []];
          },
        },
      },
      "@/lib/namedLock": {
        LOCK_SEO_ISSUE_RECONCILE: "f4uk_seo_issue_reconcile",
        LockTimeoutError: class LockTimeoutError extends Error {
          constructor(n) {
            super(n);
            this.name = "LockTimeoutError";
          }
        },
        async acquireNamedLockOnConn() {
          calls.push("acquire");
        },
        async releaseNamedLockOnConn() {
          calls.push("releaseLock");
          return false;
        },
      },
      "@/lib/seoDiagnostics": {
        buildSeoDiagnostics: () => ({ issues: [] }),
      },
    });
    const result = await mod.reconcileSeoIssueMemory({ scope: "products" });
    ok(
      "recon_normal_shape",
      result &&
        result.scope === "products" &&
        typeof result.detectedIssues === "number" &&
        typeof result.opened === "number" &&
        typeof result.resolved === "number" &&
        Array.isArray(result.currentIssues) &&
        result.resolutionReasons &&
        typeof result.resolutionReasons.fixed === "number"
    );
    ok("recon_normal_commit", calls.includes("commit"));
    ok(
      "recon_release_fail_destroy",
      calls.includes("destroy") && !calls.includes("release")
    );
    const acq = calls.indexOf("acquire");
    const beg = calls.indexOf("beginTransaction");
    ok("recon_acquire_before_begin", acq >= 0 && beg > acq);
  }

  // Handler: LockTimeoutError -> 409 busy, no audit; other -> 500
  {
    const audits = [];
    class LockTimeoutError extends Error {
      constructor(name) {
        super(`Lock busy: ${name}`);
        this.name = "LockTimeoutError";
      }
    }
    const handlerBusy = loadTs("pages/api/admin-seo-issues/reconcile.ts", {
      "@/lib/adminAuth": {
        requireAdmin: async () => ({
          principalType: "staff",
          role: "super_admin",
          staffId: 1,
          name: "A",
        }),
      },
      "@/lib/adminPermissions": {
        hasAdminPermission: () => true,
      },
      "@/lib/adminAudit": {
        recordAdminAudit: async (a) => {
          audits.push(a);
        },
      },
      "@/lib/seoIssueMemory": {
        isValidEntityId: (v) => String(v || ""),
      },
      "@/lib/seoIssueMemoryServer": {
        reconcileSeoIssueMemory: async () => {
          throw new LockTimeoutError("f4uk_seo_issue_reconcile");
        },
      },
      "@/lib/namedLock": { LockTimeoutError },
      "@/lib/rateLimit": { getClientIp: () => "127.0.0.1" },
    });
    const resBusy = await run(handlerBusy.default, {
      method: "POST",
      body: { scope: "products" },
    });
    ok(
      "handler_busy_409",
      resBusy.statusCode === 409 &&
        resBusy.body?.code === "busy" &&
        resBusy.body?.error === "Reconcile busy"
    );
    ok("handler_busy_no_audit", audits.length === 0);

    const handlerFail = loadTs("pages/api/admin-seo-issues/reconcile.ts", {
      "@/lib/adminAuth": {
        requireAdmin: async () => ({
          principalType: "staff",
          role: "super_admin",
          staffId: 1,
          name: "A",
        }),
      },
      "@/lib/adminPermissions": {
        hasAdminPermission: () => true,
      },
      "@/lib/adminAudit": {
        recordAdminAudit: async (a) => {
          audits.push(a);
        },
      },
      "@/lib/seoIssueMemory": {
        isValidEntityId: (v) => String(v || ""),
      },
      "@/lib/seoIssueMemoryServer": {
        reconcileSeoIssueMemory: async () => {
          throw new Error("boom");
        },
      },
      "@/lib/namedLock": { LockTimeoutError },
      "@/lib/rateLimit": { getClientIp: () => "127.0.0.1" },
    });
    const resFail = await run(handlerFail.default, {
      method: "POST",
      body: { scope: "products" },
    });
    ok(
      "handler_other_500",
      resFail.statusCode === 500 &&
        resFail.body?.error === "Reconcile failed" &&
        /Authoritative diagnostic reconcile did not complete/.test(
          String(resFail.body?.message || "")
        )
    );
  }

  // postSaveSeoGuard: lock error -> unavailable
  {
    class LockTimeoutError extends Error {
      constructor(n) {
        super(n);
        this.name = "LockTimeoutError";
      }
    }
    const guard = loadTs("lib/postSaveSeoGuard.ts", {
      "@/lib/seoIssueMemoryServer": {
        reconcileSeoIssueMemory: async () => {
          throw new LockTimeoutError("f4uk_seo_issue_reconcile");
        },
      },
    });
    const r = await guard.runPostSaveSeoGuard({
      entityType: "product",
      entityId: 1,
      operation: "create",
    });
    ok(
      "guard_lock_timeout_unavailable",
      r.status === "unavailable" && r.memory_synced === false
    );
  }
}

// ─── no-forbidden-diff ─────────────────────────────────────────────────────

function runDiffAllowlist() {
  console.log("\n# no-forbidden-diff");
  const allowed = new Set([
    "lib/adminStaffPasswordTx.ts",
    "lib/namedLock.ts",
    "pages/api/admin-profile.ts",
    "pages/api/admin-staff-password.ts",
    "lib/seoIssueMemoryServer.ts",
    "pages/api/admin-seo-issues/reconcile.ts",
    "scripts/phase-multi-139-tests.js",
    // Coupled allowlist plumbing only
    "scripts/phase-multi-116-tests.js",
    "scripts/phase-multi-130-tests.js",
    "scripts/phase-multi-131-tests.js",
    "scripts/phase-multi-132-tests.js",
    "scripts/phase-multi-133-tests.js",
    "scripts/phase-multi-135-tests.js",
    "scripts/phase-multi-136-tests.js",
    "scripts/phase-multi-137-tests.js",
    "scripts/phase-multi-138-tests.js",
    // F4UK-MULTI-140: content_drafts check-only migrate + Draft/Publish design doc.
    "scripts/migrate-content-drafts.js",
    "scripts/phase-multi-140-tests.js",
    "docs/design/DRAFT-PUBLISH.md",
    // F4UK-MULTI-142: admin drafts API for CMS pages (Draft/Publish D2).
    "pages/api/admin-drafts.ts",
    "lib/contentDrafts.ts",
    "lib/contentDraftsCapability.ts",
    "scripts/phase-multi-142-tests.js",
    // F4UK-MULTI-143: Draft/Publish D3 admin UI (CmsDraftBar + client helper).
    "components/admin/CmsDraftBar.tsx",
    "lib/contentDraftClient.ts",
    "app/sidhu/page.tsx",
    "scripts/phase-multi-143-tests.js",
    // F4UK-MULTI-144: health-check network retry + capture waits for CMS load.
    "scripts/live-health-check.js",
    "scripts/tools/visible-text-capture.js",
    "scripts/phase-multi-144-tests.js",
    "scripts/phase-multi-135-tests.js",
    "scripts/phase-multi-138-tests.js",
    "scripts/phase-multi-116-tests.js",
    "scripts/phase-multi-131-tests.js",
    "scripts/phase-multi-132-tests.js",
    "scripts/phase-multi-133-tests.js",
    "scripts/phase-multi-136-tests.js",
    "scripts/phase-multi-140-tests.js",
    "scripts/phase-multi-142-tests.js",
    // F4UK-MULTI-145: health 429 warn, draft base keep, atomic staff login session.
    "lib/contentDraftClient.ts",
    "components/admin/CmsDraftBar.tsx",
    "pages/api/admin-login.ts",
    "scripts/phase-multi-145-tests.js",
    "scripts/phase-multi-143-tests.js",
    "scripts/phase-multi-144-tests.js",
    "scripts/phase-multi-130-tests.js",
    "scripts/phase-multi-135-tests.js",
    "scripts/phase-multi-137-tests.js",

    // F4UK-MULTI-146: /products H1 no duplicate + checkout optional-field tags.
    "app/products/ProductsClient.tsx",
    "lib/productsPageTitle.ts",
    "app/cart/page.tsx",
    "lib/adminContentFields.ts",
    "scripts/phase-multi-146-tests.js",
    "scripts/phase-multi-116-tests.js",
    "scripts/phase-multi-130-tests.js",
    "scripts/phase-multi-131-tests.js",
    "scripts/phase-multi-132-tests.js",
    "scripts/phase-multi-133-tests.js",
    "scripts/phase-multi-135-tests.js",
    "scripts/phase-multi-136-tests.js",
    "scripts/phase-multi-137-tests.js",
    "scripts/phase-multi-138-tests.js",
    "scripts/phase-multi-139-tests.js",
    "scripts/phase-multi-140-tests.js",
    "scripts/phase-multi-142-tests.js",
    "scripts/phase-multi-143-tests.js",
    "scripts/phase-multi-144-tests.js",
    "scripts/phase-multi-145-tests.js",

    // F4UK-MULTI-147: optional-tag dedupe, contact phone hint, PDP sticky ATC tuck.
    "lib/optionalLabel.ts",
    "app/cart/page.tsx",
    "app/contact/page.tsx",
    "app/products/[slug]/ProductDetail.tsx",
    "scripts/phase-multi-147-tests.js",
    "scripts/phase-multi-116-tests.js",
    "scripts/phase-multi-130-tests.js",
    "scripts/phase-multi-131-tests.js",
    "scripts/phase-multi-132-tests.js",
    "scripts/phase-multi-133-tests.js",
    "scripts/phase-multi-135-tests.js",
    "scripts/phase-multi-136-tests.js",
    "scripts/phase-multi-137-tests.js",
    "scripts/phase-multi-138-tests.js",
    "scripts/phase-multi-139-tests.js",
    "scripts/phase-multi-140-tests.js",
    "scripts/phase-multi-142-tests.js",
    "scripts/phase-multi-143-tests.js",
    "scripts/phase-multi-144-tests.js",
    "scripts/phase-multi-145-tests.js",
    "scripts/phase-multi-146-tests.js",

    // F4UK-MULTI-148: hydration-safe seasonal card countdown + London blog dates.
    "components/product/SeasonalCardCountdown.tsx",
    "app/blog/BlogClient.tsx",
    "app/blog/[slug]/BlogPostClient.tsx",
    "lib/blogDateFormat.ts",
    "scripts/phase-multi-148-tests.js",
    "scripts/phase-multi-116-tests.js",
    "scripts/phase-multi-130-tests.js",
    "scripts/phase-multi-131-tests.js",
    "scripts/phase-multi-132-tests.js",
    "scripts/phase-multi-133-tests.js",
    "scripts/phase-multi-135-tests.js",
    "scripts/phase-multi-136-tests.js",
    "scripts/phase-multi-137-tests.js",
    "scripts/phase-multi-138-tests.js",
    "scripts/phase-multi-139-tests.js",
    "scripts/phase-multi-140-tests.js",
    "scripts/phase-multi-142-tests.js",
    "scripts/phase-multi-143-tests.js",
    "scripts/phase-multi-144-tests.js",
    "scripts/phase-multi-145-tests.js",
    "scripts/phase-multi-146-tests.js",
    "scripts/phase-multi-147-tests.js",

    // F4UK-MULTI-149: compact mobile consent banner (presentation only).
    "components/TrackingConsent.tsx",
    "scripts/phase-multi-149-tests.js",
    "scripts/phase-multi-116-tests.js",
    "scripts/phase-multi-130-tests.js",
    "scripts/phase-multi-131-tests.js",
    "scripts/phase-multi-132-tests.js",
    "scripts/phase-multi-133-tests.js",
    "scripts/phase-multi-135-tests.js",
    "scripts/phase-multi-136-tests.js",
    "scripts/phase-multi-137-tests.js",
    "scripts/phase-multi-138-tests.js",
    "scripts/phase-multi-139-tests.js",
    "scripts/phase-multi-140-tests.js",
    "scripts/phase-multi-142-tests.js",
    "scripts/phase-multi-143-tests.js",
    "scripts/phase-multi-144-tests.js",
    "scripts/phase-multi-145-tests.js",
    "scripts/phase-multi-146-tests.js",
    "scripts/phase-multi-147-tests.js",
    "scripts/phase-multi-148-tests.js",
// F4UK-MULTI-150: product drafts (Draft/Publish D4).
    "lib/contentDrafts.ts",
    "pages/api/admin-drafts.ts",
    "pages/api/admin-products.ts",
    "components/admin/ProductDraftBar.tsx",
    "lib/productDraftClient.ts",
    "app/sidhu/page.tsx",
    "scripts/phase-multi-150-tests.js",
    "docs/design/DRAFT-PUBLISH.md",
    "scripts/phase-multi-116-tests.js",
    "scripts/phase-multi-130-tests.js",
    "scripts/phase-multi-131-tests.js",
    "scripts/phase-multi-132-tests.js",
    "scripts/phase-multi-133-tests.js",
    "scripts/phase-multi-135-tests.js",
    "scripts/phase-multi-136-tests.js",
    "scripts/phase-multi-137-tests.js",
    "scripts/phase-multi-138-tests.js",
    "scripts/phase-multi-139-tests.js",
    "scripts/phase-multi-140-tests.js",
    "scripts/phase-multi-142-tests.js",
    "scripts/phase-multi-143-tests.js",
    "scripts/phase-multi-144-tests.js",
    "scripts/phase-multi-145-tests.js",
    "scripts/phase-multi-146-tests.js",
    "scripts/phase-multi-147-tests.js",
    "scripts/phase-multi-148-tests.js",
    "scripts/phase-multi-149-tests.js",

    // F4UK-MULTI-151: draft bars stable session-expired refs (no reload on parent render).
    "components/admin/CmsDraftBar.tsx",
    "components/admin/ProductDraftBar.tsx",
    "scripts/phase-multi-151-tests.js",
    // F4UK-MULTI-153: UX fix batch B
    "app/cart/page.tsx",
    "components/product/CurrentSeasonalOffers.tsx",
    "components/HeroSlider.tsx",
    "app/faq/FAQClient.tsx",
    "app/blog/BlogClient.tsx",
    "scripts/phase-multi-153-tests.js",
    // F4UK-MULTI-154: hero active-dot hotfix
    "components/HeroSlider.tsx",
    "scripts/phase-multi-154-tests.js",
    // F4UK-MULTI-155: promo bar styles
    "lib/seasonalPromoStyle.ts",
    "components/home/SeasonalHomePromoStrip.tsx",
    "app/HomeClient.tsx",
    "app/page.tsx",
    "lib/adminContentFields.ts",
    "components/admin/AdminContentPanel.tsx",
    "scripts/phase-multi-155-tests.js",
  ]);
  const diff = spawnSync("git", ["diff", "--name-only", `${BASE}..HEAD`], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const unstaged = spawnSync("git", ["diff", "--name-only", BASE], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const status = spawnSync("git", ["status", "--porcelain"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const names = new Set();
  for (const block of [diff.stdout || "", unstaged.stdout || ""]) {
    for (const line of block.split(/\r?\n/)) {
      const t = line.trim().replace(/\\/g, "/");
      if (t) names.add(t);
    }
  }
  for (const line of (status.stdout || "").split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    const m = t.match(/^\?\?\s+(.+)$/) || t.match(/^[ MADRCU?]{1,2}\s+(.+)$/);
    if (m) names.add(m[1].replace(/\\/g, "/"));
  }
  const bad = [...names].filter((f) => !allowed.has(f));
  ok(
    "no_forbidden_diff",
    bad.length === 0,
    bad.length ? bad.join(",") : [...names].join(",") || "(clean-or-approved)"
  );
}

(async () => {
  await runPasswordTx();
  await runNamedLock();
  runPasswordSource();
  await runReconcile();
  runDiffAllowlist();
  console.log(`\nphase-multi-139: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error("FAIL  suite_exception —", e?.stack || e);
  process.exit(1);
});
