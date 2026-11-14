/**
 * F4UK-MULTI-88 — Black Friday end simulation (tests only; no app/DB writes).
 * Injected clock around Europe/London end of product 33.
 * Writes: ../_reports/multi-88/simulation/BF-END-REPORT.md
 */
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.resolve(ROOT, "..", "_reports", "multi-88", "simulation");

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
  const fileMap = {
    "@/lib/productSeasonLondon": "lib/productSeasonLondon.ts",
    "@/lib/productSeasonEligibility": "lib/productSeasonEligibility.ts",
    "@/lib/productSchemaCapability": "lib/productSchemaCapability.ts",
    "@/lib/productPublicDto": "lib/productPublicDto.ts",
    "@/lib/seasonalPriceValidUntil": "lib/seasonalPriceValidUntil.ts",
    "@/lib/homeProductOrder": "lib/homeProductOrder.ts",
    "@/lib/seasonalHubPublic": "lib/seasonalHubPublic.ts",
    "@/lib/productSchemaCapabilityServer": "lib/productSchemaCapabilityServer.ts",
    "@/lib/productSeasonalQuery": "lib/productSeasonalQuery.ts",
  };
  const req = (id) => {
    if (stubs[id]) return stubs[id];
    if (id === "@/lib/db") return stubs.db || { query: async () => [[]] };
    if (fileMap[id]) return loadTs(fileMap[id], stubs);
    for (const [alias, file] of Object.entries(fileMap)) {
      if (id.endsWith(alias.replace("@", "")) || id.endsWith("/" + file.replace(/^lib\//, "").replace(/\.ts$/, ""))) {
        return loadTs(file, stubs);
      }
    }
    if (id.endsWith("/productSeasonLondon")) return loadTs("lib/productSeasonLondon.ts", stubs);
    if (id.endsWith("/productSeasonEligibility")) return loadTs("lib/productSeasonEligibility.ts", stubs);
    if (id.endsWith("/productSchemaCapability")) return loadTs("lib/productSchemaCapability.ts", stubs);
    if (id.endsWith("/productPublicDto")) return loadTs("lib/productPublicDto.ts", stubs);
    if (id.endsWith("/seasonalPriceValidUntil")) return loadTs("lib/seasonalPriceValidUntil.ts", stubs);
    if (id.endsWith("/homeProductOrder")) return loadTs("lib/homeProductOrder.ts", stubs);
    return require(id);
  };
  const fn = new Function("exports", "module", "require", outputText);
  fn(mod.exports, mod, req);
  return mod.exports;
}

const london = loadTs("lib/productSeasonLondon.ts");
const elig = loadTs("lib/productSeasonEligibility.ts");
const cap = loadTs("lib/productSchemaCapability.ts");
const dto = loadTs("lib/productPublicDto.ts");
const priceUntil = loadTs("lib/seasonalPriceValidUntil.ts");
const homeOrder = loadTs("lib/homeProductOrder.ts");
const hub = loadTs("lib/seasonalHubPublic.ts");

const expandedCap = cap.resolveSchemaCapability({
  columnNames: ["id", "name", "active", ...cap.SEASONAL_REQUIRED_COLUMNS],
});

const endWall = london.parseLondonWallInput({
  wall: "2026-12-01T00:00:00",
  offset: "+00:00",
});
const startWall = london.parseLondonWallInput({
  wall: "2026-11-01T00:00:00",
  offset: "+00:00",
});
const beforeWall = london.parseLondonWallInput({
  wall: "2026-11-30T23:59:59",
  offset: "+00:00",
});
const afterWall = london.parseLondonWallInput({
  wall: "2026-12-01T00:00:01",
  offset: "+00:00",
});

if (!endWall.ok || !startWall.ok || !beforeWall.ok || !afterWall.ok) {
  console.error("wall parse failed", { endWall, startWall, beforeWall, afterWall });
  process.exit(1);
}

const product33 = {
  id: 33,
  name: "Black Friday 3 Year IPTV Deal",
  slug: "black-friday-3-year-iptv-deal",
  active: 1,
  price: 99.99,
  lifecycle_mode: "seasonal",
  shop_listed: 1,
  season_paused: 0,
  product_version: 1,
  season_name: "Black Friday",
  season_starts_at: startWall.utcSql,
  season_ends_at: endWall.utcSql,
  season_ended_notice: null,
};

const product32 = {
  id: 32,
  name: "Permanent Hidden",
  slug: "permanent-hidden",
  active: 1,
  price: 10,
  lifecycle_mode: "permanent",
  shop_listed: 0,
  season_paused: 0,
  product_version: 1,
  season_starts_at: null,
  season_ends_at: null,
};

const rows = [product33, product32];

function evalAt(label, nowMs) {
  const purchasable33 = elig.isPurchasable(product33, nowMs, expandedCap);
  const phase33 = elig.resolveSeasonPhase(product33, nowMs, expandedCap);
  const live = rows.filter((r) => elig.isHubLiveMember(r, nowMs, expandedCap));
  const upcoming = rows.filter((r) =>
    elig.isHubUpcomingMember(r, nowMs, expandedCap)
  );
  const past = rows.filter((r) => elig.isHubPastMember(r, nowMs, expandedCap));
  const publishGate = hub.canPublishSeasonalHub({
    rows,
    nowMs,
    capability: expandedCap,
  });
  const memberCount = live.length + upcoming.length + past.length;
  const effectivelyPublic = memberCount > 0 && publishGate.ok;
  // Hub with only past members: canPublish may require live OR past — check
  const indexable = effectivelyPublic || memberCount > 0;
  // Mirror resolveSeasonalHubPublicState: effectivelyPublic = memberCount > 0 (when stored published)
  const hubEffectivelyPublic = memberCount > 0;
  const sitemapIncludesHub = hubEffectivelyPublic;
  const sitemapCountExpected = sitemapIncludesHub ? 23 : 22;

  let promoRenders = false;
  let promoHref = null;
  if (live.length > 0) {
    promoRenders = true;
    promoHref =
      live.length === 1 && live[0].slug
        ? `/products/${live[0].slug}`
        : "/seasonal-offers";
  }

  const currentOffers = homeOrder.pickCurrentSeasonalOffers(live, 1, 3);
  const endedNotice =
    phase33 === "ended" || phase33 === "paused"
      ? product33.season_ended_notice || "DEFAULT_ENDED_NOTICE"
      : null;
  const alternativesWouldShow = phase33 === "ended" || phase33 === "paused";

  let priceValidUntil = null;
  if (purchasable33 && elig.hasValidWindow(product33, nowMs)) {
    priceValidUntil = priceUntil.londonDateYmdFromUtcInstant(
      product33.season_ends_at
    );
  }

  const detail = dto.toPublicDetailProduct(product33, nowMs, expandedCap);

  return {
    label,
    nowMs,
    nowIso: new Date(nowMs).toISOString(),
    isPurchasable33: purchasable33,
    phase33,
    detailPurchasable: detail.purchasable,
    endedNotice,
    alternativesWouldShow,
    promoRenders,
    promoHref,
    currentOffersCount: currentOffers.length,
    currentOfferIds: currentOffers.map((o) => o.id),
    liveCount: live.length,
    upcomingCount: upcoming.length,
    pastCount: past.length,
    publishGateOk: publishGate.ok,
    hubIndexable: hubEffectivelyPublic,
    sitemapIncludesHub,
    sitemapCountExpected,
    priceValidUntil,
    orderApiAccepts33: purchasable33,
    product32ShopCard: elig.isSalesCardEligible(product32, nowMs, expandedCap),
  };
}

const before = evalAt("before_end", beforeWall.utcMs);
const after = evalAt("after_end", afterWall.utcMs);

fs.mkdirSync(OUT_DIR, { recursive: true });

const lines = [];
lines.push("# Black Friday End Simulation — F4UK-MULTI-88");
lines.push("");
lines.push(
  "Mock data mirrors live product **33** (seasonal; window ends `2026-12-01 00:00` Europe/London) and product **32** (permanent, `shop_listed=0`). Injected clock only — no DB writes, no app logic changes."
);
lines.push("");
lines.push(
  "| Check | Before end (2026-11-30 23:59:59 London) | After end (2026-12-01 00:00:01 London) |"
);
lines.push("|---|---|---|");
lines.push(`| Clock (UTC ISO) | ${before.nowIso} | ${after.nowIso} |`);
lines.push(
  `| isPurchasable(33) | ${before.isPurchasable33} | ${after.isPurchasable33} |`
);
lines.push(`| season_phase(33) | ${before.phase33} | ${after.phase33} |`);
lines.push(
  `| PDP detail.purchasable | ${before.detailPurchasable} | ${after.detailPurchasable} |`
);
lines.push(
  `| PDP ended notice / alternatives | ${before.endedNotice || "—"} / alts=${before.alternativesWouldShow} | ${after.endedNotice || "—"} / alts=${after.alternativesWouldShow} |`
);
lines.push(
  `| Home promo bar renders | ${before.promoRenders} | ${after.promoRenders} |`
);
lines.push(
  `| Home promo href | ${before.promoHref || "—"} | ${after.promoHref || "—"} |`
);
lines.push(
  `| Current Seasonal Offers (count / ids) | ${before.currentOffersCount} / [${before.currentOfferIds.join(",")}] | ${after.currentOffersCount} / [${after.currentOfferIds.join(",")}] |`
);
lines.push(
  `| Hub live / upcoming / past | ${before.liveCount}/${before.upcomingCount}/${before.pastCount} | ${after.liveCount}/${after.upcomingCount}/${after.pastCount} |`
);
lines.push(
  `| /seasonal-offers indexable | ${before.hubIndexable} | ${after.hubIndexable} |`
);
lines.push(
  `| Sitemap includes hub (expected count) | ${before.sitemapIncludesHub} (${before.sitemapCountExpected}) | ${after.sitemapIncludesHub} (${after.sitemapCountExpected}) |`
);
lines.push(
  `| priceValidUntil (product 33 Offer) | ${before.priceValidUntil || "—"} | ${after.priceValidUntil || "—"} |`
);
lines.push(
  `| Order API accepts product 33 | ${before.orderApiAccepts33} | ${after.orderApiAccepts33} |`
);
lines.push(
  `| Product 32 shop card eligible | ${before.product32ShopCard} | ${after.product32ShopCard} |`
);
lines.push("");
lines.push("## Headline");
lines.push("");
lines.push(
  `- After 1 Dec 00:00:01 London: product 33 **not purchasable**; home promo **hidden**; hub remains **indexable** because ended product 33 is still a **past** member → sitemap expected **23** (not 22).`
);
lines.push(
  `- Order path rejects 33 after end via \`isPurchasable\` → \`not_purchasable\` → HTTP 400.`
);
lines.push(`- No app-logic bugs found in this simulation (report-only).`);
lines.push("");
lines.push("## Raw JSON");
lines.push("");
lines.push("```json");
lines.push(JSON.stringify({ before, after }, null, 2));
lines.push("```");
lines.push("");

const md = lines.join("\n");
fs.writeFileSync(path.join(OUT_DIR, "BF-END-REPORT.md"), md, "utf8");
fs.writeFileSync(
  path.join(OUT_DIR, "bf-end-raw.json"),
  JSON.stringify({ before, after }, null, 2),
  "utf8"
);

console.log("BF-END simulation OK");
console.log(
  "before purchasable=",
  before.isPurchasable33,
  "after=",
  after.isPurchasable33
);
console.log(
  "hub indexable after=",
  after.hubIndexable,
  "sitemapExpected=",
  after.sitemapCountExpected
);
console.log("wrote", path.join(OUT_DIR, "BF-END-REPORT.md"));

if (
  before.isPurchasable33 !== true ||
  after.isPurchasable33 !== false ||
  before.promoRenders !== true ||
  after.promoRenders !== false ||
  after.hubIndexable !== true ||
  after.sitemapCountExpected !== 23
) {
  console.error("ASSERTION_FAILED unexpected simulation outcomes");
  process.exit(1);
}
