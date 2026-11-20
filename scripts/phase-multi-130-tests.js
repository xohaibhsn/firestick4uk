/**
 * F4UK-MULTI-130 — WooCommerce-style product admin (UI only).
 * Pure node: static source + pure-function checks. No DB. No HTTP. No save.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
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

function loadTsModule(rel, stubs = {}) {
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
          return loadTsModule(path.relative(ROOT, candidate).replace(/\\/g, "/"), stubs);
        }
      }
    }
    if (id.startsWith("./") || id.startsWith("../")) {
      const base = path.normalize(path.join(path.dirname(abs), id));
      for (const candidate of [base + ".ts", base + ".tsx", base + ".js"]) {
        if (fs.existsSync(candidate)) {
          return loadTsModule(path.relative(ROOT, candidate).replace(/\\/g, "/"), stubs);
        }
      }
    }
    return orig(id);
  };
  m._compile(out, abs);
  return m.exports;
}

function gitDiffNameOnly(base, head) {
  const r = spawnSync("git", ["diff", "--name-only", `${base}..${head}`], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (r.status !== 0) return [];
  return r.stdout
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const sidhuPage = read("app/sidhu/page.tsx");
const toolbar = read("components/admin/ProductListToolbar.tsx");
const quickEdit = read("components/admin/ProductQuickEditRow.tsx");
const sidebar = read("components/admin/ProductEditorSidebar.tsx");
const snippet = read("components/admin/ProductSeoSnippetPreview.tsx");
const filtersLib = read("lib/productAdminListFilters.ts");
const quickLib = read("lib/productAdminQuickEdit.ts");
const dirtyLib = read("lib/productAdminEditorDirty.ts");
const productAdminSrc = [sidhuPage, toolbar, quickEdit, sidebar, snippet].join("\n");

const {
  matchesProductAdminSearch,
  matchesProductAdminListTab,
  countProductAdminListTabs,
  mapListTabToLegacyFilters,
  deriveListTabFromLegacyFilters,
  filterProductsForAdminList,
  isProductOutOfStock,
  isProductSeasonal,
  PRODUCT_ADMIN_SEARCH_DEBOUNCE_MS,
} = loadTsModule("lib/productAdminListFilters.ts");

const {
  buildQuickEditPutBody,
  isQuickEditPutBodyStrict,
  quickEditConflictMessage,
  shouldAbortQuickEditOnConflict,
  QUICK_EDIT_CONCURRENT_RELOAD_MESSAGE,
} = loadTsModule("lib/productAdminQuickEdit.ts");

const {
  snapshotProductEditorDraft,
  isProductEditorDraftDirty,
} = loadTsModule("lib/productAdminEditorDirty.ts");

const {
  buildProductSeoReviewRow,
} = loadTsModule("lib/productSeoReviewClient.ts");

const { buildProductSeoSnippetPreview } = loadTsModule(
  "lib/productAdminSeoSnippet.ts"
);

console.log("\nF4UK-MULTI-130 WooCommerce-style product admin\n");

// --- Search / tabs / counts ---
{
  const sample = [
    {
      id: 1,
      name: "Firestick 4K",
      slug: "amazon-firestick-4k",
      category: "Device",
      active: 1,
      stock: "Digital",
      lifecycle_mode: "permanent",
      seo_title: "Firestick 4K | Firestick4UK",
      meta_description: "A short effective description under the limit for SEO.",
      short_description: "A short effective description under the limit for SEO.",
      full_description: "<p>Body</p>",
      image: "/x.webp",
      og_image: "/og.webp",
    },
    {
      id: 2,
      name: "Hidden Plan",
      slug: "hidden-plan",
      category: "Subscription",
      active: 0,
      stock: "0",
      lifecycle_mode: "permanent",
      seo_title: "",
      meta_description: "",
      short_description: "",
      full_description: "",
      image: "",
      og_image: "",
    },
    {
      id: 3,
      name: "Xmas Bundle",
      slug: "xmas-bundle",
      category: "Bundle",
      active: 1,
      stock: "Digital",
      lifecycle_mode: "seasonal",
      seo_title: "X".repeat(90),
      meta_description: "A short effective description under the limit for SEO.",
      short_description: "A short effective description under the limit for SEO.",
      full_description: "<p>Body</p>",
      image: "/x.webp",
      og_image: "/og.webp",
    },
  ];

  ok(
    "search_name_case_insensitive",
    matchesProductAdminSearch(sample[0], "fireSTICK") === true
  );
  ok(
    "search_slug",
    matchesProductAdminSearch(sample[0], "amazon-firestick") === true
  );
  ok(
    "search_category",
    matchesProductAdminSearch(sample[0], "device") === true
  );
  ok(
    "search_miss",
    matchesProductAdminSearch(sample[0], "zzz-nope") === false
  );
  ok("debounce_ms_150", PRODUCT_ADMIN_SEARCH_DEBOUNCE_MS === 150);

  ok("tab_public", matchesProductAdminListTab(sample[0], "public") === true);
  ok("tab_hidden", matchesProductAdminListTab(sample[1], "hidden") === true);
  ok("tab_seasonal", matchesProductAdminListTab(sample[2], "seasonal") === true);
  ok("tab_oos", matchesProductAdminListTab(sample[1], "out_of_stock") === true);
  ok("is_seasonal_helper", isProductSeasonal(sample[2]) && !isProductSeasonal(sample[0]));
  ok("is_oos_helper", isProductOutOfStock(sample[1]) && !isProductOutOfStock(sample[0]));

  const reviewById = new Map(
    sample.map((p) => [p.id, buildProductSeoReviewRow(p)])
  );
  ok(
    "tab_needs_seo",
    matchesProductAdminListTab(sample[2], "needs_seo", reviewById.get(3)) === true
  );

  const counts = countProductAdminListTabs(sample, reviewById);
  ok(
    "counts",
    counts.all === 3 &&
      counts.public === 2 &&
      counts.hidden === 1 &&
      counts.seasonal === 1 &&
      counts.out_of_stock === 1 &&
      counts.needs_seo >= 1
  );

  ok(
    "map_public_legacy",
    mapListTabToLegacyFilters("public").visibility === "visible" &&
      mapListTabToLegacyFilters("public").seo === "all"
  );
  ok(
    "map_hidden_legacy",
    mapListTabToLegacyFilters("hidden").visibility === "hidden"
  );
  ok(
    "map_needs_seo_legacy",
    mapListTabToLegacyFilters("needs_seo").seo === "review-queue"
  );
  ok(
    "derive_from_legacy_visible",
    deriveListTabFromLegacyFilters("visible", "all") === "public"
  );
  ok(
    "derive_from_legacy_seo",
    deriveListTabFromLegacyFilters("all", "review-queue") === "needs_seo"
  );

  const filteredPublic = filterProductsForAdminList(sample, {
    search: "",
    tab: "public",
    visibilityFilter: "visible",
    seoFilter: "all",
    reviewById,
  });
  ok(
    "filter_public_keeps_visible",
    filteredPublic.length === 2 && filteredPublic.every((p) => Number(p.active) === 1)
  );

  const filteredSearch = filterProductsForAdminList(sample, {
    search: "xmas",
    tab: "all",
    visibilityFilter: "all",
    seoFilter: "all",
    reviewById,
  });
  ok("filter_search", filteredSearch.length === 1 && filteredSearch[0].id === 3);
}

// --- Quick Edit ---
{
  const built = buildQuickEditPutBody(
    7,
    { price: "£12.50", stock: "Digital" },
    3
  );
  ok("qe_build_ok", built.ok === true);
  if (built.ok) {
    ok("qe_body_keys_only", isQuickEditPutBodyStrict(built.body));
    ok(
      "qe_body_values",
      built.body.id === 7 &&
        built.body.price === "12.5" &&
        built.body.stock === "Digital" &&
        built.body.expected_version === 3
    );
  }
  const badPrice = buildQuickEditPutBody(7, { price: "12.999", stock: "1" }, 1);
  ok("qe_strict_price_reject", badPrice.ok === false);
  ok(
    "qe_conflict_message",
    quickEditConflictMessage({ status: 409, code: "concurrent_conflict" }) ===
      QUICK_EDIT_CONCURRENT_RELOAD_MESSAGE
  );
  ok(
    "qe_abort_on_409",
    shouldAbortQuickEditOnConflict(409, "concurrent_conflict") === true
  );
  ok(
    "qe_static_reload_copy",
    /This product changed elsewhere — Reload/.test(quickLib) &&
      /QUICK_EDIT_CONCURRENT_RELOAD_MESSAGE/.test(sidhuPage)
  );
  ok(
    "qe_put_only_fields_static",
    /buildQuickEditPutBody/.test(sidhuPage) &&
      /method:\s*"PUT"/.test(sidhuPage) &&
      /saveQuickEdit/.test(sidhuPage)
  );
  ok(
    "qe_keyboard_enter_esc",
    /Enter/.test(quickEdit) && /Escape/.test(quickEdit)
  );
}

// --- Editor shell / save / dirty / Ctrl+S ---
{
  ok(
    "editor_save_testid",
    /data-testid="product-save-btn"/.test(productAdminSrc)
  );
  ok(
    "editor_update_publish_labels",
    /"Update"/.test(sidhuPage) && /"Publish"/.test(sidhuPage)
  );
  ok(
    "editor_resolve_conflict_label",
    /Resolve conflict to save/.test(sidhuPage)
  );
  ok(
    "editor_ctrl_s_scoped",
    /metaKey|ctrlKey/.test(sidhuPage) &&
      /preventDefault\(\)/.test(sidhuPage) &&
      /productModal/.test(sidhuPage) &&
      /saveProduct/.test(sidhuPage)
  );
  ok(
    "editor_beforeunload_dirty",
    /beforeunload/.test(sidhuPage) &&
      /productEditorDirty/.test(sidhuPage)
  );
  ok(
    "editor_fullscreen",
    /product-editor-fullscreen/.test(sidhuPage) &&
      /product-editor-topbar/.test(sidhuPage)
  );
  ok(
    "editor_two_column_css",
    /product-editor-layout/.test(sidhuPage) &&
      /max-width:\s*1099px/.test(sidhuPage)
  );
  ok(
    "snippet_preview_present",
    /ProductSeoSnippetPreview/.test(sidhuPage) &&
      /product-seo-snippet-preview/.test(snippet)
  );

  const snap = snapshotProductEditorDraft({
    name: "A",
    price: "9.99",
    stock: "Digital",
  });
  ok("dirty_false_same", isProductEditorDraftDirty({ name: "A", price: "9.99", stock: "Digital" }, snap) === false);
  ok(
    "dirty_true_changed",
    isProductEditorDraftDirty({ name: "B", price: "9.99", stock: "Digital" }, snap) === true
  );

  const prev = buildProductSeoSnippetPreview({
    name: "Firestick",
    slug: "firestick",
    seoTitle: "",
    metaDescription: "",
    shortDescription: "Short desc here",
  });
  ok(
    "snippet_fallback",
    prev.title === "Firestick" &&
      prev.description === "Short desc here" &&
      /firestick4uk\.com\/products\/firestick/.test(prev.url)
  );
}

// --- Publish box uses toggleProductVisibility; shop listing read-only ---
{
  ok(
    "publish_uses_toggleProductVisibility",
    /toggleProductVisibility/.test(sidhuPage) &&
      /toggleEditorProductVisibility|onToggleVisibility/.test(sidhuPage)
  );
  ok(
    "sidebar_no_shop_listed_write",
    !/fetch\([^)]*shop_listed/.test(sidebar) &&
      /Change in Seasonal settings/.test(sidebar) &&
      !/setEditProduct\(\{[^}]*shop_listed/.test(sidebar)
  );
  ok(
    "sidebar_no_new_visibility_endpoint",
    !/\/api\/admin-product-visibility/.test(sidebar + sidhuPage)
  );
}

// --- Deep link path unchanged ---
{
  ok(
    "deep_link_setPendingDeepProductSlug",
    /setPendingDeepProductSlug/.test(sidhuPage) &&
      /resolveOpenDeepLink/.test(sidhuPage)
  );
  ok(
    "deep_link_opens_editor",
    /pendingDeepProductSlug/.test(sidhuPage) &&
      /openEditProduct/.test(sidhuPage)
  );
}

// --- History buttons (10 content literals + 4 seasonal via map = 14 logical; 11 call sites on main) ---
{
  const contentFields = [
    "name",
    "slug",
    "price",
    "short_description",
    "full_description",
    "features",
    "seo_title",
    "meta_description",
    "focus_keyword",
    "og_image",
  ];
  const seasonalFields = [
    "season_name",
    "season_starts_at",
    "season_ends_at",
    "lifecycle_mode",
  ];
  const btnMatches = sidhuPage.match(/productHistoryBtn\(/g) || [];
  ok(
    "history_btn_call_sites",
    btnMatches.length >= 11,
    `count=${btnMatches.length}`
  );
  for (const f of contentFields) {
    ok(
      `history_btn_${f}`,
      new RegExp(`productHistoryBtn\\("${f}"`).test(sidhuPage)
    );
  }
  ok(
    "history_btn_seasonal_map",
    /product-seasonal-history/.test(sidhuPage) &&
      seasonalFields.every((f) => sidhuPage.includes(`"${f}"`)) &&
      /productHistoryBtn\(f, l\)/.test(sidhuPage)
  );
  ok(
    "history_btn_logical_14",
    contentFields.length + seasonalFields.length === 14
  );
}

// --- pages/api + public components unchanged vs origin/main (working tree name check) ---
{
  const r = spawnSync(
    "git",
    ["diff", "--name-only", "origin/main", "--", "pages/api", "app", "components"],
    { cwd: ROOT, encoding: "utf8" }
  );
  const names = (r.stdout || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  // MULTI-137: approved admin API stale-write surfaces.
  const MULTI137_API_OK = new Set([
    "pages/api/coupons.ts",
    "pages/api/faqs.ts",
    "pages/api/admin-reviews.ts",
  ]);
  // MULTI-139: atomic staff password + SEO reconcile lock.
  const MULTI139_API_OK = new Set([
    "pages/api/admin-profile.ts",
    "pages/api/admin-staff-password.ts",
    "pages/api/admin-seo-issues/reconcile.ts",
  ]);
  // F4UK-MULTI-142: admin drafts API for CMS pages (Draft/Publish D2).
  const MULTI142_API_OK = new Set(["pages/api/admin-drafts.ts"]);
  // F4UK-MULTI-145: atomic staff login session (staff branch only).
  const MULTI145_API_OK = new Set(["pages/api/admin-login.ts"]);
  // F4UK-MULTI-150: product drafts API surfaces.
  const MULTI150_API_OK = new Set([
    "pages/api/admin-drafts.ts",
    "pages/api/admin-products.ts",
  ]);
  const apiTouched = names.filter(
    (n) =>
      n.startsWith("pages/api/") &&
      !MULTI137_API_OK.has(n) &&
      !MULTI139_API_OK.has(n) &&
      !MULTI142_API_OK.has(n) &&
      !MULTI145_API_OK.has(n) &&
      !MULTI150_API_OK.has(n)
  );
  // MULTI-132: ProductDetail.tsx may receive additive preview listener (still no pages/api).
  // MULTI-133: lib-only tracking gates (no public app/components required).
  // MULTI-136: TrackingConsent suppression gate (+ pathname watcher) on public component.
  const MULTI132_PUBLIC_OK = new Set(["app/products/[slug]/ProductDetail.tsx"]);
  const MULTI136_PUBLIC_OK = new Set(["components/TrackingConsent.tsx"]);
  // F4UK-MULTI-146: /products H1 no duplicate + checkout optional-field tags.
  const MULTI146_PUBLIC_OK = new Set([
    "app/products/ProductsClient.tsx",
    "app/cart/page.tsx",
  ]);
  // F4UK-MULTI-147: optional-tag dedupe, contact phone hint, PDP sticky ATC tuck.
  const MULTI147_PUBLIC_OK = new Set([
    "app/cart/page.tsx",
    "app/contact/page.tsx",
    "app/products/[slug]/ProductDetail.tsx",
  ]);
  // F4UK-MULTI-148: hydration-safe seasonal card countdown + London blog dates.
  const MULTI148_PUBLIC_OK = new Set([
    "components/product/SeasonalCardCountdown.tsx",
    "app/blog/BlogClient.tsx",
    "app/blog/[slug]/BlogPostClient.tsx",
    "lib/blogDateFormat.ts",
  ]);
  // F4UK-MULTI-149: compact mobile consent banner (presentation only).
  const MULTI149_PUBLIC_OK = new Set([
    "components/TrackingConsent.tsx",
  ]);
  // F4UK-MULTI-153: UX fix batch B
  const MULTI153_PUBLIC_OK = new Set([
    "app/cart/page.tsx",
    "components/product/CurrentSeasonalOffers.tsx",
    "components/HeroSlider.tsx",
    "app/faq/FAQClient.tsx",
    "app/blog/BlogClient.tsx",
    "scripts/phase-multi-153-tests.js",
  ]);
  const publicTouched = names.filter(
    (n) =>
      ((n.startsWith("app/") && !n.startsWith("app/sidhu/")) ||
        (n.startsWith("components/") &&
          !n.startsWith("components/admin/") &&
          !n.startsWith("components/sidhu/"))) &&
      !MULTI132_PUBLIC_OK.has(n) &&
      !MULTI136_PUBLIC_OK.has(n) &&
      !MULTI146_PUBLIC_OK.has(n) &&
      !MULTI147_PUBLIC_OK.has(n) &&
      !MULTI148_PUBLIC_OK.has(n) &&
      !MULTI149_PUBLIC_OK.has(n) &&
      !MULTI153_PUBLIC_OK.has(n)
  );
  ok("no_pages_api_changes", apiTouched.length === 0, apiTouched.join(","));
  ok(
    "no_public_app_component_changes",
    publicTouched.length === 0,
    publicTouched.join(",")
  );
  ok(
    "approved_admin_components_present",
    fs.existsSync(path.join(ROOT, "components/admin/ProductListToolbar.tsx")) &&
      fs.existsSync(path.join(ROOT, "components/admin/ProductQuickEditRow.tsx")) &&
      fs.existsSync(path.join(ROOT, "components/admin/ProductEditorSidebar.tsx")) &&
      fs.existsSync(path.join(ROOT, "components/admin/ProductSeoSnippetPreview.tsx"))
  );
  ok(
    "pure_libs_present",
    /export function filterProductsForAdminList/.test(filtersLib) &&
      /export function buildQuickEditPutBody/.test(quickLib) &&
      /export function isProductEditorDraftDirty/.test(dirtyLib)
  );

  // If already committed relative to origin/main, also assert name-only allowlist shape.
  const committed = gitDiffNameOnly("origin/main", "HEAD");
  if (committed.length) {
    const bad = committed.filter(
      (n) =>
        (n.startsWith("pages/api/") &&
          !MULTI137_API_OK.has(n) &&
          !MULTI139_API_OK.has(n) &&
          !MULTI142_API_OK.has(n) &&
          !MULTI145_API_OK.has(n) &&
          !MULTI150_API_OK.has(n)) ||
        (n.startsWith("app/") &&
          n !== "app/sidhu/page.tsx" &&
          n !== "app/products/[slug]/ProductDetail.tsx" &&
          !MULTI146_PUBLIC_OK.has(n) &&
      !MULTI147_PUBLIC_OK.has(n) &&
      !MULTI148_PUBLIC_OK.has(n) &&
      !MULTI149_PUBLIC_OK.has(n) &&
      !MULTI153_PUBLIC_OK.has(n))
    );
    ok("committed_diff_no_api_public", bad.length === 0, bad.join(","));
  } else {
    ok("committed_diff_no_api_public", true, "no commits yet vs origin/main");
  }
}

console.log(`\nMULTI-130 results: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
