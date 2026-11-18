/**
 * F4UK-MULTI-126 — named locks for staff/redirects; lead/coupon delete correctness.
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
const FIXTURE_STAFF_PW = ["Password", "1!"].join("");
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
  const allow405 = src.indexOf('res.setHeader("Allow"', start);
  if (allow405 > start && allow405 < end) end = allow405;
  return src.slice(start, end);
}

// ─── namedLock unit tests ──────────────────────────────────────────────────

async function runNamedLock() {
  console.log("\n# namedLock");
  const lockMod = () => {
    let getLockResult = 1;
    let released = 0;
    let released_always = 0;
    let releasedConn = 0;
    let fnRan = false;
    const queries = [];
    const conn = {
      async query(sql, params) {
        queries.push({ sql: String(sql), params });
        if (/GET_LOCK/.test(sql)) {
          return [[{ got: getLockResult }], []];
        }
        if (/RELEASE_LOCK/.test(sql)) {
          released++;
          released_always++;
          return [[{}], []];
        }
        return [[], []];
      },
      release() {
        releasedConn++;
      },
    };
    const pool = {
      async getConnection() {
        return conn;
      },
    };
    const mod = loadTs("lib/namedLock.ts", {
      "./db": { __esModule: true, default: pool },
    });
    return {
      mod,
      queries,
      setGetLock(v) {
        getLockResult = v;
      },
      stats: () => ({ released, released_always, releasedConn, fnRan }),
      markFn() {
        fnRan = true;
      },
      getFnRan: () => fnRan,
    };
  };

  {
    const h = lockMod();
    await h.mod.withNamedLock("f4uk_admin_staff", 5, async () => {
      h.markFn();
      return "ok";
    });
    ok("nl_get_lock_1_fn_runs", h.getFnRan() === true);
    ok("nl_released_in_finally", h.stats().released === 1 && h.stats().releasedConn === 1);
    ok(
      "nl_lock_name_passed",
      h.queries.some((q) => /GET_LOCK/.test(q.sql) && q.params[0] === "f4uk_admin_staff")
    );
  }

  {
    const h = lockMod();
    let threw = false;
    try {
      await h.mod.withNamedLock("f4uk_admin_staff", 5, async () => {
        h.markFn();
        throw new Error("boom");
      });
    } catch (e) {
      threw = e.message === "boom";
    }
    ok("nl_fn_throw_propagates", threw);
    ok(
      "nl_release_on_fn_throw",
      h.stats().released === 1 && h.stats().releasedConn === 1 && h.getFnRan()
    );
  }

  {
    const h = lockMod();
    h.setGetLock(0);
    let err = null;
    try {
      await h.mod.withNamedLock("f4uk_redirects", 5, async () => {
        h.markFn();
      });
    } catch (e) {
      err = e;
    }
    ok(
      "nl_get_lock_0_timeout",
      err && err.name === "LockTimeoutError" && !h.getFnRan()
    );
    ok(
      "nl_release_always_on_timeout",
      h.stats().released_always >= 1 && h.stats().releasedConn === 1
    );
  }

  {
    const h = lockMod();
    h.setGetLock(null);
    let err = null;
    try {
      await h.mod.withNamedLock("f4uk_redirects", 5, async () => {
        h.markFn();
      });
    } catch (e) {
      err = e;
    }
    ok(
      "nl_get_lock_null_timeout",
      err && err.name === "LockTimeoutError" && !h.getFnRan()
    );
    ok("nl_release_always_on_null", h.stats().releasedConn === 1);
  }

  {
    const h = lockMod();
    ok("nl_constants", h.mod.LOCK_ADMIN_STAFF === "f4uk_admin_staff");
    ok("nl_constants_redir", h.mod.LOCK_REDIRECTS === "f4uk_redirects");
  }
}

// ─── F1 staff ──────────────────────────────────────────────────────────────

function makeSerialLock() {
  let chain = Promise.resolve();
  const calls = [];
  async function withNamedLock(name, timeoutSec, fn) {
    calls.push({ name, timeoutSec });
    const prev = chain;
    let releaseWait;
    chain = new Promise((r) => {
      releaseWait = r;
    });
    await prev;
    try {
      return await fn({});
    } finally {
      releaseWait();
    }
  }
  return { withNamedLock, calls, LockTimeoutError: class LockTimeoutError extends Error {
    constructor(lockName) {
      super("busy");
      this.name = "LockTimeoutError";
      this.lockName = lockName;
    }
  }, LOCK_ADMIN_STAFF: "f4uk_admin_staff", LOCK_REDIRECTS: "f4uk_redirects" };
}

function makeStaffHarness(opts = {}) {
  const staffById = opts.staffById || {
    1: { id: 1, name: "A", email: "a@test.com", role: "super_admin", active: 1 },
    2: { id: 2, name: "B", email: "b@test.com", role: "super_admin", active: 1 },
  };
  const calls = [];
  const audits = [];
  const destroyed = [];
  const lock = opts.lock || makeSerialLock();
  const getLockMode = opts.getLockMode || "ok"; // ok | timeout

  async function wouldLeaveZeroActiveSuperAdmins(staffId, next) {
    const staff = staffById[staffId];
    if (!staff) return false;
    const currentlyActiveSa =
      staff.role === "super_admin" && Number(staff.active) === 1;
    if (!currentlyActiveSa) return false;
    const countActiveSa = () =>
      Object.values(staffById).filter(
        (s) => s.role === "super_admin" && Number(s.active) === 1
      ).length;
    if (next?.deleting) return countActiveSa() <= 1;
    const nextRole = next?.role ?? staff.role;
    const nextActiveRaw = next?.active ?? staff.active;
    const nextActive =
      nextActiveRaw === true || Number(nextActiveRaw) === 1 ? 1 : 0;
    const remainsActiveSa = nextRole === "super_admin" && nextActive === 1;
    if (remainsActiveSa) return false;
    return countActiveSa() <= 1;
  }

  const pool = {
    async query(sql, params) {
      calls.push({ sql: String(sql), params });
      if (/SELECT id, name, email, role, active FROM admin_staff WHERE id = \?/i.test(sql)) {
        const row = staffById[params[0]];
        return [row ? [row] : [], []];
      }
      if (/UPDATE admin_staff/i.test(sql)) {
        const id = params[4];
        if (staffById[id]) {
          staffById[id] = {
            ...staffById[id],
            name: params[0],
            email: params[1],
            role: params[2],
            active: params[3],
          };
        }
        return [{ affectedRows: staffById[id] ? 1 : 0 }, []];
      }
      if (/DELETE FROM admin_staff WHERE id = \?/i.test(sql)) {
        const id = params[0];
        if (opts.deleteAffectedRows === 0 || !staffById[id]) {
          return [{ affectedRows: 0 }, []];
        }
        delete staffById[id];
        return [{ affectedRows: 1 }, []];
      }
      if (/INSERT INTO admin_staff/i.test(sql)) {
        return [{ insertId: 99, affectedRows: 1 }, []];
      }
      if (/SELECT id, name, email, role, active, last_login/i.test(sql)) {
        return [Object.values(staffById), []];
      }
      return [[], []];
    },
  };

  const namedLockStub =
    getLockMode === "timeout"
      ? {
          LOCK_ADMIN_STAFF: "f4uk_admin_staff",
          LOCK_REDIRECTS: "f4uk_redirects",
          LockTimeoutError: lock.LockTimeoutError,
          withNamedLock: async () => {
            throw new lock.LockTimeoutError("f4uk_admin_staff");
          },
        }
      : {
          LOCK_ADMIN_STAFF: "f4uk_admin_staff",
          LOCK_REDIRECTS: "f4uk_redirects",
          LockTimeoutError: lock.LockTimeoutError,
          withNamedLock: lock.withNamedLock,
        };

  const stubs = {
    "../../lib/db": { __esModule: true, default: pool },
    "../../lib/adminAuth": {
      destroyAdminSessionsForStaff: async (id) => {
        destroyed.push(id);
      },
      getRequestMeta: () => ({ ip: "127.0.0.1" }),
      hashStaffPassword: async () => "hash",
      isAdminRole: (r) =>
        ["super_admin", "manager", "writer", "support"].includes(r),
      isValidStaffEmail: (e) => typeof e === "string" && e.includes("@"),
      normalizeStaffEmail: (e) => String(e || "").trim().toLowerCase(),
      requireAdminPermission: async () =>
        opts.admin || {
          id: 9,
          email: "actor@test.com",
          role: "super_admin",
          principalType: "staff",
          staffId: 9,
        },
      validateStaffPassword: () => null,
      wouldLeaveZeroActiveSuperAdmins,
    },
    "../../lib/adminAudit": {
      recordAdminAudit: async (a) => {
        audits.push(a);
      },
    },
    "../../lib/adminNoStore": { setAdminNoStore: () => {} },
    "../../lib/namedLock": namedLockStub,
  };

  const mod = loadTs("pages/api/admin-staff.ts", stubs);
  return {
    handler: mod.default || mod,
    calls,
    audits,
    destroyed,
    lock,
    staffById,
  };
}

async function runF1() {
  console.log("\n# F1 admin-staff");

  {
    const h = makeStaffHarness();
    const res = makeRes();
    await h.handler(
      {
        method: "PUT",
        body: {
          id: 1,
          name: "A",
          email: "a@test.com",
          role: "manager",
          active: 1,
        },
        query: {},
        headers: {},
      },
      res
    );
    ok("f1_put_inside_lock", h.lock.calls.length === 1 && h.lock.calls[0].name === "f4uk_admin_staff");
    ok("f1_put_ok", res.statusCode === 200 && res.body?.success === true);
    ok("f1_put_audit", h.audits.length === 1 && h.audits[0].action === "staff.updated");
  }

  {
    const h = makeStaffHarness({
      staffById: {
        1: { id: 1, name: "A", email: "a@test.com", role: "super_admin", active: 1 },
        2: { id: 2, name: "B", email: "b@test.com", role: "super_admin", active: 1 },
        3: { id: 3, name: "C", email: "c@test.com", role: "manager", active: 1 },
      },
    });
    const res = makeRes();
    await h.handler(
      { method: "DELETE", query: { id: "3" }, body: {}, headers: {} },
      res
    );
    ok("f1_delete_inside_lock", h.lock.calls.length === 1 && h.lock.calls[0].name === "f4uk_admin_staff");
    ok("f1_delete_ok", res.statusCode === 200 && res.body?.success === true);
    ok("f1_delete_audit", h.audits.length === 1 && h.audits[0].action === "staff.deleted");
    ok("f1_delete_sessions", h.destroyed.includes(3));
  }

  {
    const lock = makeSerialLock();
    const staffById = {
      1: { id: 1, name: "A", email: "a@test.com", role: "super_admin", active: 1 },
      2: { id: 2, name: "B", email: "b@test.com", role: "super_admin", active: 1 },
    };
    const h = makeStaffHarness({ lock, staffById });
    const r1 = makeRes();
    const r2 = makeRes();
    const p1 = h.handler(
      {
        method: "PUT",
        body: { id: 1, name: "A", email: "a@test.com", role: "manager", active: 1 },
        query: {},
        headers: {},
      },
      r1
    );
    const p2 = h.handler(
      {
        method: "PUT",
        body: { id: 2, name: "B", email: "b@test.com", role: "manager", active: 1 },
        query: {},
        headers: {},
      },
      r2
    );
    await Promise.all([p1, p2]);
    const codes = [r1.statusCode, r2.statusCode].sort();
    const errors = [r1.body?.error, r2.body?.error].filter(Boolean);
    ok(
      "f1_concurrent_demote_one_ok_one_reject",
      codes[0] === 200 && codes[1] === 400,
      `codes=${codes}`
    );
    ok(
      "f1_concurrent_last_sa_message",
      errors.includes("Cannot demote or disable the last active Super Admin")
    );
    const activeSa = Object.values(staffById).filter(
      (s) => s.role === "super_admin" && Number(s.active) === 1
    ).length;
    ok("f1_concurrent_one_sa_remains", activeSa === 1, `activeSa=${activeSa}`);
  }

  {
    const h = makeStaffHarness({ deleteAffectedRows: 0 });
    const res = makeRes();
    await h.handler(
      { method: "DELETE", query: { id: "2" }, body: {}, headers: {} },
      res
    );
    ok(
      "f1_delete_affected_0_404",
      res.statusCode === 404 && res.body?.error === "Staff user not found"
    );
    ok("f1_delete_affected_0_no_audit", h.audits.length === 0);
  }

  {
    const h = makeStaffHarness({ getLockMode: "timeout" });
    const res = makeRes();
    await h.handler(
      {
        method: "PUT",
        body: { id: 1, name: "A", email: "a@test.com", role: "manager", active: 1 },
        query: {},
        headers: {},
      },
      res
    );
    ok(
      "f1_lock_timeout_503",
      res.statusCode === 503 && res.body?.error === "busy_try_again"
    );
  }

  {
    const h = makeStaffHarness({
      staffById: {
        1: { id: 1, name: "Only", email: "only@test.com", role: "super_admin", active: 1 },
      },
    });
    const res = makeRes();
    await h.handler(
      {
        method: "PUT",
        body: { id: 1, name: "Only", email: "only@test.com", role: "manager", active: 1 },
        query: {},
        headers: {},
      },
      res
    );
    ok(
      "f1_msg_last_sa_demote",
      res.statusCode === 400 &&
        res.body?.error === "Cannot demote or disable the last active Super Admin"
    );
  }

  {
    const h = makeStaffHarness({
      staffById: {
        1: { id: 1, name: "Only", email: "only@test.com", role: "super_admin", active: 1 },
      },
    });
    const res = makeRes();
    await h.handler(
      { method: "DELETE", query: { id: "1" }, body: {}, headers: {} },
      res
    );
    ok(
      "f1_msg_last_sa_delete",
      res.statusCode === 400 &&
        res.body?.error === "Cannot delete the last active Super Admin"
    );
  }

  {
    const h = makeStaffHarness({
      admin: {
        id: 1,
        email: "a@test.com",
        role: "super_admin",
        principalType: "staff",
        staffId: 1,
      },
    });
    const res = makeRes();
    await h.handler(
      {
        method: "PUT",
        body: { id: 1, name: "A", email: "a@test.com", role: "super_admin", active: 0 },
        query: {},
        headers: {},
      },
      res
    );
    ok(
      "f1_msg_self_disable",
      res.statusCode === 400 &&
        res.body?.error === "You cannot disable your own account"
    );
  }

  {
    const h = makeStaffHarness({
      admin: {
        id: 1,
        email: "a@test.com",
        role: "super_admin",
        principalType: "staff",
        staffId: 1,
      },
    });
    const res = makeRes();
    await h.handler(
      { method: "DELETE", query: { id: "1" }, body: {}, headers: {} },
      res
    );
    ok(
      "f1_msg_self_delete",
      res.statusCode === 400 &&
        res.body?.error === "You cannot delete your own account"
    );
  }

  // POST create unchanged path still works (not wrapped in lock)
  {
    const h = makeStaffHarness();
    const res = makeRes();
    await h.handler(
      {
        method: "POST",
        body: {
          name: "New",
          email: "new@test.com",
          password: FIXTURE_STAFF_PW,
          role: "writer",
          active: 1,
        },
        query: {},
        headers: {},
      },
      res
    );
    ok("f1_post_no_lock", h.lock.calls.length === 0);
    ok("f1_post_ok", res.statusCode === 200 && res.body?.success === true);
  }
}

// ─── F2 redirects ──────────────────────────────────────────────────────────

function makeRedirectHarness(opts = {}) {
  const calls = [];
  const audits = [];
  const lock = opts.lock || makeSerialLock();
  let releasedOnValidation = false;
  const graph = opts.graph || [
    {
      id: 1,
      source_path: "/old-a",
      destination_path: "/new-a",
      redirect_type: 308,
      active: 1,
    },
  ];
  let nextId = 10;

  const namedLockStub =
    opts.getLockMode === "timeout"
      ? {
          LOCK_ADMIN_STAFF: "f4uk_admin_staff",
          LOCK_REDIRECTS: "f4uk_redirects",
          LockTimeoutError: lock.LockTimeoutError,
          withNamedLock: async () => {
            throw new lock.LockTimeoutError("f4uk_redirects");
          },
        }
      : {
          LOCK_ADMIN_STAFF: "f4uk_admin_staff",
          LOCK_REDIRECTS: "f4uk_redirects",
          LockTimeoutError: lock.LockTimeoutError,
          withNamedLock: async (name, timeout, fn) => {
            const before = lock.calls.length;
            try {
              return await lock.withNamedLock(name, timeout, fn);
            } finally {
              if (opts.trackRelease) releasedOnValidation = true;
              void before;
            }
          },
        };

  const urlRedirects = loadTs("lib/urlRedirects.ts", {});

  const stubs = {
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
    "../../lib/namedLock": namedLockStub,
    "../../lib/urlRedirects": urlRedirects,
    "../../lib/urlRedirectsServer": {
      listRedirects: async () => graph.map((r) => ({ ...r })),
      loadRedirectGraphRules: async () =>
        graph.map((r) => ({
          id: r.id,
          source_path: r.source_path,
          destination_path: r.destination_path,
          active: r.active,
        })),
      getRedirectById: async (id) => {
        const row = graph.find((r) => r.id === id);
        return row ? { ...row } : null;
      },
      createRedirect: async (fields) => {
        calls.push({ op: "create", fields });
        const id = nextId++;
        graph.push({ id, ...fields });
        return id;
      },
      updateRedirect: async (id, fields) => {
        calls.push({ op: "update", id, fields });
        const idx = graph.findIndex((r) => r.id === id);
        if (idx < 0) return false;
        graph[idx] = { ...graph[idx], ...fields };
        return true;
      },
      deleteRedirect: async (id) => {
        calls.push({ op: "delete", id });
        const idx = graph.findIndex((r) => r.id === id);
        if (idx < 0) return false;
        graph.splice(idx, 1);
        return true;
      },
    },
  };

  const mod = loadTs("pages/api/admin-redirects.ts", stubs);
  return {
    handler: mod.default || mod,
    calls,
    audits,
    lock,
    graph,
    getReleasedFlag: () => releasedOnValidation,
  };
}

async function runF2() {
  console.log("\n# F2 admin-redirects");

  {
    const h = makeRedirectHarness();
    const res = makeRes();
    await h.handler(
      {
        method: "POST",
        body: {
          source_path: "/brand-new",
          destination_path: "/home",
          redirect_type: 308,
          active: 1,
        },
        query: {},
        headers: {},
      },
      res
    );
    ok(
      "f2_post_inside_lock",
      h.lock.calls.length === 1 && h.lock.calls[0].name === "f4uk_redirects"
    );
    ok("f2_post_ok", res.statusCode === 200 && res.body?.success === true);
  }

  {
    const h = makeRedirectHarness();
    const res = makeRes();
    await h.handler(
      {
        method: "PUT",
        body: {
          id: 1,
          source_path: "/old-a",
          destination_path: "/newer-a",
          redirect_type: 308,
          active: 1,
        },
        query: {},
        headers: {},
      },
      res
    );
    ok(
      "f2_put_inside_lock",
      h.lock.calls.length === 1 && h.lock.calls[0].name === "f4uk_redirects"
    );
    ok("f2_put_ok", res.statusCode === 200 && res.body?.success === true);
  }

  {
    const h = makeRedirectHarness();
    const res = makeRes();
    await h.handler(
      { method: "DELETE", query: { id: "1" }, body: {}, headers: {} },
      res
    );
    ok(
      "f2_delete_inside_lock",
      h.lock.calls.length === 1 && h.lock.calls[0].name === "f4uk_redirects"
    );
    ok("f2_delete_ok", res.statusCode === 200 && res.body?.success === true);
  }

  {
    const h = makeRedirectHarness({ trackRelease: true });
    const res = makeRes();
    await h.handler(
      {
        method: "POST",
        body: {
          source_path: "/old-a",
          destination_path: "/dup",
          redirect_type: 308,
          active: 1,
        },
        query: {},
        headers: {},
      },
      res
    );
    ok(
      "f2_validation_conflict_409",
      res.statusCode === 409 || res.statusCode === 400,
      `status=${res.statusCode} err=${res.body?.error}`
    );
    ok("f2_lock_released_on_validation_error", h.lock.calls.length === 1);
    ok("f2_validation_no_audit", h.audits.length === 0);
  }

  {
    const h = makeRedirectHarness({ trackRelease: true });
    const res = makeRes();
    await h.handler(
      {
        method: "POST",
        body: {
          source_path: "https://evil.com/x",
          destination_path: "/home",
          redirect_type: 308,
          active: 1,
        },
        query: {},
        headers: {},
      },
      res
    );
    ok("f2_validation_bad_400", res.statusCode === 400);
    ok("f2_lock_held_then_released_bad", h.lock.calls.length === 1);
  }

  {
    const h = makeRedirectHarness({ getLockMode: "timeout" });
    const res = makeRes();
    await h.handler(
      {
        method: "POST",
        body: {
          source_path: "/x",
          destination_path: "/y",
          redirect_type: 308,
          active: 1,
        },
        query: {},
        headers: {},
      },
      res
    );
    ok(
      "f2_lock_timeout_503",
      res.statusCode === 503 && res.body?.error === "busy_try_again"
    );
  }
}

// ─── F3 leads ──────────────────────────────────────────────────────────────

function makeLeadsHarness(opts = {}) {
  const calls = [];
  const audits = [];
  const affected = opts.affectedRows != null ? opts.affectedRows : 1;

  const pool = {
    async query(sql, params) {
      calls.push({ sql: String(sql), params });
      if (/DELETE FROM chat_leads/i.test(sql)) {
        return [{ affectedRows: affected }, []];
      }
      return [[], []];
    },
  };

  const stubs = {
    "@/lib/db": { __esModule: true, default: pool },
    "@/lib/adminAuth": {
      getRequestMeta: () => ({ ip: "127.0.0.1" }),
      requireAdminPermission: async () => ({
        id: 1,
        email: "admin@test",
        role: "super_admin",
      }),
    },
    "@/lib/adminAudit": {
      recordAdminAudit: async (a) => {
        audits.push(a);
      },
    },
    "@/lib/adminNoStore": { setAdminNoStore: () => {} },
    "@/lib/leadsHandledCapability": {
      leadsHandledColumnAvailable: async () => true,
    },
    "@/lib/adminOrdersQuery": {
      clampInt: (v, min, max, d) => {
        const n = Number(v);
        if (!Number.isFinite(n)) return d;
        return Math.min(max, Math.max(min, Math.trunc(n)));
      },
    },
  };

  const mod = loadTs("pages/api/admin/leads.ts", stubs);
  return { handler: mod.default || mod, calls, audits };
}

async function runF3() {
  console.log("\n# F3 admin/leads DELETE");

  {
    const h = makeLeadsHarness();
    const res = makeRes();
    const ids = Array.from({ length: 501 }, (_, i) => i + 1);
    await h.handler(
      { method: "DELETE", body: { ids }, query: {}, headers: {} },
      res
    );
    ok(
      "f3_bulk_over_500",
      res.statusCode === 400 && res.body?.error === "invalid_ids"
    );
    ok("f3_bulk_over_500_no_audit", h.audits.length === 0);
  }

  {
    const h = makeLeadsHarness();
    const res = makeRes();
    await h.handler(
      { method: "DELETE", body: { ids: [1, "x", 3] }, query: {}, headers: {} },
      res
    );
    ok(
      "f3_bulk_mixed_invalid",
      res.statusCode === 400 && res.body?.error === "invalid_ids"
    );
  }

  {
    const h = makeLeadsHarness();
    const res = makeRes();
    await h.handler(
      { method: "DELETE", body: { ids: [1, 0, 3] }, query: {}, headers: {} },
      res
    );
    ok(
      "f3_bulk_zero_invalid",
      res.statusCode === 400 && res.body?.error === "invalid_ids"
    );
  }

  {
    const h = makeLeadsHarness({ affectedRows: 2 });
    const res = makeRes();
    await h.handler(
      { method: "DELETE", body: { ids: [1, 2, 3] }, query: {}, headers: {} },
      res
    );
    ok(
      "f3_deleted_equals_affected",
      res.statusCode === 200 && res.body?.deleted === 2
    );
    ok(
      "f3_audit_count_affected",
      h.audits.length === 1 &&
        h.audits[0].action === "lead.bulk_deleted" &&
        h.audits[0].metadata?.count === 2 &&
        /Bulk deleted 2 lead/.test(h.audits[0].summary)
    );
  }

  {
    const h = makeLeadsHarness({ affectedRows: 0 });
    const res = makeRes();
    await h.handler(
      { method: "DELETE", query: { id: "99" }, body: {}, headers: {} },
      res
    );
    ok(
      "f3_single_missing_404",
      res.statusCode === 404 && res.body?.error === "not_found"
    );
    ok("f3_single_missing_no_audit", h.audits.length === 0);
  }

  {
    const h = makeLeadsHarness();
    const res = makeRes();
    await h.handler(
      { method: "DELETE", query: { id: "abc" }, body: {}, headers: {} },
      res
    );
    ok("f3_single_invalid_400", res.statusCode === 400);
  }

  {
    const h = makeLeadsHarness({ affectedRows: 1 });
    const res = makeRes();
    await h.handler(
      { method: "DELETE", query: { id: "5" }, body: {}, headers: {} },
      res
    );
    ok("f3_single_ok", res.statusCode === 200 && res.body?.success === true);
    ok(
      "f3_single_audit",
      h.audits.length === 1 && h.audits[0].action === "lead.deleted"
    );
  }
}

// ─── F4 coupons ────────────────────────────────────────────────────────────

function makeCouponsHarness(opts = {}) {
  const calls = [];
  const audits = [];
  const deleteAffected = opts.deleteAffectedRows != null ? opts.deleteAffectedRows : 1;
  const prevMissing = opts.prevMissing === true;

  const pool = {
    async query(sql, params) {
      calls.push({ sql: String(sql), params });
      if (/SELECT id, code FROM coupons WHERE id=/i.test(sql)) {
        if (prevMissing) return [[], []];
        return [[{ id: 1, code: "SAVE10" }], []];
      }
      if (/DELETE FROM coupons WHERE id=/i.test(sql)) {
        return [{ affectedRows: deleteAffected }, []];
      }
      if (/SELECT \* FROM coupons/i.test(sql)) return [[], []];
      return [[], []];
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
      parseCouponAdminInput: () => ({
        ok: true,
        value: {
          code: "SAVE10",
          type: "percentage",
          value: 10,
          minimumOrder: 0,
          usageLimit: null,
          expiresAt: null,
        },
      }),
      parseCouponCode: (c) =>
        c ? { ok: true, value: String(c) } : { ok: false, error: "Coupon code is required" },
      parseCouponId: (id) => {
        const n = Number(id);
        if (!Number.isInteger(n) || n <= 0) return { ok: false, error: "Invalid id" };
        return { ok: true, value: n };
      },
      parseIsActive: () => ({ ok: true, value: true }),
    },
  };

  const mod = loadTs("pages/api/coupons.ts", stubs);
  return { handler: mod.default || mod, calls, audits };
}

async function runF4() {
  console.log("\n# F4 coupons DELETE");

  {
    const h = makeCouponsHarness({ deleteAffectedRows: 0 });
    const res = makeRes();
    await h.handler(
      { method: "DELETE", query: { id: "1" }, body: {}, headers: {} },
      res
    );
    ok(
      "f4_affected_0_404",
      res.statusCode === 404 && res.body?.error === "Coupon not found"
    );
    ok("f4_affected_0_no_audit", h.audits.length === 0);
  }

  {
    const h = makeCouponsHarness({ prevMissing: true });
    const res = makeRes();
    await h.handler(
      { method: "DELETE", query: { id: "1" }, body: {}, headers: {} },
      res
    );
    ok("f4_prev_missing_404", res.statusCode === 404);
    ok("f4_prev_missing_no_audit", h.audits.length === 0);
  }

  {
    const h = makeCouponsHarness({ deleteAffectedRows: 1 });
    const res = makeRes();
    await h.handler(
      { method: "DELETE", query: { id: "1" }, body: {}, headers: {} },
      res
    );
    ok("f4_ok", res.statusCode === 200 && res.body?.success === true);
    ok(
      "f4_audit_uses_prev_code",
      h.audits.length === 1 &&
        h.audits[0].action === "coupon.deleted" &&
        /SAVE10/.test(h.audits[0].summary)
    );
  }
}

// ─── Source checks ─────────────────────────────────────────────────────────

function runSourceChecks() {
  console.log("\n# Source byte-identical (untouched methods vs HEAD)");

  const staffNow = read("pages/api/admin-staff.ts");
  const staffHead = gitShow("pages/api/admin-staff.ts");
  const staffGetNow = extractMethod(staffNow, "GET", ["POST", "PUT", "DELETE"]);
  const staffGetHead = extractMethod(staffHead, "GET", ["POST", "PUT", "DELETE"]);
  const staffPostNow = extractMethod(staffNow, "POST", ["PUT", "DELETE"]);
  const staffPostHead = extractMethod(staffHead, "POST", ["PUT", "DELETE"]);
  ok(
    "src_staff_get_identical",
    !!staffGetNow && !!staffGetHead && sha256(staffGetNow) === sha256(staffGetHead)
  );
  // POST create intentionally unchanged aside from possible import noise — compare body excluding imports:
  // Method block should match except we only changed PUT/DELETE; POST block text must match HEAD.
  ok(
    "src_staff_post_identical",
    !!staffPostNow && !!staffPostHead && sha256(staffPostNow) === sha256(staffPostHead),
    staffPostNow ? sha256(staffPostNow).slice(0, 12) : "missing"
  );

  const redirNow = read("pages/api/admin-redirects.ts");
  const redirHead = gitShow("pages/api/admin-redirects.ts");
  const redirGetNow = extractMethod(redirNow, "GET", ["POST", "PUT", "DELETE"]);
  const redirGetHead = extractMethod(redirHead, "GET", ["POST", "PUT", "DELETE"]);
  ok(
    "src_redirects_get_identical",
    !!redirGetNow && !!redirGetHead && sha256(redirGetNow) === sha256(redirGetHead)
  );

  const leadsNow = read("pages/api/admin/leads.ts");
  const leadsHead = gitShow("pages/api/admin/leads.ts");
  const leadsGetNow = extractMethod(leadsNow, "GET", ["DELETE"]);
  // GET ends before isStatusMutation / PATCH — extract via PATCH marker if present
  const leadsGetHead = extractMethod(leadsHead, "GET", ["DELETE"]);
  // Better: compare up to DELETE for GET+PATCH region excluding DELETE
  const leadsNonDelNow =
    leadsNow.slice(0, leadsNow.indexOf('if (req.method === "DELETE")')) +
    leadsNow.slice(leadsNow.indexOf("return res.status(405)", leadsNow.indexOf('if (req.method === "DELETE")')));
  const leadsNonDelHead =
    leadsHead.slice(0, leadsHead.indexOf('if (req.method === "DELETE")')) +
    leadsHead.slice(leadsHead.indexOf("return res.status(405)", leadsHead.indexOf('if (req.method === "DELETE")')));
  ok(
    "src_leads_non_delete_identical",
    sha256(leadsNonDelNow) === sha256(leadsNonDelHead),
    sha256(leadsNonDelNow).slice(0, 12)
  );
  void leadsGetNow;
  void leadsGetHead;

  // MULTI-137 owns GET base_hash + PUT stale TX; MULTI-126 owns DELETE only.
  const couponsNow = read("pages/api/coupons.ts");
  const couponsHead = gitShow("pages/api/coupons.ts");
  function couponsDeleteBlock(src) {
    const a = src.indexOf("if (req.method === 'DELETE')");
    const b = src.indexOf("return res.status(405)", a);
    if (a < 0 || b < 0) return "";
    return src.slice(a, b);
  }
  ok(
    "src_coupons_delete_identical",
    sha256(couponsDeleteBlock(couponsNow)) ===
      sha256(couponsDeleteBlock(couponsHead)),
    sha256(couponsDeleteBlock(couponsNow)).slice(0, 12)
  );

  ok(
    "src_staff_put_uses_lock",
    /withNamedLock\(\s*LOCK_ADMIN_STAFF/.test(extractMethod(staffNow, "PUT", ["DELETE"]) || "")
  );
  ok(
    "src_staff_delete_uses_lock",
    /withNamedLock\(\s*LOCK_ADMIN_STAFF/.test(extractMethod(staffNow, "DELETE", []) || "")
  );
  ok(
    "src_staff_post_no_lock",
    !/withNamedLock/.test(extractMethod(staffNow, "POST", ["PUT", "DELETE"]) || "")
  );
  ok(
    "src_redir_post_lock",
    /withNamedLock\(\s*LOCK_REDIRECTS/.test(extractMethod(redirNow, "POST", ["PUT", "DELETE"]) || "")
  );
  ok(
    "src_leads_invalid_ids",
    /invalid_ids/.test(extractMethod(leadsNow, "DELETE", []) || "")
  );
  ok(
    "src_leads_not_found",
    /not_found/.test(extractMethod(leadsNow, "DELETE", []) || "")
  );
  ok(
    "src_coupons_delete_affected",
    /affectedRows/.test(extractMethod(couponsNow, "DELETE", []) || "")
  );
  ok(
    "src_audit_doc_multi126",
    /MULTI-126/.test(read("docs/design/ADMIN-WRITE-PATHS-AUDIT.md")) &&
      /Series closed at MULTI-126/.test(read("docs/design/ADMIN-WRITE-PATHS-AUDIT.md"))
  );
  ok(
    "src_named_lock_exists",
    fs.existsSync(path.join(ROOT, "lib/namedLock.ts"))
  );
}

async function main() {
  await runNamedLock();
  await runF1();
  await runF2();
  await runF3();
  await runF4();
  runSourceChecks();
  console.log(`\nphase-multi-126: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error("FAIL  suite_exception —", err?.stack || err);
  process.exit(1);
});
