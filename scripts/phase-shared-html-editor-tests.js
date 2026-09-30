/**
 * Shared Visual | HTML TipTap editor — static / pure helper tests.
 * No DB mutations. No production CMS edits.
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

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
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

const tipTap = read("components/admin/TipTapEditor.tsx");
const panel = read("components/admin/AdminContentPanel.tsx");
const fields = read("lib/adminContentFields.ts");
const helper = read("lib/editorHtmlMode.ts");
const cmsBody = read("components/CmsBody.tsx");
const productDetail = read("app/products/[slug]/ProductDetail.tsx");
const blogClient = read("app/blog/[slug]/BlogPostClient.tsx");
const sidhu = read("app/sidhu/page.tsx");
const subEditor = read("components/admin/SubscriptionContentEditor.tsx");
const pkg = read("package.json");
const mode = loadTsModule("lib/editorHtmlMode.ts");
const fieldsMod = loadTsModule("lib/adminContentFields.ts");

// A–D mode UI
ok(
  "A_visual_html_modes",
  /ModeTab[\s\S]*Visual/.test(tipTap) &&
    /label="Visual"/.test(tipTap) &&
    /label="HTML"/.test(tipTap)
);
ok(
  "B_visual_default",
  /useState<EditorMode>\("visual"\)/.test(tipTap) ||
    /useState\("visual"\)/.test(tipTap)
);
ok(
  "C_html_source_textarea_not_executed",
  /mode === "html"/.test(tipTap) &&
    /<textarea/.test(tipTap) &&
    !/dangerouslySetInnerHTML[\s\S]{0,80}sourceHtml/.test(tipTap) &&
    /Raw HTML source \(not executed\)/.test(tipTap)
);
ok(
  "D_html_shows_raw_tags_not_entities",
  /value=\{sourceHtml\}/.test(tipTap) &&
    !/escapeHtml\(sourceHtml\)/.test(tipTap) &&
    !/&lt;p&gt;/.test(tipTap)
);

// E–I sync / state
ok(
  "E_visual_to_html_sync",
  /switchToHtml/.test(tipTap) && /editor\.getHTML\(\)/.test(tipTap)
);
ok(
  "F_html_to_visual_sync",
  /switchToVisual/.test(tipTap) && /setContent\(html/.test(tipTap)
);
ok(
  "G_source_onchange_contract",
  /onSourceChange/.test(tipTap) &&
    /onChange\(value\)/.test(tipTap)
);
ok(
  "H_external_content_resync",
  /Sync from parent when content changes externally/.test(tipTap) ||
    (/useEffect[\s\S]*content[\s\S]*setContent/.test(tipTap) &&
      /setSourceHtml\(incoming\)/.test(tipTap))
);
ok(
  "I_stale_guard_skip_flag",
  /skipNextExternalSync/.test(tipTap)
);

// J–N TipTap capabilities preserved
ok("J_headings", /toggleHeading/.test(tipTap) && /levels: \[1, 2, 3, 4\]/.test(tipTap));
ok("K_links", /setLink|SmartLink/.test(tipTap));
ok("L_lists", /toggleBulletList/.test(tipTap) && /toggleOrderedList/.test(tipTap));
ok("M_images", /setImage/.test(tipTap));
ok(
  "N_blockquote_hr_code_kit",
  /toggleBlockquote/.test(tipTap) &&
    /setHorizontalRule/.test(tipTap) &&
    /StarterKit/.test(tipTap)
);

// O–Q public safety unchanged
ok(
  "O_public_sanitizers_intact",
  /xss\(/.test(cmsBody) &&
    /stripIgnoreTag:\s*true/.test(cmsBody) &&
    /xss\(/.test(productDetail) &&
    /xss\(/.test(blogClient) &&
    /stripIgnoreTagBody:\s*\["script"/.test(blogClient)
);
ok(
  "P_no_event_handler_whitelist",
  !/onclick|onerror|onload/.test(cmsBody) &&
    !/onclick|onerror|onload/.test(productDetail)
);
ok(
  "Q_no_javascript_scheme_enabled",
  !/javascript:/.test(tipTap) || /isInternalHref/.test(tipTap)
);

// R–S table / packages
ok(
  "R_unsupported_table_guard",
  /htmlContainsUnsupportedStructuralMarkup/.test(tipTap) &&
    /cannot safely preserve/.test(tipTap) &&
    mode.htmlContainsUnsupportedStructuralMarkup(
      "<table><tr><td>Keep me</td></tr></table>"
    ) === true &&
    mode.htmlContainsUnsupportedStructuralMarkup("<p>Safe</p><h2>Ok</h2>") ===
      false
);
ok(
  "S_no_tiptap_table_dependency",
  !/"@tiptap\/extension-table"/.test(pkg) &&
    !/@tiptap\/extension-table/.test(tipTap)
);

// T–W field types / panel
const legal = fieldsMod.ADMIN_CONTENT_SECTIONS.legal || [];
const legalFields = legal.flatMap((s) => s.fields || []);
const byKey = Object.fromEntries(legalFields.map((f) => [f.key, f]));
ok("T_privacy_body_html", byKey.privacy_body?.type === "html");
ok("U_terms_body_html", byKey.terms_body?.type === "html");
ok("V_refund_body_html_and_panel", byKey.refund_body?.type === "html" && /field\.type === "html"/.test(panel) && /TipTapEditor/.test(panel));
ok(
  "W_textarea_json_remain",
  /field\.type === "textarea" \|\| field\.type === "json"/.test(panel) &&
    /type:\s*"textarea"/.test(fields) &&
    /type:\s*"json"/.test(fields)
);

// X–AB consumers / no second editor
ok(
  "X_product_uses_shared_tiptap",
  /TipTapEditor/.test(sidhu) &&
    /short_description/.test(sidhu) &&
    /full_description/.test(sidhu)
);
ok("Y_blog_uses_shared_tiptap", /setEditBlog[\s\S]{0,80}content:\s*html/.test(sidhu));
ok(
  "Z_subscription_uses_shared_tiptap",
  /TipTapEditor/.test(subEditor)
);
ok(
  "AA_home_about_rich_tiptap",
  /home_features_list/.test(sidhu) &&
    /about_description/.test(sidhu) &&
    /about_mission/.test(sidhu)
);
ok(
  "AB_no_second_editor_system",
  exists("components/admin/TipTapEditor.tsx") &&
    !exists("components/admin/HtmlSourceEditor.tsx") &&
    !exists("components/admin/RichTextEditor.tsx") &&
    !/"@ckeditor\//.test(pkg) &&
    !/"react-quill"/.test(pkg)
);
ok(
  "AC_no_package_json_change_required",
  /"xss"/.test(pkg) && /"@tiptap\/react"/.test(pkg)
);

// Page Builder remains JSON structured
ok(
  "page_builder_structured_json_not_html_mode",
  /setSectionEditing\(JSON\.parse\(JSON\.stringify\(sec\.data\)\)\)/.test(sidhu) &&
    !/TipTapEditor[\s\S]{0,40}sectionEditing/.test(sidhu)
);

ok("helper_normalize_empty", mode.normalizeEmptyEditorHtml("<p></p>") === "");
ok(
  "helper_file_exists",
  /UnsupportedStructural/.test(helper) || /UNSUPPORTED_STRUCTURAL/.test(helper)
);

console.log(`\nShared HTML editor: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
