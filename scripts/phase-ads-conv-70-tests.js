/**
 * F4UK-ADS-CONV-70 — consent-gated Google Ads conversions + GA4 purchase/lead.
 * Mocked / static / pure helpers only. No .env*, no real DB, no network, no PII.
 */
const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");
const { execSync } = require("child_process");

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

const cache = new Map();
function loadTs(rel, stubs = {}) {
  const abs = path.join(ROOT, rel);
  const key = abs + "::" + Object.keys(stubs).sort().join(",");
  if (cache.has(key)) return cache.get(key);
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
  cache.set(key, m.exports);
  return m.exports;
}

function makeSessionStorage() {
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
    _store: store,
  };
}

function installWindow(opts = {}) {
  const gtagCalls = [];
  const sessionStorage = makeSessionStorage();
  const localStorage = makeSessionStorage();
  const gtag = opts.gtag === false ? undefined : (...args) => gtagCalls.push(args);
  global.window = {
    gtag,
    location: {
      pathname: opts.pathname || "/",
      href: opts.href || "https://firestick4uk.com/",
      hostname: "firestick4uk.com",
    },
    sessionStorage,
    localStorage,
  };
  global.sessionStorage = sessionStorage;
  global.localStorage = localStorage;
  return { gtagCalls, sessionStorage, localStorage };
}

function setConsent(pref) {
  if (!pref) {
    global.window.localStorage.removeItem("firestick_tracking_consent_v1");
    return;
  }
  global.window.localStorage.setItem(
    "firestick_tracking_consent_v1",
    JSON.stringify({
      version: 2,
      analytics: !!pref.analytics,
      advertising: !!pref.advertising,
      updatedAt: new Date().toISOString(),
    })
  );
}

const LABEL_OK = "AbCdEfGhIjKlMnOp";
const LABEL_WA = "WaLabel_123456";

ok("lib_adsConversions_exists", exists("lib/adsConversions.ts"));
ok(
  "component_ads_tracking_exists",
  exists("components/AdsConversionTracking.tsx")
);

const ads = loadTs("lib/adsConversions.ts");

ok(
  "exports_getAdsLabels",
  typeof ads.getAdsLabels === "function" &&
    typeof ads.isValidAdsConvLabel === "function"
);
ok(
  "exports_firePurchase_fireWhatsApp",
  typeof ads.firePurchase === "function" &&
    typeof ads.fireWhatsAppClick === "function"
);
ok(
  "exports_whatsapp_href_helpers",
  typeof ads.isWhatsAppHref === "function" &&
    typeof ads.resolveWhatsAppClickTarget === "function"
);

ok(
  "label_valid_ok",
  ads.isValidAdsConvLabel(LABEL_OK) && ads.isValidAdsConvLabel(LABEL_WA)
);
ok(
  "label_empty_invalid",
  !ads.isValidAdsConvLabel("") && !ads.isValidAdsConvLabel("   ")
);
ok(
  "label_short_invalid",
  !ads.isValidAdsConvLabel("abc12")
);
ok(
  "label_full_send_to_rejected",
  !ads.isValidAdsConvLabel("AW-18404353244/" + LABEL_OK) &&
    !ads.isValidAdsConvLabel(LABEL_OK + "/extra")
);
ok(
  "label_special_chars_rejected",
  !ads.isValidAdsConvLabel("abc$def1") && !ads.isValidAdsConvLabel("has space1")
);

ok(
  "getAdsLabels_empty_map",
  (() => {
    const l = ads.getAdsLabels({});
    return l.purchase === "" && l.whatsapp === "";
  })()
);
ok(
  "getAdsLabels_valid",
  (() => {
    const l = ads.getAdsLabels({
      ads_conv_label_purchase: LABEL_OK,
      ads_conv_label_whatsapp: LABEL_WA,
    });
    return l.purchase === LABEL_OK && l.whatsapp === LABEL_WA;
  })()
);
ok(
  "getAdsLabels_invalid_disabled",
  (() => {
    const l = ads.getAdsLabels({
      ads_conv_label_purchase: "bad",
      ads_conv_label_whatsapp: "AW-18404353244/x",
    });
    return l.purchase === "" && l.whatsapp === "";
  })()
);

// ── firePurchase consent / label / once-per-order ──────────────────────────
{
  const { gtagCalls } = installWindow({ pathname: "/" });
  setConsent(null);
  ads.firePurchase({
    orderId: "ORD-1",
    value: 10,
    currency: "GBP",
    contentMap: {
      ads_conv_label_purchase: LABEL_OK,
      ads_conv_label_whatsapp: LABEL_WA,
    },
  });
  ok("purchase_no_consent_no_fire", gtagCalls.length === 0);
}

{
  const { gtagCalls } = installWindow({ pathname: "/" });
  setConsent({ analytics: false, advertising: false });
  ads.firePurchase({
    orderId: "ORD-2",
    value: 10,
    currency: "GBP",
    contentMap: { ads_conv_label_purchase: LABEL_OK },
  });
  ok("purchase_reject_no_fire", gtagCalls.length === 0);
}

{
  const { gtagCalls } = installWindow({ pathname: "/" });
  setConsent({ analytics: false, advertising: true });
  ads.firePurchase({
    orderId: "ORD-3",
    value: 12.5,
    currency: "GBP",
    contentMap: { ads_conv_label_purchase: LABEL_OK },
  });
  const conv = gtagCalls.find(
    (c) => c[0] === "event" && c[1] === "conversion"
  );
  const purchase = gtagCalls.find(
    (c) => c[0] === "event" && c[1] === "purchase"
  );
  ok(
    "purchase_ads_only_fires_conversion",
    !!conv && !purchase,
    `calls=${gtagCalls.length}`
  );
  ok(
    "purchase_send_to_format",
    !!conv &&
      conv[2] &&
      conv[2].send_to === `AW-18404353244/${LABEL_OK}`
  );
  ok(
    "purchase_value_currency_txn",
    !!conv &&
      conv[2].value === 12.5 &&
      conv[2].currency === "GBP" &&
      conv[2].transaction_id === "ORD-3"
  );
}

{
  const { gtagCalls } = installWindow({ pathname: "/" });
  setConsent({ analytics: true, advertising: false });
  ads.firePurchase({
    orderId: "ORD-4",
    value: 9.99,
    currency: "GBP",
    items: [
      { item_id: "p1", item_name: "Firestick", price: 9.99, quantity: 1 },
    ],
    contentMap: { ads_conv_label_purchase: LABEL_OK },
  });
  const conv = gtagCalls.find(
    (c) => c[0] === "event" && c[1] === "conversion"
  );
  const purchase = gtagCalls.find(
    (c) => c[0] === "event" && c[1] === "purchase"
  );
  ok("ga_purchase_only_with_analytics", !!purchase && !conv);
  ok(
    "ga_purchase_payload_shape",
    !!purchase &&
      purchase[2].transaction_id === "ORD-4" &&
      purchase[2].value === 9.99 &&
      purchase[2].currency === "GBP" &&
      Array.isArray(purchase[2].items) &&
      purchase[2].items[0].item_id === "p1"
  );
}

{
  const { gtagCalls } = installWindow({ pathname: "/" });
  setConsent({ analytics: true, advertising: true });
  ads.firePurchase({
    orderId: "ORD-5",
    value: 1,
    currency: "GBP",
    contentMap: { ads_conv_label_purchase: "" },
  });
  const conv = gtagCalls.find(
    (c) => c[0] === "event" && c[1] === "conversion"
  );
  const purchase = gtagCalls.find(
    (c) => c[0] === "event" && c[1] === "purchase"
  );
  ok("empty_label_no_ads_conversion", !conv && !!purchase);
}

{
  const { gtagCalls, sessionStorage } = installWindow({ pathname: "/" });
  setConsent({ analytics: true, advertising: true });
  const map = { ads_conv_label_purchase: LABEL_OK };
  ads.firePurchase({
    orderId: "ORD-ONCE",
    value: 5,
    currency: "GBP",
    contentMap: map,
  });
  const first = gtagCalls.length;
  ads.firePurchase({
    orderId: "ORD-ONCE",
    value: 5,
    currency: "GBP",
    contentMap: map,
  });
  ok(
    "once_per_order_guard",
    first > 0 &&
      gtagCalls.length === first &&
      sessionStorage.getItem("ads_purchase_fired_ORD-ONCE") === "1"
  );
}

{
  const { gtagCalls } = installWindow({ pathname: "/sidhu" });
  setConsent({ analytics: true, advertising: true });
  ads.firePurchase({
    orderId: "ORD-SIDHU",
    value: 5,
    currency: "GBP",
    contentMap: { ads_conv_label_purchase: LABEL_OK },
  });
  ok("purchase_noop_on_sidhu", gtagCalls.length === 0);
}

{
  installWindow({ pathname: "/", gtag: false });
  setConsent({ analytics: true, advertising: true });
  // should not throw
  let threw = false;
  try {
    ads.firePurchase({
      orderId: "ORD-NOGTAG",
      value: 5,
      currency: "GBP",
      contentMap: { ads_conv_label_purchase: LABEL_OK },
    });
  } catch (e) {
    threw = true;
  }
  ok("purchase_noop_missing_gtag", !threw);
}

// ── WhatsApp click ─────────────────────────────────────────────────────────
{
  const { gtagCalls } = installWindow({ pathname: "/contact" });
  setConsent({ analytics: false, advertising: false });
  ads.fireWhatsAppClick("/contact", {
    ads_conv_label_whatsapp: LABEL_WA,
  });
  ok("wa_no_consent_no_fire", gtagCalls.length === 0);
}

{
  const { gtagCalls } = installWindow({ pathname: "/products" });
  setConsent({ analytics: false, advertising: true });
  ads.fireWhatsAppClick("/products", {
    ads_conv_label_whatsapp: LABEL_WA,
  });
  const conv = gtagCalls.find(
    (c) => c[0] === "event" && c[1] === "conversion"
  );
  const lead = gtagCalls.find(
    (c) => c[0] === "event" && c[1] === "generate_lead"
  );
  ok(
    "wa_ads_conversion_beacon",
    !!conv &&
      conv[2].send_to === `AW-18404353244/${LABEL_WA}` &&
      conv[2].transport_type === "beacon" &&
      conv[2].value === undefined
  );
  ok("wa_no_lead_without_analytics", !lead);
}

{
  const { gtagCalls } = installWindow({ pathname: "/faq" });
  setConsent({ analytics: true, advertising: true });
  ads.fireWhatsAppClick("/faq", {
    ads_conv_label_whatsapp: LABEL_WA,
  });
  const lead = gtagCalls.find(
    (c) => c[0] === "event" && c[1] === "generate_lead"
  );
  ok(
    "wa_generate_lead",
    !!lead &&
      lead[2].method === "whatsapp" &&
      lead[2].source === "/faq"
  );
}

{
  const { gtagCalls } = installWindow({ pathname: "/sidhu/orders" });
  setConsent({ analytics: true, advertising: true });
  ads.fireWhatsAppClick("/sidhu/orders", {
    ads_conv_label_whatsapp: LABEL_WA,
  });
  ok("wa_noop_on_sidhu", gtagCalls.length === 0);
}

ok(
  "wa_href_hosts",
  ads.isWhatsAppHref("https://wa.me/447500000000") &&
    ads.isWhatsAppHref("https://api.whatsapp.com/send?phone=1") &&
    ads.isWhatsAppHref("https://web.whatsapp.com/send?phone=1") &&
    ads.isWhatsAppHref("whatsapp://send?phone=1")
);
ok(
  "wa_href_rejects_other",
  !ads.isWhatsAppHref("https://telegram.me/x") &&
    !ads.isWhatsAppHref("/contact") &&
    !ads.isWhatsAppHref("https://example.com/wa.me")
);

{
  // resolveWhatsAppClickTarget + no preventDefault contract (source)
  const anchor = {
    tagName: "A",
    getAttribute: (n) => (n === "href" ? "https://wa.me/1" : null),
    href: "https://wa.me/1",
    parentElement: null,
  };
  const child = { nodeType: 1, tagName: "SPAN", parentElement: anchor };
  ok(
    "wa_resolve_closest_anchor",
    ads.resolveWhatsAppClickTarget(child) === anchor
  );
}

// ── PII keys never in event payloads ───────────────────────────────────────
{
  const { gtagCalls } = installWindow({ pathname: "/" });
  setConsent({ analytics: true, advertising: true });
  ads.firePurchase({
    orderId: "ORD-PII",
    value: 3,
    currency: "GBP",
    items: [{ item_id: "x", item_name: "Y", price: 3, quantity: 1 }],
    contentMap: { ads_conv_label_purchase: LABEL_OK },
  });
  ads.fireWhatsAppClick("/cart", { ads_conv_label_whatsapp: LABEL_WA });
  const blob = JSON.stringify(gtagCalls);
  const pii =
    /["']email["']|["']phone["']|["']address["']|["']customer_name["']|["']name["']\s*:/.test(
      blob
    ) && /email|phone|address/.test(blob);
  // Allow item_name; forbid email/phone/address keys
  const hasPiiKeys = gtagCalls.some((call) => {
    const payload = call[2];
    if (!payload || typeof payload !== "object") return false;
    const keys = Object.keys(payload).map((k) => k.toLowerCase());
    return keys.some((k) =>
      ["email", "phone", "address", "customer_name", "user_data", "enhanced_conversion_data"].includes(
        k
      )
    );
  });
  ok("no_pii_keys_in_event_payloads", !hasPiiKeys, pii ? "flagged" : "clean");
}

// ── Source / wiring / consent unchanged ────────────────────────────────────
const consentLib = read("lib/trackingConsent.ts");
const tracking = read("components/TrackingConsent.tsx");
const layout = read("app/layout.tsx");
const success = read("app/cart/success/page.tsx");
const adsComp = read("components/AdsConversionTracking.tsx");
const defaults = read("lib/siteContentDefaults.ts");
const sidhu = read("app/sidhu/page.tsx");
const perms = read("lib/adminPermissions.ts");

ok(
  "consent_version_still_2",
  /TRACKING_CONSENT_VERSION\s*=\s*2/.test(consentLib)
);
ok(
  "banner_text_unchanged",
  /Privacy choices\./.test(tracking) &&
    /We use optional analytics/.test(tracking) &&
    /\(including our own first-party site statistics\)/.test(tracking) &&
    /Accept all/.test(tracking) &&
    /Reject optional/.test(tracking) &&
    /Choose preferences/.test(tracking)
);
ok(
  "layout_mounts_ads_conversion_tracking",
  /AdsConversionTracking/.test(layout) &&
    /<AdsConversionTracking\s*\/>/.test(layout)
);
ok(
  "success_calls_firePurchase",
  /firePurchase/.test(success) && /grandTotal/.test(success)
);
ok(
  "wa_listener_no_preventDefault",
  !/event\.preventDefault|e\.preventDefault|\.preventDefault\s*\(/.test(adsComp)
);
ok(
  "wa_listener_hosts_in_helper",
  /wa\.me/.test(read("lib/adsConversions.ts")) &&
    /api\.whatsapp\.com/.test(read("lib/adsConversions.ts")) &&
    /web\.whatsapp\.com/.test(read("lib/adsConversions.ts")) &&
    /whatsapp:/i.test(read("lib/adsConversions.ts"))
);
ok(
  "cms_defaults_keys",
  /ads_conv_label_purchase/.test(defaults) &&
    /ads_conv_label_whatsapp/.test(defaults)
);
ok(
  "cms_defaults_empty",
  /\['ads_conv_label_purchase','','text','settings'/.test(defaults) &&
    /\['ads_conv_label_whatsapp','','text','settings'/.test(defaults)
);
ok(
  "sidhu_tracking_group_helper",
  /Paste only the label part after AW-18404353244\//.test(sidhu) &&
    /ads_conv_label_purchase/.test(sidhu) &&
    /ads_conv_label_whatsapp/.test(sidhu)
);
ok(
  "sa_settings_keys",
  /ads_conv_label_purchase/.test(perms) && /ads_conv_label_whatsapp/.test(perms)
);
ok(
  "ids_unchanged",
  /G-055GHH06KD/.test(consentLib) && /AW-18404353244/.test(consentLib)
);

// SEO / nav / layout metadata not touched by this feature's success/layout wiring
ok(
  "layout_keeps_verification_meta",
  /google-site-verification/.test(layout) &&
    /bE3BpMEsptGDckTW4IX1nVwGibbaaiphTCCbQp9y-FY/.test(layout)
);

const ADS70_ALLOW = new Set([
  "lib/adsConversions.ts",
  "components/AdsConversionTracking.tsx",
  "app/layout.tsx",
  "app/cart/success/page.tsx",
  "lib/siteContentDefaults.ts",
  "lib/adminPermissions.ts",
  "app/sidhu/page.tsx",
  "scripts/phase-ads-conv-70-tests.js",
  "scripts/phase-home-reviews-61-tests.js",
  "scripts/phase-insights-slim-67-tests.js",
]);

let dirtyNames = [];
try {
  dirtyNames = execSync("git diff --name-only", { cwd: ROOT, encoding: "utf8" })
    .split(/\r?\n/)
    .map((s) => s.trim().replace(/\\/g, "/"))
    .filter(Boolean);
} catch (e) {
  ok("diff_allowlist_ads70", false, String(e.message || e));
}
let untracked = [];
try {
  untracked = execSync("git ls-files --others --exclude-standard", {
    cwd: ROOT,
    encoding: "utf8",
  })
    .split(/\r?\n/)
    .map((s) => s.trim().replace(/\\/g, "/"))
    .filter(Boolean);
} catch {
  untracked = [];
}
const touched = [...new Set([...dirtyNames, ...untracked])];
const unexpected = touched.filter((f) => !ADS70_ALLOW.has(f));
ok(
  "diff_allowlist_ads70",
  unexpected.length === 0,
  unexpected.join(",") || `files=${touched.length}`
);

// No SEO route metadata files in this change set
const seoTouched = touched.filter((f) =>
  /metadata|sitemap|robots|JsonLd|Navbar|Footer/.test(f)
);
ok("no_seo_nav_layout_metadata_change", seoTouched.length === 0, seoTouched.join(","));

console.log(`\nADS-CONV-70: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
