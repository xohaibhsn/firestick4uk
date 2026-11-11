/**
 * F4UK-CMS-PRODUCT-VISIBILITY-08 — integration corrections.
 * FUNCTIONAL = executed production helpers/handlers with mocked deps.
 * SIMULATED = interleaving of Sidhu/panel callbacks using real draft client.
 * STATIC = source wiring presence (cannot close findings alone).
 * No real DB / CMS / orders / Hostinger.
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const ts = require("typescript");
const Module = require("module");

const ROOT = path.join(__dirname, "..");
let passed = 0;
let failed = 0;
function ok(name, cond, detail) {
  if (cond) {
    console.log("PASS ", name);
    passed++;
  } else {
    console.log("FAIL ", name, detail || "");
    failed++;
  }
}

function loadTs(rel, stubs = {}) {
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
    if (stubs[id]) return stubs[id];
    if (id.startsWith("@/")) {
      const mapped = id.replace("@/", "");
      for (const c of [path.join(ROOT, mapped + ".ts"), path.join(ROOT, mapped + ".tsx")]) {
        if (fs.existsSync(c)) return loadTs(path.relative(ROOT, c), stubs);
      }
    }
    return orig(id);
  };
  m._compile(out, abs);
  return m.exports;
}

const draftClient = loadTs("lib/productContentDraftClient.ts");
const london = loadTs("lib/productSeasonLondon.ts");
const seasonalQuery = loadTs("lib/productSeasonalQuery.ts");
const boundary = loadTs("lib/productSeasonBoundaryClient.ts");
const cap = loadTs("lib/productSchemaCapability.ts");
const elig = loadTs("lib/productSeasonEligibility.ts", {
  "@/lib/productSchemaCapability": cap,
  "@/lib/productSeasonLondon": london,
});
const fakePool = { query: async () => [[]] };
const capServer = loadTs("lib/productSchemaCapabilityServer.ts", {
  "@/lib/db": fakePool,
  "@/lib/productSchemaCapability": cap,
});
const hub = loadTs("lib/seasonalHubPublic.ts", {
  "@/lib/db": fakePool,
  "@/lib/productSeasonEligibility": elig,
  "@/lib/productSchemaCapability": cap,
  "@/lib/productSchemaCapabilityServer": capServer,
  "@/lib/productSeasonLondon": london,
  "@/lib/productSeasonalQuery": seasonalQuery,
});

/** Sidhu parent callback contract (mirrors production wiring). SIMULATED interleaving. */
function sidhuApplyPanelSuccess(session, row, meta) {
  return draftClient.applyOwnContentPreservingActionResult(session, {
    editorSessionId: session.editorSessionId,
    productId: meta.productId,
    actionStartedAtVersion: meta.actionStartedAtVersion,
    nextVersion: meta.nextVersion,
    noop: meta.noop,
    clearConflict: false,
  });
}

function sidhuApplyVersionOnly(session, version) {
  return draftClient.applyLiveVersionOnly(session, version);
}

console.log("\n=== P1 queryWithSeasonalUtc — single options query, no silent retry (FUNCTIONAL) ===");
(async () => {
  const injections = [
    { label: "connection", err: Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }) },
    { label: "lock_timeout", err: Object.assign(new Error("Lock wait timeout"), { code: "ER_LOCK_WAIT_TIMEOUT", errno: 1205 }) },
    { label: "deadlock", err: Object.assign(new Error("Deadlock"), { code: "ER_LOCK_DEADLOCK", errno: 1213 }) },
    { label: "syntax", err: Object.assign(new Error("You have an error in your SQL syntax"), { code: "ER_PARSE_ERROR", errno: 1064 }) },
  ];

  for (const inj of injections) {
    let calls = 0;
    const shapes = [];
    const db = {
      query: async function (options) {
        calls += 1;
        shapes.push(typeof options === "object" && options && options.sql != null ? "options" : "string");
        if (typeof options !== "object" || !options.typeCast) {
          throw new Error("mock must receive options with typeCast — string-only not supported");
        }
        throw inj.err;
      },
    };
    let caught = null;
    try {
      await seasonalQuery.queryWithSeasonalUtc(db, "SELECT 1", []);
    } catch (e) {
      caught = e;
    }
    ok(`utc_one_call_${inj.label}`, calls === 1, `calls=${calls}`);
    ok(`utc_options_shape_${inj.label}`, shapes[0] === "options");
    ok(
      `utc_propagates_${inj.label}`,
      caught === inj.err || (caught && caught.code === inj.err.code),
      caught && caught.code
    );
  }

  // Healthy decode path with options-shaped mock
  {
    let calls = 0;
    const db = {
      query: async function (options) {
        calls += 1;
        ok("healthy_has_typeCast", typeof options.typeCast === "function");
        const field = {
          type: 12,
          name: "season_starts_at",
          string: () => "2026-07-15 12:00:00",
        };
        const decoded = options.typeCast(field, () => new Date("bad"));
        return [[{ season_starts_at: decoded, created_at: new Date("2020-01-01T00:00:00Z") }], []];
      },
    };
    const [rows] = await seasonalQuery.queryWithSeasonalUtc(
      db,
      "SELECT season_starts_at, created_at FROM products"
    );
    ok("healthy_one_call", calls === 1);
    ok("healthy_utc_string", rows[0].season_starts_at === "2026-07-15 12:00:00");
    ok(
      "healthy_parse",
      london.parseUtcSqlToMs(rows[0].season_starts_at) === Date.UTC(2026, 6, 15, 12, 0, 0)
    );
  }

  // Caller rollback/failure retained (SIMULATED writer path)
  {
    let rolledBack = false;
    let commits = 0;
    const db = {
      query: async function () {
        throw Object.assign(new Error("deadlock"), { code: "ER_LOCK_DEADLOCK" });
      },
    };
    try {
      await seasonalQuery.queryWithSeasonalUtc(db, "SELECT * FROM products WHERE id=? FOR UPDATE", [1]);
      commits += 1;
    } catch {
      rolledBack = true;
    }
    ok("caller_rollback_on_wrapper_error", rolledBack && commits === 0);
  }

  // STATIC: no catch-retry in production wrapper
  {
    const src = fs.readFileSync(path.join(ROOT, "lib/productSeasonalQuery.ts"), "utf8");
    ok("static_no_catch_retry", !/catch\s*\([^)]*\)\s*\{[\s\S]*?\.query\s*\(\s*sql/m.test(src));
    ok("static_single_options_return", /return q\.call\(db,\s*\{[\s\S]*typeCast/.test(src));
  }

  console.log("\n=== P1 Sidhu draft base + reload (SIMULATED production callbacks) ===");
  {
    // BEFORE reproduction (Task-07 failure model): unqualified onVersionUpdate advances draft base
    let broken = draftClient.openContentDraftSession({
      id: 7,
      name: "Bundle",
      slug: "bundle",
      price: 65,
      product_version: 3,
      category: "Bundle",
    });
    broken.editProduct = { ...broken.editProduct, price: "£65.00" };
    // List refresh after Pause 409 → live v4
    broken = draftClient.applyListRefreshToDraftSession(broken, [
      { id: 7, price: 80, product_version: 4, slug: "bundle", name: "Bundle" },
    ]);
    // Successful Pause at v4 → v5
    // BROKEN: advance draft base from unqualified version update (Task-07 bug)
    const brokenAfter = {
      ...broken,
      contentDraftBaseVersion: 5,
      liveProductVersion: 5,
    };
    const brokenPut = draftClient.buildContentPutBody(brokenAfter);
    ok(
      "before_pause_advances_base_would_overwrite",
      brokenPut.expected_version === 5 && String(brokenPut.price).startsWith("65"),
      `documents Task-07 overwrite risk price=${brokenPut.price}`
    );

    // AFTER: correct Sidhu wiring
    let session = draftClient.openContentDraftSession({
      id: 7,
      name: "Bundle",
      slug: "bundle",
      price: 65,
      product_version: 3,
      category: "Bundle",
    });
    session.editProduct = { ...session.editProduct, price: "£65.00" };

    // Direct Save 409
    session = draftClient.applyPut409ToDraftSession(session, {
      currentVersion: 4,
      serverProduct: null, // actual PUT 409 has current_version only
    });
    ok("after_409_incomplete_placeholder", session.contentConflict?.incompleteServerRow === true);
    ok("after_409_base_still_3", session.contentDraftBaseVersion === 3);
    ok("after_409_live_4", session.liveProductVersion === 4);

    // Reload from placeholder must NOT blank form
    const badReload = draftClient.resolveConflictReloadFromCompleteProduct(
      session,
      session.contentConflict.server
    );
    ok("placeholder_reload_rejected", badReload.ok === false && badReload.error === "incomplete_product_row");
    ok("placeholder_keeps_draft_price", session.editProduct.price === "£65.00");
    ok("placeholder_keeps_conflict", !!session.contentConflict);

    // Authoritative complete read then reload
    const complete = {
      id: 7,
      name: "Bundle",
      slug: "bundle",
      price: 80,
      product_version: 4,
      category: "Bundle",
      stock: "Digital",
      short_description: "Live",
      full_description: "",
      features: "",
      seo_title: "",
      meta_description: "",
      focus_keyword: "",
      og_image: "",
    };
    const reloaded = draftClient.resolveConflictReloadFromCompleteProduct(session, complete, {
      editorSessionId: session.editorSessionId,
    });
    ok("reload_complete_ok", !("ok" in reloaded));
    ok("reload_shows_80", reloaded.editProduct.price === "£80.00");
    ok("reload_shows_name", reloaded.editProduct.name === "Bundle");
    ok("reload_base_4", reloaded.contentDraftBaseVersion === 4);

    // Pause 409 → refresh → successful Pause → Save cannot overwrite £80
    session = draftClient.openContentDraftSession({
      id: 7,
      name: "Bundle",
      slug: "bundle",
      price: 65,
      product_version: 3,
      category: "Bundle",
    });
    session.editProduct = { ...session.editProduct, price: "£65.00" };
    session = draftClient.applyPut409ToDraftSession(session, {
      currentVersion: 4,
      serverProduct: { id: 7, price: 80, product_version: 4, name: "Bundle", slug: "bundle" },
    });
    // Panel refresh loads live v4 into productModal; draft base stays 3
    session = draftClient.applyListRefreshToDraftSession(session, [
      { id: 7, price: 80, product_version: 4, slug: "bundle", name: "Bundle" },
    ]);
    // Successful Pause using expected_version 4 → v5
    session = sidhuApplyPanelSuccess(
      session,
      { id: 7, product_version: 5, season_paused: 1 },
      { productId: 7, actionStartedAtVersion: 4, nextVersion: 5, noop: false }
    );
    session = sidhuApplyVersionOnly(session, 5);
    ok("pause_success_live_5", session.liveProductVersion === 5);
    ok("pause_does_not_advance_stale_draft_base", session.contentDraftBaseVersion === 3);
    ok("pause_keeps_content_conflict", !!session.contentConflict);
    const putAfterPause = draftClient.buildContentPutBody(session);
    ok("save_still_expected_v3", putAfterPause.expected_version === 3);
    ok(
      "save_still_price_65",
      String(putAfterPause.price).startsWith("65"),
      String(putAfterPause.price)
    );

    // Operational no-op while content draft stale
    session = sidhuApplyPanelSuccess(
      session,
      { id: 7, product_version: 5 },
      { productId: 7, actionStartedAtVersion: 5, nextVersion: 5, noop: true }
    );
    ok("noop_keeps_draft_base_3", session.contentDraftBaseVersion === 3);

    // Legitimate own Pause matching base → valid subsequent content Save
    let own = draftClient.openContentDraftSession({
      id: 7,
      name: "Bundle",
      slug: "bundle",
      price: 65,
      product_version: 3,
      category: "Bundle",
    });
    own.editProduct = { ...own.editProduct, price: "£65.00" };
    own = sidhuApplyPanelSuccess(
      own,
      { id: 7, product_version: 4, season_paused: 1 },
      { productId: 7, actionStartedAtVersion: 3, nextVersion: 4, noop: false }
    );
    ok("own_pause_advances_matching_base", own.contentDraftBaseVersion === 4);
    const ownPut = draftClient.buildContentPutBody(own);
    ok(
      "own_pause_then_save_expected_4",
      ownPut.expected_version === 4 && String(ownPut.price).startsWith("65"),
      JSON.stringify({ v: ownPut.expected_version, p: ownPut.price })
    );

    // Product A response after opening Product B
    let a = draftClient.openContentDraftSession({
      id: 1,
      name: "A",
      slug: "a",
      price: 10,
      product_version: 1,
      category: "Subscription",
    });
    const aSessionId = a.editorSessionId;
    let b = draftClient.openContentDraftSession({
      id: 2,
      name: "B",
      slug: "b",
      price: 20,
      product_version: 9,
      category: "Subscription",
    });
    const late = draftClient.applyOwnContentPreservingActionResult(b, {
      editorSessionId: aSessionId,
      productId: 1,
      actionStartedAtVersion: 1,
      nextVersion: 2,
      noop: false,
    });
    ok("late_product_a_ignored_on_b", late.contentDraftBaseVersion === 9 && late.productId === 2);

    // Failed reload retains recoverable draft/conflict
    session = draftClient.openContentDraftSession({
      id: 7,
      name: "Bundle",
      slug: "bundle",
      price: 65,
      product_version: 3,
      category: "Bundle",
    });
    session.editProduct = { ...session.editProduct, price: "£65.00" };
    session = draftClient.applyPut409ToDraftSession(session, { currentVersion: 4 });
    const fail401 = draftClient.resolveConflictReloadFromCompleteProduct(session, {
      id: 7,
      product_version: 4,
    });
    ok("failed_reload_incomplete", fail401.ok === false);
    ok("failed_reload_keeps_base", session.contentDraftBaseVersion === 3);
    ok("failed_reload_keeps_conflict", !!session.contentConflict);
    ok("failed_reload_keeps_price", session.editProduct.price === "£65.00");

    // Zero price preserved
    const zero = draftClient.productRowToEditDraft({
      id: 9,
      name: "Free",
      slug: "free",
      price: 0,
      category: "Subscription",
    });
    ok("zero_price_preserved", zero.price === "£0.00");
  }

  // STATIC: Sidhu wires draft client
  {
    const sidhu = fs.readFileSync(path.join(ROOT, "app/sidhu/page.tsx"), "utf8");
    ok("static_sidhu_imports_draft_client", /productContentDraftClient/.test(sidhu));
    ok("static_sidhu_resolve_complete", /resolveConflictReloadFromCompleteProduct/.test(sidhu));
    ok("static_sidhu_own_action", /applyOwnContentPreservingActionResult/.test(sidhu));
    ok("static_sidhu_live_only", /applyLiveVersionOnly/.test(sidhu));
    ok("static_sidhu_no_unqualified_base_bump", !/setContentDraftBaseVersion\(Number\(version\)\)/.test(sidhu));
    ok("static_sidhu_authorized_reload_fetch", /resolveContentConflictReload[\s\S]*\/api\/admin-products/.test(sidhu));
  }

  console.log("\n=== P2 purchase boundary immediate disable + dedupe (FUNCTIONAL) ===");
  {
    const state = boundary.createBoundaryCoordinator();
    let immediate = 0;
    let refreshCalls = 0;
    let resolveRefresh;
    const refreshPromise = new Promise((r) => {
      resolveRefresh = r;
    });

    const key = boundary.makeBoundaryKey({ productId: 42, kind: "end", targetMs: 1000 });
    const p1 = boundary.runBoundaryRevalidation({
      state,
      key,
      productId: 42,
      slug: "winter",
      onImmediateBlock: () => {
        immediate += 1;
        state.purchaseBlocked = true;
      },
      refresh: async () => {
        refreshCalls += 1;
        return refreshPromise;
      },
    });
    ok("immediate_block_before_await", immediate === 1 && state.purchaseBlocked === true);

    const p2 = boundary.runBoundaryRevalidation({
      state,
      key,
      productId: 42,
      slug: "winter",
      onImmediateBlock: () => {
        immediate += 1;
      },
      refresh: async () => {
        refreshCalls += 1;
        return refreshPromise;
      },
    });
    resolveRefresh({ id: 42, purchasable: false, season_phase: "ended" });
    const [o1, o2] = await Promise.all([p1, p2]);
    ok("one_refresh_for_boundary", refreshCalls === 1);
    ok("second_is_duplicate", o2.duplicate === true);
    ok("first_started", o1.started === true);

    // Per-boundary retry — new window not poisoned
    const key2 = boundary.makeBoundaryKey({ productId: 42, kind: "start", targetMs: 2000 });
    let nextCalls = 0;
    const o3 = await boundary.runBoundaryRevalidation({
      state,
      key: key2,
      productId: 42,
      slug: "winter",
      onImmediateBlock: () => {},
      refresh: async () => {
        nextCalls += 1;
        return { id: 42, purchasable: true, season_phase: "live" };
      },
    });
    ok("new_window_not_blocked_by_old_counter", o3.started === true && nextCalls === 1);

    // Late response from other slug ignored by clear helper
    boundary.clearPurchaseBlockAfterAuthoritativeOk(state, {
      productId: 99,
      slug: "other",
      purchasable: true,
    });
    ok("stale_slug_ignored", state.purchaseBlocked === true || state.activeSlug === "winter");

    boundary.clearPurchaseBlockAfterAuthoritativeOk(state, {
      productId: 42,
      slug: "winter",
      purchasable: true,
    });
    ok("authoritative_ok_clears_block", state.purchaseBlocked === false);

    const detail = fs.readFileSync(path.join(ROOT, "app/products/[slug]/ProductDetail.tsx"), "utf8");
    ok("static_detail_uses_coordinator", /runBoundaryRevalidation/.test(detail));
    ok("static_detail_gates_cta", /purchaseBlockedLocal/.test(detail) && /!revalidating/.test(detail));
    const cd = fs.readFileSync(path.join(ROOT, "components/product/SeasonalCountdown.tsx"), "utf8");
    ok("static_countdown_onBoundary", /onBoundary/.test(cd));
  }

  console.log("\n=== P2 hub outage ≠ knownEmpty (FUNCTIONAL resolver + validation) ===");
  {
    const capExpanded = { mode: "expanded", present: [], missing: [], reason: "t" };
    const now = Date.UTC(2026, 6, 15, 12, 0, 0);

    // BEFORE model: catch → [] looked like knownEmpty when published
    // AFTER: typed failure
    const failingDb = {
      query: async () => {
        throw Object.assign(new Error("read boom"), { code: "ER_ACCESS_DENIED_ERROR" });
      },
    };
    // Hub flag read succeeds as published
    let qn = 0;
    const publishedThenFailProducts = {
      query: async (sqlOrOpts) => {
        qn += 1;
        const sql = typeof sqlOrOpts === "object" ? sqlOrOpts.sql : sqlOrOpts;
        if (/site_content/.test(String(sql))) {
          return [[{ content_value: "1" }]];
        }
        // options-shaped product query fails
        throw Object.assign(new Error("products read failed"), { code: "ECONNRESET" });
      },
    };
    const state = await hub.resolveSeasonalHubPublicState(publishedThenFailProducts, {
      nowMs: now,
      capability: capExpanded,
    });
    ok("outage_temporarilyUnavailable", state.temporarilyUnavailable === true);
    ok("outage_not_knownEmpty", state.knownEmpty === false);
    ok("outage_not_effectivelyPublic", state.effectivelyPublic === false);
    ok("outage_preserves_stored_published", state.storedPublished === true);

    // Successful empty → knownEmpty when published
    const emptyOk = {
      query: async (sqlOrOpts) => {
        const sql = typeof sqlOrOpts === "object" ? sqlOrOpts.sql : sqlOrOpts;
        if (/site_content/.test(String(sql))) return [[{ content_value: "1" }]];
        return [[], []];
      },
    };
    const emptyState = await hub.resolveSeasonalHubPublicState(emptyOk, {
      nowMs: now,
      capability: capExpanded,
    });
    ok("empty_success_knownEmpty", emptyState.knownEmpty === true);
    ok("empty_success_not_unavailable", emptyState.temporarilyUnavailable === false);

    // Validation: unavailable vs empty
    const valFail = await hub.validateSeasonalHubPublicationWrite({
      db: failingDb,
      nextValue: "1",
      nowMs: now,
    });
    // failingDb fails capability detect OR product load — either is unavailable/not empty wording
    ok(
      "validate_unavailable_not_empty",
      valFail.ok === false &&
        (valFail.status === 503 || /unavailable|expanded/i.test(String(valFail.error))) &&
        !/empty seasonal hub/i.test(String(valFail.error))
    );

    cap.clearSchemaCapabilityCache();
    const seasonalCols = cap.SEASONAL_REQUIRED_COLUMNS.map((name) => ({ name }));
    const prevDbName = process.env.DB_NAME;
    process.env.DB_NAME = "dummy_visibility_08";
    let valEmpty;
    try {
      valEmpty = await hub.validateSeasonalHubPublicationWrite({
        db: {
          query: async (sqlOrOpts) => {
            const sql = typeof sqlOrOpts === "object" ? sqlOrOpts.sql : sqlOrOpts;
            if (/information_schema\.COLUMNS/i.test(String(sql))) {
              return [
                [
                  { name: "id" },
                  { name: "name" },
                  { name: "active" },
                  { name: "price" },
                  ...seasonalCols,
                ],
              ];
            }
            // Successful product read returning no seasonal rows
            return [[], []];
          },
        },
        nextValue: "1",
        nowMs: now,
      });
    } finally {
      if (prevDbName == null) delete process.env.DB_NAME;
      else process.env.DB_NAME = prevDbName;
    }
    ok(
      "validate_empty_rejected",
      valEmpty.ok === false && /empty/i.test(String(valEmpty.error)),
      JSON.stringify(valEmpty)
    );

    const liveRow = {
      id: 1,
      active: 1,
      lifecycle_mode: "seasonal",
      shop_listed: 1,
      season_paused: 0,
      season_starts_at: "2026-07-01 00:00:00",
      season_ends_at: "2026-08-01 00:00:00",
      product_version: 1,
    };
    ok(
      "publish_valid_allowed",
      hub.canPublishSeasonalHub({ rows: [liveRow], nowMs: now, capability: capExpanded }).ok === true
    );

    const siteContentSrc = fs.readFileSync(path.join(ROOT, "pages/api/site-content.ts"), "utf8");
    const restoreSrc = fs.readFileSync(
      path.join(ROOT, "pages/api/admin-revisions/restore.ts"),
      "utf8"
    );
    ok("site_content_calls_validate", /validateSeasonalHubPublicationWrite/.test(siteContentSrc));
    ok("restore_calls_validate", /validateSeasonalHubPublicationWrite/.test(restoreSrc));
  }

  console.log("\n=== Preserve Task-07 contracts (STATIC smoke) ===");
  {
    for (const [label, rel] of [
      ["writer", "lib/productWriterTx.ts"],
      ["adminApi", "pages/api/admin-products.ts"],
      ["ordersElig", "lib/orderProductEligibility.ts"],
      ["hub", "lib/seasonalHubPublic.ts"],
      ["draft", "lib/productContentDraftClient.ts"],
      ["boundary", "lib/productSeasonBoundaryClient.ts"],
    ]) {
      ok(`exists_${label}`, fs.existsSync(path.join(ROOT, rel)));
    }
    const hist = fs.readFileSync(
      path.join(ROOT, "components/admin/ContentHistoryPanel.tsx"),
      "utf8"
    );
    ok("restore_binds_revision", /boundRestoreVersion/.test(hist));
  }

  console.log(`\nVisibility-08 verification: ${passed} passed, ${failed} failed`);
  console.log("Runtime:", process.version);
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
