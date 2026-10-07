/**
 * Phase PAI-2 — product AI drafting contract (draft_product_fields).
 * Run: node scripts/phase-pai2-product-ai-tests.js
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
      id.endsWith("/seoOverview") ||
      id.endsWith("/seoDiagnostics") ||
      id.endsWith("/seoDiagnosticRows") ||
      id.endsWith("/seoAi") ||
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

const {
  parseSeoAiRequest,
  parseProductFieldsRequest,
  validateProductFieldsDraft,
  parseProductFieldsJsonText,
  normalizeProductAiSlug,
  mergeProductAuthoritativeWithDb,
  buildProductFieldsSystemInstruction,
  buildProductFieldsJsonSchema,
  PRODUCT_AI_NEW_EDITABLE_FIELDS,
  PRODUCT_AI_EXISTING_EDITABLE_FIELDS,
  PRODUCT_AI_FIELD_MAX,
  PRODUCT_TITLE_MAX,
  META_DESC_MAX,
} = loadTsModule("lib/seoAi.ts");

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
        return {
          output_text: JSON.stringify({
            suggestions: {
              seo_title: {
                unavailable: false,
                value: "IPTV Subscription | Firestick4UK",
                reason: "Clear product SEO title",
              },
            },
          }),
        };
      },
    };
  };
}

const OpenAIStub = makeOpenAiStub();

const originalFetch = global.fetch;
global.fetch = async (url, init) => {
  if (String(url).includes("generativelanguage.googleapis.com")) {
    geminiFetchCalls.push({ url: String(url), init });
    if (global.__geminiMockImpl) return global.__geminiMockImpl(url, init);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        steps: [
          {
            type: "model_output",
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  suggestions: {
                    seo_title: {
                      unavailable: false,
                      value: "Gemini IPTV Title | Firestick4UK",
                      reason: "Drafted",
                    },
                  },
                }),
              },
            ],
          },
        ],
      }),
    };
  }
  if (originalFetch) return originalFetch(url, init);
  throw new Error("Unexpected fetch in tests");
};

const fixtureDbRow = {
  id: 42,
  name: "Saved Product Name",
  slug: "saved-product-slug",
  category: "Subscription",
  price: 49.99,
  stock: "Digital",
  active: 1,
  image: "https://cdn.example/product.jpg",
  og_image: "https://cdn.example/og.jpg",
  short_description: "Saved short",
  full_description: "Saved full",
  features: "Saved features",
  seo_title: "Saved SEO",
  meta_description: "Saved meta",
  focus_keyword: "iptv",
};

const {
  buildProductFieldsDraftContext,
  dispatchProductFieldsDraft,
  callOpenAiProductFields,
  callGeminiProductFields,
  getProviderEnvConfig,
  loadProductFieldsAuthorityRow,
} = loadTsModule("lib/seoAiServer.ts", {
  openai: { __esModule: true, default: OpenAIStub },
  "@/lib/db": {
    __esModule: true,
    default: {
      query: async (sql, params) => {
        dbQueryCalls.push({ sql: String(sql), params });
        if (/INSERT|UPDATE|DELETE|REPLACE/i.test(String(sql))) {
          throw new Error("WRITE_SQL_FORBIDDEN");
        }
        if (/FROM products/i.test(String(sql))) {
          return [[fixtureDbRow], []];
        }
        return [[], []];
      },
    },
  },
});

function baseNewRequest(overrides = {}) {
  return {
    provider: "openai",
    task: "draft_product_fields",
    productId: null,
    productKind: "digital_subscription",
    requestedFields: ["seo_title"],
    authoritative: {
      productKind: "digital_subscription",
      canonicalName: "1 Year IPTV Subscription",
      category: "Subscription",
      brand: "Firestick4UK",
    },
    currentEditorCopy: {},
    ...overrides,
  };
}

function baseExistingRequest(overrides = {}) {
  return baseNewRequest({
    productId: 42,
    requestedFields: ["seo_title", "meta_description"],
    authoritative: {
      productKind: "digital_subscription",
      canonicalName: "Spoofed Name",
      productId: 42,
      slug: "spoofed-slug",
      priceGbp: 1,
      stockLabel: "FAKE",
      category: "Device",
      active: false,
      imageUrl: "https://evil.example/x.png",
      ogImageUrl: "https://evil.example/og.png",
    },
    currentEditorCopy: {
      seo_title: "Editor SEO draft",
      meta_description: "Editor meta draft",
    },
    ...overrides,
  });
}

console.log("\nPAI-2 Product AI Drafting Contract\n");

// --- REQUEST VALIDATION ---
{
  const good = parseSeoAiRequest(baseNewRequest());
  ok(
    "R_valid_unsaved_new_product",
    good.ok === true &&
      good.request.task === "draft_product_fields" &&
      good.request.productId === null &&
      good.request.requestedFields[0] === "seo_title"
  );
}

{
  const good = parseSeoAiRequest(baseExistingRequest());
  ok(
    "R_valid_existing_product",
    good.ok === true &&
      good.request.productId === 42 &&
      good.request.requestedFields.includes("meta_description")
  );
}

{
  const bad = parseSeoAiRequest(baseNewRequest({ provider: "berlin" }));
  ok(
    "R_invalid_provider",
    bad.ok === false && /provider must be gemini or openai/i.test(bad.message)
  );
}

{
  const bad = parseSeoAiRequest(baseNewRequest({ productKind: "bundle" }));
  ok(
    "R_invalid_productKind",
    bad.ok === false && /productKind is invalid/i.test(bad.message)
  );
}

{
  const bad = parseSeoAiRequest(baseNewRequest({ requestedFields: [] }));
  ok(
    "R_empty_requestedFields",
    bad.ok === false && /non-empty array/i.test(bad.message)
  );
}

{
  const bad = parseSeoAiRequest(
    baseNewRequest({ requestedFields: ["seo_title", "seo_title"] })
  );
  ok(
    "R_duplicate_fields",
    bad.ok === false && /duplicates/i.test(bad.message)
  );
}

{
  const bad = parseSeoAiRequest(
    baseNewRequest({ requestedFields: ["unknown_field"] })
  );
  ok(
    "R_unsupported_field",
    bad.ok === false && /not supported/i.test(bad.message)
  );
}

{
  const bad = parseSeoAiRequest(
    baseNewRequest({ requestedFields: ["price"] })
  );
  ok(
    "R_c_class_price_rejected",
    bad.ok === false && /not allowed/i.test(bad.message)
  );
}

{
  const bad = parseSeoAiRequest(
    baseNewRequest({ requestedFields: ["stock"] })
  );
  ok(
    "R_c_class_stock_rejected",
    bad.ok === false && /not allowed/i.test(bad.message)
  );
}

{
  const bad = parseSeoAiRequest(
    baseNewRequest({ requestedFields: ["badge"] })
  );
  ok(
    "R_badge_rejected",
    bad.ok === false && /not allowed/i.test(bad.message)
  );
}

{
  const bad = parseSeoAiRequest(
    baseNewRequest({
      requestedFields: ["seo_title"],
      extra: true,
    })
  );
  ok(
    "R_unsupported_top_level_key",
    bad.ok === false && /unsupported fields/i.test(bad.message)
  );
}

{
  const bad = parseSeoAiRequest(
    baseNewRequest({
      authoritative: {
        productKind: "digital_subscription",
        canonicalName: "X",
        inventedFact: "nope",
      },
    })
  );
  ok(
    "R_authoritative_unsupported_key",
    bad.ok === false && /authoritative contains unsupported/i.test(bad.message)
  );
}

{
  const bad = parseSeoAiRequest(
    baseNewRequest({
      authoritative: {
        productKind: "digital_subscription",
        canonicalName: "<script>alert(1)</script>",
      },
    })
  );
  ok(
    "R_html_payload_rejected",
    bad.ok === false && /canonicalName/i.test(bad.message)
  );
}

// --- NEW PRODUCT ---
{
  const fields = [
    "name",
    "slug",
    "short_description",
    "full_description",
    "features",
    "seo_title",
    "meta_description",
    "focus_keyword",
  ];
  const good = parseSeoAiRequest(
    baseNewRequest({ requestedFields: fields })
  );
  ok(
    "N_all_new_fields_allowed",
    good.ok === true &&
      good.request.requestedFields.length === fields.length &&
      PRODUCT_AI_NEW_EDITABLE_FIELDS.length === fields.length
  );
}

{
  const good = parseSeoAiRequest(
    baseNewRequest({
      productId: null,
      requestedFields: ["name", "slug"],
    })
  );
  ok(
    "N_name_and_slug_allowed",
    good.ok === true &&
      good.request.requestedFields.includes("name") &&
      good.request.requestedFields.includes("slug")
  );
}

{
  ok(
    "N_no_productId_required",
    parseSeoAiRequest(baseNewRequest({ productId: null })).ok === true
  );
}

{
  ok(
    "N_slug_normalizer_safe",
    normalizeProductAiSlug(" Hello/World.. ") === "hello-world" &&
      normalizeProductAiSlug("../etc/passwd") === "etc-passwd" &&
      normalizeProductAiSlug("") === null &&
      normalizeProductAiSlug("---") === null
  );
}

// --- EXISTING PRODUCT ---
{
  const bad = parseSeoAiRequest(
    baseExistingRequest({ requestedFields: ["name"] })
  );
  ok(
    "E_name_rejected_in_draft",
    bad.ok === false && /not allowed for existing/i.test(bad.message)
  );
}

{
  const bad = parseSeoAiRequest(
    baseExistingRequest({ requestedFields: ["slug"] })
  );
  ok(
    "E_slug_rejected_in_draft",
    bad.ok === false && /not allowed for existing/i.test(bad.message)
  );
}

{
  const good = parseSeoAiRequest(
    baseExistingRequest({
      requestedFields: [...PRODUCT_AI_EXISTING_EDITABLE_FIELDS],
    })
  );
  ok(
    "E_seo_copy_fields_allowed",
    good.ok === true &&
      good.request.requestedFields.length ===
        PRODUCT_AI_EXISTING_EDITABLE_FIELDS.length
  );
}

{
  const req = parseSeoAiRequest(baseExistingRequest());
  const ctx = buildProductFieldsDraftContext(req.request, fixtureDbRow);
  ok(
    "E_db_truth_preferred_over_spoof",
    ctx.authoritative.canonicalName === "Saved Product Name" &&
      ctx.authoritative.slug === "saved-product-slug" &&
      ctx.authoritative.priceGbp === 49.99 &&
      ctx.authoritative.stockLabel === "Digital" &&
      ctx.authoritative.active === true &&
      ctx.authoritative.category === "Subscription" &&
      ctx.authoritative.imageUrl === "https://cdn.example/product.jpg" &&
      ctx.authoritative.ogImageUrl === "https://cdn.example/og.jpg" &&
      ctx.currentEditorCopy.seo_title === "Editor SEO draft"
  );
}

{
  const merged = mergeProductAuthoritativeWithDb(
    {
      productKind: "physical",
      canonicalName: "Client",
      priceGbp: 1,
      stockLabel: "X",
      active: false,
      slug: "client-slug",
    },
    fixtureDbRow
  );
  ok(
    "E_merge_helper_db_wins",
    merged.canonicalName === "Saved Product Name" &&
      merged.slug === "saved-product-slug" &&
      merged.priceGbp === 49.99 &&
      merged.productKind === "physical"
  );
}

// --- OUTPUT VALIDATION ---
{
  const parsed = validateProductFieldsDraft(
    {
      suggestions: {
        seo_title: {
          unavailable: false,
          value: "Good Title | Firestick4UK",
          reason: "Fits SERP",
        },
      },
    },
    ["seo_title"]
  );
  ok(
    "O_valid_single_field",
    parsed.ok === true &&
      parsed.suggestions.seo_title.value === "Good Title | Firestick4UK"
  );
}

{
  const parsed = validateProductFieldsDraft(
    {
      suggestions: {
        seo_title: {
          unavailable: false,
          value: "Title",
          reason: "",
        },
        price: {
          unavailable: false,
          value: "9.99",
          reason: "nope",
        },
      },
    },
    ["seo_title"]
  );
  ok(
    "O_unexpected_keys_rejected",
    parsed.ok === false && parsed.code === "malformed_provider_output"
  );
}

{
  const longTitle = "X".repeat(PRODUCT_TITLE_MAX + 1);
  const parsed = validateProductFieldsDraft(
    {
      suggestions: {
        seo_title: {
          unavailable: false,
          value: longTitle,
          reason: "too long",
        },
      },
    },
    ["seo_title"]
  );
  ok("O_max_length_enforced", parsed.ok === false);
}

{
  const parsed = validateProductFieldsDraft(
    {
      suggestions: {
        short_description: {
          unavailable: false,
          value: "<img src=x onerror=alert(1)>",
          reason: "bad",
        },
      },
    },
    ["short_description"]
  );
  ok("O_html_result_rejected", parsed.ok === false);
}

{
  const parsed = validateProductFieldsDraft(
    {
      suggestions: {
        features: {
          unavailable: true,
          value: "",
          reason: "Insufficient confirmed features to draft safely.",
        },
      },
    },
    ["features"]
  );
  ok(
    "O_unavailable_omitted_not_invented",
    parsed.ok === true && parsed.suggestions.features === undefined
  );
}

{
  const parsed = parseProductFieldsJsonText("not-json", ["seo_title"]);
  ok(
    "O_malformed_provider_output_rejected",
    parsed.ok === false && parsed.code === "malformed_provider_output"
  );
}

{
  const slugParsed = validateProductFieldsDraft(
    {
      suggestions: {
        slug: {
          unavailable: false,
          value: "My Cool Product!!",
          reason: "normalized",
        },
      },
    },
    ["slug"]
  );
  ok(
    "O_slug_normalized",
    slugParsed.ok === true &&
      slugParsed.suggestions.slug.value === "my-cool-product"
  );
}

{
  ok(
    "O_field_max_aligned_with_seo",
    PRODUCT_AI_FIELD_MAX.seo_title === PRODUCT_TITLE_MAX &&
      PRODUCT_AI_FIELD_MAX.meta_description === META_DESC_MAX
  );
}

{
  const schema = buildProductFieldsJsonSchema(["seo_title", "features"]);
  ok(
    "O_schema_only_requested_fields",
    schema.properties.suggestions.required.length === 2 &&
      !!schema.properties.suggestions.properties.seo_title &&
      !!schema.properties.suggestions.properties.features &&
      !schema.properties.suggestions.properties.name
  );
}

// --- PROVIDER ISOLATION ---
{
  const prevOpen = process.env.OPENAI_API_KEY;
  const prevOpenModel = process.env.OPENAI_SEO_MODEL;
  const prevGem = process.env.GEMINI_API_KEY;
  const prevGemModel = process.env.GEMINI_SEO_MODEL;
  process.env.OPENAI_API_KEY = "test-openai-key";
  process.env.OPENAI_SEO_MODEL = "gpt-test";
  delete process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_SEO_MODEL;

  openaiCreateCalls.length = 0;
  geminiFetchCalls.length = 0;
  OpenAIStub.mockImpl = null;

  const req = parseSeoAiRequest(baseNewRequest({ provider: "openai" }));
  const ctx = buildProductFieldsDraftContext(req.request, null);
  return dispatchProductFieldsDraft("openai", ctx).then(async (result) => {
    ok(
      "P_openai_only",
      result.ok === true &&
        openaiCreateCalls.length === 1 &&
        geminiFetchCalls.length === 0
    );

    process.env.GEMINI_API_KEY = "test-gemini-key";
    process.env.GEMINI_SEO_MODEL = "gemini-test";
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_SEO_MODEL;
    openaiCreateCalls.length = 0;
    geminiFetchCalls.length = 0;

    const gemReq = parseSeoAiRequest(baseNewRequest({ provider: "gemini" }));
    const gemCtx = buildProductFieldsDraftContext(gemReq.request, null);
    const gemResult = await dispatchProductFieldsDraft("gemini", gemCtx);
    ok(
      "P_gemini_only",
      gemResult.ok === true &&
        geminiFetchCalls.length === 1 &&
        openaiCreateCalls.length === 0
    );

    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_SEO_MODEL;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_SEO_MODEL;
    const missing = getProviderEnvConfig("openai");
    const missingCall = await callOpenAiProductFields(ctx);
    ok(
      "P_missing_env_provider_not_configured",
      missing.configured === false &&
        missingCall.ok === false &&
        missingCall.code === "provider_not_configured"
    );

    const gemMissing = await callGeminiProductFields(ctx);
    ok(
      "P_gemini_missing_env",
      gemMissing.ok === false && gemMissing.code === "provider_not_configured"
    );

    // restore
    if (prevOpen === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = prevOpen;
    if (prevOpenModel === undefined) delete process.env.OPENAI_SEO_MODEL;
    else process.env.OPENAI_SEO_MODEL = prevOpenModel;
    if (prevGem === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = prevGem;
    if (prevGemModel === undefined) delete process.env.GEMINI_SEO_MODEL;
    else process.env.GEMINI_SEO_MODEL = prevGemModel;

    // --- PROMPT GUARDS ---
    {
      const digitalCtx = buildProductFieldsDraftContext(
        parseSeoAiRequest(
          baseNewRequest({ productKind: "digital_subscription" })
        ).request,
        null
      );
      const physCtx = buildProductFieldsDraftContext(
        parseSeoAiRequest(
          baseNewRequest({
            productKind: "physical",
            authoritative: {
              productKind: "physical",
              canonicalName: "Fire Stick Device",
              category: "Device",
            },
          })
        ).request,
        null
      );
      const unkCtx = buildProductFieldsDraftContext(
        parseSeoAiRequest(
          baseNewRequest({
            productKind: "unknown",
            authoritative: {
              productKind: "unknown",
              canonicalName: "Bundle Pack",
              category: "Bundle",
            },
          })
        ).request,
        null
      );
      const d = buildProductFieldsSystemInstruction(digitalCtx);
      const p = buildProductFieldsSystemInstruction(physCtx);
      const u = buildProductFieldsSystemInstruction(unkCtx);
      ok(
        "G_digital_guards",
        /channel counts/i.test(d) &&
          /do not invent missing business facts/i.test(d) &&
          /Firestick4UK CMS/i.test(d)
      );
      ok(
        "G_physical_guards",
        /dimensions/i.test(p) && /shipping times/i.test(p)
      );
      ok("G_unknown_conservative", /unknown/i.test(u) && /conservative/i.test(u));
    }

    // --- RBAC ---
    {
      ok(
        "RBAC_products_manage_required_source",
        /draft_product_fields/.test(apiSrc) &&
          /products\.manage/.test(apiSrc) &&
          apiSrc.indexOf('task === "draft_product_fields"') > 0 &&
          apiSrc.indexOf('hasAdminPermission(role, "products.manage")') >
            apiSrc.indexOf('task === "draft_product_fields"')
      );
      ok(
        "RBAC_writer_cannot_manage_products",
        hasAdminPermission("writer", "products.manage") === false &&
          hasAdminPermission("manager", "products.manage") === true &&
          hasAdminPermission("super_admin", "products.manage") === true
      );
      ok(
        "RBAC_products_view_insufficient_for_draft",
        hasAdminPermission("writer", "products.view") === false
      );
    }

    // --- NO-WRITE INVARIANT ---
    {
      dbQueryCalls.length = 0;
      const row = await loadProductFieldsAuthorityRow(42);
      ok(
        "NW_load_select_only",
        row &&
          row.id === 42 &&
          dbQueryCalls.length === 1 &&
          /^\s*SELECT\b/i.test(dbQueryCalls[0].sql) &&
          !/\b(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(dbQueryCalls[0].sql)
      );
      ok(
        "NW_server_source_no_write_in_product_fields_path",
        /loadProductFieldsAuthorityRow/.test(seoAiServerSrc) &&
          /SELECT id, name, slug, category, price, stock, active/.test(
            seoAiServerSrc
          ) &&
          !/INSERT INTO products/.test(seoAiServerSrc) &&
          !/UPDATE products SET/.test(seoAiServerSrc) &&
          !/recordAdminAudit/.test(seoAiServerSrc) &&
          !/recordContentRevision/.test(seoAiServerSrc) &&
          !/invalidateSitemapCache/.test(seoAiServerSrc)
      );
      ok(
        "NW_api_no_cms_write_imports",
        !/admin-products/.test(apiSrc) &&
          !/recordAdminAudit/.test(apiSrc) &&
          !/recordContentRevision/.test(apiSrc) &&
          !/invalidateSitemapCache/.test(apiSrc)
      );
      ok(
        "NW_no_placeholder_insert_for_unsaved",
        !/placeholder/i.test(seoAiSrc) ||
          !/INSERT[\s\S]{0,80}products/.test(seoAiServerSrc)
      );
    }

    // --- BACKWARD COMPAT ---
    {
      const explain = parseSeoAiRequest({
        provider: "gemini",
        task: "explain_issue",
        issueId: "product:1:missing_seo_title",
      });
      const draft = parseSeoAiRequest({
        provider: "openai",
        task: "draft_metadata",
        entityType: "product",
        entityId: "9",
      });
      ok(
        "BC_explain_issue_intact",
        explain.ok === true && explain.request.task === "explain_issue"
      );
      ok(
        "BC_draft_metadata_intact",
        draft.ok === true && draft.request.task === "draft_metadata"
      );
    }

    // --- SOURCE CONTRACT ---
    {
      ok(
        "SRC_task_exported",
        /draft_product_fields/.test(seoAiSrc) &&
          /PRODUCT_AI_NEW_EDITABLE_FIELDS/.test(seoAiSrc) &&
          /PRODUCT_AI_EXISTING_EDITABLE_FIELDS/.test(seoAiSrc) &&
          !PRODUCT_AI_EXISTING_EDITABLE_FIELDS.includes("name") &&
          !PRODUCT_AI_EXISTING_EDITABLE_FIELDS.includes("slug") &&
          !PRODUCT_AI_NEW_EDITABLE_FIELDS.includes("badge")
      );
      ok(
        "SRC_dispatch_no_fallback",
        /dispatchProductFieldsDraft/.test(seoAiServerSrc) &&
          /Exactly one provider call for product field drafting/.test(
            seoAiServerSrc
          ) &&
          !/callOpenAiProductFields[\s\S]{0,200}callGeminiProductFields/.test(
            seoAiServerSrc.replace(
              /export async function dispatchProductFieldsDraft[\s\S]*$/,
              ""
            )
          )
      );
    }

    console.log(`\nPAI-2 result: ${passed} passed, ${failed} failed\n`);
    if (failed > 0) process.exit(1);
  });
}
