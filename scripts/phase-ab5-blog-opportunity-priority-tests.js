/**
 * AB-5 — Pure Blog opportunity priority / uncertainty / cost tests.
 * No DB, HTTP, providers, CMS mutations, scheduling, or actual usage costs.
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

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
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
  const fn = new Function("exports", "module", "require", outputText);
  fn(sandbox.exports, sandbox.module, localRequire);
  return sandbox.module.exports && Object.keys(sandbox.module.exports).length
    ? sandbox.module.exports
    : sandbox.exports;
}

const source = read("lib/blogOpportunityPrioritizer.ts");
const {
  MAX_BLOG_PRIORITY_BATCH,
  estimateBlogActionCost,
  getBlogActionPriority,
  normalizeBlogPriorityOpportunityId,
  prioritizeBlogOpportunity,
  prioritizeBlogOpportunities,
} = loadTsModule("lib/blogOpportunityPrioritizer.ts");

console.log("\nAB-5 Blog Opportunity Prioritizer\n");

const ACTION_REASONS = {
  TECHNICAL_FIX: ["TECHNICAL_BLOCKER"],
  INDEXING_REVIEW: ["INDEXING_REVIEW_REQUIRED"],
  HISTORICAL_RECOVERY: ["HISTORICAL_RECOVERY_CANDIDATE"],
  REFRESH_EXISTING: ["EXISTING_CONTENT_REFRESH"],
  TITLE_META_UPDATE: ["METADATA_ONLY"],
  INTERNAL_LINKS: ["INTERNAL_LINK_GAP"],
  IMAGE: ["IMAGE_GAP"],
  NEW_BLOG: ["NO_EXISTING_CONTENT", "NEW_BLOG_EVIDENCE_READY"],
  DO_NOTHING: ["NO_ACTIONABLE_SIGNAL"],
};

const TARGETED_ACTIONS = new Set([
  "TECHNICAL_FIX",
  "INDEXING_REVIEW",
  "HISTORICAL_RECOVERY",
  "REFRESH_EXISTING",
  "TITLE_META_UPDATE",
  "INTERNAL_LINKS",
  "IMAGE",
]);

function decision(action, opportunityId, overrides = {}) {
  const targeted = TARGETED_ACTIONS.has(action);
  return {
    opportunityId,
    action,
    target: targeted
      ? {
          entityId: 42,
          url: "https://firestick4uk.com/blog/existing-firestick-guide",
        }
      : { entityId: null, url: null },
    schedulerEligible: action === "NEW_BLOG",
    reasonCodes: [...ACTION_REASONS[action]],
    explanation: "Fixture decision from the AB-3 engine.",
    ...overrides,
  };
}

function input(action, uncertainty, opportunityId, overrides = {}) {
  return {
    decision: decision(action, opportunityId),
    uncertainty,
    uncertaintyReasons: [`fixture:${uncertainty}`],
    ...overrides,
  };
}

function invalidResult(result) {
  return (
    result &&
    result.action === "DO_NOTHING" &&
    result.rankable === false &&
    result.reviewRequired === false &&
    result.priorityTier === 9 &&
    result.estimatedCost === "none" &&
    result.reasonCodes.includes("INVALID_INPUT")
  );
}

// ── A. ACTION → PRIORITY TIER ─────────────────────────────────────────────

const EXPECTED_PRIORITY = {
  TECHNICAL_FIX: [0, "BLOCKING_TECHNICAL", "TECHNICAL_PRIORITY"],
  INDEXING_REVIEW: [0, "BLOCKING_TECHNICAL", "INDEXING_PRIORITY"],
  HISTORICAL_RECOVERY: [1, "REUSE_EXISTING", "EXISTING_CONTENT_REUSE"],
  REFRESH_EXISTING: [1, "REUSE_EXISTING", "EXISTING_CONTENT_REUSE"],
  TITLE_META_UPDATE: [2, "IMPROVE_EXISTING", "EXISTING_CONTENT_IMPROVEMENT"],
  INTERNAL_LINKS: [2, "IMPROVE_EXISTING", "EXISTING_CONTENT_IMPROVEMENT"],
  IMAGE: [2, "IMPROVE_EXISTING", "EXISTING_CONTENT_IMPROVEMENT"],
  NEW_BLOG: [3, "CREATE_NEW", "NEW_CONTENT_CREATION"],
  DO_NOTHING: [9, "NO_ACTION", "NO_ACTION"],
};

for (const [action, [tier, priorityClass, reason]] of Object.entries(
  EXPECTED_PRIORITY
)) {
  const policy = getBlogActionPriority(action);
  const prioritized = prioritizeBlogOpportunity(input(action, "low", `tier-${action}`));
  ok(
    `A_${action}_tier`,
    policy &&
      policy.priorityTier === tier &&
      policy.priorityClass === priorityClass &&
      prioritized.priorityTier === tier &&
      prioritized.priorityClass === priorityClass &&
      prioritized.reasonCodes.includes(reason)
  );
}

ok(
  "A_unknown_action_fails_closed",
  getBlogActionPriority("UNSUPPORTED") === null
);

// ── B. RELATIVE COST CLASS ────────────────────────────────────────────────

const EXPECTED_COST = {
  DO_NOTHING: "none",
  TITLE_META_UPDATE: "low",
  INTERNAL_LINKS: "low",
  INDEXING_REVIEW: "low",
  IMAGE: "medium",
  REFRESH_EXISTING: "medium",
  HISTORICAL_RECOVERY: "medium",
  NEW_BLOG: "high",
  TECHNICAL_FIX: "variable",
};

for (const [action, expected] of Object.entries(EXPECTED_COST)) {
  const prioritized = prioritizeBlogOpportunity(input(action, "low", `cost-${action}`));
  ok(
    `B_${action}_cost_${expected}`,
    estimateBlogActionCost(action) === expected &&
      prioritized.estimatedCost === expected &&
      prioritized.reasonCodes.includes(`COST_${expected.toUpperCase()}`)
  );
}

ok(
  "B_unknown_cost_fails_closed",
  estimateBlogActionCost("UNSUPPORTED") === null
);

// ── C. SAME-TIER UNCERTAINTY ──────────────────────────────────────────────

{
  const ranked = prioritizeBlogOpportunities([
    input("REFRESH_EXISTING", "high", "refresh-high"),
    input("REFRESH_EXISTING", "low", "refresh-low"),
    input("REFRESH_EXISTING", "medium", "refresh-medium"),
  ]);
  ok(
    "C_low_medium_high",
    deepEqual(
      ranked.map((item) => item.opportunityId),
      ["refresh-low", "refresh-medium", "refresh-high"]
    )
  );
}

// ── D. PRIORITY BEATS UNCERTAINTY ─────────────────────────────────────────

{
  const ranked = prioritizeBlogOpportunities([
    input("NEW_BLOG", "low", "new-low"),
    input("REFRESH_EXISTING", "high", "refresh-high"),
  ]);
  ok(
    "D_refresh_high_before_new_low",
    ranked[0].opportunityId === "refresh-high" &&
      ranked[0].reviewRequired === true &&
      ranked[1].opportunityId === "new-low"
  );
}

// ── E. UNCERTAINTY BEATS COST WITHIN TIER ─────────────────────────────────

{
  const ranked = prioritizeBlogOpportunities([
    input("TITLE_META_UPDATE", "medium", "title-medium-low-cost"),
    input("IMAGE", "low", "image-low-medium-cost"),
  ]);
  ok(
    "E_low_uncertainty_higher_cost_first",
    ranked[0].opportunityId === "image-low-medium-cost" &&
      ranked[0].estimatedCost === "medium" &&
      ranked[1].estimatedCost === "low"
  );
}

// ── F. COST / ACTION / ID TIE-BREAKS ──────────────────────────────────────

{
  const ranked = prioritizeBlogOpportunities([
    input("IMAGE", "low", "image-medium-cost"),
    input("TITLE_META_UPDATE", "low", "title-low-cost"),
  ]);
  ok(
    "F_lower_cost_first",
    ranked[0].opportunityId === "title-low-cost" &&
      ranked[1].opportunityId === "image-medium-cost"
  );
}

{
  const ranked = prioritizeBlogOpportunities([
    input("TITLE_META_UPDATE", "low", "title"),
    input("INTERNAL_LINKS", "low", "links"),
  ]);
  ok(
    "F_action_name_tie_break",
    deepEqual(
      ranked.map((item) => item.action),
      ["INTERNAL_LINKS", "TITLE_META_UPDATE"]
    )
  );
}

{
  const ranked = prioritizeBlogOpportunities([
    input("REFRESH_EXISTING", "medium", "opp-z"),
    input("REFRESH_EXISTING", "medium", "opp-a"),
  ]);
  ok(
    "F_normalized_id_final_tie_break",
    deepEqual(
      ranked.map((item) => item.opportunityId),
      ["opp-a", "opp-z"]
    ) && normalizeBlogPriorityOpportunityId("  OPP-A  ") === "opp-a"
  );
}

{
  const ranked = prioritizeBlogOpportunities([
    input("REFRESH_EXISTING", "medium", "Z-id"),
    input("REFRESH_EXISTING", "medium", "a-ID"),
  ]);
  ok(
    "F_id_tie_uses_normalized_not_raw_case_order",
    deepEqual(
      ranked.map((item) => item.opportunityId),
      ["a-ID", "Z-id"]
    )
  );
}

// ── G. HIGH UNCERTAINTY / ACTION INTEGRITY ────────────────────────────────

{
  const prioritized = prioritizeBlogOpportunity(
    input("NEW_BLOG", "high", "new-blog-high")
  );
  const technical = prioritizeBlogOpportunity(
    input("TECHNICAL_FIX", "high", "technical-review")
  );
  ok(
    "G_high_uncertainty_review_action_unchanged",
    prioritized.action === "NEW_BLOG" &&
      prioritized.priorityTier === 3 &&
      prioritized.estimatedCost === "high" &&
      prioritized.reviewRequired === true &&
      prioritized.rankable === true &&
      prioritized.reasonCodes.includes("HIGH_UNCERTAINTY_REVIEW")
  );
  ok(
    "G_ranking_not_scheduler_permission",
    !("schedulerEligible" in prioritized)
  );
  ok(
    "G_high_technical_review_action_unchanged",
    technical.action === "TECHNICAL_FIX" &&
      technical.priorityTier === 0 &&
      technical.reviewRequired === true
  );
  const low = prioritizeBlogOpportunity(
    input("NEW_BLOG", "low", "new-blog-low")
  );
  const medium = prioritizeBlogOpportunity(
    input("NEW_BLOG", "medium", "new-blog-medium")
  );
  ok(
    "G_low_medium_do_not_require_review",
    low.uncertainty === "low" &&
      medium.uncertainty === "medium" &&
      low.reviewRequired === false &&
      medium.reviewRequired === false
  );
}

// ── H. DO_NOTHING ─────────────────────────────────────────────────────────

{
  const noAction = prioritizeBlogOpportunity(
    input("DO_NOTHING", "high", "nothing")
  );
  const ranked = prioritizeBlogOpportunities([
    input("DO_NOTHING", "low", "nothing-low"),
    input("NEW_BLOG", "high", "new-high"),
    input("TECHNICAL_FIX", "high", "technical-high"),
  ]);
  ok(
    "H_do_nothing_policy",
    noAction.priorityTier === 9 &&
      noAction.priorityClass === "NO_ACTION" &&
      noAction.estimatedCost === "none" &&
      noAction.rankable === false &&
      noAction.reviewRequired === false
  );
  ok(
    "H_do_nothing_always_last",
    ranked[ranked.length - 1].action === "DO_NOTHING"
  );
}

// ── I. AB-3 DECISION INTEGRITY ────────────────────────────────────────────

{
  const original = decision("REFRESH_EXISTING", "preserve-me", {
    target: {
      entityId: 731,
      url: "https://firestick4uk.com/blog/preserve-this-target",
    },
  });
  const prioritized = prioritizeBlogOpportunity({
    decision: original,
    uncertainty: "medium",
  });
  ok(
    "I_action_id_target_preserved",
    prioritized.action === original.action &&
      prioritized.opportunityId === original.opportunityId &&
      deepEqual(prioritized.target, original.target) &&
      prioritized.target !== original.target
  );
}

// ── J. INVALID / STRICT INPUT ─────────────────────────────────────────────

const validDecision = decision("REFRESH_EXISTING", "valid-shape");
const invalidInputs = [
  ["null", null],
  ["non_object", "bad"],
  ["array", []],
  ["invalid_uncertainty", { decision: validDecision, uncertainty: "maybe" }],
  [
    "malformed_decision",
    { decision: { opportunityId: "broken" }, uncertainty: "low" },
  ],
  [
    "unsupported_action",
    {
      decision: { ...validDecision, action: "PUBLISH_NOW" },
      uncertainty: "low",
    },
  ],
  [
    "blank_id",
    {
      decision: { ...validDecision, opportunityId: " " },
      uncertainty: "low",
    },
  ],
  [
    "bad_target",
    {
      decision: {
        ...validDecision,
        target: { entityId: -1, url: "https://evil.example/blog/x" },
      },
      uncertainty: "low",
    },
  ],
  [
    "bad_entity_only",
    {
      decision: {
        ...validDecision,
        target: {
          entityId: -1,
          url: "https://firestick4uk.com/blog/existing-firestick-guide",
        },
      },
      uncertainty: "low",
    },
  ],
  [
    "offsite_url_only",
    {
      decision: {
        ...validDecision,
        target: { entityId: 42, url: "https://evil.example/blog/x" },
      },
      uncertainty: "low",
    },
  ],
  [
    "inconsistent_scheduler_flag",
    {
      decision: { ...validDecision, schedulerEligible: true },
      uncertainty: "low",
    },
  ],
  [
    "bad_ab3_reason",
    {
      decision: { ...validDecision, reasonCodes: ["MADE_UP_REASON"] },
      uncertainty: "low",
    },
  ],
  [
    "new_blog_with_existing_target",
    {
      decision: {
        ...decision("NEW_BLOG", "impossible-new-target"),
        target: {
          entityId: 42,
          url: "https://firestick4uk.com/blog/existing-firestick-guide",
        },
      },
      uncertainty: "low",
    },
  ],
  [
    "new_blog_with_wrong_reason",
    {
      decision: {
        ...decision("NEW_BLOG", "impossible-new-reason"),
        reasonCodes: ["TECHNICAL_BLOCKER"],
      },
      uncertainty: "low",
    },
  ],
  [
    "unexpected_decision_field",
    {
      decision: { ...validDecision, manualScore: 5 },
      uncertainty: "low",
    },
  ],
  [
    "numeric_priority_rejected",
    { decision: validDecision, uncertainty: "low", priorityScore: 99 },
  ],
  [
    "search_volume_rejected",
    { decision: validDecision, uncertainty: "low", searchVolume: 1000 },
  ],
  [
    "bad_uncertainty_reasons",
    { decision: validDecision, uncertainty: "low", uncertaintyReasons: [1] },
  ],
];

for (const [name, candidate] of invalidInputs) {
  const prioritized = prioritizeBlogOpportunity(candidate);
  ok(`J_${name}_invalid_non_rankable`, invalidResult(prioritized));
  ok(`J_${name}_never_fabricates_new_blog`, prioritized.action !== "NEW_BLOG");
}

{
  const accessorInput = input("REFRESH_EXISTING", "low", "accessor");
  let getterReads = 0;
  Object.defineProperty(accessorInput.decision, "action", {
    enumerable: true,
    get() {
      getterReads += 1;
      return "NEW_BLOG";
    },
  });
  const accessorResult = prioritizeBlogOpportunity(accessorInput);

  const hiddenScoreInput = input("REFRESH_EXISTING", "low", "hidden-score");
  Object.defineProperty(hiddenScoreInput, "priorityScore", {
    enumerable: false,
    value: 99,
  });
  const hiddenResult = prioritizeBlogOpportunity(hiddenScoreInput);

  const throwingProxy = new Proxy(
    input("REFRESH_EXISTING", "low", "proxy"),
    {
      ownKeys() {
        throw new Error("reflection blocked");
      },
    }
  );
  let proxyResult = null;
  let proxyThrew = false;
  try {
    proxyResult = prioritizeBlogOpportunity(throwingProxy);
  } catch {
    proxyThrew = true;
  }

  ok(
    "J_accessors_rejected_without_invocation",
    getterReads === 0 && invalidResult(accessorResult)
  );
  ok("J_hidden_score_rejected", invalidResult(hiddenResult));
  ok(
    "J_reflection_failure_returns_invalid",
    proxyThrew === false && invalidResult(proxyResult)
  );
}

{
  const valid = input("REFRESH_EXISTING", "low", "valid-in-mixed");
  const invalid = { ...input("NEW_BLOG", "low", "bad-in-mixed"), uncertainty: "x" };
  const result = prioritizeBlogOpportunities([valid, invalid]);
  ok(
    "J_malformed_batch_fails_whole_batch_closed",
    result.length === 1 && invalidResult(result[0])
  );
}

// ── K. DUPLICATE IDS ──────────────────────────────────────────────────────

{
  const exact = prioritizeBlogOpportunities([
    input("REFRESH_EXISTING", "low", "duplicate"),
    input("NEW_BLOG", "low", "duplicate"),
  ]);
  const normalized = prioritizeBlogOpportunities([
    input("REFRESH_EXISTING", "low", "Case-ID"),
    input("NEW_BLOG", "low", "case-id"),
  ]);
  ok("K_exact_duplicate_fails_closed", exact.length === 1 && invalidResult(exact[0]));
  ok(
    "K_normalized_duplicate_fails_closed",
    normalized.length === 1 && invalidResult(normalized[0])
  );
}

// ── L. BOUNDS / NO TRUNCATION ─────────────────────────────────────────────

{
  const atLimit = Array.from(
    { length: MAX_BLOG_PRIORITY_BATCH },
    (_, index) => input("NEW_BLOG", "low", `at-limit-${index}`)
  );
  const oversize = Array.from(
    { length: MAX_BLOG_PRIORITY_BATCH + 1 },
    (_, index) => input("NEW_BLOG", "low", `oversize-${index}`)
  );
  const result = prioritizeBlogOpportunities(oversize);
  ok(
    "L_oversize_explicit_fail_closed",
    MAX_BLOG_PRIORITY_BATCH === 100 && result.length === 1 && invalidResult(result[0])
  );
  ok(
    "L_exact_limit_returns_every_item",
    prioritizeBlogOpportunities(atLimit).length === MAX_BLOG_PRIORITY_BATCH
  );
  ok("L_empty_batch_is_valid", deepEqual(prioritizeBlogOpportunities([]), []));
  ok(
    "L_non_array_explicit_fail_closed",
    invalidResult(prioritizeBlogOpportunities(null)[0])
  );

  const sparse = new Array(1);
  let sparseResult = null;
  let sparseThrew = false;
  try {
    sparseResult = prioritizeBlogOpportunities(sparse);
  } catch {
    sparseThrew = true;
  }
  const customized = [input("NEW_BLOG", "low", "custom-array")];
  customized.map = () => [];
  const customizedResult = prioritizeBlogOpportunities(customized);
  ok(
    "L_sparse_batch_fails_closed_without_throwing",
    sparseThrew === false &&
      sparseResult.length === 1 &&
      invalidResult(sparseResult[0])
  );
  ok(
    "L_custom_array_method_cannot_drop_items",
    customizedResult.length === 1 && invalidResult(customizedResult[0])
  );
}

// ── M. DETERMINISM ────────────────────────────────────────────────────────

const realistic = [
  input("TECHNICAL_FIX", "high", "technical-high"),
  input("REFRESH_EXISTING", "low", "refresh-low"),
  input("REFRESH_EXISTING", "medium", "refresh-medium"),
  input("NEW_BLOG", "low", "new-low"),
  input("TITLE_META_UPDATE", "low", "title-low"),
  input("IMAGE", "low", "image-low"),
  input("NEW_BLOG", "high", "new-high"),
  input("DO_NOTHING", "low", "no-action"),
];

{
  const first = prioritizeBlogOpportunities(realistic);
  const second = prioritizeBlogOpportunities(realistic);
  ok("M_repeated_dataset_deep_equal", deepEqual(first, second));
}

// ── N. INPUT ORDER INDEPENDENCE / REALISTIC FIXTURES ──────────────────────

{
  const forward = prioritizeBlogOpportunities(realistic);
  const reversed = prioritizeBlogOpportunities([...realistic].reverse());
  ok(
    "N_reversed_input_same_id_order",
    deepEqual(
      forward.map((item) => item.opportunityId),
      reversed.map((item) => item.opportunityId)
    )
  );
  ok(
    "N_technical_high_before_refresh_low",
    forward.findIndex((item) => item.opportunityId === "technical-high") <
      forward.findIndex((item) => item.opportunityId === "refresh-low") &&
      forward.find((item) => item.opportunityId === "technical-high")
        .reviewRequired === true
  );
  ok(
    "N_refresh_medium_before_new_low",
    forward.findIndex((item) => item.opportunityId === "refresh-medium") <
      forward.findIndex((item) => item.opportunityId === "new-low")
  );
  ok(
    "N_title_before_image_same_uncertainty",
    forward.findIndex((item) => item.opportunityId === "title-low") <
      forward.findIndex((item) => item.opportunityId === "image-low")
  );
}

// ── O. IMMUTABILITY / EVERY VALID ITEM EXACTLY ONCE ───────────────────────

{
  const dataset = realistic.map((item) => JSON.parse(JSON.stringify(item)));
  const snapshot = JSON.stringify(dataset);
  for (const item of dataset) {
    Object.freeze(item.decision.target);
    Object.freeze(item.decision.reasonCodes);
    Object.freeze(item.decision);
    Object.freeze(item.uncertaintyReasons);
    Object.freeze(item);
  }
  Object.freeze(dataset);
  const ranked = prioritizeBlogOpportunities(dataset);
  const uniqueIds = new Set(ranked.map((item) => item.opportunityId));
  const inputIds = dataset.map((item) => item.decision.opportunityId).sort();
  const outputIds = ranked.map((item) => item.opportunityId).sort();
  ok("O_input_array_and_objects_unchanged", JSON.stringify(dataset) === snapshot);
  ok(
    "O_every_valid_item_exactly_once",
    ranked.length === dataset.length &&
      uniqueIds.size === dataset.length &&
      deepEqual(outputIds, inputIds)
  );
  ok(
    "O_reason_code_order_is_stable",
    deepEqual(
      prioritizeBlogOpportunity(input("REFRESH_EXISTING", "medium", "reasons"))
        .reasonCodes,
      ["EXISTING_CONTENT_REUSE", "MEDIUM_UNCERTAINTY", "COST_MEDIUM"]
    )
  );
  const actionable = Object.keys(EXPECTED_PRIORITY)
    .filter((action) => action !== "DO_NOTHING")
    .map((action, index) =>
      prioritizeBlogOpportunity(input(action, "low", `rankable-${index}`))
    );
  ok(
    "O_all_actionable_actions_are_rankable",
    actionable.every((item) => item.rankable === true)
  );
  ok(
    "O_exact_output_schema",
    deepEqual(Object.keys(ranked[0]).sort(), [
      "action",
      "estimatedCost",
      "opportunityId",
      "priorityClass",
      "priorityTier",
      "rankable",
      "reasonCodes",
      "reviewRequired",
      "target",
      "uncertainty",
    ]) &&
      deepEqual(Object.keys(ranked[0].target).sort(), ["entityId", "url"])
  );
}

// ── P. PURE / NO SIDE EFFECTS / NO WIRING ─────────────────────────────────

ok(
  "P_no_db",
  !/from\s+["'][^"']*db[^"']*["']|require\s*\([^)]*db|mysql|createPool|getPool/i.test(
    source
  )
);
ok(
  "P_no_fetch_http",
  !/\bfetch\s*\(|axios|http\.request|node-fetch|node:https?|from\s+["']https?["']/i.test(
    source
  )
);
ok(
  "P_no_provider",
  !/openai|gemini|anthropic|generateContent|seoAi/i.test(source)
);
ok("P_no_env", !/process\.env/i.test(source));
ok(
  "P_no_filesystem",
  !/from\s+["'](?:node:)?fs(?:\/promises)?["']|require\s*\([^)]*fs|readFileSync|writeFileSync/i.test(
    source
  )
);
ok(
  "P_no_persistence_audit_revision",
  !/blogPersistence|recordAdminAudit|recordContentRevision|createAutonomous|publishAutonomous/i.test(
    source
  )
);
ok("P_no_time_random", !/Date\.now|Math\.random|setTimeout|setInterval/i.test(source));
ok(
  "P_no_scheduler_implementation",
  !/schedule\w*\s*\(|cron|jobQueue|enqueue/i.test(source)
);
ok(
  "P_only_pure_ab3_import",
  /from\s+["']@\/lib\/blogOpportunityEngine["']/.test(source) &&
    !/from\s+["']@\/lib\/blogOpportunityMatcher["']/.test(source)
);
ok(
  "P_not_wired_to_runtime",
  !/blogOpportunityPrioritizer/.test(read("pages/api/blog.ts")) &&
    !/blogOpportunityPrioritizer/.test(read("pages/api/admin-seo-ai.ts")) &&
    !/blogOpportunityPrioritizer/.test(read("lib/blogPersistenceServer.ts")) &&
    !/blogOpportunityPrioritizer/.test(read("app/sidhu/page.tsx"))
);

// ── Q. NO WEIGHTED OR MONETARY MODEL ──────────────────────────────────────

ok(
  "Q_no_weighted_score",
  !/weighted|priorityScore|seoScore|opportunityScore/i.test(source)
);
ok(
  "Q_no_currency_or_pricing_model",
  !/\b(?:GBP|USD)\b|£|€|token[-_\s]?price|provider\s+pricing|billing|currency\s+value|\x24\s*\d/i.test(
    source
  )
);
ok(
  "Q_outputs_no_numeric_score",
  prioritizeBlogOpportunities(realistic).every(
    (item) =>
      !("score" in item) &&
      !("priorityScore" in item) &&
      !("monetaryCost" in item)
  )
);

console.log(`\nAB-5 results: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
