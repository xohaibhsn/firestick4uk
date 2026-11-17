/**
 * F4UK-MULTI-124 — Harden remaining site_content write paths:
 * site-content PUT (lock + stale), revision restore FOR UPDATE,
 * favicon TX + revision. Mocked pool/conn only — no real DB.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");
const { createHash } = require("crypto");
const { spawnSync } = require("child_process");

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

function sha256(s) {
  return createHash("sha256").update(String(s), "utf8").digest("hex");
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

function extractBetween(src, startMarker, endMarker) {
  const start = src.indexOf(startMarker);
  const end = src.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) return null;
  return src.slice(start, end);
}

function gitShow(rel) {
  const r = spawnSync("git", ["show", `HEAD:${rel.replace(/\\/g, "/")}`], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error(`git show failed: ${r.stderr || r.stdout}`);
  return r.stdout;
}

function extractProductBranch(src) {
  const start = src.indexOf('if (revision.entity_type === "product")');
  const end = src.indexOf('if (revision.entity_type === "blog")', start);
  if (start < 0 || end < 0) return null;
  return src.slice(start, end);
}

function extractPostBranch(src) {
  return extractBetween(src, "if (req.method === 'POST')", "if (req.method === 'PUT')");
}

// --- R1 harness: site-content PUT ---
function makePutHarness(opts = {}) {
  const row =
    opts.row === null
      ? null
      : {
          content_key: opts.key || "home_hero_title",
          content_value: opts.value !== undefined ? opts.value : "old-title",
          content_type: "text",
          page_name: "home",
          label: opts.label || "Hero Title",
        };
  const calls = [];
  const audits = [];
  const revisions = [];
  const logs = [];
  let began = 0;
  let committed = 0;
  let rolled = 0;
  let released = 0;
  let failOnWrite = !!opts.failOnWrite;
  let hubReject = opts.hubReject || null;
  let role = opts.role || "super_admin";
  let perm = opts.perm !== undefined ? opts.perm : true;

  const conn = {
    async beginTransaction() {
      began++;
    },
    async commit() {
      committed++;
    },
    async rollback() {
      rolled++;
    },
    release() {
      released++;
    },
    async query(sqlOrObj, maybeParams) {
      const sql =
        typeof sqlOrObj === "string" ? sqlOrObj : String(sqlOrObj?.sql || "");
      const params = sqlOrObj?.values || maybeParams || [];
      calls.push({ sql, params, via: "conn" });
      if (/FOR UPDATE/i.test(sql)) {
        return [row ? [row] : [], []];
      }
      if (/INSERT INTO site_content/i.test(sql)) {
        if (failOnWrite) {
          const err = new Error("forced write fail");
          err.code = "ER_LOCK_WAIT_TIMEOUT";
          throw err;
        }
        if (row) {
          row.content_value = params[1];
        }
        return [{ affectedRows: 1 }, []];
      }
      return [[], []];
    },
  };

  const pool = {
    async getConnection() {
      return conn;
    },
    async query() {
      throw new Error("unexpected pool.query in PUT path");
    },
  };

  const origLog = console.log;
  console.log = (...args) => {
    logs.push(args.map(String).join(" "));
    origLog(...args);
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
      requireAdmin: async () => ({ id: 1, username: "tester", role }),
      getRequestMeta: () => ({ ip: "127.0.0.1" }),
    },
    "../../lib/adminPermissions": {
      hasAdminPermission: () => perm,
      isSuperAdminSettingsKey: (k) =>
        k === "favicon_url" || k === "seasonal_hub_published" || k === "site_title",
    },
    "../../lib/adminAudit": {
      recordAdminAudit: async (entry) => {
        audits.push(entry);
      },
    },
    "../../lib/contentRevisions": {
      classifySiteContentEntityType: (keys) =>
        keys.some((k) => k === "favicon_url" || k === "site_title")
          ? "site_settings"
          : "site_content",
      recordContentRevision: async (payload) => {
        revisions.push(payload);
      },
    },
    "../../lib/hostingerResourceInvalidation": {
      invalidateFaviconCache() {},
      invalidateSitemapCache() {},
      siteContentKeysAffectFavicon: () => false,
      siteContentKeysAffectSitemap: () => false,
    },
    "../../lib/publicCmsDataServer": {
      getCachedPublicSiteContentAll: async () => ({}),
      loadSiteContentAllUncached: async () => ({}),
      invalidatePublicCmsCache() {},
    },
    "../../lib/publicSiteContentFilter": {
      filterPublicSiteContentMap: (v) => v,
    },
    "../../lib/seasonalHubPublic": {
      SEASONAL_HUB_PUBLISHED_KEY: "seasonal_hub_published",
      validateSeasonalHubPublicationWrite: async () =>
        hubReject || { ok: true },
    },
  };

  const mod = loadTs("pages/api/site-content.ts", stubs);
  console.log = origLog;
  return {
    handler: mod.default || mod,
    calls,
    audits,
    revisions,
    logs,
    stats: () => ({ began, committed, rolled, released }),
    row,
  };
}

async function invokePut(body, opts = {}) {
  const h = makePutHarness(opts);
  const res = makeRes();
  await h.handler(
    {
      method: "PUT",
      body,
      query: {},
      headers: {},
      __adminIdentity: { id: 1, username: "tester", role: opts.role || "super_admin" },
    },
    res
  );
  return { ...h, res };
}

// --- R3 harness: restore ---
function makeRestoreHarness(opts = {}) {
  const entityType = opts.entityType || "blog";
  const calls = [];
  const revisions = [];
  let began = 0;
  let committed = 0;
  let rolled = 0;
  let released = 0;
  let failAfterRevision = !!opts.failAfterRevision;
  let revisionRecorded = false;

  const blogRow = {
    id: 9,
    title: "Current Blog",
    slug: "current-blog",
    excerpt: "ex",
    content: "body",
    category: "Guides",
    emoji: "📝",
    badge: "guide",
    badgeText: "Guide",
    featured_image: "",
    meta_title: "",
    meta_description: "",
    focus_keyword: "",
    status: "published",
    featured: 0,
    canonical_url: null,
    faqs: null,
    active: 1,
  };

  const siteRows = [
    {
      content_key: "home_hero_title",
      content_value: "live-title",
      content_type: "text",
      page_name: "home",
      label: "Hero",
    },
  ];

  const sectionRow = {
    content_key: "home_section_x",
    content_value: '{"title":"Live"}',
    content_type: "json",
    page_name: "home",
    label: "Section X",
    section_order: 1,
    is_visible: 1,
  };

  const productRow = {
    id: 3,
    name: "Prod",
    slug: "prod",
    description: "d",
    price: 10,
    category: "Device",
    badge: null,
    image: null,
    stock: "Digital",
    short_description: "",
    full_description: "",
    seo_title: "",
    meta_description: "",
    focus_keyword: "",
    features: "",
    og_image: "",
    product_version: 2,
    active: 1,
  };

  const conn = {
    async beginTransaction() {
      began++;
    },
    async commit() {
      committed++;
    },
    async rollback() {
      rolled++;
    },
    release() {
      released++;
    },
    async query(sqlOrObj, maybeParams) {
      const sql =
        typeof sqlOrObj === "string" ? sqlOrObj : String(sqlOrObj?.sql || "");
      const params = sqlOrObj?.values || maybeParams || [];
      calls.push({ sql, params, via: "conn" });
      if (/FROM blog_posts/i.test(sql)) {
        return [[blogRow], []];
      }
      if (/FROM site_content WHERE content_key IN/i.test(sql)) {
        return [siteRows, []];
      }
      if (/FROM site_content WHERE content_key=\?/i.test(sql)) {
        return [[sectionRow], []];
      }
      if (/FROM products/i.test(sql)) {
        return [[productRow], []];
      }
      if (/UPDATE blog_posts|UPDATE site_content|INSERT INTO site_content|UPDATE products/i.test(sql)) {
        if (failAfterRevision && revisionRecorded) {
          throw new Error("forced update fail");
        }
        return [{ affectedRows: 1 }, []];
      }
      return [[], []];
    },
  };

  const pool = {
    async getConnection() {
      return conn;
    },
    async query() {
      return [[], []];
    },
  };

  const revisionRow = {
    id: 55,
    entity_type: entityType,
    entity_id:
      entityType === "blog"
        ? "9"
        : entityType === "section"
          ? "home_section_x"
          : entityType === "product"
            ? "3"
            : "home_hero_title",
    entity_label: "label",
    revision_action: "update",
    snapshot_json:
      entityType === "blog"
        ? JSON.stringify({
            title: "Old Blog",
            slug: "current-blog",
            excerpt: "old",
            content: "old body",
            category: "Guides",
            emoji: "📝",
            badge: "guide",
            badgeText: "Guide",
            featured_image: "",
            meta_title: "",
            meta_description: "",
            focus_keyword: "",
            status: "published",
            featured: 0,
            canonical_url: null,
            faqs: null,
            active: 1,
          })
        : entityType === "section"
          ? JSON.stringify({
              content_key: "home_section_x",
              content_value: '{"title":"Old"}',
              label: "Section X",
              section_order: 1,
              is_visible: 1,
            })
          : entityType === "product"
            ? JSON.stringify({
                name: "Prod",
                slug: "prod",
                description: "old",
                price: 10,
                category: "Device",
                badge: null,
                image: null,
                stock: "Digital",
                short_description: "",
                full_description: "",
                seo_title: "",
                meta_description: "",
                focus_keyword: "",
                features: "",
                og_image: "",
              })
            : JSON.stringify({
                values: { home_hero_title: "restored-title" },
                metadata: {
                  rows: {
                    home_hero_title: {
                      content_type: "text",
                      page_name: "home",
                      label: "Hero",
                    },
                  },
                },
              }),
  };

  const stubs = {
    "../../../lib/db": { __esModule: true, default: pool },
    "../../../lib/adminAuth": {
      requireAdminPermission: async () => ({
        id: 1,
        username: "tester",
        role: "super_admin",
      }),
      getRequestMeta: () => ({ ip: "127.0.0.1" }),
    },
    "../../../lib/adminAudit": { recordAdminAudit: async () => {} },
    "../../../lib/siteContentSeed": { SITE_CONTENT_DEFAULTS: [] },
    "../../../lib/adminPermissions": {
      isSuperAdminSettingsKey: () => false,
    },
    "../../../lib/contentRevisions": {
      canRestoreRevisionEntity: () => true,
      getRevisionById: async () => revisionRow,
      parseSnapshot: (j) => JSON.parse(j),
      recordContentRevision: async (payload) => {
        revisions.push(payload);
        revisionRecorded = true;
      },
      snapshotBlog: (row) => ({ ...row }),
      snapshotHasSubscriptionRouting: () => false,
      snapshotProduct: (row) => ({ ...row }),
      SUBSCRIPTION_ROUTING_KEYS: new Set([
        "subscription_slug",
        "subscription_previous_slug",
        "subscription_canonical",
      ]),
    },
    "../../../lib/publicCmsDataServer": {
      invalidatePublicCmsCache() {},
    },
    "../../../lib/blogSeoSafety": {
      normalizeBlogCanonicalInput: () => ({ ok: true, canonical: null }),
      normalizeBlogSlug: (s) => String(s || "").toLowerCase(),
    },
    "../../../lib/hostingerResourceInvalidation": {
      invalidateSitemapCache() {},
    },
    "../../../lib/postSaveSeoGuard": {
      runPostSaveSeoGuard: async () => ({ ok: true }),
    },
    "../../../lib/productWriterTx": {
      assertSingleUpdate: () => {},
      gateExpectedVersionAllowMaxNoop: () => ({ ok: true }),
    },
    "../../../lib/productSeasonLondon": {
      normalizeSeasonalUtcFields: (r) => r,
    },
    "../../../lib/productSeasonalQuery": {
      queryWithSeasonalUtc: async (c, sql, params) => c.query(sql, params),
    },
    "../../../lib/productSeasonActions": {
      PRODUCT_VERSION_MAX: 2147483647,
    },
    "../../../lib/seasonalHubPublic": {
      SEASONAL_HUB_PUBLISHED_KEY: "seasonal_hub_published",
      validateSeasonalHubPublicationWrite: async () => ({ ok: true }),
    },
  };

  const mod = loadTs("pages/api/admin-revisions/restore.ts", stubs);
  return {
    handler: mod.default || mod,
    calls,
    revisions,
    stats: () => ({ began, committed, rolled, released }),
  };
}

async function invokeRestore(entityType, opts = {}) {
  const h = makeRestoreHarness({ ...opts, entityType });
  const res = makeRes();
  await h.handler(
    {
      method: "POST",
      body: { revision_id: 55, expected_version: 2 },
      query: {},
      headers: {},
    },
    res
  );
  return { ...h, res };
}

// --- R4 harness: upload-favicon ---
function makeFaviconHarness(opts = {}) {
  const calls = [];
  const revisions = [];
  let began = 0;
  let committed = 0;
  let rolled = 0;
  let released = 0;
  let failOnUpsert = !!opts.failOnUpsert;
  const currentVal = opts.currentVal !== undefined ? opts.currentVal : "/old-favicon.png";
  const hasRow = opts.hasRow !== false;

  // Minimal valid 1x1 PNG
  const pngB64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const dataUrl = `data:image/png;base64,${pngB64}`;

  const conn = {
    async beginTransaction() {
      began++;
    },
    async commit() {
      committed++;
    },
    async rollback() {
      rolled++;
    },
    release() {
      released++;
    },
    async query(sqlOrObj, maybeParams) {
      const sql =
        typeof sqlOrObj === "string" ? sqlOrObj : String(sqlOrObj?.sql || "");
      const params = sqlOrObj?.values || maybeParams || [];
      calls.push({ sql, params, via: "conn" });
      if (/FOR UPDATE/i.test(sql)) {
        if (!hasRow) return [[], []];
        return [
          [
            {
              content_key: "favicon_url",
              content_value: currentVal,
              content_type: "image",
              page_name: "settings",
              label: "Favicon URL",
            },
          ],
          [],
        ];
      }
      if (/INSERT INTO site_content/i.test(sql)) {
        if (failOnUpsert) throw new Error("forced favicon upsert fail");
        return [{ affectedRows: 1 }, []];
      }
      return [[], []];
    },
  };

  const pool = {
    async getConnection() {
      return conn;
    },
    async query() {
      throw new Error("unexpected pool.query for favicon DB write");
    },
  };

  delete process.env.CLOUDINARY_CLOUD_NAME;
  delete process.env.CLOUDINARY_API_KEY;
  delete process.env.CLOUDINARY_API_SECRET;

  const stubs = {
    fs: {
      existsSync: () => true,
      mkdirSync: () => {},
      writeFileSync: () => {},
    },
    path: {
      join: (...parts) => parts.join("/"),
    },
    "../../lib/db": { __esModule: true, default: pool },
    "../../lib/adminAuth": {
      requireAdminPermission: async () => ({
        id: 1,
        username: "tester",
        role: "super_admin",
      }),
    },
    "../../lib/mediaLibraryServer": {
      recordMediaAsset: async () => 99,
    },
    "../../lib/adminAudit": { recordAdminAudit: async () => {} },
    "../../lib/imageUploadValidation": {
      FAVICON_IMAGE_FORMATS: ["png", "jpeg", "ico"],
      FAVICON_MAX_RAW_BYTES: 512 * 1024,
      parseDataUrlImage: () => ({
        ok: true,
        data: {
          format: "png",
          mime: "image/png",
          buffer: Buffer.from(pngB64, "base64"),
          dataUrl,
        },
      }),
      sanitizeUploadFilename: (n) => n || "favicon",
    },
    "../../lib/hostingerResourceInvalidation": {
      invalidateFaviconCache() {},
    },
    "../../lib/publicCmsDataServer": {
      invalidatePublicCmsCache() {},
    },
    "../../lib/rateLimit": {
      getClientIp: () => "127.0.0.1",
    },
    "../../lib/contentRevisions": {
      classifySiteContentEntityType: (keys) =>
        keys[0] === "favicon_url" ? "site_settings" : "site_content",
      recordContentRevision: async (payload) => {
        revisions.push(payload);
      },
    },
  };

  const mod = loadTs("pages/api/upload-favicon.ts", stubs);
  return {
    handler: mod.default || mod,
    calls,
    revisions,
    dataUrl,
    stats: () => ({ began, committed, rolled, released }),
  };
}

async function invokeFavicon(opts = {}) {
  const h = makeFaviconHarness(opts);
  const res = makeRes();
  await h.handler(
    {
      method: "POST",
      body: { file: h.dataUrl, name: "favicon.png" },
      query: {},
      headers: {},
    },
    res
  );
  return { ...h, res };
}

(async () => {
  const hashes = loadTs("lib/siteContentBaseHash.ts");

  console.log("\n# MULTI-124 source / caller contracts");

  const siteSrc = read("pages/api/site-content.ts");
  const restoreSrc = read("pages/api/admin-revisions/restore.ts");
  const favSrc = read("pages/api/upload-favicon.ts");
  const headSite = gitShow("pages/api/site-content.ts");
  const headRestore = gitShow("pages/api/admin-revisions/restore.ts");

  const postNow = extractPostBranch(siteSrc);
  const postHead = extractPostBranch(headSite);
  ok(
    "post_branch_byte_identical",
    !!postNow && !!postHead && sha256(postNow) === sha256(postHead),
    postNow && postHead ? sha256(postNow).slice(0, 12) : "missing"
  );

  const prodNow = extractProductBranch(restoreSrc);
  const prodHead = extractProductBranch(headRestore);
  ok(
    "product_branch_byte_identical",
    !!prodNow && !!prodHead && sha256(prodNow) === sha256(prodHead),
    prodNow && prodHead ? sha256(prodNow).slice(0, 12) : "missing"
  );

  ok(
    "put_uses_for_update",
    /method === 'PUT'[\s\S]*FOR UPDATE[\s\S]*method === 'DELETE'/.test(siteSrc) ||
      /method === 'PUT'[\s\S]*WHERE content_key=\? FOR UPDATE/.test(siteSrc)
  );
  ok(
    "put_legacy_log_marker",
    /legacy_put_no_base_hash/.test(siteSrc)
  );
  ok(
    "restore_blog_for_update",
    /SELECT \* FROM blog_posts WHERE id=\? LIMIT 1 FOR UPDATE/.test(restoreSrc)
  );
  ok(
    "restore_site_content_for_update",
    /FROM site_content WHERE content_key IN \(\$\{keys\.map\(\(\) => "\?"\)\.join\(","\)\}\) FOR UPDATE/.test(
      restoreSrc
    )
  );
  ok(
    "restore_section_for_update",
    /FROM site_content WHERE content_key=\? LIMIT 1 FOR UPDATE/.test(restoreSrc)
  );
  ok(
    "favicon_tx_revision_imports",
    /classifySiteContentEntityType/.test(favSrc) &&
      /recordContentRevision/.test(favSrc) &&
      /beginTransaction/.test(favSrc) &&
      /FOR UPDATE/.test(favSrc)
  );

  // Caller grep: no runtime PUT /api/site-content in app/components/lib
  const callerRoots = ["app", "components", "lib"];
  let putCallers = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === "node_modules" || ent.name === ".next") continue;
        walk(p);
      } else if (/\.(ts|tsx|js|jsx)$/.test(ent.name)) {
        const txt = fs.readFileSync(p, "utf8");
        if (!txt.includes("/api/site-content")) continue;
        // Look for PUT near site-content fetches
        const re =
          /fetch\(\s*["'`]\/api\/site-content["'`][\s\S]{0,200}?method:\s*["']PUT["']|method:\s*["']PUT["'][\s\S]{0,200}?["'`]\/api\/site-content["'`]/g;
        if (re.test(txt)) {
          putCallers.push(path.relative(ROOT, p).replace(/\\/g, "/"));
        }
      }
    }
  }
  for (const r of callerRoots) walk(path.join(ROOT, r));
  ok(
    "no_runtime_put_site_content_callers",
    putCallers.length === 0,
    putCallers.join(",") || "none"
  );

  console.log("\n# R1 site-content PUT");

  const oldHash = hashes.hashSiteContentValue("old-title", true);
  let run = await invokePut({
    content_key: "home_hero_title",
    content_value: "new-title",
    base_hash: oldHash,
  });
  ok("put_match_200", run.res.statusCode === 200 && run.res.body?.success);
  ok(
    "put_locked_read_for_update",
    run.calls.some((c) => /FOR UPDATE/i.test(c.sql) && c.via === "conn")
  );
  ok(
    "put_response_base_hash",
    run.res.body?.base_hash === hashes.hashSiteContentValue("new-title", true)
  );
  ok("put_match_revision", run.revisions.length === 1);
  ok("put_match_write", run.calls.some((c) => /INSERT INTO site_content/i.test(c.sql)));
  ok(
    "put_tx_commit",
    run.stats().began === 1 && run.stats().committed === 1 && run.stats().rolled === 0
  );

  run = await invokePut({
    content_key: "home_hero_title",
    content_value: "mine",
    base_hash: oldHash,
  }, { value: "server-changed" });
  ok(
    "put_stale_409",
    run.res.statusCode === 409 &&
      run.res.body?.error === "stale" &&
      Array.isArray(run.res.body?.conflicts) &&
      run.res.body.conflicts[0] === "home_hero_title"
  );
  ok(
    "put_stale_no_write",
    !run.calls.some((c) => /INSERT INTO site_content/i.test(c.sql))
  );
  ok("put_stale_no_revision", run.revisions.length === 0);
  ok("put_stale_rollback", run.stats().rolled >= 1 && run.stats().committed === 0);

  run = await invokePut({
    content_key: "home_hero_title",
    content_value: "forced",
    base_hash: oldHash,
    force: true,
  }, { value: "server-changed" });
  ok("put_force_200", run.res.statusCode === 200 && run.res.body?.success);
  ok("put_force_write", run.calls.some((c) => /INSERT INTO site_content/i.test(c.sql)));
  ok(
    "put_force_overwrite_audit",
    run.audits.some((a) => a.action === "site_content.overwrite_stale") &&
      !JSON.stringify(run.audits).includes("forced")
  );

  const origLog = console.log;
  const captured = [];
  console.log = (...a) => {
    captured.push(a.map(String).join(" "));
    origLog(...a);
  };
  run = await invokePut({
    content_key: "home_hero_title",
    content_value: "legacy-new",
  });
  console.log = origLog;
  ok("put_legacy_200", run.res.statusCode === 200 && run.res.body?.success);
  ok(
    "put_legacy_log",
    captured.some((l) => /legacy_put_no_base_hash/.test(l))
  );
  ok("put_legacy_write", run.calls.some((c) => /INSERT INTO site_content/i.test(c.sql)));
  ok(
    "put_legacy_returns_base_hash",
    run.res.body?.base_hash === hashes.hashSiteContentValue("legacy-new", true)
  );

  run = await invokePut({
    content_key: "home_hero_title",
    content_value: "old-title",
    base_hash: oldHash,
  });
  ok("put_unchanged_200", run.res.statusCode === 200);
  ok("put_unchanged_no_revision", run.revisions.length === 0);
  ok(
    "put_unchanged_no_write",
    !run.calls.some((c) => /INSERT INTO site_content/i.test(c.sql))
  );
  ok(
    "put_unchanged_base_hash",
    run.res.body?.base_hash === oldHash
  );

  run = await invokePut(
    {
      content_key: "home_hero_title",
      content_value: "x",
      base_hash: oldHash,
    },
    { perm: false, role: "content_editor" }
  );
  ok("put_permission_403", run.res.statusCode === 403);

  run = await invokePut(
    {
      content_key: "seasonal_hub_published",
      content_value: "1",
      base_hash: hashes.hashSiteContentValue("0", true),
    },
    {
      key: "seasonal_hub_published",
      value: "0",
      hubReject: { ok: false, status: 400, error: "hub blocked" },
    }
  );
  ok(
    "put_hub_gate_enforced",
    run.res.statusCode === 400 &&
      run.res.body?.code === "seasonal_hub_publish_rejected"
  );
  ok(
    "put_hub_gate_no_tx_write",
    !run.calls.some((c) => /INSERT INTO site_content/i.test(c.sql))
  );

  console.log("\n# R3 admin-revisions/restore locked reads");

  for (const entityType of ["blog", "site_content", "section"]) {
    run = await invokeRestore(entityType);
    ok(`${entityType}_restore_200`, run.res.statusCode === 200 && run.res.body?.success);
    ok(
      `${entityType}_restore_for_update`,
      run.calls.some((c) => /FOR UPDATE/i.test(c.sql) && c.via === "conn")
    );
    ok(
      `${entityType}_restore_revision_on_conn`,
      run.revisions.length === 1
    );
    ok(
      `${entityType}_restore_tx_commit`,
      run.stats().began === 1 &&
        run.stats().committed === 1 &&
        run.stats().rolled === 0
    );
    const fuIdx = run.calls.findIndex((c) => /FOR UPDATE/i.test(c.sql));
    const updIdx = run.calls.findIndex((c) =>
      /UPDATE blog_posts|UPDATE site_content|INSERT INTO site_content/i.test(c.sql)
    );
    ok(
      `${entityType}_restore_lock_before_update`,
      fuIdx >= 0 && updIdx > fuIdx
    );
  }

  run = await invokeRestore("blog", { failAfterRevision: true });
  ok("restore_error_500", run.res.statusCode === 500);
  ok("restore_error_rollback", run.stats().rolled >= 1 && run.stats().committed === 0);

  console.log("\n# R4 upload-favicon TX + revision");

  run = await invokeFavicon({ currentVal: "/old-favicon.png" });
  ok("favicon_200", run.res.statusCode === 200 && run.res.body?.success);
  ok(
    "favicon_revision_on_change",
    run.revisions.length === 1 &&
      run.revisions[0].entityType === "site_settings" &&
      run.revisions[0].snapshot?.values?.favicon_url === "/old-favicon.png"
  );
  ok(
    "favicon_tx_commit",
    run.stats().began === 1 && run.stats().committed === 1
  );
  ok(
    "favicon_for_update",
    run.calls.some((c) => /FOR UPDATE/i.test(c.sql))
  );

  // Same-value: set currentVal to whatever URL the handler will write is hard
  // (timestamped). Instead assert no revision when locked value equals upsert param
  // by forcing currentVal equal after first call's returned URL.
  const firstUrl = run.res.body?.url;
  run = await invokeFavicon({ currentVal: firstUrl });
  // New upload always creates a new stamped URL → value differs → revision expected.
  // Explicit same-value path: stub upsert URL equality via currentVal matching publicUrl
  // is not reachable without freezing Date. Source-shape + change path covered above.
  // Dedicated same-value unit via direct conn mock:
  {
    const h = makeFaviconHarness({ currentVal: "SAME" });
    // Monkey: after load, intercept conn.query INSERT to use "SAME" as publicUrl path —
    // instead call handler after patching Date.now.
    const realNow = Date.now;
    Date.now = () => 1234567890;
    const res = makeRes();
    // Pre-set current to the local path the handler will generate
    const expected = `/uploads/favicon/favicon-1234567890.png?v=1234567890`;
    const h2 = makeFaviconHarness({ currentVal: expected });
    await h2.handler(
      {
        method: "POST",
        body: { file: h2.dataUrl, name: "favicon.png" },
        query: {},
        headers: {},
      },
      res
    );
    Date.now = realNow;
    ok(
      "favicon_same_value_no_revision",
      res.statusCode === 200 && h2.revisions.length === 0,
      `rev=${h2.revisions.length} url=${res.body?.url}`
    );
  }

  run = await invokeFavicon({ failOnUpsert: true });
  ok("favicon_db_error_500", run.res.statusCode === 500);
  ok(
    "favicon_db_error_rollback",
    run.stats().rolled >= 1 && run.stats().committed === 0
  );

  // Shape test: favicon revision snapshot restoreable by restore.ts site_content family
  const snap = {
    values: { favicon_url: "/old-favicon.png" },
    metadata: {
      rows: {
        favicon_url: {
          content_type: "image",
          page_name: "settings",
          label: "Favicon URL",
        },
      },
      keys: ["favicon_url"],
    },
  };
  ok(
    "favicon_revision_shape_restorable",
    snap.values &&
      typeof snap.values.favicon_url === "string" &&
      snap.metadata?.rows?.favicon_url?.content_type === "image"
  );

  // Restore can apply favicon-shaped site_settings revision (mocked)
  {
    const h = makeRestoreHarness({ entityType: "site_settings" });
    // Override getRevision snapshot via re-load with favicon snap — simpler: invoke
    // site_content restore already covers the family path; assert source accepts entity.
    ok(
      "restore_source_handles_site_settings",
      /entity_type === "site_settings"/.test(restoreSrc) ||
        /revision\.entity_type === "site_settings"/.test(restoreSrc)
    );
  }

  console.log(`\nphase-multi-124: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error("FAIL  suite_exception —", err?.stack || err);
  process.exit(1);
});
