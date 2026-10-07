/**
 * Phase PAI-3 — New Product AI drafting UI helpers + Sidhu wiring invariants.
 * Run: node scripts/phase-pai3-product-ai-ui-tests.js
 */
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..");
let passed = 0;
let failed = 0;

function ok(name, cond, detail = "") {
  if (cond) {
    passed += 1;
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed += 1;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function loadTsModule(rel, stubs = {}) {
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
    if (id.startsWith("@/lib/")) {
      const mapped = id.replace("@/lib/", "lib/") + ".ts";
      if (fs.existsSync(path.join(ROOT, mapped))) {
        return loadTsModule(mapped, stubs);
      }
    }
    if (id.endsWith("/seoAi") || id.endsWith("/contentHtml") || id.endsWith("/productAiClient")) {
      const base = path.basename(id);
      return loadTsModule(`lib/${base}.ts`, stubs);
    }
    return require(id);
  };
  const fn = new Function("exports", "module", "require", outputText);
  fn(sandbox.exports, sandbox.module, localRequire);
  return sandbox.module.exports && Object.keys(sandbox.module.exports).length
    ? sandbox.module.exports
    : sandbox.exports;
}

const sidhuSrc = read("app/sidhu/page.tsx");
const clientSrc = read("lib/productAiClient.ts");
const apiSrc = read("pages/api/admin-seo-ai.ts");

const {
  NEW_PRODUCT_AI_GENERATE_ALL_FIELDS,
  NEW_PRODUCT_AI_APPLY_FIELDS,
  PRODUCT_AI_C_CLASS_APPLY_BLOCKED,
  tipTapHtmlToPlainContext,
  plainTextToSafeTipTapHtml,
  applyNewProductAiFieldLocally,
  buildNewProductDraftRequest,
  createDefaultProductAiFacts,
  createIdleProductAiUi,
  defaultProductKindFromCategory,
  mapProviderSuggestionsToUi,
  parseStrictPriceGbp,
  existingProductDraftAllowsNameOrSlug,
  isBlockedCClassApplyField,
  isNewProductAiApplyField,
} = loadTsModule("lib/productAiClient.ts");

console.log("\nPAI-3 New Product AI UI\n");

// A
ok(
  "A_new_modal_exposes_assistant",
  /productModal === "new"/.test(sidhuSrc) &&
    /data-testid="new-product-ai-assistant"/.test(sidhuSrc) &&
    /AI Product Assistant/.test(sidhuSrc)
);

// B
ok(
  "B_existing_modal_no_generate_all",
  /productModal === "new" && can\("products\.manage"\)/.test(sidhuSrc) &&
    /Draft with Gemini/.test(sidhuSrc) &&
    /productModal !== "new" && productModal\?\.id/.test(sidhuSrc)
);

// C
ok(
  "C_provider_selector_gemini_openai_only",
  /name="product-ai-provider"/.test(sidhuSrc) &&
    /provider: "gemini"/.test(sidhuSrc) &&
    /provider: "openai"/.test(sidhuSrc) &&
    !/product-ai-provider[\s\S]{0,200}berlin/i.test(sidhuSrc) &&
    !/product-ai-provider[\s\S]{0,200}anthropic/i.test(sidhuSrc)
);

// D / E — request builder
{
  const facts = createDefaultProductAiFacts("Subscription");
  const edit = {
    name: "1 Year Plan",
    slug: "1-year-plan",
    category: "Subscription",
    price: "£49.99",
    stock: "Digital",
    image: "",
    og_image: "",
    short_description: "<p>Short <strong>HTML</strong></p>",
    full_description: "<p>Full</p>",
    features: "A\nB",
    seo_title: "",
    meta_description: "",
    focus_keyword: "",
  };
  const all = buildNewProductDraftRequest({
    provider: "gemini",
    requestedFields: [...NEW_PRODUCT_AI_GENERATE_ALL_FIELDS],
    editProduct: edit,
    facts,
  });
  ok(
    "D_generate_all_one_request_all_fields",
    all.ok === true &&
      all.body.task === "draft_product_fields" &&
      all.body.productId === null &&
      all.body.requestedFields.length === NEW_PRODUCT_AI_GENERATE_ALL_FIELDS.length &&
      all.body.provider === "gemini"
  );

  const one = buildNewProductDraftRequest({
    provider: "openai",
    requestedFields: ["seo_title"],
    editProduct: edit,
    facts,
  });
  ok(
    "E_field_generate_singleton",
    one.ok === true &&
      one.body.requestedFields.length === 1 &&
      one.body.requestedFields[0] === "seo_title" &&
      one.body.provider === "openai"
  );

  ok("F_productId_null_for_new", all.ok && all.body.productId === null);

  const blank = buildNewProductDraftRequest({
    provider: "gemini",
    requestedFields: ["name"],
    editProduct: { ...edit, name: "   " },
    facts,
  });
  ok(
    "G_blank_name_blocks_drafting",
    blank.ok === false && /product name first/i.test(blank.message)
  );

  ok(
    "L_rich_html_to_plain_in_request",
    all.ok &&
      all.body.currentEditorCopy.short_description === "Short HTML" &&
      !/<strong>/.test(all.body.currentEditorCopy.short_description) &&
      all.body.authoritative.canonicalName === "1 Year Plan" &&
      all.body.authoritative.priceGbp === 49.99
  );
}

// H / I / J / K apply safety
{
  for (const f of PRODUCT_AI_C_CLASS_APPLY_BLOCKED) {
    ok(`H_c_class_blocked_${f}`, isBlockedCClassApplyField(f) === true);
  }
  ok(
    "H_apply_whitelist_no_c_class",
    NEW_PRODUCT_AI_APPLY_FIELDS.every((f) => !isBlockedCClassApplyField(f))
  );

  const before = {
    name: "Old",
    slug: "old",
    price: "£9.99",
    category: "Subscription",
    stock: "Digital",
    active: 1,
    image: "https://x/a.jpg",
    og_image: "https://x/og.jpg",
    badge: "HOT",
    id: 99,
    short_description: "<p>Old short</p>",
    full_description: "<p>Old full</p>",
    features: "old",
    seo_title: "old seo",
    meta_description: "old meta",
    focus_keyword: "old",
  };
  const afterName = applyNewProductAiFieldLocally(before, "name", "New Name");
  ok(
    "I_apply_local_state_only",
    afterName.name === "New Name" &&
      afterName.price === before.price &&
      afterName.category === before.category
  );

  const spoof = applyNewProductAiFieldLocally(before, "price", "1.00");
  ok("H_price_not_applied", spoof.price === "£9.99" && spoof === before);

  for (const f of ["category", "stock", "active", "image", "og_image", "badge", "id"]) {
    const next = applyNewProductAiFieldLocally(before, f, "MUTATED");
    ok(`H_${f}_not_applied`, next === before);
  }

  ok(
    "J_apply_helper_has_no_fetch",
    !/fetch\(/.test(clientSrc) &&
      !/admin-products/.test(clientSrc) &&
      /applyNewProductAiFieldLocally/.test(sidhuSrc) &&
      !/applyProductAiSuggestion[\s\S]{0,400}admin-products/.test(sidhuSrc)
  );

  const slugApplied = applyNewProductAiFieldLocally(before, "slug", "My Cool Slug!!");
  ok(
    "K_name_slug_new_apply_allowed",
    isNewProductAiApplyField("name") &&
      isNewProductAiApplyField("slug") &&
      slugApplied.slug === "my-cool-slug" &&
      existingProductDraftAllowsNameOrSlug() === false
  );
}

// M / N rich text safety
{
  const dangerous = 'Hello <script>alert(1)</script>\n\n<img src=x onerror=alert(1)> world';
  const html = plainTextToSafeTipTapHtml(dangerous);
  ok(
    "M_plain_escaped_before_tiptap",
    html.includes("&lt;script&gt;") &&
      html.includes("&lt;img") &&
      !html.includes("<script>") &&
      !html.includes("<img ") &&
      /<p>/.test(html)
  );
  ok(
    "N_raw_script_not_executable",
    !/<script\b/i.test(html) &&
      !/<[^>]*\sonerror\s*=/i.test(html) &&
      !/<img\b/i.test(html) &&
      !/<iframe\b/i.test(html) &&
      plainTextToSafeTipTapHtml("<iframe src=evil>") ===
        "<p>&lt;iframe src=evil&gt;</p>"
  );

  const fromEditor = tipTapHtmlToPlainContext(
    '<p>One</p><p>Two <strong>bold</strong></p><script>x()</script>',
    600
  );
  ok(
    "L2_tiptap_to_plain_strips_tags",
    /One/.test(fromEditor) &&
      /Two bold/.test(fromEditor) &&
      !/<script>/.test(fromEditor) &&
      !/<p>/.test(fromEditor)
  );
}

// O provider_not_configured UX wiring
ok(
  "O_provider_not_configured_message",
  /Selected AI provider is not configured yet/.test(sidhuSrc) &&
    /provider_not_configured/.test(sidhuSrc) &&
    /draftNewProductFields/.test(sidhuSrc)
);

// P no fallback
ok(
  "P_no_fallback_second_provider",
  /JSON\.stringify\(built\.body\)/.test(sidhuSrc) &&
    /provider: input\.provider|provider: productAiUi\.provider|provider: input\.facts/.test(
      clientSrc + sidhuSrc
    ) === false
      ? /provider: input\.provider/.test(clientSrc)
      : /provider: input\.provider/.test(clientSrc) &&
        !/call the other provider|fallback provider/i.test(sidhuSrc)
);

ok(
  "P2_single_provider_in_request_body",
  /provider: input\.provider/.test(clientSrc) &&
    /JSON\.stringify\(built\.body\)/.test(sidhuSrc) &&
    !/fallback/.test(clientSrc.toLowerCase())
);

// Q reset
ok(
  "Q_state_reset_between_sessions",
  /openNewProduct[\s\S]{0,250}setProductMetaAi\(\{ status: "idle" \}\)/.test(sidhuSrc) &&
    /openEditProduct[\s\S]{0,600}setProductMetaAi\(\{ status: "idle" \}\)/.test(sidhuSrc) &&
    /setProductAiUi\(createIdleProductAiUi\(\)\)/.test(sidhuSrc) &&
    /setProductMetaAi\(\{ status: "idle" \}\);\s*setProductModal\(null\)/.test(sidhuSrc)
);

// R existing metadata AI
ok(
  "R_existing_metadata_ai_present",
  /Draft with Gemini/.test(sidhuSrc) &&
    /Draft with OpenAI/.test(sidhuSrc) &&
    /draftProductMetadata/.test(sidhuSrc) &&
    /task: "draft_metadata"/.test(sidhuSrc)
);

// Extra helpers / kinds
ok(
  "kind_defaults",
  defaultProductKindFromCategory("Subscription") === "digital_subscription" &&
    defaultProductKindFromCategory("Device") === "physical" &&
    defaultProductKindFromCategory("Bundle") === "unknown"
);

ok(
  "price_strict_reject_junk",
  parseStrictPriceGbp("abc") === undefined &&
    parseStrictPriceGbp("12.345") === undefined &&
    parseStrictPriceGbp("£12.50") === 12.5
);

{
  const mapped = mapProviderSuggestionsToUi(
    { seo_title: { value: "Title", reason: "ok" } },
    ["seo_title", "features"]
  );
  ok(
    "unavailable_when_missing",
    mapped.suggestions.seo_title.value === "Title" &&
      mapped.unavailable.features?.unavailable === true
  );
}

ok(
  "idle_defaults",
  createIdleProductAiUi().provider === "gemini" &&
    createIdleProductAiUi().status === "idle"
);

ok(
  "backend_task_untouched_contract",
  /draft_product_fields/.test(apiSrc) &&
    /products\.manage/.test(apiSrc)
);

ok(
  "generate_all_uses_constant",
  /NEW_PRODUCT_AI_GENERATE_ALL_FIELDS/.test(sidhuSrc) &&
    NEW_PRODUCT_AI_GENERATE_ALL_FIELDS.includes("name") &&
    NEW_PRODUCT_AI_GENERATE_ALL_FIELDS.includes("slug")
);

console.log(`\nPAI-3 result: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
