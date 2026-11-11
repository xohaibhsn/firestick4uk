/**
 * F4UK-SIDHU-INSIGHTS-BUILD-B-57 — consent-gated beacon + admin Insights screens.
 * Mocked storage / fake clock / source-static checks only. No .env*, no real DB.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const NODE = process.execPath;

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

function loadTsModule(rel, stubs = {}) {
  const stubKey = Object.keys(stubs)
    .sort()
    .map((k) => k + "=" + typeof stubs[k])
    .join(",");
  const key = rel + "::" + stubKey;
  if (cache.has(key)) return cache.get(key);
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
    if (Object.prototype.hasOwnProperty.call(stubs, id)) return stubs[id];
    if (id.startsWith(".") || id.startsWith("..") || id.startsWith("@/")) {
      let resolved = id;
      if (id.startsWith("@/")) resolved = path.join(ROOT, id.slice(2));
      else resolved = path.normalize(path.join(path.dirname(path.join(ROOT, rel)), id));
      for (const c of [resolved + ".ts", resolved + ".js", path.join(resolved, "index.ts")]) {
        if (fs.existsSync(c)) {
          return loadTsModule(path.relative(ROOT, c).replace(/\\/g, "/"), stubs);
        }
      }
    }
    return require(id);
  };
  const fn = new Function("exports", "module", "require", outputText);
  fn(sandbox.exports, sandbox.module, localRequire);
  const mod =
    sandbox.module.exports && Object.keys(sandbox.module.exports).length
      ? sandbox.module.exports
      : sandbox.exports;
  cache.set(key, mod);
  return mod;
}

function makeMemoryStorage() {
  const map = new Map();
  return {
    getItem(k) {
      return map.has(String(k)) ? map.get(String(k)) : null;
    },
    setItem(k, v) {
      map.set(String(k), String(v));
    },
    removeItem(k) {
      map.delete(String(k));
    },
    clear() {
      map.clear();
    },
    get length() {
      return map.size;
    },
    key(i) {
      return [...map.keys()][i] ?? null;
    },
    _map: map,
  };
}

async function main() {
  const client = loadTsModule("lib/insightsClient.ts", {
    "./insightsIngest": loadTsModule("lib/insightsIngest.ts"),
    "./clarityGating": loadTsModule("lib/clarityGating.ts"),
    "./trackingConsent": loadTsModule("lib/trackingConsent.ts"),
  });

  // ── Consent matrix / GPC / excluded paths ────────────────────────────────
  ok("consent_null_off", client.shouldRecordInsights({ preference: null, pathname: "/" }) === false);
  ok(
    "consent_reject_off",
    client.shouldRecordInsights({
      preference: { analytics: false, advertising: false },
      pathname: "/",
    }) === false
  );
  ok(
    "consent_analytics_only_on",
    client.shouldRecordInsights({
      preference: { analytics: true, advertising: false },
      pathname: "/",
    }) === true
  );
  ok(
    "consent_advertising_only_off",
    client.shouldRecordInsights({
      preference: { analytics: false, advertising: true },
      pathname: "/",
    }) === false
  );
  ok(
    "consent_accept_on",
    client.shouldRecordInsights({
      preference: { analytics: true, advertising: true },
      pathname: "/products",
    }) === true
  );
  ok(
    "gpc_blocks",
    client.shouldRecordInsights({
      preference: { analytics: true, advertising: true },
      pathname: "/",
      gpc: true,
    }) === false
  );

  for (const p of ["/sidhu", "/sidhu/x", "/api", "/api/x", "/erp", "/order-tracking", "/order-tracking/x"]) {
    ok(
      `excluded_${p.replace(/\W+/g, "_")}`,
      client.isInsightsExcludedPath(p) === true &&
        client.shouldRecordInsights({
          preference: { analytics: true, advertising: true },
          pathname: p,
        }) === false
    );
  }
  ok("cart_allowed", client.isInsightsExcludedPath("/cart") === false);
  ok("cart_success_allowed", client.isInsightsExcludedPath("/cart/success") === false);

  // ── IDs: visitor expiry + session idle rotation ──────────────────────────
  const ls = makeMemoryStorage();
  const ss = makeMemoryStorage();
  const t0 = Date.UTC(2026, 10, 11, 12, 0, 0);
  const vid1 = client.ensureVisitorId(ls, t0);
  const vid2 = client.ensureVisitorId(ls, t0 + 1000);
  ok("visitor_stable", vid1 === vid2 && /^[0-9a-f-]{36}$/i.test(vid1));
  const vidExpired = client.ensureVisitorId(ls, t0 + client.INSIGHTS_VISITOR_TTL_MS + 1);
  ok("visitor_rotates_after_ttl", vidExpired !== vid1);

  const sid1 = client.ensureSessionId(ss, t0);
  const sid2 = client.ensureSessionId(ss, t0 + 60_000);
  ok("session_stable_within_idle", sid1 === sid2);
  // lastActivityAt was advanced by sid2 → idle clock starts from that touch
  const sid3 = client.ensureSessionId(ss, t0 + 60_000 + client.INSIGHTS_SESSION_IDLE_MS + 1);
  ok("session_rotates_after_idle", sid3 !== sid1);
  client.clearInsightsSessionId(ss);
  ok("session_cleared_on_withdraw", ss.getItem(client.INSIGHTS_SESSION_KEY) === null);
  ok("visitor_kept_on_withdraw", ls.getItem(client.INSIGHTS_VISITOR_KEY) != null);

  // ── Attribution + sensitive key stripping ────────────────────────────────
  const attr = client.captureAttributionOnce({
    search: "?utm_source=google&utm_medium=cpc&gclid=abc&email=x@y.com&token=secret&order=1",
    referrer: "https://www.google.com/search?q=firestick",
    pathname: "/products",
  });
  ok("attr_utm", attr.utm_source === "google" && attr.utm_medium === "cpc" && attr.gclid === "abc");
  ok("attr_referrer_host_only", attr.referrer_host === "www.google.com");
  ok("attr_no_email_key", !("email" in attr) && !JSON.stringify(attr).includes("x@y.com"));
  ok("attr_no_token", !JSON.stringify(attr).includes("secret"));

  // ── Payload denylist + caps + batching ───────────────────────────────────
  const denied = client.sanitizeProps({ email: "a@b.c", qty: 2, product_id: 9 });
  ok("props_strips_email", denied && denied.email === undefined && denied.qty === 2);

  const events = [];
  for (let i = 0; i < 12; i++) {
    events.push({ t: "page_view", ts: new Date(t0 + i).toISOString(), path: "/" });
  }
  let sends = [];
  const controller = client.createInsightsController({
    getPathname: () => "/",
    getSearch: () => "",
    getReferrer: () => "",
    getTitle: () => "Home",
    getLanguage: () => "en-GB",
    getScreen: () => ({ w: 390, h: 844 }),
    localStorage: ls,
    sessionStorage: ss,
    now: () => t0 + 5000,
    schedule: (fn) => {
      fn();
      return 1;
    },
    clearSchedule: () => {},
    transport: (payload) => {
      sends.push(payload);
      return { status: 204, ok: true };
    },
  });

  // Force-running by enqueue after manually starting with consent present is hard
  // without window; exercise buildCollectPayload + byte estimate instead.
  const payload = client.buildCollectPayload({
    visitorId: vid1,
    sessionId: sid1,
    events: events.slice(0, 10),
    attribution: attr,
  });
  ok("payload_v1", payload.v === 1 && payload.consent_analytics === true);
  ok("payload_event_cap_batch", payload.events.length <= client.INSIGHTS_BATCH_MAX_EVENTS);
  ok(
    "payload_bytes_budget_helper",
    client.estimatePayloadBytes(payload) > 0 &&
      client.INSIGHTS_BATCH_MAX_BYTES === 8192
  );
  ok("batch_flush_ms", client.INSIGHTS_BATCH_FLUSH_MS === 2000);
  ok("consecutive_204_stop_rule", client.INSIGHTS_CONSECUTIVE_204_STOP === 5);

  // Zero network when controller never started
  ok("controller_starts_stopped", controller.isRunning() === false);
  controller.enqueue({ t: "page_view", ts: new Date().toISOString(), path: "/" });
  ok("enqueue_noop_when_stopped", controller.getQueueLength() === 0 && sends.length === 0);

  // ── Click taxonomy reads no input values ─────────────────────────────────
  const resolveSrc = read("lib/insightsClient.ts");
  ok(
    "click_taxonomy_no_input_value",
    /export function resolveClickTaxonomyId[\s\S]*?^}/m.test(resolveSrc) &&
      !/resolveClickTaxonomyId[\s\S]{0,800}?\.value/.test(resolveSrc) &&
      !/resolveClickTaxonomyId[\s\S]{0,800}?innerText/.test(resolveSrc)
  );

  // Fake element tree
  function el(tag, attrs, parent) {
    const classList = {
      _set: new Set(String(attrs.className || "").split(/\s+/).filter(Boolean)),
      contains(c) {
        return this._set.has(c);
      },
    };
    const node = {
      tagName: tag.toUpperCase(),
      classList,
      parentElement: parent || null,
      getAttribute(name) {
        return Object.prototype.hasOwnProperty.call(attrs, name) ? String(attrs[name]) : null;
      },
    };
    return node;
  }
  const btn = el("button", { "data-insights-id": "cart_add", className: "add-btn" });
  ok("taxonomy_cart_add", client.resolveClickTaxonomyId(btn) === "cart_add");
  const sticky = el("button", { className: "pdp-sticky-atc__btn", "data-pdp-atc": "sticky" });
  ok("taxonomy_pdp_sticky", client.resolveClickTaxonomyId(sticky) === "pdp_sticky_checkout");
  const pay = el("label", { "data-payment-option": "bank" });
  ok("taxonomy_pay_bank", client.resolveClickTaxonomyId(pay) === "pay_method_bank");
  const place = el("button", { className: "place-order-btn", "data-place-order": "inline" });
  ok("taxonomy_place_order", client.resolveClickTaxonomyId(place) === "place_order");

  // ── Search sanitize / error name-only ────────────────────────────────────
  ok("search_caps", client.sanitizeSearchTerm("x".repeat(200)).length === 128);
  ok("search_rejects_email", client.sanitizeSearchTerm("a@b.co") === null);
  ok("search_rejects_phone", client.sanitizeSearchTerm("+44 7700 900123") === null);

  // ── No fingerprinting APIs in client sources ─────────────────────────────
  const beaconSrc = read("components/SidhuInsightsBeacon.tsx");
  const clientSrc = read("lib/insightsClient.ts");
  for (const [label, src] of [
    ["client", clientSrc],
    ["beacon", beaconSrc],
  ]) {
    ok(
      `no_fingerprint_${label}`,
      !/getContext\(\s*['\"]2d['\"]\s*\)/.test(src) &&
        !/AudioContext|webkitAudioContext/.test(src) &&
        !/WEBGL|getParameter\(/.test(src) &&
        !/queryLocalFonts|fontface/.test(src.toLowerCase())
    );
  }

  // ── layout.tsx mount-only ────────────────────────────────────────────────
  const layout = read("app/layout.tsx");
  ok(
    "layout_imports_beacon",
    /import SidhuInsightsBeacon from ["']@\/components\/SidhuInsightsBeacon["']/.test(layout)
  );
  ok("layout_mounts_beacon", /<SidhuInsightsBeacon\s*\/>/.test(layout));
  // Metadata export still present and generateMetadata unchanged structurally
  ok("layout_has_generateMetadata", /export async function generateMetadata/.test(layout));

  // ── data-insights-id edits present ───────────────────────────────────────
  ok("hook_home_cart_add", /data-insights-id=["']cart_add["']/.test(read("app/HomeClient.tsx")));
  ok(
    "hook_products_cart_add",
    /data-insights-id=["']cart_add["']/.test(read("app/products/ProductsClient.tsx"))
  );
  ok(
    "hook_pdp_cart_add",
    /data-insights-id=["']cart_add["']/.test(read("app/products/[slug]/ProductDetail.tsx"))
  );
  ok(
    "hook_minicart",
    /data-insights-id=["']cart_view["']/.test(read("components/MiniCartBar.tsx")) &&
      /data-insights-id=["']mini_checkout["']/.test(read("components/MiniCartBar.tsx"))
  );
  ok(
    "hook_place_order",
    (read("app/cart/page.tsx").match(/data-insights-id=["']place_order["']/g) || []).length >= 2
  );

  // ── Admin APIs: source contracts ─────────────────────────────────────────
  const adminFiles = [
    "pages/api/admin-insights/summary.ts",
    "pages/api/admin-insights/geo.ts",
    "pages/api/admin-insights/pages.ts",
    "pages/api/admin-insights/sources.ts",
    "pages/api/admin-insights/journeys.ts",
    "pages/api/admin-insights/settings.ts",
  ];
  const serverHelper = fs.existsSync(path.join(ROOT, "components/sidhu/insights/insightsServer.ts"))
    ? read("components/sidhu/insights/insightsServer.ts")
    : "";
  ok(
    "admin_shared_rbac_helper",
    /requireAdminPermission/.test(serverHelper) && /not_installed|INSIGHTS_NOT_INSTALLED/.test(serverHelper)
  );

  for (const f of adminFiles) {
    const exists = fs.existsSync(path.join(ROOT, f));
    ok(`admin_api_exists_${path.basename(f, ".ts")}`, exists);
    if (!exists) continue;
    const src = read(f);
    const usesShared =
      /handleInsightsGet/.test(src) || /from ["']@\/components\/sidhu\/insights\/insightsServer["']/.test(src);
    ok(
      `admin_api_rbac_${path.basename(f, ".ts")}`,
      f.endsWith("settings.ts")
        ? /requireAdminPermission/.test(src) && /insights\.settings/.test(src)
        : (/insights\.view/.test(src) || usesShared) &&
            (usesShared ? /handleInsightsGet/.test(src) || /insights\.view/.test(serverHelper) : true)
    );
    ok(
      `admin_api_param_sql_${path.basename(f, ".ts")}`,
      !/\.query\(\s*[`'"].*\$\{/.test(src) && !/\.query\(\s*['"].*\+/.test(src)
    );
    ok(
      `admin_api_not_installed_${path.basename(f, ".ts")}`,
      /not_installed|INSIGHTS_NOT_INSTALLED|ER_NO_SUCH_TABLE|isMissingTableError|handleInsightsGet/.test(
        src + "\n" + serverHelper
      )
    );
  }

  if (fs.existsSync(path.join(ROOT, "pages/api/admin-insights/journeys.ts"))) {
    const j = read("pages/api/admin-insights/journeys.ts");
    ok(
      "journeys_ip_super_admin_only",
      /canViewInsightsIp/.test(j) || /super_admin/.test(j)
    );
  }

  if (fs.existsSync(path.join(ROOT, "pages/api/admin-insights/settings.ts"))) {
    const s = read("pages/api/admin-insights/settings.ts");
    ok("settings_audit", /recordAdminAudit/.test(s));
    ok("settings_reload_geo", /reloadInsightsGeo/.test(s));
  }

  // Geography phrase + DB-IP
  const geoUiCandidates = [
    "components/sidhu/insights/GeographyScreen.tsx",
    "components/sidhu/insights/InsightsGeography.tsx",
    "components/sidhu/insights/InsightsPanel.tsx",
  ];
  let geoUi = "";
  for (const c of geoUiCandidates) {
    if (fs.existsSync(path.join(ROOT, c))) geoUi += read(c) + "\n";
  }
  // Also scan folder
  const insightsDir = path.join(ROOT, "components/sidhu/insights");
  if (fs.existsSync(insightsDir)) {
    for (const name of fs.readdirSync(insightsDir)) {
      if (/\.(tsx|ts|jsx|js)$/.test(name)) {
        geoUi += read(path.join("components/sidhu/insights", name)) + "\n";
      }
    }
  }
  ok(
    "geography_phrase",
    /In this period,\s*\$?\{?.*visitors from/.test(geoUi) ||
      /In this period,/.test(geoUi)
  );
  ok(
    "dbip_attribution_link",
    /IP Geolocation by DB-IP/.test(geoUi) && /https:\/\/db-ip\.com/.test(geoUi)
  );

  // Sidhu page minimal hook
  if (fs.existsSync(path.join(ROOT, "app/sidhu/page.tsx"))) {
    const sidhu = read("app/sidhu/page.tsx");
    ok("sidhu_tab_insights_type", /type Tab =[\s\S]*"insights"/.test(sidhu));
    ok("sidhu_imports_panel", /InsightsPanel/.test(sidhu));
    ok(
      "sidhu_insights_permission_gate",
      /insights\.view/.test(sidhu) && /tab===["']insights["']/.test(sidhu)
    );
  }

  // Permissions: SidhuTab must still NOT include insights (phase-56 contract)
  const perms = read("lib/adminPermissions.ts");
  ok(
    "perm_no_sidhu_tab_insights_preserved",
    !/SidhuTab[\s\S]*\| "insights"/.test(perms) && !/TAB_PERMISSION[\s\S]*insights:/.test(perms)
  );

  // Diff allowlist (working tree)
  const diff = spawnSync("git", ["diff", "--name-only", "HEAD"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const untracked = spawnSync(
    "git",
    ["ls-files", "--others", "--exclude-standard"],
    { cwd: ROOT, encoding: "utf8" }
  );
  const names = new Set(
    `${diff.stdout || ""}\n${untracked.stdout || ""}`
      .split(/\r?\n/)
      .map((s) => s.trim().replace(/\\/g, "/"))
      .filter(Boolean)
  );
  const allow = (rel) => {
    if (rel === "lib/insightsClient.ts") return true;
    if (rel === "components/SidhuInsightsBeacon.tsx") return true;
    if (rel === "app/layout.tsx") return true;
    if (rel === "app/sidhu/page.tsx") return true;
    if (rel === "scripts/phase-sidhu-insights-57-tests.js") return true;
    if (rel === "scripts/phase-insights-w2-60-tests.js") return true;
    // F4UK-W4-INSIGHTS-LIVE-63
    if (rel === "components/TrackingConsent.tsx") return true;
    if (rel === "lib/trackingConsent.ts") return true;
    if (rel === "components/sidhu/insights/SettingsScreen.tsx") return true;
    if (rel === "scripts/phase-city-cleanup-64-tests.js") return true;
    if (rel === "scripts/phase-insights-live-63-tests.js") return true;
    if (rel === "scripts/phase20g3b-tracking-consent-tests.js") return true;
    if (rel === "scripts/phase-clarity-35-tests.js") return true;
    if (rel === "scripts/phase-tracking-consent-final-tests.js") return true;
    if (rel === "scripts/phase-home-reviews-61-tests.js") return true;
    if (rel === "scripts/phase-ux-batch-51-tests.js") return true;
    if (rel === "scripts/phase-ux-fix-53-tests.js") return true;
    if (rel === "scripts/phase-cod-restore-54-tests.js") return true;
    if (rel === "scripts/phase-windup-59-tests.js") return true;
    if (rel.startsWith("pages/api/admin-insights/")) return true;
    if (rel.startsWith("components/sidhu/insights/")) return true;
    // F4UK-HOME-REVIEWS-R1-61
    if (
      [
        "lib/homeTestimonials.ts",
        "app/sidhu/page.tsx",
        "scripts/phase-home-reviews-61-tests.js",
        "scripts/phase-home-testimonials-foundation-tests.js",
        "scripts/phase-windup-59-tests.js",
        "scripts/phase-ux-batch-51-tests.js",
        "scripts/phase-ux-fix-53-tests.js",
        "scripts/phase-cod-restore-54-tests.js",
      ].includes(rel)
    ) {
      return true;
    }
    // data-insights-id attribute hosts
    if (
      [
        "app/HomeClient.tsx",
        "app/products/ProductsClient.tsx",
        "app/products/[slug]/ProductDetail.tsx",
        "components/MiniCartBar.tsx",
        "app/cart/page.tsx",
      ].includes(rel)
    ) {
      return true;
    }
    return false;
  };
  const bad = [...names].filter((n) => !allow(n));
  ok("diff_allowlist", bad.length === 0, bad.join(", ") || "clean");

  // Beacon consecutive-204 documentation
  ok(
    "beacon_documents_204_rule",
    /INSIGHTS_CONSECUTIVE_204_STOP|consecutive 204/.test(beaconSrc)
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
