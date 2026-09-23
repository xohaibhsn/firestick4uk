/**
 * Phase20G.3B — Tracking consent + privacy preferences (source architecture).
 */
const fs = require("fs");
const path = require("path");

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

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

const layout = read("app/layout.tsx");
const consentLib = read("lib/trackingConsent.ts");
const tracking = read("components/TrackingConsent.tsx");
const footer = read("components/Footer.tsx");

ok("tracking_consent_lib_exists", exists("lib/trackingConsent.ts"));
ok("tracking_consent_component_exists", exists("components/TrackingConsent.tsx"));

ok(
  "layout_no_unconditional_gtag_js_src",
  !/googletagmanager\.com\/gtag\/js/.test(layout)
);
ok(
  "layout_no_unconditional_ga_config",
  !/gtag\(['"]config['"],\s*['"]G-055GHH06KD['"]\)/.test(layout)
);
ok(
  "layout_no_unconditional_ads_config",
  !/gtag\(['"]config['"],\s*['"]AW-18404353244['"]\)/.test(layout)
);
ok(
  "layout_no_dangerouslySetInnerHTML_gtag_block",
  !/dangerouslySetInnerHTML[\s\S]*gtag\(['"]js['"]/.test(layout)
);
ok(
  "google_site_verification_remains",
  /name=["']google-site-verification["']/.test(layout) &&
    /bE3BpMEsptGDckTW4IX1nVwGibbaaiphTCCbQp9y-FY/.test(layout)
);
ok(
  "tracking_consent_mounted_globally",
  /import TrackingConsent from ["']@\/components\/TrackingConsent["']/.test(layout) &&
    /<TrackingConsent\s*\/>/.test(layout)
);

ok(
  "storage_key_versioned",
  /firestick_tracking_consent_v1/.test(consentLib)
);
ok(
  "preference_model_version_1",
  /TRACKING_CONSENT_VERSION\s*=\s*1/.test(consentLib) ||
    /version:\s*1/.test(consentLib) ||
    /version:\s*typeof TRACKING_CONSENT_VERSION/.test(consentLib)
);
ok(
  "analytics_and_advertising_separate_booleans",
  /analytics:\s*boolean/.test(consentLib) && /advertising:\s*boolean/.test(consentLib)
);
ok(
  "ga_id_unchanged",
  /G-055GHH06KD/.test(consentLib) && /GA_MEASUREMENT_ID/.test(tracking)
);
ok(
  "ads_id_unchanged",
  /AW-18404353244/.test(consentLib) && /GOOGLE_ADS_ID/.test(tracking)
);

ok(
  "consent_default_analytics_storage_denied",
  /analytics_storage:\s*["']denied["']/.test(tracking)
);
ok(
  "consent_default_ad_storage_denied",
  /ad_storage:\s*["']denied["']/.test(tracking)
);
ok(
  "consent_default_ad_user_data_denied",
  /ad_user_data:\s*["']denied["']/.test(tracking)
);
ok(
  "consent_default_ad_personalization_denied",
  /ad_personalization:\s*["']denied["']/.test(tracking)
);
ok("ad_storage_present", /ad_storage/.test(tracking));
ok("analytics_storage_present", /analytics_storage/.test(tracking));
ok("ad_user_data_present", /ad_user_data/.test(tracking));
ok("ad_personalization_present", /ad_personalization/.test(tracking));

ok(
  "script_injection_only_after_optional_grant",
  /anyOptionalTrackingGranted/.test(tracking) &&
    /injectGtagScriptOnce/.test(tracking) &&
    /googletagmanager\.com\/gtag\/js/.test(tracking)
);
ok(
  "ga_config_conditional_on_analytics",
  /preference\.analytics && !session\.gaConfigured/.test(tracking) &&
    /gtag!\(["']config["'],\s*GA_MEASUREMENT_ID\)/.test(tracking)
);
ok(
  "ads_config_conditional_on_advertising",
  /preference\.advertising && !session\.adsConfigured/.test(tracking) &&
    /gtag!\(["']config["'],\s*GOOGLE_ADS_ID\)/.test(tracking)
);
ok(
  "script_injection_deduplicated",
  /session\.scriptInjected/.test(tracking) &&
    (/getElementById\(GTAG_SCRIPT_ID\)/.test(tracking) ||
      /firestick-gtag-js/.test(tracking))
);
ok(
  "gtag_js_deduplicated",
  /session\.gtagJsIssued/.test(tracking)
);
ok(
  "ga_config_deduplicated",
  /session\.gaConfigured/.test(tracking)
);
ok(
  "ads_config_deduplicated",
  /session\.adsConfigured/.test(tracking)
);

ok(
  "reject_optional_path_exists",
  /Reject optional/.test(tracking) && /rejectOptional/.test(tracking)
);
ok(
  "accept_all_path_exists",
  /Accept all/.test(tracking) && /acceptAll/.test(tracking)
);
ok(
  "granular_save_path_exists",
  /Save preferences/.test(tracking) && /savePreferences/.test(tracking)
);
ok(
  "choose_preferences_path_exists",
  /Choose preferences/.test(tracking)
);

ok(
  "footer_privacy_choices_control",
  /Privacy choices/.test(footer) &&
    (/openTrackingPreferences/.test(footer) ||
      /firestick:open-tracking-preferences/.test(footer))
);
ok(
  "footer_preserves_legal_links",
  /Privacy Policy/.test(footer) &&
    /Terms & Conditions/.test(footer) &&
    /Refund Policy/.test(footer) &&
    /FAQ/.test(footer)
);
ok(
  "footer_privacy_choices_is_button_not_fake_url",
  /button[\s\S]*Privacy choices|Privacy choices[\s\S]*button/.test(footer) &&
    !/href=["'][^"']*privacy-choices/.test(footer)
);

ok(
  "cart_storage_key_not_cleared_by_consent",
  !/firestick_cart/.test(consentLib) &&
    !/removeItem\(\s*["']firestick_cart["']\s*\)/.test(tracking) &&
    !/clear\(\)/.test(tracking)
);
ok(
  "orderSuccess_not_cleared_by_consent",
  !/orderSuccess/.test(consentLib) && !/orderSuccess/.test(tracking)
);
ok(
  "admin_cookies_not_touched",
  !/admin_session/.test(consentLib) && !/document\.cookie\s*=/.test(tracking)
);
ok(
  "consent_touches_only_own_storage_key",
  /localStorage\.(get|set)Item\(\s*TRACKING_CONSENT_STORAGE_KEY/.test(consentLib) ||
    /localStorage\.(get|set)Item\(\s*["']firestick_tracking_consent_v1["']/.test(
      consentLib
    )
);
ok(
  "malformed_preference_safe",
  /catch\s*\{/.test(consentLib) && /return null/.test(consentLib)
);

ok("no_gtm_container", !/GTM-[A-Z0-9]+/.test(layout + tracking + consentLib));
ok(
  "no_second_analytics_provider",
  !/facebook\.net|fbevents|tiktok|hotjar|plausible|mixpanel|segment\.com/i.test(
    layout + tracking
  )
);
ok(
  "no_third_party_cmp_dependency",
  !/onetrust|cookiebot|complianz|osano|iubenda/i.test(tracking + consentLib)
);

const pkg = JSON.parse(read("package.json"));
const deps = {
  ...(pkg.dependencies || {}),
  ...(pkg.devDependencies || {}),
};
ok(
  "no_new_analytics_npm_package",
  !Object.keys(deps).some((k) =>
    /gtag|googleanalytics|@next\/third-parties|react-ga|gtm/i.test(k)
  )
);

ok(
  "no_erp_import_in_consent_files",
  !/erp\//i.test(consentLib) && !/erp\//i.test(tracking) && !/erp\//i.test(footer)
);

// Soft check: cart context / order paths not rewritten by this phase
const cartCtx = exists("app/lib/cartContext.tsx")
  ? read("app/lib/cartContext.tsx")
  : exists("lib/cartContext.tsx")
    ? read("lib/cartContext.tsx")
    : "";
if (cartCtx) {
  ok(
    "cart_context_untouched_by_consent_logic",
    !/trackingConsent|TrackingConsent|gtag/.test(cartCtx)
  );
}

console.log(`\nPhase20G.3B: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
