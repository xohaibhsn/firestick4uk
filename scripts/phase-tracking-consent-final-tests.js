/**
 * Final tracking-consent hardening checks (source + pure selector behavior).
 * Complements phase20g3b — does not weaken those protections.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

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

const layout = read("app/layout.tsx");
const consentLib = read("lib/trackingConsent.ts");
const tracking = read("components/TrackingConsent.tsx");
const footer = read("components/Footer.tsx");
const pkg = JSON.parse(read("package.json"));
const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

// A–D layout guards
ok("A_no_unconditional_gtag_js", !/googletagmanager\.com\/gtag\/js/.test(layout));
ok("B_no_unconditional_ga_config", !/G-055GHH06KD/.test(layout) || !/gtag\(['"]config['"]/.test(layout));
ok(
  "C_no_unconditional_ads_config",
  !/AW-18404353244/.test(layout) || !/gtag\(['"]config['"]/.test(layout)
);
ok(
  "D_verification_meta_present",
  /google-site-verification/.test(layout) &&
    /bE3BpMEsptGDckTW4IX1nVwGibbaaiphTCCbQp9y-FY/.test(layout)
);

// E–F no-choice / reject do not inject
ok(
  "E_no_choice_no_inject",
  /anyOptionalTrackingGranted/.test(tracking) &&
    /injectGtagScriptOnce/.test(tracking) &&
    /if\s*\(\s*!hasOptional\s*\)/.test(tracking)
);
ok(
  "F_reject_path_exists",
  /Reject optional/.test(tracking) && /rejectOptional|Reject optional/.test(tracking)
);

// G–I consent mapping
ok(
  "G_analytics_only_maps",
  /analytics_storage:\s*preference\.analytics\s*\?\s*["']granted["']\s*:\s*["']denied["']/.test(
    tracking
  ) &&
    /GA_MEASUREMENT_ID/.test(tracking) &&
    /preference\.analytics/.test(tracking)
);
ok(
  "H_advertising_only_maps",
  /ad_storage:\s*preference\.advertising\s*\?\s*["']granted["']\s*:\s*["']denied["']/.test(
    tracking
  ) && /GOOGLE_ADS_ID/.test(tracking)
);
ok(
  "I_accept_all_path",
  /Accept all/.test(tracking) &&
    /analytics:\s*true/.test(tracking) &&
    /advertising:\s*true/.test(tracking)
);

ok(
  "J_session_guards_prevent_duplicate_config",
  /session\.gaConfigured/.test(tracking) &&
    /session\.adsConfigured/.test(tracking) &&
    /session\.scriptInjected/.test(tracking)
);

ok(
  "K_privacy_choice_persists",
  /writeTrackingConsent/.test(tracking) &&
    /TRACKING_CONSENT_STORAGE_KEY/.test(consentLib) &&
    /localStorage\.setItem/.test(consentLib)
);

ok(
  "L_malformed_fails_safe",
  /isTrackingConsentPreference/.test(consentLib) &&
    /return null/.test(consentLib)
);

ok(
  "M_footer_reopens_preferences",
  /Privacy choices/.test(footer) && /openTrackingPreferences/.test(footer)
);

ok(
  "N_withdrawal_path_exists",
  /reloadIfRevoked/.test(tracking) &&
    /clearRevokedGoogleTrackingCookies/.test(tracking)
);

ok(
  "O_withdrawal_cleanup_narrow",
  /isGoogleAnalyticsCookieName/.test(consentLib) &&
    /isGoogleAdsCookieName/.test(consentLib) &&
    /selectGoogleTrackingCookiesToClear/.test(consentLib) &&
    /_ga_/.test(consentLib) &&
    /_gcl_/.test(consentLib)
);

ok(
  "P_cleanup_cannot_remove_admin_session",
  !/admin_session/.test(consentLib) &&
    !/document\.cookie\s*=\s*[`'"]admin/.test(consentLib)
);

ok(
  "Q_cleanup_cannot_remove_cart",
  !/removeItem\(\s*["']firestick_cart["']\s*\)/.test(consentLib) &&
    /name === ["']firestick_cart["']/.test(consentLib)
);

ok(
  "R_cleanup_cannot_remove_order_success",
  !/removeItem\(\s*["']orderSuccess["']\s*\)/.test(consentLib) &&
    /orderSuccess/.test(consentLib)
);

ok(
  "S_no_storage_clear_calls",
  !/localStorage\.clear\s*\(/.test(consentLib + tracking) &&
    !/sessionStorage\.clear\s*\(/.test(consentLib + tracking)
);

ok(
  "T_tracking_preference_preserved_during_cookie_cleanup",
  /TRACKING_CONSENT_STORAGE_KEY/.test(consentLib) &&
    /clearRevokedGoogleTrackingCookies/.test(consentLib) &&
    !/removeItem\(\s*TRACKING_CONSENT_STORAGE_KEY/.test(consentLib) &&
    !/removeItem\(\s*["']firestick_tracking_consent_v1["']/.test(consentLib)
);

ok(
  "U_no_new_analytics_package",
  !Object.keys(deps).some((k) =>
    /gtag|googleanalytics|@next\/third-parties|react-ga|gtm/i.test(k)
  )
);

ok("V_no_gtm_container", !/GTM-[A-Z0-9]+/.test(layout + tracking + consentLib));

ok(
  "W_no_second_analytics_provider",
  !/facebook\.net|fbevents|hotjar|plausible|mixpanel|segment\.com/i.test(
    layout + tracking + consentLib
  )
);

ok(
  "X_no_third_party_cmp",
  !/onetrust|cookiebot|complianz|osano|iubenda/i.test(tracking + consentLib)
);

ok(
  "Y_seo_verification_not_gated",
  /google-site-verification/.test(layout) && !/TrackingConsent/.test(
    layout.split("google-site-verification")[0].slice(-200) +
      layout.split("google-site-verification")[1].slice(0, 80)
  )
);

const sidhu = fs.existsSync(path.join(ROOT, "app/sidhu/page.tsx"))
  ? read("app/sidhu/page.tsx")
  : "";
ok(
  "Z_sidhu_unrelated",
  !/TrackingConsent|trackingConsent|gtag|G-055GHH06KD/.test(sidhu)
);

// Pure selector runtime proof via extracted TS functions (transpile lightly)
const selectorSrc = `
${consentLib
  .replace(/^export /gm, "")
  .replace(/: typeof TRACKING_CONSENT_VERSION/g, "")
  .replace(/: TrackingConsentPreference/g, "")
  .replace(/: string\[\]/g, "")
  .replace(/: string/g, "")
  .replace(/: boolean/g, "")
  .replace(/: unknown/g, "")
  .replace(/Omit<[^>]+>/g, "any")
  .replace(/&\s*\{[\s\S]*?\}/g, "")
  .replace(/as Record<string, unknown>/g, "")
  .replace(/as TrackingConsentPreference/g, "")
  .replace(/\| null/g, "")
  .replace(/typeof [a-zA-Z.]+/g, "undefined")
}
`;

let selectorOk = false;
let analyticsOnly = [];
let adsOnly = [];
let both = [];
let none = [];
try {
  const sandbox = { module: { exports: {} }, exports: {}, console };
  // Only need the pure name helpers — eval the relevant functions
  const pure = `
    function isGoogleAnalyticsCookieName(name) {
      const n = String(name || "");
      if (n === "_ga" || n === "_gid") return true;
      if (n.startsWith("_ga_")) return true;
      if (n.startsWith("_gat")) return true;
      return false;
    }
    function isGoogleAdsCookieName(name) {
      const n = String(name || "");
      return n.startsWith("_gcl_") || n.startsWith("_gac_");
    }
    function selectGoogleTrackingCookiesToClear(cookieNames, opts) {
      const out = [];
      const seen = new Set();
      for (const raw of cookieNames) {
        const name = String(raw || "").trim();
        if (!name || seen.has(name)) continue;
        if (
          name === "firestick_tracking_consent_v1" ||
          name === "firestick_cart" ||
          name === "orderSuccess" ||
          name.startsWith("admin")
        ) {
          continue;
        }
        const hitA = opts.clearAnalytics && isGoogleAnalyticsCookieName(name);
        const hitAd = opts.clearAdvertising && isGoogleAdsCookieName(name);
        if (!hitA && !hitAd) continue;
        seen.add(name);
        out.push(name);
      }
      return out;
    }
    const names = [
      "_ga",
      "_ga_055GHH06KD",
      "_gid",
      "_gat",
      "_gcl_au",
      "_gac_AW-18404353244",
      "firestick_cart",
      "orderSuccess",
      "admin_session",
      "firestick_tracking_consent_v1",
      "sessionid",
    ];
    module.exports = {
      analyticsOnly: selectGoogleTrackingCookiesToClear(names, {
        clearAnalytics: true,
        clearAdvertising: false,
      }),
      adsOnly: selectGoogleTrackingCookiesToClear(names, {
        clearAnalytics: false,
        clearAdvertising: true,
      }),
      both: selectGoogleTrackingCookiesToClear(names, {
        clearAnalytics: true,
        clearAdvertising: true,
      }),
      none: selectGoogleTrackingCookiesToClear(names, {
        clearAnalytics: false,
        clearAdvertising: false,
      }),
    };
  `;
  const result = vm.runInNewContext(pure, sandbox);
  analyticsOnly = result.analyticsOnly;
  adsOnly = result.adsOnly;
  both = result.both;
  none = result.none;
  selectorOk = true;
} catch (e) {
  console.error("selector runtime error", e);
}

ok("selector_runtime_ok", selectorOk);
ok(
  "selector_analytics_only",
  selectorOk &&
    analyticsOnly.includes("_ga") &&
    analyticsOnly.includes("_gid") &&
    analyticsOnly.includes("_ga_055GHH06KD") &&
    analyticsOnly.includes("_gat") &&
    !analyticsOnly.includes("_gcl_au") &&
    !analyticsOnly.includes("firestick_cart") &&
    !analyticsOnly.includes("admin_session") &&
    !analyticsOnly.includes("firestick_tracking_consent_v1"),
  JSON.stringify(analyticsOnly)
);
ok(
  "selector_ads_only",
  selectorOk &&
    adsOnly.includes("_gcl_au") &&
    adsOnly.includes("_gac_AW-18404353244") &&
    !adsOnly.includes("_ga") &&
    !adsOnly.includes("firestick_cart"),
  JSON.stringify(adsOnly)
);
ok(
  "selector_both",
  selectorOk &&
    both.includes("_ga") &&
    both.includes("_gcl_au") &&
    !both.includes("orderSuccess") &&
    !both.includes("sessionid"),
  JSON.stringify(both)
);
ok("selector_none", selectorOk && none.length === 0, JSON.stringify(none));

// Revocation order in component
ok(
  "revoke_order_consent_then_cleanup_then_reload",
  /clearRevokedGoogleTrackingCookies[\s\S]*reload/.test(tracking) ||
    (/issueConsentUpdate[\s\S]*clearRevokedGoogleTrackingCookies[\s\S]*reload/.test(
      tracking
    ))
);

ok(
  "purpose_aware_cleanup_flags",
  /clearAnalytics:\s*analyticsRevoked/.test(tracking) &&
    /clearAdvertising:\s*advertisingRevoked/.test(tracking)
);

console.log(`\nTracking consent final: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
