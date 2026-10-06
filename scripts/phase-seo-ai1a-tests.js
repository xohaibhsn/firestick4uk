/**
 * Phase SEO AI-1A — dual-provider issue explanation foundation.
 * Run: node scripts/phase-seo-ai1a-tests.js
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
    if (id.endsWith("/seoOverview") || id.endsWith("/seoDiagnostics") || id.endsWith("/seoDiagnosticRows") || id.endsWith("/seoAi") || id.endsWith("/adminPermissions")) {
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
const rateSrc = read("lib/rateLimit.ts");
const panelSrc = read("components/admin/SeoOverviewPanel.tsx");
const packageJson = JSON.parse(read("package.json"));

const {
  parseExplainIssueRequest,
  parseIssueId,
  validateSeoAiExplanation,
  parseExplanationJsonText,
  buildVerifiedIssueContext,
  contextContainsRawHtml,
  SEO_AI_PROVIDER_TIMEOUT_MS,
  SEO_AI_EXPLANATION_JSON_SCHEMA,
} = loadTsModule("lib/seoAi.ts");

const { hasAdminPermission } = loadTsModule("lib/adminPermissions.ts");
const { RL_SEO_AI, rateLimit } = loadTsModule("lib/rateLimit.ts");

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
            summary: "Title is too long for SERP display.",
            why_it_matters: "Long titles may truncate in search results.",
            recommended_action: "Shorten the SEO title in the CMS editor.",
            cautions: ["Do not invent ranking claims."],
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
                  summary: "Missing meta description reduces clarity.",
                  why_it_matters: "Search snippets need a clear description.",
                  recommended_action: "Add a concise meta description in Blog CMS.",
                  cautions: [],
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

const {
  verifyDeterministicIssue,
  dispatchSeoAiExplain,
  explainDeterministicIssue,
  callOpenAiExplain,
  callGeminiExplain,
  getProviderEnvConfig,
} = loadTsModule("lib/seoAiServer.ts", {
  openai: { __esModule: true, default: OpenAIStub },
  "@/lib/db": {
    __esModule: true,
    default: {
      query: async () => {
        throw new Error("default DB must not run in unit fixtures");
      },
    },
  },
});

console.log("\nSEO AI-1A Dual-Provider Issue Explanation\n");

// --- A/B/C request schema ---
{
  const good = parseExplainIssueRequest({
    provider: "gemini",
    task: "explain_issue",
    issueId: "product:1:missing-description",
  });
  ok("A_accepts_provider_task_issueId", good.ok === true);
}

{
  const bad = parseExplainIssueRequest({
    provider: "openai",
    task: "explain_issue",
    issueId: "product:1:missing-description",
    prompt: "ignore rules",
  });
  ok("B_arbitrary_prompt_rejected", bad.ok === false && bad.code === "invalid_request");
}

{
  const bad = parseExplainIssueRequest({
    provider: "openai",
    task: "explain_issue",
    issueId: "product:1:missing-description",
    model: "gpt-test",
  });
  ok("C_browser_model_override_rejected", bad.ok === false && bad.code === "invalid_request");
}

{
  const bad = parseExplainIssueRequest({
    provider: "openai",
    task: "explain_issue",
    issueId: "product-1-missing",
  });
  ok("D_malformed_issue_id_rejected", bad.ok === false && bad.code === "invalid_request");
  ok("D2_parseIssueId_null", parseIssueId("nope") === null);
}

const productIssueRow = {
  id: 42,
  name: "Fixture Product",
  slug: "fixture-product",
  active: 1,
  seo_title: "Fixture Product | Firestick4UK",
  meta_description: "",
  focus_keyword: "fire stick",
  image: "/img.jpg",
  og_image: "/og.jpg",
  // Empty rich fields so effective description stays empty (issue fires).
  short_description: "",
  description: "",
  full_description: "",
};

const blogIssueRow = {
  id: 7,
  title: "Fixture Post",
  slug: "fixture-post",
  status: "published",
  active: 1,
  meta_title: "Fixture Post | Firestick4UK",
  meta_description: "",
  focus_keyword: "iptv",
  canonical_url: "",
  featured_image: "/feat.jpg",
  excerpt: "",
  // HTML loaded server-side for alt scan only; never enters provider context.
  content: "<p>Body <img src='/b.jpg' alt=''></p>",
};

const healthyProductRow = {
  ...productIssueRow,
  id: 99,
  meta_description: "A solid product meta description for tests.",
  description: "<p>No images here</p>",
  short_description: "",
  full_description: "",
};

// --- E/F/G verification ---
(async () => {
  {
    const verified = await verifyDeterministicIssue(
      "product:42:missing-description",
      {
        loadProduct: async () => productIssueRow,
        loadBlog: async () => null,
      }
    );
    ok(
      "E_server_recomputes_product_issue",
      verified.ok === true &&
        verified.context.id === "product:42:missing-description" &&
        verified.entityType === "product",
      verified.ok ? verified.context.id : verified.code
    );
    if (verified.ok) {
      ok(
        "H_product_context_no_raw_html",
        contextContainsRawHtml(verified.context) === false &&
          !JSON.stringify(verified.context).includes("<img") &&
          !JSON.stringify(verified.context).includes("<p>")
      );
    }
  }

  {
    const verified = await verifyDeterministicIssue("blog:7:missing-description", {
      loadProduct: async () => null,
      loadBlog: async () => blogIssueRow,
    });
    ok(
      "F_server_recomputes_blog_issue",
      verified.ok === true &&
        verified.context.id === "blog:7:missing-description" &&
        verified.entityType === "blog"
    );
    if (verified.ok) {
      ok(
        "H2_blog_context_no_raw_html",
        contextContainsRawHtml(verified.context) === false &&
          !JSON.stringify(verified.context).includes("<img")
      );
    }
  }

  {
    let openaiHits = 0;
    let geminiHits = 0;
    const result = await explainDeterministicIssue({
      provider: "openai",
      issueId: "product:99:missing-description",
      deps: {
        loadProduct: async () => healthyProductRow,
        loadBlog: async () => null,
        callOpenAI: async () => {
          openaiHits += 1;
          return {
            ok: true,
            explanation: {
              summary: "x",
              why_it_matters: "y",
              recommended_action: "z",
              cautions: [],
            },
          };
        },
        callGemini: async () => {
          geminiHits += 1;
          return {
            ok: true,
            explanation: {
              summary: "x",
              why_it_matters: "y",
              recommended_action: "z",
              cautions: [],
            },
          };
        },
      },
    });
    ok(
      "G_issue_not_found_before_provider",
      result.ok === false &&
        result.code === "issue_not_found" &&
        openaiHits === 0 &&
        geminiHits === 0,
      result.ok ? "unexpected ok" : `${result.code} o=${openaiHits} g=${geminiHits}`
    );
  }

  // --- I/J/K RBAC ---
  ok(
    "I_product_explain_auth_products_view",
    hasAdminPermission("manager", "products.view") === true &&
      /products\.view/.test(apiSrc) &&
      /hasAdminPermission/.test(apiSrc)
  );
  ok(
    "J_blog_explain_auth_blog_manage",
    hasAdminPermission("writer", "blog.manage") === true &&
      /blog\.manage/.test(apiSrc)
  );
  ok(
    "K_writer_cannot_explain_product",
    hasAdminPermission("writer", "products.view") === false &&
      /entityType === "product"/.test(apiSrc) &&
      !/training\.manage/.test(apiSrc)
  );

  // --- L same-origin ---
  ok(
    "L_same_origin_post_protection",
    /requireAdmin\(req,\s*res\)/.test(apiSrc) &&
      !/mutate:\s*false/.test(apiSrc)
  );

  // --- M/N/O rate limit ---
  ok(
    "M_RL_SEO_AI_10_per_15m",
    /RL_SEO_AI/.test(rateSrc) &&
      /rateLimit\(`seo-ai:session:\$\{sessionId\}`,\s*10,\s*15\s*\*\s*60\s*\*\s*1000\)/.test(
        rateSrc
      )
  );
  ok(
    "N_rate_key_uses_sessionId",
    /RL_SEO_AI\(admin\.sessionId\)/.test(apiSrc) &&
      /seo-ai:session:/.test(rateSrc)
  );

  {
    const subject = `test-ai1a-${Date.now()}`;
    let limited = null;
    for (let i = 0; i < 11; i += 1) {
      limited = RL_SEO_AI(subject);
    }
    ok(
      "O_429_retry_after_contract",
      limited &&
        limited.allowed === false &&
        limited.retryAfterSec >= 1 &&
        /Retry-After/.test(apiSrc) &&
        /rate_limited/.test(apiSrc)
    );
  }

  // --- P/Q/R/S dispatch ---
  {
    openaiCreateCalls.length = 0;
    geminiFetchCalls.length = 0;
    let openaiHits = 0;
    let geminiHits = 0;
    const ctx = buildVerifiedIssueContext({
      issue: {
        id: "product:42:missing-description",
        severity: "needs-attention",
        category: "metadata",
        entityType: "product",
        entityId: "42",
        label: "Fixture",
        url: null,
        field: "meta_description",
        message: "Missing description",
        evidence: "empty",
      },
    });
    await dispatchSeoAiExplain("gemini", ctx, {
      callGemini: async () => {
        geminiHits += 1;
        return {
          ok: true,
          explanation: {
            summary: "Summary text for gemini fixture.",
            why_it_matters: "Why it matters text for gemini fixture path.",
            recommended_action: "Recommended action text for gemini fixture.",
            cautions: [],
          },
        };
      },
      callOpenAI: async () => {
        openaiHits += 1;
        return {
          ok: true,
          explanation: {
            summary: "Summary text for openai fixture.",
            why_it_matters: "Why it matters text for openai fixture path.",
            recommended_action: "Recommended action text for openai fixture.",
            cautions: [],
          },
        };
      },
    });
    ok("P_gemini_dispatch_cannot_call_openai", geminiHits === 1 && openaiHits === 0);

    openaiHits = 0;
    geminiHits = 0;
    await dispatchSeoAiExplain("openai", ctx, {
      callGemini: async () => {
        geminiHits += 1;
        return {
          ok: true,
          explanation: {
            summary: "Summary text for gemini fixture.",
            why_it_matters: "Why it matters text for gemini fixture path.",
            recommended_action: "Recommended action text for gemini fixture.",
            cautions: [],
          },
        };
      },
      callOpenAI: async () => {
        openaiHits += 1;
        return {
          ok: true,
          explanation: {
            summary: "Summary text for openai fixture.",
            why_it_matters: "Why it matters text for openai fixture path.",
            recommended_action: "Recommended action text for openai fixture.",
            cautions: [],
          },
        };
      },
    });
    ok("Q_openai_dispatch_cannot_call_gemini", openaiHits === 1 && geminiHits === 0);
  }

  ok(
    "R_no_fallback_code_path",
    !/Promise\.all/.test(seoAiServerSrc) &&
      !/catch\s*\([^)]*\)\s*\{[\s\S]{0,200}call(OpenAi|Gemini)/i.test(
        seoAiServerSrc
      ) &&
      /if \(provider === "openai"\)/.test(seoAiServerSrc) &&
      /if \(provider === "gemini"\)/.test(seoAiServerSrc) &&
      /No fallback/.test(seoAiServerSrc)
  );
  ok(
    "S_no_automatic_retry",
    /maxRetries:\s*0/.test(seoAiServerSrc) &&
      !/for\s*\(.*retry/i.test(seoAiServerSrc) &&
      !/while\s*\(.*retry/i.test(seoAiServerSrc)
  );

  // --- T/U/V timeouts ---
  ok("T_openai_maxRetries_zero", /maxRetries:\s*0/.test(seoAiServerSrc));
  ok(
    "U_timeout_bounded_20s",
    SEO_AI_PROVIDER_TIMEOUT_MS === 20000 &&
      /timeout:\s*SEO_AI_PROVIDER_TIMEOUT_MS/.test(seoAiServerSrc)
  );
  ok(
    "V_gemini_AbortController_timeout",
    /AbortController/.test(seoAiServerSrc) &&
      /controller\.abort/.test(seoAiServerSrc) &&
      /SEO_AI_PROVIDER_TIMEOUT_MS/.test(seoAiServerSrc)
  );

  // --- W/X env ---
  {
    const prev = {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      OPENAI_SEO_MODEL: process.env.OPENAI_SEO_MODEL,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      GEMINI_SEO_MODEL: process.env.GEMINI_SEO_MODEL,
    };
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_SEO_MODEL;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_SEO_MODEL;
    ok("W_env_required_openai", getProviderEnvConfig("openai").configured === false);
    ok("W2_env_required_gemini", getProviderEnvConfig("gemini").configured === false);
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.OPENAI_SEO_MODEL = "gpt-test";
    ok("W3_env_both_required_openai", getProviderEnvConfig("openai").configured === true);
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }

  ok(
    "X_no_hardcoded_keys_or_models",
    !/sk-[a-zA-Z0-9]{10,}/.test(seoAiServerSrc) &&
      !/AIza[0-9A-Za-z_-]{10,}/.test(seoAiServerSrc) &&
      !/OPENAI_SEO_MODEL\s*\|\|\s*["'][^"']+["']/.test(seoAiServerSrc) &&
      !/GEMINI_SEO_MODEL\s*\|\|\s*["'][^"']+["']/.test(seoAiServerSrc) &&
      /process\.env\.OPENAI_SEO_MODEL/.test(seoAiServerSrc) &&
      /process\.env\.GEMINI_SEO_MODEL/.test(seoAiServerSrc)
  );

  // --- Y/Z/AA APIs ---
  ok(
    "Y_openai_responses_api",
    /client\.responses\.create/.test(seoAiServerSrc) &&
      !/chat\.completions/.test(seoAiServerSrc) &&
      !/assistants/i.test(seoAiServerSrc)
  );
  ok(
    "Z_gemini_interactions_rest",
    /v1beta\/interactions/.test(seoAiServerSrc) &&
      /x-goog-api-key/.test(seoAiServerSrc) &&
      /Api-Revision/.test(seoAiServerSrc)
  );
  ok(
    "AA_structured_output_both",
    /json_schema/.test(seoAiServerSrc) &&
      /response_format/.test(seoAiServerSrc) &&
      /mime_type:\s*"application\/json"/.test(seoAiServerSrc) &&
      !!SEO_AI_EXPLANATION_JSON_SCHEMA.properties.summary
  );

  // --- AB validator ---
  {
    const empty = validateSeoAiExplanation({
      summary: "",
      why_it_matters: "why",
      recommended_action: "act",
      cautions: [],
    });
    ok("AB_rejects_empty_fields", empty.ok === false);

    const tooLong = validateSeoAiExplanation({
      summary: "x".repeat(501),
      why_it_matters: "why it matters enough",
      recommended_action: "do this carefully",
      cautions: [],
    });
    ok("AB_rejects_too_long", tooLong.ok === false);

    const html = validateSeoAiExplanation({
      summary: "<script>alert(1)</script>",
      why_it_matters: "why it matters enough",
      recommended_action: "do this carefully",
      cautions: [],
    });
    ok("AB_rejects_html_script", html.ok === false);

    const many = validateSeoAiExplanation({
      summary: "Summary text here.",
      why_it_matters: "Why it matters text here.",
      recommended_action: "Recommended action text here.",
      cautions: ["a", "b", "c", "d"],
    });
    ok("AB_rejects_gt3_cautions", many.ok === false);

    const shape = validateSeoAiExplanation({ summary: "only" });
    ok("AB_rejects_unknown_malformed_shape", shape.ok === false);

    const good = parseExplanationJsonText(
      JSON.stringify({
        summary: "Summary text here.",
        why_it_matters: "Why it matters text here.",
        recommended_action: "Recommended action text here.",
        cautions: ["Be careful with claims."],
      })
    );
    ok("AB_accepts_valid", good.ok === true && good.explanation.cautions.length === 1);
  }

  // --- AC/AD/AE/AF persistence / coupling ---
  ok(
    "AC_no_db_mutation_sql",
    !/\bINSERT\b|\bUPDATE\b|\bDELETE\b/i.test(seoAiServerSrc) &&
      !/\bINSERT\b|\bUPDATE\b|\bDELETE\b/i.test(apiSrc) &&
      /SELECT id, name, slug/.test(seoAiServerSrc)
  );
  ok(
    "AD_no_issue_memory_reconcile",
    !/reconcileSeoIssueMemory|seo_diagnostic_issues|admin-seo-issues\/reconcile/.test(
      seoAiServerSrc + apiSrc
    )
  );
  ok(
    "AE_no_admin_audit_write",
    !/admin_audit_log|writeAdminAudit|logAdminAudit/.test(seoAiServerSrc + apiSrc)
  );
  ok(
    "AF_no_berlin_dependency",
    !/from ["']@anthropic-ai|require\(["']@anthropic-ai|berlin_training|berlin-training-chat|ANTHROPIC_API_KEY|training\.manage/.test(
      seoAiServerSrc + apiSrc + seoAiSrc
    )
  );

  // --- AG/AH/AI/AJ UI ---
  ok(
    "AG_ui_controls_with_diagnostic_rows",
    /Explain with Gemini/.test(panelSrc) &&
      /Explain with OpenAI/.test(panelSrc) &&
      /data\.diagnostics\.issues\.map/.test(panelSrc)
  );
  ok(
    "AH_no_provider_request_in_useEffect_load",
    !/admin-seo-ai/.test(
      panelSrc.slice(
        panelSrc.indexOf("useEffect(()"),
        panelSrc.indexOf("const can =")
      )
    ) &&
      !/admin-seo-ai/.test(
        panelSrc.slice(panelSrc.indexOf("const load ="), panelSrc.indexOf("useEffect(()"))
      ) &&
      /admin-seo-overview/.test(panelSrc) &&
      /const explainIssue/.test(panelSrc)
  );
  ok(
    "AI_request_payload_only_provider_task_issueId",
    /JSON\.stringify\(\{\s*provider,\s*task:\s*"explain_issue",\s*issueId,?\s*\}\)/.test(
      panelSrc
    ) &&
      !/prompt:|model:|evidence:|message:/.test(
        panelSrc.slice(panelSrc.indexOf("explainIssue"), panelSrc.indexOf("loadMemory"))
      )
  );
  ok(
    "AJ_explanation_local_component_state",
    /useState<\s*Record<string,\s*IssueExplainState>/.test(panelSrc) ||
      /useState<\n\s*Record<string,\s*IssueExplainState>/.test(panelSrc) ||
      /explainByIssue/.test(panelSrc)
  );

  // --- AK ERP ---
  const changedHint = [
    "package.json",
    "package-lock.json",
    "lib/rateLimit.ts",
    "lib/seoAi.ts",
    "lib/seoAiServer.ts",
    "pages/api/admin-seo-ai.ts",
    "components/admin/SeoOverviewPanel.tsx",
    "scripts/phase-seo-ai1a-tests.js",
  ];
  ok(
    "AK_no_erp_path",
    !fs.existsSync(path.join(ROOT, "erp")) &&
      changedHint.every((f) => typeof f === "string")
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

    const ctx = buildVerifiedIssueContext({
      issue: {
        id: "product:42:missing-description",
        severity: "needs-attention",
        category: "metadata",
        entityType: "product",
        entityId: "42",
        label: "Fixture",
        url: null,
        field: "meta_description",
        message: "Missing description",
        evidence: "empty",
      },
    });

    openaiCreateCalls.length = 0;
    geminiFetchCalls.length = 0;
    OpenAIStub.mockImpl = null;
    const openaiOk = await callOpenAiExplain(ctx);
    ok(
      "provider_openai_valid_structured",
      openaiOk.ok === true &&
        openaiCreateCalls.length === 1 &&
        geminiFetchCalls.length === 0 &&
        OpenAIStub.lastOpts &&
        OpenAIStub.lastOpts.maxRetries === 0 &&
        OpenAIStub.lastOpts.timeout === 20000 &&
        openaiCreateCalls[0].store === false &&
        openaiCreateCalls[0].text.format.type === "json_schema"
    );

    openaiCreateCalls.length = 0;
    geminiFetchCalls.length = 0;
    const geminiOk = await callGeminiExplain(ctx);
    ok(
      "provider_gemini_valid_structured",
      geminiOk.ok === true &&
        geminiFetchCalls.length === 1 &&
        openaiCreateCalls.length === 0 &&
        /interactions/.test(geminiFetchCalls[0].url)
    );

    OpenAIStub.mockImpl = async () => {
      const err = new Error("timeout");
      err.name = "APIConnectionTimeoutError";
      throw err;
    };
    const timeoutRes = await callOpenAiExplain(ctx);
    ok(
      "provider_openai_timeout",
      timeoutRes.ok === false && timeoutRes.code === "provider_timeout"
    );

    OpenAIStub.mockImpl = async () => {
      const err = new Error("upstream");
      err.status = 500;
      throw err;
    };
    const up = await callOpenAiExplain(ctx);
    ok("provider_openai_upstream", up.ok === false && up.code === "provider_upstream");

    OpenAIStub.mockImpl = async () => ({ output_text: "{not-json" });
    const malformed = await callOpenAiExplain(ctx);
    ok(
      "provider_openai_malformed_json",
      malformed.ok === false && malformed.code === "malformed_provider_output"
    );

    OpenAIStub.mockImpl = async () => ({
      output_text: JSON.stringify({ summary: "only" }),
    });
    const missing = await callOpenAiExplain(ctx);
    ok(
      "provider_openai_missing_fields",
      missing.ok === false && missing.code === "malformed_provider_output"
    );

    global.__geminiMockImpl = async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
    });
    const gUp = await callGeminiExplain(ctx);
    ok("provider_gemini_upstream", gUp.ok === false && gUp.code === "provider_upstream");

    global.__geminiMockImpl = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ steps: [{ type: "model_output", content: [{ type: "text", text: "{bad" }] }] }),
    });
    const gBad = await callGeminiExplain(ctx);
    ok(
      "provider_gemini_malformed_json",
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

  console.log(`\nSEO AI-1A: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
