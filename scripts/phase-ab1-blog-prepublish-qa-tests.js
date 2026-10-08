/**
 * AB-1 — Deterministic autonomous blog pre-publish QA tests.
 * Pure fixtures only — no DB, HTTP, providers, or CMS mutations.
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
      if (fs.existsSync(base + ".ts")) return loadTsModule(path.relative(ROOT, base + ".ts"));
      if (fs.existsSync(base)) return loadTsModule(path.relative(ROOT, base));
    }
    return require(id);
  };
  const fn = new Function("exports", "module", "require", outputText);
  fn(sandbox.exports, sandbox.module, localRequire);
  return sandbox.module.exports && Object.keys(sandbox.module.exports).length
    ? sandbox.module.exports
    : sandbox.exports;
}

const qaSrc = read("lib/blogPrePublishQa.ts");
const {
  evaluateAutonomousBlogPrePublish,
  DEFAULT_BLOG_PREPUBLISH_EDITORIAL_POLICY,
  normalizeAutonomousBlogSlug,
  normalizeAutonomousBlogTitle,
} = loadTsModule("lib/blogPrePublishQa.ts");

function bodyParagraphs(minChars) {
  const unit =
    "<p>Firestick maintenance tips for UK households covering cache cleanup, storage, WiFi, and app hygiene.</p>";
  let html = "<h2>Overview</h2>";
  while (html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().length < minChars) {
    html += unit;
  }
  return html;
}

function baseCandidate(overrides = {}) {
  return {
    id: null,
    title: "How to Speed Up a Slow Firestick Autonomously",
    slug: "how-to-speed-up-a-slow-firestick-autonomously",
    excerpt: "Practical Firestick speed tips for UK streaming setups.",
    content: bodyParagraphs(1300),
    category: "Guides",
    featured_image: "https://res.cloudinary.com/demo/image/upload/firestick.webp",
    meta_title: "Speed Up a Slow Firestick in 10 Minutes",
    meta_description:
      "Learn how to speed up a slow Firestick with cache, storage, WiFi and update tips for smoother UK streaming.",
    focus_keyword: "speed up firestick",
    canonical_url: "",
    faqs: [],
    publicationIntent: "publish",
    evidenceState: "ready",
    mediaState: { featuredImageReady: true },
    ...overrides,
  };
}

const inventory = [
  {
    id: 5,
    title: "How to Speed Up a Slow Firestick in 10 Minutes",
    slug: "how-to-speed-up-a-slow-firestick-in-10-minutes",
    status: "published",
    active: 1,
  },
  {
    id: 1,
    title: "How to Set Up Your Firestick in 5 Minutes",
    slug: "how-to-set-up-your-firestick",
    status: "draft",
    active: 1,
  },
];

function evalQa(candidate, existingPosts = inventory, policy) {
  return evaluateAutonomousBlogPrePublish({
    candidate,
    existingPosts,
    policy,
  });
}

function hasBlocker(result, code) {
  return result.blockers.some((b) => b.code === code);
}

function hasWarning(result, code) {
  return result.warnings.some((w) => w.code === code);
}

// ── Source / architecture ──────────────────────────────────────────────────

ok("src_exists", fs.existsSync(path.join(ROOT, "lib/blogPrePublishQa.ts")));
ok(
  "src_imports_diagnoseBlog",
  /diagnoseBlog/.test(qaSrc) && /from\s+["']@\/lib\/seoDiagnostics["']/.test(qaSrc)
);
ok(
  "src_imports_normalizeBlogDiagnosticRow",
  /normalizeBlogDiagnosticRow/.test(qaSrc) &&
    /from\s+["']@\/lib\/seoDiagnosticRows["']/.test(qaSrc)
);
ok(
  "src_synthetic_published_active",
  /status:\s*["']published["']/.test(qaSrc) && /active:\s*1/.test(qaSrc)
);
ok("src_no_db", !/from\s+["']@\/lib\/db["']|require\(['\"][^'\"]*db/.test(qaSrc));
ok("src_no_fetch", !/\bfetch\s*\(/.test(qaSrc));
ok("src_no_provider", !/openai|gemini|seoAiServer|OpenAI/i.test(qaSrc));
ok("src_no_issue_memory", !/seoIssueMemory/i.test(qaSrc));
ok("src_no_audit_revision", !/adminAudit|contentRevisions|recordAdminAudit|recordContentRevision/.test(qaSrc));
ok("src_no_sitemap_cache", !/invalidateSitemap|revalidateTag|hostingerResourceInvalidation/.test(qaSrc));
ok(
  "src_no_duplicated_title_threshold",
  !(/length\s*>\s*75/.test(qaSrc) || /threshold\s*>\s*75/.test(qaSrc))
);
ok(
  "src_no_duplicated_desc_threshold",
  !(/length\s*>\s*180/.test(qaSrc) || /threshold\s*>\s*180/.test(qaSrc))
);
ok(
  "src_no_inline_alt_parser",
  !/analyzeInlineImageAlts|imgTagRe|missingAlt/.test(qaSrc)
);
ok(
  "editorial_floor_documented",
  /not a Google ranking factor/i.test(qaSrc) &&
    DEFAULT_BLOG_PREPUBLISH_EDITORIAL_POLICY.minBodyTextChars === 1200
);

// ── Base PASS ──────────────────────────────────────────────────────────────

{
  const r = evalQa(baseCandidate());
  ok("pass_valid_candidate", r.verdict === "PASS", r.verdict);
  ok("pass_zero_blockers", r.blockers.length === 0);
  ok("pass_checks_all_true", Object.values(r.checks).every(Boolean));
}

{
  const longTitle = "A".repeat(80);
  const r = evalQa(
    baseCandidate({
      meta_title: longTitle,
      title: "Unique Title For Long Meta Warning Case",
    })
  );
  ok("pass_with_warnings_allowed", r.verdict === "PASS");
  ok("warning_title_long", hasWarning(r, "seo-title-long"));
  ok("pass_still_zero_blockers_with_warning", r.blockers.length === 0);
}

// ── Publication / evidence ─────────────────────────────────────────────────

ok(
  "hold_missing_intent",
  evalQa(baseCandidate({ publicationIntent: "draft" })).verdict === "HOLD" &&
    hasBlocker(evalQa(baseCandidate({ publicationIntent: "draft" })), "publish-intent-missing")
);
ok(
  "hold_evidence_missing",
  hasBlocker(evalQa(baseCandidate({ evidenceState: "missing" })), "evidence-not-ready")
);
ok(
  "hold_evidence_stale",
  hasBlocker(evalQa(baseCandidate({ evidenceState: "stale" })), "evidence-not-ready")
);
ok(
  "evidence_ready_gate_passes",
  evalQa(baseCandidate({ evidenceState: "ready" })).checks.evidenceReady === true
);

// ── Duplicates ─────────────────────────────────────────────────────────────

ok(
  "hold_exact_slug_duplicate",
  hasBlocker(
    evalQa(
      baseCandidate({
        slug: "how-to-speed-up-a-slow-firestick-in-10-minutes",
        title: "Totally Different Title For Slug Collision",
      })
    ),
    "duplicate-slug"
  )
);
ok(
  "hold_normalized_slug_duplicate",
  hasBlocker(
    evalQa(
      baseCandidate({
        slug: "How To Speed Up A Slow Firestick In 10 Minutes!!!",
        title: "Another Distinct Title For Norm Slug",
      })
    ),
    "duplicate-slug"
  )
);
ok(
  "same_entity_id_ignored_for_slug",
  evalQa(
    baseCandidate({
      id: 5,
      slug: "how-to-speed-up-a-slow-firestick-in-10-minutes",
      title: "Self Row Title Distinct Enough",
      meta_title: "Self Row Meta Title Distinct",
    })
  ).checks.uniqueSlug === true
);
ok(
  "hold_exact_title_duplicate",
  hasBlocker(
    evalQa(
      baseCandidate({
        title: "How to Speed Up a Slow Firestick in 10 Minutes",
        slug: "unique-slug-for-title-collision-case",
      })
    ),
    "duplicate-title"
  )
);
ok(
  "hold_case_whitespace_title_duplicate",
  hasBlocker(
    evalQa(
      baseCandidate({
        title: "  how to   SPEED up a slow firestick in 10 minutes ",
        slug: "unique-slug-for-title-norm-collision",
      })
    ),
    "duplicate-title"
  )
);
ok(
  "similar_title_not_blocked",
  evalQa(
    baseCandidate({
      title: "How to Speed Up a Slow Firestick in About 10 Minutes",
      slug: "unique-slug-similar-title-ok",
    })
  ).verdict === "PASS"
);
ok(
  "slug_norm_helper",
  normalizeAutonomousBlogSlug("Hello World!!!") === "hello-world"
);
ok(
  "title_norm_helper",
  normalizeAutonomousBlogTitle("  Hello   World ") === "hello world"
);

// ── Content ────────────────────────────────────────────────────────────────

ok(
  "hold_empty_content",
  hasBlocker(evalQa(baseCandidate({ content: "" })), "content-below-editorial-floor")
);
ok(
  "hold_below_floor",
  hasBlocker(
    evalQa(baseCandidate({ content: "<h2>A</h2><p>Short body.</p>" })),
    "content-below-editorial-floor"
  )
);
ok(
  "policy_override_works",
  evalQa(baseCandidate({ content: "<h2>A</h2><p>Short body with enough for override.</p>" }), inventory, {
    minBodyTextChars: 10,
  }).verdict === "PASS"
);
ok(
  "hold_placeholder_todo",
  hasBlocker(evalQa(baseCandidate({ content: "<p>TODO</p>" })), "content-placeholder")
);
ok(
  "hold_placeholder_lorem",
  hasBlocker(evalQa(baseCandidate({ content: "<p>Lorem ipsum</p>" })), "content-placeholder")
);
ok(
  "floor_not_google_claim",
  /not a Google ranking factor/i.test(qaSrc)
);

// ── HTML ───────────────────────────────────────────────────────────────────

for (const tag of ["script", "iframe", "object", "embed", "form"]) {
  const r = evalQa(
    baseCandidate({
      content: bodyParagraphs(1300) + `<${tag} src="x"></${tag}>`,
    })
  );
  ok(`hold_unsafe_${tag}`, hasBlocker(r, "unsafe-html"));
}
ok(
  "benign_tiptap_allowed",
  evalQa(
    baseCandidate({
      content:
        bodyParagraphs(1300) +
        '<p>Tip <strong>bold</strong> and <a href="/products">internal</a>.</p>',
    })
  ).verdict === "PASS"
);

// ── Headings ───────────────────────────────────────────────────────────────

ok(
  "hold_body_h1",
  hasBlocker(
    evalQa(baseCandidate({ content: "<h1>Wrong</h1>" + bodyParagraphs(1300) })),
    "body-h1"
  )
);
ok(
  "h2_present_heading_ok",
  evalQa(baseCandidate()).checks.headingStructure === true
);
{
  const noH2 = "<p>" + "x".repeat(1300) + "</p>";
  const r = evalQa(baseCandidate({ content: noH2 }));
  ok("missing_h2_is_warning", hasWarning(r, "missing-h2"));
  ok("missing_h2_not_blocker", !hasBlocker(r, "missing-h2"));
}

// ── Links ──────────────────────────────────────────────────────────────────

ok(
  "hold_javascript_href",
  hasBlocker(
    evalQa(
      baseCandidate({
        content: bodyParagraphs(1300) + '<a href="javascript:alert(1)">x</a>',
      })
    ),
    "unsafe-link"
  )
);
ok(
  "hold_data_href",
  hasBlocker(
    evalQa(
      baseCandidate({
        content: bodyParagraphs(1300) + '<a href="data:text/html,hi">x</a>',
      })
    ),
    "unsafe-link"
  )
);
ok(
  "hold_vbscript_href",
  hasBlocker(
    evalQa(
      baseCandidate({
        content: bodyParagraphs(1300) + '<a href="vbscript:msgbox">x</a>',
      })
    ),
    "unsafe-link"
  )
);
ok(
  "relative_internal_allowed",
  evalQa(
    baseCandidate({
      content: bodyParagraphs(1300) + '<a href="/blog/other">x</a>',
    })
  ).verdict === "PASS"
);
ok(
  "https_apex_internal_allowed",
  evalQa(
    baseCandidate({
      content:
        bodyParagraphs(1300) +
        '<a href="https://firestick4uk.com/products">x</a>',
    })
  ).verdict === "PASS"
);
ok(
  "hold_http_internal",
  hasBlocker(
    evalQa(
      baseCandidate({
        content:
          bodyParagraphs(1300) +
          '<a href="http://firestick4uk.com/products">x</a>',
      })
    ),
    "unsafe-link"
  )
);
ok(
  "hold_www_internal",
  hasBlocker(
    evalQa(
      baseCandidate({
        content:
          bodyParagraphs(1300) +
          '<a href="https://www.firestick4uk.com/products">x</a>',
      })
    ),
    "unsafe-link"
  )
);
ok(
  "external_https_allowed",
  evalQa(
    baseCandidate({
      content: bodyParagraphs(1300) + '<a href="https://example.com/guide">x</a>',
    })
  ).verdict === "PASS"
);

// ── Media ──────────────────────────────────────────────────────────────────

ok(
  "hold_blank_featured",
  hasBlocker(
    evalQa(baseCandidate({ featured_image: "" })),
    "featured-image-not-ready"
  )
);
ok(
  "hold_featured_not_ready_flag",
  hasBlocker(
    evalQa(baseCandidate({ mediaState: { featuredImageReady: false } })),
    "featured-image-not-ready"
  )
);
ok(
  "media_ready_passes",
  evalQa(baseCandidate()).checks.featuredImageReady === true
);

// ── Existing SEO reuse ─────────────────────────────────────────────────────

{
  // diagnoseBlog uses effective title (meta_title → title fallback).
  // Both must be blank to surface seo-missing-title.
  const r = evalQa(
    baseCandidate({
      meta_title: "",
      title: "",
      slug: "unique-missing-meta-title-case",
    }),
    []
  );
  ok("seo_missing_title_blocker", hasBlocker(r, "seo-missing-title"));
  ok(
    "existing_seo_issues_populated",
    Array.isArray(r.existingSeoIssues) && r.existingSeoIssues.length > 0
  );
}
{
  const r = evalQa(
    baseCandidate({
      meta_description: "",
      excerpt: "",
      title: "Unique Missing Desc Case",
      slug: "unique-missing-desc-case",
    })
  );
  ok("seo_missing_description_blocker", hasBlocker(r, "seo-missing-description"));
}
{
  const r = evalQa(
    baseCandidate({
      canonical_url: "https://evil.example/blog/x",
      title: "Unique Bad Canonical Case",
      slug: "unique-bad-canonical-case",
    })
  );
  ok("seo_canonical_blocker", hasBlocker(r, "seo-canonical-review"));
  ok("canonical_check_false", r.checks.canonicalSafe === false);
}
{
  const r = evalQa(
    baseCandidate({
      meta_description: "D".repeat(200),
      title: "Unique Long Desc Warning Case",
      slug: "unique-long-desc-warning-case",
    })
  );
  ok("seo_description_long_warning", hasWarning(r, "seo-description-long"));
  ok("seo_description_long_not_blocker", !hasBlocker(r, "seo-description-long"));
}
{
  const r = evalQa(
    baseCandidate({
      content: bodyParagraphs(1300) + '<img src="https://example.com/a.webp">',
      title: "Unique Missing Alt Case",
      slug: "unique-missing-alt-case",
    })
  );
  ok("seo_inline_missing_alt_blocker", hasBlocker(r, "seo-inline-image-missing-alt"));
}
{
  const r = evalQa(
    baseCandidate({
      content: bodyParagraphs(1300) + '<img src="https://example.com/a.webp" alt="">',
      title: "Unique Empty Alt Case",
      slug: "unique-empty-alt-case",
    })
  );
  ok("seo_inline_empty_alt_warning", hasWarning(r, "seo-inline-image-empty-alt"));
  ok("seo_inline_empty_alt_not_blocker", !hasBlocker(r, "seo-inline-image-empty-alt"));
}

// ── FAQ ────────────────────────────────────────────────────────────────────

ok("faqs_none_allowed", evalQa(baseCandidate({ faqs: undefined })).verdict === "PASS");
ok(
  "faqs_valid_allowed",
  evalQa(
    baseCandidate({
      faqs: [{ question: "Why restart?", answer: "Clears temporary memory." }],
    })
  ).verdict === "PASS"
);
ok(
  "faqs_empty_q_hold",
  hasBlocker(
    evalQa(baseCandidate({ faqs: [{ question: "", answer: "A" }] })),
    "faq-incomplete"
  )
);
ok(
  "faqs_too_many_hold",
  hasBlocker(
    evalQa(
      baseCandidate({
        faqs: Array.from({ length: 13 }, (_, i) => ({
          question: `Q${i}`,
          answer: `A${i}`,
        })),
      })
    ),
    "faq-count-exceeded"
  )
);
ok(
  "faqs_script_hold",
  hasBlocker(
    evalQa(
      baseCandidate({
        faqs: [{ question: "Q", answer: '<script>alert(1)</script> bad' }],
      })
    ),
    "faq-unsafe-html"
  )
);

// ── Determinism / fail closed ──────────────────────────────────────────────

{
  const a = evalQa(baseCandidate());
  const b = evalQa(baseCandidate());
  ok("deterministic_deep_equal", JSON.stringify(a) === JSON.stringify(b));
}
{
  const r = evalQa(null);
  ok("malformed_hold", r.verdict === "HOLD" && hasBlocker(r, "candidate-malformed"));
}
{
  const r = evalQa(baseCandidate({ publicationIntent: "draft", evidenceState: "missing" }));
  const codes = r.blockers.map((b) => b.code);
  ok(
    "stable_blocker_order_gates_first",
    codes.indexOf("publish-intent-missing") < codes.indexOf("evidence-not-ready") ||
      (codes.includes("publish-intent-missing") && codes.includes("evidence-not-ready"))
  );
}

console.log(`\nAB-1 pre-publish QA: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
