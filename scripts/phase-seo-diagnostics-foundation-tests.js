/**
 * Phase SEO Diagnostics Foundation — pure fixtures + architecture guards.
 * Run: node scripts/phase-seo-diagnostics-foundation-tests.js
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
  const localRequire = (id) => {
    if (id === "@/lib/seoOverview" || id.endsWith("/seoOverview")) {
      return loadTsModule("lib/seoOverview.ts");
    }
    return require(id);
  };
  const fn = new Function("exports", "module", "require", outputText);
  fn(sandbox.exports, sandbox.module, localRequire);
  return sandbox.module.exports && Object.keys(sandbox.module.exports).length
    ? sandbox.module.exports
    : sandbox.exports;
}

const helperSrc = read("lib/seoDiagnostics.ts");
const api = read("pages/api/admin-seo-overview.ts");
const panel = read("components/admin/SeoOverviewPanel.tsx");
const perms = read("lib/adminPermissions.ts");

const {
  buildSeoDiagnostics,
  diagnoseProduct,
  diagnoseBlog,
} = loadTsModule("lib/seoDiagnostics.ts");

console.log("\nSEO Diagnostics Foundation\n");

const healthyProduct = {
  id: 1,
  name: "Healthy Product",
  slug: "healthy-product",
  active: true,
  title: "Healthy Product | Firestick4UK",
  description: "A short effective description under the limit.",
  publicUrl: "https://firestick4uk.com/products/healthy-product",
  ogSource: "Custom OG",
};

{
  const issues = diagnoseProduct(healthyProduct);
  ok("A_active_healthy_product_zero", issues.length === 0, `n=${issues.length}`);
}

{
  const issues = diagnoseProduct({ ...healthyProduct, slug: "", publicUrl: "" });
  ok(
    "B_missing_slug_needs_attention",
    issues.some(
      (i) => i.id === "product:1:missing-slug" && i.severity === "needs-attention"
    )
  );
}

{
  const issues = diagnoseProduct({ ...healthyProduct, description: "" });
  ok(
    "C_empty_effective_description",
    issues.some(
      (i) =>
        i.id === "product:1:missing-description" &&
        i.severity === "needs-attention"
    )
  );
}

{
  const title71 = "X".repeat(71);
  const issues = diagnoseProduct({ ...healthyProduct, title: title71 });
  const hit = issues.find((i) => i.id === "product:1:title-long");
  ok(
    "D_title_71_review",
    !!hit &&
      hit.severity === "review" &&
      /71 characters \(threshold > 70\)/.test(hit.evidence)
  );
}

{
  const desc181 = "Y".repeat(181);
  const issues = diagnoseProduct({ ...healthyProduct, description: desc181 });
  const hit = issues.find((i) => i.id === "product:1:description-long");
  ok(
    "E_description_181_review",
    !!hit &&
      hit.severity === "review" &&
      /181 characters \(threshold > 180\)/.test(hit.evidence)
  );
}

{
  const issues = diagnoseProduct({
    ...healthyProduct,
    ogSource: "Global fallback",
  });
  ok(
    "F_global_og_fallback_review",
    issues.some(
      (i) =>
        i.id === "product:1:og-global-fallback" &&
        i.severity === "review" &&
        /global fallback/i.test(i.message)
    )
  );
}

{
  const issues = diagnoseProduct({ ...healthyProduct, active: false, slug: "" });
  ok("G_inactive_product_excluded", issues.length === 0);
  const built = buildSeoDiagnostics({
    products: [{ ...healthyProduct, active: false, slug: "" }],
  });
  ok("G_inactive_not_in_eligible", built.summary.eligibleEntities === 0);
}

const healthyBlog = {
  id: 4,
  title: "Healthy Article",
  slug: "healthy-article",
  status: "published",
  active: true,
  effectiveTitle: "Healthy Article | Firestick4UK Blog",
  effectiveDescription: "A short blog description under the limit.",
  publicUrl: "https://firestick4uk.com/blog/healthy-article",
  featuredImage: true,
  canonicalHealth: "Auto",
  canonicalDetail: "Blank — public page uses auto canonical",
};

{
  const issues = diagnoseBlog(healthyBlog);
  ok("H_healthy_blog_zero", issues.length === 0, `n=${issues.length}`);
}

{
  const issues = diagnoseBlog({ ...healthyBlog, slug: "", publicUrl: "" });
  ok(
    "I_missing_slug_needs_attention",
    issues.some(
      (i) => i.id === "blog:4:missing-slug" && i.severity === "needs-attention"
    )
  );
}

{
  const issues = diagnoseBlog({
    ...healthyBlog,
    effectiveTitle: "",
    effectiveDescription: "",
  });
  ok(
    "J_missing_title",
    issues.some(
      (i) => i.id === "blog:4:missing-title" && i.severity === "needs-attention"
    )
  );
  ok(
    "J_missing_description",
    issues.some(
      (i) =>
        i.id === "blog:4:missing-description" &&
        i.severity === "needs-attention"
    )
  );
}

{
  const title76 = "T".repeat(76);
  const issues = diagnoseBlog({ ...healthyBlog, effectiveTitle: title76 });
  const hit = issues.find((i) => i.id === "blog:4:title-long");
  ok(
    "K_title_76_review",
    !!hit &&
      hit.severity === "review" &&
      /76 characters \(threshold > 75\)/.test(hit.evidence)
  );
}

{
  const desc181 = "D".repeat(181);
  const issues = diagnoseBlog({
    ...healthyBlog,
    effectiveDescription: desc181,
  });
  const hit = issues.find((i) => i.id === "blog:4:description-long");
  ok(
    "L_description_181_review",
    !!hit &&
      hit.severity === "review" &&
      /181 characters \(threshold > 180\)/.test(hit.evidence)
  );
}

{
  const issues = diagnoseBlog({ ...healthyBlog, featuredImage: false });
  ok(
    "M_missing_featured_image_review",
    issues.some(
      (i) =>
        i.id === "blog:4:missing-featured-image" && i.severity === "review"
    )
  );
}

{
  const issues = diagnoseBlog({
    ...healthyBlog,
    canonicalHealth: "Review",
    canonicalDetail: "Canonical path does not match current blog slug",
  });
  const hit = issues.find((i) => i.id === "blog:4:canonical-review");
  ok(
    "N_canonical_review_needs_attention",
    !!hit &&
      hit.severity === "needs-attention" &&
      hit.category === "canonical" &&
      hit.evidence === "Canonical path does not match current blog slug"
  );
}

{
  const draft = diagnoseBlog({ ...healthyBlog, status: "draft" });
  const inactive = diagnoseBlog({ ...healthyBlog, active: false });
  ok("O_draft_excluded", draft.length === 0);
  ok("O_inactive_blog_excluded", inactive.length === 0);
  const built = buildSeoDiagnostics({
    blog: [
      { ...healthyBlog, status: "draft" },
      { ...healthyBlog, id: 5, active: false },
    ],
  });
  ok("O_draft_inactive_not_eligible", built.summary.eligibleEntities === 0);
}

{
  const built = buildSeoDiagnostics({
    products: [
      {
        ...healthyProduct,
        id: 8,
        description: "",
        ogSource: "Global fallback",
      },
    ],
  });
  ok(
    "P_needs_attention_outranks_review",
    built.summary.needsAttentionEntities === 1 &&
      built.summary.reviewEntities === 0 &&
      built.issues.some((i) => i.severity === "needs-attention") &&
      built.issues.some((i) => i.severity === "review")
  );
}

{
  const built = buildSeoDiagnostics({
    products: [healthyProduct],
    blog: [healthyBlog],
  });
  ok(
    "Q_healthy_means_zero_ruleset_issues",
    built.summary.eligibleEntities === 2 &&
      built.summary.healthyEntities === 2 &&
      built.summary.totalIssues === 0 &&
      built.issues.length === 0
  );
}

ok(
  "R_helper_no_db_import",
  !/from ["']@?\/?lib\/db["']|require\(["'].*db/.test(helperSrc)
);
ok(
  "S_helper_no_fetch_http",
  !/\bfetch\s*\(|from ["']axios["']|from ["']node-fetch["']|http\.request/.test(
    helperSrc
  )
);
ok(
  "T_helper_no_ai",
  !/anthropic|openai|gemini|@ai-sdk|generative/i.test(helperSrc)
);
ok(
  "U_api_get_only",
  /req\.method !== ["']GET["']/.test(api) && !/method === ["']POST["']/.test(api)
);

const queryCount = (api.match(/pool\.query/g) || []).length;
ok("V_zero_new_pool_query", queryCount <= 3, `queries=${queryCount}`);
ok(
  "V_diagnostics_from_buildSeoDiagnostics",
  /buildSeoDiagnostics/.test(api) && /diagnostics/.test(api)
);

ok(
  "W_permissions_unchanged",
  /canAccessSeoOverview/.test(perms) &&
    !/"seo\.manage"/.test(perms) &&
    !/"seo\.view"/.test(perms)
);

ok(
  "X_ui_disclaimer_not_gsc_ranking",
  /Deterministic CMS checks only/.test(panel) &&
    /not Google Search Console status or a\s*ranking\s*score/i.test(panel)
);

ok(
  "Y_no_save_autofix_generate",
  !/autofix|auto-fix|generateTitle|generateMeta|saveSeo|AI draft/i.test(
    panel + api + helperSrc
  ) && !/method === ["']POST["']/.test(api)
);

ok(
  "ui_section_present",
  /SEO Diagnostics/.test(panel) &&
    /Open Products/.test(panel) &&
    /Open Blog/.test(panel)
);

ok(
  "no_focus_keyword_as_defect",
  !/missing-focus|blank focus_keyword|Focus keyword is missing/i.test(helperSrc)
);

ok(
  "no_product_name_slug_mismatch_rule",
  !/name-slug|slug-mismatch|nameSlug/.test(helperSrc)
);

console.log(
  `\nSEO diagnostics foundation: ${passed} passed, ${failed} failed`
);
process.exit(failed ? 1 : 0);
