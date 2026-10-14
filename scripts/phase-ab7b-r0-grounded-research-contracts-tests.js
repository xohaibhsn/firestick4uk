/**
 * AB-7B R0 — Pure grounded research contract tests.
 * No provider, network, DB, env secrets, timers, or route wiring.
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

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
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
  const sandbox = { exports: {}, module: { exports: {} } };
  const localRequire = (id) => {
    if (id.startsWith("@/lib/")) {
      return loadTsModule("lib/" + id.slice("@/lib/".length) + ".ts");
    }
    if (id.startsWith("./") || id.startsWith("../")) {
      const base = path.resolve(path.dirname(path.join(ROOT, rel)), id);
      if (fs.existsSync(base + ".ts")) {
        return loadTsModule(
          path.relative(ROOT, base + ".ts").replace(/\\/g, "/")
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

const contractSrc = read("lib/blogGroundedResearchContracts.ts");
const engine = loadTsModule("lib/blogOpportunityEngine.ts");
const {
  BLOG_GROUNDED_RESEARCH_PROVIDERS,
  BLOG_GROUNDED_RESEARCH_TASK,
  BLOG_GROUNDED_RESEARCH_PROVIDER_TIMEOUT_MS,
  BLOG_GROUNDED_RESEARCH_MAX_RAW_RESPONSE_BYTES,
  BLOG_GROUNDED_RESEARCH_MAX_PROVIDER_ATTEMPTS,
  BLOG_GROUNDED_RESEARCH_MAX_IN_FLIGHT_PER_PROCESS,
  BLOG_GROUNDED_RESEARCH_FAILURE_CODES,
  parseBlogGroundedResearchRequest,
  createBlogGroundedResearchFailure,
  blogGroundedResearchFailureStatus,
} = loadTsModule("lib/blogGroundedResearchContracts.ts");

console.log("\nAB-7B R0 Grounded Research Contracts\n");

function validRequest(overrides = {}) {
  return {
    provider: "openai",
    task: "research_blog_evidence",
    opportunityId: "opp-firestick-wifi-2026",
    topic: "Firestick WiFi tips",
    intent: "informational",
    ...overrides,
  };
}

// ---------- REQUEST PARSER ----------
console.log("--- REQUEST PARSER ---");

{
  const input = validRequest();
  const snapshot = JSON.parse(JSON.stringify(input));
  const parsed = parseBlogGroundedResearchRequest(input);
  ok("R_openai_valid", parsed.ok === true && parsed.value.provider === "openai");
  ok("R_caller_immutable", deepEqual(input, snapshot));
}
ok(
  "R_gemini_rejected",
  parseBlogGroundedResearchRequest(validRequest({ provider: "gemini" })).ok ===
    false &&
    parseBlogGroundedResearchRequest(validRequest({ provider: "gemini" }))
      .code === "invalid_request"
);
ok(
  "R_auto_rejected",
  parseBlogGroundedResearchRequest(validRequest({ provider: "auto" })).ok ===
    false
);
ok(
  "R_unknown_provider",
  parseBlogGroundedResearchRequest(validRequest({ provider: "anthropic" }))
    .ok === false
);
ok(
  "R_wrong_task",
  parseBlogGroundedResearchRequest(
    validRequest({ task: "explain_issue" })
  ).ok === false
);
ok(
  "R_missing_opportunity",
  parseBlogGroundedResearchRequest({
    provider: "openai",
    task: "research_blog_evidence",
    topic: "Firestick WiFi tips",
  }).ok === false
);
ok(
  "R_blank_opportunity",
  parseBlogGroundedResearchRequest(validRequest({ opportunityId: "   " }))
    .ok === false
);
ok(
  "R_oversize_opportunity",
  parseBlogGroundedResearchRequest(
    validRequest({
      opportunityId: "o".repeat(engine.MAX_OPPORTUNITY_ID_CHARS + 1),
    })
  ).ok === false
);
ok(
  "R_blank_topic",
  parseBlogGroundedResearchRequest(validRequest({ topic: "" })).ok === false
);
ok(
  "R_oversize_topic",
  parseBlogGroundedResearchRequest(
    validRequest({ topic: "t".repeat(engine.MAX_TOPIC_CHARS + 1) })
  ).ok === false
);
{
  const parsed = parseBlogGroundedResearchRequest(
    validRequest({ intent: null })
  );
  ok("R_null_intent_accept", parsed.ok === true && parsed.value.intent === null);
}
{
  const parsed = parseBlogGroundedResearchRequest(
    validRequest({ intent: "how to" })
  );
  ok(
    "R_valid_intent_accept",
    parsed.ok === true && parsed.value.intent === "how to"
  );
}
{
  const parsed = parseBlogGroundedResearchRequest(
    validRequest({ intent: "   " })
  );
  ok(
    "R_blank_intent_null",
    parsed.ok === true && parsed.value.intent === null
  );
}
ok(
  "R_oversize_intent",
  parseBlogGroundedResearchRequest(
    validRequest({ intent: "i".repeat(engine.MAX_INTENT_CHARS + 1) })
  ).ok === false
);
ok(
  "R_extra_root_field",
  parseBlogGroundedResearchRequest(
    validRequest({ cmsId: 12 })
  ).ok === false
);
{
  const weird = validRequest();
  Object.defineProperty(weird, Symbol("x"), {
    enumerable: true,
    value: 1,
  });
  ok("R_symbol_field", parseBlogGroundedResearchRequest(weird).ok === false);
}
{
  let getterRan = false;
  const risky = {
    provider: "openai",
    task: "research_blog_evidence",
    opportunityId: "opp-x",
    topic: "Topic",
  };
  Object.defineProperty(risky, "intent", {
    enumerable: true,
    get() {
      getterRan = true;
      return "leak";
    },
  });
  const parsed = parseBlogGroundedResearchRequest(risky);
  ok("R_getter_reject", parsed.ok === false);
  ok("R_getter_not_executed", getterRan === false);
}
{
  class Req {}
  const obj = new Req();
  obj.provider = "openai";
  obj.task = "research_blog_evidence";
  obj.opportunityId = "opp-x";
  obj.topic = "Topic";
  ok("R_class_object_reject", parseBlogGroundedResearchRequest(obj).ok === false);
}
ok(
  "R_array_reject",
  parseBlogGroundedResearchRequest([]).ok === false
);
ok(
  "R_providers_exact",
  deepEqual([...BLOG_GROUNDED_RESEARCH_PROVIDERS], ["openai"])
);
ok(
  "R_task_exact",
  BLOG_GROUNDED_RESEARCH_TASK === "research_blog_evidence"
);

// ---------- ERROR TAXONOMY ----------
console.log("--- ERROR TAXONOMY ---");

const expectedStatus = {
  invalid_request: 400,
  research_busy: 429,
  request_aborted: 499,
  malformed_provider_output: 502,
  grounding_unavailable: 502,
  provider_not_configured: 503,
  provider_timeout: 503,
  provider_upstream: 503,
};

for (const code of BLOG_GROUNDED_RESEARCH_FAILURE_CODES) {
  const status = blogGroundedResearchFailureStatus(code);
  const failure = createBlogGroundedResearchFailure(code);
  ok(
    `E_status_${code}`,
    status === expectedStatus[code] &&
      failure.ok === false &&
      failure.code === code &&
      failure.status === expectedStatus[code]
  );
  ok(
    `E_sanitized_${code}`,
    typeof failure.message === "string" &&
      failure.message.length > 0 &&
      !/api[_-]?key|sk-|AIza|password|secret|stack|Exception/i.test(
        failure.message
      )
  );
}

ok("E_400", expectedStatus.invalid_request === 400);
ok("E_429", expectedStatus.research_busy === 429);
ok("E_499", expectedStatus.request_aborted === 499);
ok(
  "E_502",
  expectedStatus.malformed_provider_output === 502 &&
    expectedStatus.grounding_unavailable === 502
);
ok(
  "E_503",
  expectedStatus.provider_not_configured === 503 &&
    expectedStatus.provider_timeout === 503 &&
    expectedStatus.provider_upstream === 503
);

{
  const bad = createBlogGroundedResearchFailure("not_a_real_code");
  ok(
    "E_arbitrary_code_falls_closed",
    bad.code === "invalid_request" && bad.status === 400
  );
}
{
  // Factory ignores extra args / cannot accept arbitrary status
  const f = createBlogGroundedResearchFailure;
  const out = f.length === 1
    ? createBlogGroundedResearchFailure("provider_timeout")
    : createBlogGroundedResearchFailure("provider_timeout", 500, "RAW UPSTREAM BODY sk-secret");
  ok(
    "E_no_raw_upstream_message",
    out.status === 503 &&
      out.code === "provider_timeout" &&
      !/RAW UPSTREAM|sk-secret|500/.test(out.message)
  );
  ok(
    "E_arbitrary_status_prevented",
    out.status === 503 && out.status !== 500
  );
}

// ---------- RESOURCE CONTRACT ----------
console.log("--- RESOURCE CONTRACT ---");

ok(
  "C_attempts_one",
  BLOG_GROUNDED_RESEARCH_MAX_PROVIDER_ATTEMPTS === 1
);
ok(
  "C_inflight_one",
  BLOG_GROUNDED_RESEARCH_MAX_IN_FLIGHT_PER_PROCESS === 1
);
ok(
  "C_timeout_bounded",
  Number.isFinite(BLOG_GROUNDED_RESEARCH_PROVIDER_TIMEOUT_MS) &&
    BLOG_GROUNDED_RESEARCH_PROVIDER_TIMEOUT_MS > 0 &&
    BLOG_GROUNDED_RESEARCH_PROVIDER_TIMEOUT_MS <= 45_000
);
ok(
  "C_raw_bytes_bounded",
  Number.isFinite(BLOG_GROUNDED_RESEARCH_MAX_RAW_RESPONSE_BYTES) &&
    BLOG_GROUNDED_RESEARCH_MAX_RAW_RESPONSE_BYTES > 0 &&
    BLOG_GROUNDED_RESEARCH_MAX_RAW_RESPONSE_BYTES <= 262_144
);

ok("S_no_fetch", !/\bfetch\s*\(/.test(contractSrc));
ok("S_no_setTimeout", !/\bsetTimeout\s*\(/.test(contractSrc));
ok("S_no_setInterval", !/\bsetInterval\s*\(/.test(contractSrc));
ok("S_no_AbortController", !/\bAbortController\b/.test(contractSrc));
ok("S_no_Promise_race", !/Promise\.race/.test(contractSrc));
ok("S_no_process_env", !/process\.env/.test(contractSrc));
ok("S_no_mysql", !/\bmysql\b/.test(contractSrc));
ok("S_no_db_import", !/@\/lib\/db|\bfrom ["']\.\/db["']/.test(contractSrc));
ok(
  "S_no_openai_sdk",
  !/from ["']openai["']|require\(["']openai["']\)/.test(contractSrc)
);
ok(
  "S_no_gemini_sdk",
  !/@google\/generative-ai|@google\/genai|googleapis/.test(contractSrc)
);
ok("S_no_child_process", !/child_process/.test(contractSrc));
ok("S_no_worker_threads", !/worker_threads/.test(contractSrc));
ok("S_no_cron", !/\bcron\b/.test(contractSrc));
ok(
  "S_no_fallback_chain",
  !/fallbackProviders|providerOrder|retryCount|backoff/.test(contractSrc)
);

// ---------- GRAPH ISOLATION ----------
console.log("--- GRAPH ISOLATION ---");

ok("G_no_seoAi_import", !/@\/lib\/seoAi\b|seoAiServer/.test(contractSrc));
ok("G_no_adminAuth", !/adminAuth|recoveryAdminAuth/.test(contractSrc));
ok("G_no_rateLimit", !/rateLimit|rate-limit/.test(contractSrc));
ok("G_no_NextApi", !/NextApiRequest|next\/server|next\/headers/.test(contractSrc));

const seoAi = read("lib/seoAi.ts");
const seoAiServer = read("lib/seoAiServer.ts");
const adminSeoAi = read("pages/api/admin-seo-ai.ts");
ok(
  "G_seoAi_no_r0_import",
  !/blogGroundedResearchContracts/.test(seoAi)
);
ok(
  "G_seoAiServer_no_r0_import",
  !/blogGroundedResearchContracts/.test(seoAiServer)
);
ok(
  "G_admin_seo_ai_no_r0_import",
  !/blogGroundedResearchContracts/.test(adminSeoAi)
);
ok(
  "G_reuses_ab7a_types",
  /BlogResearchProviderOutput|BlogResearchGrounding/.test(contractSrc) &&
    /blogResearchEvidence/.test(contractSrc)
);
ok(
  "G_reuses_engine_bounds",
  /MAX_OPPORTUNITY_ID_CHARS|MAX_TOPIC_CHARS|MAX_INTENT_CHARS/.test(contractSrc)
);
ok(
  "G_no_validateBlogResearchEvidence_call",
  !/validateBlogResearchEvidence/.test(contractSrc)
);

console.log(`\nAB-7B R0 results: ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
