/**
 * AB-7B R1 — Isolated provider adapter tests.
 * Fakes/mocks only. No real provider, network, env secrets, DB, or Next server.
 */
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..");
let passed = 0;
let failed = 0;

function ok(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed += 1;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function withCapturedWarn(fn) {
  const lines = [];
  const original = console.warn;
  console.warn = (...args) => {
    lines.push(args.map(String).join(" "));
  };
  try {
    const result = await fn();
    return { result, lines };
  } finally {
    console.warn = original;
  }
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function stripCommentsAndStrings(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .replace(/(['"`])(?:\\.|(?!\1)[\s\S])*\1/g, '""');
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
      return loadTsModule("lib/" + id.slice("@/lib/".length) + ".ts", stubs);
    }
    if (id.startsWith("./") || id.startsWith("../")) {
      const base = path.resolve(path.dirname(path.join(ROOT, rel)), id);
      if (fs.existsSync(base + ".ts")) {
        return loadTsModule(
          path.relative(ROOT, base + ".ts").replace(/\\/g, "/"),
          stubs
        );
      }
    }
    return require(id);
  };
  const fn = new Function("exports", "module", "require", outputText);
  fn(sandbox.exports, sandbox.module, localRequire);
  return sandbox.module.exports && Object.keys(sandbox.module.exports).length
    ? sandbox.module.exports
    : sandbox.exports;
}

const commonSrc = read("lib/blogGroundedResearchProviderCommon.server.ts");
const openAiSrc = read("lib/blogGroundedResearchOpenAi.server.ts");
const seoAiSrc = read("lib/seoAi.ts");
const seoAiServerSrc = read("lib/seoAiServer.ts");
const adminRouteSrc = read("pages/api/admin-seo-ai.ts");

const evidence = loadTsModule("lib/blogResearchEvidence.ts");
const {
  MAX_BLOG_RESEARCH_GROUNDED_URLS,
  MAX_BLOG_RESEARCH_SEARCH_QUERIES,
  MAX_BLOG_RESEARCH_SUMMARY_CHARS,
  MAX_BLOG_RESEARCH_SOURCES,
} = evidence;

const common = loadTsModule("lib/blogGroundedResearchProviderCommon.server.ts");
const {
  buildBlogGroundedResearchSystemPrompt,
  buildBlogGroundedResearchUserPrompt,
  BLOG_GROUNDED_RESEARCH_PROVIDER_JSON_SCHEMA,
  BLOG_GROUNDED_RESEARCH_OPENAI_MAX_OUTPUT_TOKENS,
  parseBlogGroundedResearchProviderJsonEnvelope,
  extractOpenAiGroundedResearchGrounding,
  assertSerializedResponseWithinByteCap,
} = common;

const {
  BLOG_GROUNDED_RESEARCH_PROVIDER_TIMEOUT_MS,
  BLOG_GROUNDED_RESEARCH_MAX_RAW_RESPONSE_BYTES,
} = loadTsModule("lib/blogGroundedResearchContracts.ts");

const openAiMod = loadTsModule("lib/blogGroundedResearchOpenAi.server.ts");
const { callOpenAiGroundedResearch } = openAiMod;

const SUBJECT = {
  opportunityId: "opp-firestick-wifi-2026",
  topic: "Firestick WiFi tips",
  intent: "informational",
};
const OPENAI_CFG = { apiKey: "test-openai-key", model: "test-model" };
const URL_A = "https://support.example.com/firestick-wifi";
const URL_B = "https://docs.example.net/streaming-setup";
const MODEL_ONLY_URL = "https://model-invented.example.org/not-grounded";

function validOutput(overrides = {}) {
  return {
    summary: "Compact researched summary of Firestick WiFi guidance.",
    sources: [
      {
        id: "s1",
        title: "Official WiFi guide",
        url: URL_A,
        publishedAt: "2026-01-01",
      },
      {
        id: "s2",
        title: "Independent setup notes",
        url: URL_B,
        publishedAt: null,
      },
    ],
    claims: [
      { claim: "Use 5 GHz where available for streaming.", sourceIds: ["s1"] },
      { claim: "Restart the stick after network changes.", sourceIds: ["s2"] },
    ],
    unknowns: ["Exact router firmware versions vary by ISP."],
    ...overrides,
  };
}

function openAiResponse(overrides = {}) {
  const output = validOutput();
  return {
    output_text: JSON.stringify(output),
    output: [
      {
        type: "web_search_call",
        action: {
          type: "search",
          query: "firestick wifi tips",
          queries: ["firestick wifi tips", "fire tv stick wifi guide"],
          sources: [{ url: URL_A }, { url: URL_B }, { url: URL_A }],
        },
      },
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: JSON.stringify(output),
            annotations: [
              { type: "url_citation", url: URL_B },
              { type: "url_citation", url: URL_B },
            ],
          },
        ],
      },
    ],
    ...overrides,
  };
}

function makeHeaders(map) {
  return {
    get(name) {
      const key = String(name).toLowerCase();
      for (const [k, v] of Object.entries(map || {})) {
        if (String(k).toLowerCase() === key) return v;
      }
      return null;
    },
  };
}

function streamFromChunks(chunks, onCancel) {
  const encoded = chunks.map((c) =>
    typeof c === "string" ? new TextEncoder().encode(c) : c
  );
  let i = 0;
  return {
    getReader() {
      return {
        async read() {
          if (i >= encoded.length) return { done: true, value: undefined };
          const value = encoded[i++];
          return { done: false, value };
        },
        async cancel() {
          if (onCancel) onCancel();
        },
        releaseLock() {},
      };
    },
  };
}

function createOpenAiSdkTracker(impl) {
  const calls = [];
  const clientOptionsSeen = [];
  function FakeOpenAI(opts) {
    clientOptionsSeen.push(opts);
    this.responses = {
      create: async (args, requestOptions) => {
        calls.push({ args, requestOptions });
        return impl(args, requestOptions);
      },
    };
  }
  return {
    calls,
    clientOptionsSeen,
    deps: {
      loadOpenAiSdk: async () => ({ default: FakeOpenAI }),
    },
  };
}

async function main() {
  console.log("\nAB-7B R1 Isolated Provider Adapters\n");
  console.log("--- COMMON HELPERS ---");

  {
    const a = buildBlogGroundedResearchSystemPrompt();
    const b = buildBlogGroundedResearchSystemPrompt();
    ok("C_system_prompt_deterministic", a === b && a.includes("web-search"));
    ok("C_system_prompt_compact", a.length > 100 && a.length < 2000);
  }
  {
    const a = buildBlogGroundedResearchUserPrompt(SUBJECT);
    const b = buildBlogGroundedResearchUserPrompt(SUBJECT);
    ok("C_user_prompt_deterministic", a === b);
    ok(
      "C_user_prompt_delimited",
      a.includes("BEGIN_UNTRUSTED_RESEARCH_SUBJECT_JSON") &&
        a.includes(SUBJECT.opportunityId)
    );
  }
  {
    const schema = BLOG_GROUNDED_RESEARCH_PROVIDER_JSON_SCHEMA;
    ok("C_schema_object", schema.type === "object");
    ok(
      "C_schema_bounded_sources",
      schema.properties.sources.maxItems === MAX_BLOG_RESEARCH_SOURCES
    );
    ok(
      "C_schema_bounded_summary",
      schema.properties.summary.maxLength === MAX_BLOG_RESEARCH_SUMMARY_CHARS
    );
    ok(
      "C_schema_required_fields",
      deepEqual(schema.required, ["summary", "sources", "claims", "unknowns"])
    );
  }
  {
    const parsed = parseBlogGroundedResearchProviderJsonEnvelope(
      JSON.stringify(validOutput())
    );
    ok(
      "C_json_envelope_valid",
      parsed.ok === true &&
        parsed.providerOutput.sources.length === 2 &&
        parsed.providerOutput.claims.length === 2
    );
  }
  ok(
    "C_invalid_json_rejected",
    parseBlogGroundedResearchProviderJsonEnvelope("{not-json").ok === false
  );
  ok(
    "C_wrong_root_rejected",
    parseBlogGroundedResearchProviderJsonEnvelope("[]").ok === false
  );
  ok(
    "C_missing_summary_rejected",
    parseBlogGroundedResearchProviderJsonEnvelope(
      JSON.stringify({ sources: [], claims: [] })
    ).ok === false
  );
  ok(
    "C_non_array_sources_rejected",
    parseBlogGroundedResearchProviderJsonEnvelope(
      JSON.stringify({ summary: "x", sources: {}, claims: [] })
    ).ok === false
  );
  ok(
    "C_malformed_unknowns_rejected",
    parseBlogGroundedResearchProviderJsonEnvelope(
      JSON.stringify({
        summary: "x",
        sources: [],
        claims: [],
        unknowns: "nope",
      })
    ).ok === false
  );

  console.log("--- GROUNDING EXTRACTION ---");

  {
    const result = extractOpenAiGroundedResearchGrounding(openAiResponse());
    ok("G_openai_web_search_call", result.ok === true);
    ok(
      "G_openai_sources_and_citations",
      result.ok &&
        Array.isArray(result.grounding.groundedUrls) &&
        result.grounding.groundedUrls.includes(URL_A)
    );
  }
  {
    const noSearch = extractOpenAiGroundedResearchGrounding({
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: "{}",
              annotations: [{ type: "url_citation", url: URL_A }],
            },
          ],
        },
      ],
    });
    ok(
      "G_openai_missing_search_fails",
      noSearch.ok === false && noSearch.reason === "missing_search_call"
    );
  }
  {
    const noUrls = extractOpenAiGroundedResearchGrounding({
      output: [
        {
          type: "web_search_call",
          action: { type: "search", query: "q", sources: [] },
        },
      ],
    });
    ok(
      "G_openai_missing_urls_fails",
      noUrls.ok === false && noUrls.reason === "missing_grounding_urls"
    );
  }

console.log("--- OPENAI ADAPTER ---");
  {
    const tracker = createOpenAiSdkTracker(async () => openAiResponse());
    const result = await callOpenAiGroundedResearch(SUBJECT, OPENAI_CFG, {
      deps: tracker.deps,
    });
    ok(
      "O_success_packet",
      result.ok === true &&
        result.packet.provider === "openai" &&
        result.packet.providerOutput.sources.length === 2 &&
        result.packet.grounding.groundedUrls.includes(URL_A)
    );
    ok("O_exact_one_create_call", tracker.calls.length === 1);
    ok(
      "O_maxRetries_0",
      tracker.clientOptionsSeen[0]?.maxRetries === 0
    );
    ok(
      "O_timeout_45000",
      tracker.clientOptionsSeen[0]?.timeout ===
        BLOG_GROUNDED_RESEARCH_PROVIDER_TIMEOUT_MS &&
        BLOG_GROUNDED_RESEARCH_PROVIDER_TIMEOUT_MS === 45000
    );
    ok("O_store_false", tracker.calls[0].args.store === false);
    ok(
      "O_web_search_enabled",
      tracker.calls[0].args.tools?.[0]?.type === "web_search" &&
        tracker.calls[0].args.tool_choice === "required"
    );
    ok(
      "O_structured_output_schema",
      tracker.calls[0].args.text?.format?.type === "json_schema" &&
        tracker.calls[0].args.text?.format?.schema?.properties?.sources
    );
    ok(
      "O_max_output_tokens_bounded",
      tracker.calls[0].args.max_output_tokens ===
        BLOG_GROUNDED_RESEARCH_OPENAI_MAX_OUTPUT_TOKENS
    );
    ok(
      "O_include_sources",
      Array.isArray(tracker.calls[0].args.include) &&
        tracker.calls[0].args.include.includes(
          "web_search_call.action.sources"
        )
    );
    ok("O_no_fallback_single_call", tracker.calls.length === 1);
    ok("O_no_retry", tracker.calls.length === 1);
  }
  {
    const tracker = createOpenAiSdkTracker(async () => openAiResponse());
    const result = await callOpenAiGroundedResearch(SUBJECT, OPENAI_CFG, {
      signal: AbortSignal.abort(),
      deps: tracker.deps,
    });
    ok(
      "O_already_aborted",
      result.ok === false && result.code === "request_aborted"
    );
    ok("O_aborted_call_count_0", tracker.calls.length === 0);
  }
  {
    const tracker = createOpenAiSdkTracker(async () => openAiResponse());
    const result = await callOpenAiGroundedResearch(
      SUBJECT,
      { apiKey: "", model: "test-model" },
      { deps: tracker.deps }
    );
    ok(
      "O_missing_config",
      result.ok === false && result.code === "provider_not_configured"
    );
    ok("O_missing_config_call_count_0", tracker.calls.length === 0);
  }
  {
    const tracker = createOpenAiSdkTracker(async () => {
      const err = new Error("timeout");
      err.name = "APIConnectionTimeoutError";
      throw err;
    });
    const result = await callOpenAiGroundedResearch(SUBJECT, OPENAI_CFG, {
      deps: tracker.deps,
    });
    ok(
      "O_timeout_error",
      result.ok === false && result.code === "provider_timeout"
    );
  }
  for (const [label, status, code] of [
    ["O_http_408", 408, "provider_timeout"],
    ["O_http_504", 504, "provider_timeout"],
    ["O_http_429", 429, "provider_upstream"],
    ["O_http_500", 500, "provider_upstream"],
  ]) {
    const tracker = createOpenAiSdkTracker(async () => {
      const err = new Error("upstream");
      err.status = status;
      throw err;
    });
    const result = await callOpenAiGroundedResearch(SUBJECT, OPENAI_CFG, {
      deps: tracker.deps,
    });
    ok(
      label,
      result.ok === false &&
        result.code === code &&
        tracker.calls.length === 1
    );
  }
  {
    const tracker = createOpenAiSdkTracker(async () => ({
      ...openAiResponse(),
      output_text: "{not-json",
    }));
    const result = await callOpenAiGroundedResearch(SUBJECT, OPENAI_CFG, {
      deps: tracker.deps,
    });
    ok(
      "O_malformed_output",
      result.ok === false && result.code === "malformed_provider_output"
    );
  }
  {
    const tracker = createOpenAiSdkTracker(async () => ({
      output_text: JSON.stringify(validOutput()),
      output: [{ type: "message", content: [] }],
    }));
    const result = await callOpenAiGroundedResearch(SUBJECT, OPENAI_CFG, {
      deps: tracker.deps,
    });
    ok(
      "O_search_absent_grounding",
      result.ok === false && result.code === "grounding_unavailable"
    );
  }
  {
    const tracker = createOpenAiSdkTracker(async () => ({
      output_text: JSON.stringify(validOutput()),
      output: [
        {
          type: "web_search_call",
          action: { type: "search", queries: ["x"], sources: [] },
        },
      ],
    }));
    const result = await callOpenAiGroundedResearch(SUBJECT, OPENAI_CFG, {
      deps: tracker.deps,
    });
    ok(
      "O_urls_absent_grounding",
      result.ok === false && result.code === "grounding_unavailable"
    );
  }
  {
    const huge = "x".repeat(BLOG_GROUNDED_RESEARCH_MAX_RAW_RESPONSE_BYTES + 100);
    const tracker = createOpenAiSdkTracker(async () => ({
      ...openAiResponse(),
      pad: huge,
    }));
    const result = await callOpenAiGroundedResearch(SUBJECT, OPENAI_CFG, {
      deps: tracker.deps,
    });
    ok(
      "O_oversized_serialized",
      result.ok === false && result.code === "malformed_provider_output"
    );
  }
  {
    const secret = "sk-test-openai-secret-SHOULD-NOT-LEAK";
    const tracker = createOpenAiSdkTracker(async () => {
      throw new Error(`boom ${secret} stack-trace-line`);
    });
    const result = await callOpenAiGroundedResearch(
      SUBJECT,
      { apiKey: secret, model: "test-model" },
      { deps: tracker.deps }
    );
    const encoded = JSON.stringify(result);
    ok(
      "O_raw_exception_not_reflected",
      result.ok === false &&
        !encoded.includes("boom") &&
        !encoded.includes("stack-trace-line")
    );
    ok("O_api_key_not_reflected", !encoded.includes(secret));
  }
  ok(
    "O_no_toplevel_openai_import",
    !/^import\s+.*from\s+["']openai["']/m.test(openAiSrc)
  );
  ok(
    "O_dynamic_import_present",
    /import\(\s*["']openai["']\s*\)/.test(openAiSrc)
  );
  ok(
    "O_openai_max_tokens_constant",
    BLOG_GROUNDED_RESEARCH_OPENAI_MAX_OUTPUT_TOKENS === 4096
  );

  console.log("--- ISOLATION / SAFETY ---");
  const r1Sources = [commonSrc, openAiSrc].join("\n");
  const r1Stripped = stripCommentsAndStrings(r1Sources);
  ok(
    "I_no_ab7a_validation_call",
    !/validateBlogResearchEvidence\s*\(/.test(r1Stripped)
  );
  ok(
    "I_no_seoAi_import",
    !/@\/lib\/seoAi/.test(r1Sources) && !/@\/lib\/seoAiServer/.test(r1Sources)
  );
  ok(
    "I_no_db_import",
    !/@\/lib\/db/.test(r1Sources) &&
      !/\bmysql\b/.test(r1Sources) &&
      !/adminAuth/.test(r1Sources) &&
      !/rateLimit/.test(r1Sources)
  );
  ok("I_no_process_env", !/process\.env/.test(r1Stripped));
  ok(
    "I_production_graph_no_r1",
    !/blogGroundedResearchProviderCommon\.server/.test(seoAiSrc) &&
      !/blogGroundedResearchOpenAi\.server/.test(seoAiSrc) &&
      !/blogGroundedResearchProviderCommon\.server/.test(seoAiServerSrc) &&
      !/blogGroundedResearchOpenAi\.server/.test(seoAiServerSrc) &&
      !/blogGroundedResearchProviderCommon\.server/.test(adminRouteSrc) &&
      !/blogGroundedResearchOpenAi\.server/.test(adminRouteSrc)
  );
  {
    const repoRefs = [];
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (
          entry.name === "node_modules" ||
          entry.name === ".git" ||
          entry.name === ".next" ||
          entry.name.startsWith("_") ||
          entry.name.startsWith("tmp")
        ) {
          continue;
        }
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) {
          const text = fs.readFileSync(full, "utf8");
          if (
            /blogGroundedResearchProviderCommon\.server|blogGroundedResearchOpenAi\.server|blogGroundedResearchGemini\.server/.test(
              text
            )
          ) {
            repoRefs.push(path.relative(ROOT, full).replace(/\\/g, "/"));
          }
        }
      }
    }
    walk(ROOT);
    const allowed = new Set([
      "lib/blogGroundedResearchProviderCommon.server.ts",
      "lib/blogGroundedResearchOpenAi.server.ts",
      "scripts/phase-ab7b-r1-provider-adapters-tests.js",
      // Authorized R3 downstream runtime (path assembled to avoid cross-suite scan false hits).
      ["lib/", "blogGroundedResearchRuntime", ".server.ts"].join(""),
    ]);
    const unexpected = repoRefs.filter((r) => !allowed.has(r));
    ok(
      "I_repo_refs_only_r1",
      unexpected.length === 0,
      unexpected.join(", ") || "ok"
    );
  }
  {
    const stripped = r1Stripped;
    const topLevelDanger =
      /^(?:export\s+)?(?:const|let|var)\s+\w+\s*=\s*(?:await\s+)?fetch\s*\(/m.test(
        stripped
      ) ||
      /^(?:export\s+)?(?:const|let|var)\s+\w+\s*=\s*set(?:Timeout|Interval)\s*\(/m.test(
        stripped
      ) ||
      /^(?:export\s+)?(?:const|let|var)\s+\w+\s*=\s*new\s+AbortController\s*\(/m.test(
        stripped
      ) ||
      /process\.env/.test(stripped);
    ok("I_no_toplevel_side_effects", topLevelDanger === false);
    ok(
      "I_gemini_adapter_removed",
      !fs.existsSync(path.join(ROOT, "lib/blogGroundedResearchGemini.server.ts"))
    );
    ok(
      "I_no_gemini_helpers_in_common",
      !/extractGeminiGroundedResearchGrounding/.test(commonSrc) &&
        !/BLOG_GROUNDED_RESEARCH_GEMINI_INTERACTIONS_URL/.test(commonSrc) &&
        !/readBoundedGeminiResearchResponseJson/.test(commonSrc)
    );
  }
  ok(
    "I_serialized_byte_helper",
    typeof assertSerializedResponseWithinByteCap === "function"
  );
  ok(
    "I_openai_transport_cap_post_materialization",
    /assertSerializedResponseWithinByteCap/.test(openAiSrc) &&
      /transport byte cap/i.test(commonSrc) &&
      !/true pre-download transport/i.test(openAiSrc)
  );

  console.log(`\nAB-7B R1 results: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
