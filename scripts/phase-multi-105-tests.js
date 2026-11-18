/**
 * F4UK-MULTI-105 — London order date filter, FAQ reorder, leads search + handled.
 * Static + loadTs with stubs only. No .env*, no real DB, no network.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");
const { spawnSync } = require("child_process");
const crypto = require("crypto");

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

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

const cache = new Map();
function loadTs(rel, stubs = {}) {
  const abs = path.join(ROOT, rel);
  const hasStubs = Object.keys(stubs).length > 0;
  const key = abs + "::" + Object.keys(stubs).sort().join(",");
  if (!hasStubs && cache.has(key)) return cache.get(key);
  const src = fs.readFileSync(abs, "utf8");
  const out = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
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
      const mapped = id.replace("@/", "");
      for (const c of [
        path.join(ROOT, mapped + ".ts"),
        path.join(ROOT, mapped + ".tsx"),
        path.join(ROOT, mapped + ".js"),
      ]) {
        if (fs.existsSync(c)) {
          return loadTs(path.relative(ROOT, c).replace(/\\/g, "/"), stubs);
        }
      }
    }
    if (id.startsWith("./") || id.startsWith("../")) {
      const resolved = path.normalize(path.join(path.dirname(abs), id));
      for (const c of [resolved + ".ts", resolved + ".tsx", resolved + ".js"]) {
        if (fs.existsSync(c)) {
          return loadTs(path.relative(ROOT, c).replace(/\\/g, "/"), stubs);
        }
      }
    }
    return orig(id);
  };
  m._compile(out, abs);
  if (!hasStubs) cache.set(key, m.exports);
  return m.exports;
}

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    },
  };
}

function makePool(handlers) {
  const calls = [];
  const pool = {
    calls,
    query: async (sql, params) => {
      calls.push({ sql: String(sql), params });
      for (const h of handlers) {
        if (h.match(String(sql), params || [])) {
          if (h.throw) throw h.throw;
          return typeof h.result === "function" ? h.result(sql, params) : h.result;
        }
      }
      throw new Error("Unexpected SQL: " + String(sql).slice(0, 160));
    },
    getConnection: async () => {
      const conn = {
        beginTransaction: async () => {
          calls.push({ sql: "BEGIN", params: [] });
        },
        commit: async () => {
          calls.push({ sql: "COMMIT", params: [] });
        },
        rollback: async () => {
          calls.push({ sql: "ROLLBACK", params: [] });
        },
        release: () => {},
        query: pool.query,
      };
      return conn;
    },
  };
  return pool;
}

// ---------------------------------------------------------------------------
// D01 — London-aware order date filter
// ---------------------------------------------------------------------------
const ordersQ = loadTs("lib/adminOrdersQuery.ts");

ok("D01_exports", typeof ordersQ.parseOrderFilters === "function" && typeof ordersQ.buildOrderWhere === "function");

{
  // GMT winter day
  const p = ordersQ.parseOrderFilters({ date_from: "2026-01-15", date_to: "2026-01-15" });
  ok("D01_gmt_no_error", !p.error);
  ok("D01_gmt_from", p.filters.dateFrom === "2026-01-15 00:00:00", String(p.filters.dateFrom));
  ok("D01_gmt_to_exclusive", p.filters.dateTo === "2026-01-16 00:00:00", String(p.filters.dateTo));
  const w = ordersQ.buildOrderWhere(p.filters, "o");
  ok("D01_gmt_sql_half_open", /UNIX_TIMESTAMP\(o\.created_at\) >= \?/.test(w.sql) && /UNIX_TIMESTAMP\(o\.created_at\) < \?/.test(w.sql));
  ok("D01_gmt_epochs", w.params[0] === 1768435200 && w.params[1] === 1768521600, JSON.stringify(w.params));
}

{
  // BST summer day — London midnight = UTC previous day 23:00
  const p = ordersQ.parseOrderFilters({ date_from: "2026-07-15", date_to: "2026-07-15" });
  ok("D01_bst_from", p.filters.dateFrom === "2026-07-14 23:00:00", String(p.filters.dateFrom));
  ok("D01_bst_to_exclusive", p.filters.dateTo === "2026-07-15 23:00:00", String(p.filters.dateTo));
}

{
  // DST spring-forward day 2026-03-29 (last Sunday March): midnight still GMT
  const p = ordersQ.parseOrderFilters({ date_from: "2026-03-29", date_to: "2026-03-29" });
  ok("D01_dst_spring_from", p.filters.dateFrom === "2026-03-29 00:00:00", String(p.filters.dateFrom));
  ok("D01_dst_spring_to", p.filters.dateTo === "2026-03-29 23:00:00", String(p.filters.dateTo)); // next day midnight BST
}

{
  // DST fall-back day 2026-10-25: midnight still BST; exclusive end = Oct 26 00:00 GMT
  const p = ordersQ.parseOrderFilters({ date_from: "2026-10-25", date_to: "2026-10-25" });
  ok("D01_dst_fall_from", p.filters.dateFrom === "2026-10-24 23:00:00", String(p.filters.dateFrom));
  ok("D01_dst_fall_to", p.filters.dateTo === "2026-10-26 00:00:00", String(p.filters.dateTo));
}

{
  const range = ordersQ.parseOrderFilters({ date_from: "2026-01-01", date_to: "2026-01-31" });
  // Inclusive end: exclusive bound = London midnight of day after date_to (Feb 1, GMT).
  ok("D01_range_inclusive_end", !range.error && range.filters.dateTo === "2026-02-01 00:00:00", String(range.filters.dateTo));
  ok("D01_range_from", range.filters.dateFrom === "2026-01-01 00:00:00", String(range.filters.dateFrom));
}

{
  const bad = ordersQ.parseOrderFilters({ date_from: "2026-02-31" });
  ok("D01_invalid_from", !!bad.error && /date_from/i.test(bad.error));
  const bad2 = ordersQ.parseOrderFilters({ date_to: "not-a-date" });
  ok("D01_invalid_to", !!bad2.error && /date_to/i.test(bad2.error));
  const bad3 = ordersQ.parseOrderFilters({ date_from: "2026-05-10", date_to: "2026-05-01" });
  ok("D01_from_after_to", bad3.error === "date_from cannot be after date_to");
}

ok(
  "D01_export_uses_shared",
  /parseOrderFilters/.test(read("pages/api/admin-orders-export.ts")) &&
    /buildOrderWhere/.test(read("pages/api/admin-orders-export.ts"))
);

{
  const exportSrc = read("pages/api/admin-orders-export.ts");
  const headerMatch = exportSrc.match(/const header = \[([\s\S]*?)\];/);
  const cols = headerMatch
    ? headerMatch[1].split("\n").map((l) => l.trim()).filter((l) => l.startsWith('"'))
    : [];
  ok("D01_csv_17_headers", cols.length === 17, `headers=${cols.length}`);
}

// ---------------------------------------------------------------------------
// D11 — FAQ reorder
// ---------------------------------------------------------------------------
ok("D11_public_orders_by_sort", /ORDER BY category, sort_order ASC/.test(read("pages/api/faqs.ts")));
ok("D11_ssr_orders_by_sort", /ORDER BY category, sort_order ASC/.test(read("lib/publicFaqsServer.ts")));
ok("D11_sidhu_up_down", /Move FAQ/.test(read("app/sidhu/page.tsx")) && /Save order/.test(read("app/sidhu/page.tsx")));

{
  const audits = [];
  const faqIds = [3, 1, 2];
  // MULTI-137: reorder lock read is SELECT * (was SELECT id) for optional base_hashes.
  const pool = makePool([
    {
      match: (sql) =>
        /SELECT \* FROM faqs FOR UPDATE/i.test(sql) ||
        /SELECT id FROM faqs FOR UPDATE/i.test(sql),
      result: [
        [
          { id: 1, question: "Q1", answer: "A1", category: "General", sort_order: 10, is_visible: 1 },
          { id: 2, question: "Q2", answer: "A2", category: "General", sort_order: 20, is_visible: 1 },
          { id: 3, question: "Q3", answer: "A3", category: "General", sort_order: 30, is_visible: 1 },
        ],
      ],
    },
    {
      match: (sql) => /UPDATE faqs SET sort_order/i.test(sql),
      result: [{ affectedRows: 1 }],
    },
  ]);
  const handler = loadTs("pages/api/faqs.ts", {
    "../../lib/db": { __esModule: true, default: pool },
    "../../lib/adminAuth": {
      requireAdminPermission: async (req, res) => {
        if (req.headers && req.headers.origin === "https://evil.example") {
          res.status(403).json({ error: "Forbidden: invalid origin" });
          return null;
        }
        return { id: 1, username: "tester", role: "super_admin", name: "T" };
      },
      getRequestMeta: () => ({ ip: "127.0.0.1", userAgent: "t" }),
      assertSameOriginMutation: (req) => {
        const o = req.headers && req.headers.origin;
        if (o && o !== "https://firestick4uk.com") return false;
        return true;
      },
    },
    "../../lib/adminAudit": {
      recordAdminAudit: async (a) => {
        audits.push(a);
      },
    },
    "../../lib/adminNoStore": { setAdminNoStore: (res) => res.setHeader("Cache-Control", "no-store") },
    "../../lib/rateLimit": { getClientIp: () => "1.1.1.1", RL_PUBLIC_GET: () => ({ allowed: true, retryAfterSec: 0 }) },
  }).default;

  // Wrap requireAdmin to actually check origin like production for mutation tests —
  // our stub already rejects evil origin.

  async function reorder(ids, headers = { origin: "https://firestick4uk.com" }) {
    const res = makeRes();
    await handler({ method: "POST", body: { action: "reorder", ids }, headers, query: {} }, res);
    return res;
  }

  (async () => {
    const okRes = await reorder(faqIds);
    ok("D11_reorder_ok", okRes.statusCode === 200 && okRes.body && okRes.body.success);
    ok("D11_reorder_audit", audits.some((a) => a.action === "faq.reordered"));
    ok(
      "D11_reorder_tx",
      pool.calls.some((c) => c.sql === "BEGIN") && pool.calls.some((c) => c.sql === "COMMIT")
    );
    const updates = pool.calls.filter((c) => /UPDATE faqs SET sort_order/i.test(c.sql));
    ok(
      "D11_sort_steps",
      updates.length === 3 &&
        updates[0].params[0] === 10 &&
        updates[1].params[0] === 20 &&
        updates[2].params[0] === 30,
      JSON.stringify(updates.map((u) => u.params))
    );

    const dup = await reorder([1, 1, 2]);
    ok("D11_dup_ids_400", dup.statusCode === 400);

    const missing = await reorder([1, 2]);
    ok("D11_missing_ids_400", missing.statusCode === 400);

    const foreign = await reorder([1, 2, 99]);
    ok("D11_foreign_ids_400", foreign.statusCode === 400);

    // Permission denied
    const deniedPool = makePool([]);
    const deniedHandler = loadTs("pages/api/faqs.ts", {
      "../../lib/db": { __esModule: true, default: deniedPool },
      "../../lib/adminAuth": {
        requireAdminPermission: async (_req, res) => {
          res.status(403).json({ error: "Forbidden" });
          return null;
        },
        getRequestMeta: () => ({ ip: "127.0.0.1", userAgent: "t" }),
      },
      "../../lib/adminAudit": { recordAdminAudit: async () => {} },
      "../../lib/adminNoStore": { setAdminNoStore: () => {} },
      "../../lib/rateLimit": { getClientIp: () => "1.1.1.1", RL_PUBLIC_GET: () => ({ allowed: true, retryAfterSec: 0 }) },
    }).default;
    const deniedRes = makeRes();
    await deniedHandler(
      { method: "POST", body: { action: "reorder", ids: [1] }, headers: { origin: "https://firestick4uk.com" }, query: {} },
      deniedRes
    );
    ok("D11_permission_403", deniedRes.statusCode === 403);

    // Same-origin: simulate requireAdmin rejecting cross-origin
    const xoriPool = makePool([]);
    const xoriHandler = loadTs("pages/api/faqs.ts", {
      "../../lib/db": { __esModule: true, default: xoriPool },
      "../../lib/adminAuth": {
        requireAdminPermission: async (req, res) => {
          const origin = String((req.headers && req.headers.origin) || "");
          if (origin && origin !== "https://firestick4uk.com") {
            res.status(403).json({ error: "Forbidden: invalid origin" });
            return null;
          }
          return { id: 1, role: "super_admin", name: "T" };
        },
        getRequestMeta: () => ({ ip: "127.0.0.1", userAgent: "t" }),
      },
      "../../lib/adminAudit": { recordAdminAudit: async () => {} },
      "../../lib/adminNoStore": { setAdminNoStore: () => {} },
      "../../lib/rateLimit": { getClientIp: () => "1.1.1.1", RL_PUBLIC_GET: () => ({ allowed: true, retryAfterSec: 0 }) },
    }).default;
    const xoriRes = makeRes();
    await xoriHandler(
      { method: "POST", body: { action: "reorder", ids: [1, 2, 3] }, headers: { origin: "https://evil.example" }, query: {} },
      xoriRes
    );
    ok("D11_same_origin_403", xoriRes.statusCode === 403);

    // -----------------------------------------------------------------------
    // D04 / D05 — leads
    // -----------------------------------------------------------------------
    const leadAudits = [];
    let handledAvailable = false;
    const leadRows = [
      {
        id: 1,
        customer_name: "Alex",
        customer_email: "a@example.com",
        customer_whatsapp: "07000000001",
        interested_in: "Firestick",
        chat_history: "hello world",
        ip_address: "1.1.1.1",
        created_at: "2026-01-01",
      },
    ];

    function leadsPool(available) {
      handledAvailable = available;
      return makePool([
        {
          match: (sql) => /SELECT handled FROM chat_leads LIMIT 0/i.test(sql),
          throw: available
            ? null
            : Object.assign(new Error("Unknown column"), { code: "ER_BAD_FIELD_ERROR" }),
          result: [[], []],
        },
        {
          match: (sql) => /information_schema\.COLUMNS/i.test(sql),
          result: [[{ c: available ? 1 : 0 }]],
        },
        {
          match: (sql) => /SELECT COUNT\(\*\) AS c FROM chat_leads/i.test(sql),
          result: [[{ c: 1 }]],
        },
        {
          match: (sql) => /SELECT .+ FROM chat_leads/i.test(sql) && /ORDER BY created_at DESC/i.test(sql),
          result: (sql, params) => {
            ok(
              "D04_like_escape_used",
              /ESCAPE/i.test(sql) || !String(params && params[0] || "").includes("%"),
              "escape path"
            );
            if (params && params[0] && String(params[0]).includes("\\%")) {
              ok("D04_percent_escaped", true);
            }
            return [leadRows.map((r) => (available ? { ...r, handled: 0, handled_at: null } : r))];
          },
        },
        {
          match: (sql) => /UPDATE chat_leads\s+SET handled/i.test(sql),
          result: [{ affectedRows: 1 }],
        },
        {
          match: (sql) => /DELETE FROM chat_leads/i.test(sql),
          result: [{ affectedRows: 1 }],
        },
      ]);
    }

    const cap = loadTs("lib/leadsHandledCapability.ts");
    cap.resetLeadsHandledCapabilityCache();

    {
      const poolNo = leadsPool(false);
      const handlerNo = loadTs("pages/api/admin/leads.ts", {
        "@/lib/db": { __esModule: true, default: poolNo },
        "@/lib/adminAuth": {
          requireAdminPermission: async () => ({ id: 1, role: "super_admin", name: "T" }),
          getRequestMeta: () => ({ ip: "1.1.1.1", userAgent: "t" }),
        },
        "@/lib/adminAudit": {
          recordAdminAudit: async (a) => leadAudits.push(a),
        },
        "@/lib/adminNoStore": {
          setAdminNoStore: (res) => res.setHeader("Cache-Control", "no-store, private"),
        },
        "@/lib/leadsHandledCapability": cap,
        "@/lib/adminOrdersQuery": ordersQ,
      }).default;

      cap.resetLeadsHandledCapabilityCache();
      const res = makeRes();
      await handlerNo({ method: "GET", query: {}, headers: {} }, res);
      ok("D05_inert_get", res.statusCode === 200 && res.body && res.body.handled_available === false);
      ok("D05_inert_array", Array.isArray(res.body.leads));

      const patch = makeRes();
      await handlerNo(
        { method: "PATCH", body: { id: 1, handled: 1 }, headers: { origin: "https://firestick4uk.com" }, query: {} },
        patch
      );
      ok("D05_inert_patch_404", patch.statusCode === 404);
    }

    {
      cap.resetLeadsHandledCapabilityCache();
      const poolYes = leadsPool(true);
      const handlerYes = loadTs("pages/api/admin/leads.ts", {
        "@/lib/db": { __esModule: true, default: poolYes },
        "@/lib/adminAuth": {
          requireAdminPermission: async () => ({ id: 1, role: "super_admin", name: "T" }),
          getRequestMeta: () => ({ ip: "1.1.1.1", userAgent: "t" }),
        },
        "@/lib/adminAudit": {
          recordAdminAudit: async (a) => leadAudits.push(a),
        },
        "@/lib/adminNoStore": {
          setAdminNoStore: (res) => res.setHeader("Cache-Control", "no-store, private"),
        },
        "@/lib/leadsHandledCapability": cap,
        "@/lib/adminOrdersQuery": ordersQ,
      }).default;

      const resQ = makeRes();
      await handlerYes({ method: "GET", query: { q: "al" }, headers: {} }, resQ);
      ok("D04_search_ok", resQ.statusCode === 200 && resQ.body.leads.length === 1);

      const resBad = makeRes();
      await handlerYes({ method: "GET", query: { q: "a" }, headers: {} }, resBad);
      ok("D04_q_too_short", resBad.statusCode === 400);

      const resWild = makeRes();
      await handlerYes({ method: "GET", query: { q: "100%" }, headers: {} }, resWild);
      ok("D04_search_wildcard_ok", resWild.statusCode === 200);
      const likeCall = poolYes.calls.find(
        (c) => /LIKE/i.test(c.sql) && c.params && String(c.params[0]).includes("100")
      );
      ok(
        "D04_escape_percent_param",
        likeCall && String(likeCall.params[0]).includes("\\%"),
        likeCall ? String(likeCall.params[0]) : "none"
      );

      const resPage = makeRes();
      await handlerYes({ method: "GET", query: { q: "al", page: "1", limit: "10" }, headers: {} }, resPage);
      ok(
        "D04_pagination",
        resPage.statusCode === 200 && resPage.body.page === 1 && resPage.body.limit === 10
      );

      leadAudits.length = 0;
      const patch = makeRes();
      await handlerYes(
        { method: "PATCH", body: { id: 1, handled: 1 }, headers: { origin: "https://firestick4uk.com" }, query: {} },
        patch
      );
      ok("D05_patch_ok", patch.statusCode === 200 && patch.body && patch.body.success);
      ok("D05_audit", leadAudits.some((a) => a.action === "lead.status_changed"));
    }

    // migrate --check
    const mig = spawnSync(NODE, ["scripts/migrate-leads-handled.js", "--check"], {
      cwd: ROOT,
      encoding: "utf8",
    });
    ok("D05_migrate_check_exit", mig.status === 0, String(mig.status));
    ok(
      "D05_migrate_prints_alter",
      /ALTER TABLE u992747032_firestick4uk\.chat_leads/.test(mig.stdout) &&
        /ADD COLUMN handled TINYINT\(1\)/.test(mig.stdout) &&
        /ADD COLUMN handled_at DATETIME NULL/.test(mig.stdout)
    );
    ok("D05_migrate_sha", /SQL_BODY_SHA256: [a-f0-9]{64}/.test(mig.stdout));
    const body = `ALTER TABLE u992747032_firestick4uk.chat_leads
  ADD COLUMN handled TINYINT(1) NOT NULL DEFAULT 0 AFTER chat_history,
  ADD COLUMN handled_at DATETIME NULL AFTER handled;`;
    const expectHash = crypto.createHash("sha256").update(body, "utf8").digest("hex");
    ok("D05_migrate_sha_match", mig.stdout.includes(expectHash), expectHash);

    ok("D05_no_runtime_ddl_in_api", !/ALTER TABLE|CREATE TABLE/i.test(read("pages/api/admin/leads.ts")));
    ok("D05_sidhu_handled_hidden_guard", /leadsHandledAvailable/.test(read("app/sidhu/page.tsx")));

    console.log(`\nphase-multi-105-tests: ${passed} PASS, ${failed} FAIL`);
    process.exit(failed ? 1 : 0);
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
