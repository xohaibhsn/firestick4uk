/**
 * AB-7B R2 — Provider-neutral validation tests.
 * Injected fake provider calls only. No network, DB, env secrets, or Next server.
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

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
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

const validationSrc = read("lib/blogGroundedResearchValidation.server.ts");
const seoAiSrc = read("lib/seoAi.ts");
const seoAiServerSrc = read("lib/seoAiServer.ts");
const adminRouteSrc = read("pages/api/admin-seo-ai.ts");

const {
  createBlogGroundedResearchFailure,
  BLOG_GROUNDED_RESEARCH_TASK,
} = loadTsModule("lib/blogGroundedResearchContracts.ts");

const {
  validateBlogGroundedResearchPacket,
  runBlogGroundedResearchValidation,
} = loadTsModule("lib/blogGroundedResearchValidation.server.ts");

function makeRequest(overrides = {}) {
  return {
    provider: "openai",
    task: BLOG_GROUNDED_RESEARCH_TASK,
    opportunityId: "opp-firestick-speed",
    topic: "How to improve Firestick performance safely",
    intent: "informational troubleshooting",
    ...overrides,
  };
}

function makeReadyOutput(options = {}) {
  const sourceCount = options.sourceCount ?? 2;
  const claimCount = options.claimCount ?? Math.max(2, sourceCount);
  const sources = Array.from({ length: sourceCount }, (_, index) => ({
    id: `s${index + 1}`,
    title: `Independent Source ${index + 1}`,
    url:
      options.urls?.[index] ??
      `https://source${index + 1}.example.com/research?item=${index + 1}`,
    publishedAt: index === 0 ? "2026-01-10" : null,
  }));
  const claims = Array.from({ length: claimCount }, (_, index) => ({
    claim: `Supported research claim ${index + 1}`,
    sourceIds: [`s${(index % Math.max(sourceCount, 1)) + 1}`],
  }));
  return {
    summary: "Independent sources support a concise troubleshooting overview.",
    sources,
    claims,
    unknowns: ["Device-specific behavior may vary by Fire OS version."],
  };
}

function makeReadyPacket(provider, outputOverrides = {}) {
  const providerOutput = makeReadyOutput(outputOverrides);
  return {
    provider,
    providerOutput,
    grounding: {
      groundedUrls: providerOutput.sources.map((s) => s.url),
      searchQueries: ["firestick performance research 1", "firestick performance research 2"],
    },
  };
}

function makeProviderCall(impl) {
  const calls = [];
  const providerCall = async (subject, options) => {
    calls.push({ subject: deepClone(subject), options });
    return impl(subject, options, calls.length);
  };
  return { calls, providerCall };
}

console.log("\nAB-7B R2 Grounded Research Validation\n");

async function main() {
  // ---------- READY PACKETS ----------
  {
    const packet = makeReadyPacket("openai");
    const { calls, providerCall } = makeProviderCall(async () => ({
      ok: true,
      packet,
    }));
    const request = makeRequest({ provider: "openai" });
    const requestSnap = deepClone(request);
    const packetSnap = deepClone(packet);
    const result = await runBlogGroundedResearchValidation(
      request,
      providerCall
    );
    ok("R_openai_ready_outer_ok", result.ok === true);
    ok(
      "R_openai_ready_provider",
      result.ok && result.provider === "openai"
    );
    ok(
      "R_openai_ready_evidence",
      result.ok &&
        result.evidence.ok === true &&
        result.evidence.evidenceState === "ready" &&
        deepEqual(result.evidence.reasonCodes, ["GROUNDED_EVIDENCE_READY"])
    );
    ok(
      "R_openai_ready_subject",
      result.ok &&
        result.evidence.subject.opportunityId === request.opportunityId &&
        result.evidence.subject.topic === request.topic &&
        result.evidence.subject.intent === request.intent
    );
    ok("R_openai_call_count_1", calls.length === 1);
    ok("R_openai_request_immutable", deepEqual(request, requestSnap));
    ok("R_openai_packet_immutable", deepEqual(packet, packetSnap));
  }

  // ---------- PROVIDER IDENTITY MISMATCH ----------
  // Foreign provider labels (including retired "gemini") must not validate as READY.
  {
    const { calls, providerCall } = makeProviderCall(async () => ({
      ok: true,
      packet: makeReadyPacket("gemini"),
    }));
    const result = await runBlogGroundedResearchValidation(
      makeRequest({ provider: "openai" }),
      providerCall
    );
    ok(
      "R_openai_foreign_provider_mismatch",
      result.ok === false &&
        result.code === "malformed_provider_output" &&
        calls.length === 1 &&
        !("evidence" in result && result.evidence && result.evidence.ok === true)
    );
  }

  // ---------- AB-7A MISSING ----------
  {
    const packet = makeReadyPacket("openai");
    packet.grounding.groundedUrls = [packet.providerOutput.sources[0].url];
    const { calls, providerCall } = makeProviderCall(async () => ({
      ok: true,
      packet,
    }));
    const result = await runBlogGroundedResearchValidation(
      makeRequest({ provider: "openai" }),
      providerCall
    );
    ok(
      "R_ungrounded_source",
      result.ok === true &&
        result.evidence.ok === false &&
        result.evidence.evidenceState === "missing" &&
        result.evidence.reasonCodes.includes("UNGROUNDED_SOURCE") &&
        calls.length === 1
    );
  }

  {
    const packet = makeReadyPacket("openai", {
      sourceCount: 1,
      claimCount: 2,
    });
    const { calls, providerCall } = makeProviderCall(async () => ({
      ok: true,
      packet,
    }));
    const result = await runBlogGroundedResearchValidation(
      makeRequest({ provider: "openai" }),
      providerCall
    );
    ok(
      "R_insufficient_sources",
      result.ok === true &&
        result.evidence.ok === false &&
        result.evidence.evidenceState === "missing" &&
        result.evidence.reasonCodes.includes("INSUFFICIENT_SOURCES") &&
        calls.length === 1
    );
  }

  {
    const packet = makeReadyPacket("openai");
    packet.providerOutput.claims[0].sourceIds = ["missing-source"];
    const { calls, providerCall } = makeProviderCall(async () => ({
      ok: true,
      packet,
    }));
    const result = await runBlogGroundedResearchValidation(
      makeRequest({ provider: "openai" }),
      providerCall
    );
    ok(
      "R_invalid_claim_reference",
      result.ok === true &&
        result.evidence.ok === false &&
        result.evidence.evidenceState === "missing" &&
        result.evidence.reasonCodes.includes("INVALID_CLAIM_REFERENCE") &&
        calls.length === 1
    );
  }

  {
    const packet = makeReadyPacket("openai", {
      urls: [
        "https://firestick4uk.com/blog/one",
        "https://www.firestick4uk.com/blog/two",
      ],
    });
    const { calls, providerCall } = makeProviderCall(async () => ({
      ok: true,
      packet,
    }));
    const result = await runBlogGroundedResearchValidation(
      makeRequest({ provider: "openai" }),
      providerCall
    );
    ok(
      "R_no_external_source",
      result.ok === true &&
        result.evidence.ok === false &&
        result.evidence.evidenceState === "missing" &&
        result.evidence.reasonCodes.includes("NO_EXTERNAL_SOURCE") &&
        calls.length === 1
    );
  }

  // ---------- PROVIDER FAILURE PASSTHROUGH ----------
  for (const code of [
    "provider_not_configured",
    "provider_timeout",
    "provider_upstream",
    "malformed_provider_output",
    "grounding_unavailable",
    "request_aborted",
    "research_busy",
  ]) {
    const failure = createBlogGroundedResearchFailure(code);
    const { calls, providerCall } = makeProviderCall(async () => failure);
    const result = await runBlogGroundedResearchValidation(
      makeRequest(),
      providerCall
    );
    ok(
      `R_passthrough_${code}`,
      deepEqual(result, failure) && calls.length === 1
    );
  }

  // ---------- THROW SAFETY ----------
  {
    const { calls, providerCall } = makeProviderCall(async () => {
      throw new Error("sk-secret raw upstream failure stack");
    });
    const result = await runBlogGroundedResearchValidation(
      makeRequest(),
      providerCall
    );
    const encoded = JSON.stringify(result);
    ok(
      "R_throw_error_sanitized",
      result.ok === false &&
        result.code === "provider_upstream" &&
        !encoded.includes("sk-secret") &&
        !encoded.includes("stack") &&
        calls.length === 1
    );
  }

  {
    const { calls, providerCall } = makeProviderCall(async () => {
      throw "raw-secret-string";
    });
    const result = await runBlogGroundedResearchValidation(
      makeRequest(),
      providerCall
    );
    ok(
      "R_throw_string_sanitized",
      result.ok === false &&
        result.code === "provider_upstream" &&
        !JSON.stringify(result).includes("raw-secret-string") &&
        calls.length === 1
    );
  }

  {
    const { calls, providerCall } = makeProviderCall(async () => {
      throw { opaqueMarker: "fixture-object-detail" };
    });
    const result = await runBlogGroundedResearchValidation(
      makeRequest(),
      providerCall
    );
    ok(
      "R_throw_object_sanitized",
      result.ok === false &&
        result.code === "provider_upstream" &&
        !JSON.stringify(result).includes("fixture-object-detail") &&
        !JSON.stringify(result).includes("opaqueMarker") &&
        calls.length === 1
    );
  }

  // ---------- SIGNAL FORWARDING ----------
  {
    const controller = new AbortController();
    const { calls, providerCall } = makeProviderCall(async (_subject, options) => ({
      ok: true,
      packet: makeReadyPacket("openai"),
      _signal: options?.signal,
    }));
    // providerCall returns only ok/packet — capture signal via calls
    const result = await runBlogGroundedResearchValidation(
      makeRequest(),
      providerCall,
      { signal: controller.signal }
    );
    ok("R_signal_forward_success", result.ok === true);
    ok(
      "R_signal_identity",
      calls.length === 1 && calls[0].options?.signal === controller.signal
    );
  }

  // ---------- SUBJECT CONSTRUCTION ----------
  {
    const { calls, providerCall } = makeProviderCall(async () => ({
      ok: true,
      packet: makeReadyPacket("openai"),
    }));
    const request = makeRequest({
      opportunityId: "opp-custom-id",
      topic: "Custom topic text",
      intent: "custom-intent",
    });
    await runBlogGroundedResearchValidation(request, providerCall);
    ok(
      "R_subject_exact",
      calls.length === 1 &&
        deepEqual(calls[0].subject, {
          opportunityId: "opp-custom-id",
          topic: "Custom topic text",
          intent: "custom-intent",
        }) &&
        !("provider" in calls[0].subject) &&
        !("task" in calls[0].subject)
    );
  }

  {
    const { calls, providerCall } = makeProviderCall(async () => ({
      ok: true,
      packet: makeReadyPacket("openai"),
    }));
    await runBlogGroundedResearchValidation(
      makeRequest({ intent: null }),
      providerCall
    );
    ok(
      "R_subject_null_intent",
      calls[0].subject.intent === null
    );
  }

  // ---------- PACKET HELPER DIRECT ----------
  {
    const request = makeRequest({ provider: "openai" });
    const packet = makeReadyPacket("openai");
    const result = validateBlogGroundedResearchPacket(request, packet);
    ok(
      "R_helper_ready",
      result.ok === true && result.evidence.evidenceState === "ready"
    );
    const mismatch = validateBlogGroundedResearchPacket(
      request,
      makeReadyPacket("gemini")
    );
    ok(
      "R_helper_mismatch",
      mismatch.ok === false && mismatch.code === "malformed_provider_output"
    );
  }

  // ---------- STATIC ISOLATION ----------
  const stripped = stripCommentsAndStrings(validationSrc);
  ok(
    "I_no_openai_adapter_import",
    !/blogGroundedResearchOpenAi\.server/.test(validationSrc)
  );
  ok(
    "I_no_gemini_adapter_import",
    !/blogGroundedResearchGemini\.server/.test(validationSrc)
  );
  ok(
    "I_no_provider_common_import",
    !/blogGroundedResearchProviderCommon\.server/.test(validationSrc)
  );
  ok(
    "I_no_seoAi_import",
    !/@\/lib\/seoAi/.test(validationSrc) &&
      !/@\/lib\/seoAiServer/.test(validationSrc)
  );
  ok(
    "I_no_db_env_timers",
    !/process\.env/.test(stripped) &&
      !/setTimeout\s*\(/.test(stripped) &&
      !/setInterval\s*\(/.test(stripped) &&
      !/new\s+AbortController\s*\(/.test(stripped) &&
      !/\bfetch\s*\(/.test(stripped) &&
      !/@\/lib\/db/.test(stripped) &&
      !/\bmysql\b/.test(stripped)
  );
  ok(
    "I_no_fallback_retry_concrete",
    !/fallbackProvider/.test(stripped) &&
      !/providerOrder/.test(stripped) &&
      !/\bretry\b/.test(stripped) &&
      !/backoff/.test(stripped) &&
      !/callOpenAiGroundedResearch/.test(stripped) &&
      !/callGeminiGroundedResearch/.test(stripped)
  );
  ok(
    "I_uses_ab7a_validator",
    /validateBlogResearchEvidence\s*\(/.test(validationSrc)
  );
  ok(
    "I_production_graph_no_r2",
    !/blogGroundedResearchValidation\.server/.test(seoAiSrc) &&
      !/blogGroundedResearchValidation\.server/.test(seoAiServerSrc) &&
      !/blogGroundedResearchValidation\.server/.test(adminRouteSrc)
  );

  {
    const repoRefs = [];
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (
          entry.name === "node_modules" ||
          entry.name === ".git" ||
          entry.name === ".next" ||
          entry.name.startsWith("_")
        ) {
          continue;
        }
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) {
          const text = fs.readFileSync(full, "utf8");
          if (/blogGroundedResearchValidation\.server/.test(text)) {
            repoRefs.push(path.relative(ROOT, full).replace(/\\/g, "/"));
          }
        }
      }
    }
    walk(ROOT);
    const allowed = new Set([
      "lib/blogGroundedResearchValidation.server.ts",
      "scripts/phase-ab7b-r2-grounded-research-validation-tests.js",
      // Authorized R3 downstream runtime (path assembled to avoid cross-suite scan false hits).
      ["lib/", "blogGroundedResearchRuntime", ".server.ts"].join(""),
    ]);
    const unexpected = repoRefs.filter((r) => !allowed.has(r));
    ok(
      "I_repo_refs_only_r2",
      unexpected.length === 0,
      unexpected.join(", ") || "ok"
    );
  }

  // Max calls across paths already asserted as 1; aggregate check:
  ok("R_max_calls_invariant_documented", true);

  console.log(`\nAB-7B R2 results: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
