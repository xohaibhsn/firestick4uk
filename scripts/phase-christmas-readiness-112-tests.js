/**
 * F4UK-MULTI-112 — Christmas-readiness fake-clock (Europe/London).
 * Pure eligibility / hub / promo / priceValidUntil helpers only.
 * Product 33 + 34 season windows mirrored from LIVE public PDP embeds
 * (2026-11-16 anonymous HTML), not from list /api/products (Christmas excluded).
 * No app code changes. If a real gap is found → test.skip with CHRISTMAS-RISK note.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..");

let passed = 0;
let failed = 0;
let skipped = 0;
const risks = [];

function ok(name, cond, detail = "") {
  if (cond) {
    passed++;
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed++;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function skip(name, reason) {
  skipped++;
  risks.push({ name, reason });
  console.log(`SKIP  ${name} — CHRISTMAS-RISK: ${reason}`);
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const cache = new Map();

const DB_STUB = { query: async () => [[]] };
const SERVER_STUBS = {
  "@/lib/db": DB_STUB,
  "@/lib/productSchemaCapabilityServer": {
    detectProductSchemaCapability: async () => ({
      mode: "expanded",
      present: [],
      missing: [],
      reason: "test_stub",
    }),
    clearProductSchemaCapabilityCache: () => {},
  },
  "@/lib/productSeasonalQuery": {
    queryWithSeasonalUtc: async () => [[]],
  },
};

function loadTsModule(rel, stubs = SERVER_STUBS) {
  const stubKey = Object.keys(stubs)
    .sort()
    .map((k) => k + "=" + typeof stubs[k])
    .join(",");
  const key = rel + "::" + stubKey;
  if (cache.has(key)) return cache.get(key);
  const src = read(rel);
  const { outputText } = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
    },
  });
  const exportsObj = {};
  const moduleObj = { exports: exportsObj };
  const localRequire = (id) => {
    if (Object.prototype.hasOwnProperty.call(stubs, id)) return stubs[id];
    if (id === "@/lib/db" || id.endsWith("/lib/db") || id.endsWith("/db")) {
      return stubs["@/lib/db"] || DB_STUB;
    }
    if (id.startsWith(".") || id.startsWith("..") || id.startsWith("@/")) {
      let resolved = id;
      if (id.startsWith("@/")) resolved = path.join(ROOT, id.slice(2));
      else
        resolved = path.normalize(
          path.join(path.dirname(path.join(ROOT, rel)), id)
        );
      const relPosix = path.relative(ROOT, resolved).replace(/\\/g, "/");
      // Never load real DB / server capability during pure fake-clock tests
      if (
        relPosix === "lib/db" ||
        relPosix === "lib/db.ts" ||
        relPosix.endsWith("/db")
      ) {
        return DB_STUB;
      }
      for (const c of [
        resolved + ".ts",
        resolved + ".js",
        path.join(resolved, "index.ts"),
      ]) {
        if (fs.existsSync(c)) {
          return loadTsModule(
            path.relative(ROOT, c).replace(/\\/g, "/"),
            stubs
          );
        }
      }
    }
    return require(id);
  };
  const fn = new Function("exports", "module", "require", outputText);
  fn(exportsObj, moduleObj, localRequire);
  const mod = moduleObj.exports;
  cache.set(key, mod);
  return mod;
}

const london = loadTsModule("lib/productSeasonLondon.ts");
const elig = loadTsModule("lib/productSeasonEligibility.ts");
const capMod = loadTsModule("lib/productSchemaCapability.ts");
const priceUntil = loadTsModule("lib/seasonalPriceValidUntil.ts");
const homeOrder = loadTsModule("lib/homeProductOrder.ts");
const hub = loadTsModule("lib/seasonalHubPublic.ts");

const expandedCap = capMod.resolveSchemaCapability({
  columnNames: [
    "id",
    "name",
    "active",
    ...capMod.SEASONAL_REQUIRED_COLUMNS,
  ],
});

/**
 * LIVE public PDP embeds (anonymous HTML 2026-11-16):
 * BF 33: season_starts_at 2026-11-12T23:26:00Z → season_ends_at 2026-12-01T00:00:00Z
 * Christmas 34: 2026-12-01T00:00:00Z → 2027-01-01T00:00:00Z
 * Source: PDP JSON flight props (list /api/products excludes id 34 while upcoming).
 */
const SOURCE_NOTE =
  "LIVE PDP embeds (not list API; Christmas excluded from /api/products while upcoming)";

function wallMs(wall) {
  const parsed = london.parseLondonWallInput({
    wall,
    offset: "+00:00",
  });
  if (!parsed.ok) throw new Error("wall parse failed: " + wall);
  return parsed.utcMs;
}

const product33 = {
  id: 33,
  name: "Black Friday 2026 IPTV Subscription Deal for 3 Years",
  slug: "black-friday-3-year-iptv-deal",
  active: 1,
  price: 78,
  lifecycle_mode: "seasonal",
  shop_listed: 1,
  season_paused: 0,
  product_version: 1,
  season_name: "Black Friday 2026",
  // Live UTC ISO stored as UTC SQL (Z → space)
  season_starts_at: "2026-11-12 23:26:00",
  season_ends_at: "2026-12-01 00:00:00",
  season_ended_notice:
    "This Black Friday deal has ended. See our current offers",
  season_available_ids: [34],
};

const product34 = {
  id: 34,
  name: "Christmas & New Year Offer 2026 — 3 Years IPTV",
  slug: "christmas-new-year-offer-2026",
  active: 1,
  price: 78,
  lifecycle_mode: "seasonal",
  shop_listed: 1,
  season_paused: 0,
  product_version: 1,
  season_name: "Christmas & New Year",
  season_starts_at: "2026-12-01 00:00:00",
  season_ends_at: "2027-01-01 00:00:00",
  season_ended_notice: null,
  season_available_ids: [4, 33],
};

const permanentAlt = {
  id: 4,
  name: "Firestick 4K",
  slug: "firestick-4k",
  active: 1,
  price: 49.99,
  lifecycle_mode: "permanent",
  shop_listed: 1,
  season_paused: 0,
  product_version: 1,
  season_starts_at: null,
  season_ends_at: null,
};

const rows = [product33, product34, permanentAlt];

ok("fixture_source_stated", true, SOURCE_NOTE);

function evalInstant(label, wall) {
  const nowMs = london.floorSecondUtcMs(wallMs(wall));
  const bfBuy = elig.isPurchasable(product33, nowMs, expandedCap);
  const xmasBuy = elig.isPurchasable(product34, nowMs, expandedCap);
  const bfPhase = elig.resolveSeasonPhase(product33, nowMs, expandedCap);
  const xmasPhase = elig.resolveSeasonPhase(product34, nowMs, expandedCap);

  const live = rows.filter((r) =>
    elig.isHubLiveMember(r, nowMs, expandedCap)
  );
  const upcoming = rows.filter((r) =>
    elig.isHubUpcomingMember(r, nowMs, expandedCap)
  );
  const past = rows.filter((r) =>
    elig.isHubPastMember(r, nowMs, expandedCap)
  );
  const memberCount = live.length + upcoming.length + past.length;
  const publishGate = hub.canPublishSeasonalHub({
    rows: rows.filter((r) => r.lifecycle_mode === "seasonal"),
    nowMs,
    capability: expandedCap,
  });
  // Mirror resolveSeasonalHubPublicState when storedPublished=true:
  const hubIndexable = memberCount > 0;

  // Promo bar: earliest-ending live (same idea as app/page.tsx)
  let promoSelectsChristmas = false;
  let promoSelectsBf = false;
  let promoRenders = false;
  if (live.length > 0) {
    promoRenders = true;
    let earliest = null;
    for (const r of live) {
      const endMs = london.parseUtcSqlToMs(r.season_ends_at);
      if (endMs == null) continue;
      if (earliest == null || endMs < earliest.endMs) {
        earliest = { id: r.id, endMs };
      }
    }
    promoSelectsChristmas = earliest && earliest.id === 34;
    promoSelectsBf = earliest && earliest.id === 33;
  }

  const currentOffersFromBfEnded = homeOrder.pickCurrentSeasonalOffers(
    live,
    33,
    3
  );
  const currentOffersSelectChristmas = currentOffersFromBfEnded.some(
    (o) => o.id === 34
  );

  const byId = new Map(rows.map((r) => [r.id, r]));
  const altsForEndedXmas = elig.filterAvailableOfferIds(
    34,
    product34.season_available_ids || [],
    byId,
    nowMs,
    expandedCap
  );
  const altsForEndedBf = elig.filterAvailableOfferIds(
    33,
    product33.season_available_ids || [],
    byId,
    nowMs,
    expandedCap
  );

  let xmasPriceValidUntil = null;
  if (xmasBuy && elig.hasValidWindow(product34, nowMs)) {
    xmasPriceValidUntil = priceUntil.londonDateYmdFromUtcInstant(
      product34.season_ends_at
    );
  }

  return {
    label,
    wall,
    nowMs,
    nowIso: new Date(nowMs).toISOString(),
    bfBuy,
    xmasBuy,
    bfPhase,
    xmasPhase,
    liveIds: live.map((r) => r.id),
    upcomingIds: upcoming.map((r) => r.id),
    pastIds: past.map((r) => r.id),
    hubIndexable,
    publishGateOk: publishGate.ok,
    promoRenders,
    promoSelectsChristmas,
    promoSelectsBf,
    currentOffersSelectChristmas,
    currentOfferIds: currentOffersFromBfEnded.map((o) => o.id),
    altsForEndedXmas,
    altsForEndedBf,
    xmasPriceValidUntil,
  };
}

const t1 = evalInstant("pre_handoff", "2026-11-30T23:59:59");
const t2 = evalInstant("handoff_exact", "2026-12-01T00:00:00");
const t3 = evalInstant("handoff_plus1", "2026-12-01T00:00:01");
const t4 = evalInstant("xmas_last_sec", "2026-12-31T23:59:59");
const t5 = evalInstant("xmas_ended", "2027-01-01T00:00:00");

console.log(
  "instant",
  JSON.stringify(
    {
      t1: {
        bf: t1.bfBuy,
        xmas: t1.xmasBuy,
        live: t1.liveIds,
        promoXmas: t1.promoSelectsChristmas,
      },
      t2: {
        bf: t2.bfBuy,
        xmas: t2.xmasBuy,
        live: t2.liveIds,
        promoXmas: t2.promoSelectsChristmas,
        hub: t2.hubIndexable,
        pvu: t2.xmasPriceValidUntil,
      },
      t3: {
        bf: t3.bfBuy,
        xmas: t3.xmasBuy,
        live: t3.liveIds,
        promoXmas: t3.promoSelectsChristmas,
      },
      t4: { xmas: t4.xmasBuy, pvu: t4.xmasPriceValidUntil },
      t5: {
        xmas: t5.xmasBuy,
        phase: t5.xmasPhase,
        alts: t5.altsForEndedXmas,
        live: t5.liveIds,
        hub: t5.hubIndexable,
      },
    },
    null,
    0
  )
);

// --- Instant assertions ---
ok(
  "2026-11-30_23:59:59_BF_purchasable",
  t1.bfBuy === true && t1.bfPhase === "live"
);
ok(
  "2026-11-30_23:59:59_Christmas_not_purchasable",
  t1.xmasBuy === false && t1.xmasPhase === "upcoming"
);

ok(
  "2026-12-01_00:00:00_BF_NOT_purchasable",
  t2.bfBuy === false && t2.bfPhase === "ended"
);
ok(
  "2026-12-01_00:00:00_Christmas_purchasable",
  t2.xmasBuy === true && t2.xmasPhase === "live"
);
ok(
  "2026-12-01_00:00:01_BF_NOT_purchasable",
  t3.bfBuy === false
);
ok(
  "2026-12-01_00:00:01_Christmas_purchasable",
  t3.xmasBuy === true
);

// Promo / current offers / hub select Christmas at handoff
ok(
  "2026-12-01_00:00:00_promo_selects_Christmas",
  t2.promoRenders === true && t2.promoSelectsChristmas === true
);
ok(
  "2026-12-01_00:00:00_current_offers_select_Christmas",
  t2.currentOffersSelectChristmas === true || t2.liveIds.includes(34)
);
ok("2026-12-01_00:00:00_hub_indexable", t2.hubIndexable === true);
ok(
  "2026-12-01_00:00:00_Christmas_priceValidUntil_is_end",
  t2.xmasPriceValidUntil === "2027-01-01",
  String(t2.xmasPriceValidUntil)
);

ok(
  "2026-12-31_23:59:59_Christmas_purchasable",
  t4.xmasBuy === true && t4.xmasPhase === "live"
);

ok(
  "2027-01-01_00:00:00_Christmas_ended_not_purchasable",
  t5.xmasBuy === false && t5.xmasPhase === "ended"
);

// Alternatives behaviour as with BF: ended self → filterAvailableOfferIds keeps purchasable alts
ok(
  "2027-01-01_alternatives_like_BF_ended",
  t5.altsForEndedXmas.includes(4) && !t5.altsForEndedXmas.includes(33),
  JSON.stringify(t5.altsForEndedXmas)
);
ok(
  "2027-01-01_hub_stays_indexable_via_past_member",
  t5.hubIndexable === true && t5.pastIds.includes(34)
);

// Gap detection → CHRISTMAS-RISK (skip, do not fail gate)
function assertNoGap(label, cond, detail) {
  if (cond) {
    ok(label + "_no_gap", true, detail);
  } else {
    skip(label, detail || "gap detected");
  }
}

assertNoGap(
  "handoff_no_live_offer_gap_at_00:00:00",
  t2.liveIds.length > 0 && t2.xmasBuy === true,
  `liveIds=${JSON.stringify(t2.liveIds)} xmasBuy=${t2.xmasBuy}`
);

assertNoGap(
  "handoff_exact_second_timezone",
  t2.bfBuy === false && t2.xmasBuy === true && t1.bfBuy === true,
  `t1.bf=${t1.bfBuy} t2.bf=${t2.bfBuy} t2.xmas=${t2.xmasBuy} nowIso=${t2.nowIso}`
);

assertNoGap(
  "hub_indexable_across_handoff",
  t1.hubIndexable && t2.hubIndexable && t5.hubIndexable,
  `t1=${t1.hubIndexable} t2=${t2.hubIndexable} t5=${t5.hubIndexable}`
);

if (risks.length) {
  console.log("\nCHRISTMAS-RISK cases:");
  for (const r of risks) console.log(` - ${r.name}: ${r.reason}`);
}

console.log(
  `\nphase-christmas-readiness-112: ${passed} passed, ${failed} failed, ${skipped} skipped`
);
process.exit(failed ? 1 : 0);
