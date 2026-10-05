/**
 * Phase SEO Issue Memory — pure + architecture guards.
 * Run: node scripts/phase-seo-issue-memory-tests.js
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

function loadTsModule(rel) {
  const src = read(rel);
  const { outputText } = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
    },
  });
  const sandbox = { exports: {}, module: { exports: {} } };
  const loaded = new Map();
  const localRequire = (id) => {
    const map = {
      "@/lib/seoDiagnostics": "lib/seoDiagnostics.ts",
      "@/lib/seoOverview": "lib/seoOverview.ts",
      "@/lib/seoIssueMemory": "lib/seoIssueMemory.ts",
      "@/lib/seoDiagnosticRows": "lib/seoDiagnosticRows.ts",
      "@/lib/db": null,
      "@/lib/adminAuth": null,
      "@/lib/adminPermissions": null,
      "@/lib/adminAudit": null,
    };
    if (id in map) {
      if (!map[id]) return {};
      if (loaded.has(map[id])) return loaded.get(map[id]);
      const mod = loadTsModule(map[id]);
      loaded.set(map[id], mod);
      return mod;
    }
    if (id.endsWith("/seoDiagnostics") || id.endsWith("/seoOverview")) {
      return localRequire("@/lib/" + id.split("/").pop());
    }
    return require(id);
  };
  const fn = new Function("exports", "module", "require", outputText);
  fn(sandbox.exports, sandbox.module, localRequire);
  return sandbox.module.exports && Object.keys(sandbox.module.exports).length
    ? sandbox.module.exports
    : sandbox.exports;
}

const memory = loadTsModule("lib/seoIssueMemory.ts");
const migrate = read("scripts/migrate-seo-diagnostic-issues.js");
const overview = read("pages/api/admin-seo-overview.ts");
const memoryGet = read("pages/api/admin-seo-issues.ts");
const reconcile = read("pages/api/admin-seo-issues/reconcile.ts");
const server = read("lib/seoIssueMemoryServer.ts");
const panel = read("components/admin/SeoOverviewPanel.tsx");
const db = read("lib/db.ts");
const ddlCheck = read("scripts/check-runtime-ddl.js");

console.log("\nSEO Issue Memory\n");

{
  const code = memory.extractRuleCodeFromIssue({
    id: "blog:5:title-long",
    entityType: "blog",
    entityId: "5",
  });
  ok("A_stable_rule_code", code === "title-long");
}

{
  const bad = memory.extractRuleCodeFromIssue({
    id: "blog:5:title-long",
    entityType: "product",
    entityId: "5",
  });
  ok("B_malformed_prefix_rejected", bad === null);
  const bad2 = memory.extractRuleCodeFromIssue({
    id: "not-an-issue",
    entityType: "blog",
    entityId: "5",
  });
  ok("B_malformed_id_rejected", bad2 === null);
}

{
  // Lifecycle classification (pure)
  const entityStates = new Map();
  entityStates.set("product:8", {
    entityType: "product",
    entityId: "8",
    exists: true,
    eligible: true,
  });
  entityStates.set("product:9", {
    entityType: "product",
    entityId: "9",
    exists: true,
    eligible: false,
  });
  entityStates.set("blog:5", {
    entityType: "blog",
    entityId: "5",
    exists: true,
    eligible: true,
  });

  ok(
    "I_eligible_absent_fixed",
    memory.classifyAbsentOpenIssue({
      memory: {
        issue_key: "product:8:title-long",
        entity_type: "product",
        entity_id: "8",
        status: "open",
      },
      entityStates,
      evaluatedProducts: true,
      evaluatedBlogs: false,
    }) === "fixed"
  );

  ok(
    "J_inactive_product_out_of_scope",
    memory.classifyAbsentOpenIssue({
      memory: {
        issue_key: "product:9:missing-description",
        entity_type: "product",
        entity_id: "9",
        status: "open",
      },
      entityStates,
      evaluatedProducts: true,
      evaluatedBlogs: false,
    }) === "entity_out_of_scope"
  );

  entityStates.set("blog:3", {
    entityType: "blog",
    entityId: "3",
    exists: true,
    eligible: false,
  });
  ok(
    "K_draft_blog_out_of_scope",
    memory.classifyAbsentOpenIssue({
      memory: {
        issue_key: "blog:3:title-long",
        entity_type: "blog",
        entity_id: "3",
        status: "open",
      },
      entityStates,
      evaluatedProducts: false,
      evaluatedBlogs: true,
    }) === "entity_out_of_scope"
  );

  ok(
    "L_deleted_entity",
    memory.classifyAbsentOpenIssue({
      memory: {
        issue_key: "product:99:title-long",
        entity_type: "product",
        entity_id: "99",
        status: "open",
      },
      entityStates,
      evaluatedProducts: true,
      evaluatedBlogs: false,
    }) === "deleted"
  );

  ok(
    "M_resolved_absent_skip",
    memory.classifyAbsentOpenIssue({
      memory: {
        issue_key: "product:8:title-long",
        entity_type: "product",
        entity_id: "8",
        status: "resolved",
      },
      entityStates,
      evaluatedProducts: true,
      evaluatedBlogs: false,
    }) === null
  );

  ok(
    "O_writer_blog_scope_skips_product",
    memory.classifyAbsentOpenIssue({
      memory: {
        issue_key: "product:8:title-long",
        entity_type: "product",
        entity_id: "8",
        status: "open",
      },
      entityStates,
      evaluatedProducts: false,
      evaluatedBlogs: true,
    }) === null
  );
}

{
  const payload = memory.toDetectedPayload({
    id: "blog:5:title-long",
    severity: "review",
    category: "metadata",
    entityType: "blog",
    entityId: "5",
    label: "Post",
    url: null,
    field: "meta_title",
    message: "Title long",
    evidence: "79 characters (threshold > 75).",
    editTarget: "blog",
  });
  ok("C_new_payload_shape", !!payload && payload.occurrence_count === undefined);
  ok(
    "F_evidence_same_identity",
    payload.issue_key === "blog:5:title-long" &&
      payload.rule_code === "title-long"
  );
}

ok(
  "P_overview_no_memory_mutation",
  !/seo_diagnostic_issues/.test(overview) &&
    !/reconcileSeoIssueMemory/.test(overview) &&
    !/INSERT\s+INTO/i.test(overview) &&
    !/UPDATE\s+seo_/i.test(overview)
);

{
  const q = (overview.match(/pool\.query/g) || []).length;
  ok("P_overview_query_count_le_3", q <= 3, `queries=${q}`);
}

ok("Q_memory_api_get_only", /req\.method\s*!==\s*["']GET["']/.test(memoryGet));
ok("R_reconcile_post_only", /req\.method\s*!==\s*["']POST["']/.test(reconcile));
ok(
  "S_reconcile_uses_requireAdmin_mutate",
  /requireAdmin\(req,\s*res\)/.test(reconcile) &&
    !/mutate:\s*false/.test(reconcile)
);

ok(
  "T_no_raw_html_persisted",
  !/full_description|short_description|\.content/.test(
    server.replace(/SELECT[\s\S]*?FROM blog_posts/, "SELECT_BLOCK")
  ) ||
    (/analyzeInlineImageAlts|normalizeBlogDiagnosticRow/.test(server) &&
      !/INSERT[\s\S]*content/.test(server))
);

ok(
  "U_memory_api_no_html_fields",
  !/full_description|short_description|"content"/.test(memoryGet)
);

ok(
  "V_no_ai",
  !/openai|anthropic|gemini|generateAlt/i.test(server + migrate + panel + memoryGet)
);

ok(
  "W_no_runtime_ddl",
  !/CREATE TABLE|ALTER TABLE|DROP TABLE/.test(server) &&
    !/CREATE TABLE|ALTER TABLE/.test(memoryGet) &&
    !/CREATE TABLE|ALTER TABLE/.test(reconcile)
);

ok(
  "X_migration_check_readonly",
  /Mode:.*CHECK|!APPLY/.test(migrate) &&
    /No changes made/.test(migrate) &&
    /information_schema/.test(migrate)
);

ok(
  "Y_migration_apply_guard",
  /requireMutationOptIn/.test(migrate) &&
    /ALLOW_DB_MUTATION_TESTS/.test(migrate) &&
    /--apply/.test(migrate)
);

ok(
  "Z_no_event_table",
  !/seo_diagnostic_issue_events|seo_issue_history/.test(migrate) &&
    !/seo_diagnostic_issue_events/.test(server)
);

ok(
  "upsert_preserves_first_seen",
  /ON DUPLICATE KEY UPDATE/.test(server) &&
    !/first_seen_at\s*=\s*VALUES\(first_seen_at\)/.test(server) &&
    /occurrence_count\s*=\s*occurrence_count\s*\+\s*1/.test(server) &&
    /reopened_count\s*=\s*IF\(status\s*=\s*'resolved'/.test(server)
);

ok(
  "authoritative_throw_no_empty_fallback",
  /throw new Error\("Product authoritative/.test(server) &&
    /throw new Error\("Blog authoritative/.test(server) &&
    /rollback/.test(server)
);

ok(
  "ui_sequential_memory_load",
  /loadMemory/.test(panel) &&
    /Record current diagnostics/.test(panel) &&
    /Recently resolved/.test(panel) &&
    /Not recorded/.test(panel)
);

ok(
  "ui_no_auto_reconcile_on_mount",
  !/reconcile[\s\S]{0,40}useEffect/.test(panel) &&
    /scope:\s*["']all["']/.test(panel)
);

ok(
  "super_admin_only_all_scope",
  /role\s*!==\s*["']super_admin["']/.test(reconcile)
);

ok(
  "writer_product_forbidden",
  /products\.view required/.test(reconcile) &&
    /blog\.manage required/.test(reconcile)
);

ok("db_pool_unchanged", /connectionLimit:\s*3/.test(db) && /queueLimit:\s*5/.test(db));

ok(
  "shared_normalizer_used",
  /normalizeProductDiagnosticRow/.test(overview) &&
    /normalizeBlogDiagnosticRow/.test(overview) &&
    /normalizeProductDiagnosticRow/.test(server)
);

ok(
  "D_E_G_H_lifecycle_documented_in_upsert",
  /occurrence_count\s*=\s*occurrence_count\s*\+\s*1/.test(server) &&
    /status\s*=\s*'open'/.test(server) &&
    /resolved_at\s*=\s*NULL/.test(server)
);

ok(
  "N_failed_scan_cannot_resolve_comment_or_throw",
  /Authoritative diagnostic reconcile did not complete/.test(reconcile) ||
    /rollback/.test(server)
);

ok(
  "resolution_reasons_supported",
  /fixed/.test(server) &&
    /entity_out_of_scope/.test(server) &&
    /deleted/.test(server)
);

ok(
  "no_ignore_dismiss_ui",
  !/\bIgnore\b|\bDismiss\b|\bAcknowledge\b|\bSnooze\b/.test(panel)
);

console.log(`\nSEO issue memory: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
