/**
 * RM-B3 — Redirect Manager runtime activation (static + pure registry).
 * No production DB mutations in this suite.
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
  const mod = { exports: {} };
  const fn = new Function("exports", "module", "require", outputText);
  // Stub next/* and server modules for pure registry tests
  const fakeRequire = (id) => {
    if (id === "next/headers") return { headers: async () => ({ get: () => null }) };
    if (id === "next/cache") {
      return {
        unstable_cache: (fn) => fn,
      };
    }
    if (id === "@/lib/urlRedirectHeaders" || id.endsWith("urlRedirectHeaders")) {
      return loadTsModule("lib/urlRedirectHeaders.ts");
    }
    if (id === "@/lib/urlRedirects" || id.endsWith("/urlRedirects") || id === "./urlRedirects") {
      return loadTsModule("lib/urlRedirects.ts");
    }
    if (id === "@/lib/urlRedirectsServer" || id.endsWith("urlRedirectsServer")) {
      return { loadActiveRedirects: async () => [] };
    }
    if (id.startsWith("@/")) {
      const mapped = id.replace("@/", "");
      if (exists(mapped + ".ts")) return loadTsModule(mapped + ".ts");
    }
    return require(id);
  };
  fn(mod.exports, mod, fakeRequire);
  return mod.exports;
}

const nextConfig = read("next.config.ts");
const proxy = read("proxy.ts");
const runtime = read("lib/urlRedirectRuntime.ts");
const headersLib = read("lib/urlRedirectHeaders.ts");
const globalNf = read("app/global-not-found.tsx");
const product = read("app/products/[slug]/page.tsx");
const blog = read("app/blog/[slug]/page.tsx");
const sub = read("app/[subscriptionSlug]/page.tsx");
const panel = read("components/admin/RedirectManagerPanel.tsx");
const legacy = read("lib/productLegacyRedirects.ts");
const rt = loadTsModule("lib/urlRedirectRuntime.ts");

ok("experimental_globalNotFound", /globalNotFound:\s*true/.test(nextConfig));
ok("www_redirect_intact", /www\.firestick4uk\.com/.test(nextConfig) && /async redirects\(/.test(nextConfig));

ok("proxy_exists", exists("proxy.ts"));
ok("proxy_no_mysql", !/mysql|createPool|from ["']@\/lib\/db/.test(proxy));
ok("proxy_no_loadActive", !/loadActiveRedirects|unstable_cache|fetch\(/.test(proxy));
ok("proxy_sets_path_header", /x-f4uk-original-path|F4UK_ORIGINAL_PATH_HEADER/.test(proxy));
ok("proxy_sets_search_header", /x-f4uk-original-search|F4UK_ORIGINAL_SEARCH_HEADER/.test(proxy));
ok("proxy_overwrites_headers", /headers\.set\(/.test(proxy));
ok(
  "proxy_matcher_excludes_infra",
  /api/.test(proxy) && /sidhu/.test(proxy) && /_next/.test(proxy) && /favicon/.test(proxy)
);
ok("proxy_no_blanket_dot_exclude", !/.*\\\\\\.\\$/.test(proxy) && !/extension/i.test(proxy.split("matcher")[1] || ""));

ok("runtime_uses_unstable_cache", /unstable_cache/.test(runtime));
ok("runtime_ttl_60", /revalidate:\s*URL_REDIRECT_REGISTRY_TTL_SECONDS|revalidate:\s*60/.test(runtime));
ok("runtime_ttl_const_60", /URL_REDIRECT_REGISTRY_TTL_SECONDS\s*=\s*60/.test(runtime));
ok("runtime_cache_key", /url-redirect-registry-v1/.test(runtime));
ok("runtime_loadActive_only_here", /loadActiveRedirects/.test(runtime));
ok("proxy_no_loadActive_confirm", !/loadActiveRedirects/.test(proxy));
ok("headers_module_exists", /x-f4uk-original-path/.test(headersLib));

ok("global_not_found_exists", exists("app/global-not-found.tsx"));
ok("global_uses_resolver", /resolveManagedRedirectForCurrentRequest/.test(globalNf));
ok("global_permanentRedirect", /permanentRedirect/.test(globalNf));
ok("global_html_document", /<html lang="en">/.test(globalNf) && /<body>/.test(globalNf));
ok("global_no_navbar_provider", !/Navbar|CartProvider|SiteContentProvider|TrackingConsent/.test(globalNf));

// Dynamic miss hooks — only after miss
ok(
  "product_resolver_on_missing",
  /status === "missing"[\s\S]*resolveManagedRedirectForCurrentRequest[\s\S]*notFound\(/.test(product)
);
ok(
  "product_resolver_not_in_metadata",
  !/generateMetadata[\s\S]{0,800}resolveManagedRedirectForCurrentRequest/.test(product)
);
ok("product8_helper_still_used", /resolveProductLegacyRedirect/.test(product));
ok(
  "blog_resolver_on_missing",
  /if\s*\(!post\)\s*\{[\s\S]*resolveManagedRedirectForCurrentRequest[\s\S]*notFound\(/.test(blog)
);
ok(
  "subscription_resolver_before_final_notFound",
  /previousSlug[\s\S]*resolveManagedRedirectForCurrentRequest[\s\S]*notFound\(/.test(sub)
);

ok(
  "sidhu_otherwise_404_text",
  /otherwise return 404|Existing live pages are not overridden/i.test(panel)
);
ok("sidhu_one_minute_note", /1 minute/i.test(panel));
ok("sidhu_no_pending_note", !/Runtime activation is pending/.test(panel));

ok("product8_map_unchanged", /world-cup-offer-3-years/.test(legacy) && /3-years-season-pass/.test(legacy));

// Pure registry defense-in-depth
const row = (src, dest, active = 1, type = 308) => ({
  id: 1,
  source_path: src,
  destination_path: dest,
  redirect_type: type,
  active,
  created_at: null,
  updated_at: null,
});

const mapOk = rt.buildSafeRedirectRegistry([row("/__rm_a", "/about")]);
ok("registry_accepts_valid", mapOk["/__rm_a"] === "/about");

const mapInactive = rt.buildSafeRedirectRegistry([row("/__rm_a", "/about", 0)]);
ok("registry_skips_inactive", Object.keys(mapInactive).length === 0);

const map301 = rt.buildSafeRedirectRegistry([row("/__rm_a", "/about", 1, 301)]);
ok("registry_skips_non_308", Object.keys(map301).length === 0);

const mapSelf = rt.buildSafeRedirectRegistry([row("/about", "/about")]);
ok("registry_skips_self", Object.keys(mapSelf).length === 0);

const mapProt = rt.buildSafeRedirectRegistry([row("/sidhu", "/about")]);
ok("registry_skips_protected", Object.keys(mapProt).length === 0);

const mapExt = rt.buildSafeRedirectRegistry([
  { ...row("/__rm_a", "https://evil.example/x"), destination_path: "https://evil.example/x" },
]);
ok("registry_skips_external", Object.keys(mapExt).length === 0);

const mapChain = rt.buildSafeRedirectRegistry([
  { ...row("/a", "/b"), id: 1 },
  { ...row("/b", "/c"), id: 2, source_path: "/b", destination_path: "/c" },
]);
ok("registry_skips_chain_a_to_b", mapChain["/a"] === undefined);
ok("registry_allows_terminal_b_to_c", mapChain["/b"] === "/c");

ok(
  "append_search",
  rt.appendOriginalSearch("/faq", "?utm_source=test&a=1") === "/faq?utm_source=test&a=1"
);
ok("append_empty_search", rt.appendOriginalSearch("/faq", "") === "/faq");
ok("append_bare_question", rt.appendOriginalSearch("/faq", "?") === "/faq");

ok("fail_safe_exported", typeof rt.resolveManagedRedirectForCurrentRequest === "function");

console.log(`\nRM-B3 results: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
