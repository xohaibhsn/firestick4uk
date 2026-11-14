/**
 * F4UK-MULTI-89 — loaded = full CMS; seeded for PriceDisplay; per-channel purchase
 * guards; HSTS header (if added). Stub-safe. No DB writes.
 */
const fs = require("fs");
const path = require("path");

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
const priceDisplay = read("components/PriceDisplay.tsx");
const adsSrc = read("lib/adsConversions.ts");
const success = read("app/cart/success/page.tsx");
const cart = read("app/cart/page.tsx");
const nextConfig = read("next.config.ts");

// ── A: loaded-semantics ─────────────────────────────────────────────────────
ok(
  "provider_exports_seeded_flag",
  /seeded:\s*boolean/.test(provider) &&
    /seeded:\s*isSeeded/.test(provider) &&
    /return\s*\{\s*sc,\s*loaded,\s*seeded/.test(provider)
);
ok(
  "provider_loaded_starts_false",
  /useState\(false\)/.test(provider) &&
    !/useState\(\(\)\s*=>\s*Boolean\(seed/.test(provider)
);
ok(
  "provider_merges_seed_full_map_wins",
  /setSc\(\{\s*\.\.\.\(seedMap\s*\|\|\s*\{\}\),\s*\.\.\.\(data\s+as\s+SiteContentMap\)\s*\}\)/.test(
    provider
  ) ||
    /setSc\(\{\s*\.\.\.\(seedMap \|\| \{\}\),\s*\.\.\.\(data as SiteContentMap\)\s*\}\)/.test(
      provider
    )
);
ok(
  "provider_still_fetches_page_all",
  /fetch\(["']\/api\/site-content\?page=all["']\)/.test(provider)
);
ok(
  "provider_finally_sets_loaded_true",
  /\.finally\(\(\)\s*=>\s*\{[\s\S]*setLoaded\(true\)/.test(provider)
);
ok(
  "priceDisplay_uses_seeded_or_loaded",
  /\(loaded\s*\|\|\s*seeded\)\s*&&\s*parsePricesIncludeVat/.test(priceDisplay)
);
ok(
  "cart_still_gates_payment_on_cmsLoaded_not_seeded",
  /loaded:\s*cmsLoaded/.test(cart) &&
    /!cmsLoaded/.test(cart) &&
    !/seeded/.test(cart)
);
ok(
  "shared_helpers_expose_seeded",
  /seeded,\s*t,\s*j|return \{ sc, loaded, seeded, t, j \}/.test(provider)
);

// ── B: per-channel purchase guards ──────────────────────────────────────────
ok(
  "ads_guard_key_ads_purchase_fired",
  /ads_purchase_fired_\$\{orderId\}|`ads_purchase_fired_\$\{orderId\}`/.test(
    adsSrc
  )
);
ok(
  "ga4_guard_key_ga4_purchase_fired",
  /ga4_purchase_fired_\$\{orderId\}|`ga4_purchase_fired_\$\{orderId\}`/.test(
    adsSrc
  )
);
ok(
  "firePurchase_sets_ads_guard_only_on_ads_branch",
  /labels\.purchase[\s\S]{0,400}setSessionGuard\(adsKey\)/.test(adsSrc) ||
    /labels\.purchase[\s\S]{0,500}setSessionGuard\(adsKey\)/.test(adsSrc)
);
ok(
  "firePurchase_sets_ga4_guard_only_on_ga4_branch",
  /pref\?\.analytics[\s\S]{0,500}setSessionGuard\(ga4Key\)/.test(adsSrc)
);
ok(
  "legacy_ads_key_documented_as_ads_channel",
  /Backward compatibility|legacy key/i.test(adsSrc) &&
    /ads_purchase_fired/.test(adsSrc)
);
ok(
  "success_fires_only_when_cmsLoaded",
  /if\s*\(\s*!snap\s*\|\|\s*!cmsLoaded\s*\)\s*return/.test(success) &&
    /firePurchase\(/.test(success) &&
    /\[snap,\s*cmsLoaded,\s*sc\]/.test(success)
);

// ── C: HSTS ─────────────────────────────────────────────────────────────────
ok(
  "hsts_header_in_securityHeaders",
  (() => {
    const m = nextConfig.match(
      /key:\s*["']Strict-Transport-Security["']\s*,\s*value:\s*["']([^"']+)["']/
    );
    const v = m ? m[1] : "";
    return (
      v === "max-age=15552000" &&
      !/includeSubDomains/i.test(v) &&
      !/preload/i.test(v)
    );
  })()
);

console.log(`\nmulti-89: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
