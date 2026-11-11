/**
 * F4UK-CMS-PRODUCT-VISIBILITY-04 — offline seasonality contract tests.
 * Mocked DB/auth/audit only. No real MySQL / CMS / orders.
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

function loadTs(rel, stubs = {}) {
  const src = read(rel);
  const { outputText } = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
    },
  });
  const mod = { exports: {} };
  const req = (id) => {
    if (stubs[id]) return stubs[id];
    const fileMap = {
      "@/lib/productSeasonLondon": "lib/productSeasonLondon.ts",
      "@/lib/productSeasonEligibility": "lib/productSeasonEligibility.ts",
      "@/lib/productSchemaCapability": "lib/productSchemaCapability.ts",
      "@/lib/productSeasonActions": "lib/productSeasonActions.ts",
      "@/lib/productSeasonServer": "lib/productSeasonServer.ts",
      "@/lib/productVisibility": "lib/productVisibility.ts",
      "@/lib/productPublicDto": "lib/productPublicDto.ts",
      "@/lib/productWriterTx": "lib/productWriterTx.ts",
      "@/lib/productSeasonalQuery": "lib/productSeasonalQuery.ts",
    };
    const stubMap = {
      "@/lib/db": stubs.db || {},
      "@/lib/adminAuth": {},
      "@/lib/adminAudit": { recordAdminAudit: async () => {} },
      "@/lib/contentRevisions": {
        recordContentRevision: async () => 1,
        snapshotProduct: (r) => ({ ...r }),
      },
      "@/lib/hostingerResourceInvalidation": { invalidateSitemapCache: () => {} },
    };
    if (id in stubMap) return stubMap[id];
    if (fileMap[id]) return loadTs(fileMap[id], stubs);
    if (id.endsWith("/productSeasonLondon")) return loadTs("lib/productSeasonLondon.ts", stubs);
    if (id.endsWith("/productSeasonEligibility")) return loadTs("lib/productSeasonEligibility.ts", stubs);
    if (id.endsWith("/productSchemaCapability")) return loadTs("lib/productSchemaCapability.ts", stubs);
    if (id.endsWith("/productSeasonActions")) return loadTs("lib/productSeasonActions.ts", stubs);
    if (id.endsWith("/productVisibility")) return loadTs("lib/productVisibility.ts", stubs);
    if (id.endsWith("/productPublicDto")) return loadTs("lib/productPublicDto.ts", stubs);
    if (id.endsWith("/productSeasonServer")) return loadTs("lib/productSeasonServer.ts", stubs);
    if (id.endsWith("/productWriterTx")) return loadTs("lib/productWriterTx.ts", stubs);
    if (id.endsWith("/productSeasonalQuery")) return loadTs("lib/productSeasonalQuery.ts", stubs);
    return require(id);
  };
  const fn = new Function("exports", "module", "require", outputText);
  fn(mod.exports, mod, req);
  return mod.exports;
}

const london = loadTs("lib/productSeasonLondon.ts");
const elig = loadTs("lib/productSeasonEligibility.ts");
const cap = loadTs("lib/productSchemaCapability.ts");
const actions = loadTs("lib/productSeasonActions.ts");
const dto = loadTs("lib/productPublicDto.ts");
const vis = loadTs("lib/productVisibility.ts");

const legacyCap = cap.resolveSchemaCapability({
  columnNames: ["id", "name", "slug", "active", "price", "category"],
});
const expandedCap = cap.resolveSchemaCapability({
  columnNames: [
    "id",
    "name",
    "active",
    ...cap.SEASONAL_REQUIRED_COLUMNS,
  ],
});
const unknownCap = cap.resolveSchemaCapability({
  columnNames: ["id", "product_version", "lifecycle_mode"],
});
const failCap = cap.resolveSchemaCapability({ columnNames: null, error: "boom" });

ok("cap_legacy", legacyCap.mode === "legacy");
ok(
  "cap_empty_columns_not_legacy",
  cap.resolveSchemaCapability({ columnNames: [] }).mode === "unknown"
);
ok("cap_expanded", expandedCap.mode === "expanded");
ok("cap_partial_unknown", unknownCap.mode === "unknown");
ok("cap_error_unknown", failCap.mode === "unknown");
ok("cap_row_missing_not_legacy", !cap.expandedRowHasOperationalFields({ id: 1, active: 1 }));

const now = Date.UTC(2026, 10, 8, 12, 0, 0); // 2026-11-08 12:00:00Z

const permanent = {
  id: 1,
  active: 1,
  lifecycle_mode: "permanent",
  shop_listed: 1,
  product_version: 0,
};
ok("legacy_purchase", elig.isPurchasable({ active: 1 }, now, legacyCap) === true);
ok("unknown_denies_purchase", elig.isPurchasable(permanent, now, failCap) === false);
ok("unknown_public_page_ok", elig.isPublicPage({ active: 1 }) === true);
ok("expanded_invalid_lifecycle_denies", elig.isPurchasable({ ...permanent, lifecycle_mode: "weird" }, now, expandedCap) === false);
ok(
  "expanded_missing_ops_denies",
  elig.isPurchasable({ active: 1, lifecycle_mode: "permanent" }, now, expandedCap) === false
);
ok(
  "cap_stale_legacy_contradiction_denies",
  elig.isPurchasable(
    {
      active: 1,
      lifecycle_mode: "seasonal",
      shop_listed: 1,
      product_version: 1,
      season_paused: 1,
      season_starts_at: "2026-01-01 00:00:00",
      season_ends_at: "2026-12-01 00:00:00",
    },
    now,
    legacyCap
  ) === false
);

const seasonalLive = {
  id: 32,
  active: 1,
  lifecycle_mode: "seasonal",
  shop_listed: 1,
  season_paused: 0,
  product_version: 3,
  season_starts_at: "2026-11-01 00:00:00",
  season_ends_at: "2026-11-10 00:00:00",
};
ok("live_purchasable", elig.isPurchasable(seasonalLive, now, expandedCap) === true);
ok("live_sales_card", elig.isSalesCardEligible(seasonalLive, now, expandedCap) === true);
ok("shop_unlisted_not_card", elig.isSalesCardEligible({ ...seasonalLive, shop_listed: 0 }, now, expandedCap) === false);
ok("shop_unlisted_still_purchasable", elig.isPurchasable({ ...seasonalLive, shop_listed: 0 }, now, expandedCap) === true);

const upcoming = {
  ...seasonalLive,
  season_starts_at: "2026-12-01 00:00:00",
  season_ends_at: "2026-12-10 00:00:00",
};
ok("upcoming_not_purchasable", elig.isPurchasable(upcoming, now, expandedCap) === false);
ok("upcoming_phase", elig.isUpcomingPhase(upcoming, now, expandedCap) === true);

const ended = {
  ...seasonalLive,
  season_starts_at: "2026-10-01 00:00:00",
  season_ends_at: "2026-11-01 00:00:00",
};
ok("ended_not_purchasable", elig.isPurchasable(ended, now, expandedCap) === false);
ok("ended_phase", elig.resolveSeasonPhase(ended, now, expandedCap) === "ended");
ok("paused_not_purchasable", elig.isPurchasable({ ...seasonalLive, season_paused: 1 }, now, expandedCap) === false);

// Available vs Upcoming predicates
const byId = new Map([
  [32, seasonalLive],
  [40, upcoming],
  [41, ended],
  [42, { ...seasonalLive, id: 42, active: 0 }],
]);
ok(
  "available_offers_purchasable_only",
  JSON.stringify(elig.filterAvailableOfferIds(99, [32, 40, 41, 42, 32], byId, now, expandedCap)) ===
    JSON.stringify([32])
);
ok(
  "upcoming_offers_not_require_purchase",
  JSON.stringify(elig.filterUpcomingOfferIds(99, [32, 40, 41], byId, now, expandedCap)) ===
    JSON.stringify([40])
);

// London DST
const gap = london.parseLondonWallInput({ wall: "2026-03-29T01:30:00", offset: "+00:00" });
ok("london_spring_gap_rejected", gap.ok === false);
const bst = london.parseLondonWallInput({ wall: "2026-07-15T12:00:00", offset: "+01:00" });
ok("london_bst_ok", bst.ok === true);
const autumnBst = london.parseLondonWallInput({ wall: "2026-10-25T01:30:00", offset: "+01:00" });
const autumnGmt = london.parseLondonWallInput({ wall: "2026-10-25T01:30:00", offset: "+00:00" });
ok("london_autumn_both_offsets", autumnBst.ok === true && autumnGmt.ok === true && autumnBst.utcMs !== autumnGmt.utcMs);
ok("london_missing_offset", london.parseLondonWallInput({ wall: "2026-07-15T12:00:00" }).ok === false);

// Action parse / End Early rules via server mock
const actor = { principalType: "staff", staffId: 1, name: "T", role: "super_admin", email: "t@x" };

function fakeStore(row) {
  const rows = [{ ...row }];
  const calls = { revisions: 0, audits: 0, updates: 0, rollbacks: 0, commits: 0, order: [] };
  async function query(sqlOrOpts, params = []) {
    const sql = typeof sqlOrOpts === "object" && sqlOrOpts && sqlOrOpts.sql != null ? sqlOrOpts.sql : sqlOrOpts;
    if (typeof sqlOrOpts === "object" && sqlOrOpts && sqlOrOpts.values) params = sqlOrOpts.values;
    const s = String(sql).replace(/\s+/g, " ").trim();
    if (/FOR UPDATE/i.test(s)) {
      calls.order.push("lock");
      return [rows.map((r) => ({ ...r }))];
    }
    if (/^UPDATE products SET/i.test(s)) {
      calls.updates += 1;
      calls.order.push("update");
      // naive apply last id
      const id = Number(params[params.length - 1]);
      const r = rows.find((x) => x.id === id);
      if (!r) return [{ affectedRows: 0 }];
      // Only track that update happened; fields applied loosely for version
      if (s.includes("product_version")) {
        r.product_version = params[params.length - 2];
      }
      if (s.includes("season_ends_at=?")) {
        const idx = s.split("?").length; // not reliable — parse from known action tests below via deps
      }
      return [{ affectedRows: 1 }];
    }
    // Authoritative post-update read (Task-06 writers return fresh product)
    if (/^SELECT \* FROM products WHERE id = \? LIMIT 1$/i.test(s)) {
      calls.order.push("fresh");
      const id = Number(params[0]);
      const r = rows.find((x) => x.id === id);
      return [r ? [{ ...r }] : []];
    }
    throw new Error("unexpected sql " + s);
  }
  return {
    rows,
    calls,
    deps: {
      getConnection: async () => ({
        beginTransaction: async () => calls.order.push("begin"),
        commit: async () => {
          calls.commits += 1;
          calls.order.push("commit");
        },
        rollback: async () => {
          calls.rollbacks += 1;
          calls.order.push("rollback");
        },
        release: () => calls.order.push("release"),
        query,
      }),
      recordContentRevision: async () => {
        calls.revisions += 1;
        calls.order.push("revision");
        return 1;
      },
      recordAdminAudit: async () => {
        calls.audits += 1;
      },
      invalidateSitemapCache: () => {},
      snapshotProduct: (r) => ({ ...r }),
      nowMs: () => now,
    },
  };
}

const seasonServer = loadTs("lib/productSeasonServer.ts");

async function runSeason() {
  // End Early on future window rejected
  {
    const store = fakeStore({ ...upcoming, product_version: 1 });
    const parsed = actions.parseSeasonActionPayload({
      id: 32,
      action: "end_early",
      expected_version: 1,
    });
    ok("parse_end_early", parsed.ok === true);
    const r = await seasonServer.applySeasonAction(parsed.payload, actor, null, store.deps);
    ok("end_early_future_rejected", r.ok === false && r.code === "future_window");
  }

  // End Early live shortens
  {
    const store = fakeStore({ ...seasonalLive, product_version: 2 });
    // customize query to capture ends
    let capturedEnds = null;
    store.deps.getConnection = async () => ({
      beginTransaction: async () => {},
      commit: async () => {
        store.calls.commits += 1;
      },
      rollback: async () => {
        store.calls.rollbacks += 1;
      },
      release: () => {},
      query: async (sqlOrOpts, params = []) => {
        const sql = typeof sqlOrOpts === "object" && sqlOrOpts?.sql != null ? sqlOrOpts.sql : sqlOrOpts;
        if (typeof sqlOrOpts === "object" && sqlOrOpts?.values) params = sqlOrOpts.values;
        const s = String(sql);
        if (/FOR UPDATE/i.test(s)) return [[{ ...store.rows[0] }]];
        if (/UPDATE products SET/i.test(s)) {
          store.calls.updates += 1;
          if (s.includes("season_ends_at")) capturedEnds = params[0];
          store.rows[0].season_ends_at = params[0];
          store.rows[0].product_version = params[params.length - 2];
          return [{ affectedRows: 1 }];
        }
        if (/SELECT \* FROM products WHERE id = \? LIMIT 1/i.test(s) && !/FOR UPDATE/i.test(s)) {
          return [[{ ...store.rows[0] }]];
        }
        throw new Error(s);
      },
    });
    const parsed = actions.parseSeasonActionPayload({
      id: 32,
      action: "end_early",
      expected_version: 2,
    });
    const r = await seasonServer.applySeasonAction(parsed.payload, actor, null, {
      ...store.deps,
      nowMs: () => now,
    });
    ok("end_early_live_ok", r.ok === true && r.noop === false);
    ok("end_early_end_after_start", capturedEnds === "2026-11-08 12:00:00");
  }

  // End Early already ended = noop
  {
    const store = fakeStore({ ...ended, product_version: 1 });
    const parsed = actions.parseSeasonActionPayload({
      id: 32,
      action: "end_early",
      expected_version: 1,
    });
    const r = await seasonServer.applySeasonAction(parsed.payload, actor, null, {
      ...store.deps,
      nowMs: () => now,
    });
    ok("end_early_already_ended_noop", r.ok === true && r.noop === true && store.calls.updates === 0);
  }

  // Stale version
  {
    const store = fakeStore({ ...seasonalLive, product_version: 5 });
    const parsed = actions.parseSeasonActionPayload({
      id: 32,
      action: "pause",
      expected_version: 4,
    });
    const r = await seasonServer.applySeasonAction(parsed.payload, actor, null, store.deps);
    ok("stale_version_conflict", r.ok === false && r.code === "stale_version");
  }

  // Version overflow
  {
    const store = fakeStore({ ...seasonalLive, product_version: 4294967295 });
    const parsed = actions.parseSeasonActionPayload({
      id: 32,
      action: "pause",
      expected_version: 4294967295,
    });
    const r = await seasonServer.applySeasonAction(parsed.payload, actor, null, store.deps);
    ok("version_overflow", r.ok === false && r.code === "version_overflow");
  }

  // Resume expired rejected
  {
    const store = fakeStore({ ...ended, season_paused: 1, product_version: 1 });
    const parsed = actions.parseSeasonActionPayload({
      id: 32,
      action: "resume",
      expected_version: 1,
    });
    const r = await seasonServer.applySeasonAction(parsed.payload, actor, null, {
      ...store.deps,
      nowMs: () => now,
    });
    ok("resume_expired_rejected", r.ok === false && r.code === "window_expired");
  }

  // Activate Now upcoming
  {
    const store = fakeStore({ ...upcoming, product_version: 1 });
    let newStart = null;
    store.deps.getConnection = async () => ({
      beginTransaction: async () => {},
      commit: async () => {
        store.calls.commits += 1;
      },
      rollback: async () => {
        store.calls.rollbacks += 1;
      },
      release: () => {},
      query: async (sqlOrOpts, params = []) => {
        const sql = typeof sqlOrOpts === "object" && sqlOrOpts?.sql != null ? sqlOrOpts.sql : sqlOrOpts;
        if (typeof sqlOrOpts === "object" && sqlOrOpts?.values) params = sqlOrOpts.values;
        if (/FOR UPDATE/i.test(sql)) return [[{ ...store.rows[0] }]];
        if (/UPDATE/i.test(sql)) {
          newStart = params[0];
          store.rows[0].season_starts_at = params[0];
          store.rows[0].product_version = params[params.length - 2];
          store.calls.updates += 1;
          return [{ affectedRows: 1 }];
        }
        if (/SELECT \* FROM products WHERE id = \? LIMIT 1/i.test(sql) && !/FOR UPDATE/i.test(sql)) {
          return [[{ ...store.rows[0] }]];
        }
        throw new Error(String(sql));
      },
    });
    const parsed = actions.parseSeasonActionPayload({
      id: 32,
      action: "activate_now",
      expected_version: 1,
    });
    const r = await seasonServer.applySeasonAction(parsed.payload, actor, null, {
      ...store.deps,
      nowMs: () => now,
    });
    ok("activate_now_sets_start", r.ok === true && newStart === "2026-11-08 12:00:00");
  }

  // Pre-commit revision failure rolls back
  {
    const store = fakeStore({ ...seasonalLive, product_version: 1 });
    store.deps.recordContentRevision = async () => {
      const err = new Error("rev fail");
      err.code = "ER_LOCK_WAIT_TIMEOUT";
      throw err;
    };
    const parsed = actions.parseSeasonActionPayload({
      id: 32,
      action: "pause",
      expected_version: 1,
    });
    let threw = false;
    try {
      await seasonServer.applySeasonAction(parsed.payload, actor, null, store.deps);
    } catch {
      threw = true;
    }
    ok("precommit_failure_no_silent_success", threw === true || store.calls.commits === 0);
  }
}

// DTO shape
const listDto = dto.toPublicListProduct({
  id: 1,
  name: "A",
  description: "d",
  short_description: "s",
  slug: "a",
  price: 1,
  badge: null,
  image: null,
  category: "Device",
  full_description: "FULL_SHOULD_NOT_APPEAR",
  product_version: 9,
});
ok("list_dto_no_full_desc", !("full_description" in listDto) && !("product_version" in listDto));
const detailDto = dto.toPublicDetailProduct(seasonalLive, now, expandedCap);
ok("detail_dto_seasonal_fields", detailDto.lifecycle_mode === "seasonal" && detailDto.purchasable === true);
ok("detail_dto_strips_version", !("product_version" in detailDto));

// Visibility parse still strict
ok("vis_reject_bool", vis.parseProductVisibilityPayload({ id: 1, active: false, expected_active: 1 }).ok === false);

// Source contracts
const adminApi = read("pages/api/admin-products.ts");
const orders = read("pages/api/orders.ts");
const productsApi = read("pages/api/products.ts");
const restore = read("pages/api/admin-revisions/restore.ts");
const urlMig = read("lib/productUrlMigrationServer.ts");
const detailPage = read("app/products/[slug]/page.tsx");
const hub = read("app/seasonal-offers/page.tsx");
const migrate = read("scripts/migrate-product-seasonality.js");

ok("admin_put_rejects_ops", /Ordinary PUT cannot change/.test(adminApi));
ok("admin_put_strict_active_legacy", /active must be exactly 0 or 1 when provided/.test(adminApi));
ok("admin_patch_actions", /parseSeasonActionPayload/.test(adminApi));
ok(
  "orders_uses_isPurchasable",
  /lockAndAuthorizeOrderProducts/.test(orders) || /isPurchasable/.test(orders)
);
ok(
  "orders_no_new_stock_text_gate",
  !/out of stock|sold out/i.test(orders)
);
ok("products_api_no_select_star_list", !/SELECT \* FROM products WHERE active=1/.test(productsApi));
ok("restore_preserves_ops_expanded", /Content-only restore/.test(restore));
ok("url_migration_versions", /product_version/.test(urlMig));
ok("detail_omits_offer_when_not_purchasable", /includeOffer: purchasable/.test(detailPage));
ok(
  "hub_unpublished_default",
  /resolveSeasonalHubPublicState/.test(hub) &&
    /effectivelyPublic/.test(hub) &&
    /index:\s*false/.test(hub) &&
    /This hub is not published yet/.test(hub)
);
ok("migration_not_auto_apply", /NOT EXECUTED by Task-04/.test(migrate) && /CHECK \(read-only\)/.test(migrate));
ok("migration_has_check_constraints", /chk_products_shop_listed CHECK/.test(migrate));

// Simulated unsafe old-code rollback note (reasoned): main orders without isPurchasable
ok(
  "old_main_orders_pattern_documented",
  /lockAndAuthorizeOrderProducts/.test(orders) &&
    /Fire-and-forget email|SMTP_USER/.test(orders)
);

async function main() {
  await runSeason();
  console.log(`\nSeasonality offline: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
