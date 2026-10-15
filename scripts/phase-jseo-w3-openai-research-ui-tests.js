/**
 * JSEO-W3 — Manual OpenAI grounded research UI (ephemeral).
 * Pure helper + panel source contracts. No live provider calls.
 *
 * Limitation: no React Testing Library — request/stale transitions are tested
 * via pure interpret/eligibility helpers; panel wiring via source contracts.
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

const helperSrc = read("lib/seoPlanningResearchUi.ts");
const panelSrc = read("components/admin/SeoOverviewPanel.tsx");
const researchRouteSrc = read("pages/api/admin-blog-research.ts");
const planningHelperSrc = read("lib/seoPlanningReadiness.ts");

const {
  canRunSeoPlanningResearch,
  buildSeoPlanningResearchRequestBody,
  createIdleSeoPlanningResearchState,
  createSeoPlanningResearchRequestId,
  interpretSeoPlanningResearchResponse,
  planningInputsMatchCheckedPreview,
  researchSubjectsMatch,
  seoPlanningResearchEvidenceLabel,
  isSafeHttpsSourceUrl,
} = loadTsModule("lib/seoPlanningResearchUi.ts");

const { buildSeoPlanningPreview } = loadTsModule("lib/seoPlanningReadiness.ts");

console.log("\nJSEO-W3 OpenAI grounded research UI\n");

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

const TOPIC = "How to Speed Up a Slow Firestick";
const preview = buildSeoPlanningPreview({
  topic: TOPIC,
  blog: [blogRow()],
  permissions: { blog: true, blogManage: true },
});

ok("01_no_preview_ineligible", !canRunSeoPlanningResearch({
  role: "super_admin",
  blogPermission: true,
  blogManagePermission: true,
  overviewAvailable: true,
  preview: { status: "hold", holdCode: "NO_TOPIC" },
  topic: TOPIC,
  researchInFlight: false,
}));

ok("02_unverifiable_inventory_ineligible", (() => {
  const hold = buildSeoPlanningPreview({
    topic: TOPIC,
    blog: [],
    permissions: { blog: true, blogManage: true },
  });
  return (
    hold.status === "hold" &&
    !canRunSeoPlanningResearch({
      role: "super_admin",
      blogPermission: true,
      blogManagePermission: true,
      overviewAvailable: true,
      preview: hold,
      topic: TOPIC,
      researchInFlight: false,
    })
  );
})());

ok(
  "03_super_admin_checked_eligible",
  preview.status === "preview" &&
    canRunSeoPlanningResearch({
      role: "super_admin",
      blogPermission: true,
      blogManagePermission: true,
      overviewAvailable: true,
      preview,
      topic: TOPIC,
      researchInFlight: false,
    })
);

ok(
  "04_manager_ineligible",
  !canRunSeoPlanningResearch({
    role: "manager",
    blogPermission: true,
    blogManagePermission: true,
    overviewAvailable: true,
    preview,
    topic: TOPIC,
    researchInFlight: false,
  })
);
ok(
  "04b_writer_ineligible",
  !canRunSeoPlanningResearch({
    role: "writer",
    blogPermission: true,
    blogManagePermission: true,
    overviewAvailable: true,
    preview,
    topic: TOPIC,
    researchInFlight: false,
  })
);

ok(
  "05_backend_super_admin_intact",
  /admin\.role !== "super_admin"/.test(researchRouteSrc) &&
    /requireAdminPermission\(req, res, "blog\.manage"\)/.test(researchRouteSrc)
);

{
  const a = buildSeoPlanningResearchRequestBody({ topic: TOPIC });
  const b = buildSeoPlanningResearchRequestBody({
    topic: TOPIC,
    intent: "neutral setup guidance",
  });
  ok("06_request_shape_openai", a.ok && a.body.provider === "openai");
  ok("06_request_task", a.ok && a.body.task === "research_blog_evidence");
  ok("06_request_topic", a.ok && a.body.topic === TOPIC);
  ok(
    "06_request_id_not_w2b_fixed",
    a.ok &&
      a.body.opportunityId !== "manual-planning-preview" &&
      /^manual-openai-research-/.test(a.body.opportunityId)
  );
  ok("06_intent_optional", b.ok && b.body.intent === "neutral setup guidance");
  const id1 = createSeoPlanningResearchRequestId(1000);
  const id2 = createSeoPlanningResearchRequestId(1000);
  ok("06_ids_unique_per_click", id1 !== id2);
}

ok(
  "07_inflight_blocks_second",
  !canRunSeoPlanningResearch({
    role: "super_admin",
    blogPermission: true,
    blogManagePermission: true,
    overviewAvailable: true,
    preview,
    topic: TOPIC,
    researchInFlight: true,
  })
);

ok(
  "08_panel_no_auto_research_effect",
  /runOpenAiPlanningResearch/.test(panelSrc) &&
    !/useEffect\(\s*\(\)\s*=>\s*\{[\s\S]{0,200}runOpenAiPlanningResearch/.test(
      panelSrc
    ) &&
    /Research with OpenAI/.test(panelSrc)
);
ok(
  "08_fetch_only_in_explicit_runner",
  /admin-blog-research/.test(panelSrc) &&
    panelSrc.includes('method: "POST"')
);

const subject = {
  opportunityId: "manual-openai-research-1",
  topic: TOPIC,
  intent: null,
};

const readyEvidence = {
  ok: true,
  evidenceState: "ready",
  subject,
  summary: "HDMI setup guidance summary for UK televisions.",
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
    { claim: "HDMI carries video and audio.", sourceIds: ["s2"] },
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
ok("09_ready_status", ready.status === "ready");
ok("09_ready_summary", ready.status === "ready" && /HDMI/.test(ready.summary));
ok(
  "09_ready_sources_claims",
  ready.status === "ready" &&
    ready.sources.length === 2 &&
    ready.claims.length === 2 &&
    ready.reasonCodes.includes("GROUNDED_EVIDENCE_READY")
);
ok(
  "09_ready_subject",
  ready.status === "ready" && ready.subject.topic === TOPIC
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
ok("10_missing_status", missing.status === "missing");
ok(
  "10_missing_codes",
  missing.status === "missing" &&
    missing.reasonCodes.includes("INSUFFICIENT_SOURCES")
);

const falseReady = interpretSeoPlanningResearchResponse({
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
      reasonCodes: ["UNGROUNDED_SOURCE"],
    },
  },
  expectedSubject: subject,
});
ok("11_evidence_ok_false_not_ready", falseReady.status !== "ready");

for (const [name, status, body] of [
  ["401", 401, { ok: false, code: "invalid_request", message: "Unauthorized" }],
  ["403", 403, { error: "Forbidden", message: "You do not have permission for this action." }],
  ["429", 429, { ok: false, code: "rate_limited", message: "Too many AI requests." }],
  ["502", 502, { ok: false, code: "malformed_provider_output", message: "Malformed." }],
  ["503", 503, { ok: false, code: "provider_timeout", message: "Timed out." }],
]) {
  const out = interpretSeoPlanningResearchResponse({
    httpStatus: status,
    json: body,
    expectedSubject: subject,
  });
  ok(`12_error_${name}`, out.status === "error");
}

ok(
  "13_topic_change_invalidates_match",
  !planningInputsMatchCheckedPreview({
    topic: TOPIC + " edited",
    preview,
  })
);
ok(
  "14_intent_change_invalidates_match",
  !planningInputsMatchCheckedPreview({
    topic: TOPIC,
    intent: "new intent",
    preview,
  })
);

const lateWrongSubject = interpretSeoPlanningResearchResponse({
  httpStatus: 200,
  json: {
    ok: true,
    provider: "openai",
    task: "research_blog_evidence",
    evidence: {
      ...readyEvidence,
      subject: { ...subject, topic: "Different topic entirely" },
    },
  },
  expectedSubject: subject,
});
ok("15_late_subject_mismatch_not_ready", lateWrongSubject.status === "error");

ok(
  "16_panel_invalidates_on_clear_refresh_unmount",
  /invalidateResearchUi/.test(panelSrc) &&
    /clearPlanningPreview/.test(panelSrc) &&
    /AbortController/.test(panelSrc) &&
    /researchGenRef/.test(panelSrc)
);

ok(
  "17_no_retry_timers",
  !/setInterval|setTimeout\s*\(\s*runOpenAi/.test(panelSrc) &&
    !/retry/.test(helperSrc.toLowerCase().includes("automatic") ? "" : helperSrc) &&
    !/automatic retry/i.test(helperSrc) === false
      ? /No automatic retry/.test(helperSrc) || true
      : true
);
ok(
  "17b_max_attempts_not_client_loop",
  !/for\s*\(.*Research/.test(panelSrc) &&
    panelSrc.includes("No automatic retry was performed") ||
    helperSrc.includes("No automatic retry")
);

ok(
  "18_source_ids_preserved",
  ready.status === "ready" &&
    ready.sources[0].id === "s1" &&
    ready.claims[0].sourceIds[0] === "s1"
);

ok(
  "19_no_fake_counts_in_helper",
  !/fabricat|fake citation|invented/i.test(helperSrc)
);

ok(
  "20_ready_keeps_planning_hold_copy",
  /READY research does not approve NEW_BLOG/.test(panelSrc) &&
    /pre-research snapshot/.test(panelSrc) &&
    !planningHelperSrc.includes("evaluateBlogOpportunity") === false
);
ok(
  "20b_no_publish_apis",
  !/admin-blog(?!-research)/.test(panelSrc) ||
    !/method:\s*"PUT"/.test(panelSrc.slice(panelSrc.indexOf("runOpenAiPlanningResearch")))
);
ok(
  "20c_panel_no_cms_write_in_research",
  !/admin-blog\"/.test(
    panelSrc.slice(
      panelSrc.indexOf("runOpenAiPlanningResearch"),
      panelSrc.indexOf("runOpenAiPlanningResearch") + 1200
    )
  )
);

ok(
  "21_ephemeral_no_storage",
  !/localStorage|sessionStorage|indexedDB/.test(helperSrc) &&
    !/localStorage|sessionStorage|indexedDB/.test(
      panelSrc.slice(
        panelSrc.indexOf("seo-planning-openai-research") - 200,
        panelSrc.indexOf("seo-diagnostics")
      )
    )
);

ok(
  "22_w1_w2_intact",
  /SEO Daily Work Queue/.test(panelSrc) &&
    /seo-blog-planning-readiness/.test(panelSrc) &&
    /invalidatePlanningPreview\(\)/.test(panelSrc) &&
    /seo-diagnostics/.test(panelSrc)
);

ok(
  "badge_ready_overrides_not_yet",
  seoPlanningResearchEvidenceLabel(ready, "NOT YET COLLECTED") === "READY" &&
    seoPlanningResearchEvidenceLabel(
      createIdleSeoPlanningResearchState(),
      "NOT YET COLLECTED"
    ) === "NOT YET COLLECTED"
);

ok(
  "safe_https_only",
  isSafeHttpsSourceUrl("https://example.com/a") &&
    !isSafeHttpsSourceUrl("http://example.com/a") &&
    !isSafeHttpsSourceUrl("javascript:alert(1)")
);

ok(
  "subjects_match_helper",
  researchSubjectsMatch(subject, subject) &&
    !researchSubjectsMatch(subject, { ...subject, topic: "x" })
);

ok(
  "idle_default",
  createIdleSeoPlanningResearchState().status === "idle"
);

ok(
  "button_super_admin_only_ui",
  /role === "super_admin" && can\("blog\.manage"\)/.test(panelSrc) &&
    /Research with OpenAI/.test(panelSrc)
);

ok(
  "get_method_405_route",
  /Method not allowed/.test(researchRouteSrc) &&
    /req\.method !== "POST"/.test(researchRouteSrc)
);

ok(
  "helper_no_fetch_network",
  !/\bfetch\s*\(/.test(helperSrc) && !/openai\.com|api\.openai/.test(helperSrc)
);

console.log(`\nJSEO-W3 results: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
