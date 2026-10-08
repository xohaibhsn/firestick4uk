/**
 * Phase PAI-5 — Product Image Brief / Prompt Generator (image_brief).
 * Run: node scripts/phase-pai5-product-image-brief-tests.js
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
  parseImageBriefRequest,
  validateImageBrief,
  parseImageBriefJsonText,
  buildImageBriefSystemInstruction,
  buildImageBriefJsonSchema,
  buildReviewProductJsonSchema,
  buildProductFieldsJsonSchema,
  SEO_AI_EXPLANATION_JSON_SCHEMA,
  SEO_AI_METADATA_JSON_SCHEMA,
  IMAGE_BRIEF_SLOTS,
  IMAGE_BRIEF_PROMPT_MAX,
  IMAGE_BRIEF_ALT_MAX,
  PRODUCT_AI_NEW_EDITABLE_FIELDS,
  mergeProductAuthoritativeWithDb,
} = loadTsModule("lib/seoAi.ts");

const {
  buildProductImageBriefRequest,
  createIdleProductImageBriefUi,
  mapImageBriefSlotsToUi,
  formatImageBriefClipboard,
  createDefaultProductAiFacts,
} = loadTsModule("lib/productAiClient.ts");

const { hasAdminPermission } = loadTsModule("lib/adminPermissions.ts");

/** OpenAI strict Structured Outputs: every object `properties` key must be in `required`. */
function assertStrictPropertiesRequired(schema, pathLabel = "$") {
  if (!schema || typeof schema !== "object") return [];
  const issues = [];
  if (schema.type === "object" && schema.properties) {
    const props = Object.keys(schema.properties);
    const required = Array.isArray(schema.required) ? schema.required : [];
    for (const key of props) {
      if (!required.includes(key)) {
        issues.push(`${pathLabel}.properties.${key} missing from required`);
      }
    }
    for (const key of props) {
      issues.push(
        ...assertStrictPropertiesRequired(
          schema.properties[key],
          `${pathLabel}.properties.${key}`
        )
      );
    }
  }
  if (schema.type === "array" && schema.items) {
    issues.push(
      ...assertStrictPropertiesRequired(schema.items, `${pathLabel}.items`)
    );
  }
  return issues;
}

function makeSlot(slot, overrides = {}) {
  const isOg = slot === "OG_SOCIAL";
  const isDetail = slot === "DETAIL_SUPPORTING";
  const use = overrides.use != null ? overrides.use : !isDetail || overrides.forceUse;
  const baseUse = isDetail ? false : true;
  const finalUse = overrides.use != null ? overrides.use : baseUse;
  return {
    slot,
    use: finalUse,
    purpose: finalUse
      ? `Purpose for ${slot}`
      : "",
    width: isOg ? 1200 : 1200,
    height: isOg ? 630 : 1200,
    aspect_ratio: isOg ? "1.91:1" : "1:1",
    format: isOg ? "jpg" : "webp",
    composition: finalUse ? `Clean commercial composition for ${slot}` : "",
    prompt: finalUse
      ? `Premium Firestick4UK product visual for ${slot}, UK ecommerce, no logos`
      : "",
    negative_prompt: "watermarks, fake badges, third-party logos, text artifacts",
    approved_text: "",
    text_guidance: finalUse
      ? "Generate without embedded text; add exact text later if needed."
      : "",
    alt_text: finalUse ? `Firestick4UK product image for ${slot}` : "",
    ...overrides,
    slot,
  };
}

function validBriefPayload(overrides = {}) {
  const slots = IMAGE_BRIEF_SLOTS.map((id) =>
    makeSlot(id, (overrides.slots && overrides.slots[id]) || {})
  );
  if (overrides.slotOrder) {
    return { slots: overrides.slotOrder.map((id) => makeSlot(id)) };
  }
  if (overrides.rawSlots) return { slots: overrides.rawSlots };
  return { slots };
}

function baseImageBriefRequest(extra = {}) {
  return {
    provider: "gemini",
    task: "image_brief",
    productId: null,
    productKind: "digital_subscription",
    authoritative: {
      productKind: "digital_subscription",
      brand: "Firestick4UK",
      canonicalName: "PAI5 Image Brief Test",
      productId: null,
      active: true,
      category: "Subscription",
      imageUrl: null,
      ogImageUrl: null,
    },
    currentEditorCopy: {
      name: "PAI5 Image Brief Test",
      short_description: "Short plain product summary",
    },
    ...extra,
  };
}

function editProductFixture(overrides = {}) {
  return {
    name: "PAI5 Image Brief Test",
    slug: "pai5-image-brief-test",
    category: "Subscription",
    price: "£49.99",
    stock: "Digital",
    image: "",
    short_description: "<p>Short</p>",
    full_description: "<p>Full</p>",
    features: "Feature A",
    seo_title: "SEO",
    meta_description: "Meta",
    focus_keyword: "firestick",
    og_image: "",
    ...overrides,
  };
}

console.log("\nPAI-5 Product Image Brief\n");

// --- REQUEST ---
{
  const neu = parseSeoAiRequest(baseImageBriefRequest());
  ok(
    "R_new_product_valid_image_brief",
    neu.ok === true &&
      neu.request.task === "image_brief" &&
      neu.request.productId === null &&
      neu.request.provider === "gemini"
  );

  const existing = parseSeoAiRequest(
    baseImageBriefRequest({
      productId: 12,
      authoritative: {
        ...baseImageBriefRequest().authoritative,
        productId: 12,
        canonicalName: "Existing Product",
      },
    })
  );
  ok(
    "R_existing_product_valid_image_brief",
    existing.ok === true &&
      existing.request.task === "image_brief" &&
      existing.request.productId === 12
  );

  ok(
    "R_invalid_provider",
    parseSeoAiRequest(baseImageBriefRequest({ provider: "claude" })).ok === false
  );

  ok(
    "R_invalid_productId_zero",
    parseImageBriefRequest(baseImageBriefRequest({ productId: 0 })).ok === false
  );

  ok(
    "R_unsupported_request_keys",
    parseSeoAiRequest(
      baseImageBriefRequest({ entityType: "product", entityId: 1 })
    ).ok === false
  );

  ok(
    "R_new_product_needs_canonical_name",
    parseImageBriefRequest(
      baseImageBriefRequest({
        authoritative: {
          productKind: "digital_subscription",
          brand: "Firestick4UK",
          canonicalName: "",
          productId: null,
          active: true,
        },
      })
    ).ok === false
  );

  const clientBuilt = buildProductImageBriefRequest({
    provider: "openai",
    productId: null,
    editProduct: editProductFixture({ name: "" }),
    facts: createDefaultProductAiFacts("Subscription"),
  });
  ok(
    "R_client_new_needs_name",
    clientBuilt.ok === false && /name/i.test(clientBuilt.message || "")
  );

  const clientOk = buildProductImageBriefRequest({
    provider: "openai",
    productId: null,
    editProduct: editProductFixture(),
    facts: createDefaultProductAiFacts("Subscription"),
  });
  ok(
    "R_client_new_ok_no_placeholder",
    clientOk.ok === true &&
      clientOk.body.productId === null &&
      clientOk.body.task === "image_brief"
  );

  const merged = mergeProductAuthoritativeWithDb(
    {
      productKind: "digital_subscription",
      brand: "Firestick4UK",
      canonicalName: "Client Spoof Name",
      productId: 12,
      active: false,
      category: "Device",
      priceGbp: 1,
      stockLabel: "Spoof",
      slug: "spoof-slug",
      imageUrl: "https://evil.example/a.jpg",
      ogImageUrl: "https://evil.example/og.jpg",
    },
    {
      id: 12,
      name: "DB Truth Name",
      slug: "db-truth-slug",
      category: "Subscription",
      price: "49.99",
      stock: "Digital",
      active: true,
      image: "/uploads/db.jpg",
      og_image: "/uploads/db-og.jpg",
      short_description: "db short",
      full_description: "db full",
      features: "db feat",
      seo_title: "db seo",
      meta_description: "db meta",
      focus_keyword: "db kw",
    }
  );
  ok(
    "R_existing_db_truth_overrides_protected",
    merged.canonicalName === "DB Truth Name" &&
      merged.slug === "db-truth-slug" &&
      merged.category === "Subscription" &&
      merged.active === true &&
      merged.imageUrl === "/uploads/db.jpg" &&
      merged.ogImageUrl === "/uploads/db-og.jpg"
  );
}

// --- SLOTS ---
{
  const good = validateImageBrief(validBriefPayload());
  ok(
    "S_exactly_3_slots",
    good.ok === true && good.result.slots.length === 3
  );
  ok(
    "S_main_once",
    good.ok &&
      good.result.slots.filter((s) => s.slot === "MAIN_PRODUCT").length === 1
  );
  ok(
    "S_detail_once",
    good.ok &&
      good.result.slots.filter((s) => s.slot === "DETAIL_SUPPORTING").length ===
        1
  );
  ok(
    "S_og_once",
    good.ok &&
      good.result.slots.filter((s) => s.slot === "OG_SOCIAL").length === 1
  );

  const dup = validateImageBrief({
    slots: [
      makeSlot("MAIN_PRODUCT"),
      makeSlot("MAIN_PRODUCT"),
      makeSlot("OG_SOCIAL"),
    ],
  });
  ok("S_duplicate_rejected", dup.ok === false);

  const unknown = validateImageBrief({
    slots: [
      makeSlot("MAIN_PRODUCT"),
      { ...makeSlot("DETAIL_SUPPORTING"), slot: "HERO_BANNER" },
      makeSlot("OG_SOCIAL"),
    ],
  });
  ok("S_unknown_slot_rejected", unknown.ok === false);

  const mainFalse = validateImageBrief(
    validBriefPayload({
      slots: { MAIN_PRODUCT: { use: false, purpose: "", prompt: "", composition: "", text_guidance: "", alt_text: "" } },
    })
  );
  ok("S_main_use_must_true", mainFalse.ok === false);

  const ogFalse = validateImageBrief(
    validBriefPayload({
      slots: { OG_SOCIAL: { use: false, purpose: "", prompt: "", composition: "", text_guidance: "", alt_text: "" } },
    })
  );
  ok("S_og_use_must_true", ogFalse.ok === false);

  const detailFalse = validateImageBrief(validBriefPayload());
  ok(
    "S_detail_may_use_false",
    detailFalse.ok === true &&
      detailFalse.result.slots.find((s) => s.slot === "DETAIL_SUPPORTING")
        ?.use === false
  );

  const detailTrue = validateImageBrief(
    validBriefPayload({
      slots: {
        DETAIL_SUPPORTING: {
          use: true,
          purpose: "Detail angle",
          composition: "Side detail",
          prompt: "Supporting detail visual without logos",
          text_guidance: "No text",
          alt_text: "Supporting product detail",
        },
      },
    })
  );
  ok(
    "S_detail_may_use_true",
    detailTrue.ok === true &&
      detailTrue.result.slots.find((s) => s.slot === "DETAIL_SUPPORTING")
        ?.use === true
  );
}

// --- DIMENSIONS / FORMATS ---
{
  const good = validateImageBrief(validBriefPayload());
  const main = good.result.slots.find((s) => s.slot === "MAIN_PRODUCT");
  const detail = good.result.slots.find((s) => s.slot === "DETAIL_SUPPORTING");
  const og = good.result.slots.find((s) => s.slot === "OG_SOCIAL");
  ok(
    "D_main_1200x1200",
    main && main.width === 1200 && main.height === 1200 && main.aspect_ratio === "1:1"
  );
  ok(
    "D_detail_1200x1200",
    detail &&
      detail.width === 1200 &&
      detail.height === 1200 &&
      detail.aspect_ratio === "1:1"
  );
  ok(
    "D_og_1200x630",
    og && og.width === 1200 && og.height === 630 && og.aspect_ratio === "1.91:1"
  );

  ok(
    "F_main_webp_or_jpg",
    main && (main.format === "webp" || main.format === "jpg")
  );
  ok(
    "F_og_jpg_or_png",
    og && (og.format === "jpg" || og.format === "png")
  );

  const badMainSize = validateImageBrief(
    validBriefPayload({
      slots: { MAIN_PRODUCT: { width: 800, height: 800 } },
    })
  );
  ok("D_main_wrong_size_rejected", badMainSize.ok === false);

  const badOgSize = validateImageBrief(
    validBriefPayload({
      slots: { OG_SOCIAL: { width: 1200, height: 1200 } },
    })
  );
  ok("D_og_wrong_size_rejected", badOgSize.ok === false);

  const badMainFmt = validateImageBrief(
    validBriefPayload({
      slots: { MAIN_PRODUCT: { format: "png" } },
    })
  );
  ok("F_main_png_rejected", badMainFmt.ok === false);

  const badOgFmt = validateImageBrief(
    validBriefPayload({
      slots: { OG_SOCIAL: { format: "webp" } },
    })
  );
  ok("F_og_webp_rejected", badOgFmt.ok === false);
}

// --- CONTENT ---
{
  const huge = "x".repeat(IMAGE_BRIEF_PROMPT_MAX + 5);
  const hugePrompt = validateImageBrief(
    validBriefPayload({
      slots: { MAIN_PRODUCT: { prompt: huge } },
    })
  );
  ok("C_bounded_prompt_rejected", hugePrompt.ok === false);

  const hugeAlt = validateImageBrief(
    validBriefPayload({
      slots: { MAIN_PRODUCT: { alt_text: "y".repeat(IMAGE_BRIEF_ALT_MAX + 5) } },
    })
  );
  ok("C_bounded_alt_rejected", hugeAlt.ok === false);

  const html = validateImageBrief(
    validBriefPayload({
      slots: { MAIN_PRODUCT: { prompt: "<script>alert(1)</script> clean visual" } },
    })
  );
  ok("C_html_script_rejected", html.ok === false);

  const extraField = validateImageBrief({
    slots: IMAGE_BRIEF_SLOTS.map((id) => ({
      ...makeSlot(id),
      ...(id === "MAIN_PRODUCT" ? { url: "https://evil.example/x.png" } : {}),
    })),
  });
  ok("C_invalid_extra_fields_rejected", extraField.ok === false);

  const approvedOk = validateImageBrief(
    validBriefPayload({
      slots: { MAIN_PRODUCT: { approved_text: "" } },
    })
  );
  ok(
    "C_approved_text_empty_ok",
    approvedOk.ok === true &&
      approvedOk.result.slots[0].approved_text === ""
  );

  ok(
    "C_system_blocks_invented_claims",
    /Never invent|third-party|watermarks|channel counts/i.test(
      buildImageBriefSystemInstruction({
        productId: null,
        productKind: "digital_subscription",
        authoritative: baseImageBriefRequest().authoritative,
        currentEditorCopy: {},
      })
    )
  );

  ok(
    "C_no_images_api_in_sources",
    !/images\.generate|imagen|generateImages|openai\.images/i.test(
      seoAiSrc + seoAiServerSrc + apiSrc + clientSrc + sidhuSrc
    )
  );
}

// --- STRICT SCHEMA ---
{
  const imageSchema = buildImageBriefJsonSchema();
  const reviewSchema = buildReviewProductJsonSchema();
  const fieldsSchema = buildProductFieldsJsonSchema([
    ...PRODUCT_AI_NEW_EDITABLE_FIELDS,
  ]);
  const issues = [
    ...assertStrictPropertiesRequired(SEO_AI_EXPLANATION_JSON_SCHEMA, "explanation"),
    ...assertStrictPropertiesRequired(SEO_AI_METADATA_JSON_SCHEMA, "metadata"),
    ...assertStrictPropertiesRequired(fieldsSchema, "product_fields"),
    ...assertStrictPropertiesRequired(reviewSchema, "product_review"),
    ...assertStrictPropertiesRequired(imageSchema, "image_brief"),
  ];
  ok(
    "STRICT_all_properties_required_recursively",
    issues.length === 0,
    issues.slice(0, 5).join("; ")
  );
  ok(
    "STRICT_image_brief_additionalProperties_false",
    imageSchema.additionalProperties === false &&
      imageSchema.properties.slots.items.additionalProperties === false
  );
  ok(
    "STRICT_slot_keys_all_required",
    Array.isArray(imageSchema.properties.slots.items.required) &&
      imageSchema.properties.slots.items.required.length ===
        Object.keys(imageSchema.properties.slots.items.properties).length
  );
}

// --- PROVIDERS / DISPATCH ---
{
  ok(
    "P_api_branches_image_brief",
    /task === "image_brief"/.test(apiSrc) &&
      /dispatchImageBrief/.test(apiSrc)
  );
  ok(
    "P_dispatch_no_fallback",
    /dispatchImageBrief/.test(seoAiServerSrc) &&
      /Exactly one provider call for image briefs\. No fallback/.test(
        seoAiServerSrc
      ) &&
      !/fallback.*image_brief|tryGemini|tryOpenAi|retry.*other provider/i.test(
        seoAiServerSrc
      )
  );
  ok(
    "P_openai_only_path",
    /callOpenAiImageBrief/.test(seoAiServerSrc) &&
      /provider === "openai"/.test(seoAiServerSrc)
  );
  ok(
    "P_gemini_only_path",
    /callGeminiImageBrief/.test(seoAiServerSrc)
  );
  ok(
    "P_missing_env_controlled",
    /provider_not_configured/.test(seoAiServerSrc) &&
      /getProviderEnvConfig/.test(seoAiServerSrc)
  );
  ok(
    "P_rl_seo_ai_reused",
    /RL_SEO_AI/.test(apiSrc)
  );
  ok(
    "P_one_call_no_polling",
    !/setInterval|poll.*image_brief|while\s*\(.*image/.test(
      sidhuSrc + clientSrc + seoAiServerSrc
    )
  );
}

async function runProviderIsolationTests() {
  const openaiCreateCalls = [];
  let geminiCalls = 0;

  function makeOpenAiStub() {
    return class OpenAI {
      constructor(opts) {
        this.opts = opts;
      }
      responses = {
        create: async (args) => {
          openaiCreateCalls.push(args);
          return { output_text: JSON.stringify(validBriefPayload()) };
        },
      };
    };
  }

  const originalOpenAiKey = process.env.OPENAI_API_KEY;
  const originalGeminiKey = process.env.GEMINI_API_KEY;
  const originalOpenAiModel = process.env.OPENAI_SEO_MODEL;
  const originalGeminiModel = process.env.GEMINI_SEO_MODEL;

  process.env.OPENAI_API_KEY = "test-openai-key";
  process.env.GEMINI_API_KEY = "test-gemini-key";
  process.env.OPENAI_SEO_MODEL = "gpt-test";
  process.env.GEMINI_SEO_MODEL = "gemini-test";

  try {
    const server = loadTsModule("lib/seoAiServer.ts", {
      openai: makeOpenAiStub(),
      "@/lib/db": {
        __esModule: true,
        default: {
          query: async (sql) => {
            if (/INSERT|UPDATE|DELETE|REPLACE/i.test(String(sql))) {
              throw new Error("WRITE_SQL_FORBIDDEN");
            }
            return [[], []];
          },
        },
      },
      "@/lib/seoDiagnostics": {
        diagnoseBlog: () => ({}),
        diagnoseProduct: () => ({}),
      },
      "@/lib/seoDiagnosticRows": {
        normalizeBlogDiagnosticRow: (r) => r,
        normalizeProductDiagnosticRow: (r) => r,
      },
    });

    const ctx = {
      productId: null,
      productKind: "digital_subscription",
      authoritative: baseImageBriefRequest().authoritative,
      currentEditorCopy: { name: "PAI5 Image Brief Test" },
    };

    openaiCreateCalls.length = 0;
    geminiCalls = 0;
    const openRes = await server.dispatchImageBrief("openai", ctx);
    ok(
      "P_openai_dispatch_ok_one_call",
      openRes.ok === true &&
        openaiCreateCalls.length === 1 &&
        geminiCalls === 0 &&
        openRes.result.slots.length === 3
    );

    openaiCreateCalls.length = 0;
    geminiCalls = 0;
    const gemRes = await server.dispatchImageBrief("gemini", ctx, {
      callGemini: async () => {
        geminiCalls += 1;
        const parsed = validateImageBrief(validBriefPayload());
        return { ok: true, result: parsed.result };
      },
    });
    ok(
      "P_gemini_dispatch_ok_one_call",
      gemRes.ok === true &&
        geminiCalls === 1 &&
        openaiCreateCalls.length === 0 &&
        gemRes.result.slots.length === 3
    );

    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_SEO_MODEL;
    const missing = await server.callOpenAiImageBrief(ctx);
    ok(
      "P_missing_openai_env",
      missing.ok === false && missing.code === "provider_not_configured"
    );
  } finally {
    if (originalOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalOpenAiKey;
    if (originalGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalGeminiKey;
    if (originalOpenAiModel === undefined) delete process.env.OPENAI_SEO_MODEL;
    else process.env.OPENAI_SEO_MODEL = originalOpenAiModel;
    if (originalGeminiModel === undefined) delete process.env.GEMINI_SEO_MODEL;
    else process.env.GEMINI_SEO_MODEL = originalGeminiModel;
  }
}

// --- RBAC ---
{
  ok(
    "RBAC_products_manage_required",
    /image_brief[\s\S]{0,400}products\.manage|products\.manage[\s\S]{0,400}image_brief/.test(
      apiSrc
    )
  );
  ok(
    "RBAC_manager_has_products_manage",
    hasAdminPermission("manager", "products.manage") === true
  );
  ok(
    "RBAC_writer_lacks_products_manage",
    hasAdminPermission("writer", "products.manage") === false
  );
}

// --- NO WRITE ---
{
  ok(
    "NW_existing_select_only_path",
    /loadProductFieldsAuthorityRow/.test(seoAiServerSrc) &&
      /buildImageBriefContext/.test(seoAiServerSrc) &&
      /SELECT-only|Never writes|SELECT only/i.test(seoAiServerSrc)
  );
  ok(
    "NW_api_image_brief_no_mutations",
    /task === "image_brief"/.test(apiSrc) &&
      !/INSERT|UPDATE products|DELETE FROM|createRevision|writeAudit|invalidateSitemap|purgeCache/.test(
        apiSrc.split('task === "image_brief"')[1]?.slice(0, 2500) || ""
      )
  );
  ok(
    "NW_unsaved_no_db_placeholder",
    /productId == null|productId === null/.test(apiSrc) &&
      !/INSERT INTO products/.test(seoAiServerSrc + apiSrc)
  );
  ok(
    "NW_client_no_cms_write",
    /No DB\. No CMS writes|No image generation/.test(clientSrc)
  );
}

// --- UI ---
{
  ok(
    "UI_new_product_generate_image_briefs",
    /productModal === "new"/.test(sidhuSrc) &&
      /Generate Image Briefs/.test(sidhuSrc) &&
      /product-image-brief-generate/.test(sidhuSrc)
  );
  ok(
    "UI_existing_product_generate_image_briefs",
    /existing-product-ai-review/.test(sidhuSrc) &&
      /renderProductImageBriefPanel\(productReviewUi\.provider\)/.test(sidhuSrc)
  );
  ok(
    "UI_copy_prompt_negative_alt",
    /Copy Prompt/.test(sidhuSrc) &&
      /Copy Negative Prompt/.test(sidhuSrc) &&
      /Copy Alt Text/.test(sidhuSrc) &&
      /copyTextToClipboard/.test(sidhuSrc)
  );
  ok(
    "UI_no_auto_image_generation",
    !/Images API|generateImage\(|openai\.images|gemini.*image.*generate/i.test(
      sidhuSrc
    )
  );
  ok(
    "UI_media_library_reuse",
    /Open Product Image Library/.test(sidhuSrc) &&
      /Open OG Image Library/.test(sidhuSrc) &&
      /Choose Product Image/.test(sidhuSrc) &&
      /Choose Product OG Image/.test(sidhuSrc) &&
      /setMediaPicker/.test(sidhuSrc)
  );
  ok(
    "UI_state_reset",
    /createIdleProductImageBriefUi/.test(sidhuSrc) &&
      /resetProductAiState/.test(sidhuSrc) &&
      /setProductImageBriefUi\(createIdleProductImageBriefUi\(\)\)/.test(sidhuSrc)
  );
  ok(
    "UI_idle_helper_exists",
    createIdleProductImageBriefUi().status === "idle" &&
      createIdleProductImageBriefUi().slots.length === 0
  );

  const mapped = mapImageBriefSlotsToUi(validBriefPayload().slots);
  ok(
    "UI_map_slots_order",
    mapped.length === 3 &&
      mapped[0].slot === "MAIN_PRODUCT" &&
      mapped[2].slot === "OG_SOCIAL"
  );
  ok(
    "UI_clipboard_format",
    /Prompt:/.test(formatImageBriefClipboard(mapped[0])) &&
      /Negative prompt:/.test(formatImageBriefClipboard(mapped[0]))
  );
}

runProviderIsolationTests()
  .then(() => {
    // parse round-trip
    const parsed = parseImageBriefJsonText(
      JSON.stringify(validBriefPayload())
    );
    ok(
      "PARSE_json_text_ok",
      parsed.ok === true && parsed.result.slots.length === 3
    );

    console.log(`\nPAI-5 results: ${passed} passed, ${failed} failed\n`);
    process.exit(failed ? 1 : 0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
