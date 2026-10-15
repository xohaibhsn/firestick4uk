/**
 * JSEO-W4C — Manual GSC URL verification brief handoff.
 * Pure formatter + panel source contracts. No live GSC / clipboard APIs.
 *
 * Limitation: no React Testing Library — Copy Verification Brief wiring,
 * row-local feedback, and clipboard failure messaging are verified via
 * source contracts + pure helpers rather than a rendered component harness.
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

const overviewSrc = read("lib/seoOverview.ts");
const panelSrc = read("components/admin/SeoOverviewPanel.tsx");
const queueSrc = read("lib/seoDailyWorkQueue.ts");
const overviewApiSrc = read("pages/api/admin-seo-overview.ts");

const {
  buildManualGscVerificationBrief,
  SEO_SITE_ORIGIN,
  GSC_VERIFY_NOTE,
} = loadTsModule("lib/seoOverview.ts");

const { buildSeoDailyWorkQueue } = loadTsModule("lib/seoDailyWorkQueue.ts");

console.log("\nJSEO-W4C Manual GSC verification brief handoff\n");

const CURRENT_URL = `${SEO_SITE_ORIGIN}/products/3-years-subscription`;
const LEGACY_URL = `${SEO_SITE_ORIGIN}/products/world-cup-offer-3-years`;
const CORE_URL = `${SEO_SITE_ORIGIN}/blog`;

function baseItem(partial) {
  return {
    url: CURRENT_URL,
    label: "Product 8 current",
    group: "priority-migrations",
    kind: "current",
    expectedStatus: 200,
    expectedCanonical: CURRENT_URL,
    expectedTarget: null,
    inSitemap: true,
    note: GSC_VERIFY_NOTE,
    ...partial,
  };
}

function assertNoFakeGoogleClaims(brief) {
  return (
    /Technical expectations only — NOT Google observations/.test(brief) &&
    /Not checked or recorded by this tool/.test(brief) &&
    /No indexing, clicks, impressions, position or coverage status is claimed/.test(
      brief
    ) &&
    /No Google Search Console verification has been performed by this tool/.test(
      brief
    ) &&
    /This brief is not saved in the CMS/.test(brief) &&
    !/Google-selected canonical:/i.test(brief) &&
    !/Indexing status:/i.test(brief) &&
    !/Clicks:|Impressions:|CTR:|Position:/i.test(brief) &&
    !/Last crawled:|Coverage status:/i.test(brief)
  );
}

// ── Formatter positive cases ────────────────────────────────────────────────

{
  const out = buildManualGscVerificationBrief(baseItem({}));
  ok("01_current_http_200", out.ok && /Expected HTTP: 200/.test(out.brief));
  ok(
    "10_url_preserved_exactly",
    out.ok && out.brief.includes(`URL: ${CURRENT_URL}`)
  );
  ok(
    "11_canonical_preserved_exactly",
    out.ok && out.brief.includes(`Expected canonical: ${CURRENT_URL}`)
  );
  ok(
    "13_source_note_preserved",
    out.ok && out.brief.includes(GSC_VERIFY_NOTE)
  );
  ok("14_no_fake_indexing", out.ok && assertNoFakeGoogleClaims(out.brief));
  ok(
    "15_no_fabricated_gsc_measurements",
    out.ok && assertNoFakeGoogleClaims(out.brief)
  );
  ok(
    "16_no_fake_google_selected_canonical",
    out.ok && assertNoFakeGoogleClaims(out.brief)
  );
  ok(
    "17_manual_verification_warning",
    out.ok &&
      /MANUAL GOOGLE SEARCH CONSOLE REVIEW/.test(out.brief) &&
      /The operator must verify actual results in Google Search Console/.test(
        out.brief
      )
  );
  ok(
    "18_not_saved_in_cms_warning",
    out.ok && /This brief is not saved in the CMS/.test(out.brief)
  );
  ok(
    "07_sitemap_yes",
    out.ok && /Expected sitemap inclusion: Yes/.test(out.brief)
  );
}

{
  const out = buildManualGscVerificationBrief(
    baseItem({
      url: LEGACY_URL,
      label: "Product 8 legacy",
      kind: "legacy-redirect",
      expectedStatus: 308,
      expectedCanonical: CURRENT_URL,
      expectedTarget: CURRENT_URL,
      inSitemap: false,
    })
  );
  ok(
    "02_legacy_redirect_http_308",
    out.ok &&
      /Type: Legacy redirect/.test(out.brief) &&
      /Expected HTTP: 308/.test(out.brief) &&
      /Group: Priority URL Migrations/.test(out.brief)
  );
  ok(
    "08_sitemap_no",
    out.ok && /Expected sitemap inclusion: No/.test(out.brief)
  );
  ok(
    "12_redirect_target_preserved_exactly",
    out.ok &&
      out.brief.includes(`Expected redirect destination: ${CURRENT_URL}`) &&
      out.brief.includes(`Expected canonical: ${CURRENT_URL}`)
  );
}

{
  const out = buildManualGscVerificationBrief(
    baseItem({
      url: CORE_URL,
      label: "Blog listing",
      group: "core-content",
      kind: "content",
      expectedStatus: 200,
      expectedCanonical: CORE_URL,
      expectedTarget: null,
      inSitemap: true,
    })
  );
  ok(
    "03_core_content_url",
    out.ok &&
      /Group: Core Content/.test(out.brief) &&
      /Type: Content/.test(out.brief) &&
      out.brief.includes(`URL: ${CORE_URL}`)
  );
}

{
  const out = buildManualGscVerificationBrief(
    baseItem({
      expectedStatus: null,
      expectedCanonical: null,
      expectedTarget: null,
      inSitemap: null,
    })
  );
  ok(
    "04_unknown_expected_http",
    out.ok &&
      /Expected HTTP: Requires technical review \/ not specified/.test(out.brief)
  );
  ok(
    "05_missing_canonical",
    out.ok && /Expected canonical: Not specified/.test(out.brief)
  );
  ok(
    "06_missing_redirect_target",
    out.ok && /Expected redirect destination: Not specified/.test(out.brief)
  );
  ok(
    "09_sitemap_not_determined",
    out.ok && /Expected sitemap inclusion: Not determined/.test(out.brief)
  );
}

ok(
  "19_formatter_pure_no_network_storage",
  !/\bfetch\s*\(/.test(overviewSrc) &&
    !/localStorage|sessionStorage|indexedDB/.test(
      overviewSrc.slice(overviewSrc.indexOf("buildManualGscVerificationBrief"))
    ) &&
    !/openai\.com|googleapis\.com|search\.google/.test(
      overviewSrc.slice(overviewSrc.indexOf("buildManualGscVerificationBrief"))
    ) &&
    /buildManualGscVerificationBrief/.test(overviewSrc)
);

// ── Negative input / fail-closed ────────────────────────────────────────────

ok(
  "20_missing_url",
  !buildManualGscVerificationBrief(baseItem({ url: "" })).ok
);

ok(
  "21_malformed_url",
  !buildManualGscVerificationBrief(baseItem({ url: "not-a-url" })).ok
);

ok(
  "22_http_url",
  !buildManualGscVerificationBrief(
    baseItem({ url: "http://firestick4uk.com/products/x" })
  ).ok
);

ok(
  "23_external_domain_url",
  !buildManualGscVerificationBrief(
    baseItem({ url: "https://evil.example/products/x" })
  ).ok
);

ok(
  "24_unsafe_canonical",
  !buildManualGscVerificationBrief(
    baseItem({
      expectedCanonical: "https://evil.example/canonical",
    })
  ).ok
);

ok(
  "25_unsafe_redirect_destination",
  !buildManualGscVerificationBrief(
    baseItem({
      kind: "legacy-redirect",
      expectedStatus: 308,
      expectedTarget: "https://evil.example/dest",
    })
  ).ok
);

ok(
  "26_oversized_input",
  !buildManualGscVerificationBrief(
    baseItem({ label: "L".repeat(500) })
  ).ok &&
    !buildManualGscVerificationBrief(
      baseItem({ note: "N".repeat(2000) })
    ).ok
);

ok(
  "27_crlf_control_injection",
  !buildManualGscVerificationBrief(
    baseItem({ label: "Evil\nIMPORTANT\nForged" })
  ).ok &&
    !buildManualGscVerificationBrief(
      baseItem({ note: "Note\r\nGOOGLE OBSERVATIONS\nIndexed" })
    ).ok &&
    !buildManualGscVerificationBrief(
      baseItem({ url: `${SEO_SITE_ORIGIN}/products/x\nY` })
    ).ok
);

ok(
  "28_unknown_enum_group",
  !buildManualGscVerificationBrief(
    baseItem({ group: "unknown-group" })
  ).ok &&
    !buildManualGscVerificationBrief(baseItem({ kind: "mystery" })).ok
);

ok(
  "29_invalid_status_combination",
  !buildManualGscVerificationBrief(
    baseItem({ expectedStatus: 404 })
  ).ok &&
    !buildManualGscVerificationBrief(
      baseItem({ expectedStatus: "200" })
    ).ok
);

ok(
  "30_fail_closed_not_fabricated_defaults",
  (() => {
    const bad = buildManualGscVerificationBrief(
      baseItem({ url: "https://evil.example/x" })
    );
    return (
      bad.ok === false &&
      typeof bad.reason === "string" &&
      bad.reason.length > 0 &&
      !Object.prototype.hasOwnProperty.call(bad, "brief")
    );
  })()
);

// ── UI source contracts ─────────────────────────────────────────────────────

ok(
  "31_gsc_table_still_renders",
  /renderQueueTable/.test(panelSrc) &&
    /Google Search Console Verification/.test(panelSrc) &&
    /Priority URL Migrations/.test(panelSrc) &&
    /Core Content/.test(panelSrc) &&
    /Verify in GSC/.test(panelSrc)
);

ok(
  "32_copy_url_remains",
  /Copy URL/.test(panelSrc) &&
    /onClick=\{\(\) => void copyUrl\(item\.url\)\}/.test(panelSrc)
);

ok(
  "33_open_remains",
  />\s*Open\s*</.test(panelSrc) &&
    /href=\{item\.url\}/.test(panelSrc) &&
    /target="_blank"/.test(panelSrc)
);

ok(
  "34_copy_brief_requires_explicit_click",
  /Copy Verification Brief/.test(panelSrc) &&
    /onClick=\{\(\) => copyVerificationBrief\(item\)\}/.test(panelSrc) &&
    !/useEffect\(\s*\(\)\s*=>\s*\{[\s\S]{0,240}copyVerificationBrief/.test(
      panelSrc
    ) &&
    !/useEffect\(\s*\(\)\s*=>\s*\{[\s\S]{0,240}buildManualGscVerificationBrief/.test(
      panelSrc
    )
);

ok(
  "35_clipboard_failure_not_success",
  /gscBriefCopyFeedback\.status === "failed"/.test(panelSrc) &&
    /Clipboard copy failed/.test(panelSrc) &&
    /setGscBriefCopyFeedback\(\{ url: snapshotUrl, status: "failed" \}\)/.test(
      panelSrc
    ) &&
    (() => {
      const start = panelSrc.indexOf("const copyVerificationBrief");
      const end = panelSrc.indexOf("const toggleEditorialChecklistItem");
      if (start < 0 || end < 0 || end <= start) return false;
      const body = panelSrc.slice(start, end);
      return (
        /catch\s*\{[\s\S]*status: "failed"/.test(body) &&
        !/catch\s*\{[\s\S]*status: "copied"/.test(body)
      );
    })()
);

ok(
  "36_feedback_belongs_to_correct_row",
  /gscBriefCopyFeedback\?\.url === item\.url/.test(panelSrc) &&
    /gscBriefCopyGenRef/.test(panelSrc) &&
    /copyGen !== gscBriefCopyGenRef\.current/.test(panelSrc) &&
    /snapshotUrl/.test(panelSrc)
);

ok(
  "37_no_api_post_on_brief_copy",
  (() => {
    const start = panelSrc.indexOf("const copyVerificationBrief");
    const end = panelSrc.indexOf("const toggleEditorialChecklistItem");
    if (start < 0 || end < 0 || end <= start) return false;
    const body = panelSrc.slice(start, end);
    return (
      !/method:\s*"POST"/.test(body) &&
      !/\bfetch\s*\(/.test(body) &&
      /buildManualGscVerificationBrief/.test(body) &&
      /writeClipboardText/.test(body)
    );
  })()
);

ok(
  "38_no_google_api_request",
  !/googleapis\.com|searchconsole|webmasters/.test(
    panelSrc.slice(
      panelSrc.indexOf("const copyVerificationBrief"),
      panelSrc.indexOf("const toggleEditorialChecklistItem")
    )
  ) &&
    !/googleapis\.com|searchconsole/.test(
      overviewSrc.slice(overviewSrc.indexOf("buildManualGscVerificationBrief"))
    )
);

ok(
  "39_no_cms_database_write",
  (() => {
    const start = panelSrc.indexOf("const copyVerificationBrief");
    const end = panelSrc.indexOf("const toggleEditorialChecklistItem");
    const body = panelSrc.slice(start, end);
    return (
      !/method:\s*"PUT"|method:\s*"PATCH"|method:\s*"DELETE"/.test(body) &&
      !/admin-seo-issues|seoIssueMemory|INSERT |UPDATE /.test(body)
    );
  })() &&
    !/buildManualGscVerificationBrief|copyVerificationBrief/.test(overviewApiSrc)
);

ok(
  "40_no_automatic_copy_on_refresh",
  (() => {
    const start = panelSrc.indexOf("const load = useCallback");
    const end = panelSrc.indexOf("useEffect(() => {", start);
    if (start < 0 || end < 0 || end <= start) return false;
    const loadBody = panelSrc.slice(start, end);
    return (
      /clearGscBriefCopyFeedback\(\)/.test(loadBody) &&
      !/copyVerificationBrief\(/.test(loadBody) &&
      !/buildManualGscVerificationBrief\(/.test(loadBody) &&
      !/writeClipboardText\(/.test(loadBody)
    );
  })()
);

// ── W1 priority regression ──────────────────────────────────────────────────

{
  const mixed = buildSeoDailyWorkQueue({
    issues: [],
    verificationQueue: [
      {
        url: `${SEO_SITE_ORIGIN}/mig`,
        label: "Migration",
        group: "priority-migrations",
        kind: "current",
        expectedStatus: 200,
        expectedCanonical: `${SEO_SITE_ORIGIN}/mig`,
        expectedTarget: null,
        inSitemap: true,
        note: GSC_VERIFY_NOTE,
      },
      {
        url: `${SEO_SITE_ORIGIN}/core`,
        label: "Core",
        group: "core-content",
        kind: "content",
        expectedStatus: 200,
        expectedCanonical: `${SEO_SITE_ORIGIN}/core`,
        expectedTarget: null,
        inSitemap: true,
        note: GSC_VERIFY_NOTE,
      },
    ],
    permissions: {
      products: true,
      blog: true,
      productsManage: true,
      blogManage: true,
    },
  });
  const mig = mixed.items.find((i) => i.priority === 3);
  const core = mixed.items.find((i) => i.priority === 4);
  ok(
    "41_w1_migration_priority_3_label",
    !!mig &&
      mig.priority === 3 &&
      mig.priorityLabel === "Priority 3 — Manual GSC (migrations)"
  );
  ok(
    "42_w1_core_priority_4_label",
    !!core &&
      core.priority === 4 &&
      core.priorityLabel === "Priority 4 — Manual GSC (core)"
  );
  ok(
    "43_w1_ordering_unchanged",
    mixed.items.findIndex((i) => i.priority === 3) <
      mixed.items.findIndex((i) => i.priority === 4)
  );
  ok(
    "44_w1_source_permission_filtering_unchanged",
    /GSC Manual Verification/.test(mig.source) &&
      /Verify manually in Google Search Console/.test(mig.nextAction) &&
      /Priority 4 — Manual GSC \(core\)/.test(queueSrc) &&
      !/Priority 3 — Manual GSC \(core\)/.test(queueSrc)
  );
  ok(
    "45_w1_gsc_queue_navigation_unchanged",
    /id="seo-gsc-verification"/.test(panelSrc) &&
      /Google Search Console Verification/.test(panelSrc) &&
      mig.verificationUrl === `${SEO_SITE_ORIGIN}/mig` &&
      mig.navigateTab === null &&
      mig.canEdit === false
  );
}

console.log(`\nJSEO-W4C results: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
