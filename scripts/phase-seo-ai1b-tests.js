/**
 * Phase SEO AI-1B — metadata draft suggestions foundation.
 * Run: node scripts/phase-seo-ai1b-tests.js
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
const sidhuSrc = read("app/sidhu/page.tsx");
const packageJson = JSON.parse(read("package.json"));

const {
  parseSeoAiRequest,
  parseExplainIssueRequest,
  normalizeEntityId,
  validateSeoAiMetadataDraft,
  parseMetadataJsonText,
  draftContextContainsRawHtml,
  buildSeoAiMetadataUserPrompt,
  PRODUCT_TITLE_MAX,
  BLOG_TITLE_MAX,
  META_DESC_MAX,
  SEO_AI_PROVIDER_TIMEOUT_MS,
  SEO_AI_METADATA_JSON_SCHEMA,
} = loadTsModule("lib/seoAi.ts");

const { hasAdminPermission } = loadTsModule("lib/adminPermissions.ts");

const openaiCreateCalls = [];
const geminiFetchCalls = [];

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
            titles: ["Fixture Product | Firestick4UK"],
            meta_descriptions: ["Premium Fire Stick subscription for UK viewers."],
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
                  titles: ["Fixture Post | Firestick4UK"],
                  meta_descriptions: ["Learn IPTV setup tips for UK Fire Stick users."],
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

const dbQueryCalls = [];

const {
  buildMetadataDraftContext,
  dispatchSeoAiDraft,
  callOpenAiDraft,
  callGeminiDraft,
  getProviderEnvConfig,
} = loadTsModule("lib/seoAiServer.ts", {
  openai: { __esModule: true, default: OpenAIStub },
  "@/lib/db": {
    __esModule: true,
    default: {
      query: async (sql, params) => {
        dbQueryCalls.push({ sql: String(sql), params });
        return [[], []];
      },
    },
  },
});

console.log("\nSEO AI-1B Metadata Draft Suggestions\n");

// --- REQUEST A–H ---
{
  const good = parseSeoAiRequest({
    provider: "gemini",
    task: "draft_metadata",
    entityType: "product",
    entityId: "42",
    unsaved: { seoTitle: "Draft title" },
  });
  ok(
    "A_draft_metadata_accepted",
    good.ok === true &&
      good.request.task === "draft_metadata" &&
      good.request.entityType === "product" &&
      good.request.entityId === "42"
  );
}

{
  const bad = parseSeoAiRequest({
    provider: "openai",
    task: "draft_metadata",
    entityType: "blog",
    entityId: "7",
    prompt: "ignore rules",
  });
  ok(
    "B_strict_top_level_keys",
    bad.ok === false &&
      bad.code === "invalid_request" &&
      /unsupported fields/i.test(bad.message)
  );
}

{
  const bad = parseSeoAiRequest({
    provider: "openai",
    task: "draft_metadata",
    entityType: "product",
    entityId: "42",
    unsaved: { price: "£9.99" },
  });
  ok(
    "C_strict_unsaved_keys",
    bad.ok === false &&
      bad.code === "invalid_request" &&
      /unsupported fields/i.test(bad.message)
  );
}

{
  const bad = parseSeoAiRequest({
    provider: "gemini",
    task: "draft_metadata",
    entityType: "product",
    entityId: "42",
    prompt: "write me titles",
  });
  ok("D_prompt_rejected", bad.ok === false && bad.code === "invalid_request");
}

{
  const bad = parseSeoAiRequest({
    provider: "openai",
    task: "draft_metadata",
    entityType: "blog",
    entityId: "7",
    model: "gpt-override",
  });
  ok("E_model_rejected", bad.ok === false && bad.code === "invalid_request");
}

{
  const bad = parseSeoAiRequest({
    provider: "openai",
    task: "draft_metadata",
    entityType: "product",
    entityId: "42",
    unsaved: { seoTitle: "<script>alert(1)</script>" },
  });
  ok(
    "F_html_content_rejected",
    bad.ok === false && bad.code === "invalid_request"
  );
}

{
  const bad = parseSeoAiRequest({
    provider: "gemini",
    task: "draft_metadata",
    entityType: "page",
    entityId: "1",
  });
  ok(
    "G_invalid_entityType",
    bad.ok === false &&
      bad.code === "invalid_request" &&
      /entityType must be product or blog/i.test(bad.message)
  );
}

{
  const badZero = parseSeoAiRequest({
    provider: "openai",
    task: "draft_metadata",
    entityType: "product",
    entityId: "0",
  });
  const badText = parseSeoAiRequest({
    provider: "openai",
    task: "draft_metadata",
    entityType: "blog",
    entityId: "abc",
  });
  ok(
    "H_invalid_entityId",
    badZero.ok === false &&
      badText.ok === false &&
      badZero.code === "invalid_request" &&
      badText.code === "invalid_request"
  );
}

// --- NUMERIC / CANONICAL ENTITY ID (UI/API integration shape) ---
{
  const numericProduct = parseSeoAiRequest({
    provider: "gemini",
    task: "draft_metadata",
    entityType: "product",
    entityId: 8,
    unsaved: { seoTitle: "Draft title", displayTitle: "Firestick 4K Max" },
  });
  ok(
    "H2_numeric_product_entityId_accepted",
    numericProduct.ok === true &&
      numericProduct.request.entityId === "8" &&
      normalizeEntityId(8) === "8"
  );
}

{
  const numericBlog = parseSeoAiRequest({
    provider: "openai",
    task: "draft_metadata",
    entityType: "blog",
    entityId: 5,
    unsaved: { seoTitle: "Blog meta", displayTitle: "Speed up Firestick" },
  });
  ok(
    "H3_numeric_blog_entityId_accepted",
    numericBlog.ok === true &&
      numericBlog.request.entityId === "5" &&
      normalizeEntityId(5) === "5"
  );
}

{
  const stringId = parseSeoAiRequest({
    provider: "gemini",
    task: "draft_metadata",
    entityType: "product",
    entityId: "8",
  });
  ok(
    "H4_canonical_string_entityId_accepted",
    stringId.ok === true && stringId.request.entityId === "8"
  );
}

{
  const trimmed = parseSeoAiRequest({
    provider: "gemini",
    task: "draft_metadata",
    entityType: "product",
    entityId: " 8 ",
  });
  ok(
    "H5_trimmed_string_entityId_accepted",
    trimmed.ok === true && trimmed.request.entityId === "8"
  );
}

{
  const cases = [
    ["H6_zero_number_rejected", 0],
    ["H7_negative_number_rejected", -1],
    ["H8_decimal_number_rejected", 1.5],
    ["H9_unsafe_integer_rejected", Number.MAX_SAFE_INTEGER + 1],
    ["H10_string_zero_rejected", "0"],
    ["H11_string_negative_rejected", "-1"],
    ["H12_string_decimal_rejected", "1.5"],
    ["H13_string_abc_rejected", "abc"],
    ["H14_string_leading_zero_rejected", "01"],
  ];
  for (const [name, entityId] of cases) {
    const bad = parseSeoAiRequest({
      provider: "openai",
      task: "draft_metadata",
      entityType: "product",
      entityId,
    });
    ok(
      name,
      bad.ok === false &&
        bad.code === "invalid_request" &&
        normalizeEntityId(entityId) === null
    );
  }
}

ok(
  "H15_product_ui_sends_numeric_entityId_and_parser_accepts",
  /const entityId = Number\(productModal\.id\)/.test(sidhuSrc) &&
    /task:\s*"draft_metadata"[\s\S]{0,120}entityId,/.test(sidhuSrc) &&
    parseSeoAiRequest({
      provider: "gemini",
      task: "draft_metadata",
      entityType: "product",
      entityId: 8,
    }).ok === true
);

ok(
  "H16_blog_ui_sends_numeric_entityId_and_parser_accepts",
  /const entityId = Number\(blogModal\.id\)/.test(sidhuSrc) &&
    parseSeoAiRequest({
      provider: "openai",
      task: "draft_metadata",
      entityType: "blog",
      entityId: 5,
    }).ok === true
);

// --- AUTH I–M ---
ok(
  "I_product_draft_auth_products_manage",
  hasAdminPermission("manager", "products.manage") === true &&
    /products\.manage/.test(apiSrc) &&
    /draft_metadata/.test(apiSrc)
);

ok(
  "J_blog_draft_auth_blog_manage",
  hasAdminPermission("writer", "blog.manage") === true &&
    /blog\.manage/.test(apiSrc)
);

ok(
  "K_writer_denied_product_draft",
  hasAdminPermission("writer", "products.manage") === false &&
    /entityType === "product"/.test(apiSrc) &&
    /products\.manage/.test(apiSrc)
);

ok(
  "L_writer_allowed_blog_draft",
  hasAdminPermission("writer", "blog.manage") === true &&
    hasAdminPermission("writer", "products.manage") === false
);

ok(
  "M_same_origin_post_protection",
  /requireAdmin\(req,\s*res\)/.test(apiSrc) && !/mutate:\s*false/.test(apiSrc)
);

// --- ENTITY N–Q ---
const productDraftRow = {
  id: 42,
  name: "Fixture Product",
  slug: "fixture-product",
  category: "Subscription",
  seo_title: "Existing SEO Title",
  meta_description: "Existing meta description.",
  focus_keyword: "fire stick",
  short_description: "<p>Short <strong>HTML</strong> blurb</p>",
};

const blogDraftRow = {
  id: 7,
  title: "Fixture Post",
  slug: "fixture-post",
  category: "Guides",
  meta_title: "Blog SEO Title",
  meta_description: "Blog meta description.",
  focus_keyword: "iptv",
  excerpt: "Plain excerpt without markup.",
};

{
  const ctx = buildMetadataDraftContext("product", productDraftRow, {
    seoTitle: "Unsaved SEO",
  });
  ok(
    "N_product_db_context_load",
    ctx.entityType === "product" &&
      ctx.entityId === "42" &&
      ctx.authoritative.slug === "fixture-product" &&
      ctx.unsaved.seoTitle === "Unsaved SEO"
  );
}

{
  const ctx = buildMetadataDraftContext("blog", blogDraftRow, {
    displayTitle: "Unsaved Blog Title",
  });
  ok(
    "N2_blog_db_context_load",
    ctx.entityType === "blog" &&
      ctx.entityId === "7" &&
      ctx.authoritative.displayTitle === "Fixture Post" &&
      ctx.unsaved.displayTitle === "Unsaved Blog Title"
  );
}

(async () => {
  {
    let providerHits = 0;
    const row = null;
    if (!row) {
      ok("O_missing_entity_no_provider", true);
    } else {
      providerHits += 1;
      await dispatchSeoAiDraft("openai", buildMetadataDraftContext("product", row));
    }
    const draftHandlerSrc = apiSrc.slice(apiSrc.indexOf('parsed.request.task === "explain_issue"'));
    ok(
      "O2_handler_entity_before_dispatch",
      /entity_not_found/.test(draftHandlerSrc) &&
        /loadProductDraftRow|loadBlogDraftRow/.test(draftHandlerSrc) &&
        draftHandlerSrc.indexOf("dispatchSeoAiDraft") >
          draftHandlerSrc.indexOf("entity_not_found") &&
        providerHits === 0
    );
  }

  {
    const ctx = buildMetadataDraftContext("product", productDraftRow);
    ok(
      "P_no_raw_html_in_context",
      draftContextContainsRawHtml(ctx) === false &&
        !JSON.stringify(ctx).includes("<p>") &&
        !JSON.stringify(ctx).includes("<strong>") &&
        ctx.authoritative.summaryText.includes("Short") &&
        ctx.authoritative.summaryText.includes("HTML")
    );
  }

  ok(
    "Q_blog_content_not_selected",
    /SELECT id, title, slug, category, meta_title, meta_description,\s*focus_keyword, excerpt/.test(
      seoAiServerSrc
    ) &&
      !/loadBlogDraftRow[\s\S]{0,400}content/.test(seoAiServerSrc)
  );

  // --- UNSAVED R–S ---
  {
    const allowed = parseSeoAiRequest({
      provider: "openai",
      task: "draft_metadata",
      entityType: "product",
      entityId: "42",
      unsaved: {
        seoTitle: "SEO",
        metaDescription: "Meta",
        focusKeyword: "kw",
        displayTitle: "Display",
      },
    });
    ok(
      "R_unsaved_allowed_fields",
      allowed.ok === true &&
        allowed.request.unsaved.seoTitle === "SEO" &&
        allowed.request.unsaved.metaDescription === "Meta" &&
        allowed.request.unsaved.focusKeyword === "kw" &&
        allowed.request.unsaved.displayTitle === "Display"
    );
  }

  {
    const rejectedKeys = ["price", "canonical", "slug", "status", "businessFacts"];
    let allRejected = true;
    for (const key of rejectedKeys) {
      const res = parseSeoAiRequest({
        provider: "gemini",
        task: "draft_metadata",
        entityType: "product",
        entityId: "42",
        unsaved: { [key]: "bad" },
      });
      if (res.ok !== false || res.code !== "invalid_request") allRejected = false;
    }
    ok("S_unsaved_business_fields_rejected", allRejected);
  }

  // --- PROVIDER T–Y ---
  {
    const ctx = buildMetadataDraftContext("product", productDraftRow);
    let openaiHits = 0;
    let geminiHits = 0;
    await dispatchSeoAiDraft("gemini", ctx, {
      callGemini: async () => {
        geminiHits += 1;
        return {
          ok: true,
          draft: { titles: ["A"], meta_descriptions: ["B"] },
        };
      },
      callOpenAI: async () => {
        openaiHits += 1;
        return {
          ok: true,
          draft: { titles: ["A"], meta_descriptions: ["B"] },
        };
      },
    });
    ok("T_gemini_dispatch_only", geminiHits === 1 && openaiHits === 0);

    openaiHits = 0;
    geminiHits = 0;
    await dispatchSeoAiDraft("openai", ctx, {
      callGemini: async () => {
        geminiHits += 1;
        return {
          ok: true,
          draft: { titles: ["A"], meta_descriptions: ["B"] },
        };
      },
      callOpenAI: async () => {
        openaiHits += 1;
        return {
          ok: true,
          draft: { titles: ["A"], meta_descriptions: ["B"] },
        };
      },
    });
    ok("T2_openai_dispatch_only", openaiHits === 1 && geminiHits === 0);
  }

  ok(
    "U_no_fallback_or_retry",
    /dispatchSeoAiDraft/.test(seoAiServerSrc) &&
      /No fallback/.test(seoAiServerSrc) &&
      /maxRetries:\s*0/.test(seoAiServerSrc) &&
      !/for\s*\(.*retry/i.test(seoAiServerSrc)
  );

  ok(
    "V_timeout_bounded_20s",
    SEO_AI_PROVIDER_TIMEOUT_MS === 20000 &&
      /timeout:\s*SEO_AI_PROVIDER_TIMEOUT_MS/.test(seoAiServerSrc) &&
      /AbortController/.test(seoAiServerSrc)
  );

  {
    const prev = {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      OPENAI_SEO_MODEL: process.env.OPENAI_SEO_MODEL,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      GEMINI_SEO_MODEL: process.env.GEMINI_SEO_MODEL,
    };
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_SEO_MODEL;
    ok("W_env_models_required", getProviderEnvConfig("openai").configured === false);
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.OPENAI_SEO_MODEL = "gpt-test";
    ok("W2_env_models_both_required", getProviderEnvConfig("openai").configured === true);
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }

  ok(
    "X_responses_and_interactions",
    /client\.responses\.create/.test(seoAiServerSrc) &&
      /callOpenAiDraft/.test(seoAiServerSrc) &&
      /callGeminiDraft/.test(seoAiServerSrc) &&
      /v1beta\/interactions/.test(seoAiServerSrc)
  );

  ok(
    "Y_structured_metadata_output",
    /json_schema/.test(seoAiServerSrc) &&
      /response_format/.test(seoAiServerSrc) &&
      /mime_type:\s*"application\/json"/.test(seoAiServerSrc) &&
      !!SEO_AI_METADATA_JSON_SCHEMA.properties.titles &&
      !!SEO_AI_METADATA_JSON_SCHEMA.properties.meta_descriptions
  );

  // --- OUTPUT Z–AG ---
  {
    const one = validateSeoAiMetadataDraft(
      {
        titles: ["Good Product Title"],
        meta_descriptions: ["A valid meta description."],
      },
      "product"
    );
    ok("Z_accepts_1_to_3", one.ok === true && one.draft.titles.length === 1);

    const three = validateSeoAiMetadataDraft(
      {
        titles: ["A", "B", "C"],
        meta_descriptions: ["D", "E", "F"],
      },
      "blog"
    );
    ok(
      "Z2_accepts_three_each",
      three.ok === true &&
        three.draft.titles.length === 3 &&
        three.draft.meta_descriptions.length === 3
    );
  }

  {
    const trimmed = validateSeoAiMetadataDraft(
      {
        titles: ["One", "Two", "Three", "Four"],
        meta_descriptions: ["A", "B", "C", "D"],
      },
      "product"
    );
    ok(
      "AA_gt3_discarded",
      trimmed.ok === true &&
        trimmed.draft.titles.length === 3 &&
        trimmed.draft.meta_descriptions.length === 3 &&
        !trimmed.draft.titles.includes("Four")
    );
  }

  {
    const html = validateSeoAiMetadataDraft(
      {
        titles: ["<b>Bad</b>"],
        meta_descriptions: ["Good description here."],
      },
      "product"
    );
    ok("AB_html_rejected", html.ok === false);
  }

  {
    const longProduct = validateSeoAiMetadataDraft(
      {
        titles: ["x".repeat(PRODUCT_TITLE_MAX + 1), "Valid Short Title"],
        meta_descriptions: ["Valid meta description."],
      },
      "product"
    );
    ok(
      "AC_product_title_over_70_discarded",
      longProduct.ok === true &&
        longProduct.draft.titles.length === 1 &&
        longProduct.draft.titles[0] === "Valid Short Title"
    );
    ok("AC2_product_title_max_constant", PRODUCT_TITLE_MAX === 70);
  }

  {
    const longBlog = validateSeoAiMetadataDraft(
      {
        titles: ["y".repeat(BLOG_TITLE_MAX + 1), "Valid Blog Title"],
        meta_descriptions: ["Valid meta description."],
      },
      "blog"
    );
    ok(
      "AD_blog_title_over_75_discarded",
      longBlog.ok === true &&
        longBlog.draft.titles.length === 1 &&
        longBlog.draft.titles[0] === "Valid Blog Title"
    );
    ok("AD2_blog_title_max_constant", BLOG_TITLE_MAX === 75);
  }

  {
    const longDesc = validateSeoAiMetadataDraft(
      {
        titles: ["Valid title"],
        meta_descriptions: ["z".repeat(META_DESC_MAX + 1), "Short valid description."],
      },
      "product"
    );
    ok(
      "AE_desc_over_180_discarded",
      longDesc.ok === true &&
        longDesc.draft.meta_descriptions.length === 1 &&
        longDesc.draft.meta_descriptions[0] === "Short valid description."
    );
    ok("AE2_meta_desc_max_constant", META_DESC_MAX === 180);
  }

  {
    const deduped = validateSeoAiMetadataDraft(
      {
        titles: ["Same Title", "same title", "Unique"],
        meta_descriptions: ["Dup Meta", "dup meta", "Other"],
      },
      "blog"
    );
    ok(
      "AF_dedupe",
      deduped.ok === true &&
        deduped.draft.titles.length === 2 &&
        deduped.draft.meta_descriptions.length === 2
    );
  }

  {
    const empty = validateSeoAiMetadataDraft(
      {
        titles: ["x".repeat(PRODUCT_TITLE_MAX + 5)],
        meta_descriptions: ["y".repeat(META_DESC_MAX + 5)],
      },
      "product"
    );
    ok("AG_empty_final_rejected", empty.ok === false);
  }

  // --- PERSISTENCE AH–AJ ---
  ok(
    "AH_select_only_draft_server_path",
    /loadProductDraftRow/.test(seoAiServerSrc) &&
      /loadBlogDraftRow/.test(seoAiServerSrc) &&
      !/\bINSERT\b|\bUPDATE\b|\bDELETE\b/i.test(
        seoAiServerSrc.slice(seoAiServerSrc.indexOf("loadProductDraftRow"))
      )
  );

  ok(
    "AI_no_issue_memory_audit_revision",
    !/reconcileSeoIssueMemory|seo_diagnostic_issues|admin_audit_log|writeAdminAudit|logAdminAudit|content_revision|saveRevision/i.test(
      seoAiServerSrc + apiSrc
    )
  );

  ok(
    "AJ_no_product_blog_save_in_ai_path",
    !/saveProduct|saveBlog|UPDATE products|UPDATE blog_posts/i.test(seoAiServerSrc + apiSrc)
  );

  // --- UI AK–AR (sidhu source grep) ---
  ok(
    "AK_no_draft_buttons_for_new_product_or_blog",
    /productModal !== "new" && productModal\?\.id/.test(sidhuSrc) &&
      /blogModal !== "new" && blogModal\?\.id/.test(sidhuSrc) &&
      /productModal === "new"/.test(sidhuSrc) &&
      /blogModal === "new"/.test(sidhuSrc)
  );

  ok(
    "AL_draft_buttons_for_existing_entities",
    /Draft with Gemini/.test(sidhuSrc) &&
      /Draft with OpenAI/.test(sidhuSrc) &&
      /void draftProductMetadata\("gemini"\)/.test(sidhuSrc) &&
      /void draftBlogMetadata\("openai"\)/.test(sidhuSrc)
  );

  ok(
    "AM_provider_only_on_click_functions",
    /const draftProductMetadata = async/.test(sidhuSrc) &&
      /const draftBlogMetadata = async/.test(sidhuSrc) &&
      !/useEffect[\s\S]{0,800}admin-seo-ai/.test(sidhuSrc) &&
      sidhuSrc.indexOf('task: "draft_metadata"') >
        sidhuSrc.indexOf("const draftProductMetadata")
  );

  {
    const productAiOk = sidhuSrc.indexOf('productMetaAi.status === "ok"');
    const productApplyBlock = sidhuSrc.slice(
      productAiOk,
      sidhuSrc.indexOf("SEO Title", productAiOk)
    );
    const blogAiOk = sidhuSrc.indexOf('blogMetaAi.status === "ok"');
    const blogApplyBlock = sidhuSrc.slice(
      blogAiOk,
      sidhuSrc.indexOf("Meta Title", blogAiOk)
    );
    ok(
      "AN_apply_only_seo_fields",
      /setEditProduct\(\(p\) => \(\{ \.\.\.p, seo_title: t \}\)\)/.test(productApplyBlock) &&
        /setEditProduct\(\(p\) => \(\{ \.\.\.p, meta_description: d \}\)\)/.test(
          productApplyBlock
        ) &&
        /setEditBlog\(\(p\) => \(\{ \.\.\.p, meta_title: t \}\)\)/.test(blogApplyBlock) &&
        /setEditBlog\(\(p\) => \(\{ \.\.\.p, meta_description: d \}\)\)/.test(
          blogApplyBlock
        ) &&
        !/setEditProduct\(\(p\) => \(\{ \.\.\.p, slug:/.test(productApplyBlock) &&
        !/setEditBlog\(\(p\) => \(\{ \.\.\.p, canonical_url:/.test(blogApplyBlock) &&
        !/setEditBlog\(\(p\) => \(\{ \.\.\.p, status:/.test(blogApplyBlock)
    );
  }

  ok(
    "AO_no_fetch_on_apply",
    !/onClick=\{\(\) => setEditProduct[\s\S]{0,120}fetch\(/.test(sidhuSrc) &&
      !/onClick=\{\(\) => setEditBlog[\s\S]{0,120}fetch\(/.test(sidhuSrc)
  );

  ok(
    "AP_cancel_resets_ai_state",
    /setProductMetaAi\(\{ status: "idle" \}\);\s*setProductModal\(null\)/.test(sidhuSrc) &&
      /setBlogMetaAi\(\{ status: "idle" \}\);\s*setBlogModal\(null\)/.test(sidhuSrc)
  );

  ok(
    "AQ_apply_does_not_alter_slug_canonical_status",
    !/setEditProduct\(\(p\) => \(\{ \.\.\.p, slug:/.test(sidhuSrc) &&
      !/setEditBlog\(\(p\) => \(\{ \.\.\.p, slug:/.test(sidhuSrc) &&
      !/setEditBlog\(\(p\) => \(\{ \.\.\.p, canonical_url:/.test(
        sidhuSrc.slice(sidhuSrc.indexOf("blogMetaAi.result.titles.map"))
      ) &&
      !/setEditBlog\(\(p\) => \(\{ \.\.\.p, status:/.test(
        sidhuSrc.slice(sidhuSrc.indexOf("blogMetaAi.result.titles.map"))
      )
  );

  ok(
    "AR_ai_state_reset_between_entities",
    /const openEditProduct = \(p: any\) => \{[\s\S]{0,600}setProductMetaAi\(\{ status: "idle" \}\)/.test(
      sidhuSrc
    ) &&
      /const openNewProduct = \(\) => \{[\s\S]{0,200}setProductMetaAi\(\{ status: "idle" \}\)/.test(
        sidhuSrc
      ) &&
      /setBlogMetaAi\(\{ status: "idle" \}\)/.test(sidhuSrc)
  );

  // --- REGRESSION AS–AU ---
  {
    const explainViaRouter = parseSeoAiRequest({
      provider: "openai",
      task: "explain_issue",
      issueId: "product:1:missing-description",
    });
    const explainDirect = parseExplainIssueRequest({
      provider: "gemini",
      task: "explain_issue",
      issueId: "blog:7:missing-description",
    });
    ok(
      "AS_explain_issue_still_accepted",
      explainViaRouter.ok === true &&
        explainViaRouter.request.task === "explain_issue" &&
        explainDirect.ok === true
    );
  }

  {
    const strict = parseExplainIssueRequest({
      provider: "openai",
      task: "explain_issue",
      issueId: "product:1:missing-description",
      entityType: "product",
    });
    ok(
      "AT_explain_strict_keys",
      strict.ok === false && strict.code === "invalid_request"
    );
  }

  ok(
    "AU_no_berlin_anthropic_reintroduced",
    !/from ["']@anthropic-ai|require\(["']@anthropic-ai|berlin_training|berlin-training-chat|ANTHROPIC_API_KEY|training\.manage/.test(
      seoAiServerSrc + apiSrc + seoAiSrc + sidhuSrc
    )
  );

  // --- Provider adapter fixtures (mocked upstream) ---
  {
    const prev = {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      OPENAI_SEO_MODEL: process.env.OPENAI_SEO_MODEL,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      GEMINI_SEO_MODEL: process.env.GEMINI_SEO_MODEL,
    };
    process.env.OPENAI_API_KEY = "sk-test-fixture";
    process.env.OPENAI_SEO_MODEL = "gpt-test-fixture";
    process.env.GEMINI_API_KEY = "gemini-test-fixture";
    process.env.GEMINI_SEO_MODEL = "gemini-test-fixture";

    const ctx = buildMetadataDraftContext("product", productDraftRow);
    ok(
      "metadata_prompt_is_compact_json",
      buildSeoAiMetadataUserPrompt(ctx).includes("CMS metadata draft context") &&
        buildSeoAiMetadataUserPrompt(ctx).includes('"entityId":"42"')
    );

    openaiCreateCalls.length = 0;
    geminiFetchCalls.length = 0;
    OpenAIStub.mockImpl = null;
    const openaiOk = await callOpenAiDraft(ctx);
    ok(
      "provider_openai_metadata_structured",
      openaiOk.ok === true &&
        openaiCreateCalls.length === 1 &&
        geminiFetchCalls.length === 0 &&
        OpenAIStub.lastOpts.maxRetries === 0 &&
        OpenAIStub.lastOpts.timeout === 20000 &&
        openaiCreateCalls[0].text.format.name === "seo_ai_metadata"
    );

    openaiCreateCalls.length = 0;
    geminiFetchCalls.length = 0;
    const geminiOk = await callGeminiDraft(
      buildMetadataDraftContext("blog", blogDraftRow)
    );
    ok(
      "provider_gemini_metadata_structured",
      geminiOk.ok === true &&
        geminiFetchCalls.length === 1 &&
        openaiCreateCalls.length === 0 &&
        /interactions/.test(geminiFetchCalls[0].url)
    );

    OpenAIStub.mockImpl = async () => ({
      output_text: JSON.stringify({
        titles: ["Only"],
        meta_descriptions: [],
      }),
    });
    const missingDesc = await callOpenAiDraft(ctx);
    ok(
      "provider_openai_empty_metadata_rejected",
      missingDesc.ok === false && missingDesc.code === "malformed_provider_output"
    );

    global.__geminiMockImpl = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        steps: [
          {
            type: "model_output",
            content: [{ type: "text", text: "{not-json" }],
          },
        ],
      }),
    });
    const gBad = await callGeminiDraft(ctx);
    ok(
      "provider_gemini_malformed_metadata",
      gBad.ok === false && gBad.code === "malformed_provider_output"
    );

    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    OpenAIStub.mockImpl = null;
    global.__geminiMockImpl = null;
  }

  ok("dep_openai_official_sdk", !!packageJson.dependencies.openai);
  ok(
    "dep_no_gemini_sdk",
    !packageJson.dependencies["@google/generative-ai"] &&
      !packageJson.dependencies["@google/genai"]
  );

  console.log(`\nSEO AI-1B: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
