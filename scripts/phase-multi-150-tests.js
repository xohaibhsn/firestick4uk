/**
 * F4UK-MULTI-150 — Product drafts (Draft/Publish D4).
 *
 * Covers: validateProductDraft, site_content_page validator/DTO byte-identity vs BASE,
 * admin-drafts handler (product entity + per-entity permission), admin-products PUT
 * publish_draft (same-TX best-effort DELETE), ProductDraftBar source, /sidhu page wiring,
 * and the no-forbidden-diff allowlist.
 *
 * Mocked pool/conn/fetch only; never a real DB or network.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const Module = require("module");
const { createHash } = require("crypto");
const { spawnSync } = require("child_process");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..");
const BASE = "da2d1951aab6129ca3a29baf906bd785675e9748";

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

function norm(s) {
  return String(s).replace(/\r\n/g, "\n");
}

function sha256(s) {
  return createHash("sha256").update(String(s), "utf8").digest("hex");
}

function gitShow(ref, rel) {
  const r = spawnSync("git", ["show", `${ref}:${rel}`], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error(r.stderr || "git show failed");
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
    if (id.startsWith("./") || id.startsWith("../") || id.startsWith("@/")) {
      let resolved;
      if (id.startsWith("@/")) resolved = path.join(ROOT, id.slice(2));
      else resolved = path.normalize(path.join(path.dirname(abs), id));
      for (const candidate of [resolved, resolved + ".ts", resolved + ".tsx", resolved + ".js"]) {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
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
      events.push("query:" + sql.replace(/\s+/g, " ").trim().slice(0, 90));
      return onQuery(sql, params, calls, events);
    },
  };
  return { conn, stats, calls, events };
}

// ─── 1. validateProductDraft ────────────────────────────────────────────────

const EXPECTED_KEYS = [
  "name",
  "slug",
  "category",
  "price",
  "stock",
  "image",
  "short_description",
  "full_description",
  "features",
  "seo_title",
  "meta_description",
  "focus_keyword",
  "og_image",
];

function runProductValidatorTests() {
  console.log("\n# validateProductDraft");
  const mod = loadTs("lib/contentDrafts.ts", { "./db": { default: {} } });
  const { validateProductDraft, PRODUCT_DRAFT_FIELD_KEYS, REVISION_MAX_BYTES } = mod;

  const code = (r) => (r && r.ok === false && r.errors && r.errors[0] ? r.errors[0].code : null);
  const key = (r) => (r && r.ok === false && r.errors && r.errors[0] ? r.errors[0].key : undefined);

  // allowlist
  ok("allowlist_13_keys", Array.isArray(PRODUCT_DRAFT_FIELD_KEYS) && PRODUCT_DRAFT_FIELD_KEYS.length === 13);
  ok(
    "allowlist_exact_keys",
    JSON.stringify([...PRODUCT_DRAFT_FIELD_KEYS].sort()) === JSON.stringify([...EXPECTED_KEYS].sort()),
    PRODUCT_DRAFT_FIELD_KEYS.join(",")
  );
  ok("max_bytes_is_1mb", REVISION_MAX_BYTES === 1024 * 1024);

  // client allowlist matches server allowlist
  {
    let clientKeys = null;
    try {
      clientKeys = loadTs("lib/productDraftClient.ts").PRODUCT_DRAFT_FIELD_KEYS;
    } catch (e) {
      clientKeys = null;
    }
    ok(
      "client_allowlist_matches_server",
      Array.isArray(clientKeys) &&
        JSON.stringify([...clientKeys]) === JSON.stringify([...PRODUCT_DRAFT_FIELD_KEYS])
    );
  }

  // every key individually accepted
  {
    let allOk = true;
    for (const k of EXPECTED_KEYS) {
      const r = validateProductDraft({ fields: { [k]: "v" }, base_version: 1 });
      if (!(r.ok === true && r.changes.fields[k] === "v")) allOk = false;
    }
    ok("each_allowlisted_key_accepted", allOk);
  }

  // all 13 together
  {
    const fields = {};
    for (const k of EXPECTED_KEYS) fields[k] = `v_${k}`;
    const r = validateProductDraft({ fields, base_version: 7 });
    ok(
      "all_13_fields_accepted",
      r.ok === true && Object.keys(r.changes.fields).length === 13 && r.changes.base_version === 7
    );
  }

  // happy path subset
  {
    const r = validateProductDraft({ fields: { name: "New name", price: "12.50" }, base_version: 3 });
    ok(
      "happy_subset",
      r.ok === true &&
        JSON.stringify(r.changes) ===
          JSON.stringify({ fields: { name: "New name", price: "12.50" }, base_version: 3 })
    );
  }
  ok(
    "happy_base_version_zero",
    validateProductDraft({ fields: { name: "x" }, base_version: 0 }).ok === true
  );
  ok(
    "empty_string_value_ok",
    validateProductDraft({ fields: { seo_title: "" }, base_version: 1 }).ok === true
  );

  // unknown_field
  {
    const top = validateProductDraft({ fields: { name: "x" }, base_version: 1, extra: 1 });
    ok("unknown_field_top_level", code(top) === "unknown_field" && key(top) === "extra");
    const nested = validateProductDraft({ fields: { nope: "x" }, base_version: 1 });
    ok("unknown_field_in_fields", code(nested) === "unknown_field" && key(nested) === "nope");
    for (const bad of [
      "active",
      "id",
      "description",
      "badge",
      "product_version",
      "lifecycle_mode",
      "shop_listed",
      "season_name",
      "action",
      "__proto__x",
    ]) {
      const r = validateProductDraft({ fields: { [bad]: "x" }, base_version: 1 });
      ok(`unknown_field_rejects_${bad}`, code(r) === "unknown_field" && key(r) === bad);
    }
    const proto = JSON.parse('{"fields":{"__proto__":"x"},"base_version":1}');
    ok("unknown_field_proto_own_key", code(validateProductDraft(proto)) === "unknown_field");
  }

  // invalid_value
  {
    for (const [label, input] of [
      ["null", null],
      ["undefined", undefined],
      ["string", "nope"],
      ["number", 5],
      ["array", []],
      ["null_proto", Object.assign(Object.create(null), { fields: {}, base_version: 1 })],
    ]) {
      ok(`invalid_value_root_${label}`, code(validateProductDraft(input)) === "invalid_value");
    }
    for (const [label, fields] of [
      ["null", null],
      ["missing", undefined],
      ["array", []],
      ["string", "x"],
      ["null_proto", Object.assign(Object.create(null), { name: "x" })],
    ]) {
      const body = { base_version: 1 };
      if (fields !== undefined) body.fields = fields;
      ok(`invalid_value_fields_${label}`, code(validateProductDraft(body)) === "invalid_value");
    }
    for (const [label, v] of [
      ["number", 12],
      ["null", null],
      ["boolean", true],
      ["object", {}],
      ["array", ["a"]],
    ]) {
      const r = validateProductDraft({ fields: { price: v }, base_version: 1 });
      ok(`invalid_value_field_${label}`, code(r) === "invalid_value" && key(r) === "price");
    }
  }

  // invalid_base_version
  {
    const cases = [
      ["missing", undefined],
      ["float", 1.5],
      ["negative", -1],
      ["string", "3"],
      ["null", null],
      ["nan", NaN],
      ["infinity", Infinity],
      ["boolean", true],
      ["object", {}],
    ];
    for (const [label, v] of cases) {
      const body = { fields: { name: "x" } };
      if (v !== undefined) body.base_version = v;
      ok(`invalid_base_version_${label}`, code(validateProductDraft(body)) === "invalid_base_version");
    }
    ok(
      "base_version_large_int_ok",
      validateProductDraft({ fields: { name: "x" }, base_version: 2147483647 }).ok === true
    );
  }

  // draft_too_large — exact 1 MB boundary
  {
    const overhead = Buffer.byteLength(
      JSON.stringify({ fields: { name: "" }, base_version: 0 }),
      "utf8"
    );
    const atCap = "x".repeat(REVISION_MAX_BYTES - overhead);
    const atRes = validateProductDraft({ fields: { name: atCap }, base_version: 0 });
    ok("size_exactly_cap_ok", atRes.ok === true);
    const overRes = validateProductDraft({ fields: { name: atCap + "x" }, base_version: 0 });
    ok("draft_too_large_one_byte_over", code(overRes) === "draft_too_large");
    const hugeRes = validateProductDraft({
      fields: { full_description: "y".repeat(REVISION_MAX_BYTES + 100) },
      base_version: 1,
    });
    ok("draft_too_large_huge", code(hugeRes) === "draft_too_large");
    // multi-byte counted in bytes not chars
    const mb = "é".repeat(Math.floor(REVISION_MAX_BYTES / 2) + 1);
    ok(
      "draft_too_large_counts_utf8_bytes",
      code(validateProductDraft({ fields: { features: mb }, base_version: 1 })) === "draft_too_large"
    );
  }

  // DTO for product rows
  {
    const dto = mod.draftRowToDto({
      entity_type: "product",
      entity_id: "1",
      draft_json: JSON.stringify({ fields: { name: "A", slug: "a" }, base_version: 2 }),
      draft_version: 3,
      created_by_name: "A",
      updated_by_name: "B",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    ok(
      "product_dto_shape",
      dto.entity_type === "product" &&
        dto.changes.base_version === 2 &&
        dto.changes.fields.name === "A" &&
        dto.key_count === 2 &&
        !dto.corrupt &&
        !("created_by_staff_id" in dto)
    );
    const bad = mod.draftRowToDto({
      entity_type: "product",
      entity_id: "1",
      draft_json: "{broken",
      draft_version: 1,
      created_by_name: "A",
      updated_by_name: "B",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    ok(
      "product_dto_corrupt_no_throw",
      bad.corrupt === true && bad.key_count === 0 && Object.keys(bad.changes.fields).length === 0
    );
    const badFields = mod.draftRowToDto({
      entity_type: "product",
      entity_id: "1",
      draft_json: JSON.stringify({ fields: { evil: "x" }, base_version: 1 }),
      draft_version: 1,
      created_by_name: "A",
      updated_by_name: "B",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    ok("product_dto_unknown_field_corrupt", badFields.corrupt === true);
  }
}

// ─── 2. site_content_page validators/DTO byte-identical ─────────────────────

function extractFn(src, name) {
  const lines = norm(src).split("\n");
  const re = new RegExp(`^(export\\s+)?(async\\s+)?function\\s+${name}\\b`);
  const start = lines.findIndex((l) => re.test(l));
  if (start < 0) return null;
  let end = -1;
  for (let i = start; i < lines.length; i++) {
    if (lines[i] === "}") {
      end = i;
      break;
    }
  }
  if (end < 0) return null;
  return lines.slice(start, end + 1).join("\n");
}

function runPageValidatorIdentity() {
  console.log("\n# site_content_page validators/DTO byte-identical vs BASE");
  const cur = read("lib/contentDrafts.ts");
  let base = null;
  try {
    base = gitShow(BASE, "lib/contentDrafts.ts");
  } catch (e) {
    base = null;
  }
  ok("base_contentDrafts_readable", !!base);

  for (const fn of ["validateDraftChangesEarly", "validateDraftChanges", "parseDraftJson", "loadKnownKeys"]) {
    const a = extractFn(cur, fn);
    const b = base ? extractFn(base, fn) : null;
    ok(`${fn}_extracted`, !!a && !!b);
    ok(
      `${fn}_sha256_identical`,
      !!a && !!b && sha256(a) === sha256(b),
      a && b ? `cur=${sha256(a).slice(0, 12)} base=${sha256(b).slice(0, 12)}` : "missing"
    );
  }

  const mod = loadTs("lib/contentDrafts.ts", { "./db": { default: {} } });
  ok(
    "DRAFT_ENTITY_TYPES_both",
    Array.isArray(mod.DRAFT_ENTITY_TYPES) &&
      mod.DRAFT_ENTITY_TYPES.includes("site_content_page") &&
      mod.DRAFT_ENTITY_TYPES.includes("product")
  );
  const e1 = mod.validateEntity("site_content_page", "home");
  ok("validateEntity_page_home", e1.ok === true && e1.entity_type === "site_content_page");
  const e2 = mod.validateEntity("product", "1");
  ok("validateEntity_product_1", e2.ok === true && e2.entity_type === "product" && e2.entity_id === "1");
  const e3 = mod.validateEntity("product", "home");
  ok("validateEntity_product_home_invalid", e3.ok === false && e3.errors[0].code === "invalid_entity");
  for (const badId of ["0", "01", "-1", "1.5", "12345678901", ""]) {
    const r = mod.validateEntity("product", badId);
    ok(`validateEntity_product_rejects_${JSON.stringify(badId)}`, r.ok === false);
  }

  // Behavioural: site_content_page DTO unchanged shape
  const HASH64 = "a".repeat(64);
  const dto = mod.draftRowToDto({
    entity_type: "site_content_page",
    entity_id: "home",
    draft_json: JSON.stringify({ home_hero_title: { value: "Hi", base_hash: HASH64 } }),
    draft_version: 2,
    created_by_name: "A",
    updated_by_name: "B",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  ok(
    "page_dto_shape_unchanged",
    dto.changes.home_hero_title.value === "Hi" &&
      dto.changes.home_hero_title.base_hash === HASH64 &&
      dto.key_count === 1 &&
      !dto.corrupt
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
  ok("page_dto_corrupt_no_throw", corrupt.corrupt === true && Object.keys(corrupt.changes).length === 0);
}

// ─── 3. admin-drafts handler ────────────────────────────────────────────────

const VALID_KEY = "home_hero_title";
const HASH64 = "a".repeat(64);
const SECRET_VALUE = "super-secret-product-value-XYZ-never-in-audit";

const ROLE_PERMS = {
  manager: ["products.manage", "content.manage"],
  writer: [],
  // products.manage only: proves content.manage is independently required for pages.
  catalog: ["products.manage"],
  // content.manage only: proves products.manage is independently required for products.
  copywriter: ["content.manage"],
};

function identity(role) {
  return { principalType: "staff", staffId: 7, name: "Casey Manager", role };
}

function loadDraftsHandler(opts) {
  const audits = [];
  const permCalls = [];
  const { conn, available = true, admin = identity("manager"), adminNull = false } = opts;

  const pool = {
    async getConnection() {
      return conn;
    },
    async query(sql, params) {
      if (opts.poolQuery) return opts.poolQuery(sql, params);
      return conn.query(sql, params);
    },
  };

  const draftsMod = loadTs("lib/contentDrafts.ts", { "./db": { default: pool } });

  const stubs = {
    "../../lib/db": { default: pool, __esModule: true },
    "../../lib/adminAuth": {
      requireAdminPermission: async (req, res, perm, options) => {
        permCalls.push({ perm, options });
        if (adminNull) {
          res.status(401).json({ error: "Unauthorized" });
          return null;
        }
        const allowed = ROLE_PERMS[admin && admin.role] || [];
        if (!allowed.includes(perm)) {
          res.status(403).json({
            error: "Forbidden",
            message: "You do not have permission for this action.",
          });
          return null;
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
    "../../lib/contentDrafts": draftsMod,
  };

  const mod = loadTs("pages/api/admin-drafts.ts", stubs);
  return { handler: mod.default || mod, audits, permCalls, pool, conn };
}

function productDraftRow(overrides = {}) {
  return {
    entity_type: "product",
    entity_id: "1",
    draft_json: JSON.stringify({ fields: { name: SECRET_VALUE, price: "9.99" }, base_version: 3 }),
    draft_version: 2,
    created_by_name: "Casey Manager",
    updated_by_name: "Casey Manager",
    created_at: new Date("2026-11-01T00:00:00Z"),
    updated_at: new Date("2026-11-18T00:00:00Z"),
    ...overrides,
  };
}

function pageDraftRow(overrides = {}) {
  return {
    entity_type: "site_content_page",
    entity_id: "home",
    draft_json: JSON.stringify({ [VALID_KEY]: { value: "Hello", base_hash: HASH64 } }),
    draft_version: 2,
    created_by_name: "Casey Manager",
    updated_by_name: "Casey Manager",
    created_at: new Date("2026-11-01T00:00:00Z"),
    updated_at: new Date("2026-11-18T00:00:00Z"),
    ...overrides,
  };
}

function productChanges(extra = {}) {
  return { fields: { name: SECRET_VALUE, seo_title: "Another secret title" }, base_version: 3, ...extra };
}

async function runDraftsHandlerTests() {
  console.log("\n# admin-drafts handler (product + permissions)");

  // AdminPermission type import exists and is satisfied
  {
    const src = read("pages/api/admin-drafts.ts");
    const perms = read("lib/adminPermissions.ts");
    ok(
      "imports_AdminPermission_type",
      /import\s+type\s*\{\s*AdminPermission\s*\}\s*from\s*["']\.\.\/\.\.\/lib\/adminPermissions["']/.test(src)
    );
    ok(
      "adminPermissions_exports_type_with_both_perms",
      /export type AdminPermission\b/.test(perms) &&
        /"products\.manage"/.test(perms) &&
        /"content\.manage"/.test(perms)
    );
    ok(
      "perm_mapping_in_source",
      /entityType === "product" \? "products\.manage" : "content\.manage"/.test(src)
    );
  }

  // 401 no session (product + page)
  for (const type of ["product", "site_content_page"]) {
    const { conn, stats } = makeConn(async () => [[], []]);
    const { handler } = loadDraftsHandler({ conn, adminNull: true });
    const res = await run(handler, { method: "GET", query: { entity_type: type } });
    ok(`auth_401_${type}`, res.statusCode === 401 && res.body?.error === "Unauthorized" && stats.released === 0);
  }

  // Permission argument passed per entity
  {
    const { conn } = makeConn(async () => [[], []]);
    const h = loadDraftsHandler({
      conn,
      poolQuery: async () => [[], []],
    });
    await run(h.handler, { method: "GET", query: { entity_type: "product" } });
    await run(h.handler, { method: "GET", query: { entity_type: "site_content_page" } });
    ok(
      "perm_arg_product_is_products_manage",
      h.permCalls[0] && h.permCalls[0].perm === "products.manage" && h.permCalls[0].options?.mutate === false
    );
    ok(
      "perm_arg_page_is_content_manage",
      h.permCalls[1] && h.permCalls[1].perm === "content.manage" && h.permCalls[1].options?.mutate === false
    );
    await run(h.handler, {
      method: "PUT",
      body: { entity_type: "product", entity_id: "1", expected_draft_version: null, changes: { bad: 1 } },
    });
    ok(
      "perm_arg_mutate_true_on_put",
      h.permCalls[2] && h.permCalls[2].perm === "products.manage" && h.permCalls[2].options?.mutate === true
    );
  }

  // 403 matrix: writer → 403 on both; no DB touched
  for (const [role, type, expected] of [
    ["writer", "product", 403],
    ["writer", "site_content_page", 403],
    ["catalog", "site_content_page", 403], // products.manage alone does not unlock pages
    ["copywriter", "product", 403], // content.manage alone does not unlock products
  ]) {
    for (const method of ["GET", "PUT", "DELETE"]) {
      const { conn, stats, calls } = makeConn(async () => [[], []]);
      const { handler } = loadDraftsHandler({ conn, admin: identity(role) });
      const req =
        method === "GET"
          ? { method, query: { entity_type: type, entity_id: type === "product" ? "1" : "home" } }
          : {
              method,
              body: {
                entity_type: type,
                entity_id: type === "product" ? "1" : "home",
                expected_draft_version: method === "PUT" ? null : 1,
                changes: type === "product" ? productChanges() : { [VALID_KEY]: { value: "x", base_hash: HASH64 } },
              },
            };
      const res = await run(handler, req);
      ok(
        `auth_${expected}_${role}_${type}_${method}`,
        res.statusCode === expected &&
          res.body?.error === "Forbidden" &&
          calls.length === 0 &&
          stats.released === 0 &&
          stats.began === 0
      );
    }
  }

  // Manager OK for both entity types (GET list)
  for (const type of ["product", "site_content_page"]) {
    const { conn } = makeConn(async () => [[], []]);
    const { handler } = loadDraftsHandler({ conn, poolQuery: async () => [[], []] });
    const res = await run(handler, { method: "GET", query: { entity_type: type } });
    ok(
      `manager_ok_get_list_${type}`,
      res.statusCode === 200 && res.body?.available === true && Array.isArray(res.body?.drafts)
    );
  }
  // catalog role OK for product, copywriter OK for page
  {
    const { conn } = makeConn(async () => [[], []]);
    const a = loadDraftsHandler({ conn, admin: identity("catalog"), poolQuery: async () => [[], []] });
    const ra = await run(a.handler, { method: "GET", query: { entity_type: "product" } });
    ok("products_manage_only_ok_product", ra.statusCode === 200);
    const b = loadDraftsHandler({ conn, admin: identity("copywriter"), poolQuery: async () => [[], []] });
    const rb = await run(b.handler, { method: "GET", query: { entity_type: "site_content_page" } });
    ok("content_manage_only_ok_page", rb.statusCode === 200);
  }

  // invalid entity → 400 before auth
  {
    const { conn } = makeConn(async () => [[], []]);
    const h = loadDraftsHandler({ conn });
    const res = await run(h.handler, { method: "GET", query: { entity_type: "bogus" } });
    ok("invalid_entity_type_400_before_auth", res.statusCode === 400 && h.permCalls.length === 0);
    const res2 = await run(h.handler, {
      method: "PUT",
      body: { entity_type: "product", entity_id: "home", expected_draft_version: null, changes: productChanges() },
    });
    ok("product_bad_id_400", res2.statusCode === 400 && res2.body?.code === "invalid_entity");
  }

  // unavailable
  {
    const { conn, stats } = makeConn(async () => [[], []]);
    const { handler } = loadDraftsHandler({ conn, available: false });
    const g = await run(handler, { method: "GET", query: { entity_type: "product", entity_id: "1" } });
    ok("product_unavail_get", g.statusCode === 200 && g.body?.available === false && g.body?.draft === null);
    const p = await run(handler, {
      method: "PUT",
      body: { entity_type: "product", entity_id: "1", expected_draft_version: null, changes: productChanges() },
    });
    ok("product_unavail_put_503", p.statusCode === 503 && p.body?.code === "drafts_unavailable");
    ok("product_unavail_no_conn", stats.released === 0);
  }

  // GET single product
  {
    const row = productDraftRow();
    const { conn } = makeConn(async () => [[row], []]);
    const { handler } = loadDraftsHandler({
      conn,
      poolQuery: async (sql) => (/FROM content_drafts/i.test(sql) ? [[row], []] : [[], []]),
    });
    const res = await run(handler, {
      method: "GET",
      query: { entity_type: "product", entity_id: "1" },
    });
    ok(
      "product_get_single",
      res.statusCode === 200 &&
        res.body?.available === true &&
        res.body?.draft?.entity_type === "product" &&
        res.body.draft.changes.base_version === 3 &&
        res.body.draft.changes.fields.name === SECRET_VALUE &&
        !("created_by_staff_id" in res.body.draft) &&
        String(res.headers["cache-control"] || "").includes("no-store")
    );
    const none = loadDraftsHandler({ conn, poolQuery: async () => [[], []] });
    const r2 = await run(none.handler, {
      method: "GET",
      query: { entity_type: "product", entity_id: "1" },
    });
    ok("product_get_single_none_null", r2.statusCode === 200 && r2.body?.draft === null);
  }

  // GET list product → summaries (no changes)
  {
    const rows = [productDraftRow({ entity_id: "1" }), productDraftRow({ entity_id: "2", draft_version: 1 })];
    const { conn } = makeConn(async () => [rows, []]);
    const { handler } = loadDraftsHandler({ conn, poolQuery: async () => [rows, []] });
    const res = await run(handler, { method: "GET", query: { entity_type: "product" } });
    ok(
      "product_get_list_summaries",
      res.statusCode === 200 &&
        res.body.drafts.length === 2 &&
        res.body.drafts[0].changes === undefined &&
        res.body.drafts[0].key_count === 2
    );
  }

  // PUT create product
  {
    const { conn, stats, calls } = makeConn(async (sql) => {
      if (/SELECT id FROM products/i.test(sql)) return [[{ id: 1 }], []];
      if (/^\s*INSERT INTO content_drafts/i.test(sql)) return [{ affectedRows: 1, insertId: 1 }, undefined];
      if (/FROM content_drafts/i.test(sql)) {
        return [[productDraftRow({ draft_version: 1, draft_json: JSON.stringify(productChanges()) })], []];
      }
      return [[], []];
    });
    const { handler, audits } = loadDraftsHandler({ conn });
    const res = await run(handler, {
      method: "PUT",
      body: { entity_type: "product", entity_id: "1", expected_draft_version: null, changes: productChanges() },
    });
    const insert = calls.find((c) => /^\s*INSERT INTO content_drafts/i.test(c.sql));
    ok(
      "product_put_create",
      res.statusCode === 200 &&
        res.body?.success === true &&
        res.body?.draft?.draft_version === 1 &&
        !!insert &&
        insert.params[0] === "product" &&
        insert.params[1] === "1"
    );
    ok("product_put_create_released", stats.released === 1);
    ok("product_put_create_no_products_write", !calls.some((c) => /(INSERT INTO|UPDATE|DELETE FROM)\s+products/i.test(c.sql)));
    const auditStr = JSON.stringify(audits);
    ok(
      "product_audit_field_names_only",
      audits.length === 1 &&
        audits[0].action === "content_draft.save" &&
        audits[0].entityId === "product:1" &&
        Array.isArray(audits[0].metadata.keys) &&
        audits[0].metadata.keys.includes("name") &&
        audits[0].metadata.keys.includes("seo_title") &&
        !auditStr.includes(SECRET_VALUE) &&
        !auditStr.includes("Another secret title") &&
        !JSON.stringify(audits[0].metadata).includes(SECRET_VALUE)
    );
  }

  // product_missing 404 on PUT create + update
  for (const expected of [null, 3]) {
    const { conn, stats, calls } = makeConn(async (sql) => {
      if (/SELECT id FROM products/i.test(sql)) return [[], []];
      return [[], []];
    });
    const { handler, audits } = loadDraftsHandler({ conn });
    const res = await run(handler, {
      method: "PUT",
      body: { entity_type: "product", entity_id: "1", expected_draft_version: expected, changes: productChanges() },
    });
    ok(
      `product_missing_404_expected_${expected}`,
      res.statusCode === 404 &&
        res.body?.code === "product_missing" &&
        stats.released === 1 &&
        !calls.some((c) => /content_drafts/i.test(c.sql)) &&
        audits.length === 0
    );
  }

  // duplicate create → 409 draft_exists
  {
    const { conn, stats } = makeConn(async (sql) => {
      if (/SELECT id FROM products/i.test(sql)) return [[{ id: 1 }], []];
      if (/^\s*INSERT INTO content_drafts/i.test(sql)) {
        const e = new Error("dup");
        e.code = "ER_DUP_ENTRY";
        throw e;
      }
      return [[], []];
    });
    const { handler } = loadDraftsHandler({ conn });
    const res = await run(handler, {
      method: "PUT",
      body: { entity_type: "product", entity_id: "1", expected_draft_version: null, changes: productChanges() },
    });
    ok("product_put_dup_409", res.statusCode === 409 && res.body?.code === "draft_exists" && stats.released === 1);
  }

  // PUT update product: begin → FOR UPDATE → UPDATE → commit
  {
    const existing = productDraftRow({ draft_version: 3 });
    const { conn, stats, calls, events } = makeConn(async (sql) => {
      if (/SELECT id FROM products/i.test(sql)) return [[{ id: 1 }], []];
      if (/FOR UPDATE/i.test(sql)) return [[existing], []];
      if (/^\s*UPDATE content_drafts/i.test(sql)) return [{ affectedRows: 1 }, undefined];
      if (/FROM content_drafts/i.test(sql)) {
        return [[productDraftRow({ draft_version: 4, draft_json: JSON.stringify(productChanges()) })], []];
      }
      return [[], []];
    });
    const { handler, audits } = loadDraftsHandler({ conn });
    const res = await run(handler, {
      method: "PUT",
      body: { entity_type: "product", entity_id: "1", expected_draft_version: 3, changes: productChanges() },
    });
    const beginAt = events.indexOf("begin");
    const fuAt = calls.findIndex((c) => /FOR UPDATE/i.test(c.sql));
    const upAt = calls.findIndex((c) => /^\s*UPDATE content_drafts/i.test(c.sql));
    ok(
      "product_put_update_order",
      res.statusCode === 200 &&
        beginAt >= 0 &&
        fuAt >= 0 &&
        upAt > fuAt &&
        events.indexOf("commit") > beginAt &&
        stats.began === 1 &&
        stats.committed === 1 &&
        stats.released === 1 &&
        res.body?.draft?.draft_version === 4,
      events.join(">")
    );
    ok(
      "product_put_update_audit_no_values",
      audits.length === 1 &&
        audits[0].metadata.draft_version === 4 &&
        !JSON.stringify(audits).includes(SECRET_VALUE)
    );
  }

  // stale 409 on product PUT update
  {
    const existing = productDraftRow({ draft_version: 5 });
    const { conn, stats, calls } = makeConn(async (sql) => {
      if (/SELECT id FROM products/i.test(sql)) return [[{ id: 1 }], []];
      if (/FOR UPDATE/i.test(sql)) return [[existing], []];
      return [[], []];
    });
    const { handler, audits } = loadDraftsHandler({ conn });
    const res = await run(handler, {
      method: "PUT",
      body: { entity_type: "product", entity_id: "1", expected_draft_version: 3, changes: productChanges() },
    });
    ok(
      "product_put_stale_409",
      res.statusCode === 409 &&
        res.body?.code === "draft_stale" &&
        res.body?.current_version === 5 &&
        !calls.some((c) => /^\s*UPDATE content_drafts/i.test(c.sql)) &&
        stats.rolled >= 1 &&
        stats.released === 1 &&
        audits.length === 0
    );
  }

  // product update when draft row missing → 409 draft_missing
  {
    const { conn, stats } = makeConn(async (sql) => {
      if (/SELECT id FROM products/i.test(sql)) return [[{ id: 1 }], []];
      return [[], []];
    });
    const { handler } = loadDraftsHandler({ conn });
    const res = await run(handler, {
      method: "PUT",
      body: { entity_type: "product", entity_id: "1", expected_draft_version: 1, changes: productChanges() },
    });
    ok("product_put_update_missing_409", res.statusCode === 409 && res.body?.code === "draft_missing" && stats.released === 1);
  }

  // invalid product shapes → 400 before any connection
  for (const [label, changes, code] of [
    ["unknown_field", { fields: { active: "1" }, base_version: 1 }, "unknown_field"],
    ["unknown_top", { fields: {}, base_version: 1, extra: 1 }, "unknown_field"],
    ["invalid_value", { fields: { name: 5 }, base_version: 1 }, "invalid_value"],
    ["invalid_base_version", { fields: { name: "x" }, base_version: 1.5 }, "invalid_base_version"],
    ["missing_base_version", { fields: { name: "x" } }, "invalid_base_version"],
    ["page_shaped_payload", { home_hero_title: { value: "x", base_hash: HASH64 } }, "unknown_field"],
  ]) {
    const { conn, stats, calls } = makeConn(async () => [[], []]);
    const { handler } = loadDraftsHandler({ conn });
    const res = await run(handler, {
      method: "PUT",
      body: { entity_type: "product", entity_id: "1", expected_draft_version: null, changes },
    });
    ok(
      `product_put_400_${label}`,
      res.statusCode === 400 && res.body?.code === code && calls.length === 0 && stats.released === 0
    );
  }
  {
    const { conn, calls } = makeConn(async () => [[], []]);
    const { handler } = loadDraftsHandler({ conn });
    const res = await run(handler, {
      method: "PUT",
      body: {
        entity_type: "product",
        entity_id: "1",
        expected_draft_version: null,
        changes: { fields: { full_description: "z".repeat(1024 * 1024 + 10) }, base_version: 1 },
      },
    });
    ok("product_put_400_draft_too_large", res.statusCode === 400 && res.body?.code === "draft_too_large" && calls.length === 0);
  }

  // DELETE product happy + audit
  {
    const existing = productDraftRow({ draft_version: 2 });
    const { conn, stats, calls } = makeConn(async (sql) => {
      if (/FOR UPDATE/i.test(sql)) return [[existing], []];
      if (/^\s*DELETE FROM content_drafts/i.test(sql)) return [{ affectedRows: 1 }, undefined];
      return [[], []];
    });
    const { handler, audits } = loadDraftsHandler({ conn });
    const res = await run(handler, {
      method: "DELETE",
      body: { entity_type: "product", entity_id: "1", expected_draft_version: 2 },
    });
    const del = calls.find((c) => /^\s*DELETE FROM content_drafts/i.test(c.sql));
    ok(
      "product_delete_ok",
      res.statusCode === 200 &&
        res.body?.success === true &&
        !!del &&
        del.params[0] === "product" &&
        del.params[1] === "1" &&
        stats.committed === 1 &&
        stats.released === 1
    );
    const auditStr = JSON.stringify(audits);
    ok(
      "product_delete_audit_field_names_only",
      audits[0]?.action === "content_draft.discard" &&
        audits[0].metadata.keys.includes("name") &&
        audits[0].metadata.keys.includes("price") &&
        !auditStr.includes(SECRET_VALUE) &&
        !auditStr.includes("9.99")
    );
  }
  // DELETE product stale / missing
  {
    const existing = productDraftRow({ draft_version: 4 });
    const { conn, stats } = makeConn(async (sql) => {
      if (/FOR UPDATE/i.test(sql)) return [[existing], []];
      return [[], []];
    });
    const { handler } = loadDraftsHandler({ conn });
    const res = await run(handler, {
      method: "DELETE",
      body: { entity_type: "product", entity_id: "1", expected_draft_version: 2 },
    });
    ok("product_delete_stale_409", res.statusCode === 409 && res.body?.code === "draft_stale" && stats.released === 1);
    const none = makeConn(async () => [[], []]);
    const h2 = loadDraftsHandler({ conn: none.conn });
    const r2 = await run(h2.handler, {
      method: "DELETE",
      body: { entity_type: "product", entity_id: "1", expected_draft_version: 2 },
    });
    ok("product_delete_missing_404", r2.statusCode === 404 && r2.body?.code === "draft_missing" && none.stats.released === 1);
  }

  // site_content_page still works for manager and still requires content.manage
  {
    const { conn, calls, stats } = makeConn(async (sql) => {
      if (/FROM site_content/i.test(sql)) return [[{ content_key: VALID_KEY }], []];
      if (/^\s*INSERT INTO content_drafts/i.test(sql)) return [{ affectedRows: 1, insertId: 1 }, undefined];
      if (/FROM content_drafts/i.test(sql)) {
        return [[pageDraftRow({ draft_version: 1 })], []];
      }
      return [[], []];
    });
    const { handler, audits, permCalls } = loadDraftsHandler({ conn });
    const res = await run(handler, {
      method: "PUT",
      body: {
        entity_type: "site_content_page",
        entity_id: "home",
        expected_draft_version: null,
        changes: { [VALID_KEY]: { value: "Hello", base_hash: HASH64 } },
      },
    });
    ok(
      "page_put_manager_ok",
      res.statusCode === 200 &&
        permCalls[0].perm === "content.manage" &&
        calls.some((c) => /^\s*INSERT INTO content_drafts/i.test(c.sql)) &&
        stats.released === 1
    );
    ok(
      "page_audit_keys_only",
      audits.length === 1 && audits[0].metadata.keys.includes(VALID_KEY) && !JSON.stringify(audits).includes("Hello")
    );
    // page PUT does not run the products existence check
    ok("page_put_no_products_select", !calls.some((c) => /FROM products/i.test(c.sql)));
  }

  // generic 500, no SQL text
  {
    const { conn, stats } = makeConn(async (sql) => {
      if (/SELECT id FROM products/i.test(sql)) return [[{ id: 1 }], []];
      if (/FOR UPDATE/i.test(sql)) {
        const e = new Error("SELECT * FROM content_drafts WHERE secret=boom failed");
        e.code = "ER_LOCK_WAIT_TIMEOUT";
        throw e;
      }
      return [[], []];
    });
    const { handler } = loadDraftsHandler({ conn });
    const res = await run(handler, {
      method: "PUT",
      body: { entity_type: "product", entity_id: "1", expected_draft_version: 1, changes: productChanges() },
    });
    const bodyStr = JSON.stringify(res.body || {});
    ok(
      "product_error_generic_500",
      res.statusCode === 500 &&
        res.body?.error === "Draft request failed" &&
        !bodyStr.includes("SELECT") &&
        !bodyStr.includes("secret=boom") &&
        stats.rolled >= 1 &&
        stats.released === 1
    );
  }
}

// ─── 4. admin-products PUT publish_draft ────────────────────────────────────

function lockedRow(overrides = {}) {
  return {
    id: 1,
    name: "P",
    slug: "p",
    price: 10,
    category: "Subscription",
    active: 1,
    product_version: 3,
    description: "",
    short_description: "",
    full_description: "",
    badge: null,
    image: null,
    stock: "Digital",
    seo_title: "",
    meta_description: "",
    focus_keyword: "",
    features: "",
    og_image: "",
    ...overrides,
  };
}

/**
 * opts.deleteAffected: affectedRows returned for DELETE FROM content_drafts (default 1)
 * opts.deleteThrows: make the DELETE throw
 * opts.row: locked product row
 */
function loadProductsHandler(opts = {}) {
  const row = opts.row || lockedRow();
  const state = { poolCalls: [], getConnCalls: 0, lockCalls: 0, audits: [], seoGuardCalls: [] };

  const { conn, stats, calls, events } = makeConn(async (sql) => {
    const s = String(sql);
    if (/DELETE FROM content_drafts/i.test(s)) {
      if (opts.deleteThrows) throw new Error("boom: draft table gone");
      return [{ affectedRows: opts.deleteAffected === undefined ? 1 : opts.deleteAffected }, undefined];
    }
    if (/^\s*UPDATE products/i.test(s)) return [{ affectedRows: 1 }, undefined];
    if (/SELECT \* FROM products WHERE id=\?/i.test(s)) {
      return [[{ ...row, name: opts.freshName || "P2", product_version: Number(row.product_version) + 1 }], []];
    }
    return [[], []];
  });

  const pool = {
    async getConnection() {
      state.getConnCalls++;
      return conn;
    },
    async query(sql, params) {
      state.poolCalls.push({ sql: String(sql), params });
      if (/^\s*INSERT INTO products/i.test(String(sql))) return [{ insertId: 5 }, undefined];
      return [[], []];
    },
  };

  const PRODUCT_VERSION_MAX = 2147483647;
  const stubs = {
    "../../lib/db": { default: pool, __esModule: true },
    "../../lib/adminAuth": {
      requireAdminPermission: async () => identity("manager"),
      getRequestMeta: () => ({ ip: "127.0.0.1", userAgent: "test" }),
    },
    "../../lib/adminAudit": {
      recordAdminAudit: async (input) => {
        state.audits.push(input);
      },
    },
    "../../lib/adminNoStore": { setAdminNoStore: (res) => res.setHeader("Cache-Control", "no-store") },
    "../../lib/contentRevisions": {
      recordContentRevision: async () => {},
      snapshotProduct: (r) => ({ ...r }),
    },
    "../../lib/hostingerResourceInvalidation": { invalidateSitemapCache: () => {} },
    "../../lib/postSaveSeoGuard": {
      shouldRunPostSaveSeoGuard: () => ({ run: false, skip_reason: "noop_update" }),
      runPostSaveSeoGuard: async (input) => {
        state.seoGuardCalls.push(input);
        return { status: "ok", issue_count: 0 };
      },
    },
    "../../lib/productVisibility": {
      parseProductVisibilityPayload: () => ({ ok: false, status: 400, error: "stub", code: "validation" }),
    },
    "../../lib/productVisibilityServer": {
      applyProductVisibilityChange: async () => ({ ok: false, status: 500, error: "stub", code: "stub" }),
    },
    "../../lib/productSeasonActions": {
      parseSeasonActionPayload: () => ({ ok: false, error: "stub", code: "validation" }),
      PRODUCT_VERSION_MAX,
    },
    "../../lib/productSeasonServer": {
      applySeasonAction: async () => ({ ok: false, status: 500, error: "stub", code: "stub" }),
    },
    "../../lib/productSchemaCapabilityServer": {
      detectProductSchemaCapability: async () => ({ mode: "expanded" }),
    },
    "../../lib/productWriterTx": {
      lockProductRow: async (c) => {
        state.lockCalls++;
        state.lockConn = c;
        if (opts.lockMissing) {
          return { ok: false, status: 404, error: "Product not found", code: "not_found" };
        }
        return { ok: true, row: { ...row } };
      },
      gateExpectedVersionAllowMaxNoop: (r, expected, isNoop) => {
        const expanded = Object.prototype.hasOwnProperty.call(r, "product_version");
        if (!expanded) return { ok: true, version: 0, expanded: false };
        const version = Number(r.product_version);
        if (expected === undefined || expected === null) {
          return { ok: false, status: 400, error: "expected_version is required", code: "validation" };
        }
        if (typeof expected !== "number" || !Number.isInteger(expected) || expected < 0) {
          return { ok: false, status: 400, error: "expected_version must be a non-negative integer", code: "validation" };
        }
        if (expected !== version) {
          return {
            ok: false,
            status: 409,
            error: "This product was updated elsewhere. Reload and try again.",
            code: "stale_version",
            current_version: version,
          };
        }
        if (version === PRODUCT_VERSION_MAX && !isNoop) {
          return { ok: false, status: 409, error: "overflow", code: "version_overflow", current_version: version };
        }
        return { ok: true, version, expanded: true };
      },
      assertSingleUpdate: (result, label) => {
        if (Number(result && result.affectedRows) !== 1) {
          const err = new Error(`${label}: concurrent change or missing row`);
          err.code = "concurrent_conflict";
          throw err;
        }
      },
    },
    "../../lib/productSeasonLondon": {
      normalizeSeasonalUtcFields: (r) => ({ ...r }),
    },
    "../../lib/productSeasonalQuery": {
      queryWithSeasonalUtc: async (c, sql, params) => c.query(sql, params),
    },
  };

  const mod = loadTs("pages/api/admin-products.ts", stubs);
  return { handler: mod.default || mod, conn, stats, calls, events, state, pool };
}

const idxOf = (events, re) => events.findIndex((e) => re.test(e));
const DEL_RE = /^query:DELETE FROM content_drafts/;

async function runProductsPutTests() {
  console.log("\n# admin-products PUT publish_draft");

  const noopBody = (extra = {}) => ({
    id: 1,
    expected_version: 3,
    publish_draft: { expected_draft_version: 4 },
    ...extra,
  });
  const updateBody = (extra = {}) => ({
    id: 1,
    name: "P2",
    expected_version: 3,
    publish_draft: { expected_draft_version: 4 },
    ...extra,
  });

  // DELETE before commit on SAME conn — noop and update
  for (const [label, body, isNoop] of [
    ["noop", noopBody(), true],
    ["update", updateBody(), false],
  ]) {
    const h = loadProductsHandler();
    const res = await run(h.handler, { method: "PUT", body });
    const delAt = idxOf(h.events, DEL_RE);
    const commitAt = h.events.indexOf("commit");
    const beginAt = h.events.indexOf("begin");
    ok(
      `${label}_delete_before_commit_same_conn`,
      res.statusCode === 200 && beginAt >= 0 && delAt > beginAt && commitAt > delAt && h.stats.committed === 1,
      h.events.join(">")
    );
    ok(`${label}_delete_not_on_pool`, !h.state.poolCalls.some((c) => /content_drafts/i.test(c.sql)));
    ok(`${label}_single_connection`, h.state.getConnCalls === 1 && h.stats.released === 1);
    const del = h.calls.find((c) => /DELETE FROM content_drafts/i.test(c.sql));
    ok(
      `${label}_delete_scoped_to_product_and_version`,
      !!del &&
        /entity_type='product'/.test(del.sql) &&
        /entity_id=\?/.test(del.sql) &&
        /draft_version=\?/.test(del.sql) &&
        del.params[0] === "1" &&
        del.params[1] === 4
    );
    ok(`${label}_noop_flag`, res.body?.noop === isNoop);
    ok(`${label}_draft_published_true`, res.body?.draft_published === true);
    if (isNoop) {
      ok("noop_no_products_update", !h.calls.some((c) => /^\s*UPDATE products/i.test(c.sql)));
    } else {
      const upAt = idxOf(h.events, /^query:UPDATE products/);
      ok("update_products_update_before_delete", upAt > 0 && upAt < delAt, h.events.join(">"));
      ok(
        "update_audit_has_draft_published",
        h.state.audits.length === 1 &&
          h.state.audits[0].action === "product.updated" &&
          h.state.audits[0].metadata.draft_published === true
      );
    }
  }

  // affectedRows 1 → true; 0 → false (noop + update)
  for (const [label, body] of [
    ["noop", noopBody()],
    ["update", updateBody()],
  ]) {
    const h1 = loadProductsHandler({ deleteAffected: 1 });
    const r1 = await run(h1.handler, { method: "PUT", body });
    ok(`${label}_affected_1_true`, r1.statusCode === 200 && r1.body?.draft_published === true);
    const h0 = loadProductsHandler({ deleteAffected: 0 });
    const r0 = await run(h0.handler, { method: "PUT", body });
    ok(
      `${label}_affected_0_false`,
      r0.statusCode === 200 && r0.body?.draft_published === false && h0.stats.committed === 1 && h0.stats.rolled === 0
    );
    const h2 = loadProductsHandler({ deleteAffected: 2 });
    const r2 = await run(h2.handler, { method: "PUT", body });
    ok(`${label}_affected_not_exactly_1_false`, r2.body?.draft_published === false);
  }
  {
    const h0 = loadProductsHandler({ deleteAffected: 0 });
    await run(h0.handler, { method: "PUT", body: updateBody() });
    ok(
      "update_audit_draft_published_false",
      h0.state.audits[0]?.metadata?.draft_published === false
    );
  }

  // DELETE throwing → still commits, draft_published false
  for (const [label, body] of [
    ["noop", noopBody()],
    ["update", updateBody()],
  ]) {
    const h = loadProductsHandler({ deleteThrows: true });
    const res = await run(h.handler, { method: "PUT", body });
    ok(
      `${label}_delete_throw_still_commits`,
      res.statusCode === 200 &&
        res.body?.success === true &&
        res.body?.draft_published === false &&
        h.stats.committed === 1 &&
        h.stats.rolled === 0 &&
        idxOf(h.events, DEL_RE) >= 0 &&
        h.events.indexOf("commit") > idxOf(h.events, DEL_RE),
      h.events.join(">")
    );
    ok(`${label}_delete_throw_released`, h.stats.released === 1);
    ok(`${label}_delete_throw_no_leak_in_body`, !JSON.stringify(res.body).includes("draft table gone"));
  }

  // invalid publish_draft → 400 before TX
  {
    const bads = [
      ["null", null],
      ["string", "4"],
      ["number", 4],
      ["array", [{ expected_draft_version: 4 }]],
      ["empty_obj", {}],
      ["zero", { expected_draft_version: 0 }],
      ["negative", { expected_draft_version: -1 }],
      ["float", { expected_draft_version: 1.5 }],
      ["string_version", { expected_draft_version: "2" }],
      ["null_version", { expected_draft_version: null }],
      ["nan", { expected_draft_version: NaN }],
      ["extra_key", { expected_draft_version: 2, extra: true }],
      ["wrong_key", { version: 2 }],
      ["null_proto", Object.assign(Object.create(null), { expected_draft_version: 2 })],
    ];
    for (const [label, pd] of bads) {
      const h = loadProductsHandler();
      const res = await run(h.handler, {
        method: "PUT",
        body: { id: 1, name: "P2", expected_version: 3, publish_draft: pd },
      });
      ok(
        `invalid_publish_draft_${label}_400_before_tx`,
        res.statusCode === 400 &&
          res.body?.code === "validation" &&
          h.stats.began === 0 &&
          h.state.getConnCalls === 0 &&
          h.state.lockCalls === 0 &&
          h.calls.length === 0 &&
          h.stats.committed === 0
      );
    }
    // explicit undefined key counts as present → 400
    const h = loadProductsHandler();
    const res = await run(h.handler, {
      method: "PUT",
      body: { id: 1, name: "P2", expected_version: 3, publish_draft: undefined },
    });
    ok("invalid_publish_draft_undefined_present_400", res.statusCode === 400 && h.stats.began === 0);
  }

  // without publish_draft → no DELETE, no draft_published key
  for (const [label, body] of [
    ["noop", { id: 1, expected_version: 3 }],
    ["update", { id: 1, name: "P2", expected_version: 3 }],
  ]) {
    const h = loadProductsHandler();
    const res = await run(h.handler, { method: "PUT", body });
    ok(
      `${label}_no_publish_draft_no_delete`,
      res.statusCode === 200 &&
        res.body?.success === true &&
        !h.calls.some((c) => /content_drafts/i.test(c.sql)) &&
        !Object.prototype.hasOwnProperty.call(res.body, "draft_published") &&
        h.stats.committed === 1
    );
    if (label === "update") {
      ok(
        "update_no_publish_draft_audit_has_no_draft_published",
        h.state.audits.length === 1 &&
          !Object.prototype.hasOwnProperty.call(h.state.audits[0].metadata, "draft_published")
      );
    }
  }

  // 409 version gate → rollback, no DELETE, no commit
  for (const [label, body] of [
    ["noop", noopBody({ expected_version: 2 })],
    ["update", updateBody({ expected_version: 2 })],
  ]) {
    const h = loadProductsHandler();
    const res = await run(h.handler, { method: "PUT", body });
    ok(
      `${label}_409_gate_rollback_no_delete`,
      res.statusCode === 409 &&
        res.body?.code === "stale_version" &&
        res.body?.current_version === 3 &&
        h.stats.rolled >= 1 &&
        h.stats.committed === 0 &&
        !h.calls.some((c) => /content_drafts/i.test(c.sql)) &&
        !Object.prototype.hasOwnProperty.call(res.body, "draft_published") &&
        h.stats.released === 1
    );
  }

  // 404 locked missing → no delete
  {
    const h = loadProductsHandler({ lockMissing: true });
    const res = await run(h.handler, { method: "PUT", body: updateBody() });
    ok(
      "404_locked_missing_no_delete",
      res.statusCode === 404 &&
        h.stats.rolled >= 1 &&
        h.stats.committed === 0 &&
        !h.calls.some((c) => /content_drafts/i.test(c.sql)) &&
        h.state.lockConn === h.conn
    );
  }

  // POST ignores publish_draft
  {
    const h = loadProductsHandler();
    const res = await run(h.handler, {
      method: "POST",
      body: {
        name: "New Product",
        price: 12,
        category: "Subscription",
        publish_draft: { expected_draft_version: 4 },
      },
    });
    ok(
      "post_ignores_publish_draft",
      res.statusCode === 200 &&
        res.body?.success === true &&
        !Object.prototype.hasOwnProperty.call(res.body, "draft_published") &&
        !h.calls.some((c) => /content_drafts/i.test(c.sql)) &&
        !h.state.poolCalls.some((c) => /content_drafts/i.test(c.sql)) &&
        h.state.poolCalls.some((c) => /^\s*INSERT INTO products/i.test(c.sql)) &&
        h.state.getConnCalls === 0
    );
    // Even invalid publish_draft on POST does not 400
    const h2 = loadProductsHandler();
    const res2 = await run(h2.handler, {
      method: "POST",
      body: { name: "New Product", price: 12, category: "Subscription", publish_draft: "garbage" },
    });
    ok("post_invalid_publish_draft_ignored", res2.statusCode === 200 && res2.body?.success === true);
  }

  // Source sanity: DELETE is parameterised + best-effort wrapper exists
  {
    const src = read("pages/api/admin-products.ts");
    ok(
      "source_delete_uses_tx_conn_param",
      /tryDeletePublishedDraft\(\s*conn,/.test(src) &&
        /DELETE FROM content_drafts WHERE entity_type='product' AND entity_id=\? AND draft_version=\?/.test(src)
    );
  }
}

// ─── 5. ProductDraftBar source ──────────────────────────────────────────────

function sliceBetween(src, startRe, endRe) {
  const s = src.search(startRe);
  if (s < 0) return "";
  const rest = src.slice(s + 1);
  const e = rest.search(endRe);
  return e < 0 ? src.slice(s) : src.slice(s, s + 1 + e);
}

function runBarSourceTests() {
  console.log("\n# ProductDraftBar source");
  const src = read("components/admin/ProductDraftBar.tsx");
  ok("use_client", /^\s*["']use client["']/.test(src));
  ok(
    "entity_type_product",
    /PRODUCT_DRAFT_ENTITY_TYPE/.test(src) &&
      /entity_type:\s*PRODUCT_DRAFT_ENTITY_TYPE/.test(src) &&
      /PRODUCT_DRAFT_ENTITY_TYPE\s*=\s*["']product["']/.test(read("lib/productDraftClient.ts"))
  );
  ok(
    "put_sends_expected_draft_version",
    /method:\s*["']PUT["']/.test(src) && /expected_draft_version:\s*expected/.test(src)
  );
  ok(
    "delete_sends_expected_draft_version",
    /method:\s*["']DELETE["']/.test(src) && /expected_draft_version:\s*draft\.draft_version/.test(src)
  );

  const openBody = sliceBetween(src, /const handleOpenDraft\b/, /const handleDiscardDraft\b/);
  const discardBody = sliceBetween(src, /const handleDiscardDraft\b/, /if \(forbidden\) return null/);
  ok("open_calls_onPublishArmed", /onPublishArmed\(\s*Number\(draft\.draft_version\)/.test(openBody), openBody.slice(0, 80));
  ok("discard_calls_onPublishArmed_null", /onPublishArmed\(\s*null\s*\)/.test(discardBody));
  ok("source_contains_onPublishArmed_calls", (src.match(/onPublishArmed\(/g) || []).length >= 3);
  ok(
    "armed_not_called_on_plain_save_create",
    /if \(openedVersion != null && nextVer != null\)\s*\{\s*onPublishArmed\(nextVer\)/.test(src)
  );
  // F4UK-MULTI-151: load-effect reset may go through onPublishArmedRef.current(null)
  // (stable-ref pattern) as well as a direct onPublishArmed(null) call.
  ok(
    "reset_armed_on_product_change",
    /onPublishArmed(?:Ref\.current)?\(null\);\s*\n\s*liveBaselineRef/.test(src)
  );

  ok("no_localStorage", !/localStorage|sessionStorage/.test(src));
  ok("no_timers", !/setInterval\s*\(/.test(src) && !/setTimeout\s*\(/.test(src));
  ok("no_autosave", !/auto-?save/i.test(src));
  ok(
    "no_server_imports",
    !/from\s+["']@\/lib\/contentDrafts(Capability)?["']/.test(src) &&
      !/from\s+["'][^"']*lib\/db["']/.test(src) &&
      !/from\s+["']@\/lib\/(adminAuth|adminAudit|siteContentBaseHash|adminNoStore)["']/.test(src) &&
      !/from\s+["'](mysql2|fs|path|crypto|child_process)(\/[^"']*)?["']/.test(src) &&
      !/require\s*\(/.test(src)
  );
  ok("uses_admin_drafts_api_only", /\/api\/admin-drafts/.test(src) && !/\/api\/admin-products/.test(src));

  const client = read("lib/productDraftClient.ts");
  ok(
    "client_helper_no_server_imports",
    !/from\s+["'][^"']*(\/db|contentDrafts|adminAuth|adminAudit)["']/.test(client) &&
      !/from\s+["'](mysql2|fs|path|crypto)["']/.test(client)
  );
}

// ─── 6. page.tsx wiring ─────────────────────────────────────────────────────

function extractSaveProduct(src) {
  const lines = norm(src).split("\n");
  const start = lines.findIndex((l) => /^  const saveProduct = async \(\) => \{/.test(l));
  if (start < 0) return null;
  let end = -1;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i] === "  };") {
      end = i;
      break;
    }
  }
  if (end < 0) return null;
  return lines.slice(start, end + 1).join("\n");
}

/** Remove the multi-line publish_draft spread (and any stray matching lines). */
function stripPublishDraft(block) {
  const lines = block.split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (/productDraftPublishVersion\s*!=\s*null/.test(lines[i])) {
      // skip through the closing ": {})," of this spread
      while (i < lines.length && lines[i].trim() !== ": {}),") i++;
      continue;
    }
    if (/publish_draft|productDraftPublishVersion/.test(lines[i])) continue;
    out.push(lines[i]);
  }
  return out.join("\n");
}

function runPageTests() {
  console.log("\n# app/sidhu/page.tsx");
  const src = norm(read("app/sidhu/page.tsx"));

  const importHits = src.match(/import ProductDraftBar from ["']@\/components\/admin\/ProductDraftBar["'];/g) || [];
  ok("imports_ProductDraftBar_once", importHits.length === 1);
  ok(
    "productDraftPublishVersion_state",
    /const \[productDraftPublishVersion, setProductDraftPublishVersion\] = useState<number \| null>\(null\);/.test(src)
  );
  ok(
    "reset_on_productModal_change",
    /useEffect\(\(\) => \{\s*setProductDraftPublishVersion\(null\);\s*\}, \[productModal\]\);/.test(src)
  );

  const cur = extractSaveProduct(src);
  const baseSrc = norm(gitShow(BASE, "app/sidhu/page.tsx"));
  const base = extractSaveProduct(baseSrc);
  ok("saveProduct_found_cur_and_base", !!cur && !!base);
  ok(
    "publish_draft_spread_in_saveProduct",
    !!cur &&
      /\.\.\.\(productDraftPublishVersion != null/.test(cur) &&
      /publish_draft:\s*\{\s*expected_draft_version:\s*productDraftPublishVersion,?\s*\}/.test(cur)
  );
  ok(
    "publish_draft_only_on_put_branch",
    !!cur &&
      cur.indexOf("publish_draft") > cur.indexOf("id: (productModal as { id: number }).id") &&
      cur.indexOf("publish_draft") > cur.indexOf(": {\n                ...payload,")
  );
  ok("base_saveProduct_has_no_publish_draft", !!base && !/publish_draft|productDraftPublishVersion/.test(base));
  const curStripped = cur ? stripPublishDraft(cur) : "";
  const baseStripped = base ? stripPublishDraft(base) : "";
  ok(
    "saveProduct_unchanged_minus_publish_draft_spread",
    !!cur && !!base && curStripped === baseStripped,
    cur && base ? `cur=${sha256(curStripped).slice(0, 12)} base=${sha256(baseStripped).slice(0, 12)}` : "missing"
  );
  ok(
    "saveProduct_sha256_minus_spread_identical",
    !!cur && !!base && sha256(curStripped) === sha256(baseStripped)
  );

  const elHits = src.match(/<ProductDraftBar\b/g) || [];
  ok("exactly_one_ProductDraftBar_element", elHits.length === 1);
  ok(
    "ProductDraftBar_only_for_existing_product",
    /\{productModal !== "new" && productModal\?\.id \? \(\s*<ProductDraftBar\b/.test(src)
  );
  ok("onPublishArmed_wired_to_setter", /onPublishArmed=\{setProductDraftPublishVersion\}/.test(src));

  // diff limited to approved wiring
  const num = spawnSync("git", ["diff", "--numstat", BASE, "--", "app/sidhu/page.tsx"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const parts = (num.stdout || "").trim().split(/\r?\n/)[0].split(/\s+/);
  const added = Number(parts[0]);
  const removed = Number(parts[1]);
  ok("page_diff_additions_only", Number.isFinite(added) && removed === 0, `numstat=${(num.stdout || "").trim()}`);
  ok("page_diff_small", Number.isFinite(added) && added > 0 && added <= 45, `added=${added}`);

  const udiff = spawnSync("git", ["diff", "-U0", BASE, "--", "app/sidhu/page.tsx"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  const addedLines = norm(udiff.stdout || "")
    .split("\n")
    .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
    .map((l) => l.slice(1));
  const addedText = addedLines.join("\n");
  ok(
    "page_diff_contains_approved_wiring",
    /ProductDraftBar/.test(addedText) &&
      /productDraftPublishVersion/.test(addedText) &&
      /setProductDraftPublishVersion/.test(addedText) &&
      /publish_draft/.test(addedText)
  );
  ok(
    "page_diff_no_unapproved_additions",
    !/localStorage|setInterval|setTimeout|\/api\/admin-drafts|fetch\(/.test(addedText),
    "unexpected token in added lines"
  );
}

// ─── 7. no-forbidden-diff ───────────────────────────────────────────────────

function gitNames(args) {
  const r = spawnSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  return { status: r.status, names: (r.stdout || "").split(/\r?\n/).map((s) => s.trim().replace(/\\/g, "/")).filter(Boolean) };
}

function runDiffAllowlist() {
  console.log("\n# no-forbidden-diff");
  const allowed = new Set([
    "lib/contentDrafts.ts",
    "pages/api/admin-drafts.ts",
    "pages/api/admin-products.ts",
    "components/admin/ProductDraftBar.tsx",
    "lib/productDraftClient.ts",
    "app/sidhu/page.tsx",
    "scripts/phase-multi-150-tests.js",
    "docs/design/DRAFT-PUBLISH.md",
    // Allowlist plumbing only
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
  // Any other phase-*-tests.js that had its allowlist widened.
  const phaseTestRe = /^scripts\/phase-[a-z0-9-]+-tests\.js$/;

  const committed = gitNames(["diff", "--name-only", `${BASE}..HEAD`]);
  const unstaged = gitNames(["diff", "--name-only"]);
  const staged = gitNames(["diff", "--name-only", "--cached"]);
  const untracked = gitNames(["ls-files", "--others", "--exclude-standard"]);
  ok(
    "git_commands_ok",
    committed.status === 0 && unstaged.status === 0 && staged.status === 0 && untracked.status === 0,
    `committed=${committed.status} unstaged=${unstaged.status} staged=${staged.status} untracked=${untracked.status}`
  );

  const names = new Set([...committed.names, ...unstaged.names, ...staged.names, ...untracked.names]);
  const bad = [...names].filter((n) => !allowed.has(n) && !phaseTestRe.test(n));
  ok("no_forbidden_diff", bad.length === 0, bad.length ? bad.join(",") : undefined);
  const widened = [...names].filter((n) => phaseTestRe.test(n) && !allowed.has(n));
  if (widened.length) console.log(`  note: additional phase test scripts changed: ${widened.join(", ")}`);
}

// ─── main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("phase-multi-150-tests");
  runProductValidatorTests();
  runPageValidatorIdentity();
  await runDraftsHandlerTests();
  await runProductsPutTests();
  runBarSourceTests();
  runPageTests();
  runDiffAllowlist();
  console.log(`\nMULTI-150 results: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
