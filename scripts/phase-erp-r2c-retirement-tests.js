/**
 * ERP-R2C — Finalize ERP API retirement: tombstone removed; /api/erp/* → normal 404.
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

function listFiles(dirRel) {
  const abs = path.join(ROOT, dirRel);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  function walk(d) {
    for (const name of fs.readdirSync(d)) {
      const p = path.join(d, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(p);
      else out.push(path.relative(ROOT, p).replace(/\\/g, "/"));
    }
  }
  walk(abs);
  return out;
}

const robots = read("public/robots.txt");
const nextConfig = read("next.config.ts");
const seoOverview = read("lib/seoOverview.ts");

// --- ERP UI gone ---
ok("erp_ui_absent", !exists("app/erp"));
ok("erp_page_absent", !exists("app/erp/page.tsx"));
ok("erp_layout_absent", !exists("app/erp/ERPLayout.tsx"));

// --- Player gone ---
ok("player_ui_absent", !exists("app/player"));
ok("player_api_dir_absent", !exists("pages/api/player"));
ok("player_proxy_absent", !exists("pages/api/player/proxy.ts"));
ok("player_xtream_absent", !exists("pages/api/player/xtream.ts"));

// --- ERP API fully gone (R2C: no tombstone) ---
ok("erp_api_dir_absent", !exists("pages/api/erp"));
ok("erp_tombstone_absent", !exists("pages/api/erp/[...path].ts"));
ok(
  "erp_api_files_empty",
  listFiles("pages/api/erp").length === 0,
  listFiles("pages/api/erp").join(", ")
);

const prodRoots = ["app", "pages", "components", "lib"];
let playerApiRefs = false;
let erpApiRefs = false;
let playerApiPhp = false;
let erpRetiredString = false;
for (const root of prodRoots) {
  const abs = path.join(ROOT, root);
  if (!fs.existsSync(abs)) continue;
  function walk(d) {
    for (const name of fs.readdirSync(d)) {
      const p = path.join(d, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) {
        if (name === "node_modules" || name === ".next") continue;
        walk(p);
        continue;
      }
      if (!/\.(ts|tsx|js|jsx)$/.test(name)) continue;
      const src = fs.readFileSync(p, "utf8");
      if (/\/api\/player\/proxy/.test(src)) playerApiRefs = true;
      if (/\/api\/player\/xtream/.test(src)) playerApiRefs = true;
      if (/player_api\.php/.test(src)) playerApiPhp = true;
      if (/\/api\/erp\//.test(src)) erpApiRefs = true;
      if (/ERP retired/.test(src)) erpRetiredString = true;
    }
  }
  walk(abs);
}
ok("no_prod_player_proxy_refs", !playerApiRefs);
ok("no_prod_player_api_php", !playerApiPhp);
ok("no_prod_runtime_api_erp_refs", !erpApiRefs);
ok("no_prod_erp_retired_tombstone_string", !erpRetiredString);

// --- Helpers ---
ok("payroll_utils_absent", !exists("lib/payrollUtils.ts"));
ok("lib_db_kept", exists("lib/db.ts"));
ok("upload_receipt_kept", exists("pages/api/upload-receipt.ts"));

// --- SEO / config ---
ok("robots_no_erp_disallow", !/Disallow:\s*\/erp\b/.test(robots));
ok("robots_sidhu_disallow", /Disallow:\s*\/sidhu/.test(robots));
ok("robots_api_disallow", /Disallow:\s*\/api\//.test(robots));
ok(
  "next_no_erp_headers",
  !/source:\s*["']\/erp["']/.test(nextConfig) &&
    !/source:\s*["']\/erp\/:path\*["']/.test(nextConfig)
);
ok(
  "next_sidhu_no_store_kept",
  /source:\s*["']\/sidhu["']/.test(nextConfig) &&
    /source:\s*["']\/sidhu\/:path\*["']/.test(nextConfig)
);
ok(
  "next_cart_no_store_kept",
  /source:\s*["']\/cart["']/.test(nextConfig) &&
    /source:\s*["']\/cart\/:path\*["']/.test(nextConfig)
);
ok("seo_no_erp_key_page", !/path:\s*["']\/erp["']/.test(seoOverview));
ok("seo_no_player_key_page", !/path:\s*["']\/player["']/.test(seoOverview));

// --- Chat ---
ok("chat_widget_retired", !exists("components/ChatWidget.tsx"));
ok("public_chat_api_retired", !exists("pages/api/chat.ts"));
ok(
  "whatsapp_only_floating_contact",
  /<WhatsAppButton\s*\/>/.test(read("app/layout.tsx")) &&
    !/ChatWidget/.test(read("app/layout.tsx"))
);

// --- No open proxy / xtream ---
ok("no_open_proxy_impl", !exists("pages/api/player/proxy.ts"));
ok("no_xtream_impl", !exists("pages/api/player/xtream.ts"));

// --- No ERP runtime DDL in active source ---
let erpRuntimeDdl = false;
for (const f of listFiles("pages/api")) {
  const src = fs.readFileSync(path.join(ROOT, f), "utf8");
  if (/CREATE TABLE|ALTER TABLE/.test(src) && /erp_/i.test(src)) erpRuntimeDdl = true;
}
ok("no_erp_runtime_ddl_active", !erpRuntimeDdl);

ok("no_drop_erp_migration", !exists("scripts/drop-erp-tables.js"));
ok(
  "r2a_test_removed",
  !exists("scripts/phase-erp-r2a-player-decoupling-tests.js")
);

console.log(`\nERP-R2C retirement: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
