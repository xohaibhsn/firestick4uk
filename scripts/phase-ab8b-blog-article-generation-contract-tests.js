/**
 * AB-8B — Blog article generation contract & deterministic validation tests.
 * Pure fixture evaluation only: no provider, DB, CMS, filesystem writes, or HTTP.
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

const contractsSrc = read("lib/blogArticleGenerationContracts.ts");
const validationSrc = read("lib/blogArticleGenerationValidation.ts");
const {
  BLOG_ARTICLE_GENERATION_TASK,
  BLOG_ARTICLE_GENERATION_INTENT,
  BLOG_ARTICLE_GENERATION_HOLD_CODES,
  MAX_ARTICLE_GENERATION_TITLE_CHARS,
} = loadTsModule("lib/blogArticleGenerationContracts.ts");
const {
  validateBlogArticleGenerationPreview,
  rejectStaleBlogArticleEvidenceState,
} = loadTsModule("lib/blogArticleGenerationValidation.ts");
const { MAX_TOPIC_CHARS, MAX_INTENT_CHARS } = loadTsModule(
  "lib/blogOpportunityEngine.ts"
);

console.log("\nAB-8B Blog Article Generation Contracts\n");

function substantiveBody(extra = "") {
  const base =
    "<p>This preview article explains practical Firestick setup guidance with enough independent detail to satisfy the substantive preview body floor for AB-8B validation. It remains generation-only and is not publication-authorized content.</p><h2>Practical steps</h2><p>Follow bounded troubleshooting steps, keep firmware current, and avoid unsupported third-party installs when improving streaming stability on Fire TV Stick devices in the UK.</p>";
  return base + (extra || "");
}

function makeEvidence(options = {}) {
  const topic =
    options.topic || "How to improve Firestick performance safely";
  const opportunityId = options.opportunityId || "opp-firestick-speed";
  const intent =
    options.intent === undefined ? "informational troubleshooting" : options.intent;
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
  const unknowns =
    options.unknowns !== undefined
      ? options.unknowns
      : ["Device-specific behavior may vary by Fire OS version."];
  return {
    subject: {
      opportunityId,
      topic,
      intent,
    },
    providerOutput: {
      summary: "Independent sources support a concise troubleshooting overview.",
      sources: options.sources || sources,
      claims: options.claims || claims,
      unknowns,
    },
    grounding:
      options.grounding === null
        ? null
        : options.grounding || {
            groundedUrls,
            searchQueries: ["firestick performance research"],
          },
  };
}

function makeCandidate(options = {}) {
  const topic =
    options.topic || "How to improve Firestick performance safely";
  const opportunityId = options.opportunityId || "opp-firestick-speed";
  const intent =
    options.intent === undefined ? "informational troubleshooting" : options.intent;
  const claimReferences =
    options.claimReferences || [
      { claimIndex: 0, sourceIds: ["s1"] },
      { claimIndex: 1, sourceIds: ["s2"] },
    ];
  const unknowns =
    options.unknowns !== undefined
      ? options.unknowns
      : ["Device-specific behavior may vary by Fire OS version."];
  const candidate = {
    opportunityId,
    topic,
    intent,
    generationIntent: "preview_only",
    title: options.title ?? "Improve Firestick Performance Safely",
    proposedSlug: options.proposedSlug ?? "improve-firestick-performance-safely",
    excerpt:
      options.excerpt ??
      "Practical guidance for improving Firestick performance without unsupported installs.",
    contentHtml: options.contentHtml ?? substantiveBody(),
    metaTitle: options.metaTitle ?? "Improve Firestick Performance",
    metaDescription:
      options.metaDescription ??
      "Learn bounded Firestick performance tips from grounded research sources.",
    focusKeyword: options.focusKeyword ?? "firestick performance",
    faqs: options.faqs,
    claimReferences,
    verifiedClaimIndexes: options.verifiedClaimIndexes,
    unknowns,
    mediaRequirement: options.mediaRequirement ?? "missing",
    humanReviewRequired: options.humanReviewRequired ?? true,
  };
  if (options.dropTitle) delete candidate.title;
  if (options.dropExcerpt) delete candidate.excerpt;
  if (options.extraFields) Object.assign(candidate, options.extraFields);
  return candidate;
}

function makeRequest(options = {}) {
  const evidence =
    options.evidence !== undefined ? options.evidence : makeEvidence(options);
  const fallbackSubject =
    evidence && evidence.subject
      ? evidence.subject
      : {
          opportunityId: "opp-firestick-speed",
          topic: "How to improve Firestick performance safely",
          intent: "informational troubleshooting",
        };
  const request = {
    task: options.task ?? "generate_blog_article_preview",
    generationIntent: options.generationIntent ?? "preview_only",
    opportunityId:
      options.opportunityId !== undefined
        ? options.opportunityId
        : fallbackSubject.opportunityId,
    topic:
      options.topic !== undefined ? options.topic : fallbackSubject.topic,
    intent:
      options.intent === undefined ? fallbackSubject.intent : options.intent,
    evidence,
    inventory: options.inventory || { rows: options.inventoryRows || [] },
    candidate: options.candidate || makeCandidate(options),
  };
  if (options.advisoryInternalLinks !== undefined) {
    request.advisoryInternalLinks = options.advisoryInternalLinks;
  }
  if (options.extraFields) Object.assign(request, options.extraFields);
  if (options.omitTask) delete request.task;
  if (options.omitEvidence) delete request.evidence;
  return request;
}

function isHold(result, code) {
  return (
    result &&
    result.ok === false &&
    result.status === "HOLD" &&
    Array.isArray(result.reasonCodes) &&
    (!code || result.reasonCodes.includes(code)) &&
    typeof result.message === "string" &&
    result.message.length > 0 &&
    !/"sk-|"api[_-]?key|password|secret/i.test(result.message)
  );
}

function isValidPreview(result) {
  return (
    result &&
    result.ok === true &&
    result.status === "VALID_PREVIEW" &&
    result.candidate &&
    result.candidate.generationIntent === "preview_only" &&
    result.candidate.mediaRequirement === "missing" &&
    result.candidate.humanReviewRequired === true &&
    result.provenance &&
    result.provenance.inventoryTrust === "caller_supplied_bounded_snapshot" &&
    result.provenance.planningAction === "NEW_BLOG" &&
    !Object.prototype.hasOwnProperty.call(result.candidate, "publicationIntent") &&
    !Object.prototype.hasOwnProperty.call(result.candidate, "id") &&
    !Object.prototype.hasOwnProperty.call(result.candidate, "featured_image") &&
    !Object.prototype.hasOwnProperty.call(result, "blogId")
  );
}

// ---------- REQUEST CONTRACT ----------
console.log("--- REQUEST CONTRACT ---");

{
  const result = validateBlogArticleGenerationPreview(makeRequest());
  ok("01_supported_task_accepted", isValidPreview(result));
}
{
  const result = validateBlogArticleGenerationPreview(makeRequest());
  ok(
    "02_preview_only_intent_accepted",
    isValidPreview(result) &&
      result.candidate.generationIntent === BLOG_ARTICLE_GENERATION_INTENT
  );
}
ok(
  "03_missing_task_hold",
  isHold(
    validateBlogArticleGenerationPreview(makeRequest({ omitTask: true })),
    "INVALID_REQUEST"
  )
);
ok(
  "04_wrong_task_hold",
  isHold(
    validateBlogArticleGenerationPreview(
      makeRequest({ task: "research_blog_evidence" })
    ),
    "UNSUPPORTED_TASK"
  )
);
ok(
  "05_publish_intent_hold",
  isHold(
    validateBlogArticleGenerationPreview(
      makeRequest({ generationIntent: "publish" })
    ),
    "UNSUPPORTED_INTENT"
  )
);
ok(
  "06_save_draft_intent_hold",
  isHold(
    validateBlogArticleGenerationPreview(
      makeRequest({ generationIntent: "create_draft" })
    ),
    "UNSUPPORTED_INTENT"
  ) &&
    isHold(
      validateBlogArticleGenerationPreview(
        makeRequest({ generationIntent: "save" })
      ),
      "UNSUPPORTED_INTENT"
    )
);
ok(
  "07_invalid_subject_hold",
  isHold(
    validateBlogArticleGenerationPreview(
      makeRequest({
        opportunityId: "   ",
        evidence: makeEvidence({ opportunityId: "   " }),
        candidate: makeCandidate({ opportunityId: "   " }),
      })
    ),
    "INVALID_SUBJECT"
  )
);
ok(
  "08_excessive_topic_intent_hold",
  isHold(
    validateBlogArticleGenerationPreview(
      makeRequest({ topic: "x".repeat(MAX_TOPIC_CHARS + 1) })
    ),
    "INVALID_SUBJECT"
  ) &&
    isHold(
      validateBlogArticleGenerationPreview(
        makeRequest({ intent: "y".repeat(MAX_INTENT_CHARS + 1) })
      ),
      "INVALID_SUBJECT"
    )
);
ok(
  "09_malformed_object_arrays_hold",
  isHold(
    validateBlogArticleGenerationPreview(
      makeRequest({ inventory: { rows: "not-an-array" } })
    ),
    "INVALID_INVENTORY"
  ) &&
    isHold(
      validateBlogArticleGenerationPreview(
        makeRequest({ candidate: "not-an-object" })
      ),
      "INVALID_ARTICLE_STRUCTURE"
    )
);
ok(
  "10_authority_changing_unknown_fields_hold",
  isHold(
    validateBlogArticleGenerationPreview(
      makeRequest({ extraFields: { publicationIntent: "publish" } })
    ),
    "UNEXPECTED_PUBLICATION_FIELDS"
  ) &&
    isHold(
      validateBlogArticleGenerationPreview(
        makeRequest({ extraFields: { autoPublish: true } })
      ),
      "UNEXPECTED_PUBLICATION_FIELDS"
    ) &&
    isHold(
      validateBlogArticleGenerationPreview(
        makeRequest({ extraFields: { unexpectedAuthority: true } })
      ),
      "INVALID_REQUEST"
    )
);

// ---------- AB-7A EVIDENCE ----------
console.log("--- AB-7A EVIDENCE ---");

ok(
  "11_valid_grounded_packet_accepted",
  isValidPreview(validateBlogArticleGenerationPreview(makeRequest()))
);
ok(
  "12_missing_evidence_hold",
  (() => {
    const missingKey = validateBlogArticleGenerationPreview(
      makeRequest({ omitEvidence: true })
    );
    const emptyEvidence = validateBlogArticleGenerationPreview(
      makeRequest({ evidence: {} })
    );
    return (
      (isHold(missingKey, "INVALID_REQUEST") ||
        isHold(missingKey, "EVIDENCE_MISSING")) &&
      (isHold(emptyEvidence, "EVIDENCE_MISSING") ||
        isHold(emptyEvidence, "UNEXPECTED_PUBLICATION_FIELDS") ||
        isHold(emptyEvidence, "INVALID_REQUEST"))
    );
  })()
);
ok(
  "13_fake_ready_flag_hold",
  isHold(
    validateBlogArticleGenerationPreview(
      makeRequest({ extraFields: { evidenceState: "ready" } })
    ),
    "EVIDENCE_INVALID"
  ) &&
    isHold(
      validateBlogArticleGenerationPreview(
        makeRequest({
          evidence: {
            ...makeEvidence(),
            evidenceState: "ready",
          },
        })
      ),
      "EVIDENCE_INVALID"
    )
);
{
  const evidence = makeEvidence();
  evidence.providerOutput.sources[0].url =
    "https://invented-not-grounded.example.com/page";
  ok(
    "14_ungrounded_source_url_hold",
    isHold(
      validateBlogArticleGenerationPreview(makeRequest({ evidence })),
      "EVIDENCE_INVALID"
    )
  );
}
{
  const evidence = makeEvidence();
  evidence.providerOutput.sources[1].id = "s1";
  ok(
    "15_duplicate_source_ids_hold",
    isHold(
      validateBlogArticleGenerationPreview(makeRequest({ evidence })),
      "EVIDENCE_INVALID"
    )
  );
}
{
  const evidence = makeEvidence();
  evidence.providerOutput.claims[0].sourceIds = [];
  ok(
    "16_missing_source_reference_hold",
    isHold(
      validateBlogArticleGenerationPreview(makeRequest({ evidence })),
      "EVIDENCE_INVALID"
    )
  );
}
{
  const evidence = makeEvidence();
  evidence.providerOutput.claims[0].sourceIds = ["missing-source"];
  ok(
    "17_unknown_claim_source_id_hold",
    isHold(
      validateBlogArticleGenerationPreview(makeRequest({ evidence })),
      "EVIDENCE_INVALID"
    )
  );
}
{
  const evidence = makeEvidence({
    topic: "Completely different research topic about routers",
  });
  ok(
    "18_subject_mismatch_hold",
    isHold(
      validateBlogArticleGenerationPreview(makeRequest({ evidence })),
      "SUBJECT_MISMATCH"
    )
  );
}
{
  const topicA = makeEvidence({
    opportunityId: "opp-a",
    topic: "Topic A Firestick WiFi tips for homes",
  });
  const result = validateBlogArticleGenerationPreview(
    makeRequest({
      opportunityId: "opp-b",
      topic: "Topic B Firestick Ethernet adapters",
      evidence: topicA,
      candidate: makeCandidate({
        opportunityId: "opp-b",
        topic: "Topic B Firestick Ethernet adapters",
      }),
    })
  );
  ok("19_topic_a_cannot_satisfy_topic_b", isHold(result, "SUBJECT_MISMATCH"));
}
ok(
  "20_explicit_stale_state_hold",
  isHold(
    validateBlogArticleGenerationPreview(
      makeRequest({ extraFields: { evidenceState: "stale" } })
    ),
    "EVIDENCE_STALE"
  ) &&
    isHold(rejectStaleBlogArticleEvidenceState("stale"), "EVIDENCE_STALE") &&
    rejectStaleBlogArticleEvidenceState("ready") === null
);
ok(
  "21_insufficient_sources_claims_hold",
  isHold(
    validateBlogArticleGenerationPreview(
      makeRequest({ evidence: makeEvidence({ sourceCount: 1, claimCount: 1 }) })
    ),
    "EVIDENCE_INVALID"
  )
);
{
  const evidence = makeEvidence();
  delete evidence.grounding.groundedUrls;
  ok(
    "22_grounding_metadata_absent_hold",
    isHold(
      validateBlogArticleGenerationPreview(makeRequest({ evidence })),
      "EVIDENCE_MISSING"
    )
  );
}

// ---------- AB-4 / AB-3 ----------
console.log("--- AB-4 / AB-3 ---");

ok(
  "23_none_eligible_permits_preview",
  isValidPreview(
    validateBlogArticleGenerationPreview(
      makeRequest({
        inventoryRows: [
          {
            id: 9,
            title: "Unrelated gardening tips for balconies",
            slug: "unrelated-gardening-tips",
            status: "published",
            active: true,
          },
        ],
      })
    )
  )
);
ok(
  "24_exact_existing_match_hold",
  isHold(
    validateBlogArticleGenerationPreview(
      makeRequest({
        inventoryRows: [
          {
            id: 11,
            title: "How to improve Firestick performance safely",
            slug: "improve-firestick-performance-safely",
            status: "published",
            active: true,
          },
        ],
      })
    ),
    "EXISTING_CONTENT_REFRESH_REQUIRED"
  ) ||
    isHold(
      validateBlogArticleGenerationPreview(
        makeRequest({
          inventoryRows: [
            {
              id: 11,
              title: "How to improve Firestick performance safely",
              slug: "improve-firestick-performance-safely",
              status: "published",
              active: true,
            },
          ],
        })
      ),
      "DUPLICATE_OR_STRONG_MATCH"
    )
);
{
  const result = validateBlogArticleGenerationPreview(
    makeRequest({
      inventoryRows: [
        {
          id: 12,
          title: "How to improve Firestick performance safely today",
          slug: "different-slug-strong-overlap",
          status: "published",
          active: true,
        },
      ],
    })
  );
  ok(
    "25_strong_existing_match_hold",
    isHold(result, "EXISTING_CONTENT_REFRESH_REQUIRED") ||
      isHold(result, "DUPLICATE_OR_STRONG_MATCH")
  );
}
ok(
  "26_existing_draft_match_hold",
  isHold(
    validateBlogArticleGenerationPreview(
      makeRequest({
        inventoryRows: [
          {
            id: 13,
            title: "How to improve Firestick performance safely",
            slug: "draft-firestick-performance",
            status: "draft",
            active: true,
          },
        ],
      })
    ),
    "EXISTING_CONTENT_REFRESH_REQUIRED"
  )
);
ok(
  "27_existing_published_match_hold",
  isHold(
    validateBlogArticleGenerationPreview(
      makeRequest({
        inventoryRows: [
          {
            id: 14,
            title: "How to improve Firestick performance safely",
            slug: "published-firestick-performance",
            status: "published",
            active: true,
          },
        ],
      })
    ),
    "EXISTING_CONTENT_REFRESH_REQUIRED"
  )
);
ok(
  "28_historical_recovery_hold",
  isHold(
    validateBlogArticleGenerationPreview(
      makeRequest({
        inventoryRows: [
          {
            id: 15,
            title: "How to improve Firestick performance safely",
            slug: "old-firestick-performance",
            status: "published",
            active: false,
          },
        ],
      })
    ),
    "HISTORICAL_RECOVERY_REQUIRED"
  )
);
ok(
  "29_refresh_disposition_hold",
  isHold(
    validateBlogArticleGenerationPreview(
      makeRequest({
        inventoryRows: [
          {
            id: 16,
            title: "How to improve Firestick performance safely",
            slug: "refresh-firestick-performance",
            status: "published",
            active: true,
          },
        ],
      })
    ),
    "EXISTING_CONTENT_REFRESH_REQUIRED"
  )
);
ok(
  "30_malformed_inventory_hold",
  isHold(
    validateBlogArticleGenerationPreview(
      makeRequest({
        inventoryRows: [
          {
            id: "bad",
            title: "Broken row",
            slug: "broken",
            status: "published",
            active: true,
          },
        ],
      })
    ),
    "INVALID_INVENTORY"
  )
);
{
  // Fabricated NONE-like caller claim is ignored; INVALID_INPUT inventory cannot elevate.
  const result = validateBlogArticleGenerationPreview(
    makeRequest({
      inventory: { rows: null },
      extraFields: {
        // unknown fabricated eligibility must not bypass strict keys
      },
    })
  );
  ok("31_no_fabricated_eligibility_from_invalid_input", isHold(result));
}
{
  // Force AB-3 non-NEW_BLOG by supplying a refresh match path already covered;
  // additionally ensure DO_NOTHING path: newBlogCandidate false via invalid disposition handoff is unreachable
  // through public API, so verify non-NEW_BLOG via refresh disposition.
  const result = validateBlogArticleGenerationPreview(
    makeRequest({
      inventoryRows: [
        {
          id: 17,
          title: "How to improve Firestick performance safely",
          slug: "non-new-blog",
          status: "published",
          active: true,
        },
      ],
    })
  );
  ok(
    "32_ab3_non_new_blog_cannot_elevate",
    isHold(result) && result.reasonCodes[0] !== undefined
  );
}
{
  const result = validateBlogArticleGenerationPreview(
    makeRequest({ inventoryRows: [] })
  );
  ok(
    "33_empty_inventory_not_cms_complete",
    isValidPreview(result) &&
      result.provenance.inventoryTrust ===
        "caller_supplied_bounded_snapshot" &&
      !/authoritative cms|cms complete|proves no content/i.test(
        JSON.stringify(result)
      )
  );
}

// ---------- CANDIDATE ----------
console.log("--- CANDIDATE ---");

ok(
  "34_valid_bounded_preview_candidate",
  isValidPreview(validateBlogArticleGenerationPreview(makeRequest()))
);
ok(
  "35_missing_title_excerpt_hold",
  isHold(
    validateBlogArticleGenerationPreview(
      makeRequest({ candidate: makeCandidate({ dropTitle: true }) })
    )
  ) &&
    isHold(
      validateBlogArticleGenerationPreview(
        makeRequest({ candidate: makeCandidate({ dropExcerpt: true }) })
      )
    )
);
ok(
  "36_malformed_slug_hold",
  isHold(
    validateBlogArticleGenerationPreview(
      makeRequest({
        candidate: makeCandidate({ proposedSlug: "BAD Slug!!" }),
      })
    ),
    "INVALID_ARTICLE_STRUCTURE"
  )
);
ok(
  "37_unsafe_html_hold",
  isHold(
    validateBlogArticleGenerationPreview(
      makeRequest({
        candidate: makeCandidate({
          contentHtml: substantiveBody('<script>alert(1)</script>'),
        }),
      })
    ),
    "UNSAFE_HTML_OR_LINK"
  )
);
ok(
  "38_body_h1_hold",
  isHold(
    validateBlogArticleGenerationPreview(
      makeRequest({
        candidate: makeCandidate({
          contentHtml: "<h1>Title</h1>" + substantiveBody(),
        }),
      })
    ),
    "INVALID_ARTICLE_STRUCTURE"
  )
);
ok(
  "39_script_iframe_form_hold",
  isHold(
    validateBlogArticleGenerationPreview(
      makeRequest({
        candidate: makeCandidate({
          contentHtml: substantiveBody("<iframe src='https://x.test'></iframe>"),
        }),
      })
    ),
    "UNSAFE_HTML_OR_LINK"
  ) &&
    isHold(
      validateBlogArticleGenerationPreview(
        makeRequest({
          candidate: makeCandidate({
            contentHtml: substantiveBody("<form action='/x'></form>"),
          }),
        })
      ),
      "UNSAFE_HTML_OR_LINK"
    )
);
ok(
  "40_event_handler_attribute_hold",
  isHold(
    validateBlogArticleGenerationPreview(
      makeRequest({
        candidate: makeCandidate({
          contentHtml: substantiveBody('<p onclick="alert(1)">click</p>'),
        }),
      })
    ),
    "UNSAFE_HTML_OR_LINK"
  )
);
ok(
  "41_javascript_data_url_hold",
  isHold(
    validateBlogArticleGenerationPreview(
      makeRequest({
        candidate: makeCandidate({
          contentHtml: substantiveBody(
            '<a href="javascript:alert(1)">x</a>'
          ),
        }),
      })
    ),
    "UNSAFE_HTML_OR_LINK"
  ) &&
    isHold(
      validateBlogArticleGenerationPreview(
        makeRequest({
          candidate: makeCandidate({
            contentHtml: substantiveBody('<a href="data:text/html,hi">x</a>'),
          }),
        })
      ),
      "UNSAFE_HTML_OR_LINK"
    )
);
ok(
  "42_protocol_relative_link_hold",
  isHold(
    validateBlogArticleGenerationPreview(
      makeRequest({
        candidate: makeCandidate({
          contentHtml: substantiveBody('<a href="//evil.example/x">x</a>'),
        }),
      })
    ),
    "UNSAFE_HTML_OR_LINK"
  )
);
ok(
  "43_insecure_external_link_hold",
  isHold(
    validateBlogArticleGenerationPreview(
      makeRequest({
        candidate: makeCandidate({
          contentHtml: substantiveBody(
            '<a href="http://example.com/page">x</a>'
          ),
        }),
      })
    ),
    "UNSAFE_HTML_OR_LINK"
  )
);
ok(
  "44_unapproved_internal_destination_hold",
  isHold(
    validateBlogArticleGenerationPreview(
      makeRequest({
        candidate: makeCandidate({
          contentHtml: substantiveBody(
            '<a href="https://www.firestick4uk.com/blog/x">x</a>'
          ),
        }),
      })
    ),
    "UNSAFE_HTML_OR_LINK"
  ) &&
    isHold(
      validateBlogArticleGenerationPreview(
        makeRequest({
          candidate: makeCandidate({
            contentHtml: substantiveBody('<a href="blog/relative-bad">x</a>'),
          }),
        })
      ),
      "UNSAFE_HTML_OR_LINK"
    )
);
ok(
  "45_oversized_body_hold",
  isHold(
    validateBlogArticleGenerationPreview(
      makeRequest({
        candidate: makeCandidate({
          contentHtml: "<p>" + "word ".repeat(25_000) + "</p>",
        }),
      })
    ),
    "CANDIDATE_TOO_LARGE"
  )
);
ok(
  "46_invalid_metadata_hold",
  isHold(
    validateBlogArticleGenerationPreview(
      makeRequest({
        candidate: makeCandidate({
          metaTitle: "x".repeat(MAX_ARTICLE_GENERATION_TITLE_CHARS),
        }),
      })
    ),
    "INVALID_METADATA_OR_FAQ"
  )
);
ok(
  "47_invalid_faq_structure_hold",
  isHold(
    validateBlogArticleGenerationPreview(
      makeRequest({
        candidate: makeCandidate({
          faqs: [{ question: "Only question", answer: "" }],
        }),
      })
    ),
    "INVALID_METADATA_OR_FAQ"
  )
);
ok(
  "48_unsupported_citation_id_hold",
  isHold(
    validateBlogArticleGenerationPreview(
      makeRequest({
        candidate: makeCandidate({
          claimReferences: [{ claimIndex: 0, sourceIds: ["invented"] }],
        }),
      })
    ),
    "INVALID_CLAIM_REFERENCES"
  )
);
ok(
  "49_claim_source_mismatch_hold",
  isHold(
    validateBlogArticleGenerationPreview(
      makeRequest({
        candidate: makeCandidate({
          claimReferences: [
            { claimIndex: 0, sourceIds: ["s2"] },
            { claimIndex: 1, sourceIds: ["s1"] },
          ],
        }),
      })
    ),
    "INVALID_CLAIM_REFERENCES"
  )
);
ok(
  "50_unsupported_generated_claim_not_verified",
  isHold(
    validateBlogArticleGenerationPreview(
      makeRequest({
        candidate: makeCandidate({
          verifiedClaimIndexes: [99],
        }),
      })
    ),
    "INVALID_CLAIM_REFERENCES"
  )
);
{
  const result = validateBlogArticleGenerationPreview(makeRequest());
  ok(
    "51_unknowns_remain_identified",
    isValidPreview(result) &&
      deepEqual(result.candidate.unknowns, [
        "Device-specific behavior may vary by Fire OS version.",
      ]) &&
      deepEqual(result.provenance.unknowns, result.candidate.unknowns)
  );
}
{
  const result = validateBlogArticleGenerationPreview(makeRequest());
  ok(
    "52_media_remains_missing",
    isValidPreview(result) && result.candidate.mediaRequirement === "missing"
  );
}
{
  const result = validateBlogArticleGenerationPreview(
    makeRequest({
      candidate: makeCandidate({
        extraFields: {
          featured_image: "https://cdn.example/image.jpg",
        },
      }),
    })
  );
  ok(
    "53_no_featured_image_fabricated",
    isHold(result, "UNEXPECTED_PUBLICATION_FIELDS") ||
      isHold(result, "INVALID_ARTICLE_STRUCTURE")
  );
}
{
  const result = validateBlogArticleGenerationPreview(makeRequest());
  ok(
    "54_no_blog_id_or_published_url",
    isValidPreview(result) &&
      result.candidate.id === undefined &&
      result.candidate.publishedUrl === undefined &&
      !JSON.stringify(result).includes("/blog/" + result.candidate.proposedSlug)
  );
}
ok(
  "55_no_publication_intent_publish_accepted",
  isHold(
    validateBlogArticleGenerationPreview(
      makeRequest({
        candidate: makeCandidate({
          extraFields: { publicationIntent: "publish" },
        }),
      })
    ),
    "UNEXPECTED_PUBLICATION_FIELDS"
  )
);

// ---------- SIDE-EFFECT BOUNDARIES ----------
console.log("--- SIDE-EFFECT BOUNDARIES ---");

ok(
  "56_no_provider_imports",
  !/openai|@google\/generative-ai|anthropic|gemini/i.test(validationSrc) &&
    !/openai|@google\/generative-ai|anthropic|gemini/i.test(contractsSrc) &&
    !/blogGroundedResearchRuntime|blogGroundedResearchOpenAi/i.test(
      validationSrc
    )
);
ok(
  "57_no_database_imports",
  !/mysql|postgres|prisma|drizzle|createPool|getDb|blogPersistenceServer/i.test(
    validationSrc
  ) && !/mysql|postgres|prisma|drizzle|blogPersistenceServer/i.test(contractsSrc)
);
ok(
  "58_no_cms_api_imports",
  !/pages\/api\/blog|admin-blog|fetch\(|axios/i.test(validationSrc) &&
    !/pages\/api\/blog|admin-blog/i.test(contractsSrc)
);
{
  const before = fs.readdirSync(path.join(ROOT, "lib")).slice().sort();
  validateBlogArticleGenerationPreview(makeRequest());
  const after = fs.readdirSync(path.join(ROOT, "lib")).slice().sort();
  ok("59_no_filesystem_writes", deepEqual(before, after));
}
ok(
  "60_no_publish_adapter",
  !/evaluateAutonomousBlogPrePublish|publicationIntent\s*:\s*"publish"/i.test(
    validationSrc
  ) && !/AutonomousBlogCandidate/i.test(validationSrc)
);
ok(
  "61_no_automatic_retry",
  !/\bsetTimeout\b|\bsetInterval\b|\bwhile\s*\(\s*true\s*\)/.test(validationSrc) &&
    !/function\s+retry|automatic retry|retry\(/i.test(validationSrc)
);
ok(
  "62_no_scheduler",
  !/node-cron|agenda|cron\.schedule|setImmediate/.test(validationSrc) &&
    !/node-cron|agenda|cron\.schedule/.test(contractsSrc) &&
    !/schedulerEligible:\s*true/.test(validationSrc)
);
ok(
  "63_no_persistence",
  !/\binsert\b|\bupdate\b|\bdelete\b|\bwriteFile|\bcreateDraft/i.test(
    validationSrc
  )
);
ok(
  "64_no_gemini_anthropic_fallback",
  !/gemini|anthropic|fallbackProvider/i.test(validationSrc) &&
    !/gemini|anthropic/i.test(contractsSrc)
);
{
  const input = makeRequest();
  const a = validateBlogArticleGenerationPreview(input);
  const b = validateBlogArticleGenerationPreview(input);
  ok("65_pure_result_deterministic", deepEqual(a, b) && isValidPreview(a));
}

ok(
  "hold_codes_cover_required_set",
  BLOG_ARTICLE_GENERATION_HOLD_CODES.includes("INVALID_REQUEST") &&
    BLOG_ARTICLE_GENERATION_HOLD_CODES.includes("UNSUPPORTED_TASK") &&
    BLOG_ARTICLE_GENERATION_HOLD_CODES.includes("EVIDENCE_STALE") &&
    BLOG_ARTICLE_GENERATION_HOLD_CODES.includes("HISTORICAL_RECOVERY_REQUIRED") &&
    BLOG_ARTICLE_GENERATION_HOLD_CODES.includes("UNEXPECTED_PUBLICATION_FIELDS")
);

console.log(`\nAB-8B results: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
