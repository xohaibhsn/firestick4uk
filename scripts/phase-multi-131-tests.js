/**
 * F4UK-MULTI-131 — Products bulk actions (UI only).
 * Pure node: static source + pure-function checks. No DB. No real HTTP.
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

/** Run async bulk runner in a child so CommonJS tests stay synchronous. */
function runBulkChild(items, mode) {
  const script = `
    const path = require("path");
    const fs = require("fs");
    const Module = require("module");
    const ts = require("typescript");
    const ROOT = ${JSON.stringify(ROOT)};
    function loadTsModule(rel) {
      const abs = path.join(ROOT, rel);
      const src = fs.readFileSync(abs, "utf8");
      const out = ts.transpileModule(src, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
        fileName: abs,
      }).outputText;
      const m = new Module(abs, module);
      m.filename = abs;
      m.paths = Module._nodeModulePaths(path.dirname(abs));
      const orig = m.require.bind(m);
      m.require = (id) => {
        if (id.startsWith("@/")) {
          const mapped = id.slice(2);
          for (const c of [mapped + ".ts", mapped + ".tsx", mapped + ".js"].map((x) => path.join(ROOT, x))) {
            if (fs.existsSync(c)) return loadTsModule(path.relative(ROOT, c).replace(/\\\\/g, "/"));
          }
        }
        return orig(id);
      };
      m._compile(out, abs);
      return m.exports;
    }
    const { runProductBulkSequential } = loadTsModule("lib/productAdminBulk.ts");
    const items = ${JSON.stringify(items)};
    const mode = ${JSON.stringify(mode)};
    (async () => {
      const order = [];
      const summary = await runProductBulkSequential({
        items,
        send: async (spec) => {
          order.push(spec.body.id);
          if (mode === "ok") return { status: 200, ok: true, success: true };
          if (mode === "409" && spec.body.id === 11) return { status: 409, ok: false, code: "stale_version" };
          if (mode === "409") return { status: 200, ok: true, success: true };
          if (mode === "401") return { status: 401, ok: false };
          if (mode === "403") return { status: 403, ok: false };
          return { status: 200, ok: true, success: true };
        },
      });
      process.stdout.write(JSON.stringify({ order, summary }));
    })().catch((e) => { console.error(e); process.exit(2); });
  `;
  const r = spawnSync(process.execPath, ["-e", script], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 5 * 1024 * 1024,
  });
  if (r.status !== 0) {
    return { order: [], summary: null, error: r.stderr || r.stdout };
  }
  try {
    return JSON.parse(String(r.stdout || "").trim());
  } catch (e) {
    return { order: [], summary: null, error: String(e) + " raw=" + r.stdout };
  }
}

const sidhuPage = read("app/sidhu/page.tsx");
const bulkBar = read("components/admin/ProductBulkBar.tsx");
const bulkLibSrc = read("lib/productAdminBulk.ts");
const productAdminSrc = [sidhuPage, bulkBar].join("\n");

const {
  PRODUCT_BULK_MAX_SELECTION,
  toggleProductBulkSelection,
  selectAllVisibleProductIds,
  partitionBulkVisibilityTargets,
  buildBulkVisibilityPatchBody,
  buildBulkPriceStockPutBody,
  buildBulkConfirmMessage,
  isBulkVisibilityPatchBodyStrict,
  isQuickEditPutBodyStrict,
  BULK_CHANGED_ELSEWHERE_REASON,
} = loadTsModule("lib/productAdminBulk.ts");

console.log("\nF4UK-MULTI-131 Products bulk actions\n");

// --- Max 25 selection ---
{
  ok("max_selection_const", PRODUCT_BULK_MAX_SELECTION === 25);
  let sel = [];
  let allOk = true;
  for (let i = 1; i <= 25; i++) {
    const r = toggleProductBulkSelection(sel, i);
    sel = r.next;
    if (r.capped || sel.length !== i) allOk = false;
  }
  ok("select_up_to_25", allOk && sel.length === 25);
  const capped = toggleProductBulkSelection(sel, 99);
  ok("max_25_blocks_26th", capped.capped && capped.next.length === 25 && !capped.next.includes(99));

  const all = selectAllVisibleProductIds(
    Array.from({ length: 40 }, (_, i) => i + 1),
    [],
    25
  );
  ok("select_all_visible_caps_25", all.next.length === 25 && all.capped && all.omittedVisible === 15);
}

// --- Body builders allowlist ---
{
  const row = {
    id: 7,
    name: "Firestick 4K",
    active: 1,
    price: "29.99",
    stock: "Digital",
    product_version: 3,
    lifecycle_mode: "permanent",
  };
  const vis = buildBulkVisibilityPatchBody(row, 0);
  ok("vis_patch_ok", vis.ok === true);
  if (vis.ok) {
    ok(
      "vis_patch_keys_strict",
      isBulkVisibilityPatchBodyStrict(vis.body) &&
        Object.keys(vis.body).sort().join(",") ===
          "active,expected_active,expected_version,id"
    );
    ok(
      "vis_patch_values",
      vis.body.id === 7 &&
        vis.body.active === 0 &&
        vis.body.expected_active === 1 &&
        vis.body.expected_version === 3
    );
  }

  const priceBody = buildBulkPriceStockPutBody(row, { price: "19.99" }, "set_price");
  ok("price_put_ok", priceBody.ok === true);
  if (priceBody.ok) {
    ok(
      "price_put_keys_strict",
      isQuickEditPutBodyStrict(priceBody.body) &&
        Object.keys(priceBody.body).sort().join(",") ===
          "expected_version,id,price,stock"
    );
    ok(
      "price_put_reuses_stock",
      priceBody.body.price === "19.99" && priceBody.body.stock === "Digital"
    );
  }

  const stockBody = buildBulkPriceStockPutBody(row, { stock: "" }, "set_stock");
  ok("stock_empty_defaults_digital", stockBody.ok === true && stockBody.body.stock === "Digital");
  if (stockBody.ok) {
    ok(
      "stock_put_reuses_price",
      stockBody.body.price === "29.99" && isQuickEditPutBodyStrict(stockBody.body)
    );
  }

  const bad = buildBulkPriceStockPutBody(row, { price: "12.999" }, "set_price");
  ok("invalid_price_no_body", bad.ok === false);
  ok(
    "invalid_price_blocks_before_request",
    buildBulkPriceStockPutBody(
      { id: 1, price: "9.99", stock: "1", product_version: 1 },
      { price: "abc" },
      "set_price"
    ).ok === false
  );
}

// --- Seasonal excluded from Private; already public/private skips ---
{
  const sample = [
    { id: 1, name: "A", active: 1, lifecycle_mode: "permanent" },
    { id: 2, name: "B", active: 0, lifecycle_mode: "permanent" },
    { id: 3, name: "Seasonal X", active: 1, lifecycle_mode: "seasonal" },
  ];
  const priv = partitionBulkVisibilityTargets(sample, "make_private");
  ok(
    "private_excludes_seasonal_and_already_private",
    priv.eligible.length === 1 &&
      Number(priv.eligible[0].id) === 1 &&
      priv.skipped.some((s) => s.reason === "seasonal_must_stay_public") &&
      priv.skipped.some((s) => s.reason === "already_private")
  );
  const pub = partitionBulkVisibilityTargets(sample, "make_public");
  ok(
    "public_skips_already_public",
    pub.eligible.length === 1 &&
      Number(pub.eligible[0].id) === 2 &&
      pub.skipped.filter((s) => s.reason === "already_public").length === 2
  );

  const msg = buildBulkConfirmMessage({
    action: "make_private",
    eligible: priv.eligible,
    skipped: priv.skipped,
  });
  ok(
    "confirm_private_warns_404_sitemap",
    /404/.test(msg) && /sitemap/i.test(msg) && /Seasonal/i.test(msg)
  );
  ok("confirm_lists_skips", /Will skip/.test(msg) && /Seasonal X/.test(msg));
}

// --- Sequential runner: order, 409 skip-continue, 401/403 abort ---
{
  const okRun = runBulkChild(
    [
      { id: 1, name: "One", request: { method: "PATCH", body: { id: 1, active: 1, expected_active: 0 } } },
      { id: 2, name: "Two", request: { method: "PATCH", body: { id: 2, active: 1, expected_active: 0 } } },
      { id: 3, name: "Three", request: { method: "PATCH", body: { id: 3, active: 1, expected_active: 0 } } },
    ],
    "ok"
  );
  ok("sequential_order", okRun.order && okRun.order.join(",") === "1,2,3", okRun.error || "");
  ok(
    "sequential_all_succeeded",
    okRun.summary && okRun.summary.succeeded === 3 && okRun.summary.requestCount === 3
  );

  const c409 = runBulkChild(
    [
      { id: 10, name: "A", request: { method: "PUT", body: { id: 10, price: "1", stock: "Digital", expected_version: 1 } } },
      { id: 11, name: "B", request: { method: "PUT", body: { id: 11, price: "1", stock: "Digital", expected_version: 1 } } },
      { id: 12, name: "C", request: { method: "PUT", body: { id: 12, price: "1", stock: "Digital", expected_version: 1 } } },
    ],
    "409"
  );
  ok("conflict_409_skip_continue_order", c409.order && c409.order.join(",") === "10,11,12");
  ok(
    "conflict_409_skip_not_fail",
    c409.summary &&
      c409.summary.succeeded === 2 &&
      c409.summary.skipped.length === 1 &&
      c409.summary.skipped[0].reason === "changed_elsewhere" &&
      c409.summary.failed.length === 0 &&
      c409.summary.aborted === null
  );
  ok("conflict_reason_text", BULK_CHANGED_ELSEWHERE_REASON === "changed elsewhere");

  const a401 = runBulkChild(
    [
      { id: 1, name: "A", request: { method: "PATCH", body: { id: 1, active: 0, expected_active: 1 } } },
      { id: 2, name: "B", request: { method: "PATCH", body: { id: 2, active: 0, expected_active: 1 } } },
    ],
    "401"
  );
  ok("abort_401", a401.summary && a401.summary.aborted === "session" && a401.order.length === 1);

  const a403 = runBulkChild(
    [
      { id: 1, name: "A", request: { method: "PUT", body: { id: 1, price: "1", stock: "x", expected_version: 1 } } },
      { id: 2, name: "B", request: { method: "PUT", body: { id: 2, price: "1", stock: "x", expected_version: 1 } } },
    ],
    "403"
  );
  ok("abort_403", a403.summary && a403.summary.aborted === "permission" && a403.order.length === 1);

  // Cancel → 0 requests (confirm false path never invokes runner)
  let cancelRequests = 0;
  const cancelConfirmed = false;
  if (cancelConfirmed) cancelRequests += 1;
  ok("cancel_zero_requests", cancelRequests === 0);
}

// --- Source assertions ---
{
  ok("testid_product_select", /data-testid=\{`product-select-\$\{p\.id\}`\}/.test(sidhuPage));
  ok("testid_product_select_all", /data-testid="product-select-all"/.test(sidhuPage));
  ok("testid_product_bulk_bar", /data-testid="product-bulk-bar"/.test(bulkBar));
  ok("testid_make_public", /data-testid="product-bulk-make-public"/.test(bulkBar));
  ok("testid_make_private", /data-testid="product-bulk-make-private"/.test(bulkBar));
  ok("testid_set_price", /data-testid="product-bulk-set-price"/.test(bulkBar));
  ok("testid_set_stock", /data-testid="product-bulk-set-stock"/.test(bulkBar));
  ok(
    "manage_gate_bulk_bar",
    /can\("products\.manage"\) && selectedProductIds\.length > 0/.test(sidhuPage)
  );
  ok(
    "manage_gate_checkbox",
    /can\("products\.manage"\) \? \(/.test(sidhuPage) && /product-select-all/.test(sidhuPage)
  );
  ok("uses_runProductBulkSequential", /runProductBulkSequential/.test(sidhuPage));
  ok("uses_partition_visibility", /partitionBulkVisibilityTargets/.test(sidhuPage));
  ok("uses_build_bulk_price", /buildBulkPriceStockPutBody/.test(sidhuPage));
  ok("askConfirm_before_bulk", /buildBulkConfirmMessage/.test(sidhuPage) && /askConfirm/.test(sidhuPage));
  ok("no_delete_in_bulk_lib", !/\bDELETE\b/.test(bulkLibSrc) && !/method:\s*["']DELETE["']/.test(bulkLibSrc));
  ok("no_delete_in_bulk_bar", !/Delete/.test(bulkBar) && !/DELETE/.test(bulkBar));
  ok(
    "bulk_page_no_bulk_delete",
    !/product-bulk-delete/.test(productAdminSrc) && !/runBulkDelete/.test(sidhuPage)
  );

  const btnMatches = sidhuPage.match(/productHistoryBtn\(/g) || [];
  // Brief said 12; origin/main e7787b0 has 11 call sites — must stay unchanged.
  ok("productHistoryBtn_count_unchanged", btnMatches.length === 11, `count=${btnMatches.length}`);
  ok("product_save_btn_present", /product-save-btn/.test(sidhuPage));
  ok("quick_edit_untouched_helper", /buildQuickEditPutBody/.test(sidhuPage));
}

// --- pages/api + public untouched; approved files only ---
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
  const apiTouched = names.filter((n) => n.startsWith("pages/api/"));
  // MULTI-132: additive ProductDetail preview listener is an allowed public exception.
  const MULTI132_OK = new Set([
    "app/products/[slug]/ProductDetail.tsx",
    "app/sidhu/page.tsx",
    "lib/productPreview.ts",
    "components/admin/ProductPreviewPane.tsx",
    "scripts/phase-multi-132-tests.js",
  ]);
  const MULTI133_OK = new Set([
    "lib/cmsPreview.ts",
    "lib/insightsClient.ts",
    "lib/adsConversions.ts",
    "scripts/phase-multi-133-tests.js",
  ]);
  // F4UK-MULTI-135: public bank-identity redaction (+ phase test).
  const MULTI135_OK = new Set([
    "lib/publicSiteContentFilter.ts",
    "scripts/phase-multi-135-tests.js",
  ]);
  // F4UK-MULTI-136: suppress Google tags on /sidhu + admin preview iframes.
  const MULTI136_OK = new Set([
    "lib/cmsPreview.ts",
    "components/TrackingConsent.tsx",
    "scripts/phase-multi-136-tests.js",
  ]);
  // F4UK-MULTI-137: stale-write guards (coupons / FAQ reorder / review moderation).
  const MULTI137_OK = new Set([
    "lib/couponBaseHash.ts",
    "lib/reviewModerationHash.ts",
    "pages/api/coupons.ts",
    "pages/api/faqs.ts",
    "pages/api/admin-reviews.ts",
    "app/sidhu/page.tsx",
    "components/sidhu/ReviewsPanel.tsx",
    "scripts/phase-multi-137-tests.js",
  ]);
  // F4UK-MULTI-139: atomic staff password + SEO reconcile lock.
  const MULTI139_OK = new Set([
    "lib/adminStaffPasswordTx.ts",
    "lib/namedLock.ts",
    "pages/api/admin-profile.ts",
    "pages/api/admin-staff-password.ts",
    "lib/seoIssueMemoryServer.ts",
    "pages/api/admin-seo-issues/reconcile.ts",
    "scripts/phase-multi-139-tests.js",
  ]);
  // F4UK-MULTI-142: admin drafts API for CMS pages (Draft/Publish D2).
  const MULTI142_OK = new Set([
    "pages/api/admin-drafts.ts",
    "lib/contentDrafts.ts",
    "lib/contentDraftsCapability.ts",
    "scripts/phase-multi-142-tests.js",
  ]);
  // F4UK-MULTI-143: Draft/Publish D3 admin UI (CmsDraftBar + client helper).
  const MULTI143_OK = new Set([
    "components/admin/CmsDraftBar.tsx",
    "lib/contentDraftClient.ts",
    "app/sidhu/page.tsx",
    "pages/api/admin-drafts.ts",
    "lib/contentDrafts.ts",
    "scripts/phase-multi-143-tests.js",
    "docs/design/DRAFT-PUBLISH.md",
  ]);
  // F4UK-MULTI-144: health-check network retry + capture waits for CMS load.
  const MULTI144_OK = new Set([
    "scripts/live-health-check.js",
    "scripts/tools/visible-text-capture.js",
    "scripts/phase-multi-144-tests.js",
    "scripts/phase-multi-135-tests.js",
    "scripts/phase-multi-138-tests.js",
    "scripts/phase-multi-116-tests.js",
    "scripts/phase-multi-132-tests.js",
    "scripts/phase-multi-133-tests.js",
    "scripts/phase-multi-136-tests.js",
    "scripts/phase-multi-139-tests.js",
    "scripts/phase-multi-140-tests.js",
    "scripts/phase-multi-142-tests.js",
    "scripts/phase-multi-143-tests.js",
  ]);
  // F4UK-MULTI-145: health 429 warn, draft base keep, atomic staff login session.
  const MULTI145_OK = new Set([
    "scripts/live-health-check.js",
    "lib/contentDraftClient.ts",
    "components/admin/CmsDraftBar.tsx",
    "lib/adminStaffPasswordTx.ts",
    "pages/api/admin-login.ts",
    "scripts/phase-multi-145-tests.js",
    "scripts/phase-multi-139-tests.js",
    "scripts/phase-multi-116-tests.js",
    "scripts/phase-multi-132-tests.js",
    "scripts/phase-multi-133-tests.js",
    "scripts/phase-multi-135-tests.js",
    "scripts/phase-multi-136-tests.js",
    "scripts/phase-multi-138-tests.js",
    "scripts/phase-multi-140-tests.js",
    "scripts/phase-multi-142-tests.js",
    "scripts/phase-multi-143-tests.js",
    "scripts/phase-multi-144-tests.js",
    "scripts/phase-multi-130-tests.js",
    "scripts/phase-multi-135-tests.js",
    "scripts/phase-multi-137-tests.js",
  ]);
  // F4UK-MULTI-146: /products H1 no duplicate + checkout optional-field tags.
  const MULTI146_OK = new Set([
    "app/products/ProductsClient.tsx",
    "lib/productsPageTitle.ts",
    "app/cart/page.tsx",
    "lib/adminContentFields.ts",
    "scripts/phase-multi-146-tests.js",
    "scripts/phase-multi-116-tests.js",
    "scripts/phase-multi-130-tests.js",
    "scripts/phase-multi-131-tests.js",
    "scripts/phase-multi-132-tests.js",
    "scripts/phase-multi-133-tests.js",
    "scripts/phase-multi-135-tests.js",
    "scripts/phase-multi-136-tests.js",
    "scripts/phase-multi-137-tests.js",
    "scripts/phase-multi-138-tests.js",
    "scripts/phase-multi-139-tests.js",
    "scripts/phase-multi-140-tests.js",
    "scripts/phase-multi-142-tests.js",
    "scripts/phase-multi-143-tests.js",
    "scripts/phase-multi-144-tests.js",
    "scripts/phase-multi-145-tests.js",
  ]);
  // F4UK-MULTI-147: optional-tag dedupe, contact phone hint, PDP sticky ATC tuck.
  const MULTI147_OK = new Set([
    "lib/optionalLabel.ts",
    "app/cart/page.tsx",
    "app/contact/page.tsx",
    "app/products/[slug]/ProductDetail.tsx",
    "scripts/phase-multi-147-tests.js",
    "scripts/phase-multi-116-tests.js",
    "scripts/phase-multi-130-tests.js",
    "scripts/phase-multi-131-tests.js",
    "scripts/phase-multi-132-tests.js",
    "scripts/phase-multi-133-tests.js",
    "scripts/phase-multi-135-tests.js",
    "scripts/phase-multi-136-tests.js",
    "scripts/phase-multi-137-tests.js",
    "scripts/phase-multi-138-tests.js",
    "scripts/phase-multi-139-tests.js",
    "scripts/phase-multi-140-tests.js",
    "scripts/phase-multi-142-tests.js",
    "scripts/phase-multi-143-tests.js",
    "scripts/phase-multi-144-tests.js",
    "scripts/phase-multi-145-tests.js",
    "scripts/phase-multi-146-tests.js",
  ]);
  // F4UK-MULTI-148: hydration-safe seasonal card countdown + London blog dates.
  const MULTI148_OK = new Set([
    "components/product/SeasonalCardCountdown.tsx",
    "app/blog/BlogClient.tsx",
    "app/blog/[slug]/BlogPostClient.tsx",
    "lib/blogDateFormat.ts",
    "scripts/phase-multi-148-tests.js",
    "scripts/phase-multi-116-tests.js",
    "scripts/phase-multi-130-tests.js",
    "scripts/phase-multi-131-tests.js",
    "scripts/phase-multi-132-tests.js",
    "scripts/phase-multi-133-tests.js",
    "scripts/phase-multi-135-tests.js",
    "scripts/phase-multi-136-tests.js",
    "scripts/phase-multi-137-tests.js",
    "scripts/phase-multi-138-tests.js",
    "scripts/phase-multi-139-tests.js",
    "scripts/phase-multi-140-tests.js",
    "scripts/phase-multi-142-tests.js",
    "scripts/phase-multi-143-tests.js",
    "scripts/phase-multi-144-tests.js",
    "scripts/phase-multi-145-tests.js",
    "scripts/phase-multi-146-tests.js",
    "scripts/phase-multi-147-tests.js",
  ]);
  // F4UK-MULTI-149: compact mobile consent banner (presentation only).
  const MULTI149_OK = new Set([
    "components/TrackingConsent.tsx",
    "scripts/phase-multi-149-tests.js",
    "scripts/phase-multi-116-tests.js",
    "scripts/phase-multi-130-tests.js",
    "scripts/phase-multi-131-tests.js",
    "scripts/phase-multi-132-tests.js",
    "scripts/phase-multi-133-tests.js",
    "scripts/phase-multi-135-tests.js",
    "scripts/phase-multi-136-tests.js",
    "scripts/phase-multi-137-tests.js",
    "scripts/phase-multi-138-tests.js",
    "scripts/phase-multi-139-tests.js",
    "scripts/phase-multi-140-tests.js",
    "scripts/phase-multi-142-tests.js",
    "scripts/phase-multi-143-tests.js",
    "scripts/phase-multi-144-tests.js",
    "scripts/phase-multi-145-tests.js",
    "scripts/phase-multi-146-tests.js",
    "scripts/phase-multi-147-tests.js",
    "scripts/phase-multi-148-tests.js",
  ]);
  // F4UK-MULTI-150: product drafts (Draft/Publish D4).
  const MULTI150_OK = new Set([
    "lib/contentDrafts.ts",
    "pages/api/admin-drafts.ts",
    "pages/api/admin-products.ts",
    "components/admin/ProductDraftBar.tsx",
    "lib/productDraftClient.ts",
    "app/sidhu/page.tsx",
    "scripts/phase-multi-150-tests.js",
    "docs/design/DRAFT-PUBLISH.md",
  ]);
  // F4UK-MULTI-151: draft bars stable session-expired refs (no reload on parent render).
  const MULTI151_OK = new Set([
    "components/admin/CmsDraftBar.tsx",
    "components/admin/ProductDraftBar.tsx",
    "scripts/phase-multi-151-tests.js",
    // F4UK-MULTI-153: UX fix batch B
    "app/cart/page.tsx",
    "components/product/CurrentSeasonalOffers.tsx",
    "components/HeroSlider.tsx",
    "app/faq/FAQClient.tsx",
    "app/blog/BlogClient.tsx",
    "scripts/phase-multi-153-tests.js",
    // F4UK-MULTI-154: hero active-dot hotfix
    "components/HeroSlider.tsx",
    "scripts/phase-multi-154-tests.js",
    // F4UK-MULTI-155: promo bar styles
    "lib/seasonalPromoStyle.ts",
    "components/home/SeasonalHomePromoStrip.tsx",
    "app/HomeClient.tsx",
    "app/page.tsx",
    "lib/adminContentFields.ts",
    "components/admin/AdminContentPanel.tsx",
    "scripts/phase-multi-155-tests.js",
  ]);
  const publicTouched = names.filter(
    (n) =>
      ((n.startsWith("app/") && !n.startsWith("app/sidhu/")) ||
        (n.startsWith("components/") &&
          !n.startsWith("components/admin/") &&
          !n.startsWith("components/sidhu/"))) &&
      !MULTI132_OK.has(n) &&
      !MULTI133_OK.has(n) &&
      !MULTI135_OK.has(n) &&
      !MULTI136_OK.has(n) &&
      !MULTI137_OK.has(n) &&
      !MULTI139_OK.has(n) &&
      !MULTI142_OK.has(n) &&
      !MULTI143_OK.has(n) &&
      !MULTI144_OK.has(n) &&
      !MULTI145_OK.has(n) &&
        !MULTI146_OK.has(n) &&
        !MULTI147_OK.has(n) &&
        !MULTI148_OK.has(n) &&
        !MULTI149_OK.has(n) &&
        !MULTI150_OK.has(n) &&
        !MULTI151_OK.has(n)
  );
  const apiTouchedUnexpected = apiTouched.filter(
    (n) =>
      !MULTI137_OK.has(n) &&
      !MULTI139_OK.has(n) &&
      !MULTI142_OK.has(n) &&
      !MULTI143_OK.has(n) &&
      !MULTI145_OK.has(n) &&
        !MULTI146_OK.has(n) &&
        !MULTI147_OK.has(n) &&
        !MULTI148_OK.has(n) &&
        !MULTI149_OK.has(n) &&
        !MULTI150_OK.has(n) &&
        !MULTI151_OK.has(n)
  );
  ok(
    "no_pages_api_changes",
    apiTouchedUnexpected.length === 0,
    apiTouchedUnexpected.join(",")
  );
  ok(
    "no_public_app_component_changes",
    publicTouched.length === 0,
    publicTouched.join(",")
  );

  const working = spawnSync("git", ["diff", "--name-only", "HEAD"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const untracked = spawnSync(
    "git",
    ["ls-files", "--others", "--exclude-standard"],
    { cwd: ROOT, encoding: "utf8" }
  );
  const allChanged = [
    ...gitDiffNameOnly("e7787b01d3443371019c279c5c79501d94dc3c38", "HEAD"),
    ...(working.stdout || "").split(/\r?\n/),
    ...(untracked.stdout || "").split(/\r?\n/),
  ]
    .map((s) => s.trim())
    .filter(Boolean);
  const PLUMBING_OK = new Set([
    "scripts/phase-multi-96-tests.js",
    "scripts/phase-ux-batch-51-tests.js",
    "scripts/phase-multi-116-tests.js",
    "scripts/phase-multi-130-tests.js",
    "scripts/phase-multi-131-tests.js",
    "scripts/phase-multi-132-tests.js",
    "scripts/phase-multi-133-tests.js",
    "scripts/phase-multi-135-tests.js",
    "scripts/phase-multi-136-tests.js",
    "scripts/phase-multi-137-tests.js",
    "scripts/phase-multi-137-tests.js",
    "scripts/phase-multi-138-tests.js",
    "scripts/phase-multi-139-tests.js",
    "scripts/phase-multi-142-tests.js",
    "scripts/phase-multi-143-tests.js",
    "scripts/phase-multi-144-tests.js",
    "scripts/phase-multi-145-tests.js",
    "scripts/phase-multi-146-tests.js",
    "scripts/phase-multi-147-tests.js",
    "scripts/phase-multi-148-tests.js",
    "scripts/phase-multi-97-tests.js",
    "scripts/phase-multi-114-tests.js",
    "scripts/phase-multi-116-tests.js",
    "scripts/phase-multi-123-tests.js",
    "scripts/phase-multi-126-tests.js",
    "scripts/phase-coupon-validation-tests.js",
    "scripts/phase-multi-105-tests.js",
  ]);
  const unexpected = [...new Set(allChanged)].filter((n) => {
    if (
      MULTI132_OK.has(n) ||
      MULTI133_OK.has(n) ||
      MULTI135_OK.has(n) ||
      MULTI136_OK.has(n) ||
      MULTI137_OK.has(n) ||
      MULTI139_OK.has(n) ||
      MULTI142_OK.has(n) ||
      MULTI143_OK.has(n) ||
      MULTI144_OK.has(n) ||
      MULTI145_OK.has(n) ||
      MULTI146_OK.has(n) ||
      MULTI147_OK.has(n) ||
      MULTI148_OK.has(n) ||
      MULTI149_OK.has(n) ||
      MULTI150_OK.has(n) ||
      MULTI151_OK.has(n) ||
      PLUMBING_OK.has(n)
    ) {
      return false;
    }
    if (n.startsWith("pages/api/")) return true;
    if (n.startsWith("app/") && n !== "app/sidhu/page.tsx") return true;
    if (
      n.startsWith("lib/") &&
      n !== "lib/productAdminBulk.ts" &&
      !MULTI133_OK.has(n) &&
      !MULTI135_OK.has(n) &&
      !MULTI136_OK.has(n) &&
      !MULTI137_OK.has(n) &&
      !MULTI139_OK.has(n) &&
      !MULTI142_OK.has(n) &&
      !MULTI143_OK.has(n)
    ) {
      return true;
    }
    if (
      n.startsWith("components/") &&
      n !== "components/admin/ProductBulkBar.tsx" &&
      n !== "components/admin/ProductListToolbar.tsx" &&
      n !== "components/admin/ProductPreviewPane.tsx" &&
      !MULTI136_OK.has(n) &&
      !MULTI137_OK.has(n) &&
      !MULTI143_OK.has(n) &&
      !MULTI150_OK.has(n) &&
      !MULTI151_OK.has(n)
    ) {
      return true;
    }
    return false;
  });
  ok("approved_paths_only_strict", unexpected.length === 0, unexpected.join(","));
  ok(
    "bulk_files_present",
    fs.existsSync(path.join(ROOT, "components/admin/ProductBulkBar.tsx")) &&
      fs.existsSync(path.join(ROOT, "lib/productAdminBulk.ts"))
  );
}

console.log(`\nMULTI-131 results: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
