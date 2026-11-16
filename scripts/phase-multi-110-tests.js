/**
 * F4UK-MULTI-110 — public admin edit bar + /sidhu deep links + trust_activation label.
 * Static source contracts + pure helpers. No real DB / network / cookies injected.
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

function loadTs(rel, stubs = {}) {
  const abs = path.join(ROOT, rel);
  const src = fs.readFileSync(abs, "utf8");
  const out = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
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
      const mapped = id.slice(2);
      for (const candidate of [
        path.join(ROOT, mapped + ".ts"),
        path.join(ROOT, mapped + ".tsx"),
        path.join(ROOT, mapped + ".js"),
      ]) {
        if (fs.existsSync(candidate)) {
          return loadTs(path.relative(ROOT, candidate).replace(/\\/g, "/"), stubs);
        }
      }
    }
    if (id.startsWith("./") || id.startsWith("../")) {
      const base = path.normalize(path.join(path.dirname(abs), id));
      for (const candidate of [base + ".ts", base + ".tsx", base + ".js"]) {
        if (fs.existsSync(candidate)) {
          return loadTs(path.relative(ROOT, candidate).replace(/\\/g, "/"), stubs);
        }
      }
    }
    return orig(id);
  };
  m._compile(out, abs);
  return m.exports;
}

console.log("\n# MULTI-110 source contracts");

ok("stub_exists", exists("components/admin/PublicAdminBarStub.tsx"));
ok("bar_exists", exists("components/admin/PublicAdminBar.tsx"));
ok("hint_lib_exists", exists("lib/adminHintCookie.ts"));
ok("deep_links_lib_exists", exists("lib/publicAdminDeepLinks.ts"));

const layout = read("app/layout.tsx");
ok(
  "layout_mounts_stub",
  layout.includes("PublicAdminBarStub") && layout.includes("<PublicAdminBarStub")
);

const stubSrc = read("components/admin/PublicAdminBarStub.tsx");
ok("stub_checks_hint_cookie", /hasAdminHintCookie|f4uk_ah=1/.test(stubSrc));
ok("stub_dynamic_import", /import\(\s*["']\.\/PublicAdminBar["']\s*\)/.test(stubSrc));
ok("stub_skips_sidhu", /\/sidhu/.test(stubSrc));
ok("stub_skips_cms_preview", /cms_preview/.test(stubSrc));
ok("stub_skips_iframe", /window\.self\s*!==\s*window\.top|self\s*!==\s*top/.test(stubSrc));

const barSrc = read("components/admin/PublicAdminBar.tsx");
ok("bar_fetches_admin_session", /\/api\/admin-session/.test(barSrc));
ok("bar_credentials_include", /credentials:\s*["']include["']/.test(barSrc));
ok("bar_no_store", /cache:\s*["']no-store["']/.test(barSrc));
ok(
  "bar_no_mutating_methods",
  !/\bmethod:\s*["'](POST|PUT|DELETE|PATCH)["']/.test(barSrc) &&
    !/\.post\(|\.put\(|\.delete\(/i.test(barSrc)
);
ok("bar_clears_hint_unauth", /clearAdminHintCookie/.test(barSrc));
ok("bar_edit_this_page", /Edit this page/.test(barSrc));
ok("bar_fields_panel", /Fields on this page/.test(barSrc));
ok("bar_open_cms", /Open CMS/.test(barSrc));
ok("bar_hide", /Hide bar/.test(barSrc));
ok("bar_uses_static_fields", /fieldsForPublicPath/.test(barSrc));
ok("bar_no_site_content_fetch", !/\/api\/site-content/.test(barSrc));
ok(
  "bar_permission_names",
  /content\.manage/.test(barSrc) &&
    /settings\.manage/.test(barSrc) &&
    /products\.manage/.test(barSrc) &&
    /blog\.manage/.test(barSrc)
);
ok("bar_aria_label", /aria-label=["']Admin edit bar["']/.test(barSrc));
ok("bar_collapse_localStorage", /localStorage/.test(barSrc));

const sidhu = read("app/sidhu/page.tsx");
ok("sidhu_sets_hint_on_session", /setAdminHintCookie\(\)/.test(sidhu));
ok("sidhu_clears_hint_logout", /clearAdminHintCookie\(\)/.test(sidhu) && /handleLogout/.test(sidhu));
ok("sidhu_clears_hint_expired", /handleSessionExpired[\s\S]*clearAdminHintCookie|clearAdminHintCookie\(\);\s*\n\s*setLoggedIn\(false\)/.test(sidhu));
ok("sidhu_deep_link_field", /isValidDeepLinkFieldKey|fieldParam/.test(sidhu));
ok("sidhu_deep_link_open", /isValidDeepLinkPath|resolveOpenDeepLink|openParam/.test(sidhu));
ok("sidhu_field_not_found_toast", /Field not found/.test(sidhu));
ok("sidhu_no_direct_editor_toast", /No direct editor for this page/.test(sidhu));
ok(
  "no_auth_api_changes",
  !read("pages/api/admin-login.ts").includes("f4uk_ah") &&
    !read("pages/api/admin-logout.ts").includes("f4uk_ah") &&
    !read("pages/api/admin-session.ts").includes("f4uk_ah")
);

ok(
  "trust_activation_label",
  /Test field \(safe to edit — not shown on the website\)/.test(sidhu)
);
ok(
  "trust_activation_help",
  /Used only for CMS safety checks\. Changing it has no effect on the public site\./.test(
    sidhu
  )
);

console.log("\n# MULTI-110 hint cookie helpers");
const hint = loadTs("lib/adminHintCookie.ts");
ok(
  "hint_set_format",
  hint.buildAdminHintCookieSet() ===
    "f4uk_ah=1; Path=/; Max-Age=43200; SameSite=Lax; Secure"
);
ok(
  "hint_clear_max_age_0",
  hint.buildAdminHintCookieClear() ===
    "f4uk_ah=1; Path=/; Max-Age=0; SameSite=Lax; Secure"
);
ok("hint_detect_present", hint.hasAdminHintCookie("a=1; f4uk_ah=1; b=2") === true);
ok("hint_detect_absent", hint.hasAdminHintCookie("a=1; b=2") === false);
ok("hint_detect_not_prefix", hint.hasAdminHintCookie("xf4uk_ah=1") === false);

console.log("\n# MULTI-110 deep-link validation + mapping");
const dl = loadTs("lib/publicAdminDeepLinks.ts");

ok("field_ok_simple", dl.isValidDeepLinkFieldKey("home_hero_title") === true);
ok("field_ok_underscores", dl.isValidDeepLinkFieldKey("a_b_c") === true);
ok("field_bad_dash", dl.isValidDeepLinkFieldKey("home-hero") === false);
ok("field_bad_upper", dl.isValidDeepLinkFieldKey("Home") === false);
ok("field_bad_empty", dl.isValidDeepLinkFieldKey("") === false);
ok("field_bad_long", dl.isValidDeepLinkFieldKey("a".repeat(81)) === false);
ok("field_ok_80", dl.isValidDeepLinkFieldKey("a".repeat(80)) === true);

ok("path_ok_root", dl.isValidDeepLinkPath("/") === true);
ok("path_ok_products", dl.isValidDeepLinkPath("/products/firestick-4k") === true);
ok("path_bad_double_slash", dl.isValidDeepLinkPath("//evil") === false);
ok("path_bad_scheme_js", dl.isValidDeepLinkPath("javascript:alert(1)") === false);
ok("path_bad_no_slash", dl.isValidDeepLinkPath("products") === false);
ok("path_bad_overlong", dl.isValidDeepLinkPath("/" + "x".repeat(200)) === false);
ok("path_ok_200", dl.isValidDeepLinkPath("/" + "x".repeat(199)) === true);

const mapCases = [
  ["/", "content_page", "home"],
  ["/products", "content_page", "products"],
  ["/about", "content_page", "about"],
  ["/faq", "content_page", "faq"],
  ["/contact", "content_page", "contact"],
  ["/iptv-subscriptions-uk", "content_page", "subscription"],
  ["/seasonal-offers", "content_page", "home"],
  ["/blog", "content_page", "blog"],
  ["/order-tracking", "content_page", "tracking"],
  ["/cart", "content_page", "cart"],
  ["/privacy-policy", "content_page", "legal"],
  ["/terms", "content_page", "legal"],
  ["/refund-policy", "content_page", "legal"],
];
for (const [p, kind, edit] of mapCases) {
  const t = dl.resolveOpenDeepLink(p);
  ok(
    `open_map_${p.replace(/\W+/g, "_") || "root"}`,
    t.kind === kind && (kind !== "content_page" || t.editPage === edit),
    JSON.stringify(t)
  );
}
ok(
  "open_product_slug",
  (() => {
    const t = dl.resolveOpenDeepLink("/products/firestick-4k");
    return t.kind === "product_slug" && t.slug === "firestick-4k";
  })()
);
ok(
  "open_blog_slug",
  (() => {
    const t = dl.resolveOpenDeepLink("/blog/my-post");
    return t.kind === "blog_slug" && t.slug === "my-post";
  })()
);
ok(
  "open_unknown_overview",
  dl.resolveOpenDeepLink("/no-such-page").kind === "overview_unknown"
);

console.log("\n# MULTI-110 fields panel static mapping");
const homeFields = dl.fieldsForPublicPath("/", 60);
ok("fields_home_nonempty", Array.isArray(homeFields) && homeFields.length > 0);
ok("fields_home_max_60", homeFields.length <= 60);
ok(
  "fields_shape",
  homeFields.every((f) => typeof f.key === "string" && typeof f.label === "string")
);
ok(
  "fields_no_values",
  homeFields.every((f) => Object.keys(f).every((k) => k === "key" || k === "label"))
);

console.log("\n# MULTI-110 stub behavior (mocked)");
{
  // Simulate stub decision logic mirrored in source
  function shouldImport(cookie, pathname, search, isIframe) {
    if (!/(?:^|;\s*)f4uk_ah=1(?:;|$)/.test(cookie || "")) return false;
    const path = pathname || "/";
    if (path === "/sidhu" || path.startsWith("/sidhu/")) return false;
    if (new URLSearchParams(search || "").get("cms_preview") === "1") return false;
    if (isIframe) return false;
    return true;
  }
  ok("stub_no_hint_no_import", shouldImport("", "/", "", false) === false);
  ok("stub_hint_imports", shouldImport("f4uk_ah=1", "/", "", false) === true);
  ok("stub_hint_sidhu_no", shouldImport("f4uk_ah=1", "/sidhu", "", false) === false);
  ok(
    "stub_hint_preview_no",
    shouldImport("f4uk_ah=1", "/", "?cms_preview=1", false) === false
  );
  ok("stub_hint_iframe_no", shouldImport("f4uk_ah=1", "/", "", true) === false);
}

console.log("\n# MULTI-110 SSR: stub is client-only (no admin-bar markup in module SSR text)");
ok(
  "stub_use_client",
  stubSrc.startsWith('"use client"') || stubSrc.startsWith("'use client'")
);
ok(
  "bar_use_client",
  barSrc.startsWith('"use client"') || barSrc.startsWith("'use client'")
);
ok(
  "layout_no_admin_bar_markup",
  !layout.includes("f4uk-pab") && !layout.includes("Admin edit bar")
);

console.log(`\n# MULTI-110 summary: pass=${passed} fail=${failed}`);
process.exit(failed ? 1 : 0);
