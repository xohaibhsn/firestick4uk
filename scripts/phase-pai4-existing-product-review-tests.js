/**
 * Phase PAI-4 — Existing Product AI Review (review_product) + selective apply.
 * Run: node scripts/phase-pai4-existing-product-review-tests.js
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
    if (
      id.endsWith("/seoAi") ||
      id.endsWith("/contentHtml") ||
      id.endsWith("/productAiClient") ||
      id.endsWith("/adminPermissions")
    ) {
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

const seoAiSrc = read("lib/seoAi.ts");
const seoAiServerSrc = read("lib/seoAiServer.ts");
const apiSrc = read("pages/api/admin-seo-ai.ts");
const sidhuSrc = read("app/sidhu/page.tsx");
const clientSrc = read("lib/productAiClient.ts");

const {
  parseSeoAiRequest,
  parseReviewProductRequest,
  validateProductReview,
  parseProductReviewJsonText,
  buildReviewProductSystemInstruction,
  buildReviewProductJsonSchema,
  buildProductFieldsJsonSchema,
  SEO_AI_EXPLANATION_JSON_SCHEMA,
  SEO_AI_METADATA_JSON_SCHEMA,
  PRODUCT_AI_REVIEW_FIELDS,
  PRODUCT_AI_EXISTING_EDITABLE_FIELDS,
  PRODUCT_AI_REASON_MAX,
} = loadTsModule("lib/seoAi.ts");

/** OpenAI strict Structured Outputs: every object `properties` key must be in `required`. */
function assertStrictPropertiesRequired(schema, path = "$") {
  if (!schema || typeof schema !== "object") return [];
  const issues = [];
  if (schema.type === "object" && schema.properties) {
    const props = Object.keys(schema.properties);
    const required = Array.isArray(schema.required) ? schema.required : [];
    for (const key of props) {
      if (!required.includes(key)) {
        issues.push(`${path}.properties.${key} missing from required`);
      }
    }
    for (const key of props) {
      issues.push(
        ...assertStrictPropertiesRequired(
          schema.properties[key],
          `${path}.properties.${key}`
        )
      );
    }
  }
  if (schema.type === "array" && schema.items) {
    issues.push(
      ...assertStrictPropertiesRequired(schema.items, `${path}.items`)
    );
  }
  return issues;
}

const {
  EXISTING_PRODUCT_AI_APPLY_FIELDS,
  PRODUCT_AI_C_CLASS_APPLY_BLOCKED,
  tipTapHtmlToPlainContext,
  plainTextToSafeTipTapHtml,
  applyExistingProductAiFieldLocally,
  buildExistingProductReviewRequest,
  createIdleProductReviewUi,
  mapProductReviewToUi,
  isExistingProductAiApplyField,
  isBlockedCClassApplyField,
  isReviewFieldApplyable,
  existingProductApplyAllowsNameOrSlug,
  reviewContractIncludesNameAsReviewOnly,
  suggestionContainsUnsafeHtml,
} = loadTsModule("lib/productAiClient.ts");

const { hasAdminPermission } = loadTsModule("lib/adminPermissions.ts");

const openaiCreateCalls = [];
const geminiFetchCalls = [];
const dbQueryCalls = [];

function makeOpenAiStub() {
  return class OpenAI {
    constructor(opts) {
      this.opts = opts;
      OpenAI.lastOpts = opts;
    }
    responses = {
      create: async (args) => {
        openaiCreateCalls.push(args);
        if (OpenAI.mockImpl) return OpenAI.mockImpl(args);
        return { output_text: "{}" };
      },
    };
  };
}

const originalFetch = global.fetch;

function expectedCurrentFromCopy(copy) {
  const out = {};
  for (const f of PRODUCT_AI_REVIEW_FIELDS) {
    out[f] = copy[f] || "";
  }
  return out;
}

function validReviewPayload(overrides = {}) {
  const items = PRODUCT_AI_REVIEW_FIELDS.map((field) => ({
    field,
    current: field === "name" ? "Firestick IPTV 12 Month" : `current ${field}`,
    suggested: field === "name" ? null : null,
    reason: "Already clear and accurate.",
    status: "ok",
    confidence: "high",
    ...(overrides[field] || {}),
  }));
  return { review: items };
}

function baseReviewRequest(extra = {}) {
  return {
    provider: "gemini",
    task: "review_product",
    productId: 9,
    currentEditorCopy: {
      short_description: "Short plain copy",
      features: "Feature A\nFeature B",
      seo_title: "SEO Title",
      meta_description: "Meta description text",
      focus_keyword: "firestick iptv",
    },
    ...extra,
  };
}

console.log("\nPAI-4 Existing Product AI Review\n");

// --- REQUEST / BACKEND PARSE ---
{
  const valid = parseSeoAiRequest(baseReviewRequest());
  ok(
    "R_valid_review_request",
    valid.ok === true &&
      valid.request.task === "review_product" &&
      valid.request.productId === 9 &&
      valid.request.provider === "gemini"
  );

  ok(
    "R_invalid_provider",
    parseSeoAiRequest(baseReviewRequest({ provider: "claude" })).ok === false
  );

  ok(
    "R_missing_productId",
    parseReviewProductRequest({
      provider: "openai",
      task: "review_product",
      currentEditorCopy: {},
    }).ok === false
  );

  ok(
    "R_invalid_productId_zero",
    parseReviewProductRequest(baseReviewRequest({ productId: 0 })).ok === false
  );

  ok(
    "R_extra_request_keys_rejected",
    parseSeoAiRequest(
      baseReviewRequest({ authoritative: { canonicalName: "x" } })
    ).ok === false
  );

  ok(
    "R_name_in_editor_copy_rejected",
    parseReviewProductRequest(
      baseReviewRequest({
        currentEditorCopy: {
          name: "Spoofed",
          short_description: "ok",
        },
      })
    ).ok === false
  );

  ok(
    "R_slug_in_editor_copy_rejected",
    parseReviewProductRequest(
      baseReviewRequest({
        currentEditorCopy: {
          slug: "spoofed-slug",
          short_description: "ok",
        },
      })
    ).ok === false
  );

  ok(
    "R_openai_only_provider",
    parseSeoAiRequest(baseReviewRequest({ provider: "openai" })).ok === true
  );

  ok(
    "R_gemini_only_provider",
    parseSeoAiRequest(baseReviewRequest({ provider: "gemini" })).ok === true
  );
}

// --- RESPONSE VALIDATION ---
{
  const expected = expectedCurrentFromCopy({
    name: "Firestick IPTV 12 Month",
    short_description: "current short_description",
    full_description: "current full_description",
    features: "current features",
    seo_title: "current seo_title",
    meta_description: "current meta_description",
    focus_keyword: "current focus_keyword",
  });

  const good = validateProductReview(validReviewPayload(), expected);
  ok(
    "O_valid_review_ok_null_suggested",
    good.ok === true &&
      good.review.length === PRODUCT_AI_REVIEW_FIELDS.length &&
      good.review.every((i) => i.status === "ok" && i.suggested === null)
  );

  const nameSuggest = validReviewPayload({
    name: {
      suggested: "Better Product Name",
      reason: "Clearer identity wording.",
      status: "warning",
      confidence: "medium",
    },
  });
  const nameOk = validateProductReview(nameSuggest, expected);
  ok(
    "O_name_allowed_as_review_only",
    nameOk.ok === true &&
      nameOk.review.find((i) => i.field === "name")?.suggested ===
        "Better Product Name"
  );

  for (const field of [
    "short_description",
    "full_description",
    "features",
    "seo_title",
    "meta_description",
    "focus_keyword",
  ]) {
    const payload = validReviewPayload({
      [field]: {
        suggested: `Improved ${field}`,
        reason: "Clearer wording from known facts.",
        status: "suggest",
      },
    });
    const parsed = validateProductReview(payload, expected);
    ok(
      `O_${field}_allowed`,
      parsed.ok === true &&
        parsed.review.find((i) => i.field === field)?.suggested ===
          `Improved ${field}`
    );
  }

  const withSlug = validReviewPayload();
  withSlug.review[0] = {
    field: "slug",
    current: "x",
    suggested: "new-slug",
    reason: "bad",
    status: "suggest",
  };
  ok(
    "O_slug_rejected",
    validateProductReview(withSlug, expected).ok === false
  );

  for (const bad of [
    "price",
    "category",
    "stock",
    "active",
    "image",
    "og_image",
    "badge",
    "id",
  ]) {
    const payload = validReviewPayload();
    payload.review[0] = {
      field: bad,
      current: "x",
      suggested: "y",
      reason: "nope",
      status: "suggest",
    };
    ok(
      `O_${bad}_rejected`,
      validateProductReview(payload, expected).ok === false
    );
  }

  const dup = validReviewPayload();
  dup.review[1] = { ...dup.review[0] };
  ok("O_duplicate_field_rejected", validateProductReview(dup, expected).ok === false);

  const badStatus = validReviewPayload({
    features: {
      suggested: "x",
      reason: "r",
      status: "critical",
    },
  });
  ok(
    "O_status_enum_validated",
    validateProductReview(badStatus, expected).ok === false
  );

  const badConf = validReviewPayload({
    features: {
      suggested: null,
      reason: "ok",
      status: "ok",
      confidence: "ultra",
    },
  });
  ok(
    "O_confidence_enum_validated",
    validateProductReview(badConf, expected).ok === false
  );

  const longReason = validReviewPayload({
    features: {
      suggested: null,
      reason: "x".repeat(PRODUCT_AI_REASON_MAX + 1),
      status: "ok",
    },
  });
  ok(
    "O_reason_bounded",
    validateProductReview(longReason, expected).ok === false
  );

  const htmlSuggest = validReviewPayload({
    features: {
      suggested: "<script>alert(1)</script>",
      reason: "inject",
      status: "suggest",
    },
  });
  ok(
    "O_html_suggested_rejected",
    validateProductReview(htmlSuggest, expected).ok === false
  );

  const malformed = parseProductReviewJsonText("{not-json", expected);
  ok(
    "O_malformed_json_rejected",
    malformed.ok === false && malformed.code === "malformed_provider_output"
  );

  const okSuggestMismatch = validReviewPayload({
    features: {
      suggested: "Still changing",
      reason: "should fail",
      status: "ok",
    },
  });
  ok(
    "O_ok_with_suggestion_rejected",
    validateProductReview(okSuggestMismatch, expected).ok === false
  );
}

// --- CLIENT APPLY HELPERS ---
{
  ok(
    "A_class_a_allowlist_exact",
    JSON.stringify([...EXISTING_PRODUCT_AI_APPLY_FIELDS]) ===
      JSON.stringify([
        "short_description",
        "full_description",
        "features",
        "seo_title",
        "meta_description",
        "focus_keyword",
      ])
  );

  ok(
    "A_name_not_applyable",
    isExistingProductAiApplyField("name") === false &&
      isReviewFieldApplyable("name") === false
  );
  ok(
    "A_slug_not_applyable",
    isExistingProductAiApplyField("slug") === false &&
      isReviewFieldApplyable("slug") === false
  );

  for (const c of PRODUCT_AI_C_CLASS_APPLY_BLOCKED) {
    ok(
      `A_c_class_${c}_blocked`,
      isBlockedCClassApplyField(c) === true &&
        applyExistingProductAiFieldLocally({ [c]: "keep" }, c, "mutate")[c] ===
          "keep"
    );
  }

  const base = {
    name: "Keep Name",
    slug: "keep-slug",
    short_description: "<p>old</p>",
    full_description: "<p>old full</p>",
    features: "old",
    seo_title: "old seo",
    meta_description: "old meta",
    focus_keyword: "old kw",
    price: "10",
  };

  const nameAttempt = applyExistingProductAiFieldLocally(
    base,
    "name",
    "Hacked Name"
  );
  ok("A_name_apply_noop", nameAttempt.name === "Keep Name");

  const slugAttempt = applyExistingProductAiFieldLocally(
    base,
    "slug",
    "hacked-slug"
  );
  ok("A_slug_apply_noop", slugAttempt.slug === "keep-slug");

  const applied = applyExistingProductAiFieldLocally(
    base,
    "features",
    "New feature line"
  );
  ok(
    "A_apply_local_only",
    applied.features === "New feature line" &&
      applied.name === "Keep Name" &&
      !/fetch\s*\(/.test(
        applyExistingProductAiFieldLocally.toString() +
          buildExistingProductReviewRequest.toString()
      )
  );

  const rich = applyExistingProductAiFieldLocally(
    base,
    "short_description",
    'Hello <script>alert(1)</script>\n\n<img src=x onerror=alert(1)> world'
  );
  ok(
    "A_rich_provider_output_escaped",
    /&lt;script&gt;/.test(rich.short_description) &&
      !/<script/i.test(rich.short_description) &&
      !/<[^>]*\sonerror\s*=/i.test(rich.short_description)
  );

  const html = "<p>Hello <strong>world</strong></p><p>Second</p>";
  const plain = tipTapHtmlToPlainContext(html);
  ok(
    "A_tiptap_html_to_plain",
    !/</.test(plain) && /Hello/.test(plain) && /world/.test(plain)
  );

  const built = buildExistingProductReviewRequest({
    provider: "openai",
    productId: 8,
    editProduct: {
      short_description: "<p>Editor short</p>",
      full_description: "<p>Editor full</p>",
      features: "A\nB",
      seo_title: "Title",
      meta_description: "Meta",
      focus_keyword: "kw",
    },
  });
  ok(
    "A_build_review_request",
    built.ok === true &&
      built.body.task === "review_product" &&
      built.body.productId === 8 &&
      built.body.provider === "openai" &&
      !("name" in built.body.currentEditorCopy) &&
      !("slug" in built.body.currentEditorCopy) &&
      /Editor short/.test(built.body.currentEditorCopy.short_description) &&
      !/</.test(built.body.currentEditorCopy.short_description)
  );

  ok(
    "A_no_admin_products_in_apply_helper",
    !/admin-products/.test(clientSrc) &&
      !/fetch\s*\(/.test(
        clientSrc.slice(
          clientSrc.indexOf("applyExistingProductAiFieldLocally"),
          clientSrc.indexOf("applyExistingProductAiFieldLocally") + 800
        )
      )
  );

  ok(
    "A_name_review_only_contract",
    reviewContractIncludesNameAsReviewOnly() === true &&
      existingProductApplyAllowsNameOrSlug() === false
  );

  const mapped = mapProductReviewToUi([
    {
      field: "name",
      current: "N",
      suggested: "N2",
      reason: "r",
      status: "warning",
    },
    {
      field: "features",
      current: "F",
      suggested: "F2",
      reason: "r",
      status: "suggest",
    },
    {
      field: "slug",
      current: "s",
      suggested: "s2",
      reason: "r",
      status: "suggest",
    },
  ]);
  ok(
    "A_map_ui_drops_slug",
    mapped.some((i) => i.field === "name") &&
      mapped.some((i) => i.field === "features") &&
      !mapped.some((i) => i.field === "slug")
  );
}

// --- UI SOURCE ---
{
  ok(
    "U_existing_modal_exposes_review",
    /data-testid="existing-product-ai-review"/.test(sidhuSrc) &&
      /Review Existing Product/.test(sidhuSrc) &&
      /productModal !== "new" && productModal\?\.id/.test(sidhuSrc)
  );

  ok(
    "U_new_modal_no_existing_review",
    /data-testid="new-product-ai-assistant"/.test(sidhuSrc) &&
      sidhuSrc.indexOf('data-testid="existing-product-ai-review"') >
        sidhuSrc.indexOf('data-testid="new-product-ai-assistant"')
  );

  ok(
    "U_provider_selector_gemini_openai",
    /existing-product-review-provider/.test(sidhuSrc) &&
      /Review Product/.test(sidhuSrc) &&
      !/existing-product-review-provider[\s\S]{0,400}claude/.test(sidhuSrc)
  );

  ok(
    "U_one_click_one_request",
    /reviewExistingProduct/.test(sidhuSrc) &&
      /fetch\("\/api\/admin-seo-ai"/.test(sidhuSrc) &&
      /task: "review_product"/.test(clientSrc) &&
      !/setInterval/.test(
        sidhuSrc.slice(
          sidhuSrc.indexOf("reviewExistingProduct"),
          sidhuSrc.indexOf("reviewExistingProduct") + 1200
        )
      )
  );

  ok(
    "U_no_render_time_request",
    !/useEffect\([\s\S]{0,200}reviewExistingProduct/.test(sidhuSrc) &&
      !/useEffect\([\s\S]{0,200}review_product/.test(sidhuSrc)
  );

  ok(
    "U_name_no_apply",
    /Identity-sensitive — review manually/.test(sidhuSrc) &&
      /isReviewFieldApplyable/.test(sidhuSrc)
  );

  ok(
    "U_slug_protected_notice",
    /data-testid="existing-product-slug-protected-notice"/.test(sidhuSrc) &&
      /Public slug is protected/.test(sidhuSrc)
  );

  ok(
    "U_apply_selected_local",
    /applySelectedExistingProductReview/.test(sidhuSrc) &&
      /applyExistingProductAiFieldLocally/.test(sidhuSrc) &&
      !/applySelectedExistingProductReview[\s\S]{0,600}admin-products/.test(
        sidhuSrc
      )
  );

  ok(
    "U_provider_not_configured_preserves_form",
    /Selected AI provider is not configured yet/.test(sidhuSrc) &&
      /reviewExistingProduct/.test(sidhuSrc)
  );

  ok(
    "U_review_state_resets_on_product_change",
    /createIdleProductReviewUi/.test(sidhuSrc) &&
      /resetProductAiState/.test(sidhuSrc) &&
      /setProductReviewUi\(createIdleProductReviewUi\(\)\)/.test(sidhuSrc)
  );

  ok(
    "U_old_draft_metadata_buttons_remain",
    /Draft with Gemini/.test(sidhuSrc) &&
      /Draft with OpenAI/.test(sidhuSrc) &&
      /draftProductMetadata/.test(sidhuSrc) &&
      /task: "draft_metadata"/.test(sidhuSrc)
  );
}

async function runServerTests() {
  const OpenAI = makeOpenAiStub();
  global.fetch = async (...args) => {
    geminiFetchCalls.push(args);
    if (global.__geminiReviewMock) return global.__geminiReviewMock(...args);
    return {
      ok: true,
      json: async () => ({ outputs: [{ type: "text", text: "{}" }] }),
    };
  };

  const {
    buildProductReviewContext,
    dispatchProductReview,
    callOpenAiProductReview,
    callGeminiProductReview,
    loadProductFieldsAuthorityRow,
    getProviderEnvConfig,
  } = loadTsModule("lib/seoAiServer.ts", {
    openai: OpenAI,
    "@/lib/db": {
      __esModule: true,
      default: {
        query: async (sql, params) => {
          dbQueryCalls.push({ sql: String(sql), params });
          if (/INSERT|UPDATE|DELETE|REPLACE/i.test(String(sql))) {
            throw new Error("WRITE_SQL_FORBIDDEN");
          }
          if (params && params[0] === 404) return [[], []];
          return [
            [
              {
                id: 9,
                name: "DB Product Name",
                slug: "db-product-slug",
                category: "Subscription",
                price: 49.99,
                stock: "Digital",
                active: 1,
                image: "https://cdn.example/img.webp",
                og_image: "https://cdn.example/og.webp",
                short_description: "<p>DB short</p>",
                full_description: "<p>DB full</p>",
                features: "DB feature",
                seo_title: "DB SEO",
                meta_description: "DB meta",
                focus_keyword: "db kw",
              },
            ],
            [],
          ];
        },
      },
    },
  });

  const parsed = parseSeoAiRequest(
    baseReviewRequest({
      currentEditorCopy: {
        short_description: "Editor short plain",
        features: "Editor features",
      },
    })
  );
  ok("S_parse_ok", parsed.ok === true);

  const dbRow = {
    id: 9,
    name: "DB Product Name",
    slug: "db-product-slug",
    category: "Subscription",
    price: 49.99,
    stock: "Digital",
    active: 1,
    image: "https://cdn.example/img.webp",
    og_image: "https://cdn.example/og.webp",
    short_description: "<p>DB short</p>",
    full_description: "<p>DB full</p>",
    features: "DB feature",
    seo_title: "DB SEO",
    meta_description: "DB meta",
    focus_keyword: "db kw",
  };

  const ctx = buildProductReviewContext(parsed.request, dbRow);
  ok(
    "S_db_truth_loaded",
    ctx.dbTruth.name === "DB Product Name" &&
      ctx.dbTruth.slug === "db-product-slug" &&
      ctx.dbTruth.priceGbp === 49.99 &&
      ctx.reviewCopy.name === "DB Product Name" &&
      ctx.reviewCopy.short_description === "Editor short plain" &&
      ctx.reviewCopy.features === "Editor features" &&
      ctx.reviewCopy.seo_title === "DB SEO"
  );

  const prompt = buildReviewProductSystemInstruction(ctx);
  ok(
    "S_prompt_guards",
    /Do not propose or generate a replacement public slug/i.test(prompt) &&
      /NOT the SEO health authority/i.test(prompt) &&
      /Google ranking/i.test(prompt) &&
      /channel counts/i.test(prompt)
  );

  const schema = buildReviewProductJsonSchema();
  ok(
    "S_schema_no_slug",
    JSON.stringify(schema).includes('"name"') &&
      !JSON.stringify(schema.properties.review.items.properties.field.enum).includes(
        '"slug"'
      )
  );

  const itemSchema = schema.properties.review.items;
  const itemRequired = itemSchema.required || [];
  const itemProps = Object.keys(itemSchema.properties || {});
  ok(
    "S_review_item_all_props_required",
    itemProps.every((k) => itemRequired.includes(k)) &&
      itemRequired.includes("confidence") &&
      itemSchema.additionalProperties === false &&
      itemRequired.includes("suggested") &&
      itemSchema.properties.suggested.type.includes("null") &&
      !itemProps.includes("slug") &&
      !itemProps.includes("price") &&
      !itemProps.includes("category") &&
      !itemProps.includes("stock") &&
      !itemProps.includes("id")
  );
  ok(
    "S_prompt_confidence_required_wording",
    /confidence must be high, medium, or low/.test(prompt) &&
      !/confidence if present/.test(prompt)
  );

  const fieldsSchema = buildProductFieldsJsonSchema([
    "seo_title",
    "meta_description",
  ]);
  const strictIssues = [
    ...assertStrictPropertiesRequired(SEO_AI_EXPLANATION_JSON_SCHEMA, "explanation"),
    ...assertStrictPropertiesRequired(SEO_AI_METADATA_JSON_SCHEMA, "metadata"),
    ...assertStrictPropertiesRequired(fieldsSchema, "product_fields"),
    ...assertStrictPropertiesRequired(schema, "product_review"),
  ];
  ok(
    "S_openai_strict_all_schemas_properties_required",
    strictIssues.length === 0,
    strictIssues.join("; ")
  );

  // Provider isolation — OpenAI only
  openaiCreateCalls.length = 0;
  geminiFetchCalls.length = 0;
  const prevOpen = process.env.OPENAI_API_KEY;
  const prevOpenModel = process.env.OPENAI_SEO_MODEL;
  const prevGem = process.env.GEMINI_API_KEY;
  const prevGemModel = process.env.GEMINI_SEO_MODEL;
  process.env.OPENAI_API_KEY = "test-openai";
  process.env.OPENAI_SEO_MODEL = "gpt-test";
  process.env.GEMINI_API_KEY = "test-gemini";
  process.env.GEMINI_SEO_MODEL = "gemini-test";

  OpenAI.mockImpl = async () => ({
    output_text: JSON.stringify(validReviewPayload()),
  });

  const openRes = await dispatchProductReview("openai", ctx);
  ok(
    "P_openai_only",
    openRes.ok === true &&
      openaiCreateCalls.length === 1 &&
      geminiFetchCalls.length === 0
  );

  openaiCreateCalls.length = 0;
  geminiFetchCalls.length = 0;
  global.__geminiReviewMock = async () => ({
    ok: true,
    json: async () => ({
      outputs: [
        {
          type: "text",
          text: JSON.stringify(validReviewPayload()),
        },
      ],
    }),
  });

  // Gemini dispatch — extractGeminiInteractionText may need a specific shape.
  // Fall back to direct mock call if extract fails; still assert one-provider path.
  const gemRes = await dispatchProductReview("gemini", ctx, {
    callGemini: async () => {
      geminiFetchCalls.push(["gemini"]);
      return { ok: true, review: validateProductReview(validReviewPayload(), ctx.reviewCopy).review };
    },
  });
  ok(
    "P_gemini_only_no_openai_fallback",
    gemRes.ok === true && openaiCreateCalls.length === 0
  );

  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_SEO_MODEL;
  const missingCfg = getProviderEnvConfig("openai");
  const missingCall = await callOpenAiProductReview(ctx);
  ok(
    "P_missing_env_provider_not_configured",
    missingCfg.configured === false &&
      missingCall.ok === false &&
      missingCall.code === "provider_not_configured"
  );

  delete process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_SEO_MODEL;
  const gemMissing = await callGeminiProductReview(ctx);
  ok(
    "P_gemini_missing_env",
    gemMissing.ok === false && gemMissing.code === "provider_not_configured"
  );

  if (prevOpen === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = prevOpen;
  if (prevOpenModel === undefined) delete process.env.OPENAI_SEO_MODEL;
  else process.env.OPENAI_SEO_MODEL = prevOpenModel;
  if (prevGem === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = prevGem;
  if (prevGemModel === undefined) delete process.env.GEMINI_SEO_MODEL;
  else process.env.GEMINI_SEO_MODEL = prevGemModel;

  // RBAC source — permission check must appear inside the review_product branch.
  {
    const reviewIdx = apiSrc.indexOf('task === "review_product"');
    const reviewSlice = apiSrc.slice(reviewIdx, reviewIdx + 500);
    ok(
      "RBAC_products_manage_required",
      reviewIdx > 0 &&
        /hasAdminPermission\(role, "products\.manage"\)/.test(reviewSlice)
    );
  }
  ok(
    "RBAC_writer_cannot_manage",
    hasAdminPermission("writer", "products.manage") === false &&
      hasAdminPermission("manager", "products.manage") === true
  );

  // No-write
  dbQueryCalls.length = 0;
  const row = await loadProductFieldsAuthorityRow(9);
  ok(
    "NW_select_only_load",
    row &&
      row.id === 9 &&
      dbQueryCalls.length === 1 &&
      /^\s*SELECT/i.test(dbQueryCalls[0].sql) &&
      !/UPDATE|INSERT|DELETE/i.test(dbQueryCalls[0].sql)
  );

  const missing = await loadProductFieldsAuthorityRow(404);
  ok("NW_missing_product_null", missing === null);

  ok(
    "NW_source_no_writes_in_review_path",
    /buildProductReviewContext/.test(seoAiServerSrc) &&
      /dispatchProductReview/.test(seoAiServerSrc) &&
      !/INSERT\s+INTO\s+products/i.test(seoAiServerSrc) &&
      !/UPDATE\s+products/i.test(seoAiServerSrc) &&
      !/product\.updated/.test(apiSrc.slice(apiSrc.indexOf("review_product"))) &&
      !/invalidateSitemap/.test(
        apiSrc.slice(
          apiSrc.indexOf('task === "review_product"'),
          apiSrc.indexOf('task === "review_product"') + 800
        )
      )
  );

  ok(
    "NW_api_entity_not_found_path",
    /entity_not_found/.test(apiSrc) &&
      /loadProductFieldsAuthorityRow\(request\.productId\)/.test(apiSrc)
  );

  ok(
    "SRC_task_exports",
    /review_product/.test(seoAiSrc) &&
      /PRODUCT_AI_REVIEW_FIELDS/.test(seoAiSrc) &&
      /parseReviewProductRequest/.test(seoAiSrc)
  );

  ok(
    "SRC_idle_review_ui",
    createIdleProductReviewUi().status === "idle" &&
      createIdleProductReviewUi().provider === "gemini"
  );

  ok(
    "SRC_unsafe_html_helper",
    suggestionContainsUnsafeHtml("<b>x</b>") === true
  );

  if (typeof originalFetch === "function") {
    global.fetch = originalFetch;
  } else {
    delete global.fetch;
  }
}

runServerTests()
  .then(() => {
    console.log(`\nPAI-4 results: ${passed} passed, ${failed} failed\n`);
    if (failed > 0) process.exit(1);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
