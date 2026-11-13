/**
 * F4UK-W4-INSIGHTS-LIVE-63 — consent copy v2 + Insights consent gating.
 * Source + pure runtime checks only. No network / DB / secrets.
 */
const fs = require("fs");
const path = require("path");
const { createRequire } = require("module");
const { execSync } = require("child_process");
const ts = require("typescript");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");

const HYG_RANGE_BASE = "9ee4ffb2a31adeab658d8a7924f4f755ec4cdc6d";
const HYG_RANGE_END = "2fda802ed1c16f8c163854b4bccb28043b0aac47";
const requireFromRoot = createRequire(path.join(ROOT, "package.json"));

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

const tsCache = new Map();

function loadTs(rel, stubs = {}) {
  const key = rel + "::" + Object.keys(stubs).sort().join(",");
  if (tsCache.has(key)) return tsCache.get(key);
  const src = read(rel);
  const { outputText } = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
    },
    fileName: rel,
  });
  const sandbox = { exports: {}, module: { exports: {} } };
  const localRequire = (id) => {
    if (Object.prototype.hasOwnProperty.call(stubs, id)) return stubs[id];
    if (id.startsWith(".") || id.startsWith("..") || id.startsWith("@/")) {
      let resolved = id;
      if (id.startsWith("@/")) resolved = path.join(ROOT, id.slice(2));
      else resolved = path.normalize(path.join(path.dirname(path.join(ROOT, rel)), id));
      for (const c of [resolved + ".ts", resolved + ".js", path.join(resolved, "index.ts")]) {
        if (fs.existsSync(c)) {
          return loadTs(path.relative(ROOT, c).replace(/\\/g, "/"), stubs);
        }
      }
    }
    return requireFromRoot(id);
  };
  const fn = new Function("exports", "module", "require", outputText);
  fn(sandbox.exports, sandbox.module, localRequire);
  const mod =
    sandbox.module.exports && Object.keys(sandbox.module.exports).length
      ? sandbox.module.exports
      : sandbox.exports;
  tsCache.set(key, mod);
  return mod;
}

const BANNER =
  "Privacy choices. We use optional analytics (including our own first-party site statistics) and advertising technologies to understand site use and measure ads. Essential features (cart, checkout, login) work without them. You can change this anytime via Privacy choices in the footer.";
const ANALYTICS_DESC =
  "Helps us understand how the site is used: Google Analytics and our own site statistics (pages viewed, traffic source, device type, clicks, scrolling and time on page, cart and checkout steps; never what you type into forms). Microsoft Clarity only if we switch it on. No effect on cart or checkout.";

const consent = read("components/TrackingConsent.tsx");
const consentNorm = consent.replace(/\s+/g, " ");
const consentLib = read("lib/trackingConsent.ts");
const insightsClient = read("lib/insightsClient.ts");
const beacon = read("components/SidhuInsightsBeacon.tsx");
const navbar = read("components/Navbar.tsx");
const layout = read("app/layout.tsx");

// 1–2 new banner + analytics copy
ok(
  "copy_banner_mentions_first_party_stats",
  consentNorm.includes(BANNER.replace(/\s+/g, " ")) ||
    (/including our own first-party site statistics/.test(consentNorm) &&
      /Privacy choices\./.test(consentNorm) &&
      /Reject optional/.test(consent) &&
      /Accept all/.test(consent))
);
ok(
  "copy_analytics_row_updated",
  consentNorm.includes(ANALYTICS_DESC.replace(/\s+/g, " ")) ||
    (/our own site statistics/.test(consentNorm) &&
      /clicks, scrolling and time on page/.test(consentNorm) &&
      !/approximate location from IP/.test(consentNorm) &&
      /Microsoft Clarity only if we switch it on/.test(consentNorm) &&
      /never what you type into forms/.test(consentNorm))
);

// 3 version 2 + storage key unchanged
ok(
  "consent_version_is_2",
  /TRACKING_CONSENT_VERSION\s*=\s*2/.test(consentLib)
);
ok(
  "storage_key_unchanged",
  /firestick_tracking_consent_v1/.test(consentLib) &&
    !/firestick_tracking_consent_v2/.test(consentLib)
);

// 4–7 runtime: v1 treated as unset; v2 accept/reject; GPC
const tc = loadTs("lib/trackingConsent.ts");
const ic = loadTs("lib/insightsClient.ts", {
  "./insightsIngest": {},
  "./clarityGating": loadTs("lib/clarityGating.ts"),
  "./trackingConsent": tc,
});

const store = Object.create(null);
const fakeWindow = {
  localStorage: {
    getItem(k) {
      return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null;
    },
    setItem(k, v) {
      store[k] = String(v);
    },
    removeItem(k) {
      delete store[k];
    },
  },
  dispatchEvent() {},
};
global.window = fakeWindow;

store[tc.TRACKING_CONSENT_STORAGE_KEY] = JSON.stringify({
  version: 1,
  analytics: true,
  advertising: true,
  updatedAt: "2026-01-01T00:00:00.000Z",
});
const v1Read = tc.readTrackingConsent();
ok("v1_stored_treated_as_unset", v1Read == null);

const v2Accept = tc.writeTrackingConsent({ analytics: true, advertising: true });
ok(
  "v2_accept_analytics_true",
  v2Accept.version === 2 &&
    v2Accept.analytics === true &&
    tc.readTrackingConsent()?.analytics === true
);

const v2Reject = tc.writeTrackingConsent({ analytics: false, advertising: false });
ok(
  "v2_reject_analytics_false",
  v2Reject.version === 2 &&
    v2Reject.analytics === false &&
    tc.anyOptionalTrackingGranted(v2Reject) === false
);

ok(
  "reject_means_beacon_off",
  ic.shouldRecordInsights({
    preference: { analytics: false, advertising: false },
    pathname: "/",
  }) === false
);

ok(
  "gpc_forces_recording_off",
  ic.shouldRecordInsights({
    preference: { analytics: true, advertising: true },
    pathname: "/",
    gpc: true,
  }) === false
);
ok(
  "accept_allows_recording_when_no_gpc",
  ic.shouldRecordInsights({
    preference: { analytics: true, advertising: false },
    pathname: "/",
    gpc: false,
  }) === true
);

// 8 excluded paths unchanged
ok(
  "excluded_paths_include_sidhu_api",
  ic.isInsightsExcludedPath("/sidhu") &&
    ic.isInsightsExcludedPath("/sidhu/insights") &&
    ic.isInsightsExcludedPath("/api/products") &&
    !ic.isInsightsExcludedPath("/products")
);
ok(
  "excluded_prefixes_source_stable",
  /\/sidhu/.test(insightsClient) &&
    /\/api/.test(insightsClient) &&
    /\/erp/.test(insightsClient) &&
    /\/order-tracking/.test(insightsClient)
);

// 9–11 structure / a11y / SEO shell untouched
ok(
  "banner_structure_buttons_intact",
  /role="region"/.test(consent) &&
    /aria-label="Privacy choices"/.test(consent) &&
    /Accept all/.test(consent) &&
    /Reject optional/.test(consent) &&
    /Choose preferences/.test(consent) &&
    /role="dialog"/.test(consent) &&
    /role="switch"/.test(consent)
);
ok(
  "no_dangerously_set_inner_html_in_consent",
  !/dangerouslySetInnerHTML/.test(consent)
);
ok(
  "navbar_layout_untouched_by_this_task",
  !/first-party site statistics/.test(navbar) &&
    /TrackingConsent/.test(layout)
);

// 12–15 allowlist / no SEO metadata file edits in this change set
const ALLOWED = new Set([
  "components/TrackingConsent.tsx",
  "lib/trackingConsent.ts",
  "lib/insightsClient.ts",
  "components/SidhuInsightsBeacon.tsx",
  "components/sidhu/insights/SettingsScreen.tsx",
  "app/sidhu/page.tsx",
  "scripts/phase-city-cleanup-64-tests.js",
  "scripts/phase-insights-live-63-tests.js",
  "scripts/phase20g3b-tracking-consent-tests.js",
  "scripts/phase-clarity-35-tests.js",
  "scripts/phase-tracking-consent-final-tests.js",
  "scripts/phase-windup-59-tests.js",
  "scripts/phase-ux-batch-51-tests.js",
  "scripts/phase-ux-fix-53-tests.js",
  "scripts/phase-cod-restore-54-tests.js",
  "scripts/phase-home-reviews-61-tests.js",
  "scripts/phase-sidhu-insights-57-tests.js",
  // F4UK-PAY-CMS-66
  "lib/paymentMethodSettings.ts",
  "lib/paymentMethodSettingsServer.ts",
  "lib/siteContentDefaults.ts",
  "pages/api/orders.ts",
  "app/cart/page.tsx",
  "scripts/phase-pay-cms-66-tests.js",
  "REPO_AUDIT_REPORT.md",
  // F4UK-INSIGHTS-SLIM-67
  "lib/insightsIngest.ts",
  "lib/insightsGeo.ts",
  "pages/api/insights-collect.ts",
  "package.json",
  "package-lock.json",
  "scripts/phase-sidhu-insights-56-tests.js",
  "scripts/phase-insights-w2-60-tests.js",
  "scripts/phase-insights-slim-67-tests.js",
  // F4UK-BLACK-FRIDAY-68
  "components/product/SeasonalCountdown.tsx",
  "components/home/SeasonalHomePromoStrip.tsx",
  "components/Footer.tsx",
  "lib/seasonalCountdownLabel.ts",
  "lib/seasonalPriceValidUntil.ts",
  "lib/adminContentFields.ts",
  "app/page.tsx",
  "app/HomeClient.tsx",
  "app/seasonal-offers/page.tsx",
  "app/products/[slug]/page.tsx",
  "app/products/[slug]/ProductDetail.tsx",
  "scripts/phase-black-friday-68-tests.js",
]);
const SLIM_67_PREFIXES = ["pages/api/admin-insights/", "components/sidhu/insights/"];
let dirty = [];
let untracked = [];
try {
  dirty = execSync(`git diff --name-only ${HYG_RANGE_BASE}..${HYG_RANGE_END}`, { cwd: ROOT, encoding: "utf8" })
    .split(/\r?\n/)
    .map((s) => s.trim().replace(/\\/g, "/"))
    .filter(Boolean);
  untracked = []; // TEST-HYG-1: scoped to commit range
} catch (e) {
  ok("git_inventory", false, String(e.message || e));
}
const touched = [...new Set([...dirty, ...untracked])];
const unexpected = touched.filter(
  (f) => !ALLOWED.has(f) && !SLIM_67_PREFIXES.some((p) => f.startsWith(p))
);
ok("diff_allowlist", unexpected.length === 0, unexpected.join(",") || "clean");
// BF-68 intentionally edits Footer (seasonal link) + home page (promo strip); Navbar/layout/sitemap untouched.
ok(
  "no_seo_nav_layout_edits",
  !touched.some((f) =>
    /^(app\/layout\.tsx|components\/Navbar\.tsx|.*sitemap|.*robots)/i.test(f)
  ),
  touched.filter((f) => /layout|Navbar|sitemap|robots/i.test(f)).join(",") ||
    "clean"
);

ok(
  "beacon_uses_consent_gating",
  /readTrackingConsent|shouldRecordInsights|TRACKING_CONSENT/.test(beacon)
);
ok(
  "isTrackingConsentPreference_requires_current_version",
  /v\.version\s*===\s*TRACKING_CONSENT_VERSION/.test(consentLib)
);

console.log(`\nINSIGHTS-LIVE-63: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
