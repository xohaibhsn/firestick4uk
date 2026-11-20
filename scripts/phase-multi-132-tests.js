/**
 * F4UK-MULTI-132 — live PDP preview of unsaved product editor changes.
 * Static + pure helpers only. No .env*, no real DB, no network.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");
const { spawnSync } = require("child_process");

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

const cache = new Map();
function loadTs(rel, stubs = {}) {
  const abs = path.join(ROOT, rel);
  const hasStubs = Object.keys(stubs).length > 0;
  const key = abs + "::" + Object.keys(stubs).sort().join(",");
  if (!hasStubs && cache.has(key)) return cache.get(key);
  const src = fs.readFileSync(abs, "utf8");
  const out = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
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
      const mapped = id.replace("@/", "");
      for (const c of [
        path.join(ROOT, mapped + ".ts"),
        path.join(ROOT, mapped + ".tsx"),
        path.join(ROOT, mapped + ".js"),
      ]) {
        if (fs.existsSync(c)) {
          return loadTs(path.relative(ROOT, c).replace(/\\/g, "/"), stubs);
        }
      }
    }
    if (id.startsWith("./") || id.startsWith("../")) {
      const resolved = path.normalize(path.join(path.dirname(abs), id));
      for (const c of [resolved + ".ts", resolved + ".tsx", resolved + ".js"]) {
        if (fs.existsSync(c)) {
          return loadTs(path.relative(ROOT, c).replace(/\\/g, "/"), stubs);
        }
      }
    }
    return orig(id);
  };
  m._compile(out, abs);
  if (!hasStubs) cache.set(key, m.exports);
  return m.exports;
}

const APPROVED = new Set([
  "app/sidhu/page.tsx",
  "components/admin/ProductPreviewPane.tsx",
  "lib/productPreview.ts",
  "app/products/[slug]/ProductDetail.tsx",
  "scripts/phase-multi-132-tests.js",
  // Coupled-suite source unions / allowlist plumbing (assertions not weakened).
  "scripts/phase-multi-96-tests.js",
  "scripts/phase-ux-batch-51-tests.js",
  "scripts/phase-multi-116-tests.js",
  "scripts/phase-multi-130-tests.js",
  "scripts/phase-multi-131-tests.js",
  // F4UK-MULTI-133 preview-frame tracking exclusion (+ its plumbing).
  "lib/cmsPreview.ts",
  "lib/insightsClient.ts",
  "lib/adsConversions.ts",
  "scripts/phase-multi-133-tests.js",
  "scripts/phase-city-cleanup-64-tests.js",
  // F4UK-MULTI-135 public bank-identity redaction (+ plumbing).
  "lib/publicSiteContentFilter.ts",
  "scripts/phase-multi-135-tests.js",
  // F4UK-MULTI-136 suppress Google tags on /sidhu + admin preview iframes.
  "components/TrackingConsent.tsx",
  "scripts/phase-multi-136-tests.js",
  // F4UK-MULTI-137 stale-write guards + coupled plumbing.
  "lib/couponBaseHash.ts",
  "lib/reviewModerationHash.ts",
  "pages/api/coupons.ts",
  "pages/api/faqs.ts",
  "pages/api/admin-reviews.ts",
  "components/sidhu/ReviewsPanel.tsx",
  "scripts/phase-multi-137-tests.js",
  "scripts/phase-multi-97-tests.js",
  "scripts/phase-multi-114-tests.js",
  "scripts/phase-multi-123-tests.js",
  "scripts/phase-multi-126-tests.js",
  "scripts/phase-coupon-validation-tests.js",
  "scripts/phase-multi-105-tests.js",
  // F4UK-MULTI-139: atomic staff password + SEO reconcile lock (+ plumbing).
  "lib/adminStaffPasswordTx.ts",
  "lib/namedLock.ts",
  "pages/api/admin-profile.ts",
  "pages/api/admin-staff-password.ts",
  "lib/seoIssueMemoryServer.ts",
  "pages/api/admin-seo-issues/reconcile.ts",
  "scripts/phase-multi-139-tests.js",
  "scripts/phase-multi-116-tests.js",
  "scripts/phase-multi-130-tests.js",
  "scripts/phase-multi-131-tests.js",
  "scripts/phase-multi-135-tests.js",
  "scripts/phase-multi-136-tests.js",
  "scripts/phase-multi-137-tests.js",
  "scripts/phase-multi-138-tests.js",
  // F4UK-MULTI-140: content_drafts check-only migrate + Draft/Publish design doc.
  "scripts/migrate-content-drafts.js",
  "scripts/phase-multi-140-tests.js",
  "docs/design/DRAFT-PUBLISH.md",
  // F4UK-MULTI-142: admin drafts API for CMS pages (Draft/Publish D2).
  "pages/api/admin-drafts.ts",
  "lib/contentDrafts.ts",
  "lib/contentDraftsCapability.ts",
  "scripts/phase-multi-142-tests.js",
  // F4UK-MULTI-143: Draft/Publish D3 admin UI (CmsDraftBar + client helper).
  "components/admin/CmsDraftBar.tsx",
  "lib/contentDraftClient.ts",
  "app/sidhu/page.tsx",
  "scripts/phase-multi-143-tests.js",
  // F4UK-MULTI-144: health-check network retry + capture waits for CMS load.
  "scripts/live-health-check.js",
  "scripts/tools/visible-text-capture.js",
  "scripts/phase-multi-144-tests.js",
  "scripts/phase-multi-135-tests.js",
  "scripts/phase-multi-138-tests.js",
  "scripts/phase-multi-116-tests.js",
  "scripts/phase-multi-131-tests.js",
  "scripts/phase-multi-139-tests.js",
  "scripts/phase-multi-140-tests.js",
  "scripts/phase-multi-142-tests.js",
  "scripts/phase-multi-143-tests.js",
  // F4UK-MULTI-145: health 429 warn, draft base keep, atomic staff login session.
  "lib/contentDraftClient.ts",
  "components/admin/CmsDraftBar.tsx",
  "lib/adminStaffPasswordTx.ts",
  "pages/api/admin-login.ts",
  "scripts/phase-multi-145-tests.js",
  "scripts/phase-multi-139-tests.js",
  "scripts/phase-multi-116-tests.js",
  "scripts/phase-multi-131-tests.js",
  "scripts/phase-multi-133-tests.js",
  "scripts/phase-multi-136-tests.js",
  "scripts/phase-multi-138-tests.js",
  "scripts/phase-multi-140-tests.js",
  "scripts/phase-multi-142-tests.js",
  "scripts/phase-multi-143-tests.js",
  "scripts/phase-multi-144-tests.js",
  "scripts/phase-multi-130-tests.js",
  "scripts/phase-multi-135-tests.js",
  "scripts/phase-multi-137-tests.js",
  // F4UK-MULTI-146: /products H1 no duplicate + checkout optional-field tags.
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

(async () => {
  ok("productPreview_lib_exists", exists("lib/productPreview.ts"));
  ok("productPreviewPane_exists", exists("components/admin/ProductPreviewPane.tsx"));
  ok("phase_tests_exist", exists("scripts/phase-multi-132-tests.js"));

  const pp = loadTs("lib/productPreview.ts");

  // Allowlist exact keys
  const keys = pp.PRODUCT_PREVIEW_OVERRIDE_KEYS;
  ok(
    "override_allowlist_exact_keys",
    Array.isArray(keys) &&
      keys.length === 8 &&
      keys.join(",") ===
        "name,short_description,full_description,features,price,badge,image,stock"
  );

  // Builder drops non-allowlisted + coerces
  const built = pp.buildProductPreviewOverrides({
    name: "N",
    price: 9.99,
    seo_title: "NOPE",
    category: "NOPE",
    badge: null,
    stock: true,
  });
  ok(
    "builder_allowlist_only",
    Object.keys(built).sort().join(",") === "badge,name,price,stock" &&
      built.price === "9.99" &&
      built.badge === "" &&
      built.stock === "true" &&
      built.seo_title === undefined
  );

  ok(
    "builder_strips_pound_prefix",
    pp.buildProductPreviewOverrides({ price: "£47.99" }).price === "47.99"
  );

  // Sanitizer coercion + drop foreign keys
  const sanitized = pp.sanitizeProductPreviewOverrides({
    name: 42,
    full_description: null,
    evil: "<script>",
    features: true,
    price: "12.50",
  });
  ok(
    "sanitizer_coercion_allowlist",
    sanitized.name === "42" &&
      sanitized.full_description === "" &&
      sanitized.features === "true" &&
      sanitized.price === "12.50" &&
      sanitized.evil === undefined
  );

  // Trust: origin / source / type
  const parentWin = {};
  ok(
    "untrusted_origin_rejected",
    pp.isTrustedProductPreviewEvent(
      {
        origin: "https://evil.example",
        source: parentWin,
        data: { type: "f4uk-product-preview", overrides: { name: "x" } },
      },
      "https://firestick4uk.com",
      parentWin
    ) === false
  );
  ok(
    "untrusted_source_rejected",
    pp.isTrustedProductPreviewEvent(
      {
        origin: "https://firestick4uk.com",
        source: {},
        data: { type: "f4uk-product-preview", overrides: { name: "x" } },
      },
      "https://firestick4uk.com",
      parentWin
    ) === false
  );
  ok(
    "untrusted_type_rejected",
    pp.isTrustedProductPreviewEvent(
      {
        origin: "https://firestick4uk.com",
        source: parentWin,
        data: { type: "f4uk-cms-preview", overrides: { name: "x" } },
      },
      "https://firestick4uk.com",
      parentWin
    ) === false
  );
  ok(
    "trusted_product_preview_accepted",
    pp.isTrustedProductPreviewEvent(
      {
        origin: "https://firestick4uk.com",
        source: parentWin,
        data: { type: "f4uk-product-preview", overrides: { name: "x" } },
      },
      "https://firestick4uk.com",
      parentWin
    ) === true
  );

  // Gate reuse — false => listener must not attach (source assert below)
  ok(
    "gate_false_without_param",
    pp.shouldAttachCmsPreviewListener({
      search: "",
      isIframe: true,
      parentIsSidhu: true,
    }) === false
  );
  ok(
    "gate_true_all_four",
    pp.shouldAttachCmsPreviewListener({
      search: "?cms_preview=1",
      isIframe: true,
      parentIsSidhu: true,
    }) === true
  );

  // Toggle disabled reasons
  ok(
    "toggle_disabled_new",
    pp.productPreviewDisabledReason({
      isNew: true,
      productId: null,
      savedSlug: null,
      active: 1,
    }) === "Save the product first to preview"
  );
  ok(
    "toggle_disabled_no_slug",
    /Save the product first/.test(
      pp.productPreviewDisabledReason({
        isNew: false,
        productId: 5,
        savedSlug: "",
        active: 1,
      }) || ""
    )
  );
  ok(
    "toggle_disabled_private",
    pp.productPreviewDisabledReason({
      isNew: false,
      productId: 5,
      savedSlug: "firestick-4k",
      active: 0,
    }) === "Make Public to preview - private pages return 404"
  );
  ok(
    "toggle_enabled_public",
    pp.productPreviewDisabledReason({
      isNew: false,
      productId: 5,
      savedSlug: "firestick-4k",
      active: 1,
    }) === null
  );

  // apply merge
  const merged = pp.applyProductPreviewOverrides(
    { name: "Old", price: 1, badge: "HOT", image: "/a.png", stock: "Digital" },
    { name: "New", price: "9.99", badge: "", image: "/b.png" }
  );
  ok(
    "apply_overrides_merge",
    merged.name === "New" &&
      merged.price === "9.99" &&
      merged.badge === null &&
      merged.image === "/b.png" &&
      merged.stock === "Digital"
  );

  // Source asserts — pane / hook
  const pane = read("components/admin/ProductPreviewPane.tsx");
  ok("pane_msg_type", /f4uk-product-preview|PRODUCT_PREVIEW_MSG_TYPE/.test(pane));
  ok("pane_debounce_300", /DEBOUNCE_MS\s*=\s*300/.test(pane));
  ok("pane_cms_preview_query", /cmsPreviewHref/.test(pane));
  ok(
    "pane_no_fetch_localStorage",
    !/\bfetch\s*\(/.test(pane) && !/localStorage|sessionStorage/.test(pane)
  );
  ok("pane_postMessage_origin", /postMessage\(/.test(pane) && /window\.location\.origin/.test(pane));

  const detail = read("app/products/[slug]/ProductDetail.tsx");
  ok(
    "detail_gate_shouldAttach",
    /shouldAttachCmsPreviewListener/.test(detail)
  );
  ok(
    "detail_trust_check",
    /isTrustedProductPreviewEvent/.test(detail)
  );
  ok(
    "detail_xss_short_full",
    /xss\(displayProduct\.short_description/.test(detail) &&
      /xss\(displayProduct\.full_description/.test(detail)
  );
  ok(
    "detail_atc_inert_preview",
    /productPreviewMode/.test(detail) &&
      /data-product-preview-inert/.test(detail) &&
      /if \(productPreviewMode\) return/.test(detail)
  );
  ok(
    "detail_badge_on_overrides",
    /CmsPreviewBadge/.test(detail) && /previewOverridesActive/.test(detail)
  );
  ok(
    "detail_hook_no_fetch_localStorage_persist",
    !/localStorage|sessionStorage/.test(detail.split("MULTI-132")[1]?.slice(0, 1200) || "")
  );
  ok(
    "detail_still_has_Number_product_price",
    /Number\(product\.price\)/.test(detail)
  );
  ok(
    "detail_skips_boundary_in_preview",
    /if \(productPreviewMode\) return/.test(detail) &&
      /never run purchase-boundary/.test(detail)
  );

  const sidhu = read("app/sidhu/page.tsx");
  ok("sidhu_preview_toggle", /data-testid=["']product-preview-toggle["']/.test(sidhu));
  ok("sidhu_preview_pane", /ProductPreviewPane/.test(sidhu));
  ok("sidhu_disabled_reason", /productPreviewDisabledReason|product-preview-disabled-reason/.test(sidhu));
  ok(
    "sidhu_uses_saved_slug",
    /slug=\{String\(productModal\.slug\)\}/.test(sidhu) ||
      /slug=\{String\(productModal\?\.slug\)\}/.test(sidhu)
  );

  // page.tsx SSR unchanged + zero pages/api diff vs origin/main working tree for those paths
  const pageSsr = read("app/products/[slug]/page.tsx");
  ok("pdp_page_ssr_still_active_filter", /active\s*=\s*1/.test(pageSsr));

  {
    const MULTI137_API_OK = new Set([
      "pages/api/coupons.ts",
      "pages/api/faqs.ts",
      "pages/api/admin-reviews.ts",
    ]);
    // F4UK-MULTI-139: atomic staff password + SEO reconcile lock.
    const MULTI139_API_OK = new Set([
      "pages/api/admin-profile.ts",
      "pages/api/admin-staff-password.ts",
      "pages/api/admin-seo-issues/reconcile.ts",
    ]);
    // F4UK-MULTI-142: admin drafts API for CMS pages (Draft/Publish D2).
    const MULTI142_API_OK = new Set(["pages/api/admin-drafts.ts"]);
    // F4UK-MULTI-145: atomic staff login session (staff branch only).
    const MULTI145_API_OK = new Set(["pages/api/admin-login.ts"]);
    const r = spawnSync(
      "git",
      ["diff", "--name-only", "origin/main", "--", "pages/api", "app/products/[slug]/page.tsx"],
      { cwd: ROOT, encoding: "utf8" }
    );
    const names = (r.stdout || "")
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .filter(
        (n) =>
          !MULTI137_API_OK.has(n) &&
          !MULTI139_API_OK.has(n) &&
          !MULTI142_API_OK.has(n) &&
          !MULTI145_API_OK.has(n)
      );
    ok("zero_diff_pages_api_and_pdp_page", names.length === 0, names.join(",") || "clean");
  }

  // Working tree / untracked limited to approved (+ historical committed ok if only approved)
  {
    const working = spawnSync("git", ["diff", "--name-only", "HEAD"], {
      cwd: ROOT,
      encoding: "utf8",
    });
    const untracked = spawnSync(
      "git",
      ["ls-files", "--others", "--exclude-standard"],
      { cwd: ROOT, encoding: "utf8" }
    );
    const names = [
      ...(working.stdout || "").split(/\r?\n/),
      ...(untracked.stdout || "").split(/\r?\n/),
    ]
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((n) => !n.startsWith("_reports/") && !n.endsWith(".zip") && !n.endsWith(".sha256"));
    const unexpected = names.filter((n) => !APPROVED.has(n.replace(/\\/g, "/")));
    ok(
      "working_tree_approved_only",
      unexpected.length === 0,
      unexpected.join(",") || "clean"
    );
  }

  console.log(`\nMULTI-132 results: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
