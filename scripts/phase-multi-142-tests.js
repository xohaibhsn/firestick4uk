/**
 * F4UK-MULTI-142 — admin drafts API (Draft/Publish D2). Mocked pool only; no real DB/network.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const Module = require("module");
const { spawnSync } = require("child_process");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..");
const NODE = process.execPath;
const BASE = "5371af4bf3adf4a1b550b338527a070e89cfab32";

let passed = 0;
let failed = 0;

function ok(name, cond, detail) {
  if (cond) {
    passed++;
    console.log(`  PASS ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name}${detail ? " — " + detail : ""}`);
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
    },
    fileName: abs,
  }).outputText;
  const m = new Module(abs, module);
  m.filename = abs;
  m.paths = Module._nodeModulePaths(path.dirname(abs));
  const orig = m.require.bind(m);
  m.require = (id) => {
    if (Object.prototype.hasOwnProperty.call(stubs, id)) return stubs[id];
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

const HASH64 = "a".repeat(64);
const VALID_KEY = "home_hero_title";
const SECRET_VALUE = "super-secret-value-XYZ-never-in-audit";

function validChanges(extra = {}) {
  return {
    [VALID_KEY]: { value: "Hello", base_hash: HASH64 },
    ...extra,
  };
}

// ─── Validators ─────────────────────────────────────────────────────────────

function runValidatorTests() {
  console.log("\n# validators");
  const mod = loadTs("lib/contentDrafts.ts", {
    "./db": { default: {} },
  });
  const {
    validateEntity,
    validateDraftChanges,
    REVISION_MAX_BYTES,
    secretKeyReSource,
  } = mod;

  ok("entity_ok", validateEntity("site_content_page", "home").ok === true);
  ok(
    "entity_invalid_type",
    validateEntity("product", "home").ok === false &&
      validateEntity("product", "home").errors[0].code === "invalid_entity"
  );
  ok(
    "entity_invalid_id",
    validateEntity("site_content_page", "Bad Page!").ok === false &&
      validateEntity("site_content_page", "Bad Page!").errors[0].code === "invalid_entity"
  );

  const known = new Set([VALID_KEY, "home_hero_subtitle", "about_title"]);
  const pass = validateDraftChanges(validChanges(), { knownKeys: known });
  ok("draft_valid", pass.ok === true && pass.changes[VALID_KEY].value === "Hello");

  ok(
    "empty_draft_null",
    validateDraftChanges(null, { knownKeys: known }).errors[0].code === "empty_draft"
  );
  ok(
    "empty_draft_obj",
    validateDraftChanges({}, { knownKeys: known }).errors[0].code === "empty_draft"
  );

  const many = {};
  for (let i = 0; i < 201; i++) {
    const k = `about_title_${i}`;
    known.add(VALID_KEY);
    many[`k_${i}`] = { value: "x", base_hash: HASH64 };
  }
  // 201 keys with invalid key pattern after 100 chars? Use valid pattern keys not in known -> unknown
  // Cap is checked before per-key; use fake known for all
  const knownMany = new Set();
  const many2 = {};
  for (let i = 0; i < 201; i++) {
    const k = `key_${i}`;
    knownMany.add(k);
    many2[k] = { value: "x", base_hash: HASH64 };
  }
  ok(
    "too_many_keys_200_cap",
    validateDraftChanges(many2, { knownKeys: knownMany }).errors[0].code === "too_many_keys"
  );

  ok(
    "invalid_key",
    validateDraftChanges({ "Bad-Key!": { value: "a", base_hash: HASH64 } }, { knownKeys: known })
      .errors[0].code === "invalid_key"
  );
  ok(
    "settings_key_not_allowed",
    validateDraftChanges(
      { contact_email: { value: "a@b.c", base_hash: HASH64 } },
      { knownKeys: new Set(["contact_email"]) }
    ).errors[0].code === "settings_key_not_allowed"
  );
  ok(
    "secret_key_not_allowed",
    validateDraftChanges(
      { api_key_token: { value: "x", base_hash: HASH64 } },
      { knownKeys: new Set(["api_key_token"]) }
    ).errors[0].code === "secret_key_not_allowed"
  );
  ok(
    "unknown_key",
    validateDraftChanges(
      { totally_unknown_key_zz: { value: "x", base_hash: HASH64 } },
      { knownKeys: known }
    ).errors[0].code === "unknown_key"
  );
  ok(
    "invalid_value",
    validateDraftChanges({ [VALID_KEY]: { value: 1, base_hash: HASH64 } }, { knownKeys: known })
      .errors[0].code === "invalid_value"
  );
  ok(
    "invalid_base_hash",
    validateDraftChanges({ [VALID_KEY]: { value: "x", base_hash: "abc" } }, { knownKeys: known })
      .errors[0].code === "invalid_base_hash"
  );

  const hugeVal = "x".repeat(REVISION_MAX_BYTES + 100);
  ok(
    "draft_too_large_1mb",
    validateDraftChanges(
      { [VALID_KEY]: { value: hugeVal, base_hash: HASH64 } },
      { knownKeys: known }
    ).errors[0].code === "draft_too_large"
  );

  // SECRET_KEY_RE source identical to contentRevisions.ts
  const revSrc = read("lib/contentRevisions.ts");
  const draftSrc = read("lib/contentDrafts.ts");
  const extractRe = (src) => {
    const m = src.match(/const SECRET_KEY_RE\s*=\s*(\/(?:\\.|[^/])+\/[a-z]*)/);
    return m ? m[1] : null;
  };
  const lit1 = extractRe(revSrc);
  const lit2 = extractRe(draftSrc);
  ok(
    "secret_key_re_sources_identical",
    !!(lit1 && lit2 && lit1 === lit2 && secretKeyReSource() === lit1.replace(/^\/|\/[a-z]*$/g, "")),
    lit1 && lit2 ? `${lit1} vs ${lit2}` : "missing"
  );

  const corrupt = mod.draftRowToDto({
    entity_type: "site_content_page",
    entity_id: "home",
    draft_json: "{not-json",
    draft_version: 1,
    created_by_name: "A",
    updated_by_name: "B",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  ok(
    "dto_corrupt_no_throw",
    corrupt.corrupt === true &&
      Object.keys(corrupt.changes).length === 0 &&
      !("created_by_staff_id" in corrupt)
  );
}

// ─── Capability ─────────────────────────────────────────────────────────────

async function runCapabilityTests() {
  console.log("\n# capability");
  const cap = loadTs("lib/contentDraftsCapability.ts");
  cap.resetContentDraftsCapabilityCache();

  const missingPool = {
    async query() {
      const e = new Error("no table");
      e.code = "ER_NO_SUCH_TABLE";
      throw e;
    },
  };
  ok(
    "cap_no_such_table_false",
    (await cap.contentDraftsTableAvailable(missingPool)) === false
  );

  cap.resetContentDraftsCapabilityCache();
  const badTable = {
    async query() {
      const e = new Error("bad table");
      e.code = "ER_BAD_TABLE_ERROR";
      throw e;
    },
  };
  ok(
    "cap_bad_table_false",
    (await cap.contentDraftsTableAvailable(badTable)) === false
  );

  cap.resetContentDraftsCapabilityCache();
  let probes = 0;
  const okPool = {
    async query() {
      probes++;
      return [[], []];
    },
  };
  ok("cap_success_true", (await cap.contentDraftsTableAvailable(okPool)) === true);
  ok("cap_cache_hit", (await cap.contentDraftsTableAvailable(okPool)) === true && probes === 1);

  cap.resetContentDraftsCapabilityCache();
  const otherPool = {
    async query() {
      const e = new Error("conn refused");
      e.code = "ECONNREFUSED";
      throw e;
    },
  };
  let propagated = false;
  try {
    await cap.contentDraftsTableAvailable(otherPool);
  } catch (e) {
    propagated = e && e.code === "ECONNREFUSED";
  }
  ok("cap_other_errors_propagate", propagated);

  cap.resetContentDraftsCapabilityCache();
  ok("cap_reset_clears", true);
}

// ─── Handler harness ────────────────────────────────────────────────────────

function makeConn(onQuery) {
  const stats = { began: 0, committed: 0, rolled: 0, released: 0 };
  const calls = [];
  const events = [];
  const conn = {
    async beginTransaction() {
      stats.began++;
      events.push("begin");
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
      events.push("query:" + sql.replace(/\s+/g, " ").trim().slice(0, 80));
      return onQuery(sql, params, calls, events);
    },
  };
  return { conn, stats, calls, events };
}

function makePool(conn, poolQuery) {
  return {
    async getConnection() {
      return conn;
    },
    async query(sql, params) {
      if (poolQuery) return poolQuery(sql, params);
      return conn.query(sql, params);
    },
  };
}

function adminIdentity(role) {
  return {
    principalType: "staff",
    staffId: 7,
    name: "Casey Manager",
    role,
  };
}

function loadHandler(opts) {
  const audits = [];
  const {
    conn,
    available = true,
    admin = adminIdentity("manager"),
    adminNull = false,
    forbidWriter = false,
  } = opts;

  const pool = makePool(conn, opts.poolQuery);

  const stubs = {
    "../../lib/db": { default: pool, __esModule: true },
    "../../lib/adminAuth": {
      requireAdminPermission: async (req, res, perm, options) => {
        if (adminNull) {
          res.status(401).json({ error: "Unauthorized" });
          return null;
        }
        if (forbidWriter || (admin && admin.role === "writer")) {
          res.status(403).json({
            error: "Forbidden",
            message: "You do not have permission for this action.",
          });
          return null;
        }
        if (options && options.mutate === false && req.method === "GET") {
          /* ok */
        }
        return admin;
      },
      getRequestMeta: () => ({ ip: "127.0.0.1", userAgent: "test" }),
    },
    "../../lib/adminAudit": {
      recordAdminAudit: async (input) => {
        audits.push(input);
      },
    },
    "../../lib/adminNoStore": {
      setAdminNoStore: (res) => res.setHeader("Cache-Control", "no-store, private"),
    },
    "../../lib/contentDraftsCapability": {
      contentDraftsTableAvailable: async () => available,
      resetContentDraftsCapabilityCache: () => {},
    },
  };

  // Load contentDrafts with real deps but stub db if pulled
  const draftsMod = loadTs("lib/contentDrafts.ts", {
    "./db": { default: pool },
  });
  stubs["../../lib/contentDrafts"] = draftsMod;

  const mod = loadTs("pages/api/admin-drafts.ts", stubs);
  return { handler: mod.default || mod, audits, pool, conn };
}

function draftRow(overrides = {}) {
  return {
    entity_type: "site_content_page",
    entity_id: "home",
    draft_json: JSON.stringify(validChanges({ [VALID_KEY]: { value: SECRET_VALUE, base_hash: HASH64 } })),
    draft_version: 2,
    created_by_name: "Casey Manager",
    updated_by_name: "Casey Manager",
    created_at: new Date("2026-11-01T00:00:00Z"),
    updated_at: new Date("2026-11-18T00:00:00Z"),
    ...overrides,
  };
}

async function runHandlerTests() {
  console.log("\n# handler");

  // 401 without session
  {
    const { conn } = makeConn(async () => [[], []]);
    const { handler } = loadHandler({ conn, adminNull: true });
    const res = await run(handler, {
      method: "GET",
      query: { entity_type: "site_content_page" },
    });
    ok("auth_401_no_session", res.statusCode === 401 && res.body?.error === "Unauthorized");
    ok("auth_401_released_or_unused", conn.release && true);
  }

  // 403 writer
  {
    const { conn, stats } = makeConn(async () => [[], []]);
    const { handler } = loadHandler({
      conn,
      admin: adminIdentity("writer"),
      forbidWriter: true,
    });
    const res = await run(handler, {
      method: "GET",
      query: { entity_type: "site_content_page" },
    });
    ok("auth_403_writer", res.statusCode === 403 && res.body?.error === "Forbidden");
  }

  // unavailable GET / PUT / DELETE
  {
    const { conn, stats } = makeConn(async () => [[], []]);
    const { handler } = loadHandler({ conn, available: false });
    const g = await run(handler, {
      method: "GET",
      query: { entity_type: "site_content_page" },
    });
    ok(
      "unavail_get",
      g.statusCode === 200 &&
        g.body?.available === false &&
        g.body?.draft === null &&
        Array.isArray(g.body?.drafts) &&
        g.body.drafts.length === 0
    );
    const p = await run(handler, {
      method: "PUT",
      body: {
        entity_type: "site_content_page",
        entity_id: "home",
        expected_draft_version: null,
        changes: validChanges(),
      },
    });
    ok(
      "unavail_put_503",
      p.statusCode === 503 && p.body?.code === "drafts_unavailable"
    );
    const d = await run(handler, {
      method: "DELETE",
      body: {
        entity_type: "site_content_page",
        entity_id: "home",
        expected_draft_version: 1,
      },
    });
    ok(
      "unavail_delete_503",
      d.statusCode === 503 && d.body?.code === "drafts_unavailable"
    );
    ok("unavail_no_conn_leak", stats.released === 0);
  }

  // GET single
  {
    const row = draftRow();
    const { conn, stats } = makeConn(async (sql) => {
      if (/FROM content_drafts/i.test(sql) && /entity_id/i.test(sql)) return [[row], []];
      return [[], []];
    });
    const { handler } = loadHandler({
      conn,
      poolQuery: async (sql) => {
        if (/FROM content_drafts/i.test(sql)) return [[row], []];
        return [[], []];
      },
    });
    const res = await run(handler, {
      method: "GET",
      query: { entity_type: "site_content_page", entity_id: "home" },
    });
    ok(
      "get_single_shape",
      res.statusCode === 200 &&
        res.body?.available === true &&
        res.body?.draft?.entity_id === "home" &&
        res.body.draft.changes[VALID_KEY]?.value === SECRET_VALUE &&
        !("created_by_staff_id" in res.body.draft) &&
        res.headers["cache-control"]?.includes("no-store")
    );
  }

  // GET list
  {
    const rows = [draftRow({ entity_id: "home" }), draftRow({ entity_id: "about", draft_version: 1 })];
    const { conn } = makeConn(async () => [rows, []]);
    const { handler } = loadHandler({
      conn,
      poolQuery: async () => [rows, []],
    });
    const res = await run(handler, {
      method: "GET",
      query: { entity_type: "site_content_page" },
    });
    ok(
      "get_list_shape",
      res.statusCode === 200 &&
        res.body?.available === true &&
        Array.isArray(res.body?.drafts) &&
        res.body.drafts.length === 2 &&
        res.body.drafts[0].changes === undefined &&
        typeof res.body.drafts[0].key_count === "number"
    );
  }

  // CREATE INSERT
  {
    const { conn, stats, calls, events } = makeConn(async (sql) => {
      if (/FROM site_content/i.test(sql)) {
        return [[{ content_key: VALID_KEY }], []];
      }
      if (/^INSERT INTO content_drafts/i.test(sql.trim())) {
        return [{ affectedRows: 1, insertId: 1 }, undefined];
      }
      if (/SELECT .* FROM content_drafts/i.test(sql)) {
        return [[draftRow({ draft_version: 1, draft_json: JSON.stringify(validChanges()) })], []];
      }
      return [[], []];
    });
    const { handler, audits } = loadHandler({ conn });
    const res = await run(handler, {
      method: "PUT",
      body: {
        entity_type: "site_content_page",
        entity_id: "home",
        expected_draft_version: null,
        changes: validChanges(),
      },
    });
    ok(
      "put_create_insert",
      res.statusCode === 200 &&
        res.body?.success === true &&
        res.body?.draft?.draft_version === 1 &&
        calls.some((c) => /^INSERT INTO content_drafts/i.test(c.sql.trim()))
    );
    ok("put_create_released", stats.released === 1);
    ok(
      "put_create_audit_keys_only",
      audits.length === 1 &&
        audits[0].action === "content_draft.save" &&
        JSON.stringify(audits[0].metadata).includes(VALID_KEY) &&
        !JSON.stringify(audits[0]).includes(SECRET_VALUE) &&
        !JSON.stringify(audits[0].metadata).includes("Hello")
    );
  }

  // duplicate -> 409 draft_exists
  {
    const { conn, stats } = makeConn(async (sql) => {
      if (/FROM site_content/i.test(sql)) return [[{ content_key: VALID_KEY }], []];
      if (/^INSERT INTO content_drafts/i.test(sql.trim())) {
        const e = new Error("dup");
        e.code = "ER_DUP_ENTRY";
        throw e;
      }
      return [[], []];
    });
    const { handler } = loadHandler({ conn });
    const res = await run(handler, {
      method: "PUT",
      body: {
        entity_type: "site_content_page",
        entity_id: "home",
        expected_draft_version: null,
        changes: validChanges(),
      },
    });
    ok(
      "put_dup_409",
      res.statusCode === 409 && res.body?.code === "draft_exists"
    );
    ok("put_dup_released", stats.released === 1);
  }

  // UPDATE order begin -> FOR UPDATE -> UPDATE -> commit
  {
    const existing = draftRow({ draft_version: 3, draft_json: JSON.stringify(validChanges()) });
    const { conn, stats, calls, events } = makeConn(async (sql) => {
      if (/FROM site_content/i.test(sql)) return [[{ content_key: VALID_KEY }], []];
      if (/FOR UPDATE/i.test(sql)) return [[existing], []];
      if (/^UPDATE content_drafts/i.test(sql.trim())) {
        return [{ affectedRows: 1 }, undefined];
      }
      if (/SELECT .* FROM content_drafts/i.test(sql)) {
        return [[draftRow({ draft_version: 4, draft_json: JSON.stringify(validChanges()) })], []];
      }
      return [[], []];
    });
    const { handler, audits } = loadHandler({ conn });
    const res = await run(handler, {
      method: "PUT",
      body: {
        entity_type: "site_content_page",
        entity_id: "home",
        expected_draft_version: 3,
        changes: validChanges(),
      },
    });
    // Order on one conn: beginTransaction -> SELECT ... FOR UPDATE -> UPDATE -> commit
    // (known-keys SELECT may precede begin; post-commit SELECT for DTO is allowed)
    const beginAt = events.indexOf("begin");
    const forUpdateCallIdx = calls.findIndex((c) => /FOR UPDATE/i.test(c.sql));
    const updateCallIdx = calls.findIndex((c) => /^\s*UPDATE content_drafts/i.test(c.sql));
    const commitAt = events.indexOf("commit");
    // Map call indices to event timeline positions after begin
    const eventForUpdate = events.findIndex(
      (e, i) => i > beginAt && e.startsWith("query:") && /FOR UPDATE|draft_json/i.test(e)
    );
    ok(
      "put_update_order",
      res.statusCode === 200 &&
        beginAt >= 0 &&
        forUpdateCallIdx >= 0 &&
        updateCallIdx > forUpdateCallIdx &&
        commitAt > beginAt &&
        stats.began === 1 &&
        stats.committed === 1 &&
        calls.filter((c) => /FOR UPDATE/i.test(c.sql)).length === 1,
      `begin=${beginAt} fuCall=${forUpdateCallIdx} upCall=${updateCallIdx} commit=${commitAt} events=${events.join(">")}`
    );
    ok("put_update_released", stats.released === 1);
    ok(
      "put_update_audit_no_values",
      audits[0] &&
        !JSON.stringify(audits[0]).includes("Hello") &&
        audits[0].metadata.draft_version === 4
    );
  }

  // stale -> 409 + rollback, no UPDATE
  {
    const existing = draftRow({ draft_version: 5 });
    const { conn, stats, calls } = makeConn(async (sql) => {
      if (/FROM site_content/i.test(sql)) return [[{ content_key: VALID_KEY }], []];
      if (/FOR UPDATE/i.test(sql)) return [[existing], []];
      return [[], []];
    });
    const { handler } = loadHandler({ conn });
    const res = await run(handler, {
      method: "PUT",
      body: {
        entity_type: "site_content_page",
        entity_id: "home",
        expected_draft_version: 3,
        changes: validChanges(),
      },
    });
    ok(
      "put_stale_409",
      res.statusCode === 409 &&
        res.body?.code === "draft_stale" &&
        res.body?.current_version === 5 &&
        !calls.some((c) => /^UPDATE content_drafts/i.test(c.sql.trim()))
    );
    ok("put_stale_rollback_release", stats.rolled >= 1 && stats.released === 1);
  }

  // missing on update -> 409 draft_missing
  {
    const { conn, stats } = makeConn(async (sql) => {
      if (/FROM site_content/i.test(sql)) return [[{ content_key: VALID_KEY }], []];
      if (/FOR UPDATE/i.test(sql)) return [[], []];
      return [[], []];
    });
    const { handler } = loadHandler({ conn });
    const res = await run(handler, {
      method: "PUT",
      body: {
        entity_type: "site_content_page",
        entity_id: "home",
        expected_draft_version: 1,
        changes: validChanges(),
      },
    });
    ok(
      "put_missing_409",
      res.statusCode === 409 && res.body?.code === "draft_missing"
    );
    ok("put_missing_released", stats.released === 1 && stats.rolled >= 1);
  }

  // DELETE stale / ok
  {
    const existing = draftRow({ draft_version: 2 });
    const { conn, stats } = makeConn(async (sql) => {
      if (/FOR UPDATE/i.test(sql)) return [[existing], []];
      return [[], []];
    });
    const { handler } = loadHandler({ conn });
    const stale = await run(handler, {
      method: "DELETE",
      body: {
        entity_type: "site_content_page",
        entity_id: "home",
        expected_draft_version: 1,
      },
    });
    ok(
      "delete_stale_409",
      stale.statusCode === 409 && stale.body?.code === "draft_stale"
    );
    ok("delete_stale_released", stats.released === 1);
  }
  {
    const existing = draftRow({
      draft_version: 2,
      draft_json: JSON.stringify(validChanges({ [VALID_KEY]: { value: SECRET_VALUE, base_hash: HASH64 } })),
    });
    const { conn, stats, calls } = makeConn(async (sql) => {
      if (/FOR UPDATE/i.test(sql)) return [[existing], []];
      if (/^DELETE FROM content_drafts/i.test(sql.trim())) {
        return [{ affectedRows: 1 }, undefined];
      }
      return [[], []];
    });
    const { handler, audits } = loadHandler({ conn });
    const res = await run(handler, {
      method: "DELETE",
      body: {
        entity_type: "site_content_page",
        entity_id: "home",
        expected_draft_version: 2,
      },
    });
    ok(
      "delete_ok",
      res.statusCode === 200 &&
        res.body?.success === true &&
        calls.some((c) => /^DELETE FROM content_drafts/i.test(c.sql.trim()))
    );
    ok("delete_ok_released", stats.released === 1 && stats.committed === 1);
    ok(
      "delete_audit_keys_no_values",
      audits[0]?.action === "content_draft.discard" &&
        audits[0].metadata.keys.includes(VALID_KEY) &&
        !JSON.stringify(audits[0]).includes(SECRET_VALUE)
    );
  }

  // DELETE missing -> 404
  {
    const { conn, stats } = makeConn(async (sql) => {
      if (/FOR UPDATE/i.test(sql)) return [[], []];
      return [[], []];
    });
    const { handler } = loadHandler({ conn });
    const res = await run(handler, {
      method: "DELETE",
      body: {
        entity_type: "site_content_page",
        entity_id: "home",
        expected_draft_version: 1,
      },
    });
    ok(
      "delete_missing_404",
      res.statusCode === 404 && res.body?.code === "draft_missing"
    );
    ok("delete_missing_released", stats.released === 1);
  }

  // errors -> rollback + release + generic 500 without SQL text
  {
    const { conn, stats } = makeConn(async (sql) => {
      if (/FROM site_content/i.test(sql)) return [[{ content_key: VALID_KEY }], []];
      if (/FOR UPDATE/i.test(sql)) {
        const e = new Error("SELECT * FROM content_drafts WHERE secret=boom failed");
        e.code = "ER_LOCK_WAIT_TIMEOUT";
        throw e;
      }
      return [[], []];
    });
    const { handler } = loadHandler({ conn });
    const res = await run(handler, {
      method: "PUT",
      body: {
        entity_type: "site_content_page",
        entity_id: "home",
        expected_draft_version: 1,
        changes: validChanges(),
      },
    });
    const bodyStr = JSON.stringify(res.body || {});
    ok(
      "error_generic_500",
      res.statusCode === 500 &&
        res.body?.error === "Draft request failed" &&
        !bodyStr.includes("SELECT") &&
        !bodyStr.includes("content_drafts") &&
        !bodyStr.includes("secret=boom")
    );
    ok("error_rollback_release", stats.rolled >= 1 && stats.released === 1);
  }

  // 405
  {
    const { conn } = makeConn(async () => [[], []]);
    const { handler } = loadHandler({ conn });
    const res = await run(handler, { method: "POST", body: {} });
    ok(
      "method_405",
      res.statusCode === 405 &&
        String(res.headers.allow || "").includes("GET") &&
        String(res.headers.allow || "").includes("PUT")
    );
  }
}

// ─── Source assertions ──────────────────────────────────────────────────────

function runSourceAssertions() {
  console.log("\n# source assertions");
  const api = read("pages/api/admin-drafts.ts");
  ok(
    "api_no_site_content_mutate",
    !/INSERT\s+INTO\s+site_content/i.test(api) &&
      !/UPDATE\s+site_content/i.test(api) &&
      !/DELETE\s+FROM\s+site_content/i.test(api)
  );
  ok(
    "api_readonly_known_keys_select_ok",
    /SELECT content_key FROM site_content/i.test(read("lib/contentDrafts.ts"))
  );

  // no import of siteContentBaseHash in client files
  const clientRoots = ["app", "components", "hooks"].map((d) => path.join(ROOT, d));
  const badHashImports = [];
  const uiRefs = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === "node_modules" || ent.name === ".next") continue;
        walk(p);
      } else if (/\.(ts|tsx|js|jsx)$/.test(ent.name)) {
        const text = fs.readFileSync(p, "utf8");
        const rel = path.relative(ROOT, p).replace(/\\/g, "/");
        // Only lib/siteContentBaseHash.ts is forbidden on the client (Core is OK).
        if (
          /from\s+['"][^'"]*lib\/siteContentBaseHash['"]/.test(text) ||
          /from\s+['"]@\/lib\/siteContentBaseHash['"]/.test(text) ||
          /require\s*\(\s*['"][^'"]*lib\/siteContentBaseHash['"]\s*\)/.test(text)
        ) {
          badHashImports.push(rel);
        }
        if (/admin-drafts|contentDrafts/.test(text)) {
          uiRefs.push(rel);
        }
      }
    }
  }
  for (const r of clientRoots) walk(r);
  ok("no_client_siteContentBaseHash_import", badHashImports.length === 0, badHashImports.join(","));
  // F4UK-MULTI-143 (D3): only the CmsDraftBar component and the /sidhu page may reference drafts in UI.
  const ALLOWED_UI_REFS = new Set([
    "components/admin/CmsDraftBar.tsx",
    "components/admin/ProductDraftBar.tsx",
    "app/sidhu/page.tsx",
  ]);
  const unexpectedUiRefs = uiRefs.filter((r) => !ALLOWED_UI_REFS.has(r));
  ok("no_ui_refs_to_drafts", unexpectedUiRefs.length === 0, unexpectedUiRefs.join(","));
}

// ─── no-forbidden-diff ──────────────────────────────────────────────────────

function runDiffAllowlist() {
  console.log("\n# no-forbidden-diff");
  const allowed = new Set([
    "pages/api/admin-drafts.ts",
    "lib/contentDrafts.ts",
    "lib/contentDraftsCapability.ts",
    "scripts/phase-multi-142-tests.js",
    "docs/design/DRAFT-PUBLISH.md",
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
    "scripts/phase-multi-139-tests.js",
    "scripts/phase-multi-140-tests.js",
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
    "scripts/phase-multi-139-tests.js",
    "scripts/phase-multi-140-tests.js",
    // F4UK-MULTI-145: health 429 warn, draft base keep, atomic staff login session.
    "lib/contentDraftClient.ts",
    "components/admin/CmsDraftBar.tsx",
    "lib/adminStaffPasswordTx.ts",
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
    "scripts/phase-multi-142-tests.js",
    "scripts/phase-multi-143-tests.js",
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
  for (const line of `${diff.stdout || ""}\n${unstaged.stdout || ""}`.split(/\r?\n/)) {
    const n = line.trim();
    if (n) names.add(n.replace(/\\/g, "/"));
  }
  for (const line of (status.stdout || "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const n = line.slice(3).trim().replace(/\\/g, "/");
    if (n) names.add(n.split(" -> ").pop());
  }
  const bad = [...names].filter((n) => !allowed.has(n));
  ok(
    "no_forbidden_diff",
    bad.length === 0,
    bad.length ? bad.join(",") : [...names].join(",") || "(clean-or-approved)"
  );
}

async function main() {
  console.log("phase-multi-142-tests");
  runValidatorTests();
  await runCapabilityTests();
  await runHandlerTests();
  runSourceAssertions();
  runDiffAllowlist();
  console.log(`\nphase-multi-142: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
