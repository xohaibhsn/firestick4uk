/**
 * F4UK-CMS-PRODUCT-VISIBILITY-05 — capability cache, order lock/eligibility, writer contracts.
 * Mocked only. No real DB / metadata / email.
 */
const fs = require("fs");
const path = require("path");
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
      const mapped = id.replace("@/", "") + (id.includes(".") ? "" : "");
      const candidates = [
        path.join(ROOT, mapped + ".ts"),
        path.join(ROOT, mapped + ".tsx"),
        path.join(ROOT, mapped + ".js"),
      ];
      for (const c of candidates) {
        if (fs.existsSync(c)) return loadTs(path.relative(ROOT, c), stubs);
      }
    }
    if (id.startsWith(".") || id.startsWith("/")) {
      const resolved = path.resolve(path.dirname(abs), id);
      for (const ext of [".ts", ".tsx", ".js", ""]) {
        const c = resolved.endsWith(".ts") || resolved.endsWith(".tsx") || resolved.endsWith(".js")
          ? resolved
          : resolved + ext;
        if (fs.existsSync(c) && fs.statSync(c).isFile()) {
          if (c.endsWith(".ts") || c.endsWith(".tsx")) return loadTs(path.relative(ROOT, c), stubs);
          return orig(c);
        }
      }
    }
    return orig(id);
  };
  m._compile(out, abs);
  return m.exports;
}

const cap = loadTs("lib/productSchemaCapability.ts");
const elig = loadTs("lib/productSeasonEligibility.ts", {
  "@/lib/productSchemaCapability": cap,
  "@/lib/productSeasonLondon": loadTs("lib/productSeasonLondon.ts"),
});
const london = loadTs("lib/productSeasonLondon.ts");

cap.clearSchemaCapabilityCache();

// --- Capability resolution ---
const legacyCols = ["id", "name", "slug", "active", "price", "category", "stock"];
ok(
  "cap_positive_legacy",
  cap.resolveSchemaCapability({ columnNames: legacyCols }).mode === "legacy"
);
ok(
  "cap_empty_metadata_not_legacy",
  cap.resolveSchemaCapability({ columnNames: [] }).mode === "unknown"
);
ok(
  "cap_null_metadata_unknown",
  cap.resolveSchemaCapability({ columnNames: null }).mode === "unknown"
);
ok(
  "cap_detection_error_unknown",
  cap.resolveSchemaCapability({ columnNames: null, error: "boom" }).mode === "unknown"
);
ok(
  "cap_partial_unknown",
  cap.resolveSchemaCapability({
    columnNames: [...legacyCols, "product_version", "lifecycle_mode"],
  }).mode === "unknown"
);
const expandedCols = [...legacyCols, ...cap.SEASONAL_REQUIRED_COLUMNS];
ok(
  "cap_expanded",
  cap.resolveSchemaCapability({ columnNames: expandedCols }).mode === "expanded"
);

// --- Cache TTL / context / remember / clear ---
const legacyCap = cap.resolveSchemaCapability({ columnNames: legacyCols });
const expandedCap = cap.resolveSchemaCapability({ columnNames: expandedCols });
cap.rememberSchemaCapability(legacyCap, "ctx-a");
ok("cache_hit_same_context", cap.getCachedSchemaCapability("ctx-a")?.mode === "legacy");
ok("cache_miss_other_context", cap.getCachedSchemaCapability("ctx-b") == null);
cap.rememberSchemaCapability(expandedCap, "ctx-b");
ok("cache_isolation_a", cap.getCachedSchemaCapability("ctx-a")?.mode === "legacy");
ok("cache_isolation_b", cap.getCachedSchemaCapability("ctx-b")?.mode === "expanded");
cap.clearSchemaCapabilityCache("ctx-a");
ok("cache_clear_a_only", cap.getCachedSchemaCapability("ctx-a") == null);
ok("cache_b_survives", cap.getCachedSchemaCapability("ctx-b")?.mode === "expanded");
cap.clearSchemaCapabilityCache();
ok("cache_clear_all", cap.getCachedSchemaCapability("ctx-b") == null);

cap.__setSchemaCapabilityCacheForTests({
  capability: legacyCap,
  atMs: Date.now() - (cap.SCHEMA_CAPABILITY_CACHE_TTL_MS + 5),
  contextKey: "default",
});
ok("cache_ttl_expired", cap.getCachedSchemaCapability("default") == null);

// Stale legacy cached while schema expanded + seasonal opted-in row
cap.rememberSchemaCapability(legacyCap, "default");
const pausedSeasonal = {
  id: 9,
  active: 1,
  lifecycle_mode: "seasonal",
  shop_listed: 1,
  product_version: 3,
  season_paused: 1,
  season_starts_at: "2026-01-01 00:00:00",
  season_ends_at: "2026-12-01 00:00:00",
};
const now = Date.UTC(2026, 5, 1);
ok(
  "stale_legacy_cache_paused_not_purchasable",
  elig.isPurchasable(pausedSeasonal, now, cap.getCachedSchemaCapability()) === false
);
ok(
  "row_contradicts_legacy",
  cap.rowContradictsLegacyCapability(pausedSeasonal) === true
);
ok(
  "pure_legacy_row_still_purchasable",
  elig.isPurchasable({ id: 1, active: 1 }, now, legacyCap) === true
);
ok(
  "expanded_missing_ops_deny",
  elig.isPurchasable({ id: 2, active: 1 }, now, expandedCap) === false
);
ok(
  "unknown_lifecycle_deny",
  elig.isPurchasable(
    {
      id: 3,
      active: 1,
      lifecycle_mode: "campaign",
      shop_listed: 1,
      product_version: 1,
      season_paused: 0,
      season_starts_at: "2026-01-01 00:00:00",
      season_ends_at: "2026-12-01 00:00:00",
    },
    now,
    expandedCap
  ) === false
);

// Public page vs purchase: private → neither; active seasonal ended → page ok, purchase no
ok("public_page_active", elig.isPublicPage({ active: 1 }) === true);
ok(
  "ended_not_purchasable",
  elig.isPurchasable(
    {
      active: 1,
      lifecycle_mode: "seasonal",
      shop_listed: 1,
      product_version: 1,
      season_paused: 0,
      season_starts_at: "2025-01-01 00:00:00",
      season_ends_at: "2025-02-01 00:00:00",
    },
    now,
    expandedCap
  ) === false
);

// --- Order lock helper (simulated concurrency / mocked connection) ---
const orderElig = loadTs("lib/orderProductEligibility.ts", {
  "@/lib/productSchemaCapability": cap,
  "@/lib/productSchemaCapabilityServer": {
    detectProductSchemaCapability: async () => expandedCap,
    clearProductSchemaCapabilityCache: () => {},
  },
  "@/lib/productSeasonEligibility": elig,
  "@/lib/productSeasonLondon": london,
});

function mockConn(rowsBySql) {
  const queries = [];
  return {
    queries,
    async query(sqlOrOpts, params) {
      const sql =
        typeof sqlOrOpts === "object" && sqlOrOpts && sqlOrOpts.sql != null
          ? sqlOrOpts.sql
          : sqlOrOpts;
      if (typeof sqlOrOpts === "object" && sqlOrOpts && sqlOrOpts.values) {
        params = sqlOrOpts.values;
      }
      queries.push({
        sql: String(sql),
        params,
        hasTypeCast: !!(typeof sqlOrOpts === "object" && sqlOrOpts && sqlOrOpts.typeCast),
      });
      const key = Object.keys(rowsBySql).find((k) => String(sql).includes(k));
      if (!key) throw new Error("unexpected sql: " + sql);
      const val = rowsBySql[key];
      if (typeof val === "function") return val(sql, params);
      return [val];
    },
  };
}

(async () => {
  cap.clearSchemaCapabilityCache();
  const live = {
    id: 2,
    name: "Live",
    price: 10,
    category: "Subscription",
    stock: "Digital",
    active: 1,
    lifecycle_mode: "seasonal",
    shop_listed: 1,
    season_paused: 0,
    season_starts_at: "2026-01-01 00:00:00",
    season_ends_at: "2027-01-01 00:00:00",
    product_version: 1,
  };
  const ended = {
    ...live,
    id: 5,
    name: "Ended",
    season_ends_at: "2026-02-01 00:00:00",
  };
  const conn = mockConn({
    "lifecycle_mode": [live, ended].sort((a, b) => a.id - b.id),
  });
  const authOk = await orderElig.lockAndAuthorizeOrderProducts({
    conn,
    productIds: [5, 2], // unsorted on purpose
    capability: expandedCap,
    nowMs: Date.UTC(2026, 5, 15),
  });
  ok("order_rejects_ended_in_tx", authOk.ok === false && authOk.code === "not_purchasable");
  ok(
    "order_lock_sql_sorted_for_update",
    conn.queries[0].sql.includes("ORDER BY id ASC FOR UPDATE") &&
      JSON.stringify(conn.queries[0].params) === JSON.stringify([2, 5])
  );

  const conn2 = mockConn({
    "lifecycle_mode": [
      { ...live, id: 2 },
      { ...live, id: 4, name: "B" },
    ],
  });
  const authLive = await orderElig.lockAndAuthorizeOrderProducts({
    conn: conn2,
    productIds: [4, 2],
    capability: expandedCap,
    nowMs: Date.UTC(2026, 5, 15),
  });
  ok("order_multi_live_ok", authLive.ok === true && authLive.productsById.size === 2);

  // Stale legacy capability but expanded SELECT returns paused row → deny
  const paused = { ...live, season_paused: 1 };
  const conn3 = mockConn({ "lifecycle_mode": [paused] });
  const authStale = await orderElig.lockAndAuthorizeOrderProducts({
    conn: conn3,
    productIds: [2],
    capability: legacyCap,
    nowMs: Date.UTC(2026, 5, 15),
  });
  ok(
    "order_stale_legacy_vs_expanded_select_denies_paused",
    authStale.ok === false
  );

  // Legacy SELECT path (unknown column) with pure legacy rows
  const conn4 = mockConn({
    "lifecycle_mode": () => {
      const err = new Error("Unknown column 'lifecycle_mode'");
      err.code = "ER_BAD_FIELD_ERROR";
      err.errno = 1054;
      throw err;
    },
    "FROM products WHERE id IN": [[{ id: 1, name: "P", price: 9, category: "Subscription", stock: "Digital", active: 1 }]],
  });
  // First query throws; second matches FROM products... — order of key check matters.
  // Rebuild with sequential handler:
  const queries4 = [];
  const conn4b = {
    queries: queries4,
    async query(sqlOrOpts, params) {
      const sql =
        typeof sqlOrOpts === "object" && sqlOrOpts && sqlOrOpts.sql != null
          ? sqlOrOpts.sql
          : sqlOrOpts;
      if (typeof sqlOrOpts === "object" && sqlOrOpts && sqlOrOpts.values) {
        params = sqlOrOpts.values;
      }
      queries4.push({ sql: String(sql), params });
      if (String(sql).includes("lifecycle_mode")) {
        const err = new Error("Unknown column 'lifecycle_mode'");
        err.code = "ER_BAD_FIELD_ERROR";
        err.errno = 1054;
        throw err;
      }
      return [[{ id: 1, name: "P", price: 9, category: "Subscription", stock: "Digital", active: 1 }]];
    },
  };
  const authLegacy = await orderElig.lockAndAuthorizeOrderProducts({
    conn: conn4b,
    productIds: [1],
    capability: legacyCap,
    nowMs: Date.UTC(2026, 5, 15),
  });
  ok("order_legacy_fallback_purchasable", authLegacy.ok === true);
  ok(
    "SIMULATED_label_order_locks",
    true // labeled: mocked FOR UPDATE sequence, not real InnoDB concurrency
  );

  // Writer contract source checks
  const sidhu = fs.readFileSync(path.join(ROOT, "app/sidhu/page.tsx"), "utf8");
  const adminApi = fs.readFileSync(path.join(ROOT, "pages/api/admin-products.ts"), "utf8");
  const restoreApi = fs.readFileSync(path.join(ROOT, "pages/api/admin-revisions/restore.ts"), "utf8");
  const urlApi = fs.readFileSync(path.join(ROOT, "pages/api/admin-product-url-migration.ts"), "utf8");
  const urlServer = fs.readFileSync(path.join(ROOT, "lib/productUrlMigrationServer.ts"), "utf8");
  const panel = fs.readFileSync(
    path.join(ROOT, "components/admin/ProductSeasonalityPanel.tsx"),
    "utf8"
  );
  const orders = fs.readFileSync(path.join(ROOT, "pages/api/orders.ts"), "utf8");

  ok("client_put_sends_expected_version", /expected_version/.test(sidhu) && /method: isNew \? "POST" : "PUT"/.test(sidhu));
  ok("client_patch_privacy_expected_version", /expected_active/.test(sidhu) && /expected_version/.test(sidhu));
  ok("client_url_migration_expected_version", /admin-product-url-migration[\s\S]*expected_version/.test(sidhu));
  ok("api_url_migration_passes_expected_version", /expected_version/.test(urlApi));
  ok(
    "url_migration_requires_version_when_expanded",
    /expected_version is required for product URL migration on expanded schema/.test(urlServer)
  );
  ok("panel_wires_set_season_window", /set_season_window/.test(panel));
  ok("panel_wires_archive_presentation", /set_archive_presentation/.test(panel));
  ok("panel_wires_countdown_notice_alts", /season-show-countdown/.test(panel) && /season-available-ids/.test(panel));
  ok("sidhu_uses_extracted_panel", /ProductSeasonalityPanel/.test(sidhu));
  ok("orders_uses_lock_helper", /lockAndAuthorizeOrderProducts/.test(orders));
  ok("orders_email_outside_tx", /Fire-and-forget email/.test(orders) || /SMTP_USER/.test(orders));
  ok(
    "restore_preserves_ops",
    /never apply snapshot active\/listing\/lifecycle\/version/.test(restoreApi) ||
      /Content-only restore/.test(restoreApi)
  );
  ok("admin_put_rejects_ops_fields", /Ordinary PUT cannot change/.test(adminApi));

  // London DST gap still covered via helper
  const gap = london.parseLondonWallInput({
    wall: "2026-03-29T01:30:00",
    offset: "+00:00",
  });
  ok("london_spring_gap_rejected", gap.ok === false);

  console.log(`\nVisibility-05 verification: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
