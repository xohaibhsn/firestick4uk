/**
 * F4UK-MULTI-109 — admin site_content page=all bypasses public TTL cache;
 * health negative 401 for scope=admin; receipts gitignore hygiene.
 * Static + mocked handlers only. No real DB / network.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");
const os = require("os");

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

function loadTs(rel, stubs = {}) {
  const abs = path.join(ROOT, rel);
  const src = fs.readFileSync(abs, "utf8");
  const out = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
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
      const mapped = id.slice(2);
      for (const candidate of [
        path.join(ROOT, mapped + ".ts"),
        path.join(ROOT, mapped + ".tsx"),
        path.join(ROOT, mapped + ".js"),
      ]) {
        if (fs.existsSync(candidate)) {
          return loadTs(path.relative(ROOT, candidate).replace(/\\/g, "/"), stubs);
        }
      }
    }
    if (id.startsWith("./") || id.startsWith("../")) {
      const base = path.normalize(path.join(path.dirname(abs), id));
      for (const candidate of [base + ".ts", base + ".tsx", base + ".js"]) {
        if (fs.existsSync(candidate)) {
          return loadTs(path.relative(ROOT, candidate).replace(/\\/g, "/"), stubs);
        }
      }
    }
    return orig(id);
  };
  m._compile(out, abs);
  return m.exports;
}

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(k, v) {
      this.headers[String(k).toLowerCase()] = v;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

console.log("\n# MULTI-109 source contracts");

const helper = read("lib/publicCmsDataServer.ts");
const siteSrc = read("pages/api/site-content.ts");
const health = read("scripts/live-health-check.js");
const gitignore = read(".gitignore");

ok(
  "uncached_loader_exported",
  /export async function loadSiteContentAllUncached/.test(helper)
);
ok(
  "cached_wraps_uncached_loader",
  /export const getCachedPublicSiteContentAll = unstable_cache\(\s*loadSiteContentAllUncached/.test(
    helper
  )
);
ok(
  "admin_branch_calls_uncached",
  /scopeAdmin[\s\S]*loadSiteContentAllUncached\(/.test(siteSrc) &&
    /loadSiteContentAllUncached/.test(siteSrc)
);
ok(
  "public_branch_still_cached_and_filtered",
  /getCachedPublicSiteContentAll\(/.test(siteSrc) &&
    /filterPublicSiteContentMap\(result\)/.test(siteSrc) &&
    (siteSrc.match(/getCachedPublicSiteContentAll\(/g) || []).length === 1
);
ok(
  "admin_no_store_header_present",
  /Cache-Control['"],\s*['"]no-store['"]/.test(siteSrc)
);
ok(
  "health_neg_scope_admin_401",
  /site_content_scope_admin_unauth/.test(health) &&
    /page=all&scope=admin/.test(health) &&
    /401/.test(health)
);
ok("gitignore_receipts_dir", /^public\/uploads\/receipts\/\s*$/m.test(gitignore));

(async () => {
console.log("\n# MULTI-109 mocked GET page=all");

let uncachedCalls = 0;
let cachedCalls = 0;
let filterCalls = 0;
let adminIdentity = null;
const mapAll = {
  home_hero_title: "Hello",
  trust_activation: "secret-trust",
  clarity_project_id: "secret-clarity",
};

const handler = loadTs("pages/api/site-content.ts", {
  "../../lib/db": {
    query: async () => {
      throw new Error("unexpected pool.query in page=all paths");
    },
    getConnection: async () => {
      throw new Error("unexpected getConnection");
    },
  },
  "../../lib/adminAuth": {
    requireAdmin: async (_req, res) => {
      if (!adminIdentity) {
        res.status(401).json({ error: "Unauthorized" });
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
    getCachedPublicSiteContentAll: async () => {
      cachedCalls++;
      return { ...mapAll };
    },
    loadSiteContentAllUncached: async () => {
      uncachedCalls++;
      return { ...mapAll };
    },
    invalidatePublicCmsCache: () => {},
  },
  "../../lib/publicSiteContentFilter": {
    filterPublicSiteContentMap: (v) => {
      filterCalls++;
      const out = { ...v };
      delete out.trust_activation;
      delete out.clarity_project_id;
      return out;
    },
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
}).default;

{
  adminIdentity = null;
  uncachedCalls = 0;
  cachedCalls = 0;
  filterCalls = 0;
  const res = makeRes();
  await handler(
    { method: "GET", query: { page: "all", scope: "admin" }, headers: {}, body: {} },
    res
  );
  ok("scope_admin_unauth_401", res.statusCode === 401);
  ok("scope_admin_unauth_no_loaders", uncachedCalls === 0 && cachedCalls === 0);
}

{
  adminIdentity = { id: 1, role: "super_admin", email: "a@b.c" };
  uncachedCalls = 0;
  cachedCalls = 0;
  filterCalls = 0;
  const res = makeRes();
  await handler(
    { method: "GET", query: { page: "all", scope: "admin" }, headers: {}, body: {} },
    res
  );
  ok("scope_admin_200", res.statusCode === 200);
  ok("scope_admin_uses_uncached", uncachedCalls === 1 && cachedCalls === 0);
  ok("scope_admin_no_filter", filterCalls === 0 && res.body?.trust_activation === "secret-trust");
  ok(
    "scope_admin_no_store",
    String(res.headers["cache-control"] || "").includes("no-store")
  );
}

{
  adminIdentity = null;
  uncachedCalls = 0;
  cachedCalls = 0;
  filterCalls = 0;
  const res = makeRes();
  await handler({ method: "GET", query: { page: "all" }, headers: {}, body: {} }, res);
  ok("public_page_all_200", res.statusCode === 200);
  ok("public_uses_cached_not_uncached", cachedCalls === 1 && uncachedCalls === 0);
  ok("public_applies_denylist_filter", filterCalls === 1 && !("trust_activation" in res.body));
}

console.log("\n# MULTI-109 stale-guard regression (immediate second save)");

const hashes = loadTs("lib/siteContentBaseHash.ts");
const values = { trust_activation: "orig" };
const calls = [];
const audits = [];

function makeSiteHarness() {
  const pool = {
    async query(sql, params) {
      calls.push({ sql: String(sql), params });
      if (/SELECT content_key, content_value/.test(sql) && /IN \(/.test(sql)) {
        const keys = params || [];
        const rows = keys
          .filter((k) => Object.prototype.hasOwnProperty.call(values, k))
          .map((k) => ({
            content_key: k,
            content_value: values[k],
            content_type: "text",
            page_name: "settings",
            label: k,
          }));
        return [rows];
      }
      if (/INSERT INTO site_content/.test(sql)) {
        const key = params[0];
        const val = params[1];
        values[key] = val;
        return [{ affectedRows: 1 }];
      }
      return [[]];
    },
    async getConnection() {
      return {
        async beginTransaction() {},
        async commit() {},
        async rollback() {},
        release() {},
        async query(sql, params) {
          return pool.query(sql, params);
        },
      };
    },
  };
  const stubs = {
    "../../lib/db": { __esModule: true, default: pool },
    "../../lib/siteContentSeed": { SITE_CONTENT_DEFAULTS: [] },
    "../../lib/subscriptionSlug": {
      DEFAULT_SUBSCRIPTION_SLUG: "subscription",
      isAutoSubscriptionCanonical: () => false,
      normalizeSubscriptionSlug: (v) => String(v || ""),
      subscriptionPageUrl: (v) => `/subscriptions/${v}`,
      validateSubscriptionSlug: (v) => ({ ok: true, slug: String(v) }),
    },
    "../../lib/adminAuth": {
      requireAdmin: async () => ({
        id: 1,
        username: "tester",
        role: "super_admin",
      }),
      getRequestMeta: () => ({ ip: "127.0.0.1" }),
    },
    "../../lib/adminPermissions": {
      hasAdminPermission: () => true,
      isSuperAdminSettingsKey: () => true,
    },
    "../../lib/adminAudit": {
      recordAdminAudit: async (entry) => {
        audits.push(entry);
      },
    },
    "../../lib/contentRevisions": {
      classifySiteContentEntityType: () => "site_content_batch",
      recordContentRevision: async () => {},
    },
    "../../lib/hostingerResourceInvalidation": {
      invalidateFaviconCache() {},
      invalidateSitemapCache() {},
      siteContentKeysAffectFavicon: () => false,
      siteContentKeysAffectSitemap: () => false,
    },
    "../../lib/publicCmsDataServer": {
      getCachedPublicSiteContentAll: async () => ({ ...values }),
      loadSiteContentAllUncached: async () => ({ ...values }),
      invalidatePublicCmsCache() {},
    },
    "../../lib/publicSiteContentFilter": {
      filterPublicSiteContentMap: (v) => v,
    },
    "../../lib/seasonalHubPublic": {
      SEASONAL_HUB_PUBLISHED_KEY: "seasonal_hub_published",
      validateSeasonalHubPublicationWrite: async () => ({ ok: true }),
    },
  };
  const mod = loadTs("pages/api/site-content.ts", stubs);
  return mod.default || mod;
}

{
  const h = makeSiteHarness();
  const base1 = hashes.hashSiteContentValue("orig", true);
  const res1 = makeRes();
  await h(
    {
      method: "POST",
      body: {
        updates: [{ key: "trust_activation", value: "F4UK-109-A", base_hash: base1 }],
      },
      query: {},
      headers: {},
    },
    res1
  );
  ok("stale_first_save_200", res1.statusCode === 200 && res1.body?.success === true);
  ok("stale_first_save_updated_value", values.trust_activation === "F4UK-109-A");

  const base2 = hashes.hashSiteContentValue(values.trust_activation, true);
  const res2 = makeRes();
  await h(
    {
      method: "POST",
      body: {
        updates: [{ key: "trust_activation", value: "F4UK-109-B", base_hash: base2 }],
      },
      query: {},
      headers: {},
    },
    res2
  );
  ok(
    "stale_immediate_second_save_no_409",
    res2.statusCode === 200 && res2.body?.success === true,
    `status=${res2.statusCode} body=${JSON.stringify(res2.body)}`
  );
  ok("stale_second_save_value_b", values.trust_activation === "F4UK-109-B");
}

console.log("\n# MULTI-109 receipt local cleanup contract");
{
  // phase-multi-107 local upload writes under public/uploads/receipts; must clean up.
  const multi107 = read("scripts/phase-multi-107-tests.js");
  ok(
    "multi107_cleans_local_receipt_file",
    /unlinkSync|rmSync|tmpdir|os\.tmpdir/.test(multi107)
  );
  void os.tmpdir;
}

console.log(`\nphase-multi-109: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error("FAIL  suite_exception —", err?.stack || err);
  process.exit(1);
});
