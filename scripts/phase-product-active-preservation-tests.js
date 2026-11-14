/**
 * PS-ACTIVE — preserve product active state on ordinary Sidhu Product edit.
 * Static / source tests only. No DB mutations.
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

const sidhu = read("app/sidhu/page.tsx");
const api = read("pages/api/admin-products.ts");

const saveIdx = sidhu.indexOf("const saveProduct = async () => {");
const saveEnd = sidhu.indexOf("const openEditProduct", saveIdx);
const saveSnippet =
  saveIdx >= 0 && saveEnd > saveIdx ? sidhu.slice(saveIdx, saveEnd) : "";

ok("saveProduct_found", saveSnippet.includes('const isNew = productModal === "new"'));

// 16a0887 added a local-state-only `{ id: res.id, active: 1, ...localFields }` in the isNew branch
// (page.tsx:2404; matches INSERT ... active=1 at pages/api/admin-products.ts:172). Scope the guard to the
// actual request body (payload object + JSON.stringify(...) argument), not the post-success UI update.
const payloadStart = saveSnippet.indexOf("const payload = {");
const payloadObj =
  payloadStart >= 0
    ? saveSnippet.slice(payloadStart, saveSnippet.indexOf("};", payloadStart))
    : "";
const bodyStart = saveSnippet.indexOf("body: JSON.stringify(");
const requestBody =
  bodyStart >= 0
    ? saveSnippet.slice(bodyStart, saveSnippet.indexOf("if (r.status === 401)", bodyStart))
    : "";
ok(
  "existing_put_omits_active_1",
  /isNew\s*\?/.test(requestBody) &&
    payloadObj.length > 0 &&
    requestBody.length > 0 &&
    !/\bactive\b/.test(payloadObj) &&
    !/\bactive\b/.test(requestBody)
);
ok(
  "new_product_local_active_1_only_in_isNew_branch",
  /if \(isNew\) \{[\s\S]*?active: 1[\s\S]*?\} else if \(savedModal/.test(saveSnippet) &&
    (saveSnippet.match(/active:\s*1/g) || []).length === 1
);

ok(
  "existing_put_omits_active_0",
  !/active:\s*0/.test(saveSnippet) && !/active:\s*false/.test(saveSnippet)
);

ok(
  "existing_put_still_sends_id",
  /id:\s*\(productModal as \{ id: number \}\)\.id/.test(saveSnippet)
);

ok(
  "new_product_path_unchanged_payload_only",
  /isNew/.test(saveSnippet) &&
    /method: isNew \? "POST" : "PUT"/.test(saveSnippet)
);

ok(
  "no_product_modal_active_toggle",
  !/editProduct\.active/.test(sidhu) &&
    !/setEditProduct\([^\)]*active:/.test(sidhu)
);

ok(
  "api_active_init_from_current",
  /let active = Number\(current\.active\) === 1 \? 1 : 0;/.test(api)
);

ok(
  "api_active_only_when_hasOwn",
  /let active = Number\(current\.active\) === 1 \? 1 : 0;/.test(api) &&
    (/expandedOps[\s\S]*hasOwn\(body, ['"]active['"]\)/.test(api) ||
      /else if \(hasOwn\(body, ['"]active['"]\)\)/.test(api))
);

ok(
  "api_omit_active_retains_current",
  /let active = Number\(current\.active\) === 1 \? 1 : 0;/.test(api) &&
    /Ordinary PUT cannot change active/.test(api)
);

ok(
  "api_explicit_active_still_supported",
  /active must be exactly 0 or 1 when provided/.test(api) &&
    /active = body\.active/.test(api)
);

ok(
  "api_post_still_creates_active_1",
  /VALUES \(\?, \?, \?, \?, \?, \?, \?, \?, 1,/.test(api)
);

ok(
  "strict_price_validation_intact",
  /STRICT_PRICE_NUMERIC/.test(api) && /validatePrice/.test(api)
);

ok(
  "optional_string_fields_include_og_image",
  /OPTIONAL_STRING_FIELDS[\s\S]*?'og_image'/.test(api)
);

ok(
  "b2_og_image_state_payload",
  /og_image:""/.test(sidhu) &&
    /og_image:\s*editProduct\.og_image\s*\|\|\s*""/.test(sidhu) &&
    /Choose Product OG Image/.test(sidhu)
);

ok(
  "b2_site_meta_settings_save",
  /Site Meta Description/.test(sidhu) &&
    /saveContent\(\["site_title","site_tagline","site_meta_description"/.test(
      sidhu
    )
);

ok("erp_ui_retired", !fs.existsSync(path.join(ROOT, "app/erp")));

console.log(
  `\nPS-ACTIVE product active preservation: ${passed} passed, ${failed} failed`
);
process.exit(failed ? 1 : 0);
