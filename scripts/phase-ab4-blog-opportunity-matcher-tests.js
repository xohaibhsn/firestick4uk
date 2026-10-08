/**
 * AB-4 — Pure blog opportunity refresh-first / dedup matcher tests.
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

const src = read("lib/blogOpportunityMatcher.ts");
const {
  matchBlogOpportunity,
  toBlogOpportunityExistingContent,
  computeBlogTopicSimilarity,
  tokenizeBlogTopic,
  normalizeBlogMatchTitle,
  normalizeBlogMatchSlug,
  MAX_BLOG_MATCH_INVENTORY,
  STRONG_TOKEN_SIMILARITY_THRESHOLD,
  MIN_MEANINGFUL_TOKENS,
} = loadTsModule("lib/blogOpportunityMatcher.ts");

console.log("\nAB-4 Blog Opportunity Matcher\n");

function row(partial) {
  return {
    id: 1,
    title: "How to Speed Up a Slow Firestick",
    slug: "how-to-speed-up-a-slow-firestick",
    status: "published",
    active: 1,
    focus_keyword: "slow firestick",
    category: "guides",
    ...partial,
  };
}

const SPEED_TOPIC = "How to speed up a slow Firestick";

// ── A. EXACT SLUG ──────────────────────────────────────────────────────────

{
  const r = matchBlogOpportunity(
    {
      topic: "Totally Different Topic",
      proposedSlug: "how-to-speed-up-a-slow-firestick",
    },
    [row({ id: 10 })]
  );
  ok("A_exact_slug", r.match === "EXACT" && r.reasonCodes.includes("EXACT_SLUG_MATCH"));
  ok("A_blocks_new_blog", r.newBlogCandidate === false);
  ok(
    "A_target",
    r.matchedEntityId === 10 &&
      r.matchedUrl === "https://firestick4uk.com/blog/how-to-speed-up-a-slow-firestick"
  );
  ok("A_disposition_refresh", r.disposition === "refresh");
}

// ── B. EXACT TITLE ─────────────────────────────────────────────────────────

{
  const r = matchBlogOpportunity(
    { topic: "How to   Speed Up a Slow Firestick!" },
    [row({ id: 2, slug: "other-slug", focus_keyword: "" })]
  );
  ok("B_exact_title_norm", r.match === "EXACT" && r.signals.titleExact === true);
  ok("B_blocks_new_blog", r.newBlogCandidate === false);
  ok("B_reason", r.reasonCodes.includes("EXACT_TITLE_MATCH"));
}

ok(
  "B_title_helper",
  normalizeBlogMatchTitle("How to Speed Up a Slow Firestick") ===
    normalizeBlogMatchTitle("how to   speed up a slow firestick!")
);

// ── C. FOCUS KEYWORD ───────────────────────────────────────────────────────

{
  const r = matchBlogOpportunity(
    {
      topic: "Unrelated buffering tips for living rooms",
      focusKeyword: "Slow Firestick",
    },
    [row({ id: 3, title: "Completely Different Article Title Here", slug: "diff" })]
  );
  ok("C_focus_strong", r.match === "STRONG" && r.signals.focusKeywordExact === true);
  ok("C_blocks_new_blog", r.newBlogCandidate === false);
  ok(
    "C_reason",
    r.reasonCodes.includes("EXACT_FOCUS_KEYWORD_MATCH") &&
      r.reasonCodes.includes("POTENTIAL_CANNIBALIZATION")
  );
}

// ── D. STRONG OVERLAP ──────────────────────────────────────────────────────

{
  const high = matchBlogOpportunity(
    { topic: "How to speed up your slow Firestick" },
    [
      row({
        id: 4,
        title: "How to Speed Up a Slow Firestick",
        slug: "other-4",
        focus_keyword: "",
      }),
    ]
  );
  ok(
    "D_high_overlap_strong",
    high.match === "STRONG" &&
      high.signals.tokenSimilarity >= STRONG_TOKEN_SIMILARITY_THRESHOLD,
    `sim=${high.signals.tokenSimilarity}`
  );
  ok("D_high_blocks_new", high.newBlogCandidate === false);
  ok(
    "D_potential_cannibal_term",
    high.reasonCodes.includes("POTENTIAL_CANNIBALIZATION") &&
      high.reasonCodes.includes("STRONG_TOPIC_OVERLAP")
  );
}

{
  const low = matchBlogOpportunity(
    { topic: SPEED_TOPIC },
    [
      row({
        id: 5,
        title: "Firestick Setup Guide",
        slug: "firestick-setup-guide",
        focus_keyword: "",
      }),
    ]
  );
  ok("D_generic_overlap_none", low.match === "NONE" && low.newBlogCandidate === true);
}

{
  const tiny = matchBlogOpportunity(
    { topic: "Firestick setup" },
    [
      row({
        id: 6,
        title: "Firestick buffering",
        slug: "firestick-buffering",
        focus_keyword: "",
      }),
    ]
  );
  ok("D_two_token_none", tiny.match === "NONE");
}

{
  const simBoundary = computeBlogTopicSimilarity(
    "How to speed up your slow Firestick",
    "How to Speed Up a Slow Firestick"
  );
  ok(
    "D_threshold_documented",
    STRONG_TOKEN_SIMILARITY_THRESHOLD === 0.8 && simBoundary >= 0.8,
    `sim=${simBoundary}`
  );
  ok(
    "D_min_tokens",
    MIN_MEANINGFUL_TOKENS === 3 &&
      computeBlogTopicSimilarity("a b", "a c") === 0
  );
}

// ── E. DRAFT DEDUP ─────────────────────────────────────────────────────────

{
  const r = matchBlogOpportunity(
    { topic: SPEED_TOPIC, proposedSlug: "how-to-speed-up-a-slow-firestick" },
    [row({ id: 7, status: "draft", active: 1 })]
  );
  ok("E_draft_blocks", r.match === "EXACT" && r.newBlogCandidate === false);
  ok("E_draft_refresh", r.disposition === "refresh");
  ok("E_draft_reason", r.reasonCodes.includes("EXISTING_DRAFT_MATCH"));
}

// ── F. PUBLISHED ACTIVE ────────────────────────────────────────────────────

{
  const r = matchBlogOpportunity({ topic: SPEED_TOPIC }, [row({ id: 8 })]);
  ok("F_published_refresh", r.disposition === "refresh" && r.match === "EXACT");
  ok("F_published_reason", r.reasonCodes.includes("EXISTING_PUBLISHED_MATCH"));
}

// ── G. INACTIVE ────────────────────────────────────────────────────────────

{
  const r = matchBlogOpportunity({ topic: SPEED_TOPIC }, [
    row({ id: 9, active: 0 }),
  ]);
  ok("G_inactive_historical", r.disposition === "historical_recovery");
  ok("G_inactive_blocks_new", r.newBlogCandidate === false);
  ok("G_inactive_reason", r.reasonCodes.includes("INACTIVE_EXISTING_MATCH"));
}

// ── H. MULTIPLE MATCHES ────────────────────────────────────────────────────

{
  const r = matchBlogOpportunity(
    {
      topic: SPEED_TOPIC,
      proposedSlug: "slug-winner",
      focusKeyword: "slow firestick",
    },
    [
      row({
        id: 20,
        title: "How to Speed Up a Slow Firestick",
        slug: "title-match",
        focus_keyword: "slow firestick",
      }),
      row({
        id: 21,
        title: "Other",
        slug: "slug-winner",
        focus_keyword: "",
      }),
      row({
        id: 22,
        title: "How to speed up your slow Firestick device today",
        slug: "sim-row",
        focus_keyword: "",
      }),
    ]
  );
  ok("H_slug_beats_all", r.matchedEntityId === 21 && r.signals.slugExact === true);
}

{
  const r = matchBlogOpportunity(
    { topic: SPEED_TOPIC, focusKeyword: "slow firestick" },
    [
      row({
        id: 30,
        title: "Unrelated Title Completely Different Words",
        slug: "a",
        focus_keyword: "slow firestick",
      }),
      row({
        id: 31,
        title: "How to Speed Up a Slow Firestick",
        slug: "b",
        focus_keyword: "",
      }),
    ]
  );
  ok("H_title_beats_focus", r.matchedEntityId === 31 && r.match === "EXACT");
}

{
  const r = matchBlogOpportunity(
    {
      topic: "Completely unrelated living room tips for families",
      focusKeyword: "slow firestick",
    },
    [
      row({
        id: 40,
        title: "How to speed up your slow Firestick device today",
        slug: "sim",
        focus_keyword: "",
      }),
      row({
        id: 41,
        title: "Something Else Entirely Different Topic",
        slug: "fk",
        focus_keyword: "slow firestick",
      }),
    ]
  );
  ok("H_focus_beats_similarity", r.matchedEntityId === 41 && r.match === "STRONG");
}

{
  const r = matchBlogOpportunity(
    { topic: "How to speed up your slow Firestick" },
    [
      row({
        id: 50,
        title: "How to speed up your slow Firestick now",
        slug: "s1",
        focus_keyword: "",
        status: "draft",
        active: 1,
      }),
      row({
        id: 51,
        title: "How to speed up your slow Firestick now",
        slug: "s2",
        focus_keyword: "",
        status: "published",
        active: 1,
      }),
    ]
  );
  ok(
    "H_tie_prefers_published_active",
    r.matchedEntityId === 51,
    `got=${r.matchedEntityId}`
  );
}

{
  const r = matchBlogOpportunity(
    { topic: "How to speed up your slow Firestick" },
    [
      row({
        id: 61,
        title: "How to speed up your slow Firestick now",
        slug: "higher-id",
        focus_keyword: "",
      }),
      row({
        id: 60,
        title: "How to speed up your slow Firestick now",
        slug: "lower-id",
        focus_keyword: "",
      }),
    ]
  );
  ok("H_tie_lowest_id", r.matchedEntityId === 60);
}

// ── I. NONE ────────────────────────────────────────────────────────────────

{
  const r = matchBlogOpportunity(
    { topic: "Best IPTV subscription plans for UK households" },
    [
      row({
        id: 70,
        title: "Firestick Setup Guide",
        slug: "firestick-setup-guide",
        focus_keyword: "setup",
      }),
    ]
  );
  ok("I_none", r.match === "NONE");
  ok("I_disposition_none", r.disposition === "none");
  ok("I_new_blog_true", r.newBlogCandidate === true);
  ok("I_null_target", r.matchedEntityId === null && r.matchedUrl === null);
}

// ── J. INVALID OPPORTUNITY ─────────────────────────────────────────────────

ok("J_null_opp", matchBlogOpportunity(null, []).newBlogCandidate === false);
ok("J_blank_topic", matchBlogOpportunity({ topic: "  " }, []).newBlogCandidate === false);
ok(
  "J_invalid_reason",
  matchBlogOpportunity({ topic: "" }, []).reasonCodes.includes("INVALID_INPUT")
);
ok(
  "J_not_new_blog",
  matchBlogOpportunity(42, [row({})]).match === "NONE" &&
    matchBlogOpportunity(42, [row({})]).newBlogCandidate === false
);

// ── K. INVALID INVENTORY ───────────────────────────────────────────────────

{
  const r = matchBlogOpportunity({ topic: SPEED_TOPIC }, [
    row({ id: -1 }),
  ]);
  ok("K_bad_id_fail_closed", r.newBlogCandidate === false && r.reasonCodes.includes("INVALID_INPUT"));
}

{
  const r = matchBlogOpportunity({ topic: SPEED_TOPIC }, [
    row({ status: "archived" }),
  ]);
  ok("K_bad_status_fail_closed", r.newBlogCandidate === false);
}

{
  const r = matchBlogOpportunity({ topic: SPEED_TOPIC }, "not-array");
  ok("K_non_array_fail_closed", r.newBlogCandidate === false);
}

// ── L. BOUNDS ──────────────────────────────────────────────────────────────

{
  const big = [];
  for (let i = 1; i <= MAX_BLOG_MATCH_INVENTORY + 1; i += 1) {
    big.push(row({ id: i, slug: `slug-${i}`, title: `Unique Title Number ${i} Extra Words` }));
  }
  const r = matchBlogOpportunity({ topic: "Unique Title Number 1 Extra Words" }, big);
  ok("L_inventory_max", r.newBlogCandidate === false && r.reasonCodes.includes("INVALID_INPUT"));
}

{
  const longTopic = "x".repeat(201);
  ok(
    "L_topic_length",
    matchBlogOpportunity({ topic: longTopic }, []).reasonCodes.includes("INVALID_INPUT")
  );
}

// ── M. URL ─────────────────────────────────────────────────────────────────

{
  const r = matchBlogOpportunity({ topic: SPEED_TOPIC }, [
    row({ id: 80, slug: "Good-Slug" }),
  ]);
  ok(
    "M_apex_https",
    r.matchedUrl === "https://firestick4uk.com/blog/good-slug"
  );
}

{
  const r = matchBlogOpportunity({ topic: SPEED_TOPIC }, [
    row({ id: 81, slug: "   ", title: "How to Speed Up a Slow Firestick" }),
  ]);
  ok("M_blank_slug_null_url", r.match === "EXACT" && r.matchedUrl === null);
}

ok(
  "M_slug_helper",
  normalizeBlogMatchSlug("How To Speed!!") === "how-to-speed"
);

// ── N. DETERMINISM ─────────────────────────────────────────────────────────

{
  const inputOpp = { topic: SPEED_TOPIC, proposedSlug: "how-to-speed-up-a-slow-firestick" };
  const inputInv = [row({ id: 90 })];
  const a = matchBlogOpportunity(inputOpp, inputInv);
  const b = matchBlogOpportunity(inputOpp, inputInv);
  ok("N_determinism", deepEqual(a, b));
}

// ── O. IMMUTABILITY ────────────────────────────────────────────────────────

{
  const opp = { topic: SPEED_TOPIC, proposedSlug: "abc", focusKeyword: "kw" };
  const inv = [row({ id: 91 })];
  const oppSnap = JSON.stringify(opp);
  const invSnap = JSON.stringify(inv);
  matchBlogOpportunity(opp, inv);
  ok("O_immutability", JSON.stringify(opp) === oppSnap && JSON.stringify(inv) === invSnap);
}

// ── P. AB-3 ADAPTER ────────────────────────────────────────────────────────

{
  const refresh = matchBlogOpportunity({ topic: SPEED_TOPIC }, [row({ id: 100 })]);
  const handoff = toBlogOpportunityExistingContent(refresh);
  ok(
    "P_refresh_mapping",
    handoff.existingContent.disposition === "refresh" &&
      handoff.existingContent.entityId === 100 &&
      handoff.newBlogCandidate === false
  );
}

{
  const hist = matchBlogOpportunity({ topic: SPEED_TOPIC }, [
    row({ id: 101, active: false }),
  ]);
  const handoff = toBlogOpportunityExistingContent(hist);
  ok(
    "P_historical_mapping",
    handoff.existingContent.disposition === "historical_recovery" &&
      handoff.newBlogCandidate === false
  );
}

{
  const none = matchBlogOpportunity(
    { topic: "Best IPTV subscription plans for UK households" },
    [row({ id: 102, title: "Firestick Setup Guide", slug: "fs", focus_keyword: "" })]
  );
  const handoff = toBlogOpportunityExistingContent(none);
  ok(
    "P_none_mapping",
    handoff.existingContent.disposition === "none" &&
      handoff.existingContent.entityId === null &&
      handoff.newBlogCandidate === true
  );
}

{
  const bad = toBlogOpportunityExistingContent(null);
  ok("P_invalid_adapter_no_new", bad.newBlogCandidate === false);
}

// ── Q. PURE / SIDE EFFECTS ─────────────────────────────────────────────────

ok("Q_no_db", !/\bfrom\s+["'][^"']*db[^"']*["']|mysql|createPool|getPool/i.test(src));
ok("Q_no_fetch", !/\bfetch\s*\(|axios|http\.request|node-fetch/i.test(src));
ok(
  "Q_no_provider",
  !/openai|gemini|@google|anthropic|generateContent/i.test(src)
);
ok("Q_no_env", !/process\.env/i.test(src));
ok("Q_no_fs", !/\bfrom\s+["']fs["']|readFileSync|writeFileSync/i.test(src));
ok(
  "Q_no_persistence",
  !/blogPersistence|createAutonomous|publishAutonomous|writeAudit|createRevision/i.test(
    src
  )
);
ok("Q_no_random_time", !/Date\.now|Math\.random|setTimeout|setInterval/i.test(src));
ok(
  "Q_only_seoOverview_import",
  /from\s+["']@\/lib\/seoOverview["']/.test(src) &&
    !/from\s+["']@\/lib\/blogPersistence/.test(src) &&
    !/from\s+["']@\/lib\/blogOpportunityEngine/.test(src)
);

// Realistic collision fixtures summary already covered above:
ok(
  "fixture_exact_title_speed",
  matchBlogOpportunity({ topic: SPEED_TOPIC }, [
    row({ title: "How to Speed Up a Slow Firestick", slug: "x", focus_keyword: "" }),
  ]).match === "EXACT"
);
ok(
  "fixture_strong_your_variant",
  matchBlogOpportunity({ topic: "How to speed up your slow Firestick" }, [
    row({ title: "How to Speed Up a Slow Firestick", slug: "y", focus_keyword: "" }),
  ]).match === "STRONG"
);
ok(
  "fixture_setup_not_strong",
  matchBlogOpportunity({ topic: SPEED_TOPIC }, [
    row({ title: "Firestick Setup Guide", slug: "z", focus_keyword: "" }),
  ]).match === "NONE"
);

ok(
  "tokenize_stable",
  deepEqual(tokenizeBlogTopic("How to speed up a slow Firestick"), [
    "speed",
    "up",
    "slow",
    "firestick",
  ])
);

console.log(`\nAB-4 results: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
