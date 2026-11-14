/**
 * F4UK-MULTI-93 — XFF spoof diagnostic (auth), live-health SEO diff fixtures,
 * insights_geo_daily purge-all retention, geo admin empty result.
 * Stub DB / no network. Run: node scripts/phase-multi-93-tests.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const Module = require("module");
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

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

const cache = new Map();
function loadTs(rel, stubs = {}) {
  const abs = path.join(ROOT, rel);
  const key = abs + "::" + Object.keys(stubs).sort().join(",") + "::" + Math.random();
  // unique key each load to avoid stale stubs (auth modes)
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
  cache.set(key, m.exports);
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
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
  };
}

async function main() {
  // ── A2: request IP chain + auth guard ────────────────────────────────────
  ok(
    "runtime_api_exports_buildRequestIpChain",
    /export function buildRequestIpChain/.test(read("pages/api/admin-server-runtime.ts"))
  );
  ok(
    "runtime_api_includes_requestIpChain",
    /requestIpChain:\s*buildRequestIpChain\(req\)/.test(read("pages/api/admin-server-runtime.ts"))
  );
  ok(
    "runtime_api_does_not_change_getClientIp",
    !/getClientIp/.test(read("pages/api/admin-server-runtime.ts")) &&
      /x-forwarded-for.*split\(","\)\[0\]/.test(read("lib/rateLimit.ts"))
  );
  ok(
    "sidhu_ip_chain_block",
    /data-testid=["']request-ip-chain["']/.test(read("app/sidhu/page.tsx")) &&
      /Request IP chain \(your request\)/.test(read("app/sidhu/page.tsx"))
  );

  {
    const api = loadTs("pages/api/admin-server-runtime.ts", {
      "../../lib/adminAuth": {
        requireAdminRole: async (_req, res) => {
          res.status(401).json({ error: "Unauthorized" });
          return null;
        },
      },
      "../../lib/adminNoStore": {
        setAdminNoStore: (res) => res.setHeader("Cache-Control", "no-store, private"),
      },
      "../../lib/serverRuntime": {
        getCachedServerRuntime: () => ({ available: false }),
      },
    });
    const res = makeRes();
    await api.default(
      {
        method: "GET",
        headers: {
          host: "firestick4uk.com",
          origin: "https://firestick4uk.com",
          "x-forwarded-for": "198.51.100.10, 203.0.113.1",
          "x-real-ip": "198.51.100.10",
          "cf-connecting-ip": "198.51.100.10",
        },
        socket: { remoteAddress: "10.0.0.1" },
      },
      res
    );
    ok("ip_chain_auth_guard_anon_401", res.statusCode === 401 && !res.body?.requestIpChain);
  }

  {
    let roleSeen = null;
    const api = loadTs("pages/api/admin-server-runtime.ts", {
      "../../lib/adminAuth": {
        requireAdminRole: async (_req, res, roles) => {
          roleSeen = roles;
          res.status(403).json({ error: "Forbidden" });
          return null;
        },
      },
      "../../lib/adminNoStore": {
        setAdminNoStore: (res) => res.setHeader("Cache-Control", "no-store, private"),
      },
      "../../lib/serverRuntime": {
        getCachedServerRuntime: () => ({ available: true, self: { pid: 1 } }),
      },
    });
    const res = makeRes();
    await api.default(
      {
        method: "GET",
        headers: { host: "firestick4uk.com", origin: "https://firestick4uk.com" },
        socket: {},
      },
      res
    );
    ok(
      "ip_chain_auth_guard_requires_super_admin",
      res.statusCode === 403 &&
        Array.isArray(roleSeen) &&
        roleSeen.includes("super_admin") &&
        !res.body?.requestIpChain
    );
  }

  {
    const api = loadTs("pages/api/admin-server-runtime.ts", {
      "../../lib/adminAuth": {
        requireAdminRole: async () => ({ id: 1, role: "super_admin" }),
      },
      "../../lib/adminNoStore": {
        setAdminNoStore: (res) => res.setHeader("Cache-Control", "no-store, private"),
      },
      "../../lib/serverRuntime": {
        getCachedServerRuntime: () => ({ available: false }),
      },
    });
    const res = makeRes();
    await api.default(
      {
        method: "GET",
        headers: {
          host: "firestick4uk.com",
          origin: "https://firestick4uk.com",
          "x-forwarded-for": "198.51.100.22",
          "x-real-ip": "198.51.100.22",
          "cf-connecting-ip": "198.51.100.22",
          "true-client-ip": "198.51.100.22",
        },
        socket: { remoteAddress: "127.0.0.1" },
      },
      res
    );
    const chain = res.body && res.body.requestIpChain;
    ok(
      "ip_chain_super_admin_payload",
      res.statusCode === 200 &&
        chain &&
        chain.xForwardedFor === "198.51.100.22" &&
        chain.xRealIp === "198.51.100.22" &&
        chain.remoteAddress === "127.0.0.1" &&
        Array.isArray(chain.cdnClientIpHeaders) &&
        chain.cdnClientIpHeaders.some((h) => h.name === "cf-connecting-ip")
    );
    ok("ip_chain_no_store", /no-store/.test(String(res.headers["Cache-Control"] || "")));
  }

  // Pure helper (no auth) — buildRequestIpChain
  {
    const api = loadTs("pages/api/admin-server-runtime.ts", {
      "../../lib/adminAuth": { requireAdminRole: async () => null },
      "../../lib/adminNoStore": { setAdminNoStore: () => {} },
      "../../lib/serverRuntime": { getCachedServerRuntime: () => ({}) },
    });
    const chain = api.buildRequestIpChain({
      headers: { "x-forwarded-for": "203.0.113.9", "x-real-ip": "203.0.113.9" },
      socket: { remoteAddress: "::1" },
    });
    ok(
      "buildRequestIpChain_pure",
      chain.xForwardedFor === "203.0.113.9" && chain.remoteAddress === "::1"
    );
  }

  // ── B: SEO diff unit tests on fixtures ───────────────────────────────────
  {
    const diff = require("./lib/seoHealthDiff");
    const a = fs.readFileSync(path.join(ROOT, "scripts/fixtures/seo-health-a.html"), "utf8");
    const b = fs.readFileSync(path.join(ROOT, "scripts/fixtures/seo-health-b.html"), "utf8");
    const aTick = fs.readFileSync(path.join(ROOT, "scripts/fixtures/seo-health-a-tick.html"), "utf8");
    const fa = diff.extractSeoFields(a, "/sample-a");
    const fb = diff.extractSeoFields(b, "/sample-b");
    const fa2 = diff.extractSeoFields(aTick, "/sample-a");

    ok("seo_extract_title", fa.title === "Sample Page A");
    ok(
      "seo_extract_nav_ordered",
      fa.nav.length === 2 && fa.nav[0].href === "/" && fa.nav[1].text === "Products"
    );
    ok("seo_extract_h1", fa.h1[0] === "Heading A");

    const sameTick = diff.diffSeoFields(fa, fa2);
    ok(
      "seo_diff_countdown_digit_insensitive_jsonld",
      sameTick.length === 0 && fa.jsonLdSha256 === fa2.jsonLdSha256,
      JSON.stringify(sameTick)
    );

    const changed = diff.diffSeoFields(fa, { ...fa, title: "Other", path: "/sample-a" });
    ok("seo_diff_field_level_title", changed.length === 1 && changed[0].field === "title");

    const cross = diff.diffSeoFields(fa, fb);
    ok("seo_diff_detects_multiple", cross.length >= 3);

    ok("live_health_script_exists", exists("scripts/live-health-check.js"));
    ok(
      "live_health_usage_flags",
      /--write-baseline/.test(read("scripts/live-health-check.js")) &&
        /--out/.test(read("scripts/live-health-check.js")) &&
        /--base/.test(read("scripts/live-health-check.js"))
    );
  }

  // ── C: geo purge + geo admin empty ───────────────────────────────────────
  {
    const ret = loadTs("lib/insightsRetention.ts");
    ok(
      "retention_geo_purge_sql",
      /DELETE FROM insights_geo_daily LIMIT \?/.test(ret.insightsGeoDailyPurgeAllSql())
    );

    ret.__resetInsightsRetentionThrottle();
    const sqlLog = [];
    let lockOwner = null;
    const pool = {
      getConnection: async () => ({
        query: async (sql, params) => {
          sqlLog.push({ sql: String(sql), params });
          if (/GET_LOCK/.test(sql)) {
            lockOwner = "held";
            return [[{ got: 1 }], null];
          }
          if (/RELEASE_LOCK/.test(sql)) {
            lockOwner = null;
            return [[{}], null];
          }
          if (/last_success_at/.test(sql) && /SELECT/.test(sql)) {
            return [[{ last_success_at: null }], null];
          }
          if (/SELECT id, ip_address/.test(sql)) return [[], null];
          if (/DELETE FROM insights_geo_daily LIMIT/.test(sql) && !/summary_date/.test(sql)) {
            const calls = sqlLog.filter(
              (c) => /DELETE FROM insights_geo_daily LIMIT/.test(c.sql) && !/summary_date/.test(c.sql)
            ).length;
            return [{ affectedRows: calls === 1 ? 500 : 0 }, null];
          }
          if (/DELETE FROM/.test(sql)) return [{ affectedRows: 1 }, null];
          if (/insights_cleanup_lease/.test(sql)) return [{ affectedRows: 1 }, null];
          return [[], null];
        },
        release: () => {},
      }),
    };

    const r = await ret.runInsightsRetention({
      pool,
      settings: {
        detail_retention_days: 90,
        summary_retention_days: 365,
        ip_full_retention_days: 30,
        cleanup_batch_size: 500,
        cleanup_min_interval_sec: 0,
      },
      now: new Date("2026-11-15T01:00:00Z"),
      timeBudgetMs: 5000,
      getLastSuccessAt: async () => null,
    });

    const geoPurges = sqlLog.filter(
      (c) => /DELETE FROM insights_geo_daily LIMIT \?/.test(c.sql) && !/summary_date/.test(c.sql)
    );
    const otherDeletes = sqlLog.filter(
      (c) =>
        /DELETE FROM/.test(c.sql) &&
        !/insights_geo_daily/.test(c.sql) &&
        !/insights_events/.test(c.sql) &&
        !/insights_sessions/.test(c.sql) &&
        !/insights_daily_summary|insights_source_daily|insights_page_daily/.test(c.sql)
    );
    const dateGeo = sqlLog.filter((c) =>
      /DELETE FROM insights_geo_daily WHERE summary_date/.test(c.sql)
    );
    ok("retention_ran_geo_purge", r.ran === true, JSON.stringify(r));
    ok("retention_geo_batched", geoPurges.length >= 2 && geoPurges[0].params[0] === 500);
    ok("retention_no_date_geo_delete", dateGeo.length === 0);
    ok("retention_other_tables_untouched_extra", otherDeletes.length === 0);
    ok("retention_lock_released", lockOwner === null);
  }

  {
    const geo = loadTs("pages/api/admin-insights/geo.ts", {
      "@/lib/adminNoStore": {
        setAdminNoStore: (res) => res.setHeader("Cache-Control", "no-store, private"),
      },
    });
    const res = makeRes();
    geo.default({ method: "GET", headers: {} }, res);
    ok(
      "geo_admin_empty_200",
      res.statusCode === 200 &&
        Array.isArray(res.body.rows) &&
        res.body.rows.length === 0 &&
        Array.isArray(res.body.data) &&
        res.body.data.length === 0
    );
    const res2 = makeRes();
    geo.default({ method: "POST", headers: {} }, res2);
    ok("geo_admin_post_405", res2.statusCode === 405);
  }

  console.log(`\nmulti-93: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error("fatal", err && err.stack ? err.stack : err);
  process.exit(1);
});
