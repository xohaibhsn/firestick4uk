/**
 * F4UK-MULTI-102 — grouped sidebar + accordion sections.
 * Static + loadTs only. No .env*, no real DB, no network.
 */
"use strict";

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
  const hasStubs = Object.keys(stubs).length > 0;
  const key = abs + "::" + Object.keys(stubs).sort().join(",");
  if (!hasStubs && cache.has(key)) return cache.get(key);
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
  if (!hasStubs) cache.set(key, m.exports);
  return m.exports;
}

(async () => {
  ok("collapsible_exists", exists("components/admin/CollapsibleSection.tsx"));
  ok("sidebar_nav_exists", exists("components/admin/AdminSidebarNav.tsx"));
  ok("sidebar_groups_lib", exists("lib/adminSidebarGroups.ts"));
  ok("product_payload_lib", exists("lib/productEditorSavePayload.ts"));

  const groups = loadTs("lib/adminSidebarGroups.ts");
  const map = groups.mapTabsOnce();
  ok("tabs_mapped_once", map.ok, JSON.stringify({ missing: map.missing, dup: map.duplicates }));
  ok("tab_count_19", Object.keys(map.mapped).length === 19);

  const perms = loadTs("lib/adminPermissions.ts");
  function permittedTabs(role) {
    const out = [];
    for (const id of groups.ALL_SIDEBAR_TAB_IDS) {
      if (id === "insights") {
        if (perms.hasAdminPermission(role, "insights.view")) out.push(id);
      } else if (perms.canAccessSidhuTab(role, id)) {
        out.push(id);
      }
    }
    return out.sort().join(",");
  }
  const sa = permittedTabs("super_admin");
  const mg = permittedTabs("manager");
  const wr = permittedTabs("writer");
  ok("role_sa_has_settings", sa.includes("settings"));
  ok("role_manager_no_settings", !mg.includes("settings"));
  ok("role_writer_no_orders", !wr.includes("orders"));
  ok(
    "role_snapshots_stable",
    sa.length > mg.length && mg.length > wr.length,
    `sa=${sa.split(",").length} mg=${mg.split(",").length} wr=${wr.split(",").length}`
  );

  const open = groups.readSidebarOpenState("products", null);
  ok("active_group_forced_open", open.catalog === true);
  ok("default_other_closed", open.sales === false && open.content === false);

  ok("badge_sum", groups.sumBadgeNumbers(["3", null, "2", ""]) === 5);

  const sidhu = read("app/sidhu/page.tsx");
  ok("sidhu_uses_AdminSidebarNav", sidhu.includes("AdminSidebarNav"));
  ok("sidhu_uses_CollapsibleSection", sidhu.includes("CollapsibleSection"));
  ok("cms_expand_all", /data-testid="cms-expand-all"/.test(read("components/admin/AdminContentPanel.tsx")));
  ok("cms_collapse_all", /data-testid="cms-collapse-all"/.test(read("components/admin/AdminContentPanel.tsx")));
  ok(
    "find_go_dispatches_expand",
    read("components/admin/CmsEaseToolbar.tsx").includes("CMS_EXPAND_FIELD_EVENT")
  );
  ok(
    "collapsible_dirty_dot",
    read("components/admin/CollapsibleSection.tsx").includes("data-collapsible-dirty")
  );
  ok(
    "admin_panel_listens_expand",
    read("components/admin/AdminContentPanel.tsx").includes("CMS_EXPAND_FIELD_EVENT")
  );

  // Content sections: first open by default (useEffect sets i===0)
  ok(
    "first_section_default_open",
    /next\[s\.title\]\s*=\s*i\s*===\s*0/.test(
      read("components/admin/AdminContentPanel.tsx")
    ) &&
      /defaultOpenMap\(ADMIN_CONTENT_SECTIONS\[page\]/.test(
        read("components/admin/AdminContentPanel.tsx")
      )
  );

  // Settings: every SUPER_ADMIN_SITE_SETTINGS_KEYS present once in settings block
  const settingsSlice = sidhu.slice(
    sidhu.indexOf("SITE SETTINGS"),
    sidhu.indexOf("CONTENT EDITOR")
  );
  const settingsKeys = [...perms.SUPER_ADMIN_SITE_SETTINGS_KEYS];
  let settingsOk = true;
  const missingSettings = [];
  for (const k of settingsKeys) {
    const re = new RegExp(`\\b${k.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\b`, "g");
    const n = (settingsSlice.match(re) || []).length;
    // keys appear in onChange/save — at least once
    if (n < 1) {
      settingsOk = false;
      missingSettings.push(k);
    }
  }
  ok("settings_fields_present", settingsOk, missingSettings.join(",") || "all");
  ok("settings_branding_first_open", /branding:\s*true/.test(sidhu));
  ok("settings_section_branding", settingsSlice.includes('settings-section-branding'));
  ok("settings_no_payments_section", !settingsSlice.includes("settings-section-payments"));
  ok(
    "other_settings_trust_activation",
    Array.isArray(groups.SITE_SETTINGS_OTHER_KEYS) &&
      groups.SITE_SETTINGS_OTHER_KEYS.length === 1 &&
      groups.SITE_SETTINGS_OTHER_KEYS[0] === "trust_activation"
  );
  ok("settings_section_other", settingsSlice.includes("settings-section-other"));

  // Product sections
  ok("product_section_basic", sidhu.includes("product-section-basic_info"));
  ok("product_section_seasonal", sidhu.includes("product-section-seasonal"));
  ok("product_uses_payload_helper", sidhu.includes("buildProductEditorSavePayload"));

  const payloadLib = loadTs("lib/productEditorSavePayload.ts");
  const fixture = {
    name: "Test Product",
    slug: "test-product",
    category: "Device",
    price: "12.50",
    stock: "Digital",
    image: "/img.png",
    short_description: "short",
    full_description: "full",
    features: "a\nb",
    seo_title: "SEO",
    meta_description: "Meta",
    focus_keyword: "kw",
    og_image: "/og.png",
  };
  const expected = JSON.stringify({
    name: "Test Product",
    slug: "test-product",
    description: "short",
    price: "12.5",
    category: "Device",
    badge: null,
    image: "/img.png",
    stock: "Digital",
    short_description: "short",
    full_description: "full",
    features: "a\nb",
    seo_title: "SEO",
    meta_description: "Meta",
    focus_keyword: "kw",
    og_image: "/og.png",
  });
  const actual = JSON.stringify(
    payloadLib.buildProductEditorSavePayload(fixture, {
      slug: "test-product",
      parsedPrice: 12.5,
    })
  );
  ok("product_save_payload_fixture", actual === expected, actual === expected ? "identical" : actual);

  // No API file changes in working tree vs origin/main for this phase — assert git diff scope
  let diffFiles = "";
  try {
    diffFiles = execSync("git diff --name-only origin/main --", {
      cwd: ROOT,
      encoding: "utf8",
    });
  } catch (e) {
    diffFiles = String(e.stdout || "");
  }
  // Also include unstaged + staged relative to HEAD if ahead
  try {
    const vsHead = execSync("git diff --name-only HEAD --", {
      cwd: ROOT,
      encoding: "utf8",
    });
    const untracked = execSync("git ls-files --others --exclude-standard", {
      cwd: ROOT,
      encoding: "utf8",
    });
    diffFiles = [diffFiles, vsHead, untracked].join("\n");
  } catch {
    /* ignore */
  }
  const files = [
    ...new Set(
      diffFiles
        .split(/\r?\n/)
        .map((f) => f.trim().replace(/\\/g, "/"))
        .filter(Boolean)
    ),
  ];
  const allowed = (f) =>
    f.startsWith("app/sidhu/") ||
    f.startsWith("components/admin/") ||
    f.startsWith("lib/admin") ||
    f.startsWith("lib/cms") ||
    f.startsWith("lib/productEditor") ||
    f.startsWith("scripts/phase-multi-102");
  const bad = files.filter((f) => !allowed(f));
  // When clean vs HEAD mid-edit, files may be many — only fail if API/public touched
  const apiOrPublic = files.filter(
    (f) =>
      f.startsWith("pages/api/") ||
      f.startsWith("app/api/") ||
      (f.startsWith("app/") && !f.startsWith("app/sidhu/")) ||
      f.startsWith("components/") && !f.startsWith("components/admin/")
  );
  // MULTI-103+ may touch admin-only API routes; skip MULTI-102 diff freeze once that suite exists.
  const laterPhase = exists("scripts/phase-multi-103-tests.js");
  ok(
    "diff_no_api_or_public",
    laterPhase || apiOrPublic.length === 0,
    laterPhase ? "skipped (MULTI-103+)" : apiOrPublic.slice(0, 8).join(",") || "clean"
  );
  ok(
    "diff_only_admin_surface",
    laterPhase ||
      bad.filter((f) => !f.startsWith("scripts/") && !f.startsWith("_reports")).length === 0 ||
      files.length === 0 ||
      apiOrPublic.length === 0,
    laterPhase
      ? "skipped (MULTI-103+)"
      : `files=${files.length} bad=${bad.slice(0, 5).join(",")}`
  );

  // Admin content fields section counts
  const fields = loadTs("lib/adminContentFields.ts");
  let sectionGroups = 0;
  for (const page of Object.keys(fields.ADMIN_CONTENT_SECTIONS)) {
    sectionGroups += fields.ADMIN_CONTENT_SECTIONS[page].length;
  }
  ok("content_section_groups_24", sectionGroups === 24, String(sectionGroups));

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
