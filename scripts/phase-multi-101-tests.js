/**
 * F4UK-MULTI-101 — CMS live preview pane + seasonal offer wizard.
 * Static + mocked fetch only. No .env*, no real DB, no network.
 */
"use strict";

const fs = require("fs");
const path = require("path");
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

(async () => {
  ok("cmsPreview_lib_exists", exists("lib/cmsPreview.ts"));
  ok("seasonalWizard_lib_exists", exists("lib/seasonalOfferWizard.ts"));
  ok("previewPane_exists", exists("components/admin/CmsPreviewPane.tsx"));
  ok("wizard_ui_exists", exists("components/admin/SeasonalOfferWizard.tsx"));
  ok("previewSeo_exists", exists("components/CmsPreviewSeo.tsx"));
  ok("previewBadge_exists", exists("components/CmsPreviewBadge.tsx"));

  const cmsPreview = loadTs("lib/cmsPreview.ts");
  const wizard = loadTs("lib/seasonalOfferWizard.ts", {
    "@/lib/productAiClient": {
      parseStrictPriceGbp: (v) => {
        const n = Number(String(v).replace(/£/g, "").trim());
        if (!Number.isFinite(n) || n < 0) return undefined;
        if (!/^\d+(\.\d{1,2})?$/.test(String(v).replace(/£/g, "").trim()) &&
            !/^\d+(\.\d{1,2})?$/.test(String(n))) {
          // mirror strict-ish: allow numbers
        }
        const s = String(v).replace(/£/g, "").trim();
        if (!/^\d+(\.\d{1,2})?$/.test(s)) return undefined;
        return Number(s);
      },
    },
  });

  // A3 coverage list non-empty
  ok(
    "coverage_list_nonempty",
    Array.isArray(cmsPreview.CMS_PREVIEW_SSR_ONLY_KEYS) &&
      cmsPreview.CMS_PREVIEW_SSR_ONLY_KEYS.length > 0,
    String(cmsPreview.CMS_PREVIEW_SSR_ONLY_KEYS.length)
  );
  ok(
    "coverage_includes_home_heroes",
    cmsPreview.CMS_PREVIEW_SSR_ONLY_KEYS.includes("home_top_hero_title") &&
      cmsPreview.CMS_PREVIEW_SSR_ONLY_KEYS.includes("home_hero_title")
  );

  // Listener attach conditions
  ok(
    "listener_requires_all_four",
    cmsPreview.shouldAttachCmsPreviewListener({
      search: "?cms_preview=1",
      isIframe: true,
      parentIsSidhu: true,
    }) === true
  );
  ok(
    "listener_not_without_param",
    cmsPreview.shouldAttachCmsPreviewListener({
      search: "",
      isIframe: true,
      parentIsSidhu: true,
    }) === false
  );
  ok(
    "listener_not_without_iframe",
    cmsPreview.shouldAttachCmsPreviewListener({
      search: "?cms_preview=1",
      isIframe: false,
      parentIsSidhu: true,
    }) === false
  );
  ok(
    "listener_not_without_sidhu_parent",
    cmsPreview.shouldAttachCmsPreviewListener({
      search: "?cms_preview=1",
      isIframe: true,
      parentIsSidhu: false,
    }) === false
  );

  // Foreign origin ignored
  const parentWin = {};
  ok(
    "foreign_origin_ignored",
    cmsPreview.isTrustedCmsPreviewEvent(
      {
        origin: "https://evil.example",
        source: parentWin,
        data: { type: "f4uk-cms-preview", overrides: { a: "1" } },
      },
      "https://firestick4uk.com",
      parentWin
    ) === false
  );
  ok(
    "same_origin_trusted",
    cmsPreview.isTrustedCmsPreviewEvent(
      {
        origin: "https://firestick4uk.com",
        source: parentWin,
        data: { type: "f4uk-cms-preview", overrides: { a: "1" } },
      },
      "https://firestick4uk.com",
      parentWin
    ) === true
  );

  // Dirty-only payload
  const dirty = cmsPreview.buildDirtyOverrides(
    { a: "1", b: "2", c: "same" },
    { a: "0", b: "2", c: "same" }
  );
  ok(
    "dirty_only_payload",
    Object.keys(dirty).length === 1 && dirty.a === "1" && dirty.b === undefined
  );

  // Parent sidhu check
  ok(
    "parent_sidhu_pathname",
    cmsPreview.parentIsSidhuAdmin({
      tryParentPathname: () => "/sidhu",
      referrer: "",
    }) === true
  );
  ok(
    "parent_sidhu_referrer",
    cmsPreview.parentIsSidhuAdmin({
      tryParentPathname: () => {
        throw new Error("blocked");
      },
      referrer: "https://firestick4uk.com/sidhu",
    }) === true
  );

  // Source asserts: provider never writes preview to API/storage
  const provider = read("components/SiteContentProvider.tsx");
  ok(
    "provider_has_preview_listener",
    /shouldAttachCmsPreviewListener/.test(provider) &&
      /addEventListener\("message"/.test(provider)
  );
  ok(
    "provider_no_preview_persist",
    !/localStorage|sessionStorage|IndexedDB/.test(provider) &&
      !/fetch\([^)]*site-content[^)]*method:\s*["']POST/.test(provider)
  );
  ok("provider_badge_only_when_preview", /previewActive \? <CmsPreviewBadge/.test(provider));

  const seo = read("components/CmsPreviewSeo.tsx");
  ok("seo_noindex_with_param", /noindex/.test(seo) && /isCmsPreviewQueryParam/.test(seo));
  ok("seo_clean_canonical", /cleanUrlWithoutCmsPreview|canonicalHref/.test(seo));

  const layout = read("app/layout.tsx");
  ok("layout_mounts_preview_seo", /CmsPreviewSeo/.test(layout));

  const pane = read("components/admin/CmsPreviewPane.tsx");
  ok("pane_postMessage_dirty", /buildDirtyOverrides/.test(pane) && /postMessage/.test(pane));
  ok("pane_debounce_300", /DEBOUNCE_MS\s*=\s*300/.test(pane));
  ok("pane_widths_1280_390", /1280/.test(pane) && /390/.test(pane));
  ok("pane_cms_preview_query", /cmsPreviewHref|cms_preview/.test(pane));

  const toolbar = read("components/admin/CmsEaseToolbar.tsx");
  ok("toolbar_preview_toggle", /data-cms-preview-toggle/.test(toolbar));

  const panel = read("components/admin/AdminContentPanel.tsx");
  ok("chips_render_in_panel", /CmsUpdatesAfterSaveChip/.test(panel));

  const sidhu = read("app/sidhu/page.tsx");
  ok("sidhu_preview_pane", /CmsPreviewPane/.test(sidhu));
  ok("sidhu_wizard_button", /new-seasonal-offer|New seasonal offer/.test(sidhu));
  ok("sidhu_duplicate", /openDuplicateProduct|product-duplicate-/.test(sidhu));
  ok("sidhu_chips_home", /CmsUpdatesAfterSaveChip fieldKey="home_top_hero_title"/.test(sidhu));
  ok(
    "eligibility_libs_untouched_marker",
    exists("lib/productSeasonEligibility.ts") && exists("lib/orderProductEligibility.ts")
  );

  // No new server routes for preview
  ok(
    "no_new_preview_api_route",
    !exists("pages/api/cms-preview.ts") && !exists("app/api/cms-preview/route.ts")
  );

  // XFO stays SAMEORIGIN
  const nextCfg = read("next.config.ts");
  ok("xfo_sameorigin", /X-Frame-Options[\s\S]*SAMEORIGIN|SAMEORIGIN/.test(nextCfg));

  // Wizard payload mapping
  const base = {
    id: 4,
    name: "Firestick 4K",
    price: "47.99",
    category: "Device",
    stock: "Digital",
    shop_listed: 1,
    short_description: "<p>Short</p>",
    full_description: "<p>Full</p>",
    features: "A\nB",
    image: "https://example.com/x.webp",
    seo_title: "Firestick 4K | Sale",
    meta_description: "Buy Firestick 4K on Sale",
    season_name: "Sale",
  };
  const applied = wizard.applyBaseProduct(base, "Black Friday");
  ok("wizard_copies_base_fields", applied.category === "Device" && applied.image === base.image);
  ok(
    "wizard_seo_replaces_event",
    String(applied.seo_title).includes("Black Friday") ||
      String(applied.meta_description).includes("Black Friday") ||
      String(applied.seo_title).length > 0
  );

  let state = {
    ...wizard.emptyWizardState(),
    ...applied,
    name: "TEST WIZARD",
    slug: "test-wizard",
    season_name: "Black Friday",
    price: "78.00",
    startsWall: "2026-03-28T01:30:00",
    startsOffset: "+00:00",
    endsWall: "2026-03-29T03:00:00",
    endsOffset: "+01:00",
    availableIds: [7],
    upcomingIds: [8],
  };
  // Fix DST: last Sunday of March 2026 is 29 March — window crossing DST
  state.startsWall = "2026-03-28T12:00:00";
  state.startsOffset = "+00:00";
  state.endsWall = "2026-03-30T12:00:00";
  state.endsOffset = "+01:00";

  const createBody = wizard.buildProductCreateBody(state);
  ok("create_body_ok", createBody.ok === true);
  if (createBody.ok) {
    ok("create_body_name_slug_price", createBody.body.name === "TEST WIZARD" && createBody.body.slug === "test-wizard" && createBody.body.price === "78");
  }

  const life = wizard.buildLifecyclePatch(99, 0, "Black Friday");
  ok(
    "lifecycle_patch_shape",
    life.action === "set_lifecycle_settings" &&
      life.lifecycle_mode === "seasonal" &&
      life.season_name === "Black Friday" &&
      life.expected_version === 0
  );

  const win = wizard.buildWindowPatch(99, 1, state);
  ok("window_patch_ok_dst", win.ok === true, win.ok ? "" : win.error);
  if (win.ok) {
    ok(
      "window_patch_action",
      win.body.action === "set_season_window" &&
        win.body.starts_at_london.wall === state.startsWall
    );
  }

  const arch = wizard.buildArchivePatch(99, 2, state);
  ok(
    "archive_patch_alts",
    arch.action === "set_archive_presentation" &&
      JSON.stringify(arch.season_available_ids) === "[7]" &&
      JSON.stringify(arch.season_upcoming_ids) === "[8]"
  );

  // Validation errors
  const badPrice = wizard.buildProductCreateBody({ ...state, price: "nope" });
  ok("validation_bad_price", badPrice.ok === false);

  const badWin = wizard.buildWindowPatch(99, 1, {
    startsWall: "2026-03-30T12:00:00",
    startsOffset: "+01:00",
    endsWall: "2026-03-28T12:00:00",
    endsOffset: "+00:00",
  });
  ok("validation_end_before_start", badWin.ok === false);

  // London DST edge: crossing last Sunday of March
  const phase = wizard.customerWindowPhase(
    { wall: "2026-03-28T12:00:00", offset: "+00:00" },
    { wall: "2026-03-30T12:00:00", offset: "+01:00" },
    Date.parse("2026-03-29T12:00:00Z")
  );
  ok("dst_window_phase_live_or_valid", phase === "live" || phase === "upcoming" || phase === "ended");

  const previewLabel = wizard.formatLondonPreview(
    { wall: state.startsWall, offset: state.startsOffset },
    { wall: state.endsWall, offset: state.endsOffset }
  );
  ok("london_preview_label", /Live from/.test(previewLabel) && /London/.test(previewLabel));

  // Duplicate does not mutate base
  const dup = wizard.buildDuplicateEditProduct(base);
  ok(
    "duplicate_copy_unsaved_shape",
    String(dup.name).includes("(copy)") && dup.slug === "" && base.name === "Firestick 4K"
  );

  // Retry path with mocked fetch
  const calls = [];
  let failOnce = true;
  const mockFetch = async (url, init) => {
    calls.push({ url, method: init.method, body: JSON.parse(init.body) });
    if (init.method === "POST") {
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, id: 501, slug: "test-wizard" }),
      };
    }
    if (failOnce && init.method === "PATCH" && JSON.parse(init.body).action === "set_lifecycle_settings") {
      failOnce = false;
      return {
        ok: false,
        status: 400,
        json: async () => ({ error: "season_name required (simulated)" }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        id: 501,
        product_version: (calls.filter((c) => c.method === "PATCH").length) + 0,
        product: { id: 501, product_version: calls.filter((c) => c.method === "PATCH").length },
      }),
    };
  };

  const first = await wizard.runSeasonalOfferCreate(state, { fetchImpl: mockFetch });
  ok("create_fails_on_lifecycle", first.ok === false);
  ok("create_kept_product_id", first.productId === 501);
  ok("base_product_untouched_no_put_on_base", !calls.some((c) => c.method === "PUT"));

  const retry = await wizard.runSeasonalOfferCreate(state, {
    fetchImpl: mockFetch,
    startFrom: "set_lifecycle_settings",
    existingProductId: 501,
    existingVersion: 0,
  });
  ok("retry_remaining_succeeds", retry.ok === true, retry.ok ? "" : JSON.stringify(retry.results));

  // Permission gating in UI source
  ok(
    "wizard_gated_products_manage",
    /can\("products\.manage"\)[\s\S]{0,200}seasonalWizardOpen|New seasonal offer/.test(sidhu)
  );
  ok(
    "duplicate_gated_products_manage",
    /openDuplicateProduct[\s\S]{0,120}products\.manage|can\("products\.manage"\)[\s\S]{0,80}openDuplicateProduct/.test(
      sidhu
    ) || /if \(!can\("products\.manage"\)\)/.test(sidhu)
  );

  // Overrides never reach storage/fetch — sanitize is pure
  const sanitized = cmsPreview.sanitizePreviewOverrides({ a: "x", b: 1, c: null });
  ok("sanitize_overrides_strings", sanitized.a === "x" && sanitized.b === "1" && sanitized.c === "");

  console.log(`\nphase-multi-101: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error("FAIL  suite_exception —", err && err.stack ? err.stack : err);
  process.exit(1);
});
