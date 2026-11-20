/**
 * F4UK-MULTI-145 — HEALTH-RL-1 + DRAFT-BASE-KEEP + LOGIN-RACE-1.
 * Mocked pool/conn only; never a real DB or network.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const Module = require("module");
const { createHash } = require("crypto");
const { spawnSync } = require("child_process");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..");
const BASE = "fd803547c730aae3055adb71463a59a67c07cc7c";
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

function sha256(s) {
  return createHash("sha256").update(String(s), "utf8").digest("hex");
}

function gitShow(ref, rel) {
  const r = spawnSync("git", ["show", `${ref}:${rel}`], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
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
    if (id.startsWith("@/")) {
      const mapped = id.slice(2);
      if (Object.prototype.hasOwnProperty.call(stubs, mapped)) return stubs[mapped];
      if (Object.prototype.hasOwnProperty.call(stubs, "@/lib/" + mapped.replace(/^lib\//, ""))) {
        return stubs["@/lib/" + mapped.replace(/^lib\//, "")];
      }
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

function extractFn(src, name) {
  const re = new RegExp(
    `export async function ${name}[\\s\\S]*?\\n\\}`
  );
  const m = src.match(re);
  return m ? m[0] : null;
}

function recoveryBlock(src) {
  const idx = src.indexOf("// ── Recovery Admin");
  if (idx < 0) return null;
  return src.slice(idx);
}

// ─── HEALTH-RL-1 ────────────────────────────────────────────────────────────

function runHealthTests() {
  console.log("\n# HEALTH-RL-1");
  const healthPath = path.join(ROOT, "scripts", "live-health-check.js");
  const healthSrc = fs.readFileSync(healthPath, "utf8");
  const { classifyNegStatus } = require(healthPath);

  {
    const failures = [];
    const warnings = [];
    const c = classifyNegStatus("reviews_empty_post", 429, 400);
    if (c.warning) warnings.push(c.warning);
    if (c.failure) failures.push(c.failure);
    const resultPass = failures.length === 0;
    ok("health_429_no_failure", failures.length === 0 && c.ok === true);
    ok("health_429_one_warning", warnings.length === 1 && c.warn === "rate_limited_not_checked");
    ok(
      "health_429_warning_text",
      warnings[0] ===
        "reviews_empty_post: 429 rate-limited (3/hour/IP) - not checked"
    );
    ok("health_429_result_pass", resultPass === true);
  }

  {
    const c = classifyNegStatus("reviews_empty_post", 500, 400);
    ok("health_500_is_failure", c.ok === false && !!c.failure && !c.warning);
  }

  {
    const c = classifyNegStatus("orders_empty_post", 429, 400);
    ok(
      "health_other_probe_429_failure",
      c.ok === false &&
        !!c.failure &&
        !c.warning &&
        /orders_empty_post/.test(c.failure)
    );
  }

  const probes = [
    ['neg("orders_empty_post"', "POST", "/api/orders", 400],
    ['neg("track_no_email"', "GET", "/api/track?order_id=ORD-1000000000000", 400],
    ['neg(\n    "track_fake"', null, "/api/track?order_id=ORD-1000000000000&email=nobody@example.com", 404],
    ['neg("admin_redirect"', "GET", "/admin", 308],
    ["reviews_get", null, "/api/reviews", 200],
    ['neg("reviews_empty_post"', "POST", "/api/reviews", 400],
    ['neg(\n    "site_content_scope_admin_unauth"', null, "/api/site-content?page=all&scope=admin", 401],
  ];
  for (const [snip, , pathHint, expect] of probes) {
    ok(
      `health_probe_present_${String(snip).replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 40)}`,
      healthSrc.includes(snip.replace(/\n\s*/g, "\n    ")) ||
        healthSrc.includes(snip) ||
        (pathHint && healthSrc.includes(pathHint) && String(healthSrc).includes(String(expect)))
    );
  }
  ok("health_probe_orders", /orders_empty_post/.test(healthSrc) && /\/api\/orders/.test(healthSrc));
  ok("health_probe_track_no_email", /track_no_email/.test(healthSrc));
  ok("health_probe_track_fake", /track_fake/.test(healthSrc));
  ok("health_probe_admin_redirect", /admin_redirect/.test(healthSrc) && /308/.test(healthSrc));
  ok("health_probe_reviews_get", /reviews_get/.test(healthSrc));
  ok(
    "health_probe_reviews_empty_post_400",
    /reviews_empty_post/.test(healthSrc) &&
      /await neg\("reviews_empty_post",\s*"POST",\s*"\/api\/reviews",\s*\{\},\s*400\)/.test(
        healthSrc
      )
  );
  ok(
    "health_probe_site_content_scope",
    /site_content_scope_admin_unauth/.test(healthSrc) &&
      /page=all&scope=admin/.test(healthSrc)
  );

  ok("health_warnings_array", /const warnings = \[\]/.test(healthSrc));
  ok(
    "health_warnings_section",
    /## Warnings/.test(healthSrc) &&
      /Warnings: \$\{warnings\.length\}/.test(healthSrc)
  );
  ok(
    "health_warnings_in_json",
    /warnings,/.test(healthSrc) || /warnings\n/.test(healthSrc)
  );
  ok(
    "health_classify_exported",
    typeof classifyNegStatus === "function" &&
      /classifyNegStatus/.test(healthSrc)
  );
}

// ─── DRAFT-BASE-KEEP ────────────────────────────────────────────────────────

function runDraftTests() {
  console.log("\n# DRAFT-BASE-KEEP");
  const mod = loadTs("lib/contentDraftClient.ts");
  const HASH_A = "a".repeat(64);
  const HASH_B = "b".repeat(64);
  const HASH_STORED = "c".repeat(64);
  const isSettings = (k) => k === "site_title" || k.startsWith("settings_");

  {
    const keep = {
      home_hero_title: { value: "OldDraft", base_hash: HASH_STORED },
    };
    const r = mod.buildDraftChanges(
      { home_hero_title: "New", about_title: "X" },
      { home_hero_title: "Old", about_title: "Y" },
      () => HASH_A,
      isSettings,
      keep
    );
    ok(
      "draft_keep_stored_hash",
      r.changes.home_hero_title.base_hash === HASH_STORED
    );
    ok(
      "draft_new_key_uses_fn",
      r.changes.about_title.base_hash === HASH_A
    );
  }

  {
    const keep = {
      home_hero_title: { value: "x", base_hash: "not-a-valid-hash" },
    };
    const r = mod.buildDraftChanges(
      { home_hero_title: "New" },
      { home_hero_title: "Old" },
      () => HASH_B,
      isSettings,
      keep
    );
    ok(
      "draft_invalid_stored_falls_back",
      r.changes.home_hero_title.base_hash === HASH_B
    );
  }

  {
    const keep = {
      orphan: { value: "x", base_hash: "zzzz" },
    };
    const r = mod.buildDraftChanges(
      { orphan: "a", other: "b" },
      { orphan: "c", other: "d" },
      (k) => (k === "orphan" || k === "other" ? undefined : HASH_A),
      isSettings,
      keep
    );
    ok(
      "draft_missing_hash_both_sources",
      r.missingHashKeys.sort().join(",") === "orphan,other" ||
        r.missingHashKeys.includes("orphan") &&
          r.missingHashKeys.includes("other")
    );
  }

  {
    const keep = {
      orphan: { value: "x", base_hash: HASH_STORED },
    };
    const r = mod.buildDraftChanges(
      { orphan: "a" },
      { orphan: "c" },
      () => undefined,
      isSettings,
      keep
    );
    ok(
      "draft_keep_avoids_missing",
      r.changes.orphan &&
        r.changes.orphan.base_hash === HASH_STORED &&
        r.missingHashKeys.length === 0
    );
  }

  // Without 5th arg — identical to MULTI-143 cases
  {
    const r = mod.buildDraftChanges(
      { home_hero_title: "New", site_title: "X", about_title: "Same", orphan: "y" },
      { home_hero_title: "Old", site_title: "Y", about_title: "Same" },
      (k) => (k === "orphan" ? undefined : HASH_A),
      isSettings
    );
    ok("draft_143_dirty_only", Object.keys(r.changes).join(",") === "home_hero_title");
    ok("draft_143_skips_settings", r.skippedSettingsKeys.join(",") === "site_title");
    ok("draft_143_missing_hash", r.missingHashKeys.join(",") === "orphan");
    ok(
      "draft_143_change_shape",
      r.changes.home_hero_title.value === "New" &&
        r.changes.home_hero_title.base_hash === HASH_A
    );
  }
  {
    const r = mod.buildDraftChanges({}, {}, () => HASH_A, isSettings);
    ok("draft_143_nothing_dirty", Object.keys(r.changes).length === 0);
  }

  const bar = read("components/admin/CmsDraftBar.tsx");
  ok(
    "cms_passes_keepBaseFrom_when_opened",
    /buildDraftChanges\([\s\S]*?draft && openedVersion === Number\(draft\.draft_version\) \? draft\.changes : null/.test(
      bar
    )
  );
  ok(
    "cms_keep_only_on_version_match",
    /openedVersion === Number\(draft\.draft_version\)/.test(bar)
  );
}

// ─── LOGIN-RACE-1 helper ────────────────────────────────────────────────────

function makeSessionHarness(opts = {}) {
  const calls = [];
  const row =
    opts.row === null
      ? null
      : opts.row || {
          id: 7,
          password_hash: "hash-a",
          active: 1,
          role: "manager",
        };
  let insertThrows = !!opts.insertThrows;
  const TOKEN = "t".repeat(64);
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
      if (/SELECT id, password_hash, active, role FROM admin_staff.*FOR UPDATE/i.test(s)) {
        return [row ? [row] : [], []];
      }
      if (/UPDATE admin_staff/i.test(s)) {
        return [{ affectedRows: 1 }, []];
      }
      if (/INSERT INTO admin_sessions/i.test(s)) {
        if (insertThrows) throw new Error("insert boom");
        return [{ affectedRows: 1, insertId: 1 }, []];
      }
      return [[], []];
    },
    release() {
      calls.push({ op: "release" });
    },
  };
  const poolQueries = [];
  const pool = {
    async getConnection() {
      calls.push({ op: "getConnection" });
      return conn;
    },
    async query(sql, params) {
      poolQueries.push({ sql: String(sql).replace(/\s+/g, " "), params });
      calls.push({ op: "poolQuery", sql: String(sql).replace(/\s+/g, " "), params });
      return [[], []];
    },
  };
  const TTL = 12 * 60 * 60 * 1000;
  const mod = loadTs("lib/adminStaffPasswordTx.ts", {
    "./db": { __esModule: true, default: pool },
    "./adminAuth": {
      ADMIN_SESSION_TTL_MS: TTL,
      generateSessionToken: () => TOKEN,
      hashSessionToken: (t) => "sha:" + String(t),
      isAdminRole: (v) =>
        typeof v === "string" &&
        ["super_admin", "manager", "writer"].includes(v),
    },
  });
  return { mod, calls, poolQueries, conn, TOKEN, TTL };
}

async function runLoginHelperTests() {
  console.log("\n# LOGIN-RACE-1 helper");

  {
    const h = makeSessionHarness();
    const r = await h.mod.createStaffSessionIfUnchanged({
      staffId: 7,
      verifiedHash: "hash-a",
      upgradeHash: "upgraded-hash",
      principalName: "Ada",
      role: "manager",
      ip: "1.2.3.4",
      userAgent: "test-ua",
    });
    ok("login_happy_ok", r && r.ok === true && r.token === h.TOKEN);
    const ops = h.calls.map((c) => c.op);
    const q = h.calls.filter((c) => c.op === "query");
    ok("login_happy_begin_first", ops.includes("beginTransaction"));
    ok(
      "login_happy_select_for_update",
      q.some((c) => /SELECT id, password_hash, active, role FROM admin_staff WHERE id = \? FOR UPDATE/i.test(c.sql))
    );
    const updHash = q.filter((c) =>
      /password_hash = \?, password_changed_at = NOW\(\)/i.test(c.sql)
    );
    ok("login_happy_upgrade_update", updHash.length === 1);
    const updLogin = q.filter((c) =>
      /last_login_at = NOW\(\)/i.test(c.sql)
    );
    ok("login_happy_last_login", updLogin.length === 1);
    const ins = q.filter((c) => /INSERT INTO admin_sessions/i.test(c.sql));
    ok("login_happy_insert", ins.length === 1);
    ok("login_happy_commit", ops.includes("commit"));
    ok("login_happy_release", ops[ops.length - 1] === "release" || ops.includes("release"));

    const beginIdx = ops.indexOf("beginTransaction");
    const selIdx = ops.findIndex(
      (o, i) => o === "query" && /FOR UPDATE/i.test(h.calls[i].sql)
    );
    const upHashIdx = ops.findIndex(
      (o, i) =>
        o === "query" &&
        /password_hash = \?, password_changed_at/i.test(h.calls[i].sql)
    );
    const upLoginIdx = ops.findIndex(
      (o, i) =>
        o === "query" && /last_login_at = NOW\(\)/i.test(h.calls[i].sql)
    );
    const insIdx = ops.findIndex(
      (o, i) => o === "query" && /INSERT INTO admin_sessions/i.test(h.calls[i].sql)
    );
    const commitIdx = ops.indexOf("commit");
    ok(
      "login_happy_exact_order",
      beginIdx < selIdx &&
        selIdx < upHashIdx &&
        upHashIdx < upLoginIdx &&
        upLoginIdx < insIdx &&
        insIdx < commitIdx
    );

    const createSrc = gitShow(BASE, "lib/adminAuth.ts");
    const colMatch = createSrc.match(
      /INSERT INTO admin_sessions\s*\(([^)]+)\)/
    );
    const helperSrc = read("lib/adminStaffPasswordTx.ts");
    const helperCols = helperSrc.match(
      /INSERT INTO admin_sessions\s*\(([^)]+)\)/
    );
    ok(
      "login_insert_cols_match_createAdminSession",
      !!colMatch &&
        !!helperCols &&
        colMatch[1].replace(/\s+/g, " ").trim() ===
          helperCols[1].replace(/\s+/g, " ").trim()
    );
    ok(
      "login_ttl_uses_ADMIN_SESSION_TTL_MS",
      /ADMIN_SESSION_TTL_MS/.test(helperSrc) &&
        r.expiresAt instanceof Date &&
        Math.abs(r.expiresAt.getTime() - (Date.now() + h.TTL)) < 5000
    );
    ok(
      "login_cleanup_after_commit",
      h.poolQueries.some((p) =>
        /DELETE FROM admin_sessions WHERE expires_at < NOW\(\) LIMIT 200/i.test(
          p.sql
        )
      )
    );
  }

  {
    const h = makeSessionHarness({
      row: { id: 7, password_hash: "hash-b", active: 1, role: "manager" },
    });
    const r = await h.mod.createStaffSessionIfUnchanged({
      staffId: 7,
      verifiedHash: "hash-a",
      principalName: "Ada",
      role: "manager",
    });
    ok("login_changed_code", r && r.ok === false && r.code === "changed");
    ok(
      "login_changed_rollback_no_write",
      h.calls.some((c) => c.op === "rollback") &&
        !h.calls.some(
          (c) => c.op === "query" && /UPDATE admin_staff/i.test(c.sql)
        ) &&
        !h.calls.some(
          (c) => c.op === "query" && /INSERT INTO admin_sessions/i.test(c.sql)
        )
    );
  }

  {
    const h = makeSessionHarness({
      row: { id: 7, password_hash: "hash-a", active: 0, role: "manager" },
    });
    const r = await h.mod.createStaffSessionIfUnchanged({
      staffId: 7,
      verifiedHash: "hash-a",
      principalName: "Ada",
      role: "manager",
    });
    ok("login_inactive_code", r && r.ok === false && r.code === "inactive");
    ok(
      "login_inactive_no_write",
      !h.calls.some(
        (c) => c.op === "query" && /UPDATE admin_staff/i.test(c.sql)
      ) &&
        !h.calls.some(
          (c) => c.op === "query" && /INSERT INTO admin_sessions/i.test(c.sql)
        )
    );
  }

  {
    const h = makeSessionHarness({
      row: { id: 7, password_hash: "hash-a", active: 1, role: "guest" },
    });
    const r = await h.mod.createStaffSessionIfUnchanged({
      staffId: 7,
      verifiedHash: "hash-a",
      principalName: "Ada",
      role: "guest",
    });
    ok("login_bad_role_inactive", r && r.ok === false && r.code === "inactive");
  }

  {
    const h = makeSessionHarness({ row: null });
    const r = await h.mod.createStaffSessionIfUnchanged({
      staffId: 99,
      verifiedHash: "hash-a",
      principalName: "Ada",
      role: "manager",
    });
    ok("login_not_found", r && r.ok === false && r.code === "not_found");
    ok(
      "login_not_found_rollback",
      h.calls.some((c) => c.op === "rollback") &&
        !h.calls.some((c) => c.op === "commit")
    );
  }

  {
    const h = makeSessionHarness({ insertThrows: true });
    let threw = null;
    try {
      await h.mod.createStaffSessionIfUnchanged({
        staffId: 7,
        verifiedHash: "hash-a",
        principalName: "Ada",
        role: "manager",
      });
    } catch (e) {
      threw = e;
    }
    ok("login_insert_rethrows", threw && threw.message === "insert boom");
    ok(
      "login_insert_rollback_release",
      h.calls.some((c) => c.op === "rollback") &&
        h.calls.some((c) => c.op === "release") &&
        !h.calls.some((c) => c.op === "commit")
    );
  }
}

// ─── admin-login source + identity hashes ───────────────────────────────────

function runLoginSourceTests() {
  console.log("\n# admin-login source");
  const login = read("pages/api/admin-login.ts");
  const loginBase = gitShow(BASE, "pages/api/admin-login.ts");
  const tx = read("lib/adminStaffPasswordTx.ts");
  const txBase = gitShow(BASE, "lib/adminStaffPasswordTx.ts");

  ok(
    "login_helper_imported",
    /createStaffSessionIfUnchanged/.test(login) &&
      /from ["'].*adminStaffPasswordTx["']/.test(login)
  );
  ok(
    "login_helper_used_staff",
    /createStaffSessionIfUnchanged\(\{[\s\S]*?staffId:/.test(login)
  );

  const recoveryIdx = login.indexOf("// ── Recovery Admin");
  const staffPart = recoveryIdx >= 0 ? login.slice(0, recoveryIdx) : login;
  const masterPart = recoveryIdx >= 0 ? login.slice(recoveryIdx) : "";
  ok(
    "login_no_createAdminSession_in_staff",
    !/createAdminSession\(/.test(staffPart)
  );
  ok(
    "login_createAdminSession_in_master",
    /createAdminSession\(/.test(masterPart)
  );

  const recNow = recoveryBlock(login);
  const recBase = recoveryBlock(loginBase);
  ok(
    "login_recovery_byte_identical",
    !!recNow && !!recBase && sha256(recNow) === sha256(recBase),
    `now=${sha256(recNow || "")} base=${sha256(recBase || "")}`
  );

  ok(
    "login_ok_false_401_public",
    /if\s*\(\s*!session\.ok\s*\)\s*\{[\s\S]*?status\(401\)[\s\S]*?PUBLIC_INVALID/.test(
      login
    )
  );
  ok(
    "login_success_json_unchanged",
    /success:\s*true[\s\S]*?principalType:\s*"staff"[\s\S]*?staffUser:\s*true/.test(
      login
    )
  );
  ok("login_rl_auth_unchanged", /RL_AUTH\(getClientIp\(req\)\)/.test(login));
  ok(
    "login_400_missing_unchanged",
    /if\s*\(\s*!username\s*\|\|\s*!password\s*\)\s*\{[\s\S]*?status\(400\)/.test(
      login
    )
  );
  ok(
    "login_upgrade_hash_before_helper",
    /upgradeHash\s*=\s*verified\.needsUpgrade[\s\S]*?createStaffSessionIfUnchanged/.test(
      login
    )
  );

  const applyNow = extractFn(tx, "applyStaffPasswordChange");
  const applyBase = extractFn(txBase, "applyStaffPasswordChange");
  ok(
    "applyStaffPasswordChange_byte_identical",
    !!applyNow && !!applyBase && sha256(applyNow) === sha256(applyBase),
    `now=${sha256(applyNow || "")} base=${sha256(applyBase || "")}`
  );
  ok(
    "createStaffSessionIfUnchanged_exported",
    /export async function createStaffSessionIfUnchanged/.test(tx)
  );
}

// ─── no-forbidden-diff ──────────────────────────────────────────────────────

function runDiffAllowlist() {
  console.log("\n# no-forbidden-diff");
  const allowed = new Set([
    "scripts/live-health-check.js",
    "lib/contentDraftClient.ts",
    "components/admin/CmsDraftBar.tsx",
    "lib/adminStaffPasswordTx.ts",
    "pages/api/admin-login.ts",
    "scripts/phase-multi-145-tests.js",
    // Coupled allowlist / harness plumbing only
    "scripts/phase-multi-93-tests.js",
    "scripts/phase-multi-95-tests.js",
    "scripts/phase-multi-96-tests.js",
    "scripts/phase-multi-97-tests.js",
    "scripts/phase-multi-107-tests.js",
    "scripts/phase-multi-109-tests.js",
    "scripts/phase-multi-110-tests.js",
    "scripts/phase-seasonal-ux-72-tests.js",
    "scripts/phase-multi-116-tests.js",
    "scripts/phase-multi-131-tests.js",
    "scripts/phase-multi-132-tests.js",
    "scripts/phase-multi-133-tests.js",
    "scripts/phase-multi-135-tests.js",
    "scripts/phase-multi-136-tests.js",
    "scripts/phase-multi-138-tests.js",
    "scripts/phase-multi-139-tests.js",
    "scripts/phase-multi-140-tests.js",
    "scripts/phase-multi-142-tests.js",
    "scripts/phase-multi-143-tests.js",
    "scripts/phase-multi-144-tests.js",
    "scripts/phase-multi-137-tests.js",
    "scripts/phase-multi-130-tests.js",
    "scripts/phase-multi-135-tests.js",

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
  runHealthTests();
  runDraftTests();
  await runLoginHelperTests();
  runLoginSourceTests();
  runDiffAllowlist();
  console.log(`\nphase-multi-145: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
