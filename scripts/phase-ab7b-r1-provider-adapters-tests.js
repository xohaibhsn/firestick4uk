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

function geminiDiagEvents(lines) {
  return lines.filter((line) =>
    String(line).includes("event: gemini_grounding_failure")
  );
}

function parseGeminiDiag(line) {
  const text = String(line);
  const reason = (
    text.match(
      /\breason: (missing_search_call|missing_grounding_urls|bounds_exceeded)\b/
    ) || []
  )[1];
  if (!reason) return null;
  return {
    reason,
    searchCallCount: Number(
      (text.match(/\bsearchCallCount: (\d+)\b/) || [])[1]
    ),
    citationAnnotationCount: Number(
      (text.match(/\bcitationAnnotationCount: (\d+)\b/) || [])[1]
    ),
    acceptedGroundedUrlCount: Number(
      (text.match(/\bacceptedGroundedUrlCount: (\d+)\b/) || [])[1]
    ),
  };
}

function geminiDiagLooksPrivate(line) {
  const text = String(line);
  const forbidden = [
    URL_A,
    URL_B,
    MODEL_ONLY_URL,
    "test-gemini-key",
    "BEGIN_UNTRUSTED",
    "https://",
    "http://",
    SUBJECT.topic,
    SUBJECT.opportunityId,
    "stack",
    "Authorization",
    "x-goog-api-key",
  ];
  return !forbidden.some((token) => text.includes(token));
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
const geminiSrc = read("lib/blogGroundedResearchGemini.server.ts");
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
  extractGeminiGroundedResearchGrounding,
  readBoundedGeminiResearchResponseJson,
  assertSerializedResponseWithinByteCap,
} = common;

const {
  BLOG_GROUNDED_RESEARCH_PROVIDER_TIMEOUT_MS,
  BLOG_GROUNDED_RESEARCH_MAX_RAW_RESPONSE_BYTES,
} = loadTsModule("lib/blogGroundedResearchContracts.ts");

const openAiMod = loadTsModule("lib/blogGroundedResearchOpenAi.server.ts");
const geminiMod = loadTsModule("lib/blogGroundedResearchGemini.server.ts");
const { callOpenAiGroundedResearch } = openAiMod;
const { callGeminiGroundedResearch } = geminiMod;
const GEMINI_INTERACTIONS_URL =
  common.BLOG_GROUNDED_RESEARCH_GEMINI_INTERACTIONS_URL ||
  common.GEMINI_GROUNDED_RESEARCH_INTERACTIONS_URL;

const SUBJECT = {
  opportunityId: "opp-firestick-wifi-2026",
  topic: "Firestick WiFi tips",
  intent: "informational",
};
const OPENAI_CFG = { apiKey: "test-openai-key", model: "test-model" };
const GEMINI_CFG = { apiKey: "test-gemini-key", model: "test-model" };
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

function geminiBody(overrides = {}) {
  const output = validOutput();
  return {
    steps: [
      {
        type: "google_search_call",
        arguments: {
          queries: ["firestick wifi tips", "fire tv stick wifi guide"],
        },
      },
      {
        type: "model_output",
        content: [
          {
            type: "text",
            text: JSON.stringify(output),
            annotations: [
              { type: "url_citation", url: URL_A },
              { type: "url_citation", uri: URL_B },
              { type: "url_citation", url: URL_A },
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

function mockGeminiHttpResponse(bodyObj, options = {}) {
  const text = JSON.stringify(bodyObj);
  const chunks = options.chunks || [text];
  return {
    ok: options.ok !== false,
    status: options.status || 200,
    headers: makeHeaders(options.headers || {}),
    body: streamFromChunks(chunks, options.onCancel),
    text: async () => {
      throw new Error("text fallback forbidden");
    },
    json: async () => {
      throw new Error("json fallback forbidden");
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
    ok("G_openai_search_metadata_url", result.ok === true);
    ok(
      "G_openai_url_citation_accepted",
      result.ok && result.grounding.groundedUrls.includes(URL_B)
    );
    ok(
      "G_openai_query_extracted",
      result.ok &&
        result.grounding.searchQueries.includes("firestick wifi tips")
    );
    ok(
      "G_openai_url_dedupe_first_seen",
      result.ok &&
        result.grounding.groundedUrls.filter((u) => u === URL_A).length === 1 &&
        result.grounding.groundedUrls[0] === URL_A &&
        result.grounding.groundedUrls[1] === URL_B
    );
    ok(
      "G_openai_query_dedupe",
      result.ok &&
        result.grounding.searchQueries.filter(
          (q) => q === "firestick wifi tips"
        ).length === 1
    );
  }
  {
    const result = extractGeminiGroundedResearchGrounding(geminiBody());
    ok("G_gemini_google_search_call", result.ok === true);
    ok(
      "G_gemini_url_citation_accepted",
      result.ok &&
        result.grounding.groundedUrls.includes(URL_A) &&
        result.grounding.groundedUrls.includes(URL_B)
    );
    ok(
      "G_gemini_query_dedupe_order",
      result.ok &&
        result.grounding.searchQueries[0] === "firestick wifi tips" &&
        result.grounding.searchQueries.length === 2
    );
  }
  {
    const result = extractOpenAiGroundedResearchGrounding({
      output_text: JSON.stringify(
        validOutput({
          sources: [
            {
              id: "s1",
              title: "Invented",
              url: MODEL_ONLY_URL,
              publishedAt: null,
            },
            {
              id: "s2",
              title: "Also",
              url: "https://another-model.example/x",
              publishedAt: null,
            },
          ],
        })
      ),
      output: [
        {
          type: "web_search_call",
          action: {
            type: "search",
            queries: ["q"],
            sources: [{ url: URL_A }],
          },
        },
      ],
    });
    ok(
      "G_model_json_url_not_grounding",
      result.ok === true &&
        !result.grounding.groundedUrls.includes(MODEL_ONLY_URL) &&
        result.grounding.groundedUrls.includes(URL_A)
    );
  }
  {
    const sources = [];
    for (let i = 0; i < MAX_BLOG_RESEARCH_GROUNDED_URLS + 1; i += 1) {
      sources.push({ url: `https://grounding${i}.example.net/r` });
    }
    const oversized = extractOpenAiGroundedResearchGrounding({
      output: [
        {
          type: "web_search_call",
          action: { type: "search", queries: ["q"], sources },
        },
      ],
    });
    ok(
      "G_oversized_url_list_rejected",
      oversized.ok === false && oversized.reason === "bounds_exceeded"
    );
  }
  {
    const queries = [];
    for (let i = 0; i < MAX_BLOG_RESEARCH_SEARCH_QUERIES + 1; i += 1) {
      queries.push(`query-${i}`);
    }
    const oversized = extractGeminiGroundedResearchGrounding({
      steps: [
        { type: "google_search_call", arguments: { queries } },
        {
          type: "model_output",
          content: [
            {
              type: "text",
              text: "{}",
              annotations: [{ type: "url_citation", url: URL_A }],
            },
          ],
        },
      ],
    });
    ok(
      "G_oversized_query_list_rejected",
      oversized.ok === false && oversized.reason === "bounds_exceeded"
    );
  }
  ok(
    "G_openai_missing_search_fails",
    extractOpenAiGroundedResearchGrounding({
      output: [{ type: "message", content: [] }],
    }).ok === false
  );
  ok(
    "G_openai_missing_urls_fails",
    extractOpenAiGroundedResearchGrounding({
      output: [
        {
          type: "web_search_call",
          action: { type: "search", queries: ["x"], sources: [] },
        },
      ],
    }).ok === false
  );

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

  console.log("--- GEMINI ADAPTER ---");
  {
    const fetchCalls = [];
    const { result, lines } = await withCapturedWarn(async () =>
      callGeminiGroundedResearch(SUBJECT, GEMINI_CFG, {
        deps: {
          fetchImpl: async (url, init) => {
            fetchCalls.push({ url: String(url), init });
            return mockGeminiHttpResponse(geminiBody());
          },
        },
      })
    );
    ok(
      "M_success_packet",
      result.ok === true &&
        result.packet.provider === "gemini" &&
        result.packet.grounding.groundedUrls.includes(URL_A)
    );
    ok(
      "M_success_no_grounding_diag",
      geminiDiagEvents(lines).length === 0
    );
    ok("M_fetch_count_1", fetchCalls.length === 1);
    ok("M_method_post", fetchCalls[0].init.method === "POST");
    ok(
      "M_interactions_endpoint",
      fetchCalls[0].url === GEMINI_INTERACTIONS_URL &&
        fetchCalls[0].url.includes("/v1beta/interactions")
    );
    const body = JSON.parse(fetchCalls[0].init.body);
    ok(
      "M_google_search_tool",
      body.tools?.[0]?.type === "google_search"
    );
    ok(
      "M_structured_response_format",
      body.response_format?.type === "text" &&
        body.response_format?.mime_type === "application/json" &&
        body.response_format?.schema?.properties?.sources
    );
    ok("M_store_false", body.store === false);
    ok(
      "M_api_key_header_present",
      fetchCalls[0].init.headers["x-goog-api-key"] === "test-gemini-key"
    );
    ok(
      "M_redirect_error",
      fetchCalls[0].init.redirect === "error"
    );
    ok(
      "M_thinking_level_low",
      body.generation_config?.thinking_level === "low"
    );
    ok(
      "M_api_key_not_in_url",
      !String(fetchCalls[0].url).includes("key=") &&
        !String(fetchCalls[0].url).includes("test-gemini-key")
    );
    ok(
      "M_api_key_not_logged_in_result",
      !JSON.stringify(result).includes("test-gemini-key")
    );
  }
  {
    const fetchCalls = [];
    const result = await callGeminiGroundedResearch(SUBJECT, GEMINI_CFG, {
      deps: {
        fetchImpl: async (url, init) => {
          fetchCalls.push({ url: String(url), init });
          const err = new TypeError(
            "Failed to fetch: redirect mode is set to error"
          );
          throw err;
        },
      },
    });
    ok(
      "M_redirect_reject_sanitized",
      result.ok === false &&
        result.code === "provider_upstream" &&
        !JSON.stringify(result).includes("test-gemini-key") &&
        !String(result.message || "").toLowerCase().includes("redirect")
    );
    ok("M_redirect_reject_one_call", fetchCalls.length === 1);
    ok(
      "M_redirect_reject_no_retry",
      fetchCalls.length === 1 && fetchCalls[0].init.redirect === "error"
    );
  }
  {
    const fetchCalls = [];
    const result = await callGeminiGroundedResearch(SUBJECT, GEMINI_CFG, {
      signal: AbortSignal.abort(),
      deps: {
        fetchImpl: async (...args) => {
          fetchCalls.push(args);
          return mockGeminiHttpResponse(geminiBody());
        },
      },
    });
    ok(
      "M_already_aborted",
      result.ok === false && result.code === "request_aborted"
    );
    ok("M_aborted_fetch_count_0", fetchCalls.length === 0);
  }
  {
    const fetchCalls = [];
    const result = await callGeminiGroundedResearch(
      SUBJECT,
      { apiKey: "  ", model: "test-model" },
      {
        deps: {
          fetchImpl: async (...args) => {
            fetchCalls.push(args);
            return mockGeminiHttpResponse(geminiBody());
          },
        },
      }
    );
    ok(
      "M_missing_config",
      result.ok === false && result.code === "provider_not_configured"
    );
    ok("M_missing_config_fetch_0", fetchCalls.length === 0);
  }
  for (const [label, status, code] of [
    ["M_http_408", 408, "provider_timeout"],
    ["M_http_504", 504, "provider_timeout"],
    ["M_http_429", 429, "provider_upstream"],
    ["M_http_500", 500, "provider_upstream"],
  ]) {
    const fetchCalls = [];
    const result = await callGeminiGroundedResearch(SUBJECT, GEMINI_CFG, {
      deps: {
        fetchImpl: async () => {
          fetchCalls.push(1);
          return {
            ok: false,
            status,
            headers: makeHeaders({}),
            body: streamFromChunks(["{}"], () => {}),
          };
        },
      },
    });
    ok(
      label,
      result.ok === false &&
        result.code === code &&
        fetchCalls.length === 1
    );
  }
  {
    const result = await callGeminiGroundedResearch(SUBJECT, GEMINI_CFG, {
      deps: {
        fetchImpl: async () =>
          mockGeminiHttpResponse(null, { chunks: ["{not-json"] }),
      },
    });
    ok(
      "M_malformed_json_body",
      result.ok === false && result.code === "malformed_provider_output"
    );
  }
  {
    const result = await callGeminiGroundedResearch(SUBJECT, GEMINI_CFG, {
      deps: {
        fetchImpl: async () =>
          mockGeminiHttpResponse({
            steps: [
              {
                type: "google_search_call",
                arguments: { queries: ["q"] },
              },
              {
                type: "model_output",
                content: [
                  {
                    type: "text",
                    text: "{not-json",
                    annotations: [{ type: "url_citation", url: URL_A }],
                  },
                ],
              },
            ],
          }),
      },
    });
    ok(
      "M_malformed_structured_output",
      result.ok === false && result.code === "malformed_provider_output"
    );
  }
  {
    const { result, lines } = await withCapturedWarn(async () =>
      callGeminiGroundedResearch(SUBJECT, GEMINI_CFG, {
        deps: {
          fetchImpl: async () =>
            mockGeminiHttpResponse({
              steps: [
                {
                  type: "model_output",
                  content: [
                    {
                      type: "text",
                      text: JSON.stringify(validOutput()),
                      annotations: [{ type: "url_citation", url: URL_A }],
                    },
                  ],
                },
              ],
            }),
        },
      })
    );
    const events = geminiDiagEvents(lines);
    const diag = events.length === 1 ? parseGeminiDiag(events[0]) : null;
    ok(
      "M_search_missing_grounding",
      result.ok === false && result.code === "grounding_unavailable"
    );
    ok(
      "M_search_missing_diag_reason",
      diag &&
        diag.reason === "missing_search_call" &&
        diag.searchCallCount === 0 &&
        Number.isFinite(diag.citationAnnotationCount) &&
        Number.isFinite(diag.acceptedGroundedUrlCount)
    );
    ok(
      "M_search_missing_diag_single",
      events.length === 1 && geminiDiagLooksPrivate(events[0])
    );
  }
  {
    const { result, lines } = await withCapturedWarn(async () =>
      callGeminiGroundedResearch(SUBJECT, GEMINI_CFG, {
        deps: {
          fetchImpl: async () =>
            mockGeminiHttpResponse({
              steps: [
                {
                  type: "google_search_call",
                  arguments: { queries: ["q"] },
                },
                {
                  type: "model_output",
                  content: [
                    { type: "text", text: JSON.stringify(validOutput()) },
                  ],
                },
              ],
            }),
        },
      })
    );
    const events = geminiDiagEvents(lines);
    const diag = events.length === 1 ? parseGeminiDiag(events[0]) : null;
    ok(
      "M_citation_urls_missing",
      result.ok === false && result.code === "grounding_unavailable"
    );
    ok(
      "M_citation_missing_diag_reason",
      diag &&
        diag.reason === "missing_grounding_urls" &&
        diag.searchCallCount === 1 &&
        diag.citationAnnotationCount === 0 &&
        diag.acceptedGroundedUrlCount === 0
    );
    ok(
      "M_citation_missing_diag_private",
      events.length === 1 && geminiDiagLooksPrivate(events[0])
    );
  }
  {
    const queries = [];
    for (let i = 0; i < MAX_BLOG_RESEARCH_SEARCH_QUERIES + 1; i += 1) {
      queries.push(`query-${i}`);
    }
    const { result, lines } = await withCapturedWarn(async () =>
      callGeminiGroundedResearch(SUBJECT, GEMINI_CFG, {
        deps: {
          fetchImpl: async () =>
            mockGeminiHttpResponse({
              steps: [
                {
                  type: "google_search_call",
                  arguments: { queries },
                },
                {
                  type: "model_output",
                  content: [
                    {
                      type: "text",
                      text: JSON.stringify(validOutput()),
                      annotations: [{ type: "url_citation", url: URL_A }],
                    },
                  ],
                },
              ],
            }),
        },
      })
    );
    const events = geminiDiagEvents(lines);
    const diag = events.length === 1 ? parseGeminiDiag(events[0]) : null;
    ok(
      "M_bounds_exceeded_public",
      result.ok === false && result.code === "malformed_provider_output"
    );
    ok(
      "M_bounds_exceeded_diag_reason",
      diag &&
        diag.reason === "bounds_exceeded" &&
        diag.searchCallCount === 1 &&
        diag.acceptedGroundedUrlCount === 1
    );
    ok(
      "M_bounds_exceeded_diag_private",
      events.length === 1 && geminiDiagLooksPrivate(events[0])
    );
  }
  {
    const originalWarn = console.warn;
    console.warn = () => {
      throw new Error("diag-boom");
    };
    let result;
    try {
      result = await callGeminiGroundedResearch(SUBJECT, GEMINI_CFG, {
        deps: {
          fetchImpl: async () =>
            mockGeminiHttpResponse({
              steps: [
                {
                  type: "google_search_call",
                  arguments: { queries: ["q"] },
                },
                {
                  type: "model_output",
                  content: [
                    { type: "text", text: JSON.stringify(validOutput()) },
                  ],
                },
              ],
            }),
        },
      });
    } finally {
      console.warn = originalWarn;
    }
    ok(
      "M_diag_log_failure_isolated",
      result.ok === false &&
        result.code === "grounding_unavailable" &&
        !JSON.stringify(result).includes("diag-boom")
    );
  }
  {
    const extracted = extractGeminiGroundedResearchGrounding({
      steps: [{ type: "model_output", content: [] }],
    });
    ok(
      "M_extract_missing_search_diag",
      extracted.ok === false &&
        extracted.reason === "missing_search_call" &&
        extracted.diagnostics.searchCallCount === 0
    );
    const noSteps = extractGeminiGroundedResearchGrounding({});
    ok(
      "M_extract_no_steps_diag",
      noSteps.ok === false &&
        noSteps.reason === "missing_search_call" &&
        noSteps.diagnostics.searchCallCount === 0
    );
  }
  {
    let readerStarted = false;
    const result = await callGeminiGroundedResearch(SUBJECT, GEMINI_CFG, {
      deps: {
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          headers: makeHeaders({
            "content-length": String(
              BLOG_GROUNDED_RESEARCH_MAX_RAW_RESPONSE_BYTES + 1
            ),
          }),
          body: {
            getReader() {
              readerStarted = true;
              return {
                async read() {
                  return { done: true, value: undefined };
                },
                async cancel() {},
                releaseLock() {},
              };
            },
          },
        }),
      },
    });
    ok(
      "M_content_length_oversize",
      result.ok === false && result.code === "malformed_provider_output"
    );
    ok("M_content_length_no_read", readerStarted === false);
  }
  {
    let cancelCount = 0;
    const chunkA = Buffer.alloc(200_000, 0x61);
    const chunkB = Buffer.alloc(70_000, 0x62);
    const result = await callGeminiGroundedResearch(SUBJECT, GEMINI_CFG, {
      deps: {
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          headers: makeHeaders({}),
          body: streamFromChunks([chunkA, chunkB], () => {
            cancelCount += 1;
          }),
        }),
      },
    });
    ok(
      "M_stream_oversize",
      result.ok === false && result.code === "malformed_provider_output"
    );
    ok("M_reader_cancelled", cancelCount === 1);
  }
  {
    const fetchCalls = [];
    const external = new AbortController();
    const pending = callGeminiGroundedResearch(SUBJECT, GEMINI_CFG, {
      signal: external.signal,
      deps: {
        fetchImpl: async (_url, init) => {
          fetchCalls.push(1);
          return new Promise((_, reject) => {
            init.signal.addEventListener(
              "abort",
              () => {
                const err = new Error("aborted");
                err.name = "AbortError";
                reject(err);
              },
              { once: true }
            );
          });
        },
      },
    });
    await new Promise((r) => setImmediate(r));
    external.abort();
    const result = await pending;
    ok(
      "M_external_abort",
      result.ok === false && result.code === "request_aborted"
    );
    ok("M_external_abort_one_fetch", fetchCalls.length === 1);
  }
  {
    const armed = new Set();
    const cleared = new Set();
    const realSetTimeout = global.setTimeout;
    const realClearTimeout = global.clearTimeout;
    global.setTimeout = (fn, ms, ...args) => {
      const id = realSetTimeout(fn, ms, ...args);
      if (ms === BLOG_GROUNDED_RESEARCH_PROVIDER_TIMEOUT_MS) armed.add(id);
      return id;
    };
    global.clearTimeout = (id) => {
      cleared.add(id);
      return realClearTimeout(id);
    };
    const external = new AbortController();
    const added = [];
    const removed = [];
    const realAdd = external.signal.addEventListener.bind(external.signal);
    const realRemove = external.signal.removeEventListener.bind(
      external.signal
    );
    external.signal.addEventListener = (type, listener, opts) => {
      if (type === "abort") added.push(listener);
      return realAdd(type, listener, opts);
    };
    external.signal.removeEventListener = (type, listener, opts) => {
      if (type === "abort") removed.push(listener);
      return realRemove(type, listener, opts);
    };
    const result = await callGeminiGroundedResearch(SUBJECT, GEMINI_CFG, {
      signal: external.signal,
      deps: {
        fetchImpl: async () => mockGeminiHttpResponse(geminiBody()),
      },
    });
    global.setTimeout = realSetTimeout;
    global.clearTimeout = realClearTimeout;
    ok("M_success_for_cleanup", result.ok === true);
    ok(
      "M_timer_cleaned",
      armed.size === 1 && [...armed].every((id) => cleared.has(id))
    );
    ok(
      "M_listener_cleaned",
      added.length === 1 && removed.length === 1 && removed[0] === added[0]
    );
  }
  {
    const result = await callGeminiGroundedResearch(SUBJECT, GEMINI_CFG, {
      deps: {
        timeoutMs: 5,
        fetchImpl: async (_url, init) =>
          new Promise((_, reject) => {
            init.signal.addEventListener(
              "abort",
              () => {
                const err = new Error("aborted");
                err.name = "AbortError";
                reject(err);
              },
              { once: true }
            );
          }),
      },
    });
    ok(
      "M_internal_timeout",
      result.ok === false && result.code === "provider_timeout"
    );
  }
  {
    let fetchCount = 0;
    await callGeminiGroundedResearch(SUBJECT, GEMINI_CFG, {
      deps: {
        fetchImpl: async () => {
          fetchCount += 1;
          return mockGeminiHttpResponse(geminiBody());
        },
      },
    });
    ok("M_fetch_never_gt_1", fetchCount === 1);
  }
  {
    const within = await readBoundedGeminiResearchResponseJson(
      mockGeminiHttpResponse(geminiBody(), {
        headers: { "content-length": "100" },
      }),
      BLOG_GROUNDED_RESEARCH_MAX_RAW_RESPONSE_BYTES
    );
    ok("M_bounded_reader_within", within.ok === true);
    const noBody = await readBoundedGeminiResearchResponseJson(
      {
        ok: true,
        status: 200,
        headers: makeHeaders({}),
        body: null,
      },
      BLOG_GROUNDED_RESEARCH_MAX_RAW_RESPONSE_BYTES
    );
    ok(
      "M_bounded_reader_no_body",
      noBody.ok === false && noBody.code === "malformed_provider_output"
    );
  }
  ok(
    "M_no_unbounded_text_json",
    !/readBoundedGeminiResearchResponseJson[\s\S]{0,1200}res\.(text|json)\s*\(/.test(
      commonSrc
    ) &&
      !/callGeminiGroundedResearch[\s\S]{0,2500}await\s+res\.(text|json)\s*\(/.test(
        geminiSrc
      )
  );

  console.log("--- ISOLATION / SAFETY ---");
  const r1Sources = [commonSrc, openAiSrc, geminiSrc].join("\n");
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
      !/blogGroundedResearchGemini\.server/.test(seoAiSrc) &&
      !/blogGroundedResearchProviderCommon\.server/.test(seoAiServerSrc) &&
      !/blogGroundedResearchOpenAi\.server/.test(seoAiServerSrc) &&
      !/blogGroundedResearchGemini\.server/.test(seoAiServerSrc) &&
      !/blogGroundedResearchProviderCommon\.server/.test(adminRouteSrc) &&
      !/blogGroundedResearchOpenAi\.server/.test(adminRouteSrc) &&
      !/blogGroundedResearchGemini\.server/.test(adminRouteSrc)
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
      "lib/blogGroundedResearchGemini.server.ts",
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
      "I_gemini_request_scoped_timer_allowed",
      /setTimeout\s*\(/.test(geminiSrc) &&
        /clearTimeout\s*\(/.test(geminiSrc) &&
        /function\s+createResearchAbortBundle/.test(geminiSrc)
    );
    ok(
      "I_gemini_redirect_error",
      /redirect:\s*["']error["']/.test(geminiSrc) &&
        /x-goog-api-key/.test(geminiSrc) &&
        !/searchParams\.set\(\s*["']key["']/.test(geminiSrc)
    );
    ok(
      "I_gemini_thinking_level_low",
      /generation_config\s*:\s*\{[\s\S]*?thinking_level\s*:\s*["']low["']/.test(
        geminiSrc
      )
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
