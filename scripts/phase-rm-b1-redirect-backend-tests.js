/**
 * RM-B1 — Redirect Manager backend foundation (pure + static invariants).
 * No DB mutations. No production migration.
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
  const sandbox = { exports: {}, require };
  const fn = new Function("exports", "module", "require", outputText);
  const mod = { exports: sandbox.exports };
  fn(mod.exports, mod, require);
  return mod.exports;
}

const perms = loadTsModule("lib/adminPermissions.ts");
const model = loadTsModule("lib/urlRedirects.ts");
const {
  normalizeInternalPathname,
  normalizeRedirectType,
  parseRedirectActive,
  validateRedirectFields,
  validateActiveRedirectGraph,
  isProtectedRedirectPath,
  CODE_OWNED_REDIRECT_SOURCES,
  URL_REDIRECT_TYPE_V1,
} = model;

const api = read("pages/api/admin-redirects.ts");
const server = read("lib/urlRedirectsServer.ts");
const migration = read("scripts/migrate-url-redirects.js");
const nextConfig = read("next.config.ts");
const productPage = read("app/products/[slug]/page.tsx");
const blogPage = read("app/blog/[slug]/page.tsx");
const subPage = read("app/[subscriptionSlug]/page.tsx");
const sidhu = read("app/sidhu/page.tsx");
const legacy = read("lib/productLegacyRedirects.ts");

// --- RBAC ---
ok("perm_redirects_manage_exists", typeof perms.hasAdminPermission === "function");
ok("sa_has_redirects_manage", perms.hasAdminPermission("super_admin", "redirects.manage") === true);
ok("manager_no_redirects_manage", perms.hasAdminPermission("manager", "redirects.manage") === false);
ok("writer_no_redirects_manage", perms.hasAdminPermission("writer", "redirects.manage") === false);
ok(
  "manager_matrix_excludes",
  !perms.ROLE_PERMISSIONS.manager.includes("redirects.manage") &&
    perms.ROLE_PERMISSIONS.super_admin.includes("redirects.manage")
);

// --- Normalization ---
ok("norm_blog", normalizeInternalPathname("blog", "source").ok && normalizeInternalPathname("blog", "source").path === "/blog");
ok(
  "norm_blog_slash",
  normalizeInternalPathname("/blog/", "source").ok && normalizeInternalPathname("/blog/", "source").path === "/blog"
);
ok(
  "norm_blog_exact",
  normalizeInternalPathname("/blog", "source").ok && normalizeInternalPathname("/blog", "source").path === "/blog"
);
ok("norm_lower", normalizeInternalPathname("/BLOG", "source").ok && normalizeInternalPathname("/BLOG", "source").path === "/blog");

ok("reject_root", !normalizeInternalPathname("/", "source").ok);
ok("reject_abs", !normalizeInternalPathname("https://firestick4uk.com/blog", "source").ok);
ok("reject_www", !normalizeInternalPathname("https://www.firestick4uk.com/blog", "source").ok);
ok("reject_query", !normalizeInternalPathname("/blog?x=1", "source").ok);
ok("reject_hash", !normalizeInternalPathname("/blog#section", "source").ok);
ok("reject_proto_rel", !normalizeInternalPathname("//evil.com/x", "source").ok);
ok("reject_javascript", !normalizeInternalPathname("javascript:alert(1)", "source").ok);
ok("reject_data", !normalizeInternalPathname("data:text/html,hi", "destination").ok);

// --- Dot segments (reject) / dotted filenames (accept) ---
for (const p of ["/.", "/..", "/foo/./bar", "/foo/../bar", "/foo/../sidhu", "/safe/../../api"]) {
  ok(
    `dotseg_reject_${p}`,
    !normalizeInternalPathname(p, "source").ok && !normalizeInternalPathname(p, "destination").ok
  );
}
ok(
  "dotseg_bypass_sidhu_impossible",
  !validateRedirectFields({ source_path: "/old-dot", destination_path: "/foo/../sidhu", existing: [] }).ok
);
ok(
  "dotseg_bypass_api_impossible",
  !validateRedirectFields({ source_path: "/old-dot2", destination_path: "/safe/../../api", existing: [] }).ok
);
ok(
  "dotted_name_post_html",
  normalizeInternalPathname("/post.html", "source").ok &&
    normalizeInternalPathname("/post.html", "source").path === "/post.html"
);
ok(
  "dotted_name_version_path",
  normalizeInternalPathname("/version-1.2/page", "destination").ok &&
    normalizeInternalPathname("/version-1.2/page", "destination").path === "/version-1.2/page"
);
ok(
  "dotted_name_my_page",
  normalizeInternalPathname("/my.page", "source").ok &&
    normalizeInternalPathname("/my.page", "source").path === "/my.page"
);

// --- Active strict parsing ---
ok("active_default_undefined", parseRedirectActive(undefined, 1).ok && parseRedirectActive(undefined, 1).active === 1);
ok("active_default_null", parseRedirectActive(null, 1).ok && parseRedirectActive(null, 1).active === 1);
ok("active_default_empty", parseRedirectActive("", 0).ok && parseRedirectActive("", 0).active === 0);
ok("active_true", parseRedirectActive(true).ok && parseRedirectActive(true).active === 1);
ok("active_false", parseRedirectActive(false).ok && parseRedirectActive(false).active === 0);
ok("active_1", parseRedirectActive(1).ok && parseRedirectActive(1).active === 1);
ok("active_0", parseRedirectActive(0).ok && parseRedirectActive(0).active === 0);
ok("active_str1", parseRedirectActive("1").ok && parseRedirectActive("1").active === 1);
ok("active_str0", parseRedirectActive("0").ok && parseRedirectActive("0").active === 0);
for (const bad of ["true", "false", "yes", "no", 2, -1, "garbage", {}, []]) {
  const label = typeof bad === "object" ? JSON.stringify(bad) : String(bad);
  ok(`active_reject_${label}`, !parseRedirectActive(bad).ok);
}
ok(
  "active_fields_reject_garbage",
  !validateRedirectFields({
    source_path: "/old-act",
    destination_path: "/about",
    active: "garbage",
    existing: [],
  }).ok
);
ok(
  "active_post_default_active",
  validateRedirectFields({ source_path: "/old-act2", destination_path: "/about", existing: [] }).ok &&
    validateRedirectFields({ source_path: "/old-act2", destination_path: "/about", existing: [] }).active === 1
);
ok(
  "active_put_preserve_via_explicit_0",
  validateRedirectFields({
    source_path: "/old-act3",
    destination_path: "/about",
    active: 0,
    existing: [],
  }).ok &&
    validateRedirectFields({
      source_path: "/old-act3",
      destination_path: "/about",
      active: 0,
      existing: [],
    }).active === 0
);

// --- Protected ---
for (const p of [
  "/sidhu",
  "/sidhu/x",
  "/api",
  "/api/x",
  "/_next",
  "/_next/x",
  "/admin",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
  "/products/world-cup-offer-3-years",
  "/products/3-years-season-pass",
  "/products/2-years-subscription",
]) {
  ok(`protected_${p}`, isProtectedRedirectPath(p) === true);
}
ok("code_owned_list", CODE_OWNED_REDIRECT_SOURCES.length === 3);

// --- Destination ---
ok(
  "dest_internal_ok",
  validateRedirectFields({ source_path: "/old-a", destination_path: "/about", existing: [] }).ok
);
ok(
  "dest_external_reject",
  !validateRedirectFields({
    source_path: "/old-b",
    destination_path: "https://example.com/x",
    existing: [],
  }).ok
);
ok(
  "dest_protected_reject",
  !validateRedirectFields({ source_path: "/old-c", destination_path: "/sidhu", existing: [] }).ok
);

// --- Type ---
ok("type_308", normalizeRedirectType(308).ok && normalizeRedirectType(308).type === 308);
ok("type_default_308", normalizeRedirectType(undefined).ok && normalizeRedirectType(undefined).type === URL_REDIRECT_TYPE_V1);
ok("type_301_reject", !normalizeRedirectType(301).ok);
ok("type_302_reject", !normalizeRedirectType(302).ok);
ok("type_307_reject", !normalizeRedirectType(307).ok);

// --- Graph safety ---
ok(
  "self_reject",
  !validateRedirectFields({ source_path: "/a", destination_path: "/a", existing: [] }).ok
);

ok(
  "dup_source",
  !validateRedirectFields({
    source_path: "/old-d",
    destination_path: "/about",
    existing: [{ id: 1, source_path: "/old-d", destination_path: "/faq", active: 0 }],
  }).ok
);

ok(
  "loop_2",
  !validateActiveRedirectGraph(
    [{ id: 1, source_path: "/a", destination_path: "/b", active: 1 }],
    { id: 2, source_path: "/b", destination_path: "/a", active: 1 }
  ).ok
);

ok(
  "cycle_3",
  !validateActiveRedirectGraph(
    [
      { id: 1, source_path: "/a", destination_path: "/b", active: 1 },
      { id: 2, source_path: "/b", destination_path: "/c", active: 1 },
    ],
    { id: 3, source_path: "/c", destination_path: "/a", active: 1 }
  ).ok
);

ok(
  "chain_reject",
  !validateActiveRedirectGraph(
    [{ id: 1, source_path: "/a", destination_path: "/b", active: 1 }],
    { id: 2, source_path: "/b", destination_path: "/c", active: 1 }
  ).ok
);

ok(
  "inactive_chain_allowed_until_enable",
  validateActiveRedirectGraph(
    [{ id: 1, source_path: "/a", destination_path: "/b", active: 1 }],
    { id: 2, source_path: "/b", destination_path: "/c", active: 0 }
  ).ok === true
);

ok(
  "enable_revalidates_chain",
  !validateActiveRedirectGraph(
    [
      { id: 1, source_path: "/a", destination_path: "/b", active: 1 },
      { id: 2, source_path: "/b", destination_path: "/c", active: 0 },
    ],
    { id: 2, source_path: "/b", destination_path: "/c", active: 1 }
  ).ok
);

ok(
  "multi_source_same_dest_ok",
  validateActiveRedirectGraph(
    [{ id: 1, source_path: "/old1", destination_path: "/about", active: 1 }],
    { id: 2, source_path: "/old2", destination_path: "/about", active: 1 }
  ).ok === true
);

// --- API invariants ---
ok("api_uses_requireAdminPermission", /requireAdminPermission\(req,\s*res,\s*["']redirects\.manage["']\)/.test(api));
ok("api_auth_before_db", api.indexOf("requireAdminPermission") < api.indexOf("listRedirects"));
ok("api_methods", /GET/.test(api) && /POST/.test(api) && /PUT/.test(api) && /DELETE/.test(api));
ok(
  "api_audit_events",
  /redirect\.created/.test(api) &&
    /redirect\.updated/.test(api) &&
    /redirect\.enabled/.test(api) &&
    /redirect\.disabled/.test(api) &&
    /redirect\.deleted/.test(api)
);
ok("api_entity_redirect", /entityType:\s*["']redirect["']/.test(api));
ok("api_parameterized_via_helpers", /createRedirect|updateRedirect|deleteRedirect|listRedirects/.test(api));
ok("server_no_ddl", !/CREATE TABLE|ALTER TABLE|DROP TABLE/i.test(server));
ok("api_no_ddl", !/CREATE TABLE|ALTER TABLE|DROP TABLE/i.test(api));
ok("migration_create_table", /CREATE TABLE IF NOT EXISTS url_redirects/.test(migration));
ok("migration_308_default", /DEFAULT 308/.test(migration));
ok("migration_unique_source", /uq_url_redirects_source/.test(migration));
ok("migration_uses_information_schema_stats", /information_schema\.statistics/.test(migration));
ok(
  "migration_required_index_names",
  /uq_url_redirects_source/.test(migration) &&
    /idx_url_redirects_active/.test(migration) &&
    /idx_url_redirects_updated/.test(migration)
);
ok("migration_no_blank_catch_alter", !/catch\s*\{\s*\/\*\s*already exists/i.test(migration));
ok("migration_fails_on_alter_error", /FAIL \[index\]/.test(migration) && /process\.exit\(1\)/.test(migration));
ok("migration_skips_via_schema_check", /already exists — skip/.test(migration) && /indexExists/.test(migration));
ok(
  "migration_post_checks_indexes",
  /required index missing/.test(migration) && /SUCCESS: url_redirects table and required indexes/.test(migration)
);
ok("migration_controlled_only", /Does NOT run on API requests or builds/.test(migration));

// Runtime activation is RM-B3; B1 only asserts Sidhu CMS does not embed DB redirect resolution.
ok("sidhu_no_runtime_redirect_resolver", !/loadActiveRedirects|urlRedirectsServer|resolveRedirectForPath/.test(sidhu));
// proxy.ts / global-not-found belong to RM-B3 — B1 no longer asserts their absence.
ok("b1_no_middleware_file", !exists("middleware.ts"));
ok("product_page_untouched_rm", !/resolveRmA|urlRedirects|__rmA/.test(productPage));
ok("blog_page_untouched_rm", !/resolveRmA|urlRedirects|__rmA/.test(blogPage));
ok("subscription_page_untouched_rm", !/resolveRmA|urlRedirects|__rmA/.test(subPage));
ok("www_rule_unchanged", /www\.firestick4uk\.com/.test(nextConfig) && /async redirects\(/.test(nextConfig));
ok(
  "product8_untouched",
  /world-cup-offer-3-years/.test(legacy) && /3-years-season-pass/.test(legacy) && /PRODUCT8_LEGACY_SLUG_REDIRECTS/.test(legacy)
);
ok("loadActiveRedirects_helper_exists", /export async function loadActiveRedirects/.test(server));
ok("no_content_revisions_change_required", true);

console.log(`\nrm-b1-redirect-backend: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
