/**
 * AB-7A — grounded Blog research evidence contract tests.
 * Executes the real TypeScript exports without DB, HTTP, providers, or CMS.
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

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function loadTsModule(relativePath) {
  const source = read(relativePath);
  const { outputText } = ts.transpileModule(source, {
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
      const base = path.resolve(path.dirname(path.join(ROOT, relativePath)), id);
      if (fs.existsSync(base + ".ts")) {
        return loadTsModule(path.relative(ROOT, base + ".ts").replace(/\\/g, "/"));
      }
    }
    return require(id);
  };
  const execute = new Function("exports", "module", "require", outputText);
  execute(sandbox.exports, sandbox.module, localRequire);
  return sandbox.module.exports && Object.keys(sandbox.module.exports).length
    ? sandbox.module.exports
    : sandbox.exports;
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

const evidenceSource = read("lib/blogResearchEvidence.ts");
const engine = loadTsModule("lib/blogOpportunityEngine.ts");
const evidence = loadTsModule("lib/blogResearchEvidence.ts");
const {
  MAX_BLOG_RESEARCH_CLAIMS,
  MAX_BLOG_RESEARCH_GROUNDED_URLS,
  MAX_BLOG_RESEARCH_SEARCH_QUERIES,
  MAX_BLOG_RESEARCH_SOURCES,
  MAX_BLOG_RESEARCH_SUMMARY_CHARS,
  MAX_BLOG_RESEARCH_CLAIM_CHARS,
  MAX_BLOG_RESEARCH_SOURCE_TITLE_CHARS,
  MAX_BLOG_RESEARCH_UNKNOWN_CHARS,
  normalizeBlogResearchUrl,
  toBlogOpportunityEvidenceState,
  validateBlogResearchEvidence,
} = evidence;

console.log("\nAB-7A Grounded Blog Research Evidence\n");

function makeBundle(options = {}) {
  const sourceCount = options.sourceCount ?? 2;
  const claimCount = options.claimCount ?? Math.max(2, sourceCount);
  const sources = Array.from({ length: sourceCount }, (_, index) => ({
    id: `s${index + 1}`,
    title: `Independent Source ${index + 1}`,
    url: `https://source${index + 1}.example.com/research?item=${index + 1}`,
    publishedAt: index === 0 ? "2026-01-10" : null,
  }));
  const claims = Array.from({ length: claimCount }, (_, index) => ({
    claim: `Supported research claim ${index + 1}`,
    sourceIds: [`s${(index % Math.max(sourceCount, 1)) + 1}`],
  }));
  const groundedUrls = sources.map((source) => source.url);
  const requestedGroundingCount = options.groundingCount ?? groundedUrls.length;
  while (groundedUrls.length < requestedGroundingCount) {
    const next = groundedUrls.length + 1;
    groundedUrls.push(`https://grounding${next}.example.net/result?q=${next}`);
  }
  groundedUrls.length = Math.min(groundedUrls.length, requestedGroundingCount);
  const queryCount = options.queryCount ?? 2;
  return {
    subject: {
      opportunityId: "opp-firestick-speed",
      topic: "How to improve Firestick performance safely",
      intent: "informational troubleshooting",
    },
    output: {
      summary: "Independent sources support a concise troubleshooting overview.",
      sources,
      claims,
      unknowns: ["Device-specific behavior may vary by Fire OS version."],
    },
    grounding: {
      groundedUrls,
      searchQueries: Array.from(
        { length: queryCount },
        (_, index) => `firestick performance research ${index + 1}`
      ),
    },
  };
}

function evaluate(bundle) {
  return validateBlogResearchEvidence(
    bundle.subject,
    bundle.output,
    bundle.grounding
  );
}

function failedWith(result, reasonCode) {
  return (
    result &&
    result.ok === false &&
    result.evidenceState === "missing" &&
    deepEqual(result.sources, []) &&
    deepEqual(result.claims, []) &&
    deepEqual(result.unknowns, []) &&
    deepEqual(result.searchQueries, []) &&
    result.reasonCodes.includes(reasonCode)
  );
}

// A/B/AB. Valid grounded bundle and citation graph.
const validBundle = makeBundle();
const validResult = evaluate(validBundle);
ok("A_valid_two_source_bundle_ready", validResult.ok === true);
ok(
  "A_ready_reason",
  validResult.ok && deepEqual(validResult.reasonCodes, ["GROUNDED_EVIDENCE_READY"])
);
ok(
  "B_claims_reference_known_sources",
  validResult.ok &&
    validResult.claims.length === 2 &&
    validResult.claims.every((claim) => claim.sourceIds.length === 1)
);
ok(
  "B_source_and_claim_order_preserved",
  validResult.ok &&
    deepEqual(validResult.sources.map((source) => source.id), ["s1", "s2"]) &&
    deepEqual(validResult.claims.map((claim) => claim.claim), [
      "Supported research claim 1",
      "Supported research claim 2",
    ])
);
ok("AB_success_evidence_state_ready", validResult.evidenceState === "ready");

// C/D. Every source must be independently grounded; one miss fails all.
const ungrounded = makeBundle();
ungrounded.grounding.groundedUrls = [ungrounded.output.sources[0].url];
const ungroundedResult = evaluate(ungrounded);
ok("C_source_must_appear_in_grounding", failedWith(ungroundedResult, "UNGROUNDED_SOURCE"));
ok(
  "D_one_ungrounded_fails_whole_result",
  failedWith(ungroundedResult, "UNGROUNDED_SOURCE") &&
    !JSON.stringify(ungroundedResult).includes("source1.example.com")
);

// E. One source is insufficient.
const oneSource = makeBundle({ sourceCount: 1, claimCount: 2 });
ok("E_one_source_missing", failedWith(evaluate(oneSource), "INSUFFICIENT_SOURCES"));

// F/G. External source policy.
const selfOnly = makeBundle();
selfOnly.output.sources[0].url = "https://firestick4uk.com/blog/one";
selfOnly.output.sources[1].url = "https://www.firestick4uk.com/blog/two";
selfOnly.grounding.groundedUrls = selfOnly.output.sources.map((source) => source.url);
ok("F_self_site_only_rejected", failedWith(evaluate(selfOnly), "NO_EXTERNAL_SOURCE"));

const subdomainOnly = makeBundle();
subdomainOnly.output.sources[0].url = "https://firestick4uk.com/blog/one";
subdomainOnly.output.sources[1].url = "https://support.firestick4uk.com/article/two";
subdomainOnly.grounding.groundedUrls = subdomainOnly.output.sources.map(
  (source) => source.url
);
ok("F_own_subdomains_not_external", failedWith(evaluate(subdomainOnly), "NO_EXTERNAL_SOURCE"));

const mixedSources = makeBundle();
mixedSources.output.sources[0].url = "https://firestick4uk.com/blog/one";
mixedSources.grounding.groundedUrls = mixedSources.output.sources.map(
  (source) => source.url
);
ok("G_self_plus_external_allowed", evaluate(mixedSources).ok === true);

// H/I. Provider-output duplicate ambiguity fails closed.
const duplicateId = makeBundle();
duplicateId.output.sources[1].id = "s1";
duplicateId.output.claims[1].sourceIds = ["s1"];
ok("H_duplicate_source_id", failedWith(evaluate(duplicateId), "DUPLICATE_SOURCE_ID"));

const duplicateUrl = makeBundle();
duplicateUrl.output.sources[1].url =
  "https://SOURCE1.example.com/research?item=1#decorative-fragment";
duplicateUrl.grounding.groundedUrls.push(duplicateUrl.output.sources[1].url);
ok("I_duplicate_normalized_url", failedWith(evaluate(duplicateUrl), "DUPLICATE_SOURCE_URL"));

// J/K/L/M. Closed citation graph.
const unknownReference = makeBundle();
unknownReference.output.claims[0].sourceIds = ["missing-source"];
ok(
  "J_unknown_source_id_in_claim",
  failedWith(evaluate(unknownReference), "INVALID_CLAIM_REFERENCE")
);

const duplicateReference = makeBundle();
duplicateReference.output.claims[0].sourceIds = ["s1", "s1"];
ok(
  "K_duplicate_source_reference",
  failedWith(evaluate(duplicateReference), "INVALID_CLAIM_REFERENCE")
);

const unusedSource = makeBundle();
unusedSource.output.claims[0].sourceIds = ["s1"];
unusedSource.output.claims[1].sourceIds = ["s1"];
ok("L_unused_source_rejected", failedWith(evaluate(unusedSource), "UNUSED_SOURCE"));

const uncitedClaim = makeBundle();
uncitedClaim.output.claims[0].sourceIds = [];
ok(
  "M_claim_with_zero_sources",
  failedWith(evaluate(uncitedClaim), "INVALID_CLAIM_REFERENCE")
);

const fiveReferences = makeBundle({ sourceCount: 5, claimCount: 5 });
fiveReferences.output.claims[0].sourceIds = ["s1", "s2", "s3", "s4", "s5"];
ok(
  "M_claim_max_four_sources",
  failedWith(evaluate(fiveReferences), "INVALID_CLAIM_REFERENCE")
);

// N/O/P/U. URL policy and deterministic comparison normalization.
const validUrls = [
  ["https://example.com/page", "https://example.com/page"],
  ["https://Example.com/page", "https://example.com/page"],
  ["https://example.com/page?x=1", "https://example.com/page?x=1"],
  ["https://example.com/page#section", "https://example.com/page"],
  ["https://firestick4uk.com/blog/example", "https://firestick4uk.com/blog/example"],
  ["https://example.com:443/page", "https://example.com/page"],
];
for (const [raw, expected] of validUrls) {
  ok(`N_valid_url_${raw}`, normalizeBlogResearchUrl(raw) === expected);
}

const malformedUrls = [
  "http://example.com",
  "//example.com",
  "https://user:pass@example.com/x",
  "https://localhost/x",
  "https://sub.localhost/x",
  "https://machine.local/x",
  "https://127.0.0.1/x",
  "https://[::1]/x",
  "javascript:alert(1)",
  "data:text/plain,x",
  "file:///x",
  "#fragment-only",
  "not a url",
  "https://example.com/path with space",
  "https://example.com/path\nnext",
];
for (const [index, rawUrl] of malformedUrls.entries()) {
  ok(`N_reject_url_${index + 1}`, normalizeBlogResearchUrl(rawUrl) === null);
  const malformed = makeBundle();
  malformed.output.sources[0].url = rawUrl;
  malformed.grounding.groundedUrls[0] = rawUrl;
  ok(
    `N_bundle_reject_url_${index + 1}`,
    failedWith(evaluate(malformed), "INVALID_SOURCE_URL")
  );
}

const fragmentBundle = makeBundle();
fragmentBundle.output.sources[0].url = "https://Example.com/article#model-fragment";
fragmentBundle.grounding.groundedUrls[0] = "https://example.com/article#tool-fragment";
const fragmentResult = evaluate(fragmentBundle);
ok(
  "O_fragment_removed_deterministically",
  fragmentResult.ok && fragmentResult.sources[0].url === "https://example.com/article"
);

const groundingNormalization = makeBundle();
groundingNormalization.output.sources[0].url = "https://example.com/article";
groundingNormalization.grounding.groundedUrls[0] =
  "https://EXAMPLE.com:443/article#provider";
ok("P_grounding_url_normalization", evaluate(groundingNormalization).ok === true);

const duplicateGrounding = makeBundle();
duplicateGrounding.grounding.groundedUrls.push(
  `${duplicateGrounding.output.sources[0].url}#duplicate`
);
ok("P_grounding_duplicates_deduplicated", evaluate(duplicateGrounding).ok === true);

// Q. Source bounds.
ok("Q_source_constant", MAX_BLOG_RESEARCH_SOURCES === 12);
ok("Q_two_sources_accepted", evaluate(makeBundle({ sourceCount: 2 })).ok === true);
ok(
  "Q_twelve_sources_accepted",
  evaluate(makeBundle({ sourceCount: 12, claimCount: 12 })).ok === true
);
ok(
  "Q_thirteen_sources_rejected",
  failedWith(
    evaluate(makeBundle({ sourceCount: 13, claimCount: 12 })),
    "INVALID_INPUT"
  )
);

// R. Claim bounds.
ok("R_claim_constant", MAX_BLOG_RESEARCH_CLAIMS === 12);
ok("R_two_claims_accepted", evaluate(makeBundle({ claimCount: 2 })).ok === true);
ok("R_twelve_claims_accepted", evaluate(makeBundle({ claimCount: 12 })).ok === true);
ok(
  "R_thirteen_claims_rejected",
  failedWith(evaluate(makeBundle({ claimCount: 13 })), "INVALID_INPUT")
);
const oneClaim = makeBundle({ claimCount: 1 });
oneClaim.output.claims[0].sourceIds = ["s1", "s2"];
ok("R_one_claim_insufficient", failedWith(evaluate(oneClaim), "INSUFFICIENT_CLAIMS"));

// S/T. Grounding metadata bounds.
ok("S_grounding_constant", MAX_BLOG_RESEARCH_GROUNDED_URLS === 50);
ok("S_fifty_grounded_urls", evaluate(makeBundle({ groundingCount: 50 })).ok === true);
ok(
  "S_fifty_one_grounded_urls_rejected",
  failedWith(evaluate(makeBundle({ groundingCount: 51 })), "INVALID_INPUT")
);
ok("T_query_constant", MAX_BLOG_RESEARCH_SEARCH_QUERIES === 12);
ok("T_twelve_queries", evaluate(makeBundle({ queryCount: 12 })).ok === true);
ok(
  "T_thirteen_queries_rejected",
  failedWith(evaluate(makeBundle({ queryCount: 13 })), "INVALID_INPUT")
);

// U/V. Subject and compact text bounds reuse AB-3 limits.
const maxSubject = makeBundle();
maxSubject.subject = {
  opportunityId: "o".repeat(engine.MAX_OPPORTUNITY_ID_CHARS),
  topic: "t".repeat(engine.MAX_TOPIC_CHARS),
  intent: "i".repeat(engine.MAX_INTENT_CHARS),
};
ok("U_subject_max_bounds_accepted", evaluate(maxSubject).ok === true);
for (const [name, field, limit] of [
  ["opportunity_id", "opportunityId", engine.MAX_OPPORTUNITY_ID_CHARS],
  ["topic", "topic", engine.MAX_TOPIC_CHARS],
  ["intent", "intent", engine.MAX_INTENT_CHARS],
]) {
  const oversized = makeBundle();
  oversized.subject[field] = "x".repeat(limit + 1);
  ok(`U_${name}_oversize`, failedWith(evaluate(oversized), "INVALID_INPUT"));
}

const maxText = makeBundle();
maxText.output.summary = "s".repeat(MAX_BLOG_RESEARCH_SUMMARY_CHARS);
maxText.output.sources[0].title = "t".repeat(MAX_BLOG_RESEARCH_SOURCE_TITLE_CHARS);
maxText.output.claims[0].claim = "c".repeat(MAX_BLOG_RESEARCH_CLAIM_CHARS);
maxText.output.unknowns = ["u".repeat(MAX_BLOG_RESEARCH_UNKNOWN_CHARS)];
ok("V_text_max_bounds_accepted", evaluate(maxText).ok === true);
for (const [name, mutate] of [
  ["summary", (bundle) => (bundle.output.summary = "s".repeat(MAX_BLOG_RESEARCH_SUMMARY_CHARS + 1))],
  ["title", (bundle) => (bundle.output.sources[0].title = "t".repeat(MAX_BLOG_RESEARCH_SOURCE_TITLE_CHARS + 1))],
  ["claim", (bundle) => (bundle.output.claims[0].claim = "c".repeat(MAX_BLOG_RESEARCH_CLAIM_CHARS + 1))],
  ["unknown", (bundle) => (bundle.output.unknowns = ["u".repeat(MAX_BLOG_RESEARCH_UNKNOWN_CHARS + 1)])],
]) {
  const oversized = makeBundle();
  mutate(oversized);
  ok(`V_${name}_oversize`, failedWith(evaluate(oversized), "INVALID_INPUT"));
}

// W. Plain-text only.
for (const [name, mutate] of [
  ["subject", (bundle) => (bundle.subject.topic = "<script>alert(1)</script>")],
  ["summary", (bundle) => (bundle.output.summary = "<b>Unsupported HTML</b>")],
  ["title", (bundle) => (bundle.output.sources[0].title = "<em>Source</em>")],
  ["claim", (bundle) => (bundle.output.claims[0].claim = "<script>x</script>")],
  ["unknown", (bundle) => (bundle.output.unknowns = ["<img src=x>"])],
  ["query", (bundle) => (bundle.grounding.searchQueries[0] = "<form>query</form>")],
]) {
  const html = makeBundle();
  mutate(html);
  ok(`W_reject_html_${name}`, failedWith(evaluate(html), "INVALID_INPUT"));
}

// X/AE. Strict schemas reject injected metrics, prose, excerpts, and scores.
for (const [name, mutate] of [
  ["subject_search_volume", (bundle) => (bundle.subject.searchVolume = 1000)],
  ["subject_traffic", (bundle) => (bundle.subject.traffic = 500)],
  ["provider_confidence", (bundle) => (bundle.output.providerConfidence = 0.98)],
  ["provider_html", (bundle) => (bundle.output.html = "<p>article</p>")],
  ["source_excerpt", (bundle) => (bundle.output.sources[0].excerpt = "copied text")],
  ["source_authority", (bundle) => (bundle.output.sources[0].authorityScore = 99)],
  ["claim_truth_score", (bundle) => (bundle.output.claims[0].truthScore = 99)],
  ["grounding_confidence", (bundle) => (bundle.grounding.confidence = 0.99)],
]) {
  const injected = makeBundle();
  mutate(injected);
  ok(`X_reject_${name}`, failedWith(evaluate(injected), "INVALID_INPUT"));
}
ok(
  "AE_no_fake_metric_schema",
  !/\b(?:searchVolume|traffic|ranking|revenue|conversion|commercialScore|keywordDifficulty|providerConfidence|manualScore|authorityScore|truthScore|SEOImpactScore|confidence)\s*:/i.test(
    evidenceSource
  )
);
ok(
  "AE_no_copyright_payload_fields",
  !/\b(?:excerpt|quote|rawHtml|pageContent|fullText)\s*:/i.test(evidenceSource)
);

// Y. Determinism.
const deterministicInput = makeBundle();
const deterministicOne = evaluate(deterministicInput);
const deterministicTwo = evaluate(deterministicInput);
ok("Y_repeat_deep_equal", deepEqual(deterministicOne, deterministicTwo));

// Z. Frozen input immutability.
const frozen = deepFreeze(makeBundle());
const frozenBefore = JSON.stringify(frozen);
let frozenThrew = false;
let frozenResult;
try {
  frozenResult = evaluate(frozen);
} catch {
  frozenThrew = true;
}
ok("Z_frozen_inputs_do_not_throw", frozenThrew === false);
ok("Z_frozen_inputs_validate", frozenResult?.ok === true);
ok("Z_inputs_not_mutated", JSON.stringify(frozen) === frozenBefore);

// AA/AC/AD. Failure leakage and evidence-state mapping.
ok(
  "AA_failure_never_exposes_partial_sources",
  ungroundedResult.ok === false &&
    !Object.prototype.hasOwnProperty.call(ungroundedResult, "subject") &&
    !Object.prototype.hasOwnProperty.call(ungroundedResult, "summary") &&
    deepEqual(ungroundedResult.sources, []) &&
    deepEqual(ungroundedResult.claims, [])
);
ok(
  "AC_failure_evidence_state_missing",
  ungroundedResult.evidenceState === "missing" &&
    toBlogOpportunityEvidenceState(ungroundedResult) === "missing"
);
ok(
  "AB_ready_adapter",
  toBlogOpportunityEvidenceState(validResult) === "ready"
);
ok(
  "AD_stale_never_fabricated",
  validResult.evidenceState !== "stale" &&
    ungroundedResult.evidenceState !== "stale" &&
    toBlogOpportunityEvidenceState(validResult) !== "stale" &&
    toBlogOpportunityEvidenceState(ungroundedResult) !== "stale"
);

// Additional strict-structure checks.
const sparseSources = makeBundle();
sparseSources.output.sources = new Array(2);
ok("strict_sparse_source_array", failedWith(evaluate(sparseSources), "INVALID_INPUT"));
const accessorOutput = {};
Object.defineProperty(accessorOutput, "summary", {
  enumerable: true,
  get: () => "must not run",
});
Object.defineProperty(accessorOutput, "sources", { enumerable: true, value: [] });
Object.defineProperty(accessorOutput, "claims", { enumerable: true, value: [] });
ok(
  "strict_accessor_output_rejected",
  failedWith(
    validateBlogResearchEvidence(makeBundle().subject, accessorOutput, makeBundle().grounding),
    "INVALID_INPUT"
  )
);

// AF. Pure boundary and cross-phase non-wiring.
ok(
  "AF_only_ab3_bounds_imported",
  /from\s+["']@\/lib\/blogOpportunityEngine["']/.test(evidenceSource) &&
    !/from\s+["']@\/lib\/(?!blogOpportunityEngine)[^"']+["']/.test(evidenceSource)
);
ok("AF_no_db", !/from\s+["'][^"']*(?:db|mysql)[^"']*["']/.test(evidenceSource));
ok("AF_no_fetch_http", !/\bfetch\s*\(|from\s+["']https?:/.test(evidenceSource));
ok(
  "AF_no_provider_import",
  !/from\s+["'][^"']*(?:openai|gemini|provider)[^"']*["']|require\(["'][^"']*(?:openai|gemini|provider)[^"']*["']\)/i.test(
    evidenceSource
  )
);
ok("AF_no_env", !/process\.env/.test(evidenceSource));
ok("AF_no_fs", !/from\s+["']fs["']|require\(["']fs["']\)/.test(evidenceSource));
ok(
  "AF_no_persistence",
  !/blogPersistenceServer|recordAdminAudit|recordContentRevision|INSERT\s+INTO|UPDATE\s+BlogPosts/i.test(
    evidenceSource
  )
);
ok("AF_no_scheduler", !/schedulerEligible|scheduleBlog|cron/i.test(evidenceSource));
ok("AF_no_time_random", !/Date\.now|new\s+Date\s*\(|Math\.random/.test(evidenceSource));
// AB-7B intentionally adds the provider/API wiring that the original phase
// boundary prohibited; keep the forward boundary at the opportunity engine.
ok(
  "AF_only_authorized_ab7b_runtime_wiring",
  read("pages/api/admin-seo-ai.ts").includes("research_blog_evidence") &&
    read("lib/seoAiServer.ts").includes("blogResearchEvidence") &&
    !read("lib/blogOpportunityEngine.ts").includes("blogResearchEvidence")
);

console.log(`\nAB-7A results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
