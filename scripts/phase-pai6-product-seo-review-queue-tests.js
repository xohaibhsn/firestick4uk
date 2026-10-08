/**
 * Phase PAI-6 — Deterministic Product SEO Review Queue.
 * Run: node scripts/phase-pai6-product-seo-review-queue-tests.js
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
    if (Object.prototype.hasOwnProperty.call(stubs, id)) return stubs[id];
    if (id.startsWith("@/lib/")) {
      const mapped = id.replace("@/lib/", "lib/") + ".ts";
      if (fs.existsSync(path.join(ROOT, mapped))) {
        return loadTsModule(mapped, stubs);
      }
    }
    if (
      id.endsWith("/seoDiagnostics") ||
      id.endsWith("/seoDiagnosticRows") ||
      id.endsWith("/seoOverview") ||
      id.endsWith("/productSeoReviewClient")
    ) {
      const base = path.basename(id);
      return loadTsModule(`lib/${base}.ts`, stubs);
    }
    return require(id);
  };
  const fn = new Function("exports", "module", "require", outputText);
  fn(sandbox.exports, sandbox.module, localRequire);
  return sandbox.module.exports && Object.keys(sandbox.module.exports).length
    ? sandbox.module.exports
    : sandbox.exports;
}

const helperSrc = read("lib/productSeoReviewClient.ts");
const sidhuSrc = read("app/sidhu/page.tsx");
const diagSrc = read("lib/seoDiagnostics.ts");
const rowsSrc = read("lib/seoDiagnosticRows.ts");
const productsApiSrc = read("pages/api/admin-products.ts");

const {
  buildProductSeoReviewRow,
  summarizeProductSeoReviewRows,
  matchesProductSeoFilter,
  filterAndOrderProductsForSeoReview,
  productSeoBadgeText,
  productSeoStatusLabel,
} = loadTsModule("lib/productSeoReviewClient.ts");

function activeProduct(overrides = {}) {
  return {
    id: 10,
    name: "Sample Product",
    slug: "sample-product",
    active: 1,
    seo_title: "Sample Product | Firestick4UK",
    meta_description: "A short effective description under the limit for SEO.",
    short_description: "A short effective description under the limit for SEO.",
    full_description: "<p>Body copy with enough detail for the product page.</p>",
    image: "https://cdn.example/product.webp",
    og_image: "https://cdn.example/og.webp",
    ...overrides,
  };
}

console.log("\nPAI-6 Product SEO Review Queue\n");

// --- PURE STATUS ---
{
  const needs = buildProductSeoReviewRow(
    activeProduct({
      id: 1,
      meta_description: "",
      short_description: "",
      full_description: "",
      seo_title: "",
    })
  );
  ok(
    "S_active_needs_attention",
    needs.status === "needs-attention" &&
      needs.active === true &&
      needs.needsAttentionCount > 0
  );

  const reviewOnly = buildProductSeoReviewRow(
    activeProduct({
      id: 2,
      og_image: "",
      // keep description present so missing-description does not fire
      meta_description: "A short effective description under the limit for SEO.",
      short_description: "A short effective description under the limit for SEO.",
    })
  );
  // Global OG fallback is typically review severity when product image exists.
  ok(
    "S_active_only_review_or_healthy",
    reviewOnly.status === "review" || reviewOnly.status === "healthy",
    `status=${reviewOnly.status} issues=${reviewOnly.issueCount}`
  );

  // Force a known review-only case via title length if needed
  const longTitle = buildProductSeoReviewRow(
    activeProduct({
      id: 3,
      seo_title: "X".repeat(90),
      meta_description: "A short effective description under the limit for SEO.",
      short_description: "A short effective description under the limit for SEO.",
      og_image: "https://cdn.example/og.webp",
    })
  );
  ok(
    "S_active_only_review",
    longTitle.status === "review" &&
      longTitle.needsAttentionCount === 0 &&
      longTitle.reviewCount > 0
  );

  const healthy = buildProductSeoReviewRow(activeProduct({ id: 4 }));
  ok(
    "S_active_zero_issues_healthy",
    healthy.status === "healthy" &&
      healthy.issueCount === 0 &&
      healthy.needsAttentionCount === 0 &&
      healthy.reviewCount === 0
  );

  const inactive = buildProductSeoReviewRow(
    activeProduct({
      id: 5,
      active: 0,
      meta_description: "",
      short_description: "",
      full_description: "",
    })
  );
  ok(
    "S_inactive",
    inactive.status === "inactive" && inactive.active === false
  );
  ok(
    "S_inactive_not_healthy",
    inactive.status !== "healthy" && inactive.issueCount === 0
  );

  ok(
    "S_issue_counts_correct",
    needs.issueCount ===
      needs.needsAttentionCount + needs.reviewCount &&
      longTitle.issueCount === longTitle.reviewCount
  );

  ok(
    "S_severity_priority_needs_before_review",
    needs.issues.length === 0 ||
      needs.issues[0].severity === "needs-attention" ||
      needs.issues.every((i) => i.severity === "review")
  );

  // Explicit mixed ordering check
  const mixed = buildProductSeoReviewRow(
    activeProduct({
      id: 6,
      seo_title: "Y".repeat(90),
      meta_description: "",
      short_description: "",
      full_description: "",
      og_image: "",
    })
  );
  const firstNeedsIdx = mixed.issues.findIndex(
    (i) => i.severity === "needs-attention"
  );
  const firstReviewIdx = mixed.issues.findIndex((i) => i.severity === "review");
  ok(
    "S_deterministic_severity_order",
    mixed.needsAttentionCount > 0 &&
      (firstReviewIdx === -1 || firstNeedsIdx < firstReviewIdx)
  );
}

// --- SHARED ENGINE ---
{
  ok(
    "E_imports_normalizeProductDiagnosticRow",
    /normalizeProductDiagnosticRow/.test(helperSrc)
  );
  ok(
    "E_imports_diagnoseProduct",
    /diagnoseProduct/.test(helperSrc)
  );
  ok(
    "E_no_duplicate_title_threshold",
    !/TITLE_MAX|title length|70|75/.test(helperSrc.replace(/from .*/g, ""))
  );
  ok(
    "E_no_separate_og_algorithm",
    !/global OG|ogSource|Custom OG/.test(helperSrc)
  );
  ok(
    "E_no_db_or_server_imports",
    !/from \"@\/lib\/db\"|server-only|openai|seoAiServer|seoIssueMemoryServer/.test(
      helperSrc
    )
  );
  ok(
    "E_engine_sources_exist",
    /export function diagnoseProduct/.test(diagSrc) &&
      /export function normalizeProductDiagnosticRow/.test(rowsSrc)
  );
}

// --- FILTERS / SORTING ---
{
  const products = [
    activeProduct({ id: 101, name: "A-healthy" }),
    activeProduct({
      id: 102,
      name: "B-needs",
      meta_description: "",
      short_description: "",
      full_description: "",
      seo_title: "",
    }),
    activeProduct({
      id: 103,
      name: "C-review",
      seo_title: "Z".repeat(90),
    }),
    activeProduct({ id: 104, name: "D-inactive", active: 0 }),
    activeProduct({
      id: 105,
      name: "E-needs-2",
      meta_description: "",
      short_description: "",
      full_description: "",
      seo_title: "",
    }),
  ];
  const rows = products.map(buildProductSeoReviewRow);
  const byId = new Map(rows.map((r) => [r.productId, r]));
  const summary = summarizeProductSeoReviewRows(rows);

  ok("F_all", filterAndOrderProductsForSeoReview(products, byId, "all").length === 5);
  ok(
    "F_review_queue",
    filterAndOrderProductsForSeoReview(products, byId, "review-queue").length ===
      summary.reviewQueue
  );
  ok(
    "F_needs_attention",
    filterAndOrderProductsForSeoReview(products, byId, "needs-attention").every(
      (p) => byId.get(Number(p.id)).status === "needs-attention"
    )
  );
  ok(
    "F_review",
    filterAndOrderProductsForSeoReview(products, byId, "review").every(
      (p) => byId.get(Number(p.id)).status === "review"
    )
  );
  ok(
    "F_healthy",
    filterAndOrderProductsForSeoReview(products, byId, "healthy").every(
      (p) => byId.get(Number(p.id)).status === "healthy"
    )
  );
  ok(
    "F_inactive",
    filterAndOrderProductsForSeoReview(products, byId, "inactive").every(
      (p) => byId.get(Number(p.id)).status === "inactive"
    )
  );

  const queue = filterAndOrderProductsForSeoReview(
    products,
    byId,
    "review-queue"
  );
  const queueStatuses = queue.map((p) => byId.get(Number(p.id)).status);
  ok(
    "O_review_queue_needs_before_review",
    queueStatuses.indexOf("needs-attention") !== -1 &&
      (queueStatuses.indexOf("review") === -1 ||
        queueStatuses.lastIndexOf("needs-attention") <
          queueStatuses.indexOf("review"))
  );

  const needsOnly = queue.filter(
    (p) => byId.get(Number(p.id)).status === "needs-attention"
  );
  ok(
    "O_stable_order_inside_class",
    needsOnly.map((p) => Number(p.id)).join(",") === "102,105"
  );

  const allOrdered = filterAndOrderProductsForSeoReview(products, byId, "all");
  ok(
    "O_all_preserves_order",
    allOrdered.map((p) => Number(p.id)).join(",") === "101,102,103,104,105"
  );

  ok(
    "F_matches_helpers",
    matchesProductSeoFilter(rows[0], "healthy") === true &&
      matchesProductSeoFilter(rows[3], "inactive") === true
  );

  ok(
    "F_summary_counts",
    summary.total === 5 &&
      summary.reviewQueue === summary.needsAttention + summary.review &&
      summary.needsAttention +
        summary.review +
        summary.healthy +
        summary.inactive ===
        summary.total
  );

  ok(
    "F_badge_text",
    /Needs attention ·/.test(productSeoBadgeText(rows[1])) &&
      productSeoStatusLabel("healthy") === "Healthy"
  );
}

// --- UI ---
{
  ok("U_seo_column", /<th>SEO<\/th>/.test(sidhuSrc));
  ok("U_content_column_remains", /<th>Content<\/th>/.test(sidhuSrc));
  ok(
    "U_summary_counts",
    /product-seo-review-summary/.test(sidhuSrc) &&
      /product-seo-count-needs-attention/.test(sidhuSrc) &&
      /product-seo-count-review/.test(sidhuSrc) &&
      /product-seo-count-healthy/.test(sidhuSrc) &&
      /product-seo-count-inactive/.test(sidhuSrc)
  );
  ok(
    "U_filters",
    /product-seo-review-filters/.test(sidhuSrc) &&
      /product-seo-filter-\$\{value\}/.test(sidhuSrc) &&
      /\["all", "All"\]/.test(sidhuSrc) &&
      /\["review-queue", "Review Queue"\]/.test(sidhuSrc)
  );
  ok(
    "U_edit_action_remains",
    /openEditProduct\(p\)/.test(sidhuSrc) && /btn-edit/.test(sidhuSrc)
  );
  ok(
    "U_saved_seo_card",
    /existing-product-saved-seo-card/.test(sidhuSrc) &&
      /Saved SEO state/.test(sidhuSrc) &&
      /Deterministic SEO Check/.test(sidhuSrc)
  );
  ok(
    "U_issue_message_evidence",
    /issue\.message/.test(sidhuSrc) && /issue\.evidence/.test(sidhuSrc)
  );
  ok(
    "U_authoritative_vs_advisory",
    /Deterministic checks are authoritative\. AI review is advisory/.test(
      sidhuSrc
    )
  );
  ok(
    "U_reuses_helper",
    /buildProductSeoReviewRow/.test(sidhuSrc) &&
      /filterAndOrderProductsForSeoReview/.test(sidhuSrc) &&
      /from \"@\/lib\/productSeoReviewClient\"/.test(sidhuSrc)
  );
}

// --- NO AI AUTO CALL ---
{
  ok(
    "NA_products_tab_no_seo_ai_fetch",
    !/tab==="products"[\s\S]{0,2500}admin-seo-ai/.test(sidhuSrc)
  );
  ok(
    "NA_no_provider_on_modal_open",
    !/openEditProduct[\s\S]{0,800}admin-seo-ai|openEditProduct[\s\S]{0,800}draftProduct|openEditProduct[\s\S]{0,800}reviewExisting/.test(
      sidhuSrc
    )
  );
  ok(
    "NA_no_polling",
    !/setInterval[\s\S]{0,200}seo|poll.*productSeo/.test(sidhuSrc)
  );
}

// --- NO WRITE ---
{
  ok(
    "NW_no_new_api_endpoint",
    !fs.existsSync(path.join(ROOT, "pages/api/admin-product-seo.ts")) &&
      !/admin-product-seo/.test(sidhuSrc)
  );
  ok(
    "NW_helper_no_fetch",
    !/fetch\(|INSERT|UPDATE|DELETE/.test(helperSrc)
  );
  ok(
    "NW_filter_path_no_mutation_fetch",
    !/setProductSeoFilter[\s\S]{0,200}fetch\(/.test(sidhuSrc)
  );
  ok(
    "NW_no_issue_memory_on_products_load",
    !/loadProducts[\s\S]{0,500}admin-seo-issues|loadProducts[\s\S]{0,500}reconcile/.test(
      sidhuSrc
    )
  );
  ok(
    "NW_admin_products_unchanged_for_queue",
    /SELECT \* FROM products ORDER BY created_at DESC/.test(productsApiSrc)
  );
  ok(
    "NW_no_runtime_ddl",
    !/CREATE TABLE|ALTER TABLE/.test(helperSrc + sidhuSrc)
  );
}

// --- REGRESSION SAFETY ---
{
  ok(
    "R_slug_protection",
    /readOnly=\{productModal !== "new"\}/.test(sidhuSrc) &&
      /Public slug is protected/.test(sidhuSrc)
  );
  ok(
    "R_pai4_review_button",
    /existing-product-review-button/.test(sidhuSrc) &&
      /Review Product/.test(sidhuSrc)
  );
  ok(
    "R_pai5_image_brief",
    /product-image-brief-generate/.test(sidhuSrc) &&
      /Generate Image Briefs/.test(sidhuSrc)
  );
  ok(
    "R_save_path",
    /saveProduct/.test(sidhuSrc) || /Save Product/.test(sidhuSrc)
  );
  ok(
    "R_content_health_separate",
    /productHealth\(p\)/.test(sidhuSrc) &&
      /productSeoBadgeText\(seoRow\)/.test(sidhuSrc)
  );
}

console.log(`\nPAI-6 results: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
