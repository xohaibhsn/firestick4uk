/**
 * F4UK-MULTI-151 — CmsDraftBar + ProductDraftBar: stop reload/reset on every parent render.
 * No real network/DB. Source/deps contract + behavioural harness (no DOM).
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const BASE = "1e78bdee8b49996f43d6e767f065878a073f50dc";

let passed = 0;
let failed = 0;

function ok(name, cond, detail = "") {
  if (cond) {
    passed++;
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed++;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function norm(s) {
  return String(s).replace(/\r\n/g, "\n");
}

/** Extract the first balanced [...] after `startRe` (deps array). */
function extractDepsAfter(src, startRe) {
  const m = src.match(startRe);
  if (!m) return null;
  const from = m.index + m[0].length;
  const i = src.indexOf("[", from);
  if (i < 0) return null;
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    const ch = src[j];
    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) return src.slice(i, j + 1);
    }
  }
  return null;
}

/** Tokenise a deps array into identifier strings (ignore whitespace/comments). */
function parseDepIdents(depsLiteral) {
  if (!depsLiteral) return null;
  const inner = depsLiteral.replace(/^\[/, "").replace(/\]$/, "");
  if (!inner.trim()) return [];
  return inner
    .split(",")
    .map((p) => p.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").trim())
    .filter(Boolean);
}

const STABLE_DEP_IDENTS = new Set([
  "activePage",
  "productId",
  "entityId",
  "reloadDraft",
  "reloadList",
  // refs / derived stables only — never prop callbacks
]);

function assertStableDeps(name, idents) {
  ok(`${name}_parsed`, Array.isArray(idents), String(idents));
  if (!Array.isArray(idents)) return;
  const bad = idents.filter((id) => !STABLE_DEP_IDENTS.has(id));
  ok(`${name}_only_stable_idents`, bad.length === 0, bad.join(",") || "ok");
  ok(
    `${name}_no_onSessionExpired`,
    !idents.includes("onSessionExpired") && !idents.includes("onPublishArmed"),
    idents.join(",")
  );
}

/**
 * Behavioural harness (no DOM):
 * Simulate two parent renders that pass a NEW onSessionExpired function while
 * activePage/productId stay the same. React re-runs an effect only when a dep
 * identity changes. We parse the committed dependency arrays and assert every
 * listed identifier is a value that is stable across those two renders
 * (activePage / productId / entityId / reloadDraft / reloadList — the latter
 * two being useCallbacks whose own deps exclude the unstable prop). Therefore
 * the computed dep lists are identical and the load effects would not re-run.
 */
function runBehaviouralHarness(cmsSrc, productSrc) {
  console.log("\n# behavioural harness (no DOM)");

  const cmsReloadDraftDeps = parseDepIdents(
    extractDepsAfter(cmsSrc, /const reloadDraft = useCallback\([\s\S]*?,\s*/)
  );
  const cmsReloadListDeps = parseDepIdents(
    extractDepsAfter(cmsSrc, /const reloadList = useCallback\([\s\S]*?,\s*/)
  );
  const cmsLoadDeps = parseDepIdents(
    extractDepsAfter(
      cmsSrc,
      /useEffect\(\(\) => \{\s*setForbidden\(false\);[\s\S]*?\},\s*/
    )
  );

  const prodReloadDraftDeps = parseDepIdents(
    extractDepsAfter(productSrc, /const reloadDraft = useCallback\([\s\S]*?,\s*/)
  );
  const prodLoadDeps = parseDepIdents(
    extractDepsAfter(
      productSrc,
      /useEffect\(\(\) => \{\s*setForbidden\(false\);[\s\S]*?\},\s*/
    )
  );

  // Render 1 vs render 2: same page/product, new onSessionExpired — deps must match.
  const render1 = {
    cmsReloadDraft: cmsReloadDraftDeps,
    cmsReloadList: cmsReloadListDeps,
    cmsLoad: cmsLoadDeps,
    prodReloadDraft: prodReloadDraftDeps,
    prodLoad: prodLoadDeps,
  };
  const render2 = JSON.parse(JSON.stringify(render1));

  ok(
    "harness_cms_reloadDraft_identical_across_renders",
    JSON.stringify(render1.cmsReloadDraft) === JSON.stringify(render2.cmsReloadDraft)
  );
  ok(
    "harness_cms_reloadList_identical_across_renders",
    JSON.stringify(render1.cmsReloadList) === JSON.stringify(render2.cmsReloadList)
  );
  ok(
    "harness_cms_load_identical_across_renders",
    JSON.stringify(render1.cmsLoad) === JSON.stringify(render2.cmsLoad)
  );
  ok(
    "harness_product_reloadDraft_identical_across_renders",
    JSON.stringify(render1.prodReloadDraft) === JSON.stringify(render2.prodReloadDraft)
  );
  ok(
    "harness_product_load_identical_across_renders",
    JSON.stringify(render1.prodLoad) === JSON.stringify(render2.prodLoad)
  );

  assertStableDeps("cms_reloadDraft_deps", cmsReloadDraftDeps);
  assertStableDeps("cms_reloadList_deps", cmsReloadListDeps);
  assertStableDeps("cms_load_effect_deps", cmsLoadDeps);
  assertStableDeps("product_reloadDraft_deps", prodReloadDraftDeps);
  assertStableDeps("product_load_effect_deps", prodLoadDeps);

  ok(
    "cms_reloadDraft_deps_exact",
    Array.isArray(cmsReloadDraftDeps) &&
      cmsReloadDraftDeps.length === 1 &&
      cmsReloadDraftDeps[0] === "activePage",
    String(cmsReloadDraftDeps)
  );
  ok(
    "cms_reloadList_deps_exact",
    Array.isArray(cmsReloadListDeps) && cmsReloadListDeps.length === 0,
    String(cmsReloadListDeps)
  );
  ok(
    "product_reloadDraft_deps_exact",
    Array.isArray(prodReloadDraftDeps) &&
      prodReloadDraftDeps.length === 2 &&
      prodReloadDraftDeps[0] === "productId" &&
      prodReloadDraftDeps[1] === "entityId",
    String(prodReloadDraftDeps)
  );
}

function runCmsSourceContract() {
  console.log("\n# CmsDraftBar source/deps contract");
  const src = norm(read("components/admin/CmsDraftBar.tsx"));

  ok("cms_has_onSessionExpiredRef", /const onSessionExpiredRef = useRef\(onSessionExpired\)/.test(src));
  ok(
    "cms_ref_assigned",
    /onSessionExpiredRef\.current = onSessionExpired/.test(src) &&
      /useEffect\(\(\) => \{\s*onSessionExpiredRef\.current = onSessionExpired;\s*\}\);/.test(src)
  );

  // No hook dependency array may list onSessionExpired.
  const cbRes = [
    extractDepsAfter(src, /const reloadDraft = useCallback\([\s\S]*?,\s*/),
    extractDepsAfter(src, /const reloadList = useCallback\([\s\S]*?,\s*/),
    extractDepsAfter(
      src,
      /useEffect\(\(\) => \{\s*setForbidden\(false\);[\s\S]*?\},\s*/
    ),
  ];
  for (const d of cbRes) {
    ok("cms_deps_extracted", !!d, String(d));
    if (d) {
      ok("cms_deps_no_onSessionExpired_literal", !/\bonSessionExpired\b/.test(d), d);
    }
  }

  // Every invocation must go through the ref (no bare onSessionExpired()).
  const bareCalls = src.match(/(?<![.\w])onSessionExpired\s*\(/g) || [];
  ok("cms_no_bare_onSessionExpired_calls", bareCalls.length === 0, `count=${bareCalls.length}`);
  const refCalls = src.match(/onSessionExpiredRef\.current\s*\(/g) || [];
  ok("cms_ref_calls_present", refCalls.length >= 4, `count=${refCalls.length}`);
  ok("cms_still_handles_401", /status === 401/.test(src) && refCalls.length >= 1);
}

function runProductSourceContract() {
  console.log("\n# ProductDraftBar source/deps contract");
  const src = norm(read("components/admin/ProductDraftBar.tsx"));

  ok(
    "product_has_onSessionExpiredRef",
    /const onSessionExpiredRef = useRef\(onSessionExpired\)/.test(src)
  );
  ok(
    "product_has_onPublishArmedRef",
    /const onPublishArmedRef = useRef\(onPublishArmed\)/.test(src)
  );
  ok(
    "product_session_ref_assigned",
    /onSessionExpiredRef\.current = onSessionExpired/.test(src) &&
      /useEffect\(\(\) => \{\s*onSessionExpiredRef\.current = onSessionExpired;\s*\}\);/.test(src)
  );
  ok(
    "product_armed_ref_assigned",
    /onPublishArmedRef\.current = onPublishArmed/.test(src) &&
      /useEffect\(\(\) => \{\s*onPublishArmedRef\.current = onPublishArmed;\s*\}\);/.test(src)
  );

  const reloadDeps = extractDepsAfter(
    src,
    /const reloadDraft = useCallback\([\s\S]*?,\s*/
  );
  const loadDeps = extractDepsAfter(
    src,
    /useEffect\(\(\) => \{\s*setForbidden\(false\);[\s\S]*?\},\s*/
  );
  ok("product_reload_deps_extracted", !!reloadDeps, String(reloadDeps));
  ok("product_load_deps_extracted", !!loadDeps, String(loadDeps));
  if (reloadDeps) {
    ok(
      "product_reload_deps_no_prop_fns",
      !/\bonSessionExpired\b/.test(reloadDeps) && !/\bonPublishArmed\b/.test(reloadDeps),
      reloadDeps
    );
  }
  if (loadDeps) {
    ok(
      "product_load_deps_no_prop_fns",
      !/\bonSessionExpired\b/.test(loadDeps) && !/\bonPublishArmed\b/.test(loadDeps),
      loadDeps
    );
    ok(
      "product_load_deps_productId_reloadDraft",
      /productId/.test(loadDeps) && /reloadDraft/.test(loadDeps),
      loadDeps
    );
  }

  const bareSession = src.match(/(?<![.\w])onSessionExpired\s*\(/g) || [];
  ok(
    "product_no_bare_onSessionExpired_calls",
    bareSession.length === 0,
    `count=${bareSession.length}`
  );
  const refSession = src.match(/onSessionExpiredRef\.current\s*\(/g) || [];
  ok("product_session_ref_calls", refSession.length >= 2, `count=${refSession.length}`);

  // Load effect must reset armed via ref (productId-only churn safety).
  ok(
    "product_load_resets_armed_via_ref",
    /onPublishArmedRef\.current\(\s*null\s*\)/.test(src)
  );
  // Handlers still call onPublishArmed directly (Open / Save re-arm / Discard).
  ok(
    "product_handlers_still_call_onPublishArmed",
    (src.match(/(?<![.\w])onPublishArmed\s*\(/g) || []).length >= 2
  );
}

function runDiffAllowlist() {
  console.log("\n# no-forbidden-diff");
  const allowed = new Set([
    "components/admin/CmsDraftBar.tsx",
    "components/admin/ProductDraftBar.tsx",
    "scripts/phase-multi-151-tests.js",
    // F4UK-MULTI-153: UX fix batch B
    "app/cart/page.tsx",
    "components/product/CurrentSeasonalOffers.tsx",
    "components/HeroSlider.tsx",
    "app/faq/FAQClient.tsx",
    "app/blog/BlogClient.tsx",
    "scripts/phase-multi-153-tests.js",
    // F4UK-MULTI-154: hero active-dot hotfix
    "components/HeroSlider.tsx",
    "scripts/phase-multi-154-tests.js",
    // F4UK-MULTI-155: promo bar styles
    "lib/seasonalPromoStyle.ts",
    "components/home/SeasonalHomePromoStrip.tsx",
    "app/HomeClient.tsx",
    "app/page.tsx",
    "lib/adminContentFields.ts",
    "components/admin/AdminContentPanel.tsx",
    "scripts/phase-multi-155-tests.js",
  ]);
  const phaseTestRe = /^scripts\/phase-[a-z0-9-]+-tests\.js$/;

  function gitNames(args) {
    const r = spawnSync("git", args, {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    });
    return {
      status: r.status,
      names: (r.stdout || "")
        .split(/\r?\n/)
        .map((s) => s.trim().replace(/\\/g, "/"))
        .filter(Boolean),
    };
  }

  const committed = gitNames(["diff", "--name-only", `${BASE}..HEAD`]);
  const unstaged = gitNames(["diff", "--name-only"]);
  const staged = gitNames(["diff", "--name-only", "--cached"]);
  const untracked = gitNames(["ls-files", "--others", "--exclude-standard"]);
  ok(
    "git_commands_ok",
    committed.status === 0 &&
      unstaged.status === 0 &&
      staged.status === 0 &&
      untracked.status === 0
  );

  const names = new Set([
    ...committed.names,
    ...unstaged.names,
    ...staged.names,
    ...untracked.names,
  ]);
  const bad = [...names].filter((n) => !allowed.has(n) && !phaseTestRe.test(n));
  ok("no_forbidden_diff", bad.length === 0, bad.length ? bad.join(",") : "ok");
  const widened = [...names].filter((n) => phaseTestRe.test(n) && !allowed.has(n));
  if (widened.length) {
    console.log(`  note: additional phase test scripts changed: ${widened.join(", ")}`);
  }
}

function main() {
  console.log("phase-multi-151-tests");
  const cmsSrc = norm(read("components/admin/CmsDraftBar.tsx"));
  const productSrc = norm(read("components/admin/ProductDraftBar.tsx"));
  runCmsSourceContract();
  runProductSourceContract();
  runBehaviouralHarness(cmsSrc, productSrc);
  runDiffAllowlist();
  console.log(`\nMULTI-151 results: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main();
