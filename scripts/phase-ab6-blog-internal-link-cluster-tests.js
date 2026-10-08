/**
 * AB-6 — Pure Blog internal-link / content-cluster planner tests.
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

const plannerSource = read("lib/blogInternalLinkPlanner.ts");
const matcher = loadTsModule("lib/blogOpportunityMatcher.ts");
const {
  MAX_BLOG_EXISTING_INTERNAL_HREFS,
  MAX_BLOG_INTERNAL_LINK_INVENTORY,
  MAX_BLOG_INTERNAL_LINK_SUGGESTIONS,
  normalizeExistingBlogInternalHref,
  planBlogInternalLinks,
} = loadTsModule("lib/blogInternalLinkPlanner.ts");

console.log("\nAB-6 Blog Internal-Link / Content-Cluster Planner\n");

function source(overrides = {}) {
  return {
    id: null,
    title: "Firestick Buffering Speed Repair Guide",
    slug: "source-guide",
    category: "Troubleshooting",
    focusKeyword: "firestick performance",
    existingInternalHrefs: [],
    ...overrides,
  };
}

function row(id, overrides = {}) {
  return {
    id,
    title: "Firestick Buffering Speed Repair Guide",
    slug: `target-${id}`,
    status: "published",
    active: 1,
    category: "Other",
    focus_keyword: "different focus",
    ...overrides,
  };
}

function invalid(result) {
  return (
    result &&
    result.ok === false &&
    deepEqual(result.clusterMembers, []) &&
    deepEqual(result.linkSuggestions, []) &&
    deepEqual(result.reasonCodes, ["INVALID_INPUT"])
  );
}

function ids(items, key = "id") {
  return items.map((item) => item[key]);
}

// A. EXACT FOCUS CLUSTER
const exactFocus = planBlogInternalLinks(source(), [
  row(1, {
    title: "Completely Different Topic Words",
    focus_keyword: "  FIRESTICK   PERFORMANCE ",
  }),
]);
ok("A_exact_focus_ok", exactFocus.ok === true);
ok(
  "A_exact_focus_relationship",
  exactFocus.ok && exactFocus.clusterMembers[0]?.relationship === "EXACT_FOCUS_KEYWORD"
);
ok(
  "A_exact_focus_tier_zero",
  exactFocus.ok && exactFocus.clusterMembers[0]?.relationshipTier === 0
);

// B. STRONG TOPIC CLUSTER
const strongTopic = planBlogInternalLinks(source(), [row(2)]);
ok(
  "B_strong_topic_relationship",
  strongTopic.ok && strongTopic.clusterMembers[0]?.relationship === "STRONG_TOPIC_OVERLAP"
);
ok(
  "B_reuses_ab4_similarity_value",
  strongTopic.ok &&
    strongTopic.clusterMembers[0]?.topicSimilarity ===
      matcher.computeBlogTopicSimilarity(source().title, row(2).title)
);

// C. SAME CATEGORY
const sameCategory = planBlogInternalLinks(
  source({ title: "Alpha Beta Gamma", focusKeyword: null, category: "  Setup   Guides " }),
  [
    row(3, {
      title: "Delta Epsilon Zeta",
      focus_keyword: null,
      category: "setup guides",
    }),
  ]
);
ok(
  "C_same_category_member",
  sameCategory.ok && sameCategory.clusterMembers[0]?.relationship === "SAME_CATEGORY"
);
ok(
  "C_same_category_not_suggested",
  sameCategory.ok &&
    sameCategory.clusterMembers[0]?.linkEligible === false &&
    sameCategory.linkSuggestions.length === 0
);

// D. RELATIONSHIP PRECEDENCE
const precedence = planBlogInternalLinks(source(), [
  row(4, { focus_keyword: "firestick performance" }),
]);
ok(
  "D_exact_focus_beats_topic_overlap",
  precedence.ok && precedence.clusterMembers[0]?.relationship === "EXACT_FOCUS_KEYWORD"
);

// E. PUBLISHED ACTIVE
ok(
  "E_published_active_linkable",
  strongTopic.ok &&
    strongTopic.clusterMembers[0]?.linkEligible === true &&
    strongTopic.linkSuggestions[0]?.targetId === 2 &&
    strongTopic.clusterMembers[0]?.reasonCodes.includes("PUBLISHED_ACTIVE_LINKABLE")
);
ok(
  "E_link_output_contract",
  strongTopic.ok &&
    strongTopic.linkSuggestions[0]?.href === "/blog/target-2" &&
    strongTopic.linkSuggestions[0]?.canonicalUrl ===
      "https://firestick4uk.com/blog/target-2" &&
    strongTopic.linkSuggestions[0]?.anchorText ===
      "Firestick Buffering Speed Repair Guide"
);

// F. ACTIVE DRAFT
const activeDraft = planBlogInternalLinks(source(), [
  row(5, { status: "draft", active: true }),
]);
ok(
  "F_active_draft_cluster_only",
  activeDraft.ok &&
    activeDraft.clusterMembers.length === 1 &&
    activeDraft.clusterMembers[0].linkEligible === false &&
    activeDraft.clusterMembers[0].reasonCodes.includes("DRAFT_NOT_LINKABLE") &&
    activeDraft.linkSuggestions.length === 0
);

// G. INACTIVE PUBLISHED
const inactivePublished = planBlogInternalLinks(source(), [
  row(6, { status: "published", active: 0 }),
]);
ok(
  "G_inactive_published_cluster_only",
  inactivePublished.ok &&
    inactivePublished.clusterMembers.length === 1 &&
    inactivePublished.clusterMembers[0].active === false &&
    inactivePublished.clusterMembers[0].reasonCodes.includes("INACTIVE_NOT_LINKABLE") &&
    inactivePublished.linkSuggestions.length === 0
);

// H/I. SELF EXCLUSION
const selfById = planBlogInternalLinks(source({ id: 42 }), [row(42)]);
ok(
  "H_self_by_id_excluded",
  selfById.ok &&
    selfById.clusterMembers.length === 0 &&
    selfById.linkSuggestions.length === 0 &&
    selfById.reasonCodes.includes("SELF_EXCLUDED")
);
const selfBySlug = planBlogInternalLinks(source({ id: null, slug: "target-7" }), [row(7)]);
ok(
  "I_self_by_slug_excluded",
  selfBySlug.ok &&
    selfBySlug.clusterMembers.length === 0 &&
    selfBySlug.reasonCodes.includes("SELF_EXCLUDED")
);

// J/K/L. EXISTING LINK SUPPRESSION + NORMALIZATION
for (const [name, href] of [
  ["J_relative", "/blog/target-8"],
  ["K_absolute", "https://firestick4uk.com/blog/target-8"],
  ["L_relative_trailing", "/blog/target-8/"],
  ["L_absolute_trailing", "https://firestick4uk.com/blog/target-8/"],
]) {
  const result = planBlogInternalLinks(source({ existingInternalHrefs: [href] }), [row(8)]);
  ok(
    `${name}_suppresses_suggestion`,
    result.ok &&
      result.clusterMembers.length === 1 &&
      result.clusterMembers[0].reasonCodes.includes("ALREADY_LINKED") &&
      result.linkSuggestions.length === 0
  );
}
ok(
  "L_normalizer_comparison_form",
  normalizeExistingBlogInternalHref("https://firestick4uk.com/blog/example-slug/") ===
    "/blog/example-slug"
);

// M. MALFORMED EXISTING HREF
const malformedHrefs = [
  "//evil.example/x",
  "http://firestick4uk.com/blog/target-9",
  "https://www.firestick4uk.com/blog/target-9",
  "https://evil.example/blog/target-9",
  "javascript:alert(1)",
  "data:text/plain,x",
  "/blog/target-9?x=1",
  "/blog/target-9#part",
  "/blog/",
  "/blog/a/b",
  "/products/target-9",
];
for (const [index, href] of malformedHrefs.entries()) {
  ok(
    `M_malformed_href_${index + 1}`,
    invalid(planBlogInternalLinks(source({ existingInternalHrefs: [href] }), [row(9)]))
  );
}

// N. MALFORMED TARGET SLUG
const malformedSlugs = [
  "Target Slug",
  "/target-slug",
  "target/slug",
  "target-slug?x=1",
  "../target",
  "target--slug",
  " target-slug",
];
for (const [index, slug] of malformedSlugs.entries()) {
  ok(
    `N_malformed_target_slug_${index + 1}`,
    invalid(planBlogInternalLinks(source(), [row(10, { slug })]))
  );
}

// O/P. DUPLICATE IDENTITY
ok(
  "O_duplicate_id_fails_closed",
  invalid(planBlogInternalLinks(source(), [row(11), row(11, { slug: "other-11" })]))
);
ok(
  "P_duplicate_slug_fails_closed",
  invalid(planBlogInternalLinks(source(), [row(12), row(13, { slug: "target-12" })]))
);

// Q. INVENTORY BOUND
const inventory500 = Array.from({ length: 500 }, (_, index) =>
  row(index + 1, {
    title: `Unrelated Inventory Record ${index + 1}`,
    slug: `inventory-${index + 1}`,
    category: null,
    focus_keyword: null,
  })
);
ok(
  "Q_inventory_constant",
  MAX_BLOG_INTERNAL_LINK_INVENTORY === 500
);
ok("Q_inventory_500_accepted", planBlogInternalLinks(source(), inventory500).ok === true);
ok(
  "Q_inventory_501_fails_closed",
  invalid(
    planBlogInternalLinks(source(), [
      ...inventory500,
      row(501, { slug: "inventory-501", title: "Unrelated Inventory Record 501" }),
    ])
  )
);

// R. EXISTING HREF BOUND
const hrefs100 = Array.from({ length: 100 }, (_, index) => `/blog/existing-${index + 1}`);
ok("R_href_constant", MAX_BLOG_EXISTING_INTERNAL_HREFS === 100);
ok(
  "R_href_100_accepted",
  planBlogInternalLinks(source({ existingInternalHrefs: hrefs100 }), []).ok === true
);
ok(
  "R_href_101_fails_closed",
  invalid(
    planBlogInternalLinks(
      source({ existingInternalHrefs: [...hrefs100, "/blog/existing-101"] }),
      []
    )
  )
);

// S. MAX SUGGESTIONS
const manySuggestions = Array.from({ length: 8 }, (_, index) =>
  row(20 + index, {
    slug: `related-${20 + index}`,
    title: `Different Topic ${20 + index}`,
    focus_keyword: "firestick performance",
  })
);
const capped = planBlogInternalLinks(source(), manySuggestions);
ok("S_max_constant", MAX_BLOG_INTERNAL_LINK_SUGGESTIONS === 5);
ok(
  "S_exactly_five_suggestions",
  capped.ok && capped.clusterMembers.length === 8 && capped.linkSuggestions.length === 5
);

// T. SORTING
const sorting = planBlogInternalLinks(source(), [
  row(30, { title: "Firestick Buffering Speed Repair Guide", slug: "strong-30" }),
  row(9, {
    title: "Firestick Buffering Speed Repair Guide",
    slug: "exact-high-9",
    focus_keyword: "firestick performance",
  }),
  row(2, {
    title: "Unrelated Words Only Here",
    slug: "exact-low-2",
    focus_keyword: "firestick performance",
  }),
  row(1, {
    title: "Unrelated Words Only There",
    slug: "exact-low-1",
    focus_keyword: "firestick performance",
  }),
]);
ok(
  "T_relationship_similarity_id_sort",
  sorting.ok && deepEqual(ids(sorting.linkSuggestions, "targetId"), [9, 1, 2, 30])
);

// U. LIFECYCLE CLUSTER ORDER
const lifecycle = planBlogInternalLinks(source(), [
  row(1, { status: "draft", active: 1, focus_keyword: "firestick performance" }),
  row(2, { status: "published", active: 0, focus_keyword: "firestick performance" }),
  row(30, { status: "published", active: true, focus_keyword: "firestick performance" }),
]);
ok(
  "U_lifecycle_cluster_order",
  lifecycle.ok && deepEqual(ids(lifecycle.clusterMembers), [30, 1, 2])
);

// V/W. INPUT ORDER INDEPENDENCE + DETERMINISM
const orderInput = [
  row(40, { focus_keyword: "firestick performance" }),
  row(41),
  row(42, { category: "Troubleshooting", title: "Alpha Beta Gamma" }),
];
const orderForward = planBlogInternalLinks(source(), orderInput);
const orderReverse = planBlogInternalLinks(source(), [...orderInput].reverse());
ok("V_input_order_independence", deepEqual(orderForward, orderReverse));
ok(
  "W_repeat_determinism",
  deepEqual(orderForward, planBlogInternalLinks(source(), orderInput))
);

// X. IMMUTABILITY
const frozenSource = Object.freeze({
  ...source({ existingInternalHrefs: Object.freeze(["/blog/already-linked"]) }),
});
const frozenInventory = Object.freeze([
  Object.freeze(row(50, { focus_keyword: "firestick performance" })),
]);
const frozenSourceBefore = JSON.stringify(frozenSource);
const frozenInventoryBefore = JSON.stringify(frozenInventory);
let freezeThrew = false;
try {
  planBlogInternalLinks(frozenSource, frozenInventory);
} catch {
  freezeThrew = true;
}
ok("X_frozen_inputs_do_not_throw", freezeThrew === false);
ok(
  "X_source_not_mutated",
  JSON.stringify(frozenSource) === frozenSourceBefore
);
ok(
  "X_inventory_not_mutated",
  JSON.stringify(frozenInventory) === frozenInventoryBefore
);

// Y. INVALID SOURCE / STRUCTURE
const invalidSources = [
  null,
  [],
  "source",
  source({ id: 0 }),
  source({ id: 1.5 }),
  { slug: "source-guide" },
  source({ title: "" }),
  source({ slug: "Bad Slug" }),
  source({ category: 7 }),
  source({ focusKeyword: false }),
  { ...source(), unexpected: true },
];
for (const [index, badSource] of invalidSources.entries()) {
  ok(
    `Y_invalid_source_${index + 1}`,
    invalid(planBlogInternalLinks(badSource, [row(60)]))
  );
}

const sparseInventory = new Array(1);
ok("Y_sparse_inventory_fails_closed", invalid(planBlogInternalLinks(source(), sparseInventory)));
const accessorSource = {};
Object.defineProperty(accessorSource, "title", { enumerable: true, get: () => "Title" });
Object.defineProperty(accessorSource, "slug", { enumerable: true, value: "source-guide" });
ok("Y_accessor_source_fails_closed", invalid(planBlogInternalLinks(accessorSource, [])));

// Z. PURITY / PHASE BOUNDARIES
ok(
  "Z_imports_ab4_similarity",
  /computeBlogTopicSimilarity/.test(plannerSource) &&
    /STRONG_TOKEN_SIMILARITY_THRESHOLD/.test(plannerSource) &&
    !/const\s+STRONG_TOKEN_SIMILARITY_THRESHOLD/.test(plannerSource)
);
ok("Z_no_duplicate_numeric_threshold", !/\b0\.8\b/.test(plannerSource));
ok("Z_no_db_import", !/from\s+["'][^"']*(?:db|mysql)[^"']*["']/.test(plannerSource));
ok("Z_no_fetch_or_http", !/\bfetch\s*\(|from\s+["']https?:/.test(plannerSource));
ok(
  "Z_no_provider_import",
  !/from\s+["'][^"']*(?:openai|gemini|provider)[^"']*["']|require\(["'][^"']*(?:openai|gemini|provider)[^"']*["']\)/i.test(
    plannerSource,
  ),
);
ok("Z_no_env", !/process\.env/.test(plannerSource));
ok("Z_no_fs", !/from\s+["']fs["']|require\(["']fs["']\)/.test(plannerSource));
ok("Z_no_persistence", !/blogPersistenceServer|recordAdminAudit|recordContentRevision/.test(plannerSource));
ok("Z_no_scheduler", !/schedulerEligible|scheduleBlog|cron/i.test(plannerSource));
ok("Z_no_time_or_random", !/Date\.now|Math\.random/.test(plannerSource));
ok("Z_no_html_mutation", !/innerHTML|replaceContent|insertLink/i.test(plannerSource));

console.log(`\nResult: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
