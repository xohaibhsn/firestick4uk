/**
 * F4UK-INSIGHTS-W2-60 — Phase 2 Insights screens/APIs (INERT).
 * Mocked DB / RBAC / pure maths / static contracts only. No .env*, no real DB.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const ts = require("typescript");

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

const cache = new Map();

function loadTsModule(rel, stubs = {}) {
  const stubKey = Object.keys(stubs)
    .sort()
    .map((k) => k + "=" + typeof stubs[k])
    .join(",");
  const key = rel + "::" + stubKey;
  if (cache.has(key)) return cache.get(key);
  const src = read(rel);
  const { outputText } = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
    },
  });
  const sandbox = { exports: {}, module: { exports: {} } };
  const localRequire = (id) => {
    if (Object.prototype.hasOwnProperty.call(stubs, id)) return stubs[id];
    if (id.startsWith(".") || id.startsWith("..") || id.startsWith("@/")) {
      let resolved = id;
      if (id.startsWith("@/")) resolved = path.join(ROOT, id.slice(2));
      else resolved = path.normalize(path.join(path.dirname(path.join(ROOT, rel)), id));
      for (const c of [resolved + ".ts", resolved + ".js", path.join(resolved, "index.ts")]) {
        if (fs.existsSync(c)) {
          return loadTsModule(path.relative(ROOT, c).replace(/\\/g, "/"), stubs);
        }
      }
    }
    return require(id);
  };
  const fn = new Function("exports", "module", "require", outputText);
  fn(sandbox.exports, sandbox.module, localRequire);
  const mod =
    sandbox.module.exports && Object.keys(sandbox.module.exports).length
      ? sandbox.module.exports
      : sandbox.exports;
  cache.set(key, mod);
  return mod;
}

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    writableEnded: false,
    headersSent: false,
    setHeader(k, v) {
      this.headers[String(k).toLowerCase()] = v;
      return this;
    },
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(b) {
      this.body = b;
      this.writableEnded = true;
      this.headersSent = true;
      return this;
    },
    send(b) {
      this.body = b;
      this.writableEnded = true;
      this.headersSent = true;
      return this;
    },
  };
}

function identity(role) {
  return {
    authenticated: true,
    principalType: role === "super_admin" ? "master" : "staff",
    staffId: role === "super_admin" ? null : 7,
    name: role,
    role,
    sessionId: 1,
  };
}

async function main() {
  // ── Pure maths / CSV helpers ─────────────────────────────────────────────
  const phase2 = loadTsModule("components/sidhu/insights/insightsPhase2.ts");
  const steps = phase2.buildFunnelSteps({
    product_view: 100,
    add_to_cart: 40,
    cart_view: 30,
    checkout_start: 20,
    order_placed: 5,
  });
  ok("funnel_steps_order", steps.map((s) => s.id).join(",") === "product_view,add_to_cart,cart_view,checkout_start,order_placed");
  ok("funnel_dropoff_atc", steps[1].dropoff_pct === 60);
  ok("funnel_dropoff_order", steps[4].dropoff_pct === 75);
  ok("funnel_first_no_dropoff", steps[0].dropoff_pct === null);
  ok("funnel_empty_honest", phase2.buildFunnelSteps({}).every((s) => s.sessions === 0 && (s.dropoff_pct === null || s.dropoff_pct === 0 || s.dropoff_pct === null)));
  ok("funnel_prev_zero_null", phase2.funnelDropoffPct(0, 5) === null);

  ok("csv_escapes_eq", phase2.csvEscapeInsightsCell("=1+1") === "'=1+1");
  ok("csv_escapes_plus", phase2.csvEscapeInsightsCell("+cmd") === "'+cmd");
  ok("csv_escapes_minus", phase2.csvEscapeInsightsCell("-1") === "'-1");
  ok("csv_escapes_at", phase2.csvEscapeInsightsCell("@x") === "'@x");
  ok("csv_plain_ok", phase2.csvEscapeInsightsCell("hello") === "hello");
  ok("csv_quotes", phase2.csvEscapeInsightsCell('a,b') === '"a,b"');

  ok("export_cap_clamp", phase2.parseExportMaxRows("999999") === 50000);
  ok("export_cap_default", phase2.parseExportMaxRows("") === 10000);
  ok("export_kind_daily", phase2.parseExportKind("daily") === "daily");
  ok("export_kind_sessions", phase2.parseExportKind("sessions") === "sessions");
  ok("export_kind_bad", phase2.parseExportKind("hack") === null);
  ok("export_kind_sqli_rejected", phase2.parseExportKind("daily; DROP TABLE x") === null);

  ok(
    "checkout_catalog_honest",
    phase2.CHECKOUT_PROBLEM_CATALOG.some((m) => m.id === "validation_errors" && m.tracked === false) &&
      phase2.CHECKOUT_PROBLEM_CATALOG.some((m) => m.id === "receipt_upload_failures" && m.tracked === false) &&
      phase2.CHECKOUT_PROBLEM_CATALOG.some((m) => m.id === "payment_method_switches" && m.tracked === true)
  );
  ok("visit_bucket", phase2.visitCountBucketLabel(1) === "1 visit" && phase2.visitCountBucketLabel(12) === "10+ visits");
  ok("days_bucket", phase2.daysSinceLastBucketLabel(3) === "2–7 days");

  // ── Handler harness ──────────────────────────────────────────────────────
  let authMode = "ok"; // ok | anon | forbidden
  let authRole = "super_admin";
  let queryImpl = async () => [[]];
  const auditCalls = [];

  const perms = loadTsModule("lib/adminPermissions.ts");

  function stubsFor() {
    return {
      "@/lib/db": {
        __esModule: true,
        default: {
          query: (...args) => queryImpl(...args),
        },
      },
      "@/lib/adminAuth": {
        requireAdminPermission: async (req, res, permission) => {
          if (authMode === "anon") {
            res.status(401).json({ error: "Unauthorized" });
            return null;
          }
          const id = identity(authRole);
          if (authMode === "forbidden" || !perms.hasAdminPermission(id.role, permission)) {
            res.status(403).json({ error: "Forbidden", message: "You do not have permission for this action." });
            return null;
          }
          return id;
        },
        getRequestMeta: () => ({ ip: "203.0.113.9", userAgent: "test" }),
      },
      "@/lib/adminAudit": {
        recordAdminAudit: async (input) => {
          auditCalls.push(input);
        },
      },
      "@/lib/adminPermissions": perms,
      "@/lib/insightsSettings": {
        getInsightsSettings: async () => ({
          detail_retention_days: 90,
          summary_retention_days: 365,
          exclude_bots_from_kpis: true,
        }),
      },
    };
  }

  function loadHandler(rel) {
    cache.clear();
    const mod = loadTsModule(rel, stubsFor());
    return mod.default || mod;
  }

  async function invoke(rel, { method = "GET", query = {}, role = "super_admin", mode = "ok" } = {}) {
    authMode = mode;
    authRole = role;
    const handler = loadHandler(rel);
    const req = { method, query, headers: {}, socket: { remoteAddress: "127.0.0.1" } };
    const res = makeRes();
    await handler(req, res);
    return res;
  }

  const endpoints = [
    "pages/api/admin-insights/funnel.ts",
    "pages/api/admin-insights/checkout-problems.ts",
    "pages/api/admin-insights/orders-attribution.ts",
    "pages/api/admin-insights/returning.ts",
    "pages/api/admin-insights/export.ts",
  ];

  // RBAC matrix
  for (const ep of endpoints) {
    const base = path.basename(ep, ".ts");
    queryImpl = async () => [[{}]];
    let res = await invoke(ep, { mode: "anon", query: { from: "2026-11-01", to: "2026-11-11" } });
    ok(`rbac_anon_${base}`, res.statusCode === 401 || res.statusCode === 403, `status=${res.statusCode}`);

    res = await invoke(ep, { role: "writer", query: { from: "2026-11-01", to: "2026-11-11" } });
    ok(`rbac_writer_403_${base}`, res.statusCode === 403, `status=${res.statusCode}`);

    // manager allowed for view/export endpoints
    queryImpl = async (sql) => {
      if (/ER_FORCE/.test(String(sql))) throw Object.assign(new Error("no"), { code: "ER_NO_SUCH_TABLE" });
      if (/FROM insights_sessions/.test(String(sql)) && /LIMIT 1/.test(String(sql))) return [[{ ok: 1 }]];
      if (/product_view|abandonment|payment_switches/.test(String(sql))) {
        return [[{ product_view: 0, add_to_cart: 0, cart_view: 0, checkout_start: 0, order_placed: 0, abandonment: 0, payment_switches: 0 }]];
      }
      if (/COUNT\(DISTINCT s\.visitor_id\)/.test(String(sql))) {
        return [[{ visitors: 0, sessions: 0, new_visitors: 0, returning_visitors: 0 }]];
      }
      if (/insights_daily_summary/.test(String(sql))) return [[]];
      return [[]];
    };
    res = await invoke(ep, { role: "manager", query: { from: "2026-11-01", to: "2026-11-11", kind: "daily" } });
    ok(
      `rbac_manager_ok_${base}`,
      res.statusCode === 200,
      `status=${res.statusCode} body=${typeof res.body === "string" ? "csv" : JSON.stringify(res.body).slice(0, 120)}`
    );
  }

  // Fail-safe missing tables
  for (const ep of endpoints) {
    const base = path.basename(ep, ".ts");
    queryImpl = async () => {
      const err = new Error("Table 'x.insights_sessions' doesn't exist");
      err.code = "ER_NO_SUCH_TABLE";
      err.errno = 1146;
      throw err;
    };
    const res = await invoke(ep, {
      role: "super_admin",
      query: { from: "2026-11-01", to: "2026-11-11", kind: "daily" },
    });
    ok(
      `failsafe_missing_${base}`,
      res.statusCode === 200 &&
        res.body &&
        typeof res.body === "object" &&
        res.body.installed === false &&
        res.body.state === "not_installed",
      `status=${res.statusCode}`
    );
  }

  // Funnel maths with mocked rows
  queryImpl = async (sql) => {
    const s = String(sql);
    if (/LIMIT 1/.test(s) && /insights_sessions/.test(s)) return [[{ ok: 1 }]];
    if (/AS product_view/.test(s)) {
      return [[{ product_view: 10, add_to_cart: 5, cart_view: 4, checkout_start: 2, order_placed: 1 }]];
    }
    return [[]];
  };
  let res = await invoke("pages/api/admin-insights/funnel.ts", {
    role: "manager",
    query: { from: "2026-11-01", to: "2026-11-11" },
  });
  ok("funnel_has_data", res.statusCode === 200 && res.body?.has_data === true && res.body.steps?.length === 5);
  ok(
    "funnel_dropoff_values",
    res.body.steps[1].sessions === 5 && res.body.steps[1].dropoff_pct === 50 && res.body.steps[4].dropoff_pct === 50
  );

  // Empty funnel
  queryImpl = async (sql) => {
    if (/LIMIT 1/.test(String(sql))) return [[{ ok: 1 }]];
    return [[{ product_view: 0, add_to_cart: 0, cart_view: 0, checkout_start: 0, order_placed: 0 }]];
  };
  res = await invoke("pages/api/admin-insights/funnel.ts", {
    role: "manager",
    query: { from: "2026-11-01", to: "2026-11-11" },
  });
  ok("funnel_empty_state", res.body?.has_data === false && Array.isArray(res.body?.notes));

  // Period clamping / injection
  res = await invoke("pages/api/admin-insights/funnel.ts", {
    role: "manager",
    query: { from: "2020-01-01", to: "2026-11-11" },
  });
  ok("period_clamp_reject", res.statusCode === 400);

  res = await invoke("pages/api/admin-insights/funnel.ts", {
    role: "manager",
    query: { from: "2026-11-11' OR 1=1 --", to: "2026-11-11" },
  });
  ok("period_sqli_reject", res.statusCode === 400);

  // Checkout problems: not tracked metrics
  queryImpl = async (sql) => {
    if (/LIMIT 1/.test(String(sql))) return [[{ ok: 1 }]];
    return [[{ abandonment: 3, payment_switches: 7 }]];
  };
  res = await invoke("pages/api/admin-insights/checkout-problems.ts", {
    role: "manager",
    query: { from: "2026-11-01", to: "2026-11-11" },
  });
  const metrics = res.body?.metrics || [];
  ok(
    "checkout_tracked_counts",
    metrics.find((m) => m.id === "checkout_stage_abandonment")?.count === 3 &&
      metrics.find((m) => m.id === "payment_method_switches")?.count === 7
  );
  ok(
    "checkout_not_tracked",
    metrics.find((m) => m.id === "validation_errors")?.tracked === false &&
      metrics.find((m) => m.id === "receipt_upload_failures")?.count === null
  );

  // Orders attribution IP masking
  queryImpl = async () => [
    [
      {
        order_id: "ORD1",
        ordered_at: "2026-11-10T10:00:00Z",
        payment_method: "bank",
        status: "pending",
        total: 49.99,
        src: "google",
        med: "cpc",
        referrer_host: "www.google.com",
        landing_path: "/products/x",
        c_name: "United Kingdom",
        device_type: "mobile",
        ip_address: "203.0.113.50",
        ip_masked: 0,
      },
    ],
  ];
  res = await invoke("pages/api/admin-insights/orders-attribution.ts", {
    role: "super_admin",
    query: { from: "2026-11-01", to: "2026-11-11" },
  });
  ok(
    "attr_sa_sees_ip",
    res.body?.ip_visible === true &&
      res.body?.rows?.[0]?.ip_address === "203.0.113.50" &&
      !("customer_email" in (res.body.rows[0] || {})) &&
      !("customer_name" in (res.body.rows[0] || {}))
  );

  queryImpl = async () => [
    [
      {
        order_id: "ORD1",
        ordered_at: "2026-11-10T10:00:00Z",
        payment_method: "cod",
        status: "pending",
        total: 20,
        src: null,
        med: null,
        referrer_host: null,
        landing_path: "/",
        c_name: "United Kingdom",
        device_type: "desktop",
      },
    ],
  ];
  res = await invoke("pages/api/admin-insights/orders-attribution.ts", {
    role: "manager",
    query: { from: "2026-11-01", to: "2026-11-11" },
  });
  ok(
    "attr_manager_no_ip",
    res.body?.ip_visible === false &&
      res.body?.rows?.[0] &&
      !("ip_address" in res.body.rows[0]) &&
      !("ip_masked" in res.body.rows[0])
  );

  // Returning maths
  let call = 0;
  queryImpl = async (sql) => {
    call++;
    const s = String(sql);
    if (/COUNT\(DISTINCT s\.visitor_id\) AS visitors/.test(s)) {
      return [[{ visitors: 3, sessions: 5, new_visitors: 2, returning_visitors: 1 }]];
    }
    if (/COUNT\(\*\) AS visits/.test(s)) {
      return [
        [
          { visitor_id: "a", visits: 1 },
          { visitor_id: "b", visits: 2 },
          { visitor_id: "c", visits: 5 },
        ],
      ];
    }
    if (/DATEDIFF/.test(s)) return [[{ days_gap: 3 }, { days_gap: 10 }]];
    return [[]];
  };
  res = await invoke("pages/api/admin-insights/returning.ts", {
    role: "manager",
    query: { from: "2026-11-01", to: "2026-11-11" },
  });
  ok(
    "returning_totals",
    res.body?.totals?.visitors === 3 &&
      res.body?.totals?.returning_visitors === 1 &&
      res.body?.avg_days_since_last === 6.5
  );
  ok(
    "returning_buckets",
    (res.body?.visit_count_buckets || []).some((b) => b.label === "1 visit" && b.visitors === 1) &&
      (res.body?.days_since_last_buckets || []).some((b) => b.label === "2–7 days" && b.visitors === 1)
  );

  // Export: manager daily + audit; sessions forbidden; SA sessions + CSV injection safe + cap
  auditCalls.length = 0;
  queryImpl = async () => [
    [
      {
        d: "2026-11-01",
        visitors: 1,
        sessions: 2,
        pageviews: 3,
        new_visitors: 1,
        returning_visitors: 0,
        bot_sessions: 0,
        orders_attributed: 0,
        add_to_cart: 0,
        checkout_starts: 0,
        place_order_clicks: 0,
      },
      {
        d: "=CMD",
        visitors: 0,
        sessions: 0,
        pageviews: 0,
        new_visitors: 0,
        returning_visitors: 0,
        bot_sessions: 0,
        orders_attributed: 0,
        add_to_cart: 0,
        checkout_starts: 0,
        place_order_clicks: 0,
      },
    ],
  ];
  res = await invoke("pages/api/admin-insights/export.ts", {
    role: "manager",
    query: { from: "2026-11-01", to: "2026-11-11", kind: "daily", max_rows: "999999" },
  });
  ok("export_manager_daily_csv", res.statusCode === 200 && typeof res.body === "string" && res.body.charCodeAt(0) === 0xfeff);
  ok("export_csv_injection_safe", String(res.body).includes("'=CMD"));
  ok(
    "export_audit_written",
    auditCalls.length === 1 &&
      auditCalls[0].action === "insights.export" &&
      auditCalls[0].metadata?.row_count === 2 &&
      auditCalls[0].metadata?.max_rows === 50000
  );

  res = await invoke("pages/api/admin-insights/export.ts", {
    role: "manager",
    query: { from: "2026-11-01", to: "2026-11-11", kind: "sessions" },
  });
  ok("export_manager_sessions_403", res.statusCode === 403);

  auditCalls.length = 0;
  queryImpl = async () => [
    [
      {
        started_at: "2026-11-10T10:00:00Z",
        device_type: "mobile",
        c_name: "United Kingdom",
        landing_path: "/",
        utm_source: null,
        utm_medium: null,
        utm_campaign: null,
        referrer_host: null,
        is_new_visitor: 1,
        is_returning: 0,
        is_bot: 0,
        pageview_count: 2,
        order_id: null,
        ip_address: "198.51.100.9",
        ip_masked: 0,
      },
    ],
  ];
  res = await invoke("pages/api/admin-insights/export.ts", {
    role: "super_admin",
    query: { from: "2026-11-01", to: "2026-11-11", kind: "sessions", max_rows: "10" },
  });
  ok(
    "export_sa_sessions_ip",
    res.statusCode === 200 &&
      typeof res.body === "string" &&
      String(res.body).includes("ip_address") &&
      String(res.body).includes("198.51.100.9")
  );
  ok("export_sa_audit", auditCalls.length === 1 && auditCalls[0].metadata?.kind === "sessions");

  // ── Static checks ────────────────────────────────────────────────────────
  const newApis = [
    "pages/api/admin-insights/funnel.ts",
    "pages/api/admin-insights/checkout-problems.ts",
    "pages/api/admin-insights/orders-attribution.ts",
    "pages/api/admin-insights/returning.ts",
    "pages/api/admin-insights/export.ts",
  ];
  for (const f of newApis) {
    const src = read(f);
    const base = path.basename(f, ".ts");
    ok(`exists_${base}`, fs.existsSync(path.join(ROOT, f)));
    ok(`no_ddl_${base}`, !/\b(CREATE|ALTER|DROP)\s+TABLE\b/i.test(src));
    if (base === "export") {
      // export may mention INSERT only via audit helper import — no direct DML on insights_*
      ok(
        `no_insights_dml_${base}`,
        !/\b(INSERT|UPDATE|DELETE)\s+INTO\s+insights_/i.test(src) &&
          !/\bUPDATE\s+insights_/i.test(src) &&
          !/\bDELETE\s+FROM\s+insights_/i.test(src)
      );
      ok(`export_uses_audit_${base}`, /recordAdminAudit/.test(src));
      ok(`export_perm_${base}`, /insights\.export/.test(src));
    } else {
      ok(
        `read_only_${base}`,
        !/\bINSERT\b/i.test(src) && !/\bUPDATE\b/i.test(src) && !/\bDELETE\b/i.test(src)
      );
      ok(`view_perm_${base}`, /insights\.view/.test(src) || /handleInsightsGet/.test(src));
    }
    ok(`param_sql_${base}`, !/\.query\(\s*[`'"][^`'"]*\$\{/.test(src));
    ok(`no_get_lock_${base}`, !/\bGET_LOCK\s*\(/.test(src));
  }

  ok("layout_untouched_export", !/insights-export|FunnelScreen|W2-60/.test(read("app/layout.tsx")));
  const layout = read("app/layout.tsx");
  ok("layout_still_has_metadata", /export async function generateMetadata/.test(layout));

  const panel = read("components/sidhu/insights/SidhuInsightsPanel.tsx");
  ok(
    "panel_has_phase2_tabs",
    /Funnel/.test(panel) &&
      /Checkout problems/.test(panel) &&
      /Orders attribution/.test(panel) &&
      /Returning/.test(panel) &&
      /Export/.test(panel)
  );
  ok(
    "screens_exist",
    [
      "FunnelScreen.tsx",
      "CheckoutProblemsScreen.tsx",
      "OrdersAttributionScreen.tsx",
      "ReturningScreen.tsx",
      "ExportScreen.tsx",
    ].every((n) => fs.existsSync(path.join(ROOT, "components/sidhu/insights", n)))
  );

  // No new public routes
  ok(
    "no_new_app_routes",
    !fs.existsSync(path.join(ROOT, "app/insights")) &&
      !fs.existsSync(path.join(ROOT, "app/funnel"))
  );

  // Attribution must not select customer PII columns
  const attrSrc = read("pages/api/admin-insights/orders-attribution.ts");
  ok(
    "attr_no_customer_pii_cols",
    !/customer_name|customer_email|customer_phone|delivery_address/.test(attrSrc)
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
