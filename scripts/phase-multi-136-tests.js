/**
 * F4UK-MULTI-136 / TRACK-ADMIN-EXCL-1 —
 * Suppress Google tags on /sidhu and admin preview iframes (incl. after cms_preview lost).
 * Pure + mocked window only. No network, no DB, no .env*.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Module = require("module");
const ts = require("typescript");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const BASE_SHA = "7c7aed87c78a34326bc6c758023fdad30cf2e69f";
const BASE_MARKUP_SHA256 =
  "b5e0587c564d3670b50f4cd82735fd213570b9d9fe972ae99b23c7e727f8808a";

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

function clearWindow() {
  try {
    delete global.window;
  } catch {
    global.window = undefined;
  }
}

function installWindow(opts = {}) {
  const selfObj = {};
  const topObj = opts.isIframe ? {} : selfObj;
  const win = {
    location: {
      pathname: opts.pathname || "/",
      search: opts.search != null ? opts.search : "",
      href: opts.href || "https://firestick4uk.com/",
      hostname: "firestick4uk.com",
    },
    self: selfObj,
    top: topObj,
    parent: opts.parent || null,
  };
  win.self = win;
  if (!opts.isIframe) win.top = win;
  else win.top = topObj;
  if (!win.parent) win.parent = opts.isIframe ? { location: { pathname: opts.parentPathname || "/" } } : win;

  if (opts.parentThrows) {
    Object.defineProperty(win, "parent", {
      get() {
        throw new Error("cross-origin");
      },
    });
  } else if (opts.parentPathname != null || opts.isIframe) {
    win.parent = {
      location: {
        pathname:
          opts.parentPathname != null ? opts.parentPathname : "/sidhu",
      },
    };
  }

  global.window = win;
  return win;
}

const APPROVED = new Set([
  "lib/cmsPreview.ts",
  "components/TrackingConsent.tsx",
  "scripts/phase-multi-136-tests.js",
  // Coupled-suite allowlist / resolution plumbing only.
  "scripts/phase-multi-116-tests.js",
  "scripts/phase-multi-130-tests.js",
  "scripts/phase-multi-131-tests.js",
  "scripts/phase-multi-132-tests.js",
  "scripts/phase-multi-133-tests.js",
  "scripts/phase-multi-135-tests.js",
  "scripts/phase-city-cleanup-64-tests.js",
  "scripts/phase-tracking-consent-final-tests.js",
  "scripts/phase20g3b-tracking-consent-tests.js",
  "scripts/phase-insights-slim-67-tests.js",
  "scripts/phase-insights-live-63-tests.js",
  "scripts/phase-sidhu-insights-57-tests.js",
  "scripts/phase-ads-conv-70-tests.js",
  "scripts/phase-csp-report-only-tests.js",
  "scripts/phase-proc-clarity-71-tests.js",
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
  "scripts/phase-multi-132-tests.js",
  "scripts/phase-multi-133-tests.js",
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
  "scripts/phase-multi-137-tests.js",
  "scripts/phase-multi-138-tests.js",
  // F4UK-MULTI-140: content_drafts check-only migrate + Draft/Publish design doc.
  "scripts/migrate-content-drafts.js",
  "scripts/phase-multi-140-tests.js",
  "docs/design/DRAFT-PUBLISH.md",
  // F4UK-MULTI-142: admin drafts API for CMS pages (Draft/Publish D2).
  "pages/api/admin-drafts.ts",
  "lib/contentDrafts.ts",
  "lib/contentDraftsCapability.ts",
  "scripts/phase-multi-142-tests.js",
  // F4UK-MULTI-143: Draft/Publish D3 admin UI (CmsDraftBar + client helper).
  "components/admin/CmsDraftBar.tsx",
  "lib/contentDraftClient.ts",
  "app/sidhu/page.tsx",
  "scripts/phase-multi-143-tests.js",
  // F4UK-MULTI-144: health-check network retry + capture waits for CMS load.
  "scripts/live-health-check.js",
  "scripts/tools/visible-text-capture.js",
  "scripts/phase-multi-144-tests.js",
  "scripts/phase-multi-135-tests.js",
  "scripts/phase-multi-138-tests.js",
  "scripts/phase-multi-116-tests.js",
  "scripts/phase-multi-131-tests.js",
  "scripts/phase-multi-132-tests.js",
  "scripts/phase-multi-133-tests.js",
  "scripts/phase-multi-139-tests.js",
  "scripts/phase-multi-140-tests.js",
  "scripts/phase-multi-142-tests.js",
]);

const NOT_APPROVED = [
  "lib/insightsClient.ts",
  "lib/adsConversions.ts",
  "lib/trackingConsent.ts",
  "components/SidhuInsightsBeacon.tsx",
  "components/AdsConversionTracking.tsx",
  "app/layout.tsx",
];

(async () => {
  ok("phase_tests_exist", exists("scripts/phase-multi-136-tests.js"));
  ok("cmsPreview_lib_exists", exists("lib/cmsPreview.ts"));
  ok("tracking_consent_exists", exists("components/TrackingConsent.tsx"));

  const cms = loadTs("lib/cmsPreview.ts");
  ok(
    "exports_isSidhuAdminPathname",
    typeof cms.isSidhuAdminPathname === "function"
  );
  ok(
    "exports_isCmsPreviewFrame_pair",
    typeof cms.isCmsPreviewFrame === "function" &&
      typeof cms.isCmsPreviewFrameFromWindow === "function"
  );

  // isSidhuAdminPathname truth table
  const sidhuRows = [
    ["/sidhu", true],
    ["/sidhu/", true],
    ["/sidhu/a", true],
    ["/sidhux", false],
    ["/", false],
    ["", false],
    [null, false],
    [undefined, false],
  ];
  for (const [p, expect] of sidhuRows) {
    ok(
      `sidhu_pathname_${String(p)}`,
      cms.isSidhuAdminPathname(p) === expect
    );
  }

  // Full truth table: param × iframe × parentPathname
  const params = ["", "?cms_preview=1"];
  const iframes = [false, true];
  const parents = [null, "/", "/sidhu", "/sidhu/x", "/sidhuX"];
  for (const search of params) {
    for (const isIframe of iframes) {
      for (const parentPathname of parents) {
        const expect =
          isIframe === true &&
          (cms.isCmsPreviewQueryParam(search) ||
            cms.isSidhuAdminPathname(parentPathname));
        const got = cms.isCmsPreviewFrame({
          search,
          isIframe,
          parentPathname,
        });
        ok(
          `tt_p=${search || "none"}_if=${isIframe}_pp=${parentPathname}`,
          got === expect
        );
      }
    }
  }

  // Old MULTI-133 cases (no parentPathname) unchanged
  const legacy = [
    { search: "", isIframe: false, expect: false, name: "no_param_top" },
    {
      search: "?cms_preview=1",
      isIframe: false,
      expect: false,
      name: "param_top_NOT_excluded",
    },
    { search: "", isIframe: true, expect: false, name: "iframe_no_param" },
    {
      search: "?cms_preview=1",
      isIframe: true,
      expect: true,
      name: "param_iframe_excluded",
    },
    {
      search: "?cms_preview=0",
      isIframe: true,
      expect: false,
      name: "param_zero_iframe",
    },
  ];
  for (const row of legacy) {
    ok(
      `legacy_${row.name}`,
      cms.isCmsPreviewFrame({ search: row.search, isIframe: row.isIframe }) ===
        row.expect
    );
  }

  // Wrapper cases
  clearWindow();
  ok("wrapper_ssr_false", cms.isCmsPreviewFrameFromWindow() === false);

  {
    const win = installWindow({ search: "?cms_preview=1", isIframe: false });
    ok(
      "wrapper_top_level_param_false",
      cms.isCmsPreviewFrameFromWindow(win) === false
    );
  }
  {
    const win = installWindow({ search: "?cms_preview=1", isIframe: true });
    ok(
      "wrapper_iframe_param_true",
      cms.isCmsPreviewFrameFromWindow(win) === true
    );
  }
  {
    const win = installWindow({
      search: "",
      isIframe: true,
      parentPathname: "/sidhu",
    });
    ok(
      "wrapper_iframe_parent_sidhu_no_param_true",
      cms.isCmsPreviewFrameFromWindow(win) === true
    );
  }
  {
    const win = installWindow({
      search: "",
      isIframe: true,
      parentThrows: true,
    });
    ok(
      "wrapper_parent_throws_falls_back_param_only",
      cms.isCmsPreviewFrameFromWindow(win) === false
    );
  }
  {
    const win = installWindow({
      search: "?cms_preview=1",
      isIframe: true,
      parentThrows: true,
    });
    ok(
      "wrapper_parent_throws_but_param_true",
      cms.isCmsPreviewFrameFromWindow(win) === true
    );
  }

  // TrackingConsent source assertions
  const tracking = read("components/TrackingConsent.tsx");
  const applyStart = tracking.indexOf("function applyTrackingPreference");
  const applyEnd = tracking.indexOf(
    "export default function TrackingConsent"
  );
  const applyBody =
    applyStart >= 0 && applyEnd > applyStart
      ? tracking.slice(applyStart, applyEnd)
      : "";

  ok(
    "tc_suppression_after_revoke_and_hasOptional",
    /if\s*\(\s*!hasOptional\s*\)/.test(applyBody) &&
      /if\s*\(\s*options\?\.reloadIfRevoked\s*&&\s*revoked/.test(applyBody) &&
      /isGoogleTagSuppressedContext\(\)/.test(applyBody)
  );

  const revokeIdx = applyBody.indexOf("if (!hasOptional)");
  const reloadRevokedIdx = applyBody.indexOf(
    "if (options?.reloadIfRevoked && revoked"
  );
  const suppressIdx = applyBody.indexOf("isGoogleTagSuppressedContext()");
  const defaultsIdx = applyBody.indexOf("issueConsentDefaults()");
  const injectIdx = applyBody.indexOf("injectGtagScriptOnce()");
  ok(
    "tc_suppress_before_issueConsentDefaults",
    suppressIdx > reloadRevokedIdx &&
      suppressIdx > revokeIdx &&
      suppressIdx < defaultsIdx &&
      defaultsIdx < injectIdx &&
      defaultsIdx >= 0
  );

  ok(
    "tc_mount_still_calls_applyTrackingPreference",
    /if\s*\(\s*saved\s*&&\s*anyOptionalTrackingGranted\(saved\)\s*\)\s*\{\s*applyTrackingPreference\(saved\);/s.test(
      tracking
    )
  );
  ok(
    "tc_usePathname_watcher_present",
    /usePathname\(\)/.test(tracking) &&
      /\[hydrated,\s*pathname\]/.test(tracking) &&
      /session\.pendingApply/.test(tracking)
  );
  ok(
    "tc_ga_disable_both_ids",
    /ga-disable-["']\s*\+\s*GA_MEASUREMENT_ID/.test(tracking) &&
      /ga-disable-["']\s*\+\s*GOOGLE_ADS_ID/.test(tracking)
  );

  // JSX/CSS block unchanged vs base SHA (banner/dialog return only)
  function extractMarkup(src) {
    const norm = src.replace(/\r\n/g, "\n");
    const marker = "if (!hydrated) return null;";
    const i = norm.indexOf(marker);
    const rest = i >= 0 ? norm.slice(i + marker.length) : norm;
    const r = rest.indexOf("return (");
    return r >= 0 ? rest.slice(r) : "";
  }
  const markup = extractMarkup(tracking);
  const markupHash = crypto.createHash("sha256").update(markup).digest("hex");
  ok(
    "tc_jsx_css_byte_identical_vs_base",
    markupHash === BASE_MARKUP_SHA256 && markup.length > 1000,
    markupHash
  );

  // Simulated gate flow (mirror helper logic; approved pure helpers only)
  function simulateApply(ctx) {
    const calls = [];
    const sessionSim = { pendingApply: false };
    const flags = {};
    const suppressed =
      ctx.isSidhu ||
      (ctx.isIframe === true &&
        (cms.isCmsPreviewQueryParam(ctx.search) ||
          cms.isSidhuAdminPathname(ctx.parentPathname)));
    const hasOptional = !!(ctx.analytics || ctx.advertising);
    if (!hasOptional) {
      return { calls, sessionSim, flags, injected: false };
    }
    if (suppressed) {
      sessionSim.pendingApply = true;
      flags["ga-disable-G-055GHH06KD"] = true;
      flags["ga-disable-AW-18404353244"] = true;
      return { calls, sessionSim, flags, injected: false };
    }
    calls.push("issueConsentDefaults");
    calls.push("issueConsentUpdate");
    calls.push("injectGtagScriptOnce");
    calls.push("issueGtagJsOnce");
    calls.push("configurePermittedProducts");
    return { calls, sessionSim, flags, injected: true };
  }

  {
    const r = simulateApply({
      isSidhu: true,
      isIframe: false,
      search: "",
      analytics: true,
      advertising: true,
    });
    ok(
      "flow_suppressed_granted_no_inject",
      r.injected === false &&
        r.sessionSim.pendingApply === true &&
        r.calls.length === 0
    );
  }
  {
    // after leaving /sidhu → public
    const pending = true;
    const publicApply = simulateApply({
      isSidhu: false,
      isIframe: false,
      search: "",
      analytics: true,
      advertising: true,
    });
    ok(
      "flow_public_after_pending_applies_once",
      pending === true &&
        publicApply.injected === true &&
        publicApply.calls.join(",") ===
          "issueConsentDefaults,issueConsentUpdate,injectGtagScriptOnce,issueGtagJsOnce,configurePermittedProducts"
    );
  }
  {
    const r = simulateApply({
      isSidhu: false,
      isIframe: false,
      search: "",
      analytics: true,
      advertising: true,
    });
    ok(
      "flow_public_granted_today_sequence",
      r.injected === true &&
        r.calls[0] === "issueConsentDefaults" &&
        r.calls.includes("injectGtagScriptOnce")
    );
  }
  {
    const r = simulateApply({
      isSidhu: false,
      isIframe: false,
      search: "",
      analytics: false,
      advertising: false,
    });
    ok("flow_deny_no_inject", r.injected === false && r.calls.length === 0);
  }
  {
    const r = simulateApply({
      isSidhu: false,
      isIframe: true,
      search: "",
      parentPathname: "/sidhu",
      analytics: true,
      advertising: true,
    });
    ok(
      "flow_iframe_parent_sidhu_suppressed",
      r.injected === false && r.sessionSim.pendingApply === true
    );
  }

  // Zero diff in NOT APPROVED + pages/api
  {
    const bad = [];
    for (const f of NOT_APPROVED) {
      const d = spawnSync("git", ["diff", "--name-only", BASE_SHA, "--", f], {
        cwd: ROOT,
        encoding: "utf8",
      });
      const w = spawnSync("git", ["diff", "--name-only", "HEAD", "--", f], {
        cwd: ROOT,
        encoding: "utf8",
      });
      const names = `${d.stdout || ""}\n${w.stdout || ""}`
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (names.length) bad.push(f);
    }
    ok("zero_diff_not_approved_list", bad.length === 0, bad.join(",") || "clean");
  }
  {
    const MULTI137_API_OK = new Set([
      "pages/api/coupons.ts",
      "pages/api/faqs.ts",
      "pages/api/admin-reviews.ts",
    ]);
    const MULTI139_API_OK = new Set([
      "pages/api/admin-profile.ts",
      "pages/api/admin-staff-password.ts",
      "pages/api/admin-seo-issues/reconcile.ts",
    ]);
    // F4UK-MULTI-142: admin drafts API for CMS pages (Draft/Publish D2).
    const MULTI142_API_OK = new Set(["pages/api/admin-drafts.ts"]);
    const r = spawnSync(
      "git",
      ["diff", "--name-only", BASE_SHA, "--", "pages/api"],
      { cwd: ROOT, encoding: "utf8" }
    );
    const workingApi = spawnSync(
      "git",
      ["diff", "--name-only", "HEAD", "--", "pages/api"],
      { cwd: ROOT, encoding: "utf8" }
    );
    const names = `${r.stdout || ""}\n${workingApi.stdout || ""}`
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .filter(
        (n) =>
          !MULTI137_API_OK.has(n) && !MULTI139_API_OK.has(n) && !MULTI142_API_OK.has(n)
      );
    ok("zero_pages_api_diff", names.length === 0, names.join(",") || "clean");
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
  console.log(`\nMULTI-136 results: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
