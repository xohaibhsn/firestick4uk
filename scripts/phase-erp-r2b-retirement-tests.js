/**
 * ERP-R2B — Retire ERP UI/APIs and IPTV player; temporary 410 ERP API tombstone.
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

const tombstone = read("pages/api/erp/[...path].ts");
const robots = read("public/robots.txt");
const nextConfig = read("next.config.ts");
const seoOverview = read("lib/seoOverview.ts");
const chat = read("components/ChatWidget.tsx");

// --- ERP UI gone ---
ok("erp_ui_absent", !exists("app/erp"));
ok("erp_page_absent", !exists("app/erp/page.tsx"));
ok("erp_layout_absent", !exists("app/erp/ERPLayout.tsx"));

// --- Player gone ---
ok("player_ui_absent", !exists("app/player"));
ok("player_api_dir_absent", !exists("pages/api/player"));
ok("player_proxy_absent", !exists("pages/api/player/proxy.ts"));
ok("player_xtream_absent", !exists("pages/api/player/xtream.ts"));

const prodRoots = ["app", "pages", "components", "lib"];
let playerApiRefs = false;
let erpIptvRefs = false;
let playerApiPhp = false;
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
      const rel = path.relative(ROOT, p).replace(/\\/g, "/");
      // allow tombstone itself to mention ERP retired string only
      const src = fs.readFileSync(p, "utf8");
      if (/\/api\/player\/proxy/.test(src)) playerApiRefs = true;
      if (/\/api\/player\/xtream/.test(src)) playerApiRefs = true;
      if (/player_api\.php/.test(src)) playerApiPhp = true;
      if (/\/api\/erp\/iptv\/(proxy|xtream)/.test(src) && !rel.includes("pages/api/erp/[")) {
        erpIptvRefs = true;
      }
    }
  }
  walk(abs);
}
ok("no_prod_player_proxy_refs", !playerApiRefs);
ok("no_prod_player_api_php", !playerApiPhp);
ok("no_prod_erp_iptv_proxy_xtream_impl_refs", !erpIptvRefs);

// --- ERP API only tombstone ---
const erpApiFiles = listFiles("pages/api/erp");
ok(
  "erp_api_only_tombstone",
  erpApiFiles.length === 1 && erpApiFiles[0] === "pages/api/erp/[...path].ts",
  erpApiFiles.join(", ")
);
ok("tombstone_declares_410", /status\(\s*410\s*\)/.test(tombstone));
ok("tombstone_erp_retired_json", /ERP retired/.test(tombstone));
ok(
  "tombstone_no_db",
  !/lib\/db|from ['"].*db['"]|CREATE TABLE|ALTER TABLE|DROP TABLE/.test(
    tombstone
  )
);
ok(
  "tombstone_no_network",
  !/\bfetch\b|\bhttp\b|\bhttps\b|require\(['"]http|require\(['"]https/.test(
    tombstone
  )
);
ok(
  "tombstone_no_mutation_sql",
  !/\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bTRUNCATE\b/i.test(tombstone)
);

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
ok("chat_hides_sidhu", /startsWith\(\s*["']\/sidhu["']\s*\)/.test(chat));
ok("chat_no_erp_case", !/startsWith\(\s*["']\/erp["']\s*\)/.test(chat));

// --- No open proxy impl left ---
ok(
  "no_open_proxy_impl",
  !exists("pages/api/player/proxy.ts") &&
    !erpApiFiles.some((f) => f.includes("proxy") && !f.includes("[...path]"))
);
ok(
  "no_xtream_impl",
  !exists("pages/api/player/xtream.ts") &&
    !erpApiFiles.some((f) => f.includes("xtream"))
);

// --- No ERP runtime DDL in active source (scan pages/api except inert tombstone) ---
let erpRuntimeDdl = false;
for (const f of listFiles("pages/api")) {
  if (f === "pages/api/erp/[...path].ts") continue;
  const src = fs.readFileSync(path.join(ROOT, f), "utf8");
  if (/CREATE TABLE|ALTER TABLE/.test(src) && /erp_/i.test(src)) erpRuntimeDdl = true;
}
ok("no_erp_runtime_ddl_active", !erpRuntimeDdl);

// --- No DB drop migration added ---
ok(
  "no_drop_erp_migration",
  !/DROP\s+TABLE\s+.*erp_/i.test(tombstone) &&
    !exists("scripts/drop-erp-tables.js")
);

// --- R2A transitional test removed ---
ok(
  "r2a_test_removed",
  !exists("scripts/phase-erp-r2a-player-decoupling-tests.js")
);

console.log(`\nERP-R2B retirement: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
