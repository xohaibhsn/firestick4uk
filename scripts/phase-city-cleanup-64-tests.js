/**
 * F4UK-INSIGHTS-CITY-CLEANUP-64 — admin browser opt-out, clarity C3 scope, allowlist.
 */
const fs = require("fs");
const path = require("path");
const { execSync, execFileSync } = require("child_process");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..");
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

function loadTs(rel, extra = {}) {
  const src = read(rel);
  const { outputText } = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
    },
  });
  const sandbox = { exports: {}, module: { exports: {} } };
  const localRequire = (id) => {
    if (id === "./trackingConsent" || id.endsWith("/trackingConsent")) {
      return loadTs("lib/trackingConsent.ts");
    }
    if (id === "./clarityGating" || id.endsWith("/clarityGating")) {
      return loadTs("lib/clarityGating.ts");
    }
    if (id === "./clarityConfig" || id.endsWith("/clarityConfig")) {
      return loadTs("lib/clarityConfig.ts");
    }
    if (id === "./clarityConsent" || id.endsWith("/clarityConsent")) {
      return loadTs("lib/clarityConsent.ts");
    }
    if (extra[id]) return extra[id];
    return require(id);
  };
  const fn = new Function("exports", "module", "require", outputText);
  fn(sandbox.exports, sandbox.module, localRequire);
  return sandbox.module.exports && Object.keys(sandbox.module.exports).length
    ? sandbox.module.exports
    : sandbox.exports;
}

function memStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(String(k), String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
    get _map() {
      return map;
    },
  };
}

const client = loadTs("lib/insightsClient.ts");
const consentLib = loadTs("lib/trackingConsent.ts");
const sidhu = read("app/sidhu/page.tsx");
const settings = read("components/sidhu/insights/SettingsScreen.tsx");
const beacon = read("components/SidhuInsightsBeacon.tsx");
const clientSrc = read("lib/insightsClient.ts");
const clarityTests = read("scripts/phase-clarity-35-tests.js");
const geoSrc = read("lib/insightsGeo.ts");

// 1) Opt-out key constant
ok(
  "optout_key_constant",
  client.INSIGHTS_OPTOUT_KEY === "firestick_insights_optout_v1"
);

// 2) Opt-out set only after authenticated session in /sidhu
ok(
  "optout_set_only_after_authenticated_session",
  /res\?\.authenticated/.test(sidhu) &&
    /localStorage\.setItem\(\s*["']firestick_insights_optout_v1["']\s*,\s*["']1["']\s*\)/.test(
      sidhu
    ) &&
    /if \(res\?\.authenticated\)/.test(sidhu)
);

// 3) Not set on unauthenticated branch
{
  const authBlock = sidhu.match(
    /if \(res\?\.authenticated\)[\s\S]*?else \{[\s\S]*?setLoggedIn\(false\);[\s\S]*?\}/
  );
  ok(
    "optout_not_set_on_unauthenticated",
    !!authBlock &&
      /setItem\(\s*["']firestick_insights_optout_v1["']/.test(authBlock[0]) &&
      !/else \{[\s\S]*setItem\(\s*["']firestick_insights_optout_v1["']/.test(authBlock[0])
  );
}

// 4–5) Beacon / shouldRecordInsights respects flag=1 (no network)
{
  const store = memStorage();
  store.setItem(client.INSIGHTS_OPTOUT_KEY, "1");
  const pref = { version: consentLib.TRACKING_CONSENT_VERSION, analytics: true, advertising: true };
  ok(
    "shouldRecord_false_when_optout",
    client.shouldRecordInsights({ preference: pref, pathname: "/", storage: store }) === false
  );
  const hooks = {
    getPathname: () => "/",
    getSearch: () => "",
    getReferrer: () => "",
    getTitle: () => "t",
    getLanguage: () => "en",
    getScreen: () => ({ w: 1, h: 1 }),
    localStorage: store,
    sessionStorage: memStorage(),
    now: () => Date.now(),
    schedule: (fn) => {
      fn();
      return 1;
    },
    clearSchedule: () => {},
  };
  let sends = 0;
  const ctrl = client.createInsightsController({
    ...hooks,
    transport: () => {
      sends += 1;
      return { status: 200, ok: true };
    },
  });
  // Force consent read: stub via preference already gated by shouldRecord
  ctrl.start();
  ok("beacon_controller_sends_nothing_when_flag_1", sends === 0 && ctrl.isRunning() === false);
}

// 6) Without flag, recording can start (consent true, path ok)
{
  const store = memStorage();
  // Patch readTrackingConsent by storing consent in same shape the module expects
  const rawKey = "firestick_tracking_consent_v1";
  // trackingConsent uses its own key — set via module if exported
  const pref = {
    version: consentLib.TRACKING_CONSENT_VERSION,
    analytics: true,
    advertising: false,
    decidedAt: new Date().toISOString(),
  };
  try {
    if (typeof consentLib.writeTrackingConsent === "function") {
      // may need window — skip runtime write; test shouldRecord only
    }
  } catch {}
  ok(
    "shouldRecord_true_without_optout_with_consent",
    client.shouldRecordInsights({ preference: pref, pathname: "/products", storage: store }) ===
      true
  );
}

// 7) Settings toggle exists and only touches that key
ok(
  "settings_this_browser_row",
  /This browser/.test(settings) &&
    /Include this browser|Exclude this browser/.test(settings) &&
    /setInsightsOptOut/.test(settings) &&
    /INSIGHTS_OPTOUT_KEY/.test(settings)
);
ok(
  "settings_toggle_no_api_no_db",
  (() => {
    const m = settings.match(/function ThisBrowserOptOutCard[\s\S]*?\nexport default function SettingsScreen/);
    const block = m ? m[0] : "";
    return (
      /setInsightsOptOut\(window\.localStorage/.test(block) &&
      !/fetch\(/.test(block) &&
      !/\/api\//.test(block)
    );
  })()
);

// 8) Consent v2 logic unchanged
ok(
  "consent_v2_version_unchanged",
  consentLib.TRACKING_CONSENT_VERSION === 2 ||
    Number(consentLib.TRACKING_CONSENT_VERSION) === 2
);

// 9) Excluded paths unchanged
ok(
  "excluded_paths_unchanged",
  client.INSIGHTS_EXCLUDED_PATH_PREFIXES.includes("/sidhu") &&
    client.INSIGHTS_EXCLUDED_PATH_PREFIXES.includes("/api") &&
    client.INSIGHTS_EXCLUDED_PATH_PREFIXES.includes("/erp") &&
    client.INSIGHTS_EXCLUDED_PATH_PREFIXES.includes("/order-tracking") &&
    client.INSIGHTS_EXCLUDED_PATH_PREFIXES.length === 4
);

// 10) No new dangerouslySetInnerHTML in touched app files
ok(
  "no_new_dangerouslySetInnerHTML",
  !/dangerouslySetInnerHTML/.test(settings) &&
    !/dangerouslySetInnerHTML/.test(beacon) &&
    !/dangerouslySetInnerHTML/.test(clientSrc)
);

// 11) Clarity C3 scoped to its own commit range
ok(
  "clarity_c3_scoped_to_clarity_commit_range",
  /6292b55390318c2c55f31fa8cd17f5fa7cb034bd\.\.af366135f8315a58579d0fa1f1752d0457a8ea36/.test(
    clarityTests
  ) && !/\["diff",\s*"6292b55390318c2c55f31fa8cd17f5fa7cb034bd",\s*"--"/.test(clarityTests)
);

// 12) insightsGeo.ts unchanged vs HEAD parent when only our files dirty — byte check vs origin
{
  const dirty = execSync("git diff --name-only HEAD", { cwd: ROOT, encoding: "utf8" })
    .split(/\r?\n/)
    .map((s) => s.trim().replace(/\\/g, "/"))
    .filter(Boolean);
  const untracked = execSync("git ls-files --others --exclude-standard", {
    cwd: ROOT,
    encoding: "utf8",
  })
    .split(/\r?\n/)
    .map((s) => s.trim().replace(/\\/g, "/"))
    .filter(Boolean);
  const touched = [...new Set([...dirty, ...untracked])];
  ok("insightsGeo_ts_unchanged", !touched.includes("lib/insightsGeo.ts"));
  ok(
    "no_seo_nav_layout_files_changed",
    !touched.some((f) =>
      /^(app\/layout\.tsx|components\/Navbar\.tsx|components\/Footer\.tsx|app\/sitemap\.ts)/.test(
        f
      )
    ),
    touched.filter((f) => /layout|Navbar|Footer|sitemap/i.test(f)).join(",") || "clean"
  );

  const ALLOWED = new Set([
    "lib/insightsClient.ts",
    "components/SidhuInsightsBeacon.tsx",
    "app/sidhu/page.tsx",
    "components/sidhu/insights/SettingsScreen.tsx",
    "scripts/phase-clarity-35-tests.js",
    "scripts/phase-city-cleanup-64-tests.js",
    "scripts/phase-insights-live-63-tests.js",
    "scripts/phase-windup-59-tests.js",
    "scripts/phase-ux-batch-51-tests.js",
    "scripts/phase-ux-fix-53-tests.js",
    "scripts/phase-cod-restore-54-tests.js",
    "scripts/phase-home-reviews-61-tests.js",
    "scripts/phase-sidhu-insights-57-tests.js",
    "scripts/phase-tracking-consent-final-tests.js",
    "scripts/phase20g3b-tracking-consent-tests.js",
  ]);
  const unexpected = touched.filter((f) => !ALLOWED.has(f));
  ok("diff_allowlist_city_cleanup_64", unexpected.length === 0, unexpected.join(",") || "clean");
}

// 13) hasInsightsOptOut / setInsightsOptOut roundtrip
{
  const store = memStorage();
  ok("optout_default_false", client.hasInsightsOptOut(store) === false);
  client.setInsightsOptOut(store, true);
  ok("optout_set_true", store.getItem(client.INSIGHTS_OPTOUT_KEY) === "1");
  client.setInsightsOptOut(store, false);
  ok("optout_cleared", store.getItem(client.INSIGHTS_OPTOUT_KEY) == null);
}

console.log(`\nphase-city-cleanup-64: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
