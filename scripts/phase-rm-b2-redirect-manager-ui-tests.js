/**
 * RM-B2 — Sidhu Redirect Manager UI (static + RBAC invariants).
 * No DB mutations. No runtime activation.
 */
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

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

function loadTsModule(rel) {
  const src = read(rel);
  const { outputText } = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
    },
  });
  const fn = new Function("exports", "module", "require", outputText);
  const mod = { exports: {} };
  fn(mod.exports, mod, require);
  return mod.exports;
}

const perms = loadTsModule("lib/adminPermissions.ts");
const sidhu = read("app/sidhu/page.tsx");
const panelSrc = read("components/admin/RedirectManagerPanel.tsx");
const permsSrc = read("lib/adminPermissions.ts");
const nextConfig = read("next.config.ts");
const productPage = read("app/products/[slug]/page.tsx");
const blogPage = read("app/blog/[slug]/page.tsx");
const subPage = read("app/[subscriptionSlug]/page.tsx");
const legacy = read("lib/productLegacyRedirects.ts");
const pkg = JSON.parse(read("package.json"));

// 1 SidhuTab includes redirects
ok(
  "sidhu_tab_includes_redirects",
  /SidhuTab\s*=[\s\S]*?\|\s*"redirects"/.test(permsSrc) ||
    /"seo"\s*\|\s*"redirects"/.test(permsSrc) ||
    /\|\s*"redirects"\s*;/.test(permsSrc)
);

// 2 redirects → redirects.manage
ok(
  "redirects_maps_to_redirects_manage",
  /redirects:\s*"redirects\.manage"/.test(permsSrc)
);

// 3–5 canAccessSidhuTab
ok("sa_can_access_redirects", perms.canAccessSidhuTab("super_admin", "redirects") === true);
ok("manager_cannot_access_redirects", perms.canAccessSidhuTab("manager", "redirects") === false);
ok("writer_cannot_access_redirects", perms.canAccessSidhuTab("writer", "redirects") === false);

// 6 sidebar
ok(
  "sidebar_contains_redirects",
  /id:"redirects"/.test(sidhu) && /label:"Redirects"/.test(sidhu)
);
ok(
  "sidebar_order_seo_redirects_media_history",
  /id:"seo"[\s\S]*?id:"redirects"[\s\S]*?id:"media"[\s\S]*?id:"history"/.test(sidhu)
);

// 7 UI only for proper tab
ok(
  "redirects_ui_tab_gated",
  /tab==="redirects"\s*&&\s*canAccessSidhuTab\(adminRole,\s*"redirects"\)/.test(sidhu) &&
    /<RedirectManagerPanel\s+role=\{adminRole\}\s+adminApi=\{adminApi\}\s*\/>/.test(sidhu)
);

// 8–12 API
ok("get_uses_admin_redirects", /adminApiRef\.current\("\/api\/admin-redirects"\)/.test(panelSrc));
ok("post_create_exists", /method:\s*"POST"/.test(panelSrc) && /\/api\/admin-redirects/.test(panelSrc));
ok("put_edit_exists", /method:\s*"PUT"/.test(panelSrc) && /source_path:\s*form\.source_path/.test(panelSrc));
ok(
  "enable_disable_uses_put",
  /JSON\.stringify\(\{\s*id:\s*row\.id,\s*active\s*\}\)/.test(panelSrc) &&
    /method:\s*"PUT"/.test(panelSrc)
);
ok(
  "delete_exists",
  /method:\s*"DELETE"/.test(panelSrc) && /\/api\/admin-redirects\?id=/.test(panelSrc)
);

// 13 Permanent (308), not 301
ok("ui_permanent_308", /Permanent \(308\)/.test(panelSrc));
ok("ui_no_301", !/\b301\b/.test(panelSrc));

// client UX validation present
ok("client_validate_fn", /export function clientValidateRedirectPaths/.test(panelSrc));
ok("client_validate_required", /Source path is required/.test(panelSrc) && /Destination path is required/.test(panelSrc));
ok("client_validate_same", /Source and destination must be different/.test(panelSrc));
ok("client_validate_absolute", /not an absolute URL/.test(panelSrc));
ok("client_validate_query", /query string or fragment/.test(panelSrc));

// Runtime files are RM-B3 — B2 UI phase only asserts the panel itself has no runtime wiring.
ok(
  "no_runtime_in_panel",
  !/unstable_cache|global-not-found|resolveRedirect|urlRedirectsServer|loadActiveRedirects/.test(panelSrc)
);
ok(
  "panel_no_db_schema",
  !/CREATE TABLE|ALTER TABLE/.test(panelSrc)
);
ok("product_page_no_admin_redirects_api", !/admin-redirects|RedirectManager/.test(productPage));
ok("blog_page_no_admin_redirects_api", !/admin-redirects|RedirectManager/.test(blogPage));
ok("subscription_page_no_admin_redirects_api", !/admin-redirects|RedirectManager/.test(subPage));
ok(
  "legacy_redirects_untouched_export",
  /productLegacyRedirects|LEGACY|redirect/i.test(legacy)
);
ok(
  "www_next_config_present",
  nextConfig.length > 50 && !/RedirectManagerPanel/.test(nextConfig)
);

// 19–20
ok("panel_file_exists", exists("components/admin/RedirectManagerPanel.tsx"));
ok(
  "sidhu_imports_panel",
  sidhu.includes('import RedirectManagerPanel from "@/components/admin/RedirectManagerPanel"')
);
ok(
  "runtime_miss_only_note",
  /otherwise return 404|otherwise-404|Existing live pages are not overridden/i.test(panelSrc)
);
ok(
  "activation_delay_note",
  /1 minute|about 1 minute/i.test(panelSrc)
);
ok("no_optimistic_setRows_prev", !/setRows\(\s*\(prev\)/.test(panelSrc));
ok("heading_redirects", /Manage permanent redirects/.test(panelSrc));
ok("empty_state", /No redirects yet\./.test(panelSrc));
ok("package_name_stable", pkg.name === "firestick44uk");

console.log(`\nRM-B2 results: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
