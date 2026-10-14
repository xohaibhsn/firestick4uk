/**
 * JSEO-W1 — SEO Daily Work Queue (read-only suggested priorities).
 * Pure helper + panel source contracts. No DB, HTTP, live AI, or CMS writes.
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
  const fn = new Function("exports", "module", "require", outputText);
  fn(sandbox.exports, sandbox.module, require);
  return sandbox.module.exports && Object.keys(sandbox.module.exports).length
    ? sandbox.module.exports
    : sandbox.exports;
}

const helperSrc = read("lib/seoDailyWorkQueue.ts");
const panelSrc = read("components/admin/SeoOverviewPanel.tsx");
const sidhuSrc = read("app/sidhu/page.tsx");
const overviewApiSrc = read("pages/api/admin-seo-overview.ts");
const researchRouteSrc = read("pages/api/admin-blog-research.ts");
const perms = loadTsModule("lib/adminPermissions.ts");
const {
  buildSeoDailyWorkQueue,
  SEO_DAILY_WORK_QUEUE_DEFAULT_LIMIT,
} = loadTsModule("lib/seoDailyWorkQueue.ts");

function issue(overrides) {
  return {
    id: "blog:1:missing_meta",
    severity: "review",
    category: "metadata",
    entityType: "blog",
    entityId: "1",
    label: "Sample Blog",
    url: "https://firestick4uk.com/blog/sample",
    field: "meta_description",
    message: "Meta description is missing.",
    evidence: "meta_description empty",
    editTarget: "blog",
    ...overrides,
  };
}

function verification(overrides) {
  return {
    url: "https://firestick4uk.com/products/old",
    label: "Legacy product URL",
    group: "core-content",
    kind: "legacy-redirect",
    expectedStatus: 308,
    expectedCanonical: null,
    expectedTarget: "https://firestick4uk.com/products/new",
    inSitemap: false,
    note: "Confirm redirect in GSC URL Inspection.",
    ...overrides,
  };
}

const allPerms = {
  products: true,
  blog: true,
  productsManage: true,
  blogManage: true,
};

console.log("\nJSEO-W1 Daily Work Queue\n");

// --- ORDERING ---
{
  const result = buildSeoDailyWorkQueue({
    issues: [
      issue({
        id: "blog:2:review",
        severity: "review",
        entityId: "2",
        label: "Review Blog",
      }),
      issue({
        id: "product:9:needs",
        severity: "needs-attention",
        entityType: "product",
        entityId: "9",
        label: "Needs Product",
        editTarget: "products",
        url: "https://firestick4uk.com/products/needs",
      }),
      issue({
        id: "blog:1:needs",
        severity: "needs-attention",
        entityId: "1",
        label: "Needs Blog",
      }),
    ],
    verificationQueue: [
      verification({
        url: "https://firestick4uk.com/core",
        label: "Core page",
        group: "core-content",
      }),
      verification({
        url: "https://firestick4uk.com/mig",
        label: "Migration URL",
        group: "priority-migrations",
        kind: "current",
        expectedStatus: 200,
        expectedCanonical: "https://firestick4uk.com/mig",
        expectedTarget: null,
        note: "Confirm indexed URL after migration.",
      }),
    ],
    permissions: allPerms,
    limit: 10,
  });

  ok(
    "O_needs_before_review",
    result.items[0].priority === 1 &&
      result.items[1].priority === 1 &&
      result.items[2].priority === 2
  );
  ok(
    "O_migrations_before_core_gsc",
    result.items.some((i) => i.priority === 3) &&
      result.items.some((i) => i.priority === 4) &&
      result.items.findIndex((i) => i.priority === 3) <
        result.items.findIndex((i) => i.priority === 4)
  );
  const orderA = result.items.map((i) => i.key).join("|");
  const orderB = buildSeoDailyWorkQueue({
    issues: [
      issue({
        id: "blog:1:needs",
        severity: "needs-attention",
        entityId: "1",
        label: "Needs Blog",
      }),
      issue({
        id: "product:9:needs",
        severity: "needs-attention",
        entityType: "product",
        entityId: "9",
        label: "Needs Product",
        editTarget: "products",
        url: "https://firestick4uk.com/products/needs",
      }),
      issue({
        id: "blog:2:review",
        severity: "review",
        entityId: "2",
        label: "Review Blog",
      }),
    ],
    verificationQueue: [
      verification({
        url: "https://firestick4uk.com/mig",
        label: "Migration URL",
        group: "priority-migrations",
        kind: "current",
        expectedStatus: 200,
        expectedCanonical: "https://firestick4uk.com/mig",
        expectedTarget: null,
        note: "Confirm indexed URL after migration.",
      }),
      verification({
        url: "https://firestick4uk.com/core",
        label: "Core page",
        group: "core-content",
      }),
    ],
    permissions: allPerms,
    limit: 10,
  })
    .items.map((i) => i.key)
    .join("|");
  ok("O_deterministic_stable", orderA === orderB && orderA.length > 0);
}

// --- DEDUPE / LIMIT ---
{
  const result = buildSeoDailyWorkQueue({
    issues: [
      issue({ id: "blog:1:dup" }),
      issue({ id: "blog:1:dup" }),
    ],
    verificationQueue: [
      verification({ url: "https://firestick4uk.com/x" }),
      verification({ url: "https://firestick4uk.com/x" }),
    ],
    permissions: allPerms,
    limit: 8,
  });
  ok(
    "D_no_duplicate_issue_or_url",
    result.items.filter((i) => i.key === "issue:blog:1:dup").length === 1 &&
      result.items.filter((i) => i.key === "gsc:https://firestick4uk.com/x")
        .length === 1
  );
  ok(
    "D_default_limit",
    SEO_DAILY_WORK_QUEUE_DEFAULT_LIMIT === 8
  );
  const manyIssues = Array.from({ length: 12 }, (_, i) =>
    issue({
      id: `blog:${i}:x`,
      entityId: String(i),
      severity: i < 6 ? "needs-attention" : "review",
      label: `Blog ${i}`,
    })
  );
  const limited = buildSeoDailyWorkQueue({
    issues: manyIssues,
    verificationQueue: [],
    permissions: allPerms,
  });
  ok(
    "D_truncated_preview",
    limited.items.length === 8 &&
      limited.totalEligible === 12 &&
      limited.truncated === true
  );
}

// --- ROLE SCOPING ---
{
  const writer = buildSeoDailyWorkQueue({
    issues: [
      issue({
        id: "product:1:p",
        entityType: "product",
        editTarget: "products",
        label: "Product A",
        severity: "needs-attention",
      }),
      issue({
        id: "blog:2:b",
        entityType: "blog",
        editTarget: "blog",
        label: "Blog B",
        severity: "needs-attention",
      }),
    ],
    verificationQueue: [
      verification({
        url: "https://firestick4uk.com/writer-gsc",
        group: "priority-migrations",
      }),
    ],
    permissions: {
      products: false,
      blog: true,
      productsManage: false,
      blogManage: true,
    },
  });
  ok(
    "R_writer_hides_product_issues",
    writer.items.every((i) => i.source !== "Product SEO") &&
      writer.items.some((i) => i.issueId === "blog:2:b")
  );
  ok(
    "R_writer_blog_edit_only",
    writer.items
      .filter((i) => i.issueId === "blog:2:b")
      .every((i) => i.canEdit === true && i.navigateTab === "blog")
  );
  ok(
    "R_writer_no_product_navigate",
    writer.items.every((i) => i.navigateTab !== "products")
  );
  ok(
    "R_writer_rbac_matrix",
    perms.hasAdminPermission("writer", "products.manage") === false &&
      perms.hasAdminPermission("writer", "blog.manage") === true &&
      perms.hasAdminPermission("manager", "products.manage") === true
  );

  const manager = buildSeoDailyWorkQueue({
    issues: [
      issue({
        id: "product:1:p",
        entityType: "product",
        editTarget: "products",
        severity: "needs-attention",
        label: "Product A",
      }),
    ],
    verificationQueue: [],
    permissions: {
      products: true,
      blog: true,
      productsManage: true,
      blogManage: true,
    },
  });
  ok(
    "R_manager_can_open_products",
    manager.items[0].canEdit === true &&
      manager.items[0].navigateTab === "products"
  );

  const saReadOnlyProduct = buildSeoDailyWorkQueue({
    issues: [
      issue({
        id: "product:1:p",
        entityType: "product",
        editTarget: "products",
        severity: "review",
        label: "Product A",
      }),
    ],
    verificationQueue: [],
    permissions: {
      products: true,
      blog: true,
      productsManage: false,
      blogManage: false,
    },
  });
  ok(
    "R_view_without_manage_no_edit_button_target",
    saReadOnlyProduct.items[0].canEdit === false &&
      saReadOnlyProduct.items[0].navigateTab === null
  );
}

// --- EMPTY / TRUTHFUL STATES ---
{
  const empty = buildSeoDailyWorkQueue({
    issues: [],
    verificationQueue: [],
    permissions: allPerms,
  });
  ok(
    "E_empty_truthful",
    empty.items.length === 0 &&
      empty.totalEligible === 0 &&
      empty.truncated === false
  );
  ok(
    "E_null_inputs_safe",
    buildSeoDailyWorkQueue({
      issues: null,
      verificationQueue: null,
      permissions: allPerms,
    }).totalEligible === 0
  );
}

// --- GSC LABELS ---
{
  const gsc = buildSeoDailyWorkQueue({
    issues: [],
    verificationQueue: [
      verification({
        url: "https://firestick4uk.com/mig",
        group: "priority-migrations",
        label: "Migration",
      }),
    ],
    permissions: allPerms,
  });
  ok(
    "G_manual_gsc_label",
    gsc.items[0].isManualGsc === true &&
      gsc.items[0].nextAction ===
        "Verify manually in Google Search Console" &&
      !/indexed|completed|assigned/i.test(gsc.items[0].nextAction) &&
      !/indexed|completed|assigned/i.test(gsc.items[0].reason)
  );
}

// --- PANEL / GRAPH CONTRACTS ---
ok(
  "P_panel_uses_helper",
  /buildSeoDailyWorkQueue/.test(panelSrc) &&
    /SEO Daily Work Queue/.test(panelSrc) &&
    /seo-daily-work-queue/.test(panelSrc)
);
ok(
  "P_panel_keeps_diagnostics_and_gsc",
  /SEO Diagnostics/.test(panelSrc) &&
    /Google Search Console Verification/.test(panelSrc) &&
    /id="seo-diagnostics"/.test(panelSrc) &&
    /id="seo-gsc-verification"/.test(panelSrc)
);
ok(
  "P_no_new_sidhu_tab",
  !/"daily-work"|"work-queue"/.test(sidhuSrc) &&
    /SeoOverviewPanel/.test(sidhuSrc)
);
ok(
  "P_no_overview_api_schema_change",
  !/seoDailyWorkQueue|dailyWorkQueue|buildSeoDailyWorkQueue/.test(
    overviewApiSrc
  )
);
ok(
  "P_helper_pure_no_io",
  !/fetch\s*\(|process\.env|mysql|requireAdmin|seoIssueMemory|INSERT |UPDATE /.test(
    helperSrc
  ) && !/openai|gemini|admin-blog-research/i.test(helperSrc)
);
ok(
  "P_no_issue_memory_mutation_in_queue",
  !/reconcile|recordCurrentDiagnostics|admin-seo-issues\/reconcile/.test(
    helperSrc
  ) &&
    /Opening this page does not write/.test(panelSrc)
);
ok(
  "P_research_route_untouched_super_admin",
  /admin\.role !== "super_admin"/.test(researchRouteSrc) &&
    !/seoDailyWorkQueue|Daily Work Queue/.test(researchRouteSrc)
);
ok(
  "P_no_ab_engine_import",
  !/blogOpportunity|blogGroundedResearch|blogResearchEvidence|blogInternalLink/.test(
    helperSrc
  ) &&
    !/blogOpportunity|blogGroundedResearch/.test(panelSrc)
);

console.log(`\nJSEO-W1 results: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
