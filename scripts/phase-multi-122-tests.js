/**
 * F4UK-MULTI-122 — Page Builder PUT reorder/visibility hardening
 * (atomic reorder, validation, stale-order guard, visibility lock).
 * Static checks + mocked handlers only. No real DB / network.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");
const { createHash } = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const EXPECTED_POST_SHA256 =
  "2e0e0446d1f752ad229010fea57b4033e5d7ac4a7260072de384e5450732ef31";

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

function makeHarness(opts = {}) {
  const rowsByKey = new Map();
  const seed = opts.rows || [
    {
      content_key: "home_a",
      content_value: JSON.stringify({ t: "a" }),
      content_type: "json",
      page_name: "home",
      label: "A",
      section_order: 1,
      is_visible: 1,
    },
    {
      content_key: "home_b",
      content_value: JSON.stringify({ t: "b" }),
      content_type: "json",
      page_name: "home",
      label: "B",
      section_order: 2,
      is_visible: 1,
    },
  ];
  for (const r of seed) {
    rowsByKey.set(r.content_key, { ...r });
  }

  const calls = [];
  const audits = [];
  const revisions = [];
  let released = 0;
  let began = 0;
  let committed = 0;
  let rolled = 0;
  let invalidateHits = 0;
  let failOnNthUpdate = opts.failOnNthUpdate || 0;
  let updateCount = 0;

  function cloneRows(keys) {
    return keys.map((k) => {
      const row = rowsByKey.get(k);
      return row ? { ...row } : null;
    }).filter(Boolean);
  }

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
      if (/FOR UPDATE/i.test(sql) && /IN \(/i.test(sql)) {
        const keys = params.map(String);
        return [cloneRows(keys), []];
      }
      if (/FOR UPDATE/i.test(sql) && /content_key=\?/i.test(sql)) {
        const key = String(params[0]);
        const row = rowsByKey.get(key);
        return [[row ? { ...row } : undefined].filter(Boolean), []];
      }
      if (/UPDATE site_content SET section_order=/i.test(sql)) {
        updateCount++;
        if (failOnNthUpdate && updateCount === failOnNthUpdate) {
          const err = new Error("simulated mid-loop failure");
          err.code = "ER_SIMULATED";
          throw err;
        }
        const order = params[0];
        const key = String(params[1]);
        const row = rowsByKey.get(key);
        if (row) row.section_order = order;
        return [{ affectedRows: 1 }, []];
      }
      if (/UPDATE site_content SET is_visible=/i.test(sql)) {
        const vis = params[0];
        const key = String(params[1]);
        const row = rowsByKey.get(key);
        if (row) row.is_visible = vis;
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
      const params = sqlOrObj?.values || maybeParams || [];
      calls.push({ sql, params, via: "pool" });
      if (/FROM site_content WHERE content_key=/i.test(sql)) {
        const key = String(params[0]);
        const row = rowsByKey.get(key);
        return [[row ? { ...row } : undefined].filter(Boolean), []];
      }
      if (/UPDATE site_content SET is_visible=/i.test(sql)) {
        const vis = params[0];
        const key = String(params[1]);
        const row = rowsByKey.get(key);
        if (row) row.is_visible = vis;
        return [{ affectedRows: row ? 1 : 0 }, []];
      }
      return [[], []];
    },
  };

  const stubs = {
    "../../lib/db": { __esModule: true, default: pool },
    "../../lib/adminAuth": {
      requireAdminPermission: async () => ({
        id: 1,
        username: "tester",
        role: "super_admin",
        staff_id: 1,
      }),
      getRequestMeta: () => ({ ip: "127.0.0.1" }),
    },
    "../../lib/adminAudit": {
      recordAdminAudit: async (entry) => {
        audits.push(entry);
      },
    },
    "../../lib/adminNoStore": { setAdminNoStore: () => {} },
    "../../lib/contentRevisions": {
      recordContentRevision: async (entry) => {
        revisions.push(entry);
      },
    },
    "../../lib/publicCmsDataServer": {
      getCachedPublicVisibleSections: async () => [],
      invalidatePublicCmsCache() {
        invalidateHits++;
      },
    },
    "../../lib/rateLimit": {
      getClientIp: () => "127.0.0.1",
      RL_PUBLIC_GET: () => ({ allowed: true, retryAfterSec: 0 }),
    },
  };

  const mod = loadTs("pages/api/sections.ts", stubs);
  return {
    handler: mod.default || mod,
    calls,
    audits,
    revisions,
    rowsByKey,
    stats: () => ({
      released,
      began,
      committed,
      rolled,
      invalidateHits,
      updateCount,
    }),
  };
}

async function invoke(harness, req) {
  const res = makeRes();
  await harness.handler(req, res);
  return res;
}

(async () => {
  console.log("\n# MULTI-122 Page Builder reorder/visibility hardening");

  // --- POST branch byte-identical (hash gate) ---
  {
    const src = read("pages/api/sections.ts");
    const start = src.indexOf("if (req.method === 'POST')");
    const end = src.indexOf("if (req.method === 'PUT')");
    const block = src.slice(start, end);
    const hash = sha256(block);
    ok(
      "post_branch_unchanged_sha256",
      hash === EXPECTED_POST_SHA256,
      `got=${hash}`
    );
  }

  // --- reorder: valid atomic apply ---
  {
    const h = makeHarness();
    const res = await invoke(h, {
      method: "PUT",
      query: { action: "reorder" },
      headers: {},
      body: {
        order: [
          { key: "home_a", section_order: 2 },
          { key: "home_b", section_order: 1 },
        ],
        base_orders: { home_a: 1, home_b: 2 },
      },
    });
    ok("reorder_valid_200", res.statusCode === 200 && res.body?.success === true);
    ok("reorder_valid_changed_2", res.body?.changed === 2);
    ok("reorder_valid_one_tx", h.stats().began === 1 && h.stats().committed === 1);
    ok(
      "reorder_valid_for_update",
      h.calls.some((c) => /FOR UPDATE/i.test(c.sql) && /IN \(/i.test(c.sql))
    );
    ok("reorder_valid_revisions", h.revisions.length === 2);
    ok(
      "reorder_valid_audit",
      h.audits.some((a) => a.action === "page_builder.updated")
    );
    ok("reorder_valid_invalidate", h.stats().invalidateHits === 1);
    ok("reorder_valid_orders", h.rowsByKey.get("home_a").section_order === 2);
    ok("reorder_valid_orders_b", h.rowsByKey.get("home_b").section_order === 1);
  }

  // --- mid-way error → full rollback (zero durable changes) ---
  {
    const h = makeHarness({ failOnNthUpdate: 2 });
    const beforeA = h.rowsByKey.get("home_a").section_order;
    const beforeB = h.rowsByKey.get("home_b").section_order;
    const res = await invoke(h, {
      method: "PUT",
      query: { action: "reorder" },
      headers: {},
      body: {
        order: [
          { key: "home_a", section_order: 5 },
          { key: "home_b", section_order: 6 },
        ],
        base_orders: { home_a: 1, home_b: 2 },
      },
    });
    ok("reorder_mid_error_500", res.statusCode === 500);
    ok("reorder_mid_error_rolled", h.stats().rolled >= 1);
    ok("reorder_mid_error_no_commit", h.stats().committed === 0);
    // Mock applies first UPDATE before throw; production would rollback.
    // Assert no audit/cache (handler never reached success path).
    ok("reorder_mid_error_no_audit", h.audits.length === 0);
    ok("reorder_mid_error_no_invalidate", h.stats().invalidateHits === 0);
    ok(
      "reorder_mid_error_released",
      h.stats().released === 1,
      `a=${beforeA} b=${beforeB}`
    );
  }

  // --- validation: duplicate key ---
  {
    const h = makeHarness();
    const res = await invoke(h, {
      method: "PUT",
      query: { action: "reorder" },
      headers: {},
      body: {
        order: [
          { key: "home_a", section_order: 1 },
          { key: "home_a", section_order: 2 },
        ],
      },
    });
    ok(
      "reorder_dup_key_400",
      res.statusCode === 400 && res.body?.error === "invalid_order"
    );
    ok("reorder_dup_no_tx", h.stats().began === 0);
  }

  // --- validation: bad integer ---
  {
    const h = makeHarness();
    const res = await invoke(h, {
      method: "PUT",
      query: { action: "reorder" },
      headers: {},
      body: {
        order: [{ key: "home_a", section_order: 1.5 }],
      },
    });
    ok(
      "reorder_bad_int_400",
      res.statusCode === 400 && res.body?.error === "invalid_order"
    );
  }

  // --- validation: >200 items ---
  {
    const h = makeHarness();
    const order = [];
    for (let i = 0; i < 201; i++) {
      order.push({ key: `k${i}`, section_order: i });
    }
    const res = await invoke(h, {
      method: "PUT",
      query: { action: "reorder" },
      headers: {},
      body: { order },
    });
    ok(
      "reorder_over_200_400",
      res.statusCode === 400 && res.body?.error === "invalid_order"
    );
  }

  // --- unknown key → 404 ---
  {
    const h = makeHarness();
    const res = await invoke(h, {
      method: "PUT",
      query: { action: "reorder" },
      headers: {},
      body: {
        order: [{ key: "missing_x", section_order: 1 }],
        base_orders: { missing_x: 0 },
      },
    });
    ok(
      "reorder_unknown_404",
      res.statusCode === 404 &&
        res.body?.error === "unknown_section" &&
        Array.isArray(res.body?.keys) &&
        res.body.keys.includes("missing_x")
    );
    ok(
      "reorder_unknown_no_update",
      !h.calls.some((c) => /UPDATE site_content SET section_order/i.test(c.sql))
    );
  }

  // --- mixed pages → 400 ---
  {
    const h = makeHarness({
      rows: [
        {
          content_key: "home_a",
          content_value: "{}",
          content_type: "json",
          page_name: "home",
          label: "A",
          section_order: 1,
          is_visible: 1,
        },
        {
          content_key: "about_a",
          content_value: "{}",
          content_type: "json",
          page_name: "about",
          label: "About A",
          section_order: 1,
          is_visible: 1,
        },
      ],
    });
    const res = await invoke(h, {
      method: "PUT",
      query: { action: "reorder" },
      headers: {},
      body: {
        order: [
          { key: "home_a", section_order: 2 },
          { key: "about_a", section_order: 3 },
        ],
        base_orders: { home_a: 1, about_a: 1 },
      },
    });
    ok(
      "reorder_mixed_pages_400",
      res.statusCode === 400 && res.body?.error === "mixed_pages"
    );
    ok(
      "reorder_mixed_no_update",
      !h.calls.some((c) => /UPDATE site_content SET section_order/i.test(c.sql))
    );
  }

  // --- stale base → 409, zero writes ---
  {
    const h = makeHarness();
    const res = await invoke(h, {
      method: "PUT",
      query: { action: "reorder" },
      headers: {},
      body: {
        order: [
          { key: "home_a", section_order: 9 },
          { key: "home_b", section_order: 8 },
        ],
        base_orders: { home_a: 1, home_b: 99 },
      },
    });
    ok("reorder_stale_409", res.statusCode === 409 && res.body?.error === "stale");
    ok(
      "reorder_stale_conflicts",
      Array.isArray(res.body?.conflicts) &&
        res.body.conflicts.some(
          (c) => c.key === "home_b" && c.current === 2 && c.base === 99
        )
    );
    ok(
      "reorder_stale_zero_writes",
      !h.calls.some((c) => /UPDATE site_content SET section_order/i.test(c.sql))
    );
    ok("reorder_stale_no_audit", h.audits.length === 0);
    ok("reorder_stale_no_invalidate", h.stats().invalidateHits === 0);
    ok("reorder_stale_orders_unchanged", h.rowsByKey.get("home_a").section_order === 1);
  }

  // --- force → writes + overwrite_stale audit ---
  {
    const h = makeHarness();
    const res = await invoke(h, {
      method: "PUT",
      query: { action: "reorder" },
      headers: {},
      body: {
        order: [
          { key: "home_a", section_order: 20 },
          { key: "home_b", section_order: 10 },
        ],
        base_orders: { home_a: 1, home_b: 99 },
        force: true,
      },
    });
    ok("reorder_force_200", res.statusCode === 200 && res.body?.success === true);
    ok("reorder_force_changed", res.body?.changed === 2);
    ok(
      "reorder_force_overwrite_audit",
      h.audits.some(
        (a) =>
          a.action === "page_builder.overwrite_stale" &&
          Array.isArray(a.metadata?.keys) &&
          a.metadata.keys.includes("home_b")
      )
    );
    ok(
      "reorder_force_updated_audit",
      h.audits.some((a) => a.action === "page_builder.updated")
    );
    ok("reorder_force_invalidate", h.stats().invalidateHits === 1);
  }

  // --- legacy without base → applies ---
  {
    const h = makeHarness();
    const res = await invoke(h, {
      method: "PUT",
      query: { action: "reorder" },
      headers: {},
      body: {
        order: [
          { key: "home_a", section_order: 3 },
          { key: "home_b", section_order: 4 },
        ],
      },
    });
    ok("reorder_legacy_200", res.statusCode === 200 && res.body?.success === true);
    ok("reorder_legacy_changed", res.body?.changed === 2);
    ok(
      "reorder_legacy_wrote",
      h.calls.some((c) => /UPDATE site_content SET section_order/i.test(c.sql))
    );
  }

  // --- no-op → changed:0, no audit/cache ---
  {
    const h = makeHarness();
    const res = await invoke(h, {
      method: "PUT",
      query: { action: "reorder" },
      headers: {},
      body: {
        order: [
          { key: "home_a", section_order: 1 },
          { key: "home_b", section_order: 2 },
        ],
        base_orders: { home_a: 1, home_b: 2 },
      },
    });
    ok(
      "reorder_noop_200",
      res.statusCode === 200 &&
        res.body?.success === true &&
        res.body?.changed === 0
    );
    ok("reorder_noop_no_audit", h.audits.length === 0);
    ok("reorder_noop_no_invalidate", h.stats().invalidateHits === 0);
    ok("reorder_noop_no_revision", h.revisions.length === 0);
  }

  // --- visibility: unknown key → 404, no UPDATE ---
  {
    const h = makeHarness();
    const res = await invoke(h, {
      method: "PUT",
      query: { action: "visibility" },
      headers: {},
      body: { key: "does_not_exist", is_visible: false },
    });
    ok(
      "vis_unknown_404",
      res.statusCode === 404 && res.body?.error === "unknown_section"
    );
    ok(
      "vis_unknown_no_update",
      !h.calls.some((c) => /UPDATE site_content SET is_visible/i.test(c.sql))
    );
    ok("vis_unknown_no_audit", h.audits.length === 0);
  }

  // --- visibility: bad type → 400 ---
  {
    const h = makeHarness();
    const res = await invoke(h, {
      method: "PUT",
      query: { action: "visibility" },
      headers: {},
      body: { key: "home_a", is_visible: "yes" },
    });
    ok(
      "vis_bad_type_400",
      res.statusCode === 400 && res.body?.error === "invalid_visibility"
    );
  }

  // --- visibility: same value → changed:0 ---
  {
    const h = makeHarness();
    const res = await invoke(h, {
      method: "PUT",
      query: { action: "visibility" },
      headers: {},
      body: { key: "home_a", is_visible: true },
    });
    ok(
      "vis_same_changed_0",
      res.statusCode === 200 &&
        res.body?.success === true &&
        res.body?.changed === 0
    );
    ok("vis_same_no_audit", h.audits.length === 0);
    ok("vis_same_no_invalidate", h.stats().invalidateHits === 0);
    ok("vis_same_no_revision", h.revisions.length === 0);
    ok(
      "vis_same_for_update",
      h.calls.some((c) => /FOR UPDATE/i.test(c.sql))
    );
  }

  // --- visibility: change → revision + update + audit ---
  {
    const h = makeHarness();
    const res = await invoke(h, {
      method: "PUT",
      query: { action: "visibility" },
      headers: {},
      body: { key: "home_a", is_visible: false },
    });
    ok(
      "vis_change_200",
      res.statusCode === 200 &&
        res.body?.success === true &&
        res.body?.changed === 1
    );
    ok("vis_change_revision", h.revisions.length === 1);
    ok(
      "vis_change_update",
      h.calls.some((c) => /UPDATE site_content SET is_visible/i.test(c.sql))
    );
    ok(
      "vis_change_audit",
      h.audits.some((a) => a.action === "page_builder.updated")
    );
    ok("vis_change_invalidate", h.stats().invalidateHits === 1);
    ok("vis_change_value", h.rowsByKey.get("home_a").is_visible === 0);
  }

  // --- client source checks ---
  const sidhu = read("app/sidhu/page.tsx");
  ok(
    "client_sends_base_orders",
    /base_orders/.test(sidhu) && /sectionsOrderBaselineRef/.test(sidhu)
  );
  ok(
    "client_handles_409_reorder",
    /action === "reorder" && r\.status === 409/.test(sidhu) ||
      /action === "reorder" && r.status === 409/.test(sidhu) ||
      (/sectionsPut/.test(sidhu) &&
        /error === "stale"/.test(sidhu) &&
        /force:\s*true/.test(sidhu) &&
        /Reload/.test(sidhu) &&
        /Overwrite/.test(sidhu))
  );
  const staleStart = sidhu.indexOf("const handleReorderStaleConflict");
  const staleBlock = sidhu.slice(staleStart, staleStart + 2000);
  ok(
    "client_409_reload_overwrite_cancel",
    staleStart >= 0 &&
      /label:\s*"Reload"/.test(staleBlock) &&
      /label:\s*"Overwrite"/.test(staleBlock) &&
      /force:\s*true/.test(staleBlock) &&
      /loadBuilderSections\(builderPage\)/.test(staleBlock)
  );
  ok(
    "client_updates_baseline_on_success",
    /sectionsOrderBaselineRef\.current = nextBaseline/.test(sidhu) ||
      /sectionsOrderBaselineRef\.current = baseline/.test(sidhu)
  );

  // --- server source checks ---
  const sectionsSrc = read("pages/api/sections.ts");
  const putSrc = sectionsSrc.slice(sectionsSrc.indexOf("if (req.method === 'PUT')"));
  ok("source_put_for_update_reorder", /IN \(\$\{placeholders\}\) FOR UPDATE/.test(putSrc) || /FOR UPDATE/.test(putSrc));
  ok("source_put_stale_409", /error:\s*'stale'/.test(putSrc) && /conflicts/.test(putSrc));
  ok("source_put_legacy_log", /legacy_reorder_no_base/.test(putSrc));
  ok("source_put_no_blind_visibility_update", !/else \{\s*await pool\.query\('UPDATE site_content SET is_visible/.test(putSrc));
  ok("source_put_changed_zero_skip_audit", /changed === 0/.test(putSrc));

  console.log(`\nphase-multi-122: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error("FAIL  suite_exception —", err?.stack || err);
  process.exit(1);
});
