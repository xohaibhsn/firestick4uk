/**
 * ERP-R2A — Decouple player APIs from ERP namespace (compatibility wrappers retained).
 */
const fs = require("fs");
const path = require("path");

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

const playerPage = read("app/player/page.tsx");
const playerLayout = read("app/player/layout.tsx");
const newProxy = read("pages/api/player/proxy.ts");
const newXtream = read("pages/api/player/xtream.ts");
const oldProxy = read("pages/api/erp/iptv/proxy.ts");
const oldXtream = read("pages/api/erp/iptv/xtream.ts");
const robots = read("public/robots.txt");
const nextConfig = read("next.config.ts");
const seoOverview = read("lib/seoOverview.ts");

// --- New canonical routes ---
ok("player_proxy_exists", exists("pages/api/player/proxy.ts"));
ok("player_xtream_exists", exists("pages/api/player/xtream.ts"));

// --- Player uses new paths only ---
ok(
  "player_uses_new_proxy",
  /\/api\/player\/proxy/.test(playerPage)
);
ok(
  "player_uses_new_xtream",
  /\/api\/player\/xtream/.test(playerPage)
);
ok(
  "player_no_erp_iptv_proxy",
  !/\/api\/erp\/iptv\/proxy/.test(playerPage)
);
ok(
  "player_no_erp_iptv_xtream",
  !/\/api\/erp\/iptv\/xtream/.test(playerPage)
);

// --- Old ERP paths are thin wrappers ---
ok(
  "old_proxy_is_wrapper",
  /export\s*\{\s*config\s*,\s*default\s*\}\s*from\s*["']\.\.\/\.\.\/player\/proxy["']/.test(
    oldProxy.replace(/\s+/g, " ").trim()
  ) ||
    (/export\s*\{[^}]*config[^}]*default[^}]*\}\s*from\s*["']\.\.\/\.\.\/player\/proxy["']/.test(
      oldProxy
    ) &&
      !/function\s+handler/.test(oldProxy) &&
      !/bodyParser/.test(oldProxy))
);
ok(
  "old_proxy_exports_config",
  /export\s*\{[^}]*\bconfig\b/.test(oldProxy)
);
ok(
  "old_proxy_no_handler_impl",
  !/function\s+handler/.test(oldProxy) &&
    !/Missing url param/.test(oldProxy) &&
    !/bodyParser:\s*false/.test(oldProxy)
);
ok(
  "old_xtream_is_wrapper",
  /export\s*\{\s*default\s*\}\s*from\s*["']\.\.\/\.\.\/player\/xtream["']/.test(
    oldXtream
  )
);
ok(
  "old_xtream_no_handler_impl",
  !/function\s+handler/.test(oldXtream) &&
    !/AbortSignal\.timeout/.test(oldXtream) &&
    !/player_api\.php/.test(oldXtream)
);

// --- Canonical proxy retains capabilities ---
ok(
  "proxy_config_bodyParser_false",
  /bodyParser:\s*false/.test(newProxy)
);
ok(
  "proxy_config_responseLimit_false",
  /responseLimit:\s*false/.test(newProxy)
);
ok(
  "proxy_cors_origin_star",
  /Access-Control-Allow-Origin['"]?\s*:\s*['"]\*['"]/.test(newProxy)
);
ok(
  "proxy_options_handling",
  /OPTIONS/.test(newProxy)
);
ok(
  "proxy_range_forwarding",
  /Range/.test(newProxy) && /req\.headers\.range/.test(newProxy)
);
ok(
  "proxy_content_type",
  /content-type|Content-Type/.test(newProxy)
);
ok(
  "proxy_content_length_range",
  /content-length/.test(newProxy) && /content-range/.test(newProxy)
);
ok(
  "proxy_upstream_error",
  /Upstream error/.test(newProxy) || /502/.test(newProxy)
);
ok(
  "proxy_missing_url_param",
  /Missing url param/.test(newProxy)
);

// --- Canonical xtream retains params/timeout ---
ok(
  "xtream_requires_server_username_password_action",
  /server,\s*username,\s*password,\s*action/.test(newXtream) ||
    (/server/.test(newXtream) &&
      /username/.test(newXtream) &&
      /password/.test(newXtream) &&
      /action/.test(newXtream))
);
ok("xtream_stream_id_optional", /stream_id/.test(newXtream));
ok(
  "xtream_15s_timeout",
  /AbortSignal\.timeout\(\s*15000\s*\)/.test(newXtream)
);
ok("xtream_player_api_php", /player_api\.php/.test(newXtream));
ok(
  "xtream_status_propagation",
  /r\.status/.test(newXtream) || /Upstream/.test(newXtream)
);

// --- ERP still present (R2A must not delete) ---
ok("erp_ui_tree_exists", exists("app/erp/page.tsx"));
ok("erp_layout_exists", exists("app/erp/ERPLayout.tsx"));
ok("erp_login_api_exists", exists("pages/api/erp/login.ts"));
ok("erp_attendance_exists", exists("pages/api/erp/attendance.ts"));
ok(
  "erp_attendance_sweeper_exists",
  exists("pages/api/erp/attendance-sweeper.ts")
);
ok("erp_employees_exists", exists("pages/api/erp/employees.ts"));
ok("erp_expenses_exists", exists("pages/api/erp/expenses.ts"));
ok("erp_leaves_exists", exists("pages/api/erp/leaves.ts"));
ok("erp_payroll_exists", exists("pages/api/erp/payroll.ts"));
ok("erp_ledger_exists", exists("pages/api/erp/ledger.ts"));
ok("erp_audit_exists", exists("pages/api/erp/audit.ts"));
ok(
  "erp_iptv_purchases_exists",
  exists("pages/api/erp/iptv/purchases.ts")
);
ok("erp_iptv_sales_exists", exists("pages/api/erp/iptv/sales.ts"));
ok("payroll_utils_exists", exists("lib/payrollUtils.ts"));

// --- Unchanged SEO/robots/next config ---
ok(
  "robots_erp_disallow_unchanged",
  /Disallow:\s*\/erp\b/.test(robots)
);
ok(
  "next_config_erp_headers_unchanged",
  /['"]\/erp['"]/.test(nextConfig) && /['"]\/erp\/:path\*['"]/.test(nextConfig)
);
ok(
  "seo_overview_erp_entry_unchanged",
  /["']\/erp["']/.test(seoOverview)
);

// --- Player remains noindex ---
ok(
  "player_noindex",
  /robots:\s*\{[\s\S]*?index:\s*false[\s\S]*?follow:\s*false/.test(playerLayout)
);

// --- No DB/schema markers introduced in new files ---
ok(
  "new_proxy_no_db",
  !/CREATE TABLE|ALTER TABLE|DROP TABLE|from ['"].*lib\/db/.test(newProxy)
);
ok(
  "new_xtream_no_db",
  !/CREATE TABLE|ALTER TABLE|DROP TABLE|from ['"].*lib\/db/.test(newXtream)
);

console.log(`\nERP-R2A: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
