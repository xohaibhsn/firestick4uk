/**
 * Phase SEO Post-Save Guard — pure + architecture tests.
 * Run: node scripts/phase-seo-post-save-guard-tests.js
 */
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..");
let passed = 0;
let failed = 0;

function ok(name, cond, detail = "") {
  if (cond) {
    passed += 1;
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed += 1;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function loadTsModule(rel, stubs = {}) {
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
    if (stubs[id]) return stubs[id];
    if (id === "@/lib/seoIssueMemoryServer" || id.endsWith("/seoIssueMemoryServer")) {
      return stubs.seoIssueMemoryServer || {
        reconcileSeoIssueMemory: async () => ({
          currentIssues: [],
          detectedIssues: 0,
        }),
      };
    }
    if (id.startsWith("@/")) {
      const mapped = id.replace("@/", "") + (id.endsWith(".ts") ? "" : "");
      const candidates = [
        mapped + ".ts",
        mapped,
        path.join("lib", path.basename(mapped) + ".ts"),
      ];
      for (const c of candidates) {
        if (fs.existsSync(path.join(ROOT, c))) return loadTsModule(c, stubs);
      }
    }
    return require(id);
  };
  const fn = new Function(
    "exports",
    "module",
    "require",
    "__dirname",
    "__filename",
    outputText
  );
  fn(
    sandbox.exports,
    sandbox.module,
    localRequire,
    path.dirname(path.join(ROOT, rel)),
    path.join(ROOT, rel)
  );
  return sandbox.module.exports && Object.keys(sandbox.module.exports).length
    ? sandbox.module.exports
    : sandbox.exports;
}

const productsApi = read("pages/api/admin-products.ts");
const blogApi = read("pages/api/blog.ts");
const blogPersistence = read("lib/blogPersistenceServer.ts");
const guardSrc = read("lib/postSaveSeoGuard.ts");
const memoryServer = read("lib/seoIssueMemoryServer.ts");
const sidhu = read("app/sidhu/page.tsx");
const restore = read("pages/api/admin-revisions/restore.ts");
const overview = read("pages/api/admin-seo-overview.ts");
const reconcileApi = read("pages/api/admin-seo-issues/reconcile.ts");
const db = read("lib/db.ts");
const helperSrc = read("lib/seoDiagnostics.ts");

const { shouldRunPostSaveSeoGuard, runPostSaveSeoGuard, formatSeoGuardBanner } =
  loadTsModule("lib/postSaveSeoGuard.ts");

function assertCall(api, label, opNeedle) {
  ok(
    label,
    /runPostSaveSeoGuard/.test(api) &&
      new RegExp(`operation:\\s*['"]${opNeedle}['"]`).test(api)
  );
}

assertCall(productsApi, "A_product_create_calls_guard", "create");
assertCall(blogPersistence, "B_blog_create_calls_guard", "create");
assertCall(productsApi, "C_product_update_calls_guard", "update");

{
  const priceOnly = shouldRunPostSaveSeoGuard({
    entityType: "product",
    operation: "update",
    changedFields: ["price"],
  });
  ok("D_product_price_only_skips", !priceOnly.run && priceOnly.skip_reason === "no_seo_field_change");
}

{
  const cat = shouldRunPostSaveSeoGuard({
    entityType: "product",
    operation: "update",
    changedFields: ["category"],
  });
  ok("E_product_category_only_skips", !cat.run);
}

{
  const fk = shouldRunPostSaveSeoGuard({
    entityType: "product",
    operation: "update",
    changedFields: ["focus_keyword"],
  });
  ok("F_product_focus_keyword_only_skips", !fk.run);
}

{
  const noop = shouldRunPostSaveSeoGuard({
    entityType: "product",
    operation: "update",
    changedFields: [],
  });
  ok("G_product_noop_skips", !noop.run && noop.skip_reason === "noop_update");
  ok(
    "G_product_noop_api_returns_skipped_guard",
    /changedFields\.length === 0[\s\S]*seo_guard[\s\S]*skipped/.test(productsApi)
  );
}

ok(
  "H_blog_title_update_runs",
  shouldRunPostSaveSeoGuard({
    entityType: "blog",
    operation: "update",
    changedFields: ["title"],
  }).run
);
ok(
  "I_blog_content_update_runs",
  shouldRunPostSaveSeoGuard({
    entityType: "blog",
    operation: "update",
    changedFields: ["content"],
  }).run
);
ok(
  "J_blog_featured_image_runs",
  shouldRunPostSaveSeoGuard({
    entityType: "blog",
    operation: "update",
    changedFields: ["featured_image"],
  }).run
);
ok(
  "K_blog_status_runs",
  shouldRunPostSaveSeoGuard({
    entityType: "blog",
    operation: "update",
    changedFields: ["status"],
  }).run
);
ok(
  "L_blog_emoji_only_skips",
  !shouldRunPostSaveSeoGuard({
    entityType: "blog",
    operation: "update",
    changedFields: ["emoji"],
  }).run
);
ok(
  "M_blog_featured_only_skips",
  !shouldRunPostSaveSeoGuard({
    entityType: "blog",
    operation: "update",
    changedFields: ["featured"],
  }).run
);
ok(
  "N_blog_focus_keyword_only_skips",
  !shouldRunPostSaveSeoGuard({
    entityType: "blog",
    operation: "update",
    changedFields: ["focus_keyword"],
  }).run
);
ok(
  "O_blog_faqs_only_skips",
  !shouldRunPostSaveSeoGuard({
    entityType: "blog",
    operation: "update",
    changedFields: ["faqs"],
  }).run
);
ok(
  "P_blog_noop_skips",
  !shouldRunPostSaveSeoGuard({
    entityType: "blog",
    operation: "update",
    changedFields: [],
  }).run
);

assertCall(productsApi, "Q_product_delete_calls_guard", "delete");
assertCall(blogApi, "R_blog_delete_calls_guard", "delete");

ok(
  "S_no_internal_http",
  !/fetch\s*\(/.test(guardSrc) &&
    !/http:\/\/|https:\/\/|localhost/.test(guardSrc) &&
    /reconcileSeoIssueMemory/.test(guardSrc)
);

(async () => {
  const failing = loadTsModule("lib/postSaveSeoGuard.ts", {
    seoIssueMemoryServer: {
      reconcileSeoIssueMemory: async () => {
        throw new Error("simulated reconcile failure");
      },
    },
  });
  const unavailable = await failing.runPostSaveSeoGuard({
    entityType: "product",
    entityId: 1,
    operation: "create",
  });
  ok("T_guard_catches_reconcile_failure", unavailable.status === "unavailable");
  ok(
    "U_failure_returns_unavailable",
    unavailable.memory_synced === false &&
      /temporarily unavailable/i.test(String(unavailable.message || ""))
  );

  ok(
    "V_cms_success_keys_with_guard",
    /success:\s*true[\s\S]*seo_guard/.test(productsApi) &&
      /success:\s*true[\s\S]*seo_guard/.test(blogApi)
  );
  ok(
    "W_product_create_returns_id_slug",
    /id:\s*result\.insertId[\s\S]*slug:\s*finalSlug[\s\S]*seo_guard/.test(
      productsApi
    ) ||
      /seo_guard[\s\S]*id:\s*result\.insertId/.test(productsApi)
  );
  ok(
    "X_blog_create_returns_id",
    /success:\s*true,\s*id:\s*insertId,\s*seo_guard/.test(blogPersistence) &&
      /createBlogPost/.test(blogApi)
  );
  ok(
    "Y_product_update_returns_slug_changed_fields",
    /slug:\s*merged\.slug[\s\S]*changed_fields:\s*changedFields[\s\S]*seo_guard/.test(
      productsApi
    ) ||
      /changed_fields:\s*changedFields[\s\S]*seo_guard/.test(productsApi)
  );
  ok(
    "Z_blog_update_returns_changed_fields",
    /changed_fields:\s*changedFields[\s\S]*seo_guard/.test(blogPersistence) &&
      /updateBlogPost/.test(blogApi)
  );

  ok(
    "AA_severity_needs-attention_hyphen",
    /"needs-attention"/.test(guardSrc) && !/"needs_attention"/.test(guardSrc)
  );
  ok(
    "AB_no_raw_html_in_guard_types",
    !/rawHtml|innerHTML|full_description:\s*string/.test(guardSrc)
  );
  ok(
    "AC_no_ai",
    !/openai|anthropic|gemini|chatgpt/i.test(guardSrc) &&
      !/openai|anthropic|gemini/i.test(productsApi) &&
      !/openai|anthropic|gemini/i.test(blogApi)
  );
  ok(
    "AD_no_runtime_ddl",
    !/CREATE TABLE|ALTER TABLE|DROP TABLE/i.test(guardSrc) &&
      !/CREATE TABLE|ALTER TABLE/i.test(productsApi)
  );
  ok(
    "AE_db_pool_unchanged",
    /connectionLimit:\s*3/.test(db) && /queueLimit:\s*5/.test(db)
  );
  ok(
    "AF_product_partial_hasOwn",
    /hasOwn\(body,\s*['"]name['"]\)/.test(productsApi) &&
      /hasOwn\(body,\s*['"]price['"]\)/.test(productsApi)
  );
  ok(
    "AG_strict_price_validation",
    /validatePrice/.test(productsApi)
  );
  ok(
    "AH_product_slug_protection",
    /Existing product URL slug is protected/.test(productsApi)
  );
  ok(
    "AI_blog_published_slug_protection",
    /BLOG_PUBLISHED_SLUG_PROTECTED_MESSAGE/.test(blogPersistence)
  );
  ok(
    "AJ_no_extra_automatic_audit_for_guard",
    !/seo\.issues_reconciled/.test(productsApi) &&
      !/seo\.issues_reconciled/.test(blogApi) &&
      !/seo\.issues_reconciled/.test(guardSrc)
  );
  ok(
    "AK_manual_reconcile_api_exists",
    /reconcileSeoIssueMemory/.test(reconcileApi) &&
      /seo\.issues_reconciled/.test(reconcileApi)
  );
  ok(
    "AL_restore_guard_hook_after_commit",
    /runPostSaveSeoGuard/.test(restore) &&
      /operation:\s*"restore"/.test(restore) &&
      /await conn\.commit\(\)[\s\S]*runPostSaveSeoGuard/.test(restore)
  );
  ok(
    "AM_currentIssues_from_detected_pass",
    /currentIssues\.push/.test(memoryServer) &&
      /for \(const issue of diagnostics\.issues\)/.test(memoryServer) &&
      !/listSeoIssueMemory/.test(
        memoryServer.slice(
          memoryServer.indexOf("export async function reconcileSeoIssueMemory")
        )
      )
  );
  ok(
    "AN_overview_get_readonly",
    /req\.method !== ["']GET["']/.test(overview) &&
      !/runPostSaveSeoGuard|INSERT INTO seo_diagnostic/.test(overview)
  );
  ok(
    "AO_sidhu_unavailable_stays_success",
    /formatSeoGuardBannerClient/.test(sidhu) &&
      /Product saved\$\{formatSeoGuardBannerClient/.test(sidhu) &&
      /Post (published|updated)!.*formatSeoGuardBannerClient|formatSeoGuardBannerClient\(res\.seo_guard\)/.test(
        sidhu
      ) &&
      /status === ["']unavailable["']/.test(sidhu)
  );

  // SEO-relevant product update runs
  ok(
    "product_seo_title_update_runs",
    shouldRunPostSaveSeoGuard({
      entityType: "product",
      operation: "update",
      changedFields: ["seo_title"],
    }).run
  );
  ok(
    "product_create_always_runs",
    shouldRunPostSaveSeoGuard({
      entityType: "product",
      operation: "create",
    }).run
  );
  ok(
    "delete_always_runs",
    shouldRunPostSaveSeoGuard({
      entityType: "blog",
      operation: "delete",
    }).run
  );

  const banner = formatSeoGuardBanner({
    status: "checked",
    entity_type: "blog",
    entity_id: "5",
    operation: "update",
    issue_count: 1,
    needs_attention: 0,
    review: 1,
    issues: [
      {
        id: "blog:5:title-long",
        severity: "review",
        category: "metadata",
        field: "meta_title",
        message: "Effective blog title exceeds the review threshold.",
        evidence: "79",
      },
    ],
    memory_synced: true,
  });
  ok(
    "banner_includes_first_message",
    /SEO: 1 Review/.test(banner) &&
      /Effective blog title exceeds the review threshold/.test(banner)
  );

  // Guard after audit/cache in product create (ordering signal)
  ok(
    "product_create_guard_after_audit",
    /product\.created[\s\S]*invalidateSitemapCache[\s\S]*runPostSaveSeoGuard/.test(
      productsApi
    )
  );
  ok(
    "product_update_guard_after_commit",
    /await conn\.commit\(\)[\s\S]*product\.updated[\s\S]*runPostSaveSeoGuard/.test(
      productsApi
    )
  );

  console.log(
    `\nSEO post-save guard: ${passed} passed, ${failed} failed\n`
  );
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
