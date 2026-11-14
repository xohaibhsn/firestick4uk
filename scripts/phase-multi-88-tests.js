/**
 * F4UK-MULTI-88 — SSR incl. VAT seed; BF end simulation (clock-injected); promo offset source guards.
 * No DB writes. Stub-safe.
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

let passed = 0;
let failed = 0;
function ok(name, cond, detail) {
  if (cond) {
    passed++;
    console.log(`PASS ${name}`);
  } else {
    failed++;
    console.error(`FAIL ${name}${detail ? " — " + detail : ""}`);
  }
}

const provider = read("components/SiteContentProvider.tsx");
const layout = read("app/layout.tsx");
const priceDisplay = read("components/PriceDisplay.tsx");
const strip = read("components/home/SeasonalHomePromoStrip.tsx");
const home = read("app/HomeClient.tsx");

// ── B: SSR VAT seed ──────────────────────────────────────────────────────────
ok(
  "provider_accepts_initialContent",
  /initialContent\??:\s*SiteContentMap/.test(provider) &&
    /useState<SiteContentMap>\(\(\)\s*=>\s*seeded/.test(provider)
);
ok(
  "provider_loaded_true_when_seeded",
  /useState\(\(\)\s*=>\s*Boolean\(seeded\)\)/.test(provider)
);
ok(
  "provider_still_fetches_page_all",
  /fetch\(["']\/api\/site-content\?page=all["']\)/.test(provider)
);
ok(
  "layout_seeds_vat_keys_via_publicSiteContent",
  /getPublicSiteContent/.test(layout) &&
    /prices_include_vat/.test(layout) &&
    /price_incl_vat_suffix/.test(layout) &&
    /initialContent=\{initialSiteContent\}/.test(layout)
);
ok(
  "layout_seed_only_when_prices_include_vat_present",
  /hasOwnProperty\.call\(vatSeed,\s*["']prices_include_vat["']\)/.test(layout)
);
ok(
  "priceDisplay_still_gates_on_loaded",
  /loaded\s*&&\s*parsePricesIncludeVat\(sc\.prices_include_vat\)/.test(
    priceDisplay
  ) && /t\(\s*["']price_incl_vat_suffix["']\s*,\s*["']incl\. VAT["']\s*\)/.test(priceDisplay)
);

// ── A: promo offset constants remain the shared source ───────────────────────
ok(
  "promo_offsets_exported",
  /HOME_NAV_OFFSET_PX\s*=\s*80/.test(strip) &&
    /HOME_PROMO_BAR_HEIGHT_PX\s*=\s*44/.test(strip)
);
ok(
  "home_uses_page_wrapper_promo",
  /page-wrapper--promo/.test(home) &&
    /HOME_NAV_OFFSET_PX\s*\+\s*HOME_PROMO_BAR_HEIGHT_PX/.test(home)
);

// ── C: BF end simulation script + report ─────────────────────────────────────
const simScript = path.join(ROOT, "scripts", "bf-end-simulation-88.js");
ok("bf_end_simulation_script_present", fs.existsSync(simScript));

const sim = spawnSync(process.execPath, [simScript], {
  cwd: ROOT,
  encoding: "utf8",
  env: process.env,
  timeout: 60000,
});
ok(
  "bf_end_simulation_exit0",
  sim.status === 0,
  (sim.stderr || sim.stdout || "").slice(-400)
);

const reportPath = path.join(
  ROOT,
  "..",
  "_reports",
  "multi-88",
  "simulation",
  "BF-END-REPORT.md"
);
const report = fs.existsSync(reportPath)
  ? fs.readFileSync(reportPath, "utf8")
  : "";
ok(
  "bf_end_report_table_present",
  /before end|after end|isPurchasable/i.test(report) &&
    /2026-11-30|2026-12-01/.test(report) &&
    /sitemap expected \*\*23\*\*/i.test(report)
);

// Source guard: no app logic change claimed for C
ok(
  "orders_still_uses_isPurchasable_gate",
  /isPurchasable|lockAndAuthorizeOrderProducts/.test(
    read("pages/api/orders.ts")
  )
);

console.log(`\nmulti-88: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
