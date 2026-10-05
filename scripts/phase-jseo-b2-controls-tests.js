/**
 * JSEO-B2 — expose existing product og_image + site_meta_description controls.
 * Static / source tests only. No DB mutations. No CMS saves.
 */
const fs = require("fs");
const path = require("path");
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

function loadTsModule(rel) {
  const src = read(rel);
  const { outputText } = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
    },
  });
  const sandbox = { exports: {} };
  const fn = new Function("exports", "module", "require", outputText);
  fn(sandbox.exports, sandbox, require);
  return sandbox.exports;
}

const sidhu = read("app/sidhu/page.tsx");
const productsApi = read("pages/api/admin-products.ts");
const productPage = read("app/products/[slug]/page.tsx");
const layout = read("app/layout.tsx");
const perms = read("lib/adminPermissions.ts");
const revisions = read("lib/contentRevisions.ts");
const mediaLib = read("lib/mediaLibrary.ts");
const seoPanel = read("components/admin/SeoOverviewPanel.tsx");
const seoApi = read("pages/api/admin-seo-overview.ts");
const picker = read("components/admin/MediaLibraryPicker.tsx");

const {
  SUPER_ADMIN_SITE_SETTINGS_KEYS,
  ROLE_PERMISSIONS,
  canUploadPurpose,
  mediaPurposesForRole,
} = (() => {
  const p = loadTsModule("lib/adminPermissions.ts");
  const m = loadTsModule("lib/mediaLibrary.ts");
  return {
    SUPER_ADMIN_SITE_SETTINGS_KEYS: p.SUPER_ADMIN_SITE_SETTINGS_KEYS,
    ROLE_PERMISSIONS: p.ROLE_PERMISSIONS,
    canUploadPurpose: p.canUploadPurpose,
    mediaPurposesForRole: m.mediaPurposesForRole,
  };
})();

// --- PRODUCT OG STATE / PAYLOAD / UI ---
ok(
  "editProduct_state_includes_og_image",
  /useState\(\{\s*name:""[\s\S]*?og_image:""\s*\}\)/.test(sidhu) ||
    /og_image:""/.test(sidhu) &&
      /const \[editProduct, setEditProduct\]/.test(sidhu)
);
ok(
  "openEditProduct_hydrates_og_image",
  /const openEditProduct[\s\S]*?og_image:\s*p\.og_image\s*\|\|\s*""/.test(sidhu)
);
ok(
  "openNewProduct_defaults_og_image_empty",
  /const openNewProduct[\s\S]*?og_image:""/.test(sidhu)
);
ok(
  "save_payload_includes_og_image",
  /og_image:\s*editProduct\.og_image\s*\|\|\s*""/.test(sidhu)
);
ok(
  "og_ui_label_present",
  /Social \/ OG Image|OG Image/.test(sidhu) &&
    /social sharing previews/i.test(sidhu)
);
ok(
  "og_ui_preview",
  /editProduct\.og_image[\s\S]{0,200}<img[\s\S]{0,120}og_image/.test(sidhu) ||
    /src=\{editProduct\.og_image\}/.test(sidhu)
);
ok(
  "og_media_library_picker_reused",
  /Choose Product OG Image/.test(sidhu) &&
    /purposes:\s*\["products"\]/.test(sidhu) &&
    /og_image:\s*asset\.url/.test(sidhu) &&
    /MediaLibraryPicker/.test(sidhu) &&
    /export default function MediaLibraryPicker/.test(picker)
);
ok(
  "og_clear_remove_supported",
  /og_image:\s*""/.test(sidhu) &&
    /setEditProduct\(\(p\)\s*=>\s*\(\{\s*\.\.\.p,\s*og_image:\s*""\s*\}\)\)/.test(
      sidhu
    )
);
ok(
  "og_no_second_uploader_system",
  !/pages\/api\/admin-og/.test(sidhu) &&
    !/new MediaUploader/.test(sidhu) &&
    (sidhu.match(/Choose Product OG Image/g) || []).length === 1
);
ok(
  "og_media_purpose_products_not_global_og",
  /title:\s*"Choose Product OG Image"[\s\S]{0,120}purposes:\s*\["products"\]/.test(
    sidhu
  ) ||
    /purposes:\s*\["products"\][\s\S]{0,120}title:\s*"Choose Product OG Image"/.test(
      sidhu
    )
);
ok(
  "manager_can_view_products_purpose",
  mediaPurposesForRole("manager").includes("products") &&
    !mediaPurposesForRole("manager").includes("og")
);
ok(
  "manager_can_upload_products_not_og",
  canUploadPurpose("manager", "products") === true &&
    canUploadPurpose("manager", "og") === false
);

// --- API / REVISIONS / PUBLIC FALLBACK (unchanged) ---
ok(
  "api_optional_fields_include_og_image",
  /OPTIONAL_STRING_FIELDS[\s\S]*?'og_image'/.test(productsApi)
);
ok(
  "api_insert_update_include_og_image",
  /features, og_image\)/.test(productsApi) &&
    /features=\?,\s*og_image=\?/.test(productsApi)
);
ok(
  "revisions_snapshot_includes_og_image",
  /"og_image"/.test(revisions) && /snapshotProduct/.test(revisions)
);
ok(
  "public_prefers_og_image_then_product_image",
  /product\.og_image\s*\|\|\s*product\.image/.test(productPage) &&
    /resolveSocialImagePrecedence/.test(productPage)
);
ok(
  "public_product_page_not_rewritten_for_b2",
  /generateMetadata/.test(productPage) &&
    /product\.og_image\s*\|\|\s*product\.image/.test(productPage)
);

// --- SITE META DESCRIPTION ---
ok(
  "site_meta_field_visible",
  /Site Meta Description/.test(sidhu) &&
    /siteContent\.site_meta_description/.test(sidhu)
);
ok(
  "site_meta_bound_to_cms_key",
  /value=\{siteContent\.site_meta_description\|\|""\}/.test(sidhu) &&
    /site_meta_description:e\.target\.value/.test(sidhu)
);
ok(
  "site_meta_in_settings_save_keys",
  /saveContent\(\["site_title","site_tagline","site_meta_description"/.test(
    sidhu
  )
);
ok(
  "site_meta_gated_by_settings_manage",
  /tab==="settings"\s*&&\s*can\("settings\.manage"\)/.test(sidhu) &&
    /Site Meta Description/.test(sidhu)
);
ok(
  "site_meta_in_super_admin_keys",
  SUPER_ADMIN_SITE_SETTINGS_KEYS.has("site_meta_description") &&
    /"site_meta_description"/.test(perms)
);
ok(
  "layout_consumes_site_meta_description",
  /settings\.site_meta_description/.test(layout)
);
ok(
  "no_schema_change_in_b2_scope",
  !/ALTER TABLE|CREATE TABLE/.test(sidhu) &&
    !/CREATE TABLE/.test(productsApi)
);

// --- RBAC ---
ok("no_seo_manage_permission", !/"seo\.manage"/.test(perms));
ok("no_seo_view_permission", !/"seo\.view"/.test(perms));
ok(
  "manager_still_no_settings_manage",
  !ROLE_PERMISSIONS.manager.includes("settings.manage")
);
ok(
  "writer_still_no_settings_or_products_manage",
  !ROLE_PERMISSIONS.writer.includes("settings.manage") &&
    !ROLE_PERMISSIONS.writer.includes("products.manage")
);
ok(
  "role_upload_purposes_unchanged_for_manager",
  JSON.stringify(ROLE_PERMISSIONS.manager) ===
    JSON.stringify([
      "dashboard.view",
      "orders.view",
      "orders.manage",
      "customers.view",
      "customers.manage",
      "products.view",
      "products.manage",
      "leads.view",
      "leads.manage",
      "coupons.view",
      "coupons.manage",
      "blog.manage",
      "faq.manage",
      "content.manage",
      "training.view",
      "training.manage",
      "media.view",
      "revisions.view",
    ]) ||
    (ROLE_PERMISSIONS.manager.includes("products.manage") &&
      !ROLE_PERMISSIONS.manager.includes("settings.manage") &&
      !/"seo\./.test(JSON.stringify(ROLE_PERMISSIONS)))
);

// --- B1 OVERVIEW UNCHANGED (explicit issue-memory reconcile POST is allowed) ---
{
  const hasPut = /method:\s*["']PUT["']/.test(seoPanel);
  const overviewPosts = /fetch\(\s*["']\/api\/admin-seo-overview["'][\s\S]{0,200}?method:\s*["']POST["']/.test(
    seoPanel
  );
  const reconcilePost =
    /fetch\(\s*["']\/api\/admin-seo-issues\/reconcile["']\s*,\s*\{[\s\S]{0,180}?method:\s*["']POST["']/.test(
      seoPanel
    );
  const otherPosts = [
    ...seoPanel.matchAll(/method:\s*["']POST["']/g),
  ].length;
  ok(
    "seo_overview_still_read_only",
    !hasPut &&
      !overviewPosts &&
      reconcilePost &&
      otherPosts === 1 &&
      /Panel mounts only when SEO tab opens/.test(seoPanel) &&
      /req\.method !== ["']GET["']/.test(seoApi)
  );
}
ok("seo_overview_no_polling", !/setInterval/.test(seoPanel) && !/setTimeout/.test(seoApi));
ok(
  "erp_ui_retired_marker",
  !/app\/erp/.test(sidhu.slice(0, 200)) &&
    fs.existsSync(path.join(ROOT, "app/erp")) === false
);

console.log(`\nJSEO-B2 controls: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
