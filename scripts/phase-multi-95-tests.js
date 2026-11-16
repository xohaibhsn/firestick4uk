/**
 * F4UK-MULTI-95 — public site-content denylist, admin scope=admin full read,
 * lock ?page= branch, health-check key guard. Stub DB / auth; no network.
 * Run: node scripts/phase-multi-95-tests.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const Module = require("module");
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

function loadTs(rel, stubs = {}) {
  const abs = path.join(ROOT, rel);
  const src = fs.readFileSync(abs, "utf8");
  const out = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
      resolveJsonModule: true,
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
        path.join(ROOT, mapped + ".json"),
        path.join(ROOT, mapped),
      ]) {
        if (fs.existsSync(c)) {
          if (c.endsWith(".json")) return require(c);
          return loadTs(path.relative(ROOT, c).replace(/\\/g, "/"), stubs);
        }
      }
    }
    if (id.startsWith("./") || id.startsWith("../")) {
      const resolved = path.normalize(path.join(path.dirname(abs), id));
      for (const c of [
        resolved,
        resolved + ".ts",
        resolved + ".tsx",
        resolved + ".js",
        resolved + ".json",
      ]) {
        if (fs.existsSync(c)) {
          if (c.endsWith(".json")) return require(c);
          return loadTs(path.relative(ROOT, c).replace(/\\/g, "/"), stubs);
        }
      }
    }
    return orig(id);
  };
  m._compile(out, abs);
  return m.exports;
}

function mockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    headersSent: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(k, v) {
      this.headers[String(k).toLowerCase()] = v;
    },
    json(payload) {
      this.headersSent = true;
      this.body = payload;
      return this;
    },
  };
  return res;
}

async function main() {
  const denylistJson = JSON.parse(
    read("lib/publicSiteContentDenylist.json")
  );
  const filterMod = loadTs("lib/publicSiteContentFilter.ts");
  const {
    PUBLIC_SITE_CONTENT_DENYLIST,
    PUBLIC_SITE_CONTENT_CRITICAL_KEYS,
    filterPublicSiteContentMap,
    SITE_CONTENT_PAGE_LOCKED_BODY,
  } = filterMod;

  ok(
    "denylist_json_array",
    Array.isArray(denylistJson) && denylistJson.length >= 3
  );
  ok(
    "denylist_set_equals_json",
    denylistJson.every((k) => PUBLIC_SITE_CONTENT_DENYLIST.has(k)) &&
      PUBLIC_SITE_CONTENT_DENYLIST.size === denylistJson.length
  );
  ok(
    "denylist_includes_clarity_and_expected",
    PUBLIC_SITE_CONTENT_DENYLIST.has("clarity_project_id") &&
      PUBLIC_SITE_CONTENT_DENYLIST.has("clarity_enabled") &&
      PUBLIC_SITE_CONTENT_DENYLIST.has("clarity_dashboard_url")
  );
  ok(
    "filter_header_comment_denylist_not_allowlist",
    /Denylist, not allowlist: unknown\/new keys stay public/.test(
      read("lib/publicSiteContentFilter.ts")
    )
  );

  const fullMap = {
    prices_include_vat: "1",
    price_incl_vat_suffix: "incl. VAT",
    ads_conv_label_purchase: "x",
    ads_conv_label_whatsapp: "y",
    bank_account_name: "n",
    bank_account_no: "1",
    bank_sort_code: "00-00-00",
    bank_heading: "h",
    payment_bank_enabled: "1",
    payment_cod_enabled: "1",
    contact_email: "a@b.c",
    contact_phone: "1",
    contact_whatsapp: "1",
    hero_slide_1: "/a",
    hero_slide_2: "/b",
    hero_slide_3: "/c",
    hero_slide_4: "/d",
    seasonal_promo_text: "p",
    seasonal_promo_cta: "c",
    track_email_label: "el",
    track_email_placeholder: "ph",
    track_email_help: "help",
    clarity_project_id: "SECRET",
    clarity_enabled: "1",
    clarity_dashboard_url: "https://example.invalid",
    trust_activation: "legacy",
    brand_new_unknown_key_95: "keep-me",
  };
  for (const k of denylistJson) {
    if (!(k in fullMap)) fullMap[k] = "deny-val";
  }

  const filtered = filterPublicSiteContentMap(fullMap);
  ok(
    "denylisted_absent_from_filtered",
    denylistJson.every((k) => !Object.prototype.hasOwnProperty.call(filtered, k))
  );
  ok(
    "critical_keys_present_after_filter",
    PUBLIC_SITE_CONTENT_CRITICAL_KEYS.every(
      (k) => typeof filtered[k] === "string"
    )
  );
  ok(
    "unknown_new_key_stays_public",
    filtered.brand_new_unknown_key_95 === "keep-me"
  );
  ok(
    "filter_does_not_mutate_input",
    Object.prototype.hasOwnProperty.call(fullMap, "clarity_project_id")
  );

  // --- API handler with stubs ---
  let adminIdentity = null;
  const cachedAll = { ...fullMap };

  const handler = loadTs("pages/api/site-content.ts", {
    "../../lib/db": {
      query: async () => {
        throw new Error("unexpected pool.query in page=all public path");
      },
      getConnection: async () => {
        throw new Error("unexpected getConnection");
      },
    },
    "../../lib/adminAuth": {
      requireAdmin: async (_req, res, _opts) => {
        if (!adminIdentity) {
          res.status(401).json(SITE_CONTENT_PAGE_LOCKED_BODY);
          return null;
        }
        return adminIdentity;
      },
      getRequestMeta: () => ({ ip: "127.0.0.1" }),
    },
    "../../lib/adminPermissions": {
      hasAdminPermission: () => true,
      isSuperAdminSettingsKey: () => false,
    },
    "../../lib/adminAudit": { recordAdminAudit: async () => {} },
    "../../lib/contentRevisions": {
      classifySiteContentEntityType: () => "content",
      recordContentRevision: async () => {},
    },
    "../../lib/hostingerResourceInvalidation": {
      invalidateFaviconCache: () => {},
      invalidateSitemapCache: () => {},
      siteContentKeysAffectFavicon: () => false,
      siteContentKeysAffectSitemap: () => false,
    },
    "../../lib/publicCmsDataServer": {
      getCachedPublicSiteContentAll: async () => ({ ...cachedAll }),
      loadSiteContentAllUncached: async () => ({ ...cachedAll }),
      invalidatePublicCmsCache: () => {},
    },
    "../../lib/seasonalHubPublic": {
      SEASONAL_HUB_PUBLISHED_KEY: "seasonal_hub_published",
      validateSeasonalHubPublicationWrite: async () => ({ ok: true }),
    },
    "../../lib/siteContentSeed": { SITE_CONTENT_DEFAULTS: [] },
    "../../lib/subscriptionSlug": {
      DEFAULT_SUBSCRIPTION_SLUG: "iptv-subscriptions-uk",
      isAutoSubscriptionCanonical: () => false,
      normalizeSubscriptionSlug: (s) => s,
      subscriptionPageUrl: (s) => "/" + s,
      validateSubscriptionSlug: (s) => ({ ok: true, slug: s }),
    },
    "../../lib/publicSiteContentFilter": filterMod,
  }).default;

  // Public page=all — filtered
  {
    adminIdentity = null;
    const req = { method: "GET", query: { page: "all" }, headers: {}, body: {} };
    const res = mockRes();
    await handler(req, res);
    ok("public_page_all_200", res.statusCode === 200);
    ok(
      "public_page_all_hides_denylist",
      denylistJson.every((k) => !(k in res.body))
    );
    ok(
      "public_page_all_keeps_critical",
      PUBLIC_SITE_CONTENT_CRITICAL_KEYS.every((k) => k in res.body)
    );
    ok(
      "public_page_all_keeps_unknown",
      res.body.brand_new_unknown_key_95 === "keep-me"
    );
  }

  // scope=admin without auth → 401
  {
    adminIdentity = null;
    const req = {
      method: "GET",
      query: { page: "all", scope: "admin" },
      headers: {},
      body: {},
    };
    const res = mockRes();
    await handler(req, res);
    ok("scope_admin_requires_auth", res.statusCode === 401);
  }

  // scope=admin with auth → full map + no-store
  {
    adminIdentity = { id: 1, role: "super_admin", email: "a@b.c" };
    const req = {
      method: "GET",
      query: { page: "all", scope: "admin" },
      headers: {},
      body: {},
    };
    const res = mockRes();
    await handler(req, res);
    ok("scope_admin_200", res.statusCode === 200);
    ok(
      "scope_admin_full_map_includes_denylist",
      denylistJson.every((k) => k in res.body)
    );
    ok(
      "scope_admin_no_store",
      String(res.headers["cache-control"] || "").includes("no-store")
    );
  }

  // ?page=home public → 401 constant body
  {
    adminIdentity = null;
    const req = { method: "GET", query: { page: "home" }, headers: {}, body: {} };
    const res = mockRes();
    await handler(req, res);
    ok("page_home_public_401", res.statusCode === 401);
    ok(
      "page_home_public_constant_body",
      res.body && res.body.error === SITE_CONTENT_PAGE_LOCKED_BODY.error
    );
  }

  // ?page=home admin → 200 no-store (stub pool for this path)
  {
    adminIdentity = { id: 1, role: "super_admin", email: "a@b.c" };
    const homeRows = [
      { content_key: "home_hero_title", content_value: "T" },
      { content_key: "clarity_project_id", content_value: "x" },
    ];
    const handlerHome = loadTs("pages/api/site-content.ts", {
      "../../lib/db": {
        query: async () => [homeRows],
        getConnection: async () => {
          throw new Error("no conn");
        },
      },
      "../../lib/adminAuth": {
        requireAdmin: async (_req, res) => {
          if (!adminIdentity) {
            res.status(401).json(SITE_CONTENT_PAGE_LOCKED_BODY);
            return null;
          }
          return adminIdentity;
        },
        getRequestMeta: () => ({ ip: "127.0.0.1" }),
      },
      "../../lib/adminPermissions": {
        hasAdminPermission: () => true,
        isSuperAdminSettingsKey: () => false,
      },
      "../../lib/adminAudit": { recordAdminAudit: async () => {} },
      "../../lib/contentRevisions": {
        classifySiteContentEntityType: () => "content",
        recordContentRevision: async () => {},
      },
      "../../lib/hostingerResourceInvalidation": {
        invalidateFaviconCache: () => {},
        invalidateSitemapCache: () => {},
        siteContentKeysAffectFavicon: () => false,
        siteContentKeysAffectSitemap: () => false,
      },
      "../../lib/publicCmsDataServer": {
        getCachedPublicSiteContentAll: async () => ({ ...cachedAll }),
        loadSiteContentAllUncached: async () => ({ ...cachedAll }),
        invalidatePublicCmsCache: () => {},
      },
      "../../lib/seasonalHubPublic": {
        SEASONAL_HUB_PUBLISHED_KEY: "seasonal_hub_published",
        validateSeasonalHubPublicationWrite: async () => ({ ok: true }),
      },
      "../../lib/siteContentSeed": { SITE_CONTENT_DEFAULTS: [] },
      "../../lib/subscriptionSlug": {
        DEFAULT_SUBSCRIPTION_SLUG: "iptv-subscriptions-uk",
        isAutoSubscriptionCanonical: () => false,
        normalizeSubscriptionSlug: (s) => s,
        subscriptionPageUrl: (s) => "/" + s,
        validateSubscriptionSlug: (s) => ({ ok: true, slug: s }),
      },
      "../../lib/publicSiteContentFilter": filterMod,
    }).default;

    const req = { method: "GET", query: { page: "home" }, headers: {}, body: {} };
    const res = mockRes();
    await handlerHome(req, res);
    ok("page_home_admin_200", res.statusCode === 200);
    ok(
      "page_home_admin_no_store",
      String(res.headers["cache-control"] || "").includes("no-store")
    );
    ok(
      "page_home_admin_returns_rows",
      res.body && res.body.home_hero_title === "T" && res.body.clarity_project_id === "x"
    );
  }

  // Sidhu source assertions
  const sidhu = read("app/sidhu/page.tsx");
  ok(
    "sidhu_settings_fetch_scope_admin_credentials",
    /fetch\(\s*["']\/api\/site-content\?page=all&scope=admin["']\s*,\s*\{\s*credentials:\s*["']include["']\s*\}\s*\)/.test(
      sidhu
    )
  );
  ok(
    "sidhu_reconcile_fetch_scope_admin_credentials_cache",
    /fetch\(\s*["']\/api\/site-content\?page=all&scope=admin["']\s*,\s*\{\s*cache:\s*["']no-store["']\s*,\s*credentials:\s*["']include["']\s*\}\s*\)/.test(
      sidhu
    )
  );
  ok(
    "sidhu_no_bare_page_all_get",
    !/fetch\(\s*["']\/api\/site-content\?page=all["']\s*\)/.test(sidhu) &&
      !/fetch\(\s*["']\/api\/site-content\?page=all["']\s*,\s*\{\s*cache:\s*["']no-store["']\s*\}\s*\)/.test(
        sidhu
      )
  );

  // Provider unchanged (public page=all, no scope)
  const provider = read("components/SiteContentProvider.tsx");
  ok(
    "provider_still_public_page_all",
    /fetch\(\s*["']\/api\/site-content\?page=all["']\s*\)/.test(provider) &&
      !/scope=admin/.test(provider)
  );

  // Health-check source includes key guard
  const health = read("scripts/live-health-check.js");
  ok(
    "health_imports_denylist_json",
    /publicSiteContentDenylist\.json/.test(health)
  );
  ok(
    "health_asserts_page_home_401",
    /page=home/.test(health) && /401/.test(health)
  );
  ok(
    "health_asserts_denylist_absent",
    /denylist|PUBLIC_SITE_CONTENT_DENYLIST|keyGuard/i.test(health)
  );

  // Grep evidence: no public callers of ?page=<other>
  const publicRoots = ["app", "components", "lib", "pages"];
  const badCallers = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (["node_modules", ".git", ".next", "sidhu"].includes(ent.name))
          continue;
        walk(p);
      } else if (/\.(ts|tsx|js|jsx)$/.test(ent.name)) {
        const rel = path.relative(ROOT, p).replace(/\\/g, "/");
        if (rel.startsWith("app/sidhu/")) continue;
        if (rel === "pages/api/site-content.ts") continue;
        if (/pages\/api\/admin/i.test(rel)) continue;
        const t = fs.readFileSync(p, "utf8");
        if (/\/api\/site-content\?page=(?!all\b)/.test(t)) badCallers.push(rel);
      }
    }
  }
  for (const r of publicRoots) walk(path.join(ROOT, r));
  ok(
    "no_public_callers_of_page_other_than_all",
    badCallers.length === 0,
    badCallers.join(", ")
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error("fatal", err && err.stack ? err.stack : err);
  process.exit(1);
});
