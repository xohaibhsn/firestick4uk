/**
 * Phase SEO Inline Alt Diagnostics — pure fixtures + architecture guards.
 * Run: node scripts/phase-seo-inline-alt-diagnostics-tests.js
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
const rowsHelper = read("lib/seoDiagnosticRows.ts");
const panel = read("components/admin/SeoOverviewPanel.tsx");
const tipTap = read("components/admin/TipTapEditor.tsx");
const db = read("lib/db.ts");
// Overview may normalize via shared rows helper (parity with reconcile).
const normSrc = /normalize(Product|Blog)DiagnosticRow/.test(api)
  ? `${api}\n${rowsHelper}`
  : api;

const {
  analyzeInlineImageAlts,
  analyzeProductRichHtmlFields,
  buildSeoDiagnostics,
  diagnoseProduct,
  diagnoseBlog,
} = loadTsModule("lib/seoDiagnostics.ts");

console.log("\nSEO Inline Alt Diagnostics\n");

const baseProduct = {
  id: 10,
  name: "Alt Test Product",
  slug: "alt-test-product",
  active: true,
  title: "Alt Test Product | Firestick4UK",
  description: "Short meta description.",
  publicUrl: "https://firestick4uk.com/products/alt-test-product",
  ogSource: "Custom OG",
};

const baseBlog = {
  id: 5,
  title: "Alt Test Blog",
  slug: "alt-test-blog",
  status: "published",
  active: true,
  effectiveTitle: "Alt Test Blog",
  effectiveDescription: "A short blog description.",
  publicUrl: "https://firestick4uk.com/blog/alt-test-blog",
  featuredImage: true,
  canonicalHealth: "OK",
  canonicalDetail: "Exact match",
};

{
  const f = analyzeInlineImageAlts("<p>No images here</p>");
  ok("A_no_images", f.total === 0 && f.missingAlt === 0 && f.emptyAlt === 0);
}

{
  const f = analyzeInlineImageAlts('<img src="x.jpg">');
  ok("B_missing_alt", f.total === 1 && f.missingAlt === 1 && f.emptyAlt === 0);
}

{
  const f = analyzeInlineImageAlts('<img src="x.jpg" alt="">');
  ok("C_empty_alt", f.total === 1 && f.missingAlt === 0 && f.emptyAlt === 1);
}

{
  const f = analyzeInlineImageAlts('<img src="x.jpg" alt="   ">');
  ok("D_whitespace_alt_empty", f.total === 1 && f.emptyAlt === 1 && f.missingAlt === 0);
}

{
  const f = analyzeInlineImageAlts(
    '<img src="x.jpg" alt="Meaningful description">'
  );
  ok(
    "E_meaningful_alt",
    f.total === 1 && f.missingAlt === 0 && f.emptyAlt === 0
  );
}

{
  const f = analyzeInlineImageAlts('<img alt="" src="x.jpg">');
  ok("F_alt_before_src_empty", f.total === 1 && f.emptyAlt === 1);
}

{
  const f = analyzeInlineImageAlts("<img src='x.jpg' alt='Hello'>");
  ok(
    "G_single_quotes_valid",
    f.total === 1 && f.missingAlt === 0 && f.emptyAlt === 0
  );
  const f2 = analyzeInlineImageAlts("<IMG SRC='x.jpg'>");
  ok("H_uppercase_IMG_missing", f2.total === 1 && f2.missingAlt === 1);
  const f3 = analyzeInlineImageAlts('<IMG SRC="x.jpg" ALT="">');
  ok("H_uppercase_ALT_empty", f3.total === 1 && f3.emptyAlt === 1);
}

{
  const f = analyzeInlineImageAlts('<img src="x.jpg" data-alt="something">');
  ok(
    "I_data_alt_still_missing",
    f.total === 1 && f.missingAlt === 1 && f.emptyAlt === 0
  );
}

{
  const html =
    '<img src="a.jpg"><img src="b.jpg" alt=""><img src="c.jpg" alt="ok"><img alt="  " src="d.jpg">';
  const f = analyzeInlineImageAlts(html);
  ok(
    "J_mixed_totals",
    f.total === 4 && f.missingAlt === 1 && f.emptyAlt === 2,
    JSON.stringify(f)
  );
}

{
  const issues = diagnoseProduct({
    ...baseProduct,
    inlineImageAlt: { total: 2, missingAlt: 2, emptyAlt: 0 },
  });
  const hit = issues.find((i) => i.id === "product:10:inline-image-missing-alt");
  ok(
    "K_product_missing_alt_needs_attention",
    !!hit &&
      hit.severity === "needs-attention" &&
      hit.category === "media" &&
      hit.field === "rich_content"
  );
}

{
  const issues = diagnoseProduct({
    ...baseProduct,
    inlineImageAlt: { total: 1, missingAlt: 0, emptyAlt: 1 },
  });
  const hit = issues.find((i) => i.id === "product:10:inline-image-empty-alt");
  ok(
    "L_product_empty_alt_review",
    !!hit && hit.severity === "review" && hit.category === "media"
  );
}

{
  const issues = diagnoseBlog({
    ...baseBlog,
    inlineImageAlt: { total: 1, missingAlt: 1, emptyAlt: 0 },
  });
  const hit = issues.find((i) => i.id === "blog:5:inline-image-missing-alt");
  ok(
    "M_blog_missing_alt_needs_attention",
    !!hit &&
      hit.severity === "needs-attention" &&
      hit.field === "content"
  );
}

{
  const issues = diagnoseBlog({
    ...baseBlog,
    inlineImageAlt: { total: 1, missingAlt: 0, emptyAlt: 1 },
  });
  const hit = issues.find((i) => i.id === "blog:5:inline-image-empty-alt");
  ok("N_blog_empty_alt_review", !!hit && hit.severity === "review");
}

{
  const issues = diagnoseProduct({
    ...baseProduct,
    active: false,
    inlineImageAlt: { total: 3, missingAlt: 3, emptyAlt: 0 },
  });
  ok("O_inactive_product_excluded", issues.length === 0);
}

{
  const issues = diagnoseBlog({
    ...baseBlog,
    status: "draft",
    inlineImageAlt: { total: 1, missingAlt: 1, emptyAlt: 0 },
  });
  ok("P_draft_blog_excluded", issues.length === 0);
}

{
  const issues = diagnoseBlog({
    ...baseBlog,
    active: false,
    inlineImageAlt: { total: 1, missingAlt: 1, emptyAlt: 0 },
  });
  ok("Q_inactive_blog_excluded", issues.length === 0);
}

{
  // Existing Phase 2A title-long (review) + new empty-alt (review) → entity review
  const built = buildSeoDiagnostics({
    products: [],
    blog: [
      {
        ...baseBlog,
        id: 5,
        effectiveTitle: "X".repeat(76),
        inlineImageAlt: { total: 1, missingAlt: 0, emptyAlt: 1 },
      },
    ],
  });
  ok(
    "R_phase2a_plus_media_review",
    built.summary.reviewEntities === 1 &&
      built.summary.needsAttentionEntities === 0 &&
      built.summary.totalIssues === 2
  );
}

{
  // Existing needs-attention (missing slug) outranks media empty-alt review
  const built = buildSeoDiagnostics({
    products: [
      {
        ...baseProduct,
        slug: "",
        publicUrl: "",
        inlineImageAlt: { total: 1, missingAlt: 0, emptyAlt: 1 },
      },
    ],
    blog: [],
  });
  ok(
    "S_needs_attention_outranks_media_review",
    built.summary.needsAttentionEntities === 1 &&
      built.summary.reviewEntities === 0
  );
}

{
  const dup =
    '<p>Hello</p><img src="dup.jpg"><img src="ok.jpg" alt="Fine">';
  const f = analyzeProductRichHtmlFields({
    short_description: dup,
    description: dup,
    full_description: dup,
  });
  ok(
    "T_identical_html_deduped",
    f.total === 2 && f.missingAlt === 1 && f.emptyAlt === 0,
    JSON.stringify(f)
  );
  const f2 = analyzeProductRichHtmlFields({
    short_description: '<img src="a.jpg">',
    description: '<img src="b.jpg" alt="">',
    full_description: '<img src="c.jpg" alt="ok">',
  });
  ok(
    "T_distinct_fields_summed",
    f2.total === 3 && f2.missingAlt === 1 && f2.emptyAlt === 1,
    JSON.stringify(f2)
  );
}

ok(
  "U_api_blog_select_contains_content",
  /SELECT[\s\S]*?\bcontent\b[\s\S]*?FROM\s+blog_posts/i.test(api)
);

ok(
  "V_raw_blog_content_not_in_normalized_row",
  /inlineImageAlt\s*=\s*analyzeInlineImageAlts\(\s*b\.content\s*\)/.test(normSrc) &&
    !/content:\s*(?:String\(|b\.content)/.test(rowsHelper) &&
    !/return\s*\{[\s\S]*?\bcontent:\s*b\.content/.test(normSrc)
);

{
  const queryCount = (api.match(/pool\.query\s*\(/g) || []).length;
  ok("W_pool_query_count_le_3", queryCount <= 3, `queries=${queryCount}`);
}

ok(
  "X_no_ai_integration",
  // Deterministic diagnostics helper + overview API remain non-AI.
  !/openai|anthropic|gemini|generateAlt|ai\.|chatgpt/i.test(helperSrc) &&
    !/openai|anthropic|gemini|generateAlt/i.test(api) &&
    !/generateAlt|chatgpt/i.test(panel) &&
    // AI-1A explain controls are click-only on the dedicated endpoint.
    /admin-seo-ai/.test(panel) &&
    !/admin-seo-ai/.test(
      panel.slice(panel.indexOf("useEffect(()"), panel.indexOf("const can ="))
    )
);

ok(
  "Y_no_write_method_api",
  /req\.method\s*!==\s*"GET"/.test(api) &&
    !/\b(POST|PUT|PATCH|DELETE)\b/.test(api.replace(/Method not allowed[\s\S]*/, ""))
);

ok(
  "Z_no_main_featured_hero_og_rules",
  /inline-image-missing-alt/.test(helperSrc) &&
    /inline-image-empty-alt/.test(helperSrc) &&
    !/product:.*:main-image-missing-alt/.test(helperSrc) &&
    !/featured-image-missing-alt/.test(helperSrc) &&
    !/hero.*missing-alt/.test(helperSrc) &&
    !/favicon.*alt/.test(helperSrc) &&
    !/og-image-missing-alt/.test(helperSrc)
);

ok(
  "tiptap_unchanged_setImage_src_only",
  /setImage\(\{\s*src:\s*imgUrl\s*\}\)/.test(tipTap) ||
    /setImage\(\{\s*src\s*\}\)/.test(tipTap)
);

ok(
  "db_pool_unchanged",
  /connectionLimit:\s*3/.test(db) && /queueLimit:\s*5/.test(db)
);

ok(
  "product_fields_use_analyzeProductRichHtmlFields",
  /analyzeProductRichHtmlFields/.test(normSrc) &&
    (/normalizeProductDiagnosticRow/.test(api) ||
      /analyzeProductRichHtmlFields/.test(api))
);

ok(
  "product_raw_html_not_returned",
  !/short_description:\s*String\(p\.short_description/.test(rowsHelper) &&
    !/full_description:\s*String\(p\.full_description/.test(rowsHelper) &&
    !/description:\s*String\(p\.description/.test(
      rowsHelper.slice(
        rowsHelper.indexOf("return {"),
        rowsHelper.indexOf("inlineImageAlt")
      )
    )
);

console.log(
  `\nSEO inline alt diagnostics: ${passed} passed, ${failed} failed\n`
);
process.exit(failed ? 1 : 0);
