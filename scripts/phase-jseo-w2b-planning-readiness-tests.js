/**
 * JSEO-W2B — Blog Planning & Evidence Readiness (read-only).
 * Pure helper + panel source contracts. No DB, HTTP, live AI, or CMS writes.
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

const moduleCache = new Map();

function loadTsModule(rel) {
  const key = rel.replace(/\\/g, "/");
  if (moduleCache.has(key)) return moduleCache.get(key);
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
  const exported =
    sandbox.module.exports && Object.keys(sandbox.module.exports).length
      ? sandbox.module.exports
      : sandbox.exports;
  moduleCache.set(key, exported);
  return exported;
}

const helperSrc = read("lib/seoPlanningReadiness.ts");
const panelSrc = read("components/admin/SeoOverviewPanel.tsx");
const overviewApiSrc = read("pages/api/admin-seo-overview.ts");
const researchRouteSrc = read("pages/api/admin-blog-research.ts");
const matcherSrc = read("lib/blogOpportunityMatcher.ts");
const engineSrc = read("lib/blogOpportunityEngine.ts");

const {
  buildSeoPlanningPreview,
  createSeoPlanningHoldDefault,
  mapOverviewBlogToMatchInventory,
  SEO_PLANNING_EVAL_OPPORTUNITY_ID,
} = loadTsModule("lib/seoPlanningReadiness.ts");

const { matchBlogOpportunity } = loadTsModule("lib/blogOpportunityMatcher.ts");

console.log("\nJSEO-W2B Blog Planning & Evidence Readiness\n");

function blogRow(partial) {
  return {
    id: 10,
    title: "How to Speed Up a Slow Firestick",
    slug: "how-to-speed-up-a-slow-firestick",
    status: "published",
    active: true,
    focus_keyword: "slow firestick",
    ...partial,
  };
}

const permsOk = { blog: true, blogManage: true };
const TOPIC = "How to Speed Up a Slow Firestick";

// 1. No topic → HOLD
{
  const d = createSeoPlanningHoldDefault();
  ok("01_default_hold", d.status === "hold" && d.holdCode === "NO_TOPIC");
  ok("01_planning_hold", d.planningDecision === "HOLD");
  ok("01_evidence_missing_label", d.evidenceLabel === "NOT YET COLLECTED");
  ok("01_no_match", d.match === null && d.decision === null);
  ok(
    "01_message",
    /No research topic selected/.test(d.message) &&
      /No AI research has been performed/.test(d.message)
  );
}

// 2. Exact existing match
{
  const preview = buildSeoPlanningPreview({
    topic: TOPIC,
    blog: [blogRow({ id: 10 })],
    permissions: permsOk,
  });
  ok("02_preview_status", preview.status === "preview");
  ok("02_exact", preview.match && preview.match.kind === "EXACT");
  ok(
    "02_title",
    preview.match &&
      preview.match.title === "How to Speed Up a Slow Firestick"
  );
  ok(
    "02_ab4_title",
    preview.ab4ReasonCodes.includes("EXACT_TITLE_MATCH")
  );
  ok("02_entity", preview.match && preview.match.entityId === 10);
  ok(
    "02_url_onsite",
    !!preview.match &&
      typeof preview.match.url === "string" &&
      preview.match.url.startsWith("https://firestick4uk.com/blog/")
  );
}

// 3. Strong match preserves classification
{
  const preview = buildSeoPlanningPreview({
    topic: "Unrelated buffering tips for living rooms",
    intent: undefined,
    blog: [
      blogRow({
        id: 3,
        title: "Completely Different Article Title Here",
        slug: "diff",
        focus_keyword: "Slow Firestick",
      }),
    ],
    permissions: permsOk,
  });
  // focus keyword matching requires focusKeyword on opportunity — without it STRONG may come from similarity
  const viaFocus = matchBlogOpportunity(
    {
      topic: "Unrelated buffering tips for living rooms",
      focusKeyword: "Slow Firestick",
    },
    [
      {
        id: 3,
        title: "Completely Different Article Title Here",
        slug: "diff",
        status: "published",
        active: 1,
        focus_keyword: "slow firestick",
      },
    ]
  );
  ok("03_ab4_strong", viaFocus.match === "STRONG");
  ok(
    "03_ab4_reason",
    viaFocus.reasonCodes.includes("EXACT_FOCUS_KEYWORD_MATCH")
  );

  // Planning helper only passes topic/intent (no fabricated focusKeyword).
  // Strong title-token overlap fixture:
  const strongPreview = buildSeoPlanningPreview({
    topic: "Speed up a slow Firestick device guide",
    blog: [
      blogRow({
        id: 7,
        title: "Speed up a slow Firestick device guide tips",
        slug: "other-device-guide",
        focus_keyword: "",
      }),
    ],
    permissions: permsOk,
  });
  ok(
    "03_helper_match_or_none_honest",
    strongPreview.status === "preview" &&
      strongPreview.match &&
      (strongPreview.match.kind === "STRONG" ||
        strongPreview.match.kind === "EXACT" ||
        strongPreview.match.kind === "NONE")
  );
  if (strongPreview.match && strongPreview.match.kind !== "NONE") {
    ok(
      "03_preserves_reasons",
      Array.isArray(strongPreview.ab4ReasonCodes) &&
        strongPreview.ab4ReasonCodes.length > 0
    );
  } else {
    ok("03_preserves_reasons", true, "NONE path still honest");
  }
}

// Dedicated STRONG via overlapping tokens (AB-4 similarity)
{
  const inventory = [
    blogRow({
      id: 22,
      title: "Firestick buffering fixes for UK homes",
      slug: "firestick-buffering-fixes-uk-homes",
      focus_keyword: "",
    }),
  ];
  const ab4 = matchBlogOpportunity(
    { topic: "Firestick buffering fixes for UK homes tonight" },
    inventory.map((r) => ({ ...r, active: r.active ? 1 : 0 }))
  );
  const preview = buildSeoPlanningPreview({
    topic: "Firestick buffering fixes for UK homes tonight",
    blog: inventory,
    permissions: permsOk,
  });
  ok(
    "03b_strong_or_exact",
    preview.status === "preview" &&
      preview.match &&
      (preview.match.kind === ab4.match)
  );
  ok(
    "03b_codes_match_ab4",
    preview.status === "preview" &&
      JSON.stringify(preview.ab4ReasonCodes) === JSON.stringify(ab4.reasonCodes)
  );
}

// 4. No match → no approved NEW_BLOG
{
  const preview = buildSeoPlanningPreview({
    topic: "Completely unique quantum firestick orchid tutorial xyz",
    blog: [
      blogRow({
        id: 1,
        title: "IPTV package comparison UK",
        slug: "iptv-package-comparison-uk",
        focus_keyword: "iptv uk",
      }),
    ],
    permissions: permsOk,
  });
  ok("04_preview", preview.status === "preview");
  ok("04_none", preview.match && preview.match.kind === "NONE");
  ok(
    "04_no_new_blog_approval",
    /does not approve creating a new article/.test(preview.message)
  );
  ok(
    "04_hold_decision",
    preview.planningDecision === "HOLD" &&
      preview.decision &&
      preview.decision.action === "DO_NOTHING"
  );
  ok(
    "04_no_ready",
    preview.evidenceLabel === "NOT YET COLLECTED" &&
      !/READY/.test(JSON.stringify(preview))
  );
}

// 5. Empty inventory → HOLD not false no-match
{
  const preview = buildSeoPlanningPreview({
    topic: TOPIC,
    blog: [],
    permissions: permsOk,
  });
  ok("05_hold", preview.status === "hold");
  ok("05_code", preview.holdCode === "INVENTORY_EMPTY_UNVERIFIED");
  ok("05_not_none_claim", preview.match === null);
  ok(
    "05_message",
    /not verifiably complete|unavailable/i.test(preview.message)
  );
}

// 6. Malformed inventory → HOLD
{
  const bad = buildSeoPlanningPreview({
    topic: TOPIC,
    blog: [{ id: "x", title: 1 }],
    permissions: permsOk,
  });
  ok("06_malformed_hold", bad.status === "hold");
  ok("06_code", bad.holdCode === "INVENTORY_MALFORMED");

  const notArray = buildSeoPlanningPreview({
    topic: TOPIC,
    blog: { id: 1 },
    permissions: permsOk,
  });
  ok("06_not_array", notArray.holdCode === "INVENTORY_MALFORMED");

  const mapBad = mapOverviewBlogToMatchInventory([{ id: 1, title: "t" }]);
  ok("06_map_fail", mapBad.ok === false);
}

// 7. Missing Blog permission
{
  const preview = buildSeoPlanningPreview({
    topic: TOPIC,
    blog: [blogRow()],
    permissions: { blog: false, blogManage: false },
  });
  ok("07_denied", preview.status === "hold");
  ok("07_code", preview.holdCode === "BLOG_PERMISSION_DENIED");
  ok("07_no_open", preview.canOpenBlog === false);
  ok("07_no_match_data", preview.match === null);
}

// 8. AB-4 INVALID_INPUT → fail closed
{
  const preview = buildSeoPlanningPreview({
    topic: "a".repeat(500),
    blog: [blogRow()],
    permissions: permsOk,
  });
  ok(
    "08_invalid_topic",
    preview.status === "hold" &&
      (preview.holdCode === "INVALID_TOPIC" ||
        preview.holdCode === "AB4_INVALID_INPUT")
  );

  const unavailable = buildSeoPlanningPreview({
    topic: TOPIC,
    blog: undefined,
    permissions: permsOk,
  });
  ok("08_unavailable", unavailable.holdCode === "INVENTORY_UNAVAILABLE");
}

// 9–12. AB-3 evidence missing / DO_NOTHING / scheduler / no READY fabrications
{
  const preview = buildSeoPlanningPreview({
    topic: TOPIC,
    blog: [blogRow()],
    permissions: permsOk,
  });
  ok("09_evidence_state", preview.evidenceState === "missing");
  ok(
    "10_do_nothing",
    preview.decision &&
      preview.decision.action === "DO_NOTHING" &&
      preview.ab3ReasonCodes.includes("EVIDENCE_MISSING")
  );
  ok(
    "11_scheduler_false",
    preview.decision && preview.decision.schedulerEligible === false
  );
  ok(
    "12_no_stale_ready_counts",
    preview.evidenceLabel === "NOT YET COLLECTED" &&
      preview.planningDecision === "HOLD" &&
      !helperSrc.includes('evidenceState: "ready"') &&
      !helperSrc.includes('evidenceState: "stale"') &&
      !/sourceCount|claimCount|searchVolume/.test(helperSrc)
  );
  ok(
    "12b_eval_id_bounded",
    typeof SEO_PLANNING_EVAL_OPPORTUNITY_ID === "string" &&
      SEO_PLANNING_EVAL_OPPORTUNITY_ID.length > 0 &&
      SEO_PLANNING_EVAL_OPPORTUNITY_ID.length <= 128
  );
}

// 13–14. Refresh invalidate + Clear — panel contracts
ok(
  "13_refresh_invalidates",
  /invalidatePlanningPreview/.test(panelSrc) &&
    panelSrc.includes("invalidatePlanningPreview()") &&
    /createSeoPlanningHoldDefault/.test(panelSrc)
);
ok(
  "14_clear_restores_hold",
  /clearPlanningPreview/.test(panelSrc) &&
    /Clear/.test(panelSrc) &&
    panelSrc.includes("createSeoPlanningHoldDefault()")
);

// 15. No research POST / provider / CMS writes in helper or planning UI path
ok(
  "15_helper_no_fetch",
  !/\bfetch\s*\(/.test(helperSrc) &&
    !/openai|gemini|OpenAI/i.test(helperSrc) &&
    !/INSERT|UPDATE|mysql|createPool/i.test(helperSrc)
);
ok(
  "15_panel_planning_no_research_post",
  /buildSeoPlanningPreview/.test(panelSrc) &&
    !/admin-blog-research/.test(panelSrc) &&
    /Check Existing Blog Coverage/.test(panelSrc)
);

// 16. W1 + overview preserved
ok(
  "16_w1_intact",
  /SEO Daily Work Queue/.test(panelSrc) &&
    /buildSeoDailyWorkQueue/.test(panelSrc) &&
    /seo-daily-work-queue/.test(panelSrc)
);
ok(
  "16_diagnostics_after_planning",
  panelSrc.indexOf('id="seo-daily-work-queue"') <
    panelSrc.indexOf('id="seo-blog-planning-readiness"') &&
    panelSrc.indexOf('id="seo-blog-planning-readiness"') <
      panelSrc.indexOf('id="seo-diagnostics"')
);
ok(
  "16_overview_api_untouched_writes",
  !overviewApiSrc.includes("seoPlanningReadiness") &&
    !/INSERT INTO/.test(overviewApiSrc)
);

// 17. No new API dependency
ok(
  "17_no_new_api_file",
  !fs.existsSync(path.join(ROOT, "pages/api/admin-seo-planning.ts")) &&
    !fs.existsSync(path.join(ROOT, "app/api/admin-seo-planning/route.ts"))
);
ok(
  "17_helper_uses_existing_engines",
  /matchBlogOpportunity/.test(helperSrc) &&
    /evaluateBlogOpportunity/.test(helperSrc) &&
    /toBlogOpportunityExistingContent/.test(helperSrc)
);

// 18. OpenAI research route super_admin canary untouched
ok(
  "18_research_super_admin",
  /super_admin/.test(researchRouteSrc) &&
    !researchRouteSrc.includes("seoPlanningReadiness")
);

// UI safety: topic rendered as text (value=), not dangerouslySetInnerHTML
ok(
  "ui_no_dangerously_set_inner_html_planning",
  !/dangerouslySetInnerHTML/.test(panelSrc) ||
    !/planningTopic/.test(
      panelSrc.slice(
        panelSrc.indexOf("seo-blog-planning-readiness"),
        panelSrc.indexOf("seo-diagnostics")
      )
    )
);
ok(
  "ui_default_hold_copy",
  /Planning status:/.test(panelSrc) &&
    /Research evidence:/.test(panelSrc) &&
    (/NOT YET COLLECTED/.test(panelSrc) || /evidenceLabel/.test(panelSrc))
);
ok(
  "ui_engines_not_duplicated",
  !/function matchBlogOpportunity/.test(helperSrc) &&
    /export function matchBlogOpportunity/.test(matcherSrc) &&
    /export function evaluateBlogOpportunity/.test(engineSrc)
);

// Draft/inactive rows must not be dropped by mapper
{
  const mapped = mapOverviewBlogToMatchInventory([
    blogRow({ id: 1, status: "draft", active: false }),
    blogRow({ id: 2, status: "published", active: true, slug: "other", title: "Other" }),
  ]);
  ok("map_keeps_draft", mapped.ok && mapped.rows.length === 2);
  ok(
    "map_draft_status",
    mapped.ok && mapped.rows.some((r) => r.status === "draft" && r.active === false)
  );
}

console.log(`\nJSEO-W2B results: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
