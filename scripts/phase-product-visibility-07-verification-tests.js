/**
 * Task-07 focused regressions — production helpers + labeled evidence types.
 * FUNCTIONAL = executed helpers/handlers; STATIC = source wiring; SIMULATED = mocked TX.
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

console.log("\n=== P1 content draft £65/v3 vs £80/v4 (FUNCTIONAL client contract) ===");
{
  let session = draftClient.openContentDraftSession({
    id: 7,
    name: "Bundle",
    price: 65,
    product_version: 3,
    slug: "bundle",
    category: "Bundle",
  });
  ok("draft_opens_at_v3", session.contentDraftBaseVersion === 3);
  session.editProduct = { ...session.editProduct, price: "£65.00" };

  session = draftClient.applyListRefreshToDraftSession(session, [
    { id: 7, price: 80, product_version: 4, slug: "bundle" },
  ]);
  ok("list_refresh_live_v4", session.liveProductVersion === 4);
  ok("list_refresh_keeps_draft_base_v3", session.contentDraftBaseVersion === 3);

  const body1 = draftClient.buildContentPutBody(session);
  ok("put_sends_expected_v3", body1.expected_version === 3);

  session = draftClient.applyPut409ToDraftSession(session, {
    currentVersion: 4,
    serverProduct: { id: 7, price: 80, product_version: 4 },
  });
  session = draftClient.applyListRefreshToDraftSession(session, [
    { id: 7, price: 80, product_version: 4 },
  ]);
  ok("after_409_base_still_v3", session.contentDraftBaseVersion === 3);
  ok("after_409_conflict_set", !!session.contentConflict);
  ok("save_blocked", draftClient.saveBlockedByConflict(session) === true);
  ok(
    "unchanged_save_still_expected_v3",
    draftClient.buildContentPutBody(session).expected_version === 3
  );

  // Incomplete placeholder must not blank the form (Task-08 contract).
  const incompleteReload = draftClient.resolveConflictReloadServer(session);
  ok(
    "incomplete_placeholder_reload_keeps_draft",
    incompleteReload.contentConflict != null &&
      incompleteReload.editProduct.price === "£65.00"
  );

  // Authoritative complete product read then reload.
  const complete = {
    id: 7,
    name: "Bundle",
    slug: "bundle",
    price: 80,
    product_version: 4,
    category: "Bundle",
  };
  const reloaded = draftClient.resolveConflictReloadFromCompleteProduct(
    session,
    complete,
    { editorSessionId: session.editorSessionId }
  );
  ok("reload_adopts_server_price", !("ok" in reloaded) && reloaded.editProduct.price === "£80.00");
  ok("reload_advances_base_to_v4", !("ok" in reloaded) && reloaded.contentDraftBaseVersion === 4);
  ok("reload_clears_conflict", !("ok" in reloaded) && reloaded.contentConflict == null);
  ok(
    "after_reload_expected_v4",
    !("ok" in reloaded) &&
      draftClient.buildContentPutBody(reloaded).expected_version === 4
  );
}

console.log("\n=== P1 UTC mysql2 trap vs typeCast (FUNCTIONAL) ===");
{
  const utcSql = "2026-07-15 12:00:00";
  const correctMs = london.parseUtcSqlToMs(utcSql);
  ok("string_utc_parses", correctMs === Date.UTC(2026, 6, 15, 12, 0, 0));

  const londonTrap = london.mysql2LocalDateTrapFromUtcSql(utcSql, 60);
  const karachiTrap = london.mysql2LocalDateTrapFromUtcSql(utcSql, 300);
  const brokenLondon = Date.UTC(
    londonTrap.getUTCFullYear(),
    londonTrap.getUTCMonth(),
    londonTrap.getUTCDate(),
    londonTrap.getUTCHours(),
    londonTrap.getUTCMinutes(),
    londonTrap.getUTCSeconds()
  );
  ok("trap_shifts_london_getUTC", brokenLondon !== correctMs);
  ok("date_objects_rejected", london.parseUtcSqlToMs(londonTrap) == null);
  ok("date_objects_rejected_karachi", london.parseUtcSqlToMs(karachiTrap) == null);

  const decoded = seasonalQuery.seasonalDatetimeTypeCast(
    { type: 12, name: "season_starts_at", string: () => utcSql },
    () => new Date("bad")
  );
  ok("typecast_returns_string", decoded === utcSql);
  ok("typecast_then_parse_stable", london.parseUtcSqlToMs(decoded) === correctMs);
  ok(
    "non_seasonal_passthrough",
    seasonalQuery.seasonalDatetimeTypeCast(
      { type: 12, name: "created_at", string: () => utcSql },
      () => "LEGACY_DATE"
    ) === "LEGACY_DATE"
  );
}

console.log("\n=== P1 UTC TZ child processes (FUNCTIONAL) ===");
{
  const childScript = `
    const path = require('path');
    const ts = require('typescript');
    const fs = require('fs');
    const Module = require('module');
    const ROOT = ${JSON.stringify(ROOT)};
    function loadTs(rel, stubs) {
      stubs = stubs || {};
      const abs = path.join(ROOT, rel);
      const out = ts.transpileModule(fs.readFileSync(abs,'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
        fileName: abs,
      }).outputText;
      const m = new Module(abs, module);
      m.filename = abs;
      m.paths = Module._nodeModulePaths(path.dirname(abs));
      const orig = m.require.bind(m);
      m.require = (id) => {
        if (stubs[id]) return stubs[id];
        if (id.startsWith('@/')) {
          const mapped = id.replace('@/','');
          for (const c of [path.join(ROOT, mapped + '.ts'), path.join(ROOT, mapped + '.tsx')]) {
            if (fs.existsSync(c)) return loadTs(path.relative(ROOT, c), stubs);
          }
        }
        return orig(id);
      };
      m._compile(out, abs);
      return m.exports;
    }
    const london = loadTs('lib/productSeasonLondon.ts');
    const cap = loadTs('lib/productSchemaCapability.ts');
    const elig = loadTs('lib/productSeasonEligibility.ts', {
      '@/lib/productSchemaCapability': cap,
      '@/lib/productSeasonLondon': london,
    });
    const start = '2026-07-15 12:00:00';
    const end = '2026-07-15 14:00:00';
    const row = {
      active: 1, lifecycle_mode: 'seasonal', shop_listed: 1, season_paused: 0,
      season_starts_at: start, season_ends_at: end, product_version: 1,
    };
    const capability = { mode: 'expanded', present: [], missing: [], reason: 't' };
    const atStart = london.parseUtcSqlToMs(start);
    const before = atStart - 1000;
    const atEnd = london.parseUtcSqlToMs(end);
    console.log(JSON.stringify({
      tz: process.env.TZ || 'unset',
      atStart, atEnd,
      buyBefore: elig.isPurchasable(row, before, capability),
      buyAt: elig.isPurchasable(row, atStart, capability),
      buyEnd: elig.isPurchasable(row, atEnd, capability),
    }));
  `;
  const results = [];
  for (const tz of ["UTC", "Europe/London", "Asia/Karachi"]) {
    const r = spawnSync(process.execPath, ["-e", childScript], {
      env: { ...process.env, TZ: tz },
      encoding: "utf8",
    });
    const line = (r.stdout || "").trim().split(/\r?\n/).filter(Boolean).pop();
    let parsed = null;
    try {
      parsed = JSON.parse(line);
    } catch {
      parsed = null;
    }
    results.push({ tz, parsed, status: r.status });
  }
  ok(
    "tz_children_ok",
    results.every((r) => r.status === 0 && r.parsed),
    JSON.stringify(results.map((r) => ({ tz: r.tz, status: r.status })))
  );
  if (results.every((r) => r.parsed)) {
    const a = results[0].parsed;
    ok(
      "tz_boundaries_identical",
      results.every(
        (r) =>
          r.parsed.atStart === a.atStart &&
          r.parsed.atEnd === a.atEnd &&
          r.parsed.buyBefore === false &&
          r.parsed.buyAt === true &&
          r.parsed.buyEnd === false
      )
    );
  } else {
    ok("tz_boundaries_identical", false);
  }
}

console.log("\n=== P2 capability WeakMap identity (FUNCTIONAL) ===");
(async () => {
  cap.clearSchemaCapabilityCache();
  let queriesA = 0;
  let queriesB = 0;
  const seasonalCols = cap.SEASONAL_REQUIRED_COLUMNS.map((name) => ({ name }));
  const dbA = {
    query: async () => {
      queriesA += 1;
      return [
        [{ name: "id" }, { name: "name" }, { name: "active" }, { name: "price" }, ...seasonalCols],
      ];
    },
  };
  const dbB = {
    query: async () => {
      queriesB += 1;
      return [[{ name: "id" }, { name: "name" }, { name: "active" }, { name: "price" }]];
    },
  };
  const a1 = await capServer.detectProductSchemaCapability(dbA, {
    schemaName: "same_schema_name",
  });
  const b1 = await capServer.detectProductSchemaCapability(dbB, {
    schemaName: "same_schema_name",
  });
  ok("adapter_a_expanded", a1.mode === "expanded");
  ok("adapter_b_legacy_not_poisoned", b1.mode === "legacy");
  ok("adapter_b_was_queried", queriesB === 1);
  const a2 = await capServer.detectProductSchemaCapability(dbA, {
    schemaName: "same_schema_name",
  });
  ok("same_adapter_cache_hit", a2.mode === "expanded" && queriesA === 1);
  ok(
    "opaque_identities_differ",
    capServer.capabilityAdapterIdentity(dbA) !== capServer.capabilityAdapterIdentity(dbB)
  );

  console.log("\n=== P2 hub publication (FUNCTIONAL + STATIC) ===");
  {
    const capExpanded = { mode: "expanded", present: [], missing: [], reason: "t" };
    const now = Date.UTC(2026, 6, 15, 12, 0, 0);
    ok(
      "empty_hub_rejected",
      hub.canPublishSeasonalHub({ rows: [], nowMs: now, capability: capExpanded }).ok === false
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
      "nonempty_hub_allowed",
      hub.canPublishSeasonalHub({ rows: [liveRow], nowMs: now, capability: capExpanded }).ok ===
        true
    );
    const siteContentSrc = fs.readFileSync(path.join(ROOT, "pages/api/site-content.ts"), "utf8");
    const restoreSrc = fs.readFileSync(
      path.join(ROOT, "pages/api/admin-revisions/restore.ts"),
      "utf8"
    );
    ok("site_content_calls_validate", /validateSeasonalHubPublicationWrite/.test(siteContentSrc));
    ok("restore_calls_validate", /validateSeasonalHubPublicationWrite/.test(restoreSrc));
    ok(
      "settings_key_registered",
      /seasonal_hub_published/.test(
        fs.readFileSync(path.join(ROOT, "lib/adminPermissions.ts"), "utf8")
      )
    );
    ok(
      "sitemap_include_flag",
      /includeSeasonalHub/.test(fs.readFileSync(path.join(ROOT, "app/sitemap.ts"), "utf8"))
    );
  }

  console.log("\n=== P1 restore binding + P2 countdown (STATIC production source) ===");
  {
    const hist = fs.readFileSync(
      path.join(ROOT, "components/admin/ContentHistoryPanel.tsx"),
      "utf8"
    );
    ok("restore_fetches_admin_products", /\/api\/admin-products/.test(hist));
    ok("restore_binds_revision", /boundRestoreVersion/.test(hist) && /revisionId/.test(hist));
    ok("restore_409_reconfirms", /Stale version|reconfirm/i.test(hist));
    const detail = fs.readFileSync(
      path.join(ROOT, "app/products/[slug]/ProductDetail.tsx"),
      "utf8"
    );
    const cd = fs.readFileSync(
      path.join(ROOT, "components/product/SeasonalCountdown.tsx"),
      "utf8"
    );
    ok("countdown_onBoundary", /onBoundary/.test(cd));
    ok(
      "detail_revalidate",
      /runBoundaryRevalidation|handleBoundary|revalidatePurchaseState/.test(detail)
    );
    ok("detail_router_refresh", /router\.refresh/.test(detail));
  }

  console.log("\n=== Seasonal UTC query path (STATIC production) ===");
  {
    for (const [label, rel] of [
      ["writer", "lib/productWriterTx.ts"],
      ["seasonServer", "lib/productSeasonServer.ts"],
      ["orders", "lib/orderProductEligibility.ts"],
      ["publicList", "lib/publicProductsServer.ts"],
      ["adminApi", "pages/api/admin-products.ts"],
      ["productsApi", "pages/api/products.ts"],
      ["searchApi", "pages/api/search.ts"],
      ["detailPage", "app/products/[slug]/page.tsx"],
      ["alts", "lib/productSeasonAlternativesServer.ts"],
      ["restore", "pages/api/admin-revisions/restore.ts"],
    ]) {
      const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
      ok(`queryWithSeasonalUtc_${label}`, /queryWithSeasonalUtc/.test(src));
    }
  }

  console.log(`\nVisibility-07 verification: ${passed} passed, ${failed} failed`);
  console.log("Runtime:", process.version);
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
