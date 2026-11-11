/**
 * F4UK-CMS-PRODUCT-VISIBILITY-06 — defect reproductions + corrected outcomes.
 * Mocked only. No real DB/metadata/email.
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

const london = loadTs("lib/productSeasonLondon.ts");
const cap = loadTs("lib/productSchemaCapability.ts");
const elig = loadTs("lib/productSeasonEligibility.ts", {
  "@/lib/productSchemaCapability": cap,
  "@/lib/productSeasonLondon": london,
});
const writer = loadTs("lib/productWriterTx.ts", {
  "@/lib/productSeasonActions": loadTs("lib/productSeasonActions.ts", {
    "@/lib/productSeasonLondon": london,
    "@/lib/productSeasonEligibility": elig,
  }),
  "@/lib/productSeasonLondon": london,
});

// --- UTC contract ---
ok(
  "utc_iso_plus01_honors_offset",
  london.parseUtcSqlToMs("2026-07-01T12:00:00+01:00") === Date.UTC(2026, 6, 1, 11, 0, 0)
);
ok("utc_feb30_rejected", london.parseUtcSqlToMs("2026-02-30 12:00:00") == null);
ok(
  "utc_sql_roundtrip",
  london.parseUtcSqlToMs("2026-11-08 12:00:00") === Date.UTC(2026, 10, 8, 12, 0, 0)
);
ok(
  "london_feb30_wall_rejected",
  london.parseLondonWallInput({ wall: "2026-02-30T12:00:00", offset: "+00:00" }).ok === false
);
const summer = london.parseLondonWallInput({ wall: "2026-07-01T12:00:00", offset: "+01:00" });
ok("london_summer_ok", summer.ok === true && summer.utcMs === Date.UTC(2026, 6, 1, 11, 0, 0));
const junk = london.parseUtcSqlToMs("2026-01-01 00:00:00 trailing");
ok("utc_trailing_junk_rejected", junk == null);

// Date objects are ambiguous under process TZ — reject; use queryWithSeasonalUtc strings.
const localTrap = new Date(Date.UTC(2026, 5, 15, 12, 0, 0));
ok("date_object_rejected_use_typecast_strings", london.parseUtcSqlToMs(localTrap) == null);

// --- Capability empty / adapter context ---
ok(
  "empty_metadata_unknown",
  cap.resolveSchemaCapability({ columnNames: [] }).mode === "unknown"
);
const capServer = loadTs("lib/productSchemaCapabilityServer.ts", {
  "@/lib/db": { query: async () => { throw new Error("no real db"); } },
  "@/lib/productSchemaCapability": cap,
});
cap.clearSchemaCapabilityCache();
(async () => {
  const dbA = {
    __capabilityPoolId: "pool-a",
    query: async () => [[{ name: "id" }, { name: "name" }, { name: "active" }, { name: "price" }]],
  };
  const dbB = {
    __capabilityPoolId: "pool-b",
    query: async () => [
      [
        { name: "id" },
        { name: "name" },
        { name: "active" },
        { name: "price" },
        ...cap.SEASONAL_REQUIRED_COLUMNS.map((c) => ({ name: c })),
      ],
    ],
  };
  process.env.DB_NAME = "schema_a";
  const a = await capServer.detectProductSchemaCapability(dbA, { schemaName: "schema_a" });
  process.env.DB_NAME = "schema_b";
  const b = await capServer.detectProductSchemaCapability(dbB, { schemaName: "schema_b" });
  ok("adapter_isolation_legacy_vs_expanded", a.mode === "legacy" && b.mode === "expanded");
  const a2 = await capServer.detectProductSchemaCapability(dbA, { schemaName: "schema_a" });
  ok("adapter_cache_hit_same_context", a2.mode === "legacy" && a2.reason === a.reason);

  // Order eligibility must not manufacture expanded from subset SELECT when detect stays unknown
  const orderElig = loadTs("lib/orderProductEligibility.ts", {
    "@/lib/productSchemaCapability": cap,
    "@/lib/productSchemaCapabilityServer": {
      detectProductSchemaCapability: async () =>
        cap.resolveSchemaCapability({
          columnNames: ["id", "name", "active", "price", "product_version", "lifecycle_mode"],
        }),
    },
    "@/lib/productSeasonEligibility": elig,
    "@/lib/productSeasonLondon": london,
  });
  const unknownCap = cap.resolveSchemaCapability({
    columnNames: ["id", "name", "active", "price", "product_version", "lifecycle_mode"],
  });
  ok("partial_is_unknown", unknownCap.mode === "unknown");
  const conn = {
    async query(sqlOrOpts) {
      const sql = typeof sqlOrOpts === "object" && sqlOrOpts?.sql != null ? sqlOrOpts.sql : sqlOrOpts;
      if (String(sql).includes("lifecycle_mode")) {
        return [
          [
            {
              id: 1,
              name: "X",
              price: 1,
              category: "Subscription",
              stock: "Digital",
              active: 1,
              lifecycle_mode: "seasonal",
              shop_listed: 1,
              season_paused: 0,
              season_starts_at: "2026-01-01 00:00:00",
              season_ends_at: "2027-01-01 00:00:00",
              product_version: 1,
            },
          ],
        ];
      }
      throw new Error("unexpected");
    },
  };
  const auth = await orderElig.lockAndAuthorizeOrderProducts({
    conn,
    productIds: [1],
    capability: unknownCap,
    nowMs: Date.UTC(2026, 5, 1),
  });
  ok(
    "unknown_capability_denies_even_if_select_works",
    auth.ok === false && auth.code === "not_purchasable"
  );

  // Writer version gate
  const row = { id: 1, product_version: 3, slug: "a" };
  const stale = writer.gateExpectedVersionAllowMaxNoop(row, 2, false);
  ok("stale_version_409", stale.ok === false && stale.status === 409);
  const maxNoop = writer.gateExpectedVersionAllowMaxNoop(
    { product_version: 4294967295 },
    4294967295,
    true
  );
  ok("max_version_noop_allowed", maxNoop.ok === true);
  const maxWrite = writer.gateExpectedVersionAllowMaxNoop(
    { product_version: 4294967295 },
    4294967295,
    false
  );
  ok("max_version_write_blocked", maxWrite.ok === false);

  // Source contracts
  const adminApi = fs.readFileSync(path.join(ROOT, "pages/api/admin-products.ts"), "utf8");
  const restore = fs.readFileSync(path.join(ROOT, "pages/api/admin-revisions/restore.ts"), "utf8");
  const sidhu = fs.readFileSync(path.join(ROOT, "app/sidhu/page.tsx"), "utf8");
  const detail = fs.readFileSync(path.join(ROOT, "app/products/[slug]/ProductDetail.tsx"), "utf8");
  const page = fs.readFileSync(path.join(ROOT, "app/products/[slug]/page.tsx"), "utf8");
  const orderLib = fs.readFileSync(path.join(ROOT, "lib/orderProductEligibility.ts"), "utf8");

  ok("put_locks_for_update", /lockProductRow/.test(adminApi) && /FOR UPDATE/.test(fs.readFileSync(path.join(ROOT, "lib/productWriterTx.ts"), "utf8")));
  ok("put_update_guards_version_and_slug", /WHERE id=\? AND product_version=\? AND slug=\?/.test(adminApi));
  ok("delete_sends_expected_version_client", /method: "DELETE"[\s\S]*expected_version/.test(sidhu));
  ok("delete_locks_version", /DELETE FROM products WHERE id = \? AND product_version/.test(adminApi));
  ok("restore_for_update_and_expected_version", /FOR UPDATE/.test(restore) && /expected_version/.test(restore));
  ok("no_manufacture_expanded", !/order_select_proved_expanded_columns/.test(orderLib));
  ok(
    "hub_link_gated",
    /showHubLink/.test(detail) && /resolveSeasonalHubPublicState|effectivelyPublic/.test(page)
  );
  ok("countdown_component", /SeasonalCountdown/.test(detail));
  ok("alternatives_rendered", /SeasonalAlternativeCards/.test(detail));
  ok("permanent_means_year_round", /year-round offering/.test(fs.readFileSync(path.join(ROOT, "components/admin/ProductSeasonalityPanel.tsx"), "utf8")));

  // Available requires listed
  const expandedCap = cap.resolveSchemaCapability({
    columnNames: ["id", "name", "active", "price", ...cap.SEASONAL_REQUIRED_COLUMNS],
  });
  const now = Date.UTC(2026, 5, 1);
  const purchUnlisted = {
    id: 2,
    active: 1,
    lifecycle_mode: "permanent",
    shop_listed: 0,
    product_version: 1,
  };
  const map = new Map([[2, purchUnlisted]]);
  ok(
    "available_excludes_unlisted",
    elig.filterAvailableOfferIds(1, [2], map, now, expandedCap).length === 0
  );

  console.log(`\nVisibility-06 verification: ${passed} passed, ${failed} failed`);
  console.log(`Runtime: ${process.version}`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
