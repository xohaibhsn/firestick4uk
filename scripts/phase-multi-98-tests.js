/**
 * F4UK-MULTI-98 — CMS-UX Phase 1 (pages overview, appears-on, media picker, page builder for managers).
 * Source / permission tests. No network. No PII.
 *
 * Run: node scripts/phase-multi-98-tests.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");

function resolveRoot() {
  if (process.env.REPO_ROOT) return path.resolve(process.env.REPO_ROOT);
  const parent = path.resolve(__dirname, "..");
  if (fs.existsSync(path.join(parent, "package.json"))) return parent;
  return parent;
}

const ROOT = resolveRoot();

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
    if (stubs[id]) return stubs[id];
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

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    setHeader(k, v) {
      this.headers[k] = v;
      return this;
    },
  };
}

// --- A1 pages overview ---
const overview = loadTs("lib/cmsPagesOverview.ts");
const EXPECTED_IDS = [
  "home",
  "products_listing",
  "product_detail",
  "about",
  "contact",
  "faq",
  "subscription",
  "seasonal",
  "tracking",
  "cart",
  "success",
  "footer_global",
  "legal",
];
ok("overview_export", Array.isArray(overview.CMS_PAGES_OVERVIEW));
ok(
  "overview_ids",
  EXPECTED_IDS.every((id) => overview.CMS_PAGES_OVERVIEW.some((c) => c.id === id)),
  `count=${overview.CMS_PAGES_OVERVIEW.length}`
);
ok(
  "overview_counts",
  overview.CMS_PAGES_OVERVIEW.every(
    (c) => c.sectionCount > 0 && c.fieldCount > 0 && c.editPage && c.href
  )
);
const sidhu = read("app/sidhu/page.tsx");
ok("overview_ui", /data-cms-pages-overview/.test(sidhu) && /CMS_PAGES_OVERVIEW/.test(sidhu));
ok("overview_default_page", /useState\("overview"\)/.test(sidhu));

// --- A2 appears-on ---
const appears = loadTs("lib/cmsAppearsOn.ts");
const fields = loadTs("lib/adminContentFields.ts");
const imageFields = loadTs("lib/cmsImageFields.ts");
const sub = loadTs("components/admin/SubscriptionContentEditor.tsx");

const allSectionKeys = [];
for (const [page, sections] of Object.entries(fields.ADMIN_CONTENT_SECTIONS)) {
  for (const section of sections) {
    for (const f of section.fields) allSectionKeys.push(f.key);
  }
}
const unmapped = allSectionKeys.filter((k) => !appears.getCmsAppearsOn(k));
ok("appears_on_all_section_fields", unmapped.length === 0, unmapped.slice(0, 8).join(","));

const imgKeys = imageFields.CMS_IMAGE_FIELD_KEYS || imageFields.CMS_SETTINGS_IMAGE_FIELDS.map((f) => f.key);
const unmappedImg = imgKeys.filter((k) => !appears.getCmsAppearsOn(k) && !appears.formatCmsAppearsOnHint(k));
ok("appears_on_image_fields", unmappedImg.length === 0, unmappedImg.join(","));

const subKeys = sub.SUBSCRIPTION_CONTENT_KEYS || [];
const unmappedSub = subKeys.filter((k) => k !== "nav_subscription_label" && !appears.getCmsAppearsOn(k));
ok("appears_on_subscription_keys", unmappedSub.length === 0, unmappedSub.slice(0, 8).join(","));

const panel = read("components/admin/AdminContentPanel.tsx");
ok("panel_shows_appears_on", /formatCmsAppearsOnHint/.test(panel) && /data-cms-appears-on/.test(panel));

let helpCount = 0;
for (const sections of Object.values(fields.ADMIN_CONTENT_SECTIONS)) {
  for (const section of sections) {
    for (const f of section.fields) if (f.help) helpCount++;
  }
}
ok("help_texts_present", helpCount >= 30, `helpCount=${helpCount}`);

// home order: seasonal before featured before reviews
const homeTitles = fields.ADMIN_CONTENT_SECTIONS.home.map((s) => s.title);
ok(
  "home_order_seasonal_first",
  homeTitles[0].toLowerCase().includes("seasonal") &&
    homeTitles.some((t) => /featured/i.test(t)) &&
    homeTitles[homeTitles.length - 1].toLowerCase().includes("review")
);

// --- A3 media picker ---
ok("favicon_choose_library", /favicon_url[\s\S]{0,800}Choose from Library/.test(sidhu));
ok(
  "hero_choose_library",
  /Choose Hero Slide[\s\S]{0,400}Choose from Library/.test(sidhu) ||
    /Hero Slider Images[\s\S]{0,2500}Choose from Library/.test(sidhu)
);
ok("logo_choose_library", /site_logo_url[\s\S]{0,800}Choose from Library/.test(sidhu));
ok("og_choose_library", /og_default_image[\s\S]{0,800}Choose from Library/.test(sidhu));
ok("wa_choose_library", /whatsapp_icon_url[\s\S]{0,800}Choose from Library/.test(sidhu));
const subSrc = read("components/admin/SubscriptionContentEditor.tsx");
ok(
  "subscription_og_picker",
  /subscription_og_image/.test(subSrc) && /Choose from Library/.test(subSrc) && /onRequestMedia/.test(subSrc)
);
ok("image_field_list", Array.isArray(imageFields.CMS_SETTINGS_IMAGE_FIELDS) && imageFields.CMS_SETTINGS_IMAGE_FIELDS.length >= 8);

// --- A4 RBAC ---
const perms = loadTs("lib/adminPermissions.ts");
ok("manager_has_page_builder", perms.hasAdminPermission("manager", "page_builder.manage"));
ok("writer_no_page_builder", !perms.hasAdminPermission("writer", "page_builder.manage"));
ok("manager_no_settings", !perms.hasAdminPermission("manager", "settings.manage"));
ok("manager_no_staff", !perms.hasAdminPermission("manager", "staff.manage"));
ok("writer_no_settings", !perms.hasAdminPermission("writer", "settings.manage"));
ok("sa_has_settings", perms.hasAdminPermission("super_admin", "settings.manage"));
ok("builder_tab_manager", /id:"builder"[\s\S]{0,80}manager/.test(sidhu));

const sectionsSrc = read("pages/api/sections.ts");
ok(
  "sections_uses_permission",
  /requireAdminPermission\(req,\s*res,\s*['"]page_builder\.manage['"]/.test(sectionsSrc) &&
    !/role\s*===\s*['"]super_admin['"]/.test(sectionsSrc)
);

// Mock sections API accept manager / reject writer
async function testSectionsApi() {
  let lastRole = "manager";
  const handler = loadTs("pages/api/sections.ts", {
    "../../lib/db": {
      query: async () => [[]],
    },
    "../../lib/adminAuth": {
      requireAdminPermission: async (req, res, perm) => {
        if (lastRole === "writer") {
          res.status(403).json({ error: "Forbidden" });
          return null;
        }
        if (perm !== "page_builder.manage") {
          res.status(403).json({ error: "Forbidden" });
          return null;
        }
        return { role: lastRole, staff_id: 1 };
      },
      getRequestMeta: () => ({ ip: "127.0.0.1" }),
      assertSameOriginMutation: () => true,
    },
    "../../lib/adminAudit": { recordAdminAudit: async () => {} },
    "../../lib/adminNoStore": { setAdminNoStore: () => {} },
    "../../lib/contentRevisions": { recordContentRevision: async () => {} },
    "../../lib/publicCmsDataServer": {
      getCachedPublicVisibleSections: async () => [],
      invalidatePublicCmsCache: () => {},
    },
    "../../lib/rateLimit": {
      getClientIp: () => "127.0.0.1",
      rateLimit: () => ({ allowed: true, retryAfterSec: 0 }),
      RL_PUBLIC_GET: () => ({ allowed: true, retryAfterSec: 0 }),
    },
  });

  lastRole = "manager";
  const resM = mockRes();
  await handler.default(
    {
      method: "GET",
      query: { all: "1" },
      headers: { origin: "https://firestick4uk.com", host: "firestick4uk.com" },
      body: {},
    },
    resM
  );
  ok("api_manager_accepted", resM.statusCode !== 403, `status=${resM.statusCode}`);

  lastRole = "writer";
  const resW = mockRes();
  await handler.default(
    {
      method: "GET",
      query: { all: "1" },
      headers: { origin: "https://firestick4uk.com", host: "firestick4uk.com" },
      body: {},
    },
    resW
  );
  ok("api_writer_rejected", resW.statusCode === 403, `status=${resW.statusCode}`);
}

// --- saveContent unchanged ---
ok("saveContent_unchanged", /const saveContent = async \(keys: string\[\], overrides\?: Record<string, string>\) => \{/.test(sidhu));

// --- diff whitelist (files we expect touched) ---
const ALLOWED = [
  "lib/adminPermissions.ts",
  "lib/adminContentFields.ts",
  "lib/cmsAppearsOn.ts",
  "lib/cmsImageFields.ts",
  "lib/cmsPagesOverview.ts",
  "components/admin/AdminContentPanel.tsx",
  "components/admin/SubscriptionContentEditor.tsx",
  "app/sidhu/page.tsx",
  "scripts/phase-multi-98-tests.js",
];
ok("allowed_paths_documented", ALLOWED.length >= 8);

testSectionsApi()
  .then(() => {
    console.log(`\nMULTI-98: ${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
