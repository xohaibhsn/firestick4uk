/**
 * JSEO-W4B — Ephemeral editorial research brief handoff.
 * Pure formatter + panel source contracts. No live provider / clipboard APIs.
 *
 * Limitation: no React Testing Library — checklist reset / copy wiring and
 * clipboard failure messaging are verified via source contracts + pure helpers.
 * Browser mount/remount retention is implied by non-persisted useState (no
 * localStorage/sessionStorage) rather than a rendered component harness.
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
        return loadTsModule(
          path.relative(ROOT, base + ".ts").replace(/\\/g, "/")
        );
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

const helperSrc = read("lib/seoPlanningResearchUi.ts");
const panelSrc = read("components/admin/SeoOverviewPanel.tsx");
const planningHelperSrc = read("lib/seoPlanningReadiness.ts");
const sidhuSrc = read("app/sidhu/page.tsx");

const {
  buildSeoEditorialResearchBrief,
  createDefaultSeoEditorialChecklist,
  createIdleSeoPlanningResearchState,
  createLoadingSeoPlanningResearchState,
  interpretSeoPlanningResearchResponse,
  SEO_EDITORIAL_CHECKLIST_ITEM_IDS,
  SEO_EDITORIAL_CHECKLIST_BRIEF_LABELS,
} = loadTsModule("lib/seoPlanningResearchUi.ts");

const { buildSeoPlanningPreview } = loadTsModule("lib/seoPlanningReadiness.ts");

console.log("\nJSEO-W4B Editorial research brief handoff\n");

const TOPIC = "How to Speed Up a Slow Firestick";
const INTENT = "neutral setup guidance";

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

const subject = {
  opportunityId: "manual-openai-research-w4b-1",
  topic: TOPIC,
  intent: INTENT,
};

const readyEvidence = {
  ok: true,
  evidenceState: "ready",
  subject,
  summary: "HDMI and cache guidance summary for UK Fire TV Stick viewers.",
  sources: [
    {
      id: "s1",
      title: "Amazon Fire TV Help",
      url: "https://www.amazon.co.uk/gp/help/customer/display.html",
      publishedAt: null,
    },
    {
      id: "s2",
      title: "HDMI overview",
      url: "https://www.hdmi.org/",
      publishedAt: "2024-01-01",
    },
  ],
  claims: [
    { claim: "Use an HDMI port on the television.", sourceIds: ["s1"] },
    {
      claim: "HDMI carries video and audio.",
      sourceIds: ["s1", "s2"],
    },
  ],
  unknowns: ["Exact TV menu labels vary by brand."],
  searchQueries: ["Fire TV Stick HDMI UK television"],
  reasonCodes: ["GROUNDED_EVIDENCE_READY"],
};

const ready = interpretSeoPlanningResearchResponse({
  httpStatus: 200,
  json: {
    ok: true,
    provider: "openai",
    task: "research_blog_evidence",
    evidence: readyEvidence,
  },
  expectedSubject: subject,
});

const matchingPreview = buildSeoPlanningPreview({
  topic: TOPIC,
  intent: INTENT,
  blog: [blogRow()],
  permissions: { blog: true, blogManage: true },
});

const nonePreview = buildSeoPlanningPreview({
  topic: "Completely unrelated niche gardening topic xyz",
  blog: [blogRow()],
  permissions: { blog: true, blogManage: true },
});

const defaultChecklist = createDefaultSeoEditorialChecklist();

// ── A. Brief formatter ──────────────────────────────────────────────────────

ok("01_ready_produces_brief", (() => {
  const out = buildSeoEditorialResearchBrief({
    researchUi: ready,
    checklist: defaultChecklist,
    planningPreview: matchingPreview,
  });
  return out.ok === true && typeof out.brief === "string" && out.brief.length > 100;
})());

{
  const out = buildSeoEditorialResearchBrief({
    researchUi: ready,
    checklist: defaultChecklist,
    planningPreview: matchingPreview,
  });
  ok("02_topic_included", out.ok && out.brief.includes(TOPIC));
  ok("03_intent_included", out.ok && out.brief.includes(INTENT));
  ok(
    "04_opportunity_id_preserved",
    out.ok && out.brief.includes(subject.opportunityId)
  );
  ok(
    "05_summary_preserved",
    out.ok && out.brief.includes(readyEvidence.summary)
  );
  ok(
    "06_source_ids_preserved",
    out.ok &&
      out.brief.includes("[s1]") &&
      out.brief.includes("[s2]") &&
      !out.brief.includes("[S1]")
  );
  ok(
    "07_source_urls_exact",
    out.ok &&
      out.brief.includes(
        "URL: https://www.amazon.co.uk/gp/help/customer/display.html"
      ) &&
      out.brief.includes("URL: https://www.hdmi.org/")
  );
  ok(
    "08_published_only_when_present",
    out.ok &&
      out.brief.includes("Published: 2024-01-01") &&
      (out.brief.match(/Published:/g) || []).length === 1
  );
  ok(
    "09_claim_text_preserved",
    out.ok &&
      out.brief.includes("Use an HDMI port on the television.") &&
      out.brief.includes("HDMI carries video and audio.")
  );
  ok(
    "10_claim_source_ids_associated",
    out.ok &&
      /Use an HDMI port[\s\S]*?Supporting source IDs: s1\b/.test(out.brief) &&
      /HDMI carries video[\s\S]*?Supporting source IDs: s1, s2\b/.test(out.brief)
  );
  ok(
    "11_unknowns_preserved",
    out.ok && out.brief.includes("Exact TV menu labels vary by brand.")
  );
  ok(
    "12_search_queries_preserved",
    out.ok && out.brief.includes("Fire TV Stick HDMI UK television")
  );
  ok(
    "13_reason_codes_preserved",
    out.ok && out.brief.includes("GROUNDED_EVIDENCE_READY")
  );
  ok(
    "14_ab4_match_for_matching_subject",
    out.ok &&
      /EXISTING BLOG COVERAGE \(ADVISORY\)/.test(out.brief) &&
      /Match: EXACT|Match: STRONG/.test(out.brief)
  );
}

{
  const mismatchedPreview = buildSeoPlanningPreview({
    topic: "Different checked topic entirely",
    blog: [blogRow({ title: "Different", slug: "different", focus_keyword: "different" })],
    permissions: { blog: true, blogManage: true },
  });
  const out = buildSeoEditorialResearchBrief({
    researchUi: ready,
    checklist: defaultChecklist,
    planningPreview: mismatchedPreview,
  });
  ok(
    "15_mismatched_preview_not_as_current_coverage",
    out.ok &&
      out.brief.includes(
        "No matching AB-4 planning preview is currently associated with this research subject."
      ) &&
      !/Match: EXACT|Match: STRONG|Match: NONE/.test(out.brief)
  );
}

{
  const readyNoneSubject = {
    opportunityId: "manual-openai-research-w4b-none",
    topic: "Completely unrelated niche gardening topic xyz",
    intent: null,
  };
  const readyNoneEvidence = {
    ...readyEvidence,
    subject: readyNoneSubject,
    summary: "Gardening summary that still has two sources and claims.",
  };
  const readyNone = interpretSeoPlanningResearchResponse({
    httpStatus: 200,
    json: {
      ok: true,
      provider: "openai",
      task: "research_blog_evidence",
      evidence: readyNoneEvidence,
    },
    expectedSubject: readyNoneSubject,
  });
  const out = buildSeoEditorialResearchBrief({
    researchUi: readyNone,
    checklist: defaultChecklist,
    planningPreview: nonePreview,
  });
  ok(
    "16_none_match_cannot_authorize_new_article",
    out.ok &&
      out.brief.includes("Match: NONE") &&
      /does not authorize creating or publishing a new Blog article/i.test(
        out.brief
      ) &&
      /Planning remains HOLD/.test(out.brief)
  );
}

{
  const out = buildSeoEditorialResearchBrief({
    researchUi: ready,
    checklist: defaultChecklist,
    planningPreview: matchingPreview,
  });
  ok(
    "17_hold_not_saved_no_publish",
    out.ok &&
      /Planning: HOLD/.test(out.brief) &&
      /has not been saved in the CMS/.test(out.brief) &&
      /Publishing requires separate human editorial approval/.test(out.brief) &&
      /No Blog article or draft has been created or approved/.test(out.brief)
  );
  ok(
    "18_no_invented_urls_or_verdicts",
    out.ok &&
      !/https:\/\/example\.com/.test(out.brief) &&
      !/APPROVED FOR PUBLISH/.test(out.brief) &&
      !/NEW_BLOG authorized/.test(out.brief) &&
      out.brief.includes(
        "URL: https://www.amazon.co.uk/gp/help/customer/display.html"
      ) &&
      out.brief.includes("URL: https://www.hdmi.org/") &&
      (out.brief.match(/^URL: https:\/\//gm) || []).length === 2
  );
}

// ── B. Negative cases ───────────────────────────────────────────────────────

ok(
  "19_idle_cannot_produce_brief",
  !buildSeoEditorialResearchBrief({
    researchUi: createIdleSeoPlanningResearchState(),
    checklist: defaultChecklist,
  }).ok
);
ok(
  "20_loading_cannot_produce_brief",
  !buildSeoEditorialResearchBrief({
    researchUi: createLoadingSeoPlanningResearchState(subject),
    checklist: defaultChecklist,
  }).ok
);

const missing = interpretSeoPlanningResearchResponse({
  httpStatus: 200,
  json: {
    ok: true,
    provider: "openai",
    task: "research_blog_evidence",
    evidence: {
      ok: false,
      evidenceState: "missing",
      sources: [],
      claims: [],
      unknowns: [],
      searchQueries: [],
      reasonCodes: ["INSUFFICIENT_SOURCES"],
    },
  },
  expectedSubject: subject,
});
ok(
  "21_missing_cannot_produce_brief",
  missing.status === "missing" &&
    !buildSeoEditorialResearchBrief({
      researchUi: missing,
      checklist: defaultChecklist,
    }).ok
);

const errored = interpretSeoPlanningResearchResponse({
  httpStatus: 502,
  json: { ok: false, code: "provider_upstream", message: "Upstream failed." },
  expectedSubject: subject,
});
ok(
  "22_error_cannot_produce_brief",
  errored.status === "error" &&
    !buildSeoEditorialResearchBrief({
      researchUi: errored,
      checklist: defaultChecklist,
    }).ok
);

{
  const malformedReady = {
    ...ready,
    sources: ready.status === "ready" ? [ready.sources[0]] : [],
  };
  ok(
    "23_malformed_ready_fails_closed",
    ready.status === "ready" &&
      !buildSeoEditorialResearchBrief({
        researchUi: malformedReady,
        checklist: defaultChecklist,
      }).ok
  );
}

{
  const brokenProvenance = {
    ...ready,
    claims:
      ready.status === "ready"
        ? [
            { claim: "Orphan claim without real source.", sourceIds: ["missing-id"] },
            ready.claims[1],
          ]
        : [],
  };
  ok(
    "24_missing_provenance_fails_closed",
    ready.status === "ready" &&
      !buildSeoEditorialResearchBrief({
        researchUi: brokenProvenance,
        checklist: defaultChecklist,
      }).ok
  );
}

{
  const hugeSummary = "A".repeat(20_000);
  const oversized = {
    ...ready,
    summary: hugeSummary,
  };
  ok(
    "25_oversized_malformed_fails_closed",
    ready.status === "ready" &&
      !buildSeoEditorialResearchBrief({
        researchUi: oversized,
        checklist: defaultChecklist,
      }).ok
  );
}

// ── C. Checklist ────────────────────────────────────────────────────────────

ok(
  "26_checklist_defaults_unchecked",
  SEO_EDITORIAL_CHECKLIST_ITEM_IDS.length === 5 &&
    SEO_EDITORIAL_CHECKLIST_ITEM_IDS.every((id) => defaultChecklist[id] === false)
);

{
  const toggled = {
    ...defaultChecklist,
    claims_sources_reviewed: true,
    uk_audience_relevance: true,
  };
  const out = buildSeoEditorialResearchBrief({
    researchUi: ready,
    checklist: toggled,
    planningPreview: matchingPreview,
  });
  ok(
    "27_toggles_reflected_in_brief",
    out.ok &&
      out.brief.includes(
        `[x] ${SEO_EDITORIAL_CHECKLIST_BRIEF_LABELS.claims_sources_reviewed}`
      ) &&
      out.brief.includes(
        `[x] ${SEO_EDITORIAL_CHECKLIST_BRIEF_LABELS.uk_audience_relevance}`
      ) &&
      out.brief.includes(
        `[ ] ${SEO_EDITORIAL_CHECKLIST_BRIEF_LABELS.existing_content_refresh}`
      ) &&
      out.brief.includes(
        `[ ] ${SEO_EDITORIAL_CHECKLIST_BRIEF_LABELS.cannibalization_overlap}`
      ) &&
      out.brief.includes(
        `[ ] ${SEO_EDITORIAL_CHECKLIST_BRIEF_LABELS.new_article_approval}`
      )
  );
  ok(
    "28_checked_items_do_not_change_ready_or_hold",
    out.ok &&
      ready.status === "ready" &&
      /Planning: HOLD/.test(out.brief) &&
      /Planning remains HOLD/.test(out.brief) &&
      !/NEW_BLOG/.test(out.brief)
  );
}

ok(
  "29_new_research_resets_checklist_wiring",
  /resetEditorialHandoffUi\(\)/.test(panelSrc) &&
    /createLoadingSeoPlanningResearchState/.test(panelSrc) &&
    panelSrc.indexOf("resetEditorialHandoffUi()") <
      panelSrc.indexOf("createLoadingSeoPlanningResearchState(subject)")
);

ok(
  "30_topic_intent_clear_recheck_refresh_reset",
  /invalidateResearchUi/.test(panelSrc) &&
    /resetEditorialHandoffUi/.test(panelSrc) &&
    /invalidatePlanningPreview/.test(panelSrc) &&
    /clearPlanningPreview/.test(panelSrc) &&
    /runPlanningCoverageCheck/.test(panelSrc) &&
    /createDefaultSeoEditorialChecklist/.test(panelSrc)
);

ok(
  "31_no_persistence_unmount_safe",
  !/localStorage|sessionStorage|indexedDB/.test(
    panelSrc.slice(
      panelSrc.indexOf("editorialChecklist"),
      panelSrc.indexOf("seo-diagnostics")
    )
  ) &&
    /briefCopyGenRef\.current \+= 1/.test(panelSrc) &&
    /createDefaultSeoEditorialChecklist/.test(panelSrc)
);

// ── D. UI integration (source contracts) ────────────────────────────────────

ok(
  "32_copy_button_only_ready_block",
  /Copy Research Brief/.test(panelSrc) &&
    /researchUi\.status === "ready" && researchUi\.subject/.test(panelSrc) &&
    !/Copy Research Brief/.test(
      panelSrc.slice(
        panelSrc.indexOf('researchUi.status === "missing"'),
        panelSrc.indexOf('researchUi.status === "error"') + 200
      )
    )
);

ok(
  "33_no_automatic_clipboard_on_render",
  /copyResearchBrief/.test(panelSrc) &&
    !/useEffect\(\s*\(\)\s*=>\s*\{[\s\S]{0,240}copyResearchBrief/.test(panelSrc) &&
    !/useEffect\(\s*\(\)\s*=>\s*\{[\s\S]{0,240}writeClipboardText/.test(panelSrc) &&
    /onClick=\{\(\) => copyResearchBrief\(\)\}/.test(panelSrc)
);

ok(
  "34_clipboard_failure_reports_failure",
  /briefCopyFeedback === "failed"/.test(panelSrc) &&
    /Clipboard copy failed/.test(panelSrc) &&
    !/Research brief copied[\s\S]{0,80}catch/.test(panelSrc) &&
    /setBriefCopyFeedback\("failed"\)/.test(panelSrc)
);

ok(
  "35_copy_does_not_trigger_research_post",
  (() => {
    const start = panelSrc.indexOf("const copyResearchBrief");
    const end = panelSrc.indexOf("const dailyQueue");
    if (start < 0 || end < 0 || end <= start) return false;
    const body = panelSrc.slice(start, end);
    // Avoid embedding the grounded-research route literal here (AB-7B R3
    // repo-ref allowlist). Assert copy path has no research API call shape.
    const researchRouteNeedle = ["admin", "blog", "research"].join("-");
    return (
      !body.includes(researchRouteNeedle) &&
      !/method:\s*"POST"/.test(body) &&
      /buildSeoEditorialResearchBrief/.test(body)
    );
  })()
);

ok(
  "36_copy_does_not_create_blog_post",
  (() => {
    const start = panelSrc.indexOf("const copyResearchBrief");
    const end = panelSrc.indexOf("const dailyQueue");
    const body = panelSrc.slice(start, end);
    return (
      !/\/api\/admin-blog[^-]/.test(body) &&
      !/method:\s*"PUT"/.test(body) &&
      !/method:\s*"DELETE"/.test(body)
    );
  })() &&
    !/onNavigate\("blog"\)/.test(
      panelSrc.slice(
        panelSrc.indexOf("const copyResearchBrief"),
        panelSrc.indexOf("const dailyQueue")
      )
    )
);

ok(
  "37_blog_nav_retains_eligibility",
  /planningPreview\.canOpenBlog && can\("blog\.manage"\)/.test(panelSrc) &&
    /canOpenBlog:[\s\S]{0,200}ab4\.match === "EXACT" \|\| ab4\.match === "STRONG"/.test(
      planningHelperSrc
    )
);

ok(
  "38_ephemeral_loss_warning_when_ready",
  /Copy the research brief before opening Blog/.test(panelSrc) &&
    /Leaving this SEO panel[\s\S]{0,40}discards the temporary research result/.test(
      panelSrc
    ) &&
    /Opening Blog does not create[\s\S]{0,40}or save a draft/.test(panelSrc) &&
    /researchUi\.status === "ready" \? \([\s\S]{0,400}Copy the research brief before opening Blog/.test(
      panelSrc
    )
);

ok(
  "39_w3_source_claim_ui_intact",
  /OpenAI grounded research \(ephemeral\)/.test(panelSrc) &&
    /researchUi\.sources\.map/.test(panelSrc) &&
    /researchUi\.claims\.map/.test(panelSrc) &&
    /Research with OpenAI/.test(panelSrc) &&
    /GROUNDED_EVIDENCE_READY/.test(helperSrc)
);

ok(
  "40_w1_w2_planning_intact",
  /SEO Daily Work Queue/.test(panelSrc) &&
    /seo-blog-planning-readiness/.test(panelSrc) &&
    /Check Existing Blog Coverage/.test(panelSrc) &&
    /Planning decision: HOLD/.test(panelSrc) &&
    /seo-diagnostics/.test(panelSrc)
);

ok(
  "41_sidhu_blog_editor_untouched_by_w4b",
  !/buildSeoEditorialResearchBrief|Copy Research Brief|editorialChecklist/.test(
    sidhuSrc
  )
);

ok(
  "42_helper_pure_no_network_storage",
  !/\bfetch\s*\(/.test(helperSrc) &&
    !/localStorage|sessionStorage|indexedDB/.test(helperSrc) &&
    !/openai\.com|api\.openai/.test(helperSrc) &&
    /buildSeoEditorialResearchBrief/.test(helperSrc)
);

ok(
  "43_stale_copy_success_guard",
  /briefCopyGenRef/.test(panelSrc) &&
    /researchUiRef\.current/.test(panelSrc) &&
    /copyGen !== briefCopyGenRef\.current/.test(panelSrc) &&
    /current\.subject\.opportunityId !== snapshotSubject\.opportunityId/.test(
      panelSrc
    )
);

ok(
  "44_checklist_ui_five_items",
  /Manual Editorial Review/.test(panelSrc) &&
    /SEO_EDITORIAL_CHECKLIST_ITEM_IDS\.map/.test(panelSrc) &&
    /SEO_EDITORIAL_CHECKLIST_UI_LABELS/.test(panelSrc) &&
    helperSrc.includes(
      "Claims checked against the cited source pages."
    ) &&
    helperSrc.includes("Sources assessed for UK audience relevance.") &&
    helperSrc.includes(
      "Existing Blog content reviewed for refresh opportunities."
    ) &&
    helperSrc.includes("Potential overlap/cannibalization reviewed.") &&
    helperSrc.includes("New-article approval requirements considered.")
);

ok(
  "45_super_admin_copy_boundary",
  /role === "super_admin" \? \(/.test(panelSrc) &&
    /Copy Research Brief/.test(panelSrc) &&
    /if \(role !== "super_admin"\) return;/.test(panelSrc) &&
    panelSrc.indexOf('role === "super_admin" ? (') <
      panelSrc.indexOf("Copy Research Brief")
);

console.log(`\nJSEO-W4B results: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
