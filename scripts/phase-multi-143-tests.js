/**
 * F4UK-MULTI-143 — Content Editor draft bar (Draft/Publish D3) + D2 nits.
 * Mocked fetch/dialogs only; never a real DB or network.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const Module = require("module");
const { createHash } = require("crypto");
const { spawnSync } = require("child_process");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..");
const BASE = "7cbc93c561425584163189314c9ac238e5b03917";
const NODE = process.execPath;

let passed = 0;
let failed = 0;

function ok(name, cond, detail) {
  if (cond) {
    passed++;
    console.log(`  PASS ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name}${detail ? " — " + detail : ""}`);
  }
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function norm(s) {
  return String(s).replace(/\r\n/g, "\n");
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
    if (id.startsWith("./") || id.startsWith("../") || id.startsWith("@/")) {
      let resolved = id;
      if (id.startsWith("@/")) resolved = path.join(ROOT, id.slice(2));
      else resolved = path.normalize(path.join(path.dirname(abs), id));
      for (const candidate of [
        resolved,
        resolved + ".ts",
        resolved + ".tsx",
        resolved + ".js",
      ]) {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          return loadTs(path.relative(ROOT, candidate).replace(/\\/g, "/"), stubs);
        }
      }
    }
    return orig(id);
  };
  m._compile(out, abs);
  return m.exports;
}

function extractSaveContent(src) {
  const lines = norm(src).split("\n");
  const start = lines.findIndex((l) => /^  const saveContent = async \(/.test(l));
  if (start < 0) return null;
  let end = -1;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i] === "  };") {
      end = i;
      break;
    }
  }
  if (end < 0) return null;
  return lines.slice(start, end + 1).join("\n");
}

function gitShow(ref, rel) {
  const r = spawnSync("git", ["show", `${ref}:${rel}`], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error(r.stderr || "git show failed");
  return r.stdout;
}

// ─── contentDraftClient helpers ─────────────────────────────────────────────

function runClientHelperTests() {
  console.log("\n# contentDraftClient");
  const mod = loadTs("lib/contentDraftClient.ts");
  ok("exports_entity_type", mod.DRAFT_ENTITY_TYPE === "site_content_page");

  const HASH_A = "a".repeat(64);
  const HASH_B = "b".repeat(64);
  const isSettings = (k) => k === "site_title" || k.startsWith("settings_");

  {
    const r = mod.buildDraftChanges(
      { home_hero_title: "New", site_title: "X", about_title: "Same", orphan: "y" },
      { home_hero_title: "Old", site_title: "Y", about_title: "Same" },
      (k) => (k === "orphan" ? undefined : HASH_A),
      isSettings
    );
    ok("build_dirty_only", Object.keys(r.changes).join(",") === "home_hero_title");
    ok("build_skips_settings", r.skippedSettingsKeys.join(",") === "site_title");
    ok("build_missing_hash", r.missingHashKeys.join(",") === "orphan");
    ok(
      "build_change_shape",
      r.changes.home_hero_title.value === "New" &&
        r.changes.home_hero_title.base_hash === HASH_A
    );
  }

  {
    const r = mod.buildDraftChanges({}, {}, () => HASH_A, isSettings);
    ok("build_nothing_dirty", Object.keys(r.changes).length === 0);
  }

  {
    const changes = {
      home_hero_title: { value: "A", base_hash: HASH_A },
      about_title: { value: "B", base_hash: HASH_A },
    };
    const live = mod.liveChangedKeys(changes, (k) =>
      k === "home_hero_title" ? HASH_B : k === "about_title" ? HASH_A : undefined
    );
    ok("live_changed_detects", live.join(",") === "home_hero_title");
    ok(
      "live_changed_skips_unknown_baseline",
      mod.liveChangedKeys(
        { x: { value: "1", base_hash: HASH_A } },
        () => undefined
      ).length === 0
    );
  }

  {
    const o = mod.draftOverrides({
      a: { value: "1", base_hash: HASH_A },
      b: { value: "2", base_hash: HASH_A },
    });
    ok("draft_overrides", o.a === "1" && o.b === "2");
  }

  {
    const changes = {
      a: { value: "live", base_hash: HASH_A },
      b: { value: "draft", base_hash: HASH_A },
    };
    const match = mod.keysMatchingLive(changes, { a: "live", b: "other" });
    ok("keys_matching_live", match.join(",") === "a");
    ok(
      "keys_matching_all",
      mod.keysMatchingLive(changes, { a: "live", b: "draft" }).length === 2
    );
  }

  {
    const dto = {
      updated_by_name: "Ada",
      updated_at: "2026-11-19T15:00:00.000Z",
      key_count: 3,
      age_days: 7,
    };
    const b = mod.formatDraftBanner(dto, Date.parse("2026-11-19T15:00:00.000Z"));
    ok("banner_who", b.who === "Ada");
    ok("banner_count", b.count === 3);
    ok("banner_stale_7", b.staleDaysWarning === true);
    ok("banner_london_nonempty", typeof b.whenLondon === "string" && b.whenLondon.length > 0);
    ok(
      "banner_never_throws_null",
      (() => {
        try {
          const x = mod.formatDraftBanner(null, NaN);
          return x.who === "someone";
        } catch {
          return false;
        }
      })()
    );
    ok(
      "banner_age_under_7_no_warn",
      mod.formatDraftBanner({ ...dto, age_days: 6 }).staleDaysWarning === false
    );
  }
}

// ─── CmsDraftBar source assertions ──────────────────────────────────────────

function runBarSourceAssertions() {
  console.log("\n# CmsDraftBar source");
  const src = read("components/admin/CmsDraftBar.tsx");
  ok("use_client", /^["']use client["']/.test(src.trim()) || src.includes('"use client"'));
  ok("entity_type_const", /site_content_page/.test(src) && /DRAFT_ENTITY_TYPE/.test(src));
  ok(
    "put_expected_version",
    /method:\s*["']PUT["']/.test(src) && /expected_draft_version/.test(src)
  );
  ok(
    "delete_expected_version",
    /method:\s*["']DELETE["']/.test(src) &&
      /expected_draft_version:\s*draft\.draft_version/.test(src)
  );
  ok(
    "publish_before_delete",
    /const ok = await onPublish\(/.test(src) &&
      /if \(!ok\) return;/.test(src) &&
      src.indexOf("await onPublish(") < src.indexOf('method: "DELETE"')
  );
  ok(
    "publish_delete_only_on_ok",
    /const ok = await onPublish[\s\S]*?if \(!ok\) return;[\s\S]*?method:\s*["']DELETE["']/.test(
      src
    )
  );
  ok(
    "available_false_null",
    /if \(available === false\) return null;/.test(src)
  );
  // F4UK-MULTI-151: session expiry may be invoked via onSessionExpiredRef.current()
  // (stable-ref pattern) as well as a direct onSessionExpired() call.
  ok(
    "session_401",
    /status === 401/.test(src) &&
      (/onSessionExpiredRef\.current\s*\(/.test(src) || /onSessionExpired\s*\(/.test(src))
  );
  ok(
    "no_server_only_imports",
    !/from\s+["']@\/lib\/db["']/.test(src) &&
      !/from\s+["']@\/lib\/siteContentBaseHash["']/.test(src) &&
      !/from\s+["']@\/lib\/contentDrafts["']/.test(src) &&
      !/from\s+["'].*lib\/db["']/.test(src)
  );
  ok(
    "no_polling_autosave",
    !/setInterval\s*\(/.test(src) &&
      !/setTimeout\s*\(/.test(src) &&
      !/auto-?save/i.test(src)
  );
  ok("no_localStorage", !/localStorage/.test(src));
}

// ─── page.tsx wiring + saveContent identity ─────────────────────────────────

function runPageAssertions() {
  console.log("\n# page.tsx");
  const src = read("app/sidhu/page.tsx");
  const importHits = src.match(/import CmsDraftBar from ["']@\/components\/admin\/CmsDraftBar["'];/g) || [];
  ok("exactly_one_import", importHits.length === 1);
  const elHits = src.match(/<CmsDraftBar\b[^>]*\/>/g) || [];
  ok("exactly_one_element", elHits.length === 1);

  const previewIdx = src.indexOf("<CmsPreviewPane");
  const draftIdx = src.indexOf("<CmsDraftBar");
  const previewClose = src.indexOf("/>", previewIdx);
  ok(
    "after_preview_pane",
    previewIdx >= 0 && draftIdx > previewClose && draftIdx - previewClose < 200
  );

  const curBlock = extractSaveContent(src);
  const baseBlock = extractSaveContent(gitShow(BASE, "app/sidhu/page.tsx"));
  ok("saveContent_found", !!curBlock && !!baseBlock);
  ok(
    "saveContent_byte_identical",
    !!curBlock && !!baseBlock && curBlock === baseBlock,
    curBlock && baseBlock
      ? `cur=${sha256(curBlock)} base=${sha256(baseBlock)}`
      : "missing"
  );

  const num = spawnSync("git", ["diff", "--numstat", BASE, "--", "app/sidhu/page.tsx"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const line = (num.stdout || "").trim().split(/\r?\n/)[0] || "";
  const parts = line.split(/\s+/);
  const added = Number(parts[0]);
  const removed = Number(parts[1]);
  ok(
    "page_diff_cms_plus_product_draft_wiring",
    removed === 0 && added === 33,
    `numstat=${line || "(empty)"}`
  );
}

// ─── D2 nits (mocked handler) ───────────────────────────────────────────────

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

async function runHandler(handler, req) {
  const res = makeRes();
  const origLog = console.log;
  const origErr = console.error;
  console.log = () => {};
  console.error = () => {};
  try {
    await handler({ headers: {}, query: {}, body: {}, ...req }, res);
  } finally {
    console.log = origLog;
    console.error = origErr;
  }
  return res;
}

async function runD2NitTests() {
  console.log("\n# D2 nits");
  const siteContentQueries = [];
  const conn = {
    async query(sql) {
      const s = String(sql);
      if (/FROM site_content/i.test(s)) {
        siteContentQueries.push(s);
      }
      return [[], []];
    },
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
  };
  const pool = {
    async getConnection() {
      return conn;
    },
    async query() {
      return [[], []];
    },
  };

  const stubs = {
    "../../lib/db": { default: pool, __esModule: true },
    "../../lib/adminAuth": {
      requireAdminPermission: async () => ({
        id: 1,
        name: "Admin",
        role: "super_admin",
        staffId: 1,
      }),
      getRequestMeta: () => ({ ip: "127.0.0.1" }),
    },
    "../../lib/adminAudit": { recordAdminAudit: async () => {} },
    "../../lib/adminNoStore": { setAdminNoStore: (res) => res.setHeader("cache-control", "no-store") },
    "../../lib/contentDraftsCapability": {
      contentDraftsTableAvailable: async () => true,
    },
  };

  // Load real contentDrafts (with light stubs for db if pulled)
  const draftsMod = loadTs("lib/contentDrafts.ts", {
    "./db": { default: {} },
  });
  stubs["../../lib/contentDrafts"] = draftsMod;

  const apiAbs = path.join(ROOT, "pages/api/admin-drafts.ts");
  const apiSrc = fs.readFileSync(apiAbs, "utf8");
  const out = ts.transpileModule(apiSrc, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: apiAbs,
  }).outputText;
  const m = new Module(apiAbs, module);
  m.filename = apiAbs;
  m.paths = Module._nodeModulePaths(path.dirname(apiAbs));
  const orig = m.require.bind(m);
  m.require = (id) => {
    if (Object.prototype.hasOwnProperty.call(stubs, id)) return stubs[id];
    return orig(id);
  };
  m._compile(out, apiAbs);
  const handler = m.exports.default || m.exports;

  // >200 keys -> too_many_keys without site_content query
  siteContentQueries.length = 0;
  const many = {};
  for (let i = 0; i < 201; i++) {
    many["k" + i] = { value: "v", base_hash: "a".repeat(64) };
  }
  {
    const res = await runHandler(handler, {
      method: "PUT",
      body: {
        entity_type: "site_content_page",
        entity_id: "home",
        expected_draft_version: null,
        changes: many,
      },
    });
    ok(
      "nit_too_many_keys_no_query",
      res.statusCode === 400 &&
        res.body?.code === "too_many_keys" &&
        siteContentQueries.length === 0,
      `status=${res.statusCode} code=${res.body?.code} q=${siteContentQueries.length}`
    );
  }

  // non-object changes -> empty_draft without query
  siteContentQueries.length = 0;
  {
    const res = await runHandler(handler, {
      method: "PUT",
      body: {
        entity_type: "site_content_page",
        entity_id: "home",
        expected_draft_version: null,
        changes: "nope",
      },
    });
    ok(
      "nit_empty_draft_no_query",
      res.statusCode === 400 &&
        res.body?.code === "empty_draft" &&
        siteContentQueries.length === 0,
      `status=${res.statusCode} code=${res.body?.code} q=${siteContentQueries.length}`
    );
  }

  // bad expected_draft_version -> invalid_version PUT + DELETE
  {
    const res = await runHandler(handler, {
      method: "PUT",
      body: {
        entity_type: "site_content_page",
        entity_id: "home",
        expected_draft_version: "x",
        changes: { home_hero_title: { value: "a", base_hash: "a".repeat(64) } },
      },
    });
    ok(
      "nit_invalid_version_put",
      res.statusCode === 400 && res.body?.code === "invalid_version",
      `status=${res.statusCode} code=${res.body?.code}`
    );
  }
  {
    const res = await runHandler(handler, {
      method: "DELETE",
      body: {
        entity_type: "site_content_page",
        entity_id: "home",
        expected_draft_version: "x",
      },
    });
    ok(
      "nit_invalid_version_delete",
      res.statusCode === 400 && res.body?.code === "invalid_version",
      `status=${res.statusCode} code=${res.body?.code}`
    );
  }

  ok(
    "api_imports_early_validator",
    /validateDraftChangesEarly/.test(read("pages/api/admin-drafts.ts"))
  );
}

// ─── re-run multi-142 ───────────────────────────────────────────────────────

function runMulti142() {
  console.log("\n# re-run phase-multi-142");
  const r = spawnSync(NODE, [path.join(ROOT, "scripts/phase-multi-142-tests.js")], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  ok("phase_multi_142_exit_0", r.status === 0, `status=${r.status}`);
}

// ─── no-forbidden-diff ──────────────────────────────────────────────────────

function runDiffAllowlist() {
  console.log("\n# no-forbidden-diff");
  const allowed = new Set([
    "components/admin/CmsDraftBar.tsx",
    "lib/contentDraftClient.ts",
    "app/sidhu/page.tsx",
    "pages/api/admin-drafts.ts",
    "lib/contentDrafts.ts",
    "scripts/phase-multi-143-tests.js",
    "docs/design/DRAFT-PUBLISH.md",
    "scripts/phase-multi-116-tests.js",
    "scripts/phase-multi-130-tests.js",
    "scripts/phase-multi-131-tests.js",
    "scripts/phase-multi-132-tests.js",
    "scripts/phase-multi-133-tests.js",
    "scripts/phase-multi-135-tests.js",
    "scripts/phase-multi-136-tests.js",
    "scripts/phase-multi-137-tests.js",
    "scripts/phase-multi-138-tests.js",
    "scripts/phase-multi-139-tests.js",
    "scripts/phase-multi-140-tests.js",
    "scripts/phase-multi-142-tests.js",
    // F4UK-MULTI-144: health-check network retry + capture waits for CMS load.
    "scripts/live-health-check.js",
    "scripts/tools/visible-text-capture.js",
    "scripts/phase-multi-144-tests.js",
    "scripts/phase-multi-135-tests.js",
    "scripts/phase-multi-138-tests.js",
    "scripts/phase-multi-131-tests.js",
    "scripts/phase-multi-132-tests.js",
    "scripts/phase-multi-133-tests.js",
    "scripts/phase-multi-136-tests.js",
    "scripts/phase-multi-139-tests.js",
    // F4UK-MULTI-145: health 429 warn, draft base keep, atomic staff login session.
    "lib/adminStaffPasswordTx.ts",
    "pages/api/admin-login.ts",
    "scripts/phase-multi-145-tests.js",
    "scripts/phase-multi-116-tests.js",
    "scripts/phase-multi-140-tests.js",
    "scripts/phase-multi-142-tests.js",
    "scripts/phase-multi-144-tests.js",
    "scripts/phase-multi-130-tests.js",
    "scripts/phase-multi-135-tests.js",
    "scripts/phase-multi-137-tests.js",

    // F4UK-MULTI-146: /products H1 no duplicate + checkout optional-field tags.
    "app/products/ProductsClient.tsx",
    "lib/productsPageTitle.ts",
    "app/cart/page.tsx",
    "lib/adminContentFields.ts",
    "scripts/phase-multi-146-tests.js",
    "scripts/phase-multi-116-tests.js",
    "scripts/phase-multi-130-tests.js",
    "scripts/phase-multi-131-tests.js",
    "scripts/phase-multi-132-tests.js",
    "scripts/phase-multi-133-tests.js",
    "scripts/phase-multi-135-tests.js",
    "scripts/phase-multi-136-tests.js",
    "scripts/phase-multi-137-tests.js",
    "scripts/phase-multi-138-tests.js",
    "scripts/phase-multi-139-tests.js",
    "scripts/phase-multi-140-tests.js",
    "scripts/phase-multi-142-tests.js",
    "scripts/phase-multi-143-tests.js",
    "scripts/phase-multi-144-tests.js",
    "scripts/phase-multi-145-tests.js",

    // F4UK-MULTI-147: optional-tag dedupe, contact phone hint, PDP sticky ATC tuck.
    "lib/optionalLabel.ts",
    "app/cart/page.tsx",
    "app/contact/page.tsx",
    "app/products/[slug]/ProductDetail.tsx",
    "scripts/phase-multi-147-tests.js",
    "scripts/phase-multi-116-tests.js",
    "scripts/phase-multi-130-tests.js",
    "scripts/phase-multi-131-tests.js",
    "scripts/phase-multi-132-tests.js",
    "scripts/phase-multi-133-tests.js",
    "scripts/phase-multi-135-tests.js",
    "scripts/phase-multi-136-tests.js",
    "scripts/phase-multi-137-tests.js",
    "scripts/phase-multi-138-tests.js",
    "scripts/phase-multi-139-tests.js",
    "scripts/phase-multi-140-tests.js",
    "scripts/phase-multi-142-tests.js",
    "scripts/phase-multi-143-tests.js",
    "scripts/phase-multi-144-tests.js",
    "scripts/phase-multi-145-tests.js",
    "scripts/phase-multi-146-tests.js",

    // F4UK-MULTI-148: hydration-safe seasonal card countdown + London blog dates.
    "components/product/SeasonalCardCountdown.tsx",
    "app/blog/BlogClient.tsx",
    "app/blog/[slug]/BlogPostClient.tsx",
    "lib/blogDateFormat.ts",
    "scripts/phase-multi-148-tests.js",
    "scripts/phase-multi-116-tests.js",
    "scripts/phase-multi-130-tests.js",
    "scripts/phase-multi-131-tests.js",
    "scripts/phase-multi-132-tests.js",
    "scripts/phase-multi-133-tests.js",
    "scripts/phase-multi-135-tests.js",
    "scripts/phase-multi-136-tests.js",
    "scripts/phase-multi-137-tests.js",
    "scripts/phase-multi-138-tests.js",
    "scripts/phase-multi-139-tests.js",
    "scripts/phase-multi-140-tests.js",
    "scripts/phase-multi-142-tests.js",
    "scripts/phase-multi-143-tests.js",
    "scripts/phase-multi-144-tests.js",
    "scripts/phase-multi-145-tests.js",
    "scripts/phase-multi-146-tests.js",
    "scripts/phase-multi-147-tests.js",

    // F4UK-MULTI-149: compact mobile consent banner (presentation only).
    "components/TrackingConsent.tsx",
    "scripts/phase-multi-149-tests.js",
    "scripts/phase-multi-116-tests.js",
    "scripts/phase-multi-130-tests.js",
    "scripts/phase-multi-131-tests.js",
    "scripts/phase-multi-132-tests.js",
    "scripts/phase-multi-133-tests.js",
    "scripts/phase-multi-135-tests.js",
    "scripts/phase-multi-136-tests.js",
    "scripts/phase-multi-137-tests.js",
    "scripts/phase-multi-138-tests.js",
    "scripts/phase-multi-139-tests.js",
    "scripts/phase-multi-140-tests.js",
    "scripts/phase-multi-142-tests.js",
    "scripts/phase-multi-143-tests.js",
    "scripts/phase-multi-144-tests.js",
    "scripts/phase-multi-145-tests.js",
    "scripts/phase-multi-146-tests.js",
    "scripts/phase-multi-147-tests.js",
    "scripts/phase-multi-148-tests.js",
// F4UK-MULTI-150: product drafts (Draft/Publish D4).
    "lib/contentDrafts.ts",
    "pages/api/admin-drafts.ts",
    "pages/api/admin-products.ts",
    "components/admin/ProductDraftBar.tsx",
    "lib/productDraftClient.ts",
    "app/sidhu/page.tsx",
    "scripts/phase-multi-150-tests.js",
    "docs/design/DRAFT-PUBLISH.md",
    "scripts/phase-multi-116-tests.js",
    "scripts/phase-multi-130-tests.js",
    "scripts/phase-multi-131-tests.js",
    "scripts/phase-multi-132-tests.js",
    "scripts/phase-multi-142-tests.js",
    "scripts/phase-multi-143-tests.js",
    "scripts/phase-multi-145-tests.js",
    "scripts/phase-multi-146-tests.js",
    "scripts/phase-multi-147-tests.js",
    "scripts/phase-multi-148-tests.js",
    "scripts/phase-multi-149-tests.js",
    // F4UK-MULTI-151: draft bars stable session-expired refs (no reload on parent render).
    "components/admin/CmsDraftBar.tsx",
    "components/admin/ProductDraftBar.tsx",
    "scripts/phase-multi-151-tests.js",
    // F4UK-MULTI-153: UX fix batch B
    "app/cart/page.tsx",
    "components/product/CurrentSeasonalOffers.tsx",
    "components/HeroSlider.tsx",
    "app/faq/FAQClient.tsx",
    "app/blog/BlogClient.tsx",
    "scripts/phase-multi-153-tests.js",
    // F4UK-MULTI-154: hero active-dot hotfix
    "components/HeroSlider.tsx",
    "scripts/phase-multi-154-tests.js",
    // F4UK-MULTI-155: promo bar styles
    "lib/seasonalPromoStyle.ts",
    "components/home/SeasonalHomePromoStrip.tsx",
    "app/HomeClient.tsx",
    "app/page.tsx",
    "lib/adminContentFields.ts",
    "components/admin/AdminContentPanel.tsx",
    "scripts/phase-multi-155-tests.js",
    // F4UK-MULTI-156: polish batch C
    "app/cart/page.tsx",
    "app/products/ProductsClient.tsx",
    "app/contact/page.tsx",
    "app/HomeClient.tsx",
    "app/order-tracking/page.tsx",
    "app/products/[slug]/ProductDetail.tsx",
    "app/blog/[slug]/BlogPostClient.tsx",
    "scripts/phase-multi-156-tests.js",
]);
  const diff = spawnSync("git", ["diff", "--name-only", `${BASE}..HEAD`], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const unstaged = spawnSync("git", ["diff", "--name-only", BASE], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const status = spawnSync("git", ["status", "--porcelain"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const names = new Set();
  for (const line of `${diff.stdout || ""}\n${unstaged.stdout || ""}`.split(/\r?\n/)) {
    const n = line.trim().replace(/\\/g, "/");
    if (n) names.add(n);
  }
  for (const line of (status.stdout || "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const n = line.slice(3).trim().replace(/\\/g, "/");
    if (n) names.add(n.split(" -> ").pop());
  }
  const bad = [...names].filter((n) => !allowed.has(n));
  ok(
    "no_forbidden_diff",
    bad.length === 0,
    bad.length ? bad.join(",") : [...names].join(",") || "(clean-or-approved)"
  );
}

async function main() {
  console.log("phase-multi-143-tests");
  runClientHelperTests();
  runBarSourceAssertions();
  runPageAssertions();
  await runD2NitTests();
  runMulti142();
  runDiffAllowlist();
  console.log(`\nphase-multi-143: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
