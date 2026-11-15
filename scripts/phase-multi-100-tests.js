/**
 * F4UK-MULTI-100 — cancelled order status + cancel_reason + non-strict guard.
 * Static + mocked DB only. No .env*, no real DB, no network.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");
const crypto = require("crypto");
const { execSync } = require("child_process");

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

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

const cache = new Map();
function loadTs(rel, stubs = {}) {
  const abs = path.join(ROOT, rel);
  // Do not cache when stubs are present — stub object identity matters (mocked pools).
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
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql: String(sql), params });
      for (const h of handlers) {
        if (h.match(String(sql), params || [])) {
          if (h.throw) throw h.throw;
          return h.result;
        }
      }
      throw new Error("Unexpected SQL: " + String(sql).slice(0, 120));
    },
  };
}

(async () => {
  const queryLib = read("lib/adminOrdersQuery.ts");
  const adminOrders = read("pages/api/admin-orders.ts");
  const exportApi = read("pages/api/admin-orders-export.ts");
  const sidhu = read("app/sidhu/page.tsx");
  const tracking = read("app/order-tracking/page.tsx");
  const trackApi = read("pages/api/track.ts");
  const fields = read("lib/adminContentFields.ts");
  const migrate = read("scripts/migrate-order-cancelled-status.js");

  ok(
    "ORDER_STATUSES_includes_cancelled",
    /ORDER_STATUSES\s*=\s*\[[\s\S]*"cancelled"/.test(queryLib)
  );
  ok(
    "CANCEL_REASONS_complete",
    [
      "customer_cancelled",
      "cod_refused",
      "no_response",
      "duplicate_test",
      "payment_not_received",
      "other",
    ].every((c) => queryLib.includes(`"${c}"`))
  );
  ok(
    "summary_has_cancelled_orders_and_revenue_excludes",
    /cancelled_orders/.test(adminOrders) &&
      /status IN \('confirmed','dispatched','delivered'\)/.test(adminOrders) &&
      !/status IN \('confirmed','dispatched','delivered','cancelled'\)/.test(adminOrders)
  );
  ok(
    "patch_updates_status_and_cancel_reason",
    /UPDATE orders SET status = \?, cancel_reason = \? WHERE order_id = \?/.test(
      adminOrders
    )
  );
  ok(
    "patch_has_nonstrict_guard_and_failed_audit",
    /order\.status_change_failed/.test(adminOrders) &&
      /Status could not be saved\. Please contact the site admin\./.test(adminOrders) &&
      /ER_BAD_FIELD_ERROR/.test(adminOrders)
  );
  ok(
    "csv_still_17_headers",
    (() => {
      const m = exportApi.match(/const header = \[([\s\S]*?)\];/);
      if (!m) return false;
      const count = (m[1].match(/"/g) || []).length / 2;
      return count === 17 && !/cancel_reason/.test(m[1]);
    })()
  );
  ok(
    "sidhu_has_cancelled_filter_badge_modal",
    /option value="cancelled">Cancelled</.test(sidhu) &&
      /status-cancelled/.test(sidhu) &&
      /❌ Cancelled/.test(sidhu) &&
      /cancel-reason-modal/.test(sidhu) &&
      /cancelled_orders/.test(sidhu)
  );
  ok(
    "tracking_cancelled_ui_hides_steps",
    /track_status_cancelled/.test(tracking) &&
      /track_cancelled_msg/.test(tracking) &&
      /track-cancelled-msg/.test(tracking) &&
      /result\.status === "cancelled"/.test(tracking)
  );
  ok(
    "content_fields_track_cancelled",
    /track_status_cancelled/.test(fields) && /track_cancelled_msg/.test(fields)
  );
  ok(
    "track_api_does_not_select_cancel_reason",
    /SELECT order_id, status, created_at/.test(trackApi) &&
      !/cancel_reason/.test(trackApi)
  );
  ok(
    "migrate_script_check_only",
    exists("scripts/migrate-order-cancelled-status.js") &&
      /--check/.test(migrate) &&
      /never imported/i.test(migrate) &&
      /--apply is not supported/.test(migrate)
  );

  // migrate --check prints SQL + SHA256
  const migOut = execSync("node scripts/migrate-order-cancelled-status.js --check", {
    cwd: ROOT,
    encoding: "utf8",
  });
  const sqlMatch = migOut.match(/ALTER TABLE orders[\s\S]*?;/);
  ok("migrate_check_prints_sql", !!sqlMatch);
  if (sqlMatch) {
    const sha = crypto.createHash("sha256").update(sqlMatch[0].trim(), "utf8").digest("hex");
    ok("migrate_check_prints_matching_sha", migOut.includes(sha));
  }

  // Runtime DDL gate: this change must not introduce runtime ALTER/CREATE in API handlers.
  ok(
    "admin_orders_no_runtime_ddl",
    !/\b(ALTER|CREATE|DROP)\s+TABLE\b/i.test(adminOrders)
  );

  // ── Mocked PATCH handler tests ──────────────────────────────────────────
  const audits = [];
  const baseStubs = (pool) => ({
    "../../lib/db": pool,
    "../../lib/adminAuth": {
      getRequestMeta: () => ({ ip: "127.0.0.1" }),
      requireAdminPermission: async () => ({
        id: 1,
        role: "super_admin",
        email: "admin@example.com",
      }),
    },
    "../../lib/adminAudit": {
      recordAdminAudit: async (payload) => {
        audits.push(payload);
      },
    },
    "../../lib/adminNoStore": { setAdminNoStore: () => {} },
    "../../lib/adminPermissions": {
      hasAdminPermission: () => true,
    },
  });

  // Reason required
  {
    audits.length = 0;
    const pool = makePool([
      {
        match: (sql) => /SELECT order_id, status, cancel_reason/.test(sql),
        result: [[{ order_id: "FK-1", status: "pending", cancel_reason: null }], []],
      },
    ]);
    const handler = loadTs("pages/api/admin-orders.ts", baseStubs(pool)).default;
    const res = makeRes();
    await handler(
      {
        method: "PATCH",
        body: { order_id: "FK-1", status: "cancelled" },
        headers: {},
        query: {},
      },
      res
    );
    ok("cancelled_requires_reason_400", res.statusCode === 400);
    ok(
      "cancelled_requires_reason_body",
      res.body && res.body.error === "cancel_reason required"
    );
    ok("cancelled_requires_reason_no_update", !pool.calls.some((c) => /^UPDATE/i.test(c.sql.trim())));
  }

  // Invalid reason
  {
    audits.length = 0;
    const pool = makePool([]);
    const handler = loadTs("pages/api/admin-orders.ts", baseStubs(pool)).default;
    const res = makeRes();
    await handler(
      {
        method: "PATCH",
        body: { order_id: "FK-1", status: "cancelled", cancel_reason: "not_a_real_reason" },
        headers: {},
        query: {},
      },
      res
    );
    ok("invalid_reason_400", res.statusCode === 400);
  }

  // Other status clears reason + audit includes null reason
  {
    audits.length = 0;
    const pool = makePool([
      {
        match: (sql) => /SELECT order_id, status, cancel_reason FROM orders WHERE order_id/.test(sql),
        result: [
          [{ order_id: "FK-1", status: "cancelled", cancel_reason: "other" }],
          [],
        ],
      },
      {
        match: (sql) => /UPDATE orders SET status = \?, cancel_reason = \?/.test(sql),
        result: [{ affectedRows: 1 }, undefined],
      },
      {
        match: (sql) => /SELECT status, cancel_reason FROM orders WHERE order_id/.test(sql),
        result: [[{ status: "confirmed", cancel_reason: null }], []],
      },
    ]);
    const handler = loadTs("pages/api/admin-orders.ts", baseStubs(pool)).default;
    const res = makeRes();
    await handler(
      {
        method: "PATCH",
        body: { order_id: "FK-1", status: "confirmed" },
        headers: {},
        query: {},
      },
      res
    );
    const upd = pool.calls.find((c) => /UPDATE orders SET status/.test(c.sql));
    ok("other_status_clears_reason_params", upd && upd.params[0] === "confirmed" && upd.params[1] === null);
    ok("other_status_200", res.statusCode === 200);
    ok(
      "audit_includes_reason_null",
      audits.some(
        (a) =>
          a.action === "order.status_changed" &&
          a.metadata &&
          a.metadata.new_status === "confirmed" &&
          a.metadata.cancel_reason === null
      )
    );
  }

  // Successful cancel with reason in audit
  {
    audits.length = 0;
    let step = 0;
    const pool = {
      calls: [],
      query: async (sql, params) => {
        pool.calls.push({ sql: String(sql), params });
        const s = String(sql);
        if (step === 0 && /SELECT order_id, status, cancel_reason/.test(s)) {
          step = 1;
          return [[{ order_id: "FK-2", status: "pending", cancel_reason: null }], []];
        }
        if (step === 1 && /UPDATE orders SET status/.test(s)) {
          step = 2;
          return [{ affectedRows: 1 }, undefined];
        }
        if (step === 2 && /SELECT status, cancel_reason/.test(s)) {
          step = 3;
          return [[{ status: "cancelled", cancel_reason: "cod_refused" }], []];
        }
        throw new Error("Unexpected SQL at step " + step + ": " + s.slice(0, 120));
      },
    };
    const handler = loadTs("pages/api/admin-orders.ts", baseStubs(pool)).default;
    const res = makeRes();
    await handler(
      {
        method: "PATCH",
        body: {
          order_id: "FK-2",
          status: "cancelled",
          cancel_reason: "cod_refused",
        },
        headers: {},
        query: {},
      },
      res
    );
    ok("cancel_success_200", res.statusCode === 200, JSON.stringify(res.body));
    ok(
      "audit_includes_reason_code",
      audits.some(
        (a) =>
          a.action === "order.status_changed" &&
          a.metadata &&
          a.metadata.cancel_reason === "cod_refused" &&
          !JSON.stringify(a.metadata).includes("@") &&
          !JSON.stringify(a.summary || "").includes("@")
      )
    );
  }

  // GUARD: stored '' after update → restore + 500
  {
    audits.length = 0;
    const pool = makePool([
      {
        match: (sql) => /SELECT order_id, status, cancel_reason FROM orders WHERE order_id/.test(sql),
        result: [[{ order_id: "FK-3", status: "pending", cancel_reason: null }], []],
      },
      {
        match: (sql, params) =>
          /UPDATE orders SET status = \?, cancel_reason = \?/.test(sql) &&
          params[0] === "cancelled",
        result: [{ affectedRows: 1 }, undefined],
      },
      {
        match: (sql) => /SELECT status, cancel_reason FROM orders WHERE order_id/.test(sql),
        result: [[{ status: "", cancel_reason: null }], []],
      },
      {
        match: (sql, params) =>
          /UPDATE orders SET status = \?, cancel_reason = \?/.test(sql) &&
          params[0] === "pending",
        result: [{ affectedRows: 1 }, undefined],
      },
    ]);
    const handler = loadTs("pages/api/admin-orders.ts", baseStubs(pool)).default;
    const res = makeRes();
    await handler(
      {
        method: "PATCH",
        body: {
          order_id: "FK-3",
          status: "cancelled",
          cancel_reason: "other",
        },
        headers: {},
        query: {},
      },
      res
    );
    ok("guard_empty_status_500", res.statusCode === 500);
    ok(
      "guard_empty_status_message",
      res.body &&
        res.body.error ===
          "Status could not be saved. Please contact the site admin."
    );
    ok(
      "guard_restores_previous",
      pool.calls.some(
        (c) =>
          /UPDATE orders SET status/.test(c.sql) &&
          c.params &&
          c.params[0] === "pending" &&
          c.params[1] === null
      )
    );
    ok(
      "guard_audits_failed",
      audits.some((a) => a.action === "order.status_change_failed")
    );
  }

  // Missing column → no write + 500
  {
    audits.length = 0;
    const bad = new Error("Unknown column");
    bad.code = "ER_BAD_FIELD_ERROR";
    bad.name = "Error";
    const pool = makePool([
      {
        match: (sql) => /SELECT order_id, status, cancel_reason/.test(sql),
        throw: bad,
      },
    ]);
    const handler = loadTs("pages/api/admin-orders.ts", baseStubs(pool)).default;
    const res = makeRes();
    await handler(
      {
        method: "PATCH",
        body: {
          order_id: "FK-4",
          status: "cancelled",
          cancel_reason: "other",
        },
        headers: {},
        query: {},
      },
      res
    );
    ok("missing_column_500", res.statusCode === 500);
    ok(
      "missing_column_no_update",
      !pool.calls.some((c) => /UPDATE/i.test(c.sql))
    );
  }

  // Summary cancelled count via source + lib labels
  {
    const lib = loadTs("lib/adminOrdersQuery.ts", {});
    ok(
      "cancel_reason_label_helper",
      lib.cancelReasonLabel("customer_cancelled") === "Customer cancelled" &&
        lib.isCancelReason("other") &&
        !lib.isCancelReason("nope")
    );
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
