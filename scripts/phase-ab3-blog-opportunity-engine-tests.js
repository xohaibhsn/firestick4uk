/**
 * AB-3 — Pure blog opportunity / next-best-action engine tests.
 * No DB, HTTP, providers, or CMS mutations.
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

const src = read("lib/blogOpportunityEngine.ts");
const {
  BLOG_NEXT_BEST_ACTIONS,
  evaluateBlogOpportunity,
  evaluateBlogOpportunities,
  isAutonomousNewBlogEligible,
  dispositionFromSeoDiagnosticCategory,
  MAX_BLOG_OPPORTUNITY_BATCH,
  isOnSiteFirestickUrl,
} = loadTsModule("lib/blogOpportunityEngine.ts");

console.log("\nAB-3 Blog Opportunity / Next-Best-Action Engine\n");

// ── A. ACTION VOCABULARY ───────────────────────────────────────────────────

ok("A_exact_nine_actions", Array.isArray(BLOG_NEXT_BEST_ACTIONS) && BLOG_NEXT_BEST_ACTIONS.length === 9);
ok(
  "A_vocab_locked",
  deepEqual([...BLOG_NEXT_BEST_ACTIONS].sort(), [
    "DO_NOTHING",
    "HISTORICAL_RECOVERY",
    "IMAGE",
    "INDEXING_REVIEW",
    "INTERNAL_LINKS",
    "NEW_BLOG",
    "REFRESH_EXISTING",
    "TECHNICAL_FIX",
    "TITLE_META_UPDATE",
  ].sort())
);
ok(
  "A_no_extra_action_literals",
  !/\b(SCORE|RANK|CRAWL|PUBLISH|SCHEDULE)\b/.test(src) ||
    !/action:\s*["'](?!NEW_BLOG|REFRESH_EXISTING|TITLE_META_UPDATE|INTERNAL_LINKS|IMAGE|INDEXING_REVIEW|TECHNICAL_FIX|HISTORICAL_RECOVERY|DO_NOTHING)[A-Z_]+["']/.test(
      src
    )
);

// ── SIDE EFFECTS / PURE ────────────────────────────────────────────────────

ok("J_no_db_import", !(/from ["']@\/lib\/db["']|require\(["'].*db["']\)/.test(src)));
ok("J_no_fetch", !/\bfetch\b/.test(src));
ok("J_no_provider", !/openai|gemini|seoAi|OpenAI/i.test(src));
ok("J_no_persistence", !/blogPersistence|recordAdminAudit|recordContentRevision/.test(src));
ok("J_no_process_env", !/process\.env/.test(src));
ok("J_no_fs", !(/from ["']fs["']|require\(["']fs["']\)/.test(src)));
ok("J_no_random_now", !/Date\.now|Math\.random|setTimeout|setInterval/.test(src));
ok("J_no_issue_memory", !/seoIssueMemory|reconcileSeo/.test(src));

function base(overrides = {}) {
  return {
    opportunityId: "opp-1",
    topic: "How to speed up a Firestick",
    intent: "guide",
    evidenceState: "ready",
    existingContent: {
      disposition: "none",
      entityId: null,
      url: null,
    },
    newBlogCandidate: true,
    reasonEvidence: ["signal:a"],
    ...overrides,
  };
}

function withDisposition(disposition, extra = {}) {
  return base({
    existingContent: {
      disposition,
      entityId: 5,
      url: "https://firestick4uk.com/blog/how-to-speed-up-a-slow-firestick-in-10-minutes",
      ...extra.existingContent,
    },
    newBlogCandidate: true,
    ...extra,
  });
}

// ── B. FAIL-CLOSED ─────────────────────────────────────────────────────────

for (const [name, input] of [
  ["null", null],
  ["non_object", "x"],
  ["blank_id", base({ opportunityId: "  " })],
  ["blank_topic", base({ topic: "" })],
  ["invalid_evidence", base({ evidenceState: "maybe" })],
  ["invalid_disposition", base({ existingContent: { disposition: "weird" } })],
  [
    "bad_entity",
    base({
      existingContent: { disposition: "refresh", entityId: -1 },
    }),
  ],
  [
    "bad_url",
    base({
      existingContent: {
        disposition: "refresh",
        url: "https://evil.example/x",
      },
    }),
  ],
  ["bad_reason_evidence", base({ reasonEvidence: [1, 2] })],
]) {
  const d = evaluateBlogOpportunity(input);
  ok(
    `B_${name}_do_nothing`,
    d.action === "DO_NOTHING" &&
      d.schedulerEligible === false &&
      d.reasonCodes.includes("INVALID_INPUT")
  );
}

ok(
  "B_onsite_url_helper",
  isOnSiteFirestickUrl("https://firestick4uk.com/blog/x") &&
    !isOnSiteFirestickUrl("https://www.firestick4uk.com/blog/x") &&
    !isOnSiteFirestickUrl("http://firestick4uk.com/blog/x")
);

// ── C. EVIDENCE ────────────────────────────────────────────────────────────

ok(
  "C_missing_evidence",
  evaluateBlogOpportunity(base({ evidenceState: "missing" })).action ===
    "DO_NOTHING" &&
    evaluateBlogOpportunity(base({ evidenceState: "missing" })).reasonCodes.includes(
      "EVIDENCE_MISSING"
    )
);
ok(
  "C_stale_evidence",
  evaluateBlogOpportunity(base({ evidenceState: "stale" })).action ===
    "DO_NOTHING" &&
    evaluateBlogOpportunity(base({ evidenceState: "stale" })).reasonCodes.includes(
      "EVIDENCE_STALE"
    )
);
ok(
  "C_stale_blocks_new_blog",
  evaluateBlogOpportunity(
    base({
      evidenceState: "stale",
      existingContent: { disposition: "none" },
      newBlogCandidate: true,
    })
  ).action === "DO_NOTHING"
);
ok(
  "C_ready_may_new_blog",
  evaluateBlogOpportunity(base()).action === "NEW_BLOG"
);

// ── D. PRECEDENCE (+ contradictory newBlogCandidate) ───────────────────────

const precedence = [
  ["technical", "TECHNICAL_FIX", "TECHNICAL_BLOCKER"],
  ["historical_recovery", "HISTORICAL_RECOVERY", "HISTORICAL_RECOVERY_CANDIDATE"],
  ["indexing", "INDEXING_REVIEW", "INDEXING_REVIEW_REQUIRED"],
  ["refresh", "REFRESH_EXISTING", "EXISTING_CONTENT_REFRESH"],
  ["metadata", "TITLE_META_UPDATE", "METADATA_ONLY"],
  ["internal_links", "INTERNAL_LINKS", "INTERNAL_LINK_GAP"],
  ["image", "IMAGE", "IMAGE_GAP"],
];

for (const [disp, action, code] of precedence) {
  const d = evaluateBlogOpportunity(withDisposition(disp));
  ok(
    `D_${disp}_wins_over_new_blog`,
    d.action === action &&
      d.schedulerEligible === false &&
      d.reasonCodes.includes(code) &&
      d.target.entityId === 5
  );
}

ok(
  "D_none_true_ready_new_blog",
  evaluateBlogOpportunity(base()).action === "NEW_BLOG" &&
    evaluateBlogOpportunity(base()).target.entityId === null &&
    evaluateBlogOpportunity(base()).schedulerEligible === true
);
ok(
  "D_none_false_do_nothing",
  evaluateBlogOpportunity(base({ newBlogCandidate: false })).action ===
    "DO_NOTHING" &&
    evaluateBlogOpportunity(base({ newBlogCandidate: false })).reasonCodes.includes(
      "NO_ACTIONABLE_SIGNAL"
    )
);

// ── E. TARGET ──────────────────────────────────────────────────────────────

{
  const d = evaluateBlogOpportunity(withDisposition("refresh"));
  ok(
    "E_existing_preserves_target",
    d.target.entityId === 5 &&
      d.target.url ===
        "https://firestick4uk.com/blog/how-to-speed-up-a-slow-firestick-in-10-minutes"
  );
}
{
  const d = evaluateBlogOpportunity(base());
  ok(
    "E_new_blog_null_target",
    d.action === "NEW_BLOG" && d.target.entityId === null && d.target.url === null
  );
}
{
  const d = evaluateBlogOpportunity(null);
  ok(
    "E_do_nothing_no_fabricated_target",
    d.target.entityId === null && d.target.url === null
  );
}

// ── F. SCHEDULER ───────────────────────────────────────────────────────────

ok("F_new_blog_eligible", isAutonomousNewBlogEligible("NEW_BLOG") === true);
for (const a of BLOG_NEXT_BEST_ACTIONS) {
  if (a === "NEW_BLOG") continue;
  ok(`F_${a}_not_eligible`, isAutonomousNewBlogEligible(a) === false);
}

// ── G. DETERMINISM ─────────────────────────────────────────────────────────

{
  const input = withDisposition("metadata");
  const a = evaluateBlogOpportunity(input);
  const b = evaluateBlogOpportunity(input);
  ok("G_determinism", deepEqual(a, b));
}

// ── H. IMMUTABILITY ────────────────────────────────────────────────────────

{
  const input = base({
    reasonEvidence: ["keep"],
    existingContent: { disposition: "none", entityId: null, url: null },
  });
  const before = JSON.stringify(input);
  evaluateBlogOpportunity(input);
  ok("H_input_immutable", JSON.stringify(input) === before);
}

// ── I. BATCH ───────────────────────────────────────────────────────────────

{
  const batch = [
    withDisposition("technical"),
    base(),
    base({ newBlogCandidate: false }),
  ];
  const out = evaluateBlogOpportunities(batch);
  ok("I_batch_length", out.length === 3);
  ok(
    "I_batch_order",
    out[0].action === "TECHNICAL_FIX" &&
      out[1].action === "NEW_BLOG" &&
      out[2].action === "DO_NOTHING"
  );
  ok("I_no_ranking_sort", out[0].action !== "NEW_BLOG");
}
{
  const tooBig = Array.from({ length: MAX_BLOG_OPPORTUNITY_BATCH + 1 }, (_, i) =>
    base({ opportunityId: `opp-${i}` })
  );
  const out = evaluateBlogOpportunities(tooBig);
  ok(
    "I_batch_bound_fail_closed",
    out.length === 1 &&
      out[0].action === "DO_NOTHING" &&
      out[0].reasonCodes.includes("INVALID_INPUT")
  );
}
ok(
  "I_batch_non_array",
  evaluateBlogOpportunities(null)[0].action === "DO_NOTHING"
);

// ── Adapter ────────────────────────────────────────────────────────────────

ok(
  "K_diag_adapter",
  dispositionFromSeoDiagnosticCategory("canonical") === "technical" &&
    dispositionFromSeoDiagnosticCategory("indexing") === "indexing" &&
    dispositionFromSeoDiagnosticCategory("metadata") === "metadata" &&
    dispositionFromSeoDiagnosticCategory("media") === "image" &&
    dispositionFromSeoDiagnosticCategory("unknown") === null
);

ok(
  "L_no_wire_into_api_blog",
  !fs.existsSync(path.join(ROOT, "pages/api/blog-opportunity.ts")) &&
    !/blogOpportunityEngine/.test(read("pages/api/blog.ts")) &&
    !/blogOpportunityEngine/.test(read("lib/blogPersistenceServer.ts"))
);

console.log(`\nAB-3 results: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
