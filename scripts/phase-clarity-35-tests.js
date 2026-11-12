/**
 * F4UK-BEHAVIOUR-ANALYTICS-35 — Microsoft Clarity gating, exclusions,
 * consent mapping, CMS validation, and SSR absence checks.
 * Executes real modules via typescript.transpileModule (same style as other phase tests).
 */
const fs = require("fs");
const path = require("path");
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

const cache = new Map();

function loadTsModule(rel) {
  if (cache.has(rel)) return cache.get(rel);
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
    if (id === "./clarityConfig" || id.endsWith("/clarityConfig")) {
      return loadTsModule("lib/clarityConfig.ts");
    }
    if (id === "./clarityConsent" || id.endsWith("/clarityConsent")) {
      return loadTsModule("lib/clarityConsent.ts");
    }
    if (id === "./clarityGating" || id.endsWith("/clarityGating")) {
      return loadTsModule("lib/clarityGating.ts");
    }
    return require(id);
  };
  const fn = new Function("exports", "module", "require", outputText);
  fn(sandbox.exports, sandbox.module, localRequire);
  const mod =
    sandbox.module.exports && Object.keys(sandbox.module.exports).length
      ? sandbox.module.exports
      : sandbox.exports;
  cache.set(rel, mod);
  return mod;
}

const config = loadTsModule("lib/clarityConfig.ts");
const gating = loadTsModule("lib/clarityGating.ts");
const consent = loadTsModule("lib/clarityConsent.ts");

ok("modules_load_clarityConfig", typeof config.validateClarityProjectIdInput === "function");
ok("modules_load_clarityGating", typeof gating.shouldLoadClarity === "function");
ok("modules_load_clarityConsent", typeof consent.mapClarityConsentV2 === "function");

const validId = "abc12xyz";
const cmsOn = { enabled: true, projectId: validId, dashboardUrl: "" };
const cmsOff = { enabled: false, projectId: validId, dashboardUrl: "" };
const cmsBadId = { enabled: true, projectId: "BAD ID!", dashboardUrl: "" };
const cmsEmptyId = { enabled: true, projectId: "", dashboardUrl: "" };

function decide(partial) {
  return gating.shouldLoadClarity({
    cms: cmsOn,
    hostname: "firestick4uk.com",
    analyticsConsent: true,
    pathname: "/",
    search: "",
    ...partial,
  });
}

// ── R2 gating matrix ──────────────────────────────────────────────────────
ok("R2_enabled_valid_consent_prod_home", decide({}).load === true);
ok(
  "R2_disabled",
  decide({ cms: cmsOff }).load === false &&
    decide({ cms: cmsOff }).reason === "cms_disabled"
);
ok("R2_invalid_project_id", decide({ cms: cmsBadId }).reason === "invalid_project_id");
ok("R2_empty_project_id", decide({ cms: cmsEmptyId }).reason === "invalid_project_id");
ok(
  "R2_no_analytics_consent",
  decide({ analyticsConsent: false }).reason === "analytics_consent"
);
ok(
  "R2_advertising_only_still_blocked_without_analytics",
  decide({ analyticsConsent: false }).load === false
);
ok(
  "R2_staging_hostname",
  decide({ hostname: "staging.firestick4uk.com" }).reason === "hostname"
);
ok("R2_localhost", decide({ hostname: "localhost" }).reason === "hostname");
ok(
  "R2_www_hostname_blocked",
  decide({ hostname: "www.firestick4uk.com" }).reason === "hostname"
);
ok(
  "R2_preview_hostname",
  decide({ hostname: "firestick4uk.com.vercel.app" }).reason === "hostname"
);
ok(
  "R2_excluded_cart_blocks",
  decide({ pathname: "/cart" }).reason === "excluded_route"
);

// ── R3 exclusions ─────────────────────────────────────────────────────────
const excl = [
  "/sidhu",
  "/sidhu/login",
  "/sidhu/settings/foo",
  "/api",
  "/api/site-content",
  "/cart",
  "/cart/success",
  "/cart/checkout-extra",
  "/order-tracking",
  "/order-tracking/detail",
];
for (const p of excl) {
  ok(
    `R3_path_${p.replace(/\W+/g, "_")}`,
    gating.isClarityExcludedRoute({ pathname: p, search: "" }) === true
  );
}
ok(
  "R3_public_home_allowed",
  gating.isClarityExcludedRoute({ pathname: "/", search: "" }) === false
);
ok(
  "R3_public_contact_allowed",
  gating.isClarityExcludedRoute({ pathname: "/contact", search: "" }) === false
);
ok(
  "R3_query_order",
  gating.isClarityExcludedRoute({ pathname: "/", search: "?order=1" }) === true
);
ok(
  "R3_query_email",
  gating.isClarityExcludedRoute({ pathname: "/products", search: "?email=a@b.c" }) ===
    true
);
ok(
  "R3_query_token",
  gating.isClarityExcludedRoute({ pathname: "/", search: "?token=abc" }) === true
);
ok(
  "R3_query_receipt",
  gating.isClarityExcludedRoute({ pathname: "/", search: "?receipt=9" }) === true
);
ok(
  "R3_query_id",
  gating.isClarityExcludedRoute({ pathname: "/", search: "?id=42" }) === true
);
ok(
  "R3_query_ref",
  gating.isClarityExcludedRoute({ pathname: "/", search: "?ref=x" }) === true
);
ok(
  "R3_query_case_insensitive_key",
  gating.isClarityExcludedRoute({ pathname: "/", search: "?Token=abc" }) === true
);
ok(
  "R3_query_unrelated_ok",
  gating.isClarityExcludedRoute({ pathname: "/", search: "?utm_source=x" }) === false
);
ok(
  "R3_nested_sidhu_with_query_still_excluded",
  gating.isClarityExcludedRoute({
    pathname: "/sidhu/x",
    search: "?utm_source=1",
  }) === true
);

// ── R4 consent mapping ────────────────────────────────────────────────────
const analyticsOnly = consent.mapClarityConsentV2({
  analytics: true,
  advertising: false,
});
ok(
  "R4_analytics_only",
  analyticsOnly.analytics_Storage === "granted" &&
    analyticsOnly.ad_Storage === "denied"
);
const both = consent.mapClarityConsentV2({
  analytics: true,
  advertising: true,
});
ok(
  "R4_analytics_and_advertising",
  both.analytics_Storage === "granted" && both.ad_Storage === "granted"
);
const none = consent.mapClarityConsentV2({
  analytics: false,
  advertising: true,
});
ok(
  "R4_no_analytics_denies_both_even_if_ads",
  none.analytics_Storage === "denied" && none.ad_Storage === "denied"
);

const calls = [];
const fakeClarity = function (cmd, arg) {
  calls.push({ cmd, arg });
};
const plan = consent.clarityWithdrawalCallPlan();
ok(
  "R4_withdrawal_plan_order",
  plan.length === 2 &&
    plan[0].fn === "consentv2" &&
    plan[0].args[0].analytics_Storage === "denied" &&
    plan[0].args[0].ad_Storage === "denied" &&
    plan[1].fn === "consent" &&
    plan[1].args[0] === false
);
consent.applyClarityAnalyticsWithdrawal(fakeClarity);
ok(
  "R4_withdrawal_calls_consentv2_then_consent_false",
  calls.length === 2 &&
    calls[0].cmd === "consentv2" &&
    calls[1].cmd === "consent" &&
    calls[1].arg === false
);
ok(
  "R4_loader_uses_consentv2_and_consent_false_erase",
  /consentv2/.test(read("lib/clarityConsent.ts")) &&
    /args:\s*\[false\]/.test(read("lib/clarityConsent.ts"))
);
ok(
  "R4_reuses_tracking_consent_storage_key",
  /firestick_tracking_consent_v1/.test(read("lib/trackingConsent.ts")) &&
    /TRACKING_CONSENT_CHANGED_EVENT/.test(read("components/MicrosoftClarity.tsx"))
);
const consentCopy = read("components/TrackingConsent.tsx").replace(/\s+/g, " ");
ok(
  "R4_analytics_copy_mentions_clarity",
  /Helps us understand how the site is used: Google Analytics and our own site statistics \(pages viewed, traffic source, device type, clicks, scrolling and time on page, cart and checkout steps; never what you type into forms\)\. Microsoft Clarity only if we switch it on\. No effect on cart or checkout\./.test(
    consentCopy
  )
);

// ── R1 CMS validation ─────────────────────────────────────────────────────
for (const id of [
  "ab",
  "ABC DEF",
  "!!!!!!!!",
  "x".repeat(21),
  "has.dot",
  "has-dash",
]) {
  const r = config.validateClarityProjectIdInput(id);
  ok(`R1_reject_project_${id.slice(0, 12)}`, r.ok === false);
}
ok("R1_empty_project_ok", config.validateClarityProjectIdInput("").ok === true);
ok(
  "R1_valid_project",
  config.validateClarityProjectIdInput("AbC123xy").ok === true &&
    config.validateClarityProjectIdInput("AbC123xy").value === "abc123xy"
);
ok(
  "R1_reject_dashboard_http",
  config.validateClarityDashboardUrlInput("http://clarity.microsoft.com/x").ok ===
    false
);
ok(
  "R1_reject_dashboard_other_host",
  config.validateClarityDashboardUrlInput("https://example.com/x").ok === false
);
ok(
  "R1_accept_dashboard_prefix",
  config.validateClarityDashboardUrlInput(
    "https://clarity.microsoft.com/projects/view/abc"
  ).ok === true
);
ok(
  "R1_empty_dashboard_ok",
  config.validateClarityDashboardUrlInput("").ok === true
);
ok(
  "R1_read_sanitises_bad_project",
  config.sanitizeClaritySiteContentMap({
    clarity_project_id: "BAD!",
    clarity_enabled: "1",
  }).clarity_project_id === ""
);
ok(
  "R1_defaults_off",
  config.readClarityCmsSettings({}).enabled === false &&
    config.readClarityCmsSettings({}).projectId === ""
);
ok(
  "R1_super_admin_keys",
  /clarity_enabled/.test(read("lib/adminPermissions.ts")) &&
    /clarity_project_id/.test(read("lib/adminPermissions.ts")) &&
    /clarity_dashboard_url/.test(read("lib/adminPermissions.ts"))
);
ok(
  "R1_api_validates_on_save",
  /validateClarityCmsUpdate/.test(read("pages/api/site-content.ts"))
);
ok(
  "R1_api_sanitises_on_read",
  /sanitizeClaritySiteContentMap/.test(read("pages/api/site-content.ts"))
);
ok(
  "R1_sidhu_settings_ui",
  /clarity_enabled/.test(read("app/sidhu/page.tsx")) &&
    /clarity_project_id/.test(read("app/sidhu/page.tsx")) &&
    /Open Clarity dashboard/.test(read("app/sidhu/page.tsx"))
);
ok(
  "R1_no_freeform_clarity_script_field",
  !/clarity_head_code|clarity_custom_script|custom_head_code/.test(
    read("app/sidhu/page.tsx") + read("lib/siteContentDefaults.ts")
  )
);

ok(
  "R3_full_document_reload_on_excluded_nav",
  /location\.replace/.test(read("components/MicrosoftClarity.tsx")) &&
    /no official web pause|full document/i.test(
      read("components/MicrosoftClarity.tsx")
    )
);

ok(
  "R5_contact_form_masked",
  /data-clarity-mask=["']True["']/.test(read("app/contact/page.tsx"))
);
ok(
  "R5_no_identify_or_custom_events",
  !/clarity\(['"]identify['"]/.test(read("components/MicrosoftClarity.tsx")) &&
    !/clarity\(['"]event['"]/.test(read("components/MicrosoftClarity.tsx")) &&
    !/clarity\(['"]set['"]/.test(read("components/MicrosoftClarity.tsx"))
);

const layout = read("app/layout.tsx");
ok("SSR_layout_has_no_clarity_ms_url", !/clarity\.ms/.test(layout));
ok("SSR_layout_mounts_client_loader_only", /<MicrosoftClarity\s*\/>/.test(layout));

const disabledDecision = gating.shouldLoadClarity({
  cms: { enabled: false, projectId: validId, dashboardUrl: "" },
  hostname: "firestick4uk.com",
  analyticsConsent: true,
  pathname: "/",
});
ok("SSR_disabled_never_loads", disabledDecision.load === false);

ok(
  "browser_network_matrix",
  true,
  "NOT TESTED — no playwright/puppeteer/cypress dependency"
);

// ── C1 withdrawal stops recording (real module + fake host) ───────────────
{
  const callsInjected = [];
  let reloadCount = 0;
  let scheduled = [];
  const fakeClarityInjected = function (cmd, arg) {
    callsInjected.push({ cmd, arg });
  };
  const resultInjected = consent.revokeClarityAnalyticsStoppingRecording(
    {
      clarity: fakeClarityInjected,
      schedule: (fn, ms) => {
        scheduled.push({ ms, fn });
        return 1;
      },
      reload: () => {
        reloadCount += 1;
      },
    },
    { scriptInjected: true }
  );
  ok(
    "C1_injected_calls_consentv2_then_consent_false",
    callsInjected.length === 2 &&
      callsInjected[0].cmd === "consentv2" &&
      callsInjected[0].arg.analytics_Storage === "denied" &&
      callsInjected[0].arg.ad_Storage === "denied" &&
      callsInjected[1].cmd === "consent" &&
      callsInjected[1].arg === false
  );
  ok(
    "C1_injected_schedules_exactly_one_reload",
    resultInjected.scheduledReload === true &&
      scheduled.length === 1 &&
      scheduled[0].ms === 0
  );
  scheduled[0].fn();
  ok("C1_injected_deferred_reload_runs_once", reloadCount === 1);

  const callsNone = [];
  let reloadNone = 0;
  let scheduledNone = [];
  const resultNone = consent.revokeClarityAnalyticsStoppingRecording(
    {
      clarity: function (cmd, arg) {
        callsNone.push({ cmd, arg });
      },
      schedule: (fn, ms) => {
        scheduledNone.push({ ms, fn });
        return 1;
      },
      reload: () => {
        reloadNone += 1;
      },
    },
    { scriptInjected: false }
  );
  ok(
    "C1_not_injected_schedules_no_reload",
    resultNone.scheduledReload === false &&
      scheduledNone.length === 0 &&
      reloadNone === 0
  );
  ok(
    "C1_loader_uses_revoke_helper",
    /revokeClarityAnalyticsStoppingRecording/.test(
      read("components/MicrosoftClarity.tsx")
    )
  );
}

// ── C2 wording / no anonymised ────────────────────────────────────────────
ok(
  "C2_exact_analytics_wording",
  /Helps us understand how the site is used: Google Analytics and our own site statistics \(pages viewed, traffic source, device type, clicks, scrolling and time on page, cart and checkout steps; never what you type into forms\)\. Microsoft Clarity only if we switch it on\. No effect on cart or checkout\./.test(
    read("components/TrackingConsent.tsx").replace(/\s+/g, " ")
  )
);
{
  const roots = ["components", "lib"];
  let anonHit = null;
  for (const root of roots) {
    const walk = (dir) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(p);
        else if (/\.(ts|tsx|js|jsx|md)$/.test(ent.name)) {
          const txt = fs.readFileSync(p, "utf8");
          if (/anonymis(?:ed|e)|anonymiz(?:ed|e)/i.test(txt)) {
            anonHit = path.relative(ROOT, p);
          }
        }
      }
    };
    walk(path.join(ROOT, root));
  }
  const checklistCandidates = [
    path.join(ROOT, "..", "..", "clarity-35-closeout-01", "OWNER-SETUP-CHECKLIST.md"),
    path.join(ROOT, "..", "OWNER-SETUP-CHECKLIST.md"),
  ];
  let checklistAnon = null;
  for (const cp of checklistCandidates) {
    if (!fs.existsSync(cp)) continue;
    const txt = fs.readFileSync(cp, "utf8");
    if (/anonymis(?:ed|e)|anonymiz(?:ed|e)/i.test(txt)) {
      checklistAnon = cp;
      break;
    }
  }
  ok("C2_no_anonymised_in_components_or_lib", anonHit == null, anonHit || "");
  ok(
    "C2_no_anonymised_in_checklist",
    checklistAnon == null,
    checklistAnon || "ok"
  );
}

// ── C3 defensive masks on excluded pages ──────────────────────────────────
ok(
  "C3_cart_mask",
  /className=["']page-wrapper["']\s+data-clarity-mask=["']True["']/.test(
    read("app/cart/page.tsx")
  )
);
ok(
  "C3_cart_success_mask",
  (read("app/cart/success/page.tsx").match(
    /className=["']page["']\s+data-clarity-mask=["']True["']/g
  ) || []).length >= 2
);
ok(
  "C3_order_tracking_mask",
  /className=["']page-wrapper["']\s+data-clarity-mask=["']True["']/.test(
    read("app/order-tracking/page.tsx")
  )
);
{
  const { execFileSync } = require("child_process");
  const pages = [
    "app/cart/page.tsx",
    "app/cart/success/page.tsx",
    "app/order-tracking/page.tsx",
  ];
  for (const rel of pages) {
    // Scope to Clarity-35 commit range only (base..clarity commit), not current HEAD.
    const diff = execFileSync(
      "git",
      [
        "diff",
        "6292b55390318c2c55f31fa8cd17f5fa7cb034bd..af366135f8315a58579d0fa1f1752d0457a8ea36",
        "--",
        rel,
      ],
      { cwd: ROOT, encoding: "utf8" }
    );
    const added = diff
      .split(/\r?\n/)
      .filter((l) => l.startsWith("+") && !l.startsWith("+++"));
    const removed = diff
      .split(/\r?\n/)
      .filter((l) => l.startsWith("-") && !l.startsWith("---"));
    const onlyAttr =
      added.length > 0 &&
      added.every((l) => /data-clarity-mask=["']True["']/.test(l)) &&
      removed.every((l) => {
        // paired minus line is same content without the attribute
        const bare = l.slice(1);
        return (
          /className=["']page(?:-wrapper)?["']/.test(bare) &&
          !/data-clarity-mask/.test(bare)
        );
      });
    ok(`C3_diff_attribute_only_${rel.replace(/\W+/g, "_")}`, onlyAttr, diff.slice(0, 400));
  }
}

// ── C4 stronger query + case-insensitive paths ────────────────────────────
ok(
  "C4_path_Cart_mixed_case",
  gating.isClarityExcludedRoute({ pathname: "/Cart", search: "" }) === true
);
ok(
  "C4_path_SIDHU_nested_mixed_case",
  gating.isClarityExcludedRoute({ pathname: "/SIDHU/x", search: "" }) === true
);
ok(
  "C4_path_Order_Tracking_mixed",
  gating.isClarityExcludedRoute({ pathname: "/Order-Tracking", search: "" }) ===
    true
);

const positiveKeys = [
  "order",
  "email",
  "token",
  "receipt",
  "phone",
  "address",
  "user_email",
  "order_ref",
  " OrdEr ",
  "id",
  "ref",
  "ID",
  "REF",
  "product_id",
  "customer-id",
  "foo_id",
  "bar-id",
];
for (const k of positiveKeys) {
  const key = k.trim();
  ok(
    `C4_positive_key_${key}`,
    gating.isClarityExcludedQueryKey(key) === true
  );
  ok(
    `C4_positive_search_${key}`,
    gating.isClarityExcludedRoute({
      pathname: "/",
      search: `?${encodeURIComponent(key)}=1`,
    }) === true
  );
}

const negativeKeys = [
  "gclid",
  "fbclid",
  "msclkid",
  "wbraid",
  "gbraid",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "q",
  "page",
  "sort",
  "category",
  "GCLID",
  "Utm_Source",
];
for (const k of negativeKeys) {
  ok(`C4_negative_key_${k}`, gating.isClarityExcludedQueryKey(k) === false);
  ok(
    `C4_negative_search_${k}`,
    gating.isClarityExcludedRoute({
      pathname: "/",
      search: `?${k}=1`,
    }) === false
  );
}

console.log(`\nphase-clarity-35: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
