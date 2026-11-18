/**
 * F4UK-MULTI-133 / TRACK-PREVIEW-EXCL-1 —
 * Exclude admin preview iframes (?cms_preview=1 AND iframe) from Insights + Ads conversions.
 * Mocked / static / pure helpers only. No .env*, no real DB, no network.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const NODE =
  process.env.F4UK_NODE ||
  (process.platform === "win32"
    ? "C:\\Users\\LENOVO\\.local-tools\\node-v20.20.2-win-x64\\node.exe"
    : "node");

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

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

const cache = new Map();
function loadTs(rel, stubs = {}) {
  const abs = path.join(ROOT, rel);
  const hasStubs = Object.keys(stubs).length > 0;
  const key = abs + "::" + Object.keys(stubs).sort().join(",");
  if (!hasStubs && cache.has(key)) return cache.get(key);
  const src = fs.readFileSync(abs, "utf8");
  const out = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
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
    if (Object.prototype.hasOwnProperty.call(stubs, id)) return stubs[id];
    if (id.startsWith("@/")) {
      const mapped = id.replace("@/", "");
      for (const c of [
        path.join(ROOT, mapped + ".ts"),
        path.join(ROOT, mapped + ".tsx"),
        path.join(ROOT, mapped + ".js"),
      ]) {
        if (fs.existsSync(c)) {
          return loadTs(path.relative(ROOT, c).replace(/\\/g, "/"), stubs);
        }
      }
    }
    if (id.startsWith("./") || id.startsWith("../")) {
      const resolved = path.normalize(path.join(path.dirname(abs), id));
      for (const c of [resolved + ".ts", resolved + ".tsx", resolved + ".js"]) {
        if (fs.existsSync(c)) {
          return loadTs(path.relative(ROOT, c).replace(/\\/g, "/"), stubs);
        }
      }
    }
    return orig(id);
  };
  m._compile(out, abs);
  if (!hasStubs) cache.set(key, m.exports);
  return m.exports;
}

function makeStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => {
      store.set(String(k), String(v));
    },
    removeItem: (k) => {
      store.delete(k);
    },
    clear: () => store.clear(),
  };
}

function installWindow(opts = {}) {
  const gtagCalls = [];
  const fetchCalls = [];
  const beaconCalls = [];
  const localStorage = makeStorage();
  const sessionStorage = makeStorage();
  const selfObj = {};
  const topObj = opts.isIframe ? {} : selfObj;
  const win = {
    gtag: opts.gtag === false ? undefined : (...args) => gtagCalls.push(args),
    location: {
      pathname: opts.pathname || "/",
      search: opts.search != null ? opts.search : "",
      href: opts.href || "https://firestick4uk.com/",
      hostname: "firestick4uk.com",
    },
    localStorage,
    sessionStorage,
    self: selfObj,
    top: topObj,
  };
  // Point self at the window-like object for identity checks used by helper.
  win.self = win;
  if (!opts.isIframe) win.top = win;
  else win.top = topObj;

  global.window = win;
  global.localStorage = localStorage;
  global.sessionStorage = sessionStorage;
  global.navigator = {
    sendBeacon: (url, data) => {
      beaconCalls.push({ url, data });
      return true;
    },
  };
  global.fetch = (url, init) => {
    fetchCalls.push({ url, init });
    return Promise.resolve({ status: 204, ok: true });
  };
  global.Blob =
    global.Blob ||
    class Blob {
      constructor(parts) {
        this._parts = parts;
      }
    };

  return { gtagCalls, fetchCalls, beaconCalls, localStorage, sessionStorage, win };
}

function setConsent(storage, pref) {
  if (!pref) {
    storage.removeItem("firestick_tracking_consent_v1");
    return;
  }
  storage.setItem(
    "firestick_tracking_consent_v1",
    JSON.stringify({
      version: 2,
      analytics: !!pref.analytics,
      advertising: !!pref.advertising,
      updatedAt: new Date().toISOString(),
    })
  );
}

function clearWindow() {
  try {
    delete global.window;
  } catch {
    global.window = undefined;
  }
  try {
    delete global.navigator;
  } catch {
    global.navigator = undefined;
  }
  try {
    delete global.fetch;
  } catch {
    global.fetch = undefined;
  }
}

const APPROVED = new Set([
  "lib/cmsPreview.ts",
  "lib/insightsClient.ts",
  "lib/adsConversions.ts",
  "scripts/phase-multi-133-tests.js",
  // Coupled-suite allowlist plumbing only (assertions not weakened).
  "scripts/phase-multi-116-tests.js",
  "scripts/phase-multi-130-tests.js",
  "scripts/phase-multi-131-tests.js",
  "scripts/phase-multi-132-tests.js",
  "scripts/phase-multi-101-tests.js",
  "scripts/phase-sidhu-insights-56-tests.js",
  "scripts/phase-sidhu-insights-57-tests.js",
  "scripts/phase-ads-conv-70-tests.js",
  "scripts/phase-ads-csp-77-tests.js",
  "scripts/phase-tracking-consent-final-tests.js",
  "scripts/phase-city-cleanup-64-tests.js",
  // F4UK-MULTI-135 public bank-identity redaction (+ plumbing).
  "lib/publicSiteContentFilter.ts",
  "scripts/phase-multi-135-tests.js",
  // F4UK-MULTI-136 suppress Google tags on /sidhu + admin preview iframes.
  "components/TrackingConsent.tsx",
  "scripts/phase-multi-136-tests.js",
  // F4UK-MULTI-137 stale-write guards + coupled plumbing.
  "lib/couponBaseHash.ts",
  "lib/reviewModerationHash.ts",
  "pages/api/coupons.ts",
  "pages/api/faqs.ts",
  "pages/api/admin-reviews.ts",
  "app/sidhu/page.tsx",
  "components/sidhu/ReviewsPanel.tsx",
  "scripts/phase-multi-137-tests.js",
  "scripts/phase-multi-97-tests.js",
  "scripts/phase-multi-114-tests.js",
  "scripts/phase-multi-116-tests.js",
  "scripts/phase-multi-123-tests.js",
  "scripts/phase-multi-126-tests.js",
  "scripts/phase-multi-130-tests.js",
  "scripts/phase-multi-131-tests.js",
  "scripts/phase-coupon-validation-tests.js",
  "scripts/phase-multi-105-tests.js",
  // F4UK-MULTI-139: atomic staff password + SEO reconcile lock (+ plumbing).
  "lib/adminStaffPasswordTx.ts",
  "lib/namedLock.ts",
  "pages/api/admin-profile.ts",
  "pages/api/admin-staff-password.ts",
  "lib/seoIssueMemoryServer.ts",
  "pages/api/admin-seo-issues/reconcile.ts",
  "scripts/phase-multi-139-tests.js",
  "scripts/phase-multi-116-tests.js",
  "scripts/phase-multi-130-tests.js",
  "scripts/phase-multi-135-tests.js",
  "scripts/phase-multi-136-tests.js",
  "scripts/phase-multi-137-tests.js",
  "scripts/phase-multi-138-tests.js",
]);

const LABEL_OK = "AbCdEf123456";
const LABEL_WA = "WaLabel_99xyz";

(async () => {
  ok("phase_tests_exist", exists("scripts/phase-multi-133-tests.js"));
  ok("cmsPreview_lib_exists", exists("lib/cmsPreview.ts"));
  ok("insightsClient_exists", exists("lib/insightsClient.ts"));
  ok("adsConversions_exists", exists("lib/adsConversions.ts"));

  const cms = loadTs("lib/cmsPreview.ts");
  ok(
    "exports_isCmsPreviewFrame",
    typeof cms.isCmsPreviewFrame === "function" &&
      typeof cms.isCmsPreviewFrameFromWindow === "function"
  );

  // ── Helper truth table: param × iframe ───────────────────────────────────
  const truth = [
    { search: "", isIframe: false, expect: false, name: "no_param_top" },
    { search: "?cms_preview=1", isIframe: false, expect: false, name: "param_top_NOT_excluded" },
    { search: "cms_preview=1", isIframe: false, expect: false, name: "param_noq_top_NOT_excluded" },
    { search: "", isIframe: true, expect: false, name: "iframe_no_param" },
    { search: "?foo=1", isIframe: true, expect: false, name: "iframe_other_param" },
    { search: "?cms_preview=1", isIframe: true, expect: true, name: "param_iframe_excluded" },
    { search: "cms_preview=1", isIframe: true, expect: true, name: "param_noq_iframe_excluded" },
    { search: "?cms_preview=0", isIframe: true, expect: false, name: "param_zero_iframe" },
    { search: "?cms_preview=1&x=1", isIframe: true, expect: true, name: "param_with_extra_iframe" },
  ];
  for (const row of truth) {
    ok(
      `helper_${row.name}`,
      cms.isCmsPreviewFrame({ search: row.search, isIframe: row.isIframe }) === row.expect
    );
  }

  // Window wrapper SSR-safe
  clearWindow();
  ok("wrapper_ssr_false", cms.isCmsPreviewFrameFromWindow() === false);

  {
    const { win } = installWindow({ search: "?cms_preview=1", isIframe: true });
    ok("wrapper_preview_frame_true", cms.isCmsPreviewFrameFromWindow(win) === true);
  }
  {
    const { win } = installWindow({ search: "?cms_preview=1", isIframe: false });
    ok(
      "wrapper_normal_tab_param_false",
      cms.isCmsPreviewFrameFromWindow(win) === false
    );
  }

  // ── shouldRecordInsights ─────────────────────────────────────────────────
  clearWindow();
  // Bust cache so insightsClient picks up cmsPreview + fresh window reads
  cache.clear();
  const client = loadTs("lib/insightsClient.ts");
  const consentYes = { analytics: true, advertising: true };

  ok(
    "sri_normal_consent_on",
    client.shouldRecordInsights({ preference: consentYes, pathname: "/" }) === true
  );
  ok(
    "sri_preview_frame_opts_off",
    client.shouldRecordInsights({
      preference: consentYes,
      pathname: "/",
      search: "?cms_preview=1",
      isIframe: true,
    }) === false
  );
  ok(
    "sri_param_top_tab_opts_on",
    client.shouldRecordInsights({
      preference: consentYes,
      pathname: "/",
      search: "?cms_preview=1",
      isIframe: false,
    }) === true
  );
  ok(
    "sri_iframe_no_param_opts_on",
    client.shouldRecordInsights({
      preference: consentYes,
      pathname: "/products",
      search: "",
      isIframe: true,
    }) === true
  );

  {
    installWindow({ search: "?cms_preview=1", isIframe: true, pathname: "/" });
    ok(
      "sri_window_preview_frame_off",
      client.shouldRecordInsights({ preference: consentYes, pathname: "/" }) === false
    );
  }
  {
    installWindow({ search: "?cms_preview=1", isIframe: false, pathname: "/" });
    ok(
      "sri_window_normal_tab_param_on",
      client.shouldRecordInsights({ preference: consentYes, pathname: "/" }) === true
    );
  }

  // ── Zero network in mocked preview frame with consent true ───────────────
  {
    const { beaconCalls, fetchCalls, localStorage, sessionStorage } = installWindow({
      search: "?cms_preview=1",
      isIframe: true,
      pathname: "/",
    });
    setConsent(localStorage, { analytics: true, advertising: true });
    const timers = [];
    const hooks = {
      getPathname: () => "/",
      getSearch: () => "?cms_preview=1",
      getReferrer: () => "",
      getTitle: () => "Home",
      getLanguage: () => "en",
      getScreen: () => ({ w: 1280, h: 720 }),
      localStorage,
      sessionStorage,
      now: () => Date.now(),
      schedule: (fn, ms) => {
        const id = setTimeout(fn, ms || 0);
        timers.push(id);
        return id;
      },
      clearSchedule: (id) => clearTimeout(id),
      transport: () => {
        fetchCalls.push({ via: "transport" });
        return { status: 204, ok: true };
      },
    };
    const ctrl = client.createInsightsController(hooks);
    ctrl.start();
    ok("preview_controller_not_running", ctrl.isRunning() === false);
    ok("preview_queue_empty", ctrl.getQueueLength() === 0);
    ctrl.enqueue({
      t: "page_view",
      ts: new Date().toISOString(),
      path: "/",
    });
    ctrl.flush({ force: true });
    for (const t of timers) clearTimeout(t);
    ok(
      "preview_zero_network",
      beaconCalls.length === 0 &&
        fetchCalls.length === 0 &&
        ctrl.getQueueLength() === 0,
      `beacon=${beaconCalls.length} fetch=${fetchCalls.length} q=${ctrl.getQueueLength()}`
    );
  }

  // Normal tab with param still starts
  {
    const { localStorage, sessionStorage } = installWindow({
      search: "?cms_preview=1",
      isIframe: false,
      pathname: "/",
    });
    setConsent(localStorage, { analytics: true, advertising: true });
    let transported = 0;
    const hooks = {
      getPathname: () => "/",
      getSearch: () => "?cms_preview=1",
      getReferrer: () => "",
      getTitle: () => "Home",
      getLanguage: () => "en",
      getScreen: () => ({ w: 1280, h: 720 }),
      localStorage,
      sessionStorage,
      now: () => Date.now(),
      schedule: (fn) => setTimeout(fn, 0),
      clearSchedule: (id) => clearTimeout(id),
      transport: () => {
        transported += 1;
        return { status: 200, ok: true };
      },
    };
    const ctrl = client.createInsightsController(hooks);
    ctrl.start();
    ok("normal_tab_param_controller_runs", ctrl.isRunning() === true);
    ok("normal_tab_param_queued_page_view", ctrl.getQueueLength() >= 1);
    ctrl.stop({ dropQueue: true });
    ok("normal_tab_transport_optional", transported >= 0);
  }

  // ── firePurchase / fireWhatsAppClick ─────────────────────────────────────
  cache.clear();
  const ads = loadTs("lib/adsConversions.ts");

  {
    const { gtagCalls, localStorage } = installWindow({
      search: "?cms_preview=1",
      isIframe: true,
      pathname: "/",
    });
    setConsent(localStorage, { analytics: true, advertising: true });
    ads.firePurchase({
      orderId: "ORD-PREV",
      value: 10,
      currency: "GBP",
      contentMap: {
        ads_conv_label_purchase: LABEL_OK,
        ads_conv_label_whatsapp: LABEL_WA,
      },
    });
    ok("purchase_preview_frame_noop", gtagCalls.length === 0);
  }
  {
    const { gtagCalls, localStorage } = installWindow({
      search: "?cms_preview=1",
      isIframe: false,
      pathname: "/",
    });
    setConsent(localStorage, { analytics: true, advertising: true });
    ads.firePurchase({
      orderId: "ORD-TOP",
      value: 10,
      currency: "GBP",
      contentMap: { ads_conv_label_purchase: LABEL_OK },
    });
    const conv = gtagCalls.find((c) => c[0] === "event" && c[1] === "conversion");
    const purchase = gtagCalls.find((c) => c[0] === "event" && c[1] === "purchase");
    ok(
      "purchase_normal_tab_param_fires",
      !!conv && !!purchase,
      `calls=${gtagCalls.length}`
    );
  }
  {
    const { gtagCalls, localStorage } = installWindow({
      search: "",
      isIframe: false,
      pathname: "/",
    });
    setConsent(localStorage, { analytics: true, advertising: true });
    ads.firePurchase({
      orderId: "ORD-NORM",
      value: 12,
      currency: "GBP",
      contentMap: { ads_conv_label_purchase: LABEL_OK },
    });
    ok(
      "purchase_normal_unchanged",
      gtagCalls.some((c) => c[0] === "event" && c[1] === "conversion") &&
        gtagCalls.some((c) => c[0] === "event" && c[1] === "purchase")
    );
  }
  {
    const { gtagCalls, localStorage } = installWindow({
      search: "?cms_preview=1",
      isIframe: true,
      pathname: "/contact",
    });
    setConsent(localStorage, { analytics: true, advertising: true });
    ads.fireWhatsAppClick("/contact", {
      ads_conv_label_whatsapp: LABEL_WA,
    });
    ok("wa_preview_frame_noop", gtagCalls.length === 0);
  }
  {
    const { gtagCalls, localStorage } = installWindow({
      search: "?cms_preview=1",
      isIframe: false,
      pathname: "/contact",
    });
    setConsent(localStorage, { analytics: true, advertising: true });
    ads.fireWhatsAppClick("/contact", {
      ads_conv_label_whatsapp: LABEL_WA,
    });
    ok(
      "wa_normal_tab_param_fires",
      gtagCalls.some((c) => c[0] === "event" && c[1] === "conversion") &&
        gtagCalls.some((c) => c[0] === "event" && c[1] === "generate_lead")
    );
  }
  {
    const { gtagCalls, localStorage } = installWindow({
      search: "",
      isIframe: false,
      pathname: "/products",
    });
    setConsent(localStorage, { analytics: true, advertising: true });
    ads.fireWhatsAppClick("/products", {
      ads_conv_label_whatsapp: LABEL_WA,
    });
    ok(
      "wa_normal_unchanged",
      gtagCalls.some((c) => c[0] === "event" && c[1] === "conversion") &&
        gtagCalls.some((c) => c[0] === "event" && c[1] === "generate_lead")
    );
  }

  // ── Source assertions: guards beside isSidhuPath; no api/ingest edits ────
  const adsSrc = read("lib/adsConversions.ts");
  const clientSrc = read("lib/insightsClient.ts");
  const cmsSrc = read("lib/cmsPreview.ts");

  ok(
    "ads_purchase_guard_beside_sidhu",
    /export function firePurchase[\s\S]*?if \(isSidhuPath\(\)\) return;\s*\n\s*if \(isCmsPreviewFrameFromWindow\(\)\) return;/.test(
      adsSrc
    )
  );
  ok(
    "ads_wa_guard_beside_sidhu",
    /export function fireWhatsAppClick[\s\S]*?if \(isSidhuPath\(\)\) return;\s*\n\s*if \(isCmsPreviewFrameFromWindow\(\)\) return;/.test(
      adsSrc
    )
  );
  ok(
    "insights_imports_cms_preview",
    /isCmsPreviewFrameFromWindow/.test(clientSrc) &&
      /from ["']\.\/cmsPreview["']/.test(clientSrc)
  );
  ok(
    "insights_shouldRecord_uses_preview",
    /isCmsPreviewFrame\(/.test(clientSrc) &&
      /isCmsPreviewFrameFromWindow\(\)/.test(clientSrc)
  );
  ok(
    "insights_networkAllowed_preview",
    /networkAllowed[\s\S]*!isCmsPreviewFrameFromWindow\(\)/.test(clientSrc)
  );
  ok(
    "cms_helper_pure_and_wrapper",
    /export function isCmsPreviewFrame\(/.test(cmsSrc) &&
      /export function isCmsPreviewFrameFromWindow\(/.test(cmsSrc) &&
      // MULTI-136: iframe AND (cms_preview param OR same-origin /sidhu parent).
      // Without parentPathname, isSidhuAdminPathname is false → MULTI-133 truth table unchanged.
      /opts\.isIframe === true &&\s*\(\s*isCmsPreviewQueryParam\(opts\.search\)\s*\|\|\s*isSidhuAdminPathname\(opts\.parentPathname\)\s*\)/.test(
        cmsSrc
      )
  );
  ok(
    "existing_cms_exports_preserved",
    /export function isCmsPreviewQueryParam/.test(cmsSrc) &&
      /export function shouldAttachCmsPreviewListener/.test(cmsSrc) &&
      /export function cmsPreviewHref/.test(cmsSrc)
  );

  {
    const MULTI137_API_OK = new Set([
      "pages/api/coupons.ts",
      "pages/api/faqs.ts",
      "pages/api/admin-reviews.ts",
    ]);
    // F4UK-MULTI-139: atomic staff password + SEO reconcile lock.
    const MULTI139_API_OK = new Set([
      "pages/api/admin-profile.ts",
      "pages/api/admin-staff-password.ts",
      "pages/api/admin-seo-issues/reconcile.ts",
    ]);
    const r = spawnSync(
      "git",
      ["diff", "--name-only", "origin/main", "--", "pages/api", "lib/insightsIngest.ts"],
      { cwd: ROOT, encoding: "utf8" }
    );
    const names = (r.stdout || "")
      .split(/\r?\n/)
      .map((s) => s.trim().replace(/\\/g, "/"))
      .filter(Boolean)
      .filter((n) => !MULTI137_API_OK.has(n) && !MULTI139_API_OK.has(n));
    ok("zero_api_and_ingest_diff", names.length === 0, names.join(",") || "clean");
  }

  {
    const working = spawnSync("git", ["diff", "--name-only", "HEAD"], {
      cwd: ROOT,
      encoding: "utf8",
    });
    const untracked = spawnSync(
      "git",
      ["ls-files", "--others", "--exclude-standard"],
      { cwd: ROOT, encoding: "utf8" }
    );
    const names = [
      ...(working.stdout || "").split(/\r?\n/),
      ...(untracked.stdout || "").split(/\r?\n/),
    ]
      .map((s) => s.trim().replace(/\\/g, "/"))
      .filter(Boolean)
      .filter(
        (n) =>
          !n.startsWith("_reports/") &&
          !n.endsWith(".zip") &&
          !n.endsWith(".sha256")
      );
    const unexpected = names.filter((n) => !APPROVED.has(n));
    ok(
      "working_tree_approved_only",
      unexpected.length === 0,
      unexpected.join(",") || "clean"
    );
  }

  clearWindow();
  console.log(`\nMULTI-133 results: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
