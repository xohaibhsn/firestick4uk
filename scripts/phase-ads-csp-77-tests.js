/**
 * F4UK-ADS-CSP-77 — Google Ads CSP hosts, drop duplicate report-only CSP,
 * sanitise admin-orders-export 500 body.
 *
 * Older-suite edits (list each):
 *  - phase-csp-report-only-tests.js (enforcing CSP candidate + no report-only)
 *  - phase-seasonal-ux-72-tests.js (working-tree allowlist: next.config + this suite + csp suite)
 *
 * Static + mocked handler only. No .env*, no real DB, no network.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");
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

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function headerValues(block, headerName) {
  const pattern = new RegExp(
    `\\{\\s*key:\\s*"${escapeRegex(headerName)}"\\s*,\\s*value:\\s*"([^"]*)"\\s*\\}`,
    "g"
  );
  return Array.from(block.matchAll(pattern), (match) => match[1]);
}

function parseDirectives(policy) {
  return new Map(
    policy
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [name, ...sources] = part.split(/\s+/);
        return [name, sources];
      })
  );
}

const EXPECTED_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.googleadservices.com https://www.google.com https://googleads.g.doubleclick.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https:; frame-src 'self' https://www.googletagmanager.com https://td.doubleclick.net https://bid.g.doubleclick.net; object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'; media-src 'self'; manifest-src 'self';";

const nextConfig = read("next.config.ts");
const securityBlockMatch = nextConfig.match(
  /const securityHeaders\s*=\s*\[([\s\S]*?)\];/
);
const securityBlock = securityBlockMatch ? securityBlockMatch[1] : "";

ok("security_headers_block_exists", securityBlock.length > 0);

const enforcingValues = headerValues(securityBlock, "Content-Security-Policy");
const reportOnlyValues = headerValues(
  securityBlock,
  "Content-Security-Policy-Report-Only"
);

ok("one_enforcing_csp_header", enforcingValues.length === 1);
ok(
  "no_report_only_csp_header_configured",
  reportOnlyValues.length === 0 &&
    !/Content-Security-Policy-Report-Only/.test(securityBlock) &&
    !/Content-Security-Policy-Report-Only/.test(nextConfig)
);
ok("enforcing_csp_equals_expected", enforcingValues[0] === EXPECTED_CSP);

const directives = parseDirectives(enforcingValues[0] || "");
ok(
  "csp_script_src_has_googleads_doubleclick",
  directives.get("script-src")?.includes("https://googleads.g.doubleclick.net")
);
ok(
  "csp_frame_src_has_td_and_bid_doubleclick",
  directives.get("frame-src")?.includes("https://td.doubleclick.net") &&
    directives.get("frame-src")?.includes("https://bid.g.doubleclick.net")
);
ok(
  "csp_keeps_object_src_none",
  directives.get("object-src")?.join(" ") === "'none'"
);
ok(
  "csp_keeps_frame_ancestors_self",
  directives.get("frame-ancestors")?.join(" ") === "'self'"
);
ok(
  "csp_keeps_default_src_self",
  directives.get("default-src")?.join(" ") === "'self'"
);
ok(
  "x_frame_options_sameorigin_unchanged",
  /key:\s*"X-Frame-Options"\s*,\s*value:\s*"SAMEORIGIN"/.test(securityBlock)
);

const exportSrc = read("pages/api/admin-orders-export.ts");
const headerMatch = exportSrc.match(
  /const header\s*=\s*\[([\s\S]*?)\];/
);
const headerItems = headerMatch
  ? [...headerMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1])
  : [];
ok("export_csv_headers_count_17", headerItems.length === 17, String(headerItems.length));
{
  const rowStart = exportSrc.indexOf("rowToCsv([");
  const rowEnd = exportSrc.indexOf("])", rowStart);
  const rowBlock =
    rowStart >= 0 && rowEnd > rowStart ? exportSrc.slice(rowStart, rowEnd + 2) : "";
  ok(
    "export_payment_method_raw",
    headerItems.includes("Payment Method") &&
      /o\.payment_method/.test(rowBlock) &&
      !/toPublicPaymentMethod|mapPaymentMethod|normalizePayment/.test(rowBlock),
    rowBlock ? "ok" : "rowBlock empty"
  );
}
ok(
  "export_500_body_sanitised_static",
  /json\(\{\s*error:\s*"Export failed"\s*\}\)/.test(exportSrc) &&
    !/error:\s*error\?\.message/.test(exportSrc)
);
ok(
  "export_500_logs_code_or_name_only",
  /console\.error\(\s*"\[admin-orders-export\] export failed"\s*,\s*error\?\.code\s*\|\|\s*error\?\.name\s*\|\|\s*"error"\s*\)/.test(
    exportSrc
  ) && !/console\.error\([^)]*error\?\.message/.test(exportSrc)
);

const cache = new Map();
function loadTs(rel, stubs = {}) {
  const abs = path.join(ROOT, rel);
  const key = abs + "::" + Object.keys(stubs).sort().join(",");
  if (cache.has(key)) return cache.get(key);
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
    body: undefined,
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
    send(b) {
      this.body = b;
      return this;
    },
  };
}

const SECRET_MSG = "SUPER_SECRET_SQL_LEAK_abc123_do_not_expose";
const logged = [];
const origConsoleError = console.error;
console.error = (...args) => {
  logged.push(args.map(String).join(" "));
};

(async () => {
  const throwPool = {
    query: async () => {
      const err = new Error(SECRET_MSG);
      err.code = "ER_FAKE";
      err.name = "FakeDbError";
      throw err;
    },
  };
  const handlerMod = loadTs("pages/api/admin-orders-export.ts", {
    "../../lib/db": throwPool,
    "../../lib/adminAuth": {
      getRequestMeta: () => ({ ip: "127.0.0.1" }),
      requireAdminPermission: async () => ({ id: 1, role: "super_admin" }),
    },
    "../../lib/adminAudit": { recordAdminAudit: async () => {} },
    "../../lib/adminNoStore": { setAdminNoStore: () => {} },
    "../../lib/adminOrdersQuery": {
      EXPORT_MAX: 5000,
      buildOrderWhere: () => ({ sql: "", params: [] }),
      csvEscapeCell: (v) => String(v ?? ""),
      itemsListForOrderIds: async () => ({}),
      parseOrderFilters: () => ({
        error: null,
        filters: { q: "", status: "", paymentMethod: "" },
      }),
    },
  });
  const handler = handlerMod.default || handlerMod;
  const res = makeRes();
  await handler({ method: "GET", query: {}, headers: {}, socket: {} }, res);
  console.error = origConsoleError;

  const bodyStr = JSON.stringify(res.body);
  ok("export_500_status", res.statusCode === 500);
  ok(
    "export_500_body_exact",
    bodyStr === '{"error":"Export failed"}',
    bodyStr
  );
  ok(
    "export_500_body_hides_secret_message",
    !bodyStr.includes(SECRET_MSG) &&
      !(typeof res.body === "string" && res.body.includes(SECRET_MSG))
  );
  ok(
    "export_500_log_has_no_secret_message",
    logged.every((line) => !line.includes(SECRET_MSG)) &&
      logged.some((line) => /\[admin-orders-export\] export failed/.test(line))
  );

  // TEST-HYG-1: scope allowlist to ADS-CSP-77's own historical commit range
  // (not applicable against later HEAD / unrelated working-tree edits)
  const ADS77_ALLOW = new Set([
    "next.config.ts",
    "pages/api/admin-orders-export.ts",
    "scripts/phase-ads-csp-77-tests.js",
    "scripts/phase-csp-report-only-tests.js",
    "scripts/phase-seasonal-ux-72-tests.js",
  ]);
  const ADS77_RANGE_BASE = "32a67196488df01d91284d86318b875dc34bc14e";
  const ADS77_RANGE_END = "7c2913b54aeb76d1bb77e250e9e104b43eefc603";
  let dirtyNames = [];
  try {
    dirtyNames = execSync(
      `git diff --name-only ${ADS77_RANGE_BASE}..${ADS77_RANGE_END}`,
      { cwd: ROOT, encoding: "utf8" }
    )
      .split(/\r?\n/)
      .map((s) => s.trim().replace(/\\/g, "/"))
      .filter(Boolean);
  } catch (e) {
    ok("diff_allowlist_ads77", false, String(e.message || e));
  }
  const unexpected = dirtyNames.filter((f) => !ADS77_ALLOW.has(f));
  ok(
    "diff_allowlist_ads77",
    unexpected.length === 0,
    unexpected.join(",") ||
      `scoped ${ADS77_RANGE_BASE.slice(0, 7)}..${ADS77_RANGE_END.slice(0, 7)} files=${dirtyNames.length}`
  );

  console.log(`\nADS-CSP-77: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error = origConsoleError;
  console.error(e);
  process.exit(1);
});
