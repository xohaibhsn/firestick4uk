/**
 * JSEO-B4 — curated GSC verification workflow (read-only, no Google API).
 */
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..");
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

function loadTsModule(rel) {
  const src = read(rel);
  const { outputText } = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
    },
  });
  const sandbox = { exports: {} };
  const fn = new Function("exports", "module", "require", outputText);
  fn(sandbox.exports, sandbox, require);
  return sandbox.exports;
}

const so = loadTsModule("lib/seoOverview.ts");
const helper = read("lib/seoOverview.ts");
const api = read("pages/api/admin-seo-overview.ts");
const panel = read("components/admin/SeoOverviewPanel.tsx");
const perms = read("lib/adminPermissions.ts");
const productPage = read("app/products/[slug]/page.tsx");
const blogPage = read("app/blog/[slug]/page.tsx");
const sitemap = read("app/sitemap.ts");
const robots = read("public/robots.txt");

const ORIGIN = "https://firestick4uk.com";

// A — factual workflow fields
const sample = so.buildProductMigrationVerificationItems({
  p8Active: true,
  p9Active: true,
})[0];
ok(
  "A_verification_item_fields",
  sample &&
    typeof sample.url === "string" &&
    typeof sample.label === "string" &&
    sample.group === "priority-migrations" &&
    (sample.kind === "current" ||
      sample.kind === "legacy-redirect" ||
      sample.kind === "content") &&
    ("expectedStatus" in sample) &&
    ("expectedCanonical" in sample) &&
    ("expectedTarget" in sample) &&
    ("inSitemap" in sample) &&
    typeof sample.note === "string"
);

// B — priority migration URLs
const activeMig = so.buildProductMigrationVerificationItems({
  p8Active: true,
  p9Active: true,
});
const migUrls = activeMig.map((i) => i.url);
ok(
  "B_priority_exact_urls",
  migUrls.length === 5 &&
    migUrls[0] === `${ORIGIN}/products/3-years-subscription` &&
    migUrls[1] === `${ORIGIN}/products/world-cup-offer-3-years` &&
    migUrls[2] === `${ORIGIN}/products/3-years-season-pass` &&
    migUrls[3] === `${ORIGIN}/products/b1g-2-years-plan` &&
    migUrls[4] === `${ORIGIN}/products/2-years-subscription` &&
    activeMig.every((i) => i.group === "priority-migrations")
);

// C — P8 conditional on active
const p8On = so.buildProductMigrationVerificationItems({
  p8Active: true,
  p9Active: false,
});
const p8Off = so.buildProductMigrationVerificationItems({
  p8Active: false,
  p9Active: false,
});
const p8CurOn = p8On.find((i) => i.label === "Product 8 current");
const p8LegOn = p8On.filter((i) => i.label === "Product 8 legacy");
const p8CurOff = p8Off.find((i) => i.label === "Product 8 current");
const p8LegOff = p8Off.filter((i) => i.label === "Product 8 legacy");
ok(
  "C_p8_active_states",
  p8CurOn?.expectedStatus === 200 &&
    p8CurOn?.expectedCanonical === `${ORIGIN}/products/3-years-subscription` &&
    p8CurOn?.inSitemap === true &&
    p8LegOn.length === 2 &&
    p8LegOn.every(
      (i) =>
        i.expectedStatus === 308 &&
        i.expectedTarget === `${ORIGIN}/products/3-years-subscription` &&
        i.inSitemap === false
    ) &&
    p8CurOff?.expectedStatus === null &&
    p8CurOff?.inSitemap === false &&
    p8LegOff.every(
      (i) =>
        i.expectedStatus === null &&
        i.inSitemap === false &&
        /depends on active target/i.test(i.note)
    )
);

// D — P9 conditional
const p9On = so.buildProductMigrationVerificationItems({
  p8Active: false,
  p9Active: true,
});
const p9Off = so.buildProductMigrationVerificationItems({
  p8Active: false,
  p9Active: false,
});
const p9Cur = p9On.find((i) => i.label === "Product 9 current");
const p9Alias = p9On.find((i) => i.label === "Product 9 alias");
const p9CurOff = p9Off.find((i) => i.label === "Product 9 current");
const p9AliasOff = p9Off.find((i) => i.label === "Product 9 alias");
ok(
  "D_p9_active_states",
  p9Cur?.expectedStatus === 200 &&
    p9Cur?.inSitemap === true &&
    p9Alias?.expectedStatus === 308 &&
    p9Alias?.expectedTarget === `${ORIGIN}/products/b1g-2-years-plan` &&
    p9Alias?.inSitemap === false &&
    p9CurOff?.expectedStatus === null &&
    p9AliasOff?.expectedStatus === null &&
    /depends on active target/i.test(p9AliasOff?.note || "")
);

// E — legacy inSitemap false
ok(
  "E_legacy_not_in_sitemap",
  activeMig
    .filter((i) => i.kind === "legacy-redirect")
    .every((i) => i.inSitemap === false)
);

// F/G — core content
const core = so.buildContentVerificationItems(
  `${ORIGIN}/iptv-subscriptions-uk`
);
const coreLabels = core.map((i) => i.label);
ok(
  "F_core_content_labels",
  coreLabels.includes("Homepage") &&
    coreLabels.includes("Products listing") &&
    coreLabels.includes("Blog listing") &&
    coreLabels.includes("FAQ") &&
    coreLabels.includes("Subscription") &&
    coreLabels.includes("Order tracking") &&
    coreLabels.includes("Terms") &&
    coreLabels.includes("Privacy") &&
    coreLabels.includes("Refund") &&
    core.length === 9 &&
    core.every((i) => i.group === "core-content")
);
ok(
  "G_core_content_expected",
  core.every(
    (i) =>
      i.expectedStatus === 200 &&
      i.expectedCanonical === i.url &&
      i.inSitemap === true
  )
);

// H — no blog flood in API queue composition
ok(
  "H_no_blog_posts_in_queue",
  !/Blog:\s*\$\{/.test(api) &&
    !/filter\(\(b\)\s*=>\s*b\.published/.test(api) &&
    /Published blog posts stay in the Blog SEO table/.test(api)
);

// I — blog health intact
ok(
  "I_blog_health_intact",
  /deriveBlogHealth/.test(api) &&
    /analyzeBlogCanonical/.test(api) &&
    /Blog SEO/.test(panel) &&
    /canBlog/.test(api)
);

// J/K/L — account checks
const checks = so.GSC_ACCOUNT_CHECKS;
ok(
  "J_manual_actions",
  checks.some(
    (c) => c.key === "manual-actions" && c.label === "Manual Actions"
  )
);
ok(
  "K_security_issues",
  checks.some(
    (c) => c.key === "security-issues" && c.label === "Security Issues"
  )
);
ok(
  "L_no_fake_account_result",
  checks.every(
    (c) =>
      !/\bPASS\b|\bFAIL\b|\bClean\b|Issue detected/i.test(c.note) &&
      !("status" in c) &&
      !("result" in c)
  ) && /gscAccountChecks/.test(api)
);

// M/N/O/P — UI
ok(
  "M_ui_groups",
  /Priority URL Migrations/.test(panel) &&
    /Core Content/.test(panel) &&
    /Account-Level GSC Checks/.test(panel)
);
ok(
  "N_copy_url",
  /Copy URL/.test(panel) && /navigator\.clipboard/.test(panel)
);
ok(
  "O_open_url",
  /target="_blank"/.test(panel) &&
    /rel="noopener noreferrer"/.test(panel) &&
    />\s*Open\s*</.test(panel)
);
ok(
  "P_not_connected",
  /Not connected to Google/.test(panel) &&
    /source truth only/i.test(panel)
);

// Q — no fake DATA fields (disclaimer may mention clicks/indexed)
function stripDisclaimer(src) {
  return src
    .replace(/Not connected to Google[\s\S]{0,220}/gi, "")
    .replace(/No live indexing[\s\S]{0,120}/gi, "")
    .replace(/No indexed \/ clicks \/ impressions[^\n]*/gi, "")
    .replace(/technical state only; no Google status claimed/gi, "");
}
const apiStripped = stripDisclaimer(api);
const panelStripped = stripDisclaimer(panel);
const helperStripped = stripDisclaimer(helper);
ok(
  "Q_no_fake_gsc_data_fields",
  !/\bimpressions\b/i.test(apiStripped) &&
    !/\bclicks\b/i.test(apiStripped) &&
    !/google-selected/i.test(apiStripped + panelStripped + helperStripped) &&
    !/lastCrawled|last_crawled|inspectionResult|coverageState/i.test(
      api + panel + helper
    ) &&
    !/indexedStatus|index_status/i.test(api + panel + helper)
);

// R — GET only / read-only
ok(
  "R_api_get_only",
  /req\.method !== ["']GET["']/.test(api) &&
    !/method === ["']POST["']/.test(api) &&
    !/INSERT |UPDATE |DELETE FROM/i.test(api)
);

// S — no extra pool.query for B4 alone (still site + products + blog at most)
const queryCount = (api.match(/pool\.query/g) || []).length;
ok("S_no_extra_pool_query", queryCount <= 3, `queries=${queryCount}`);

// T — permissions unchanged
ok(
  "T_permissions_unchanged",
  /canAccessSeoOverview/.test(perms) &&
    !/"seo\.manage"/.test(perms) &&
    !/"seo\.view"/.test(perms)
);

// U — no public SEO file changes required by this suite (presence intact)
ok(
  "U_public_seo_files_present",
  /generateMetadata/.test(productPage) &&
    /generateMetadata/.test(blogPage) &&
    /sitemap/.test(sitemap) &&
    /Disallow:\s*\/sidhu/.test(robots) &&
    !/buildProductMigrationVerificationItems/.test(productPage)
);

ok(
  "helper_renamed_from_product8",
  /buildProductMigrationVerificationItems/.test(helper) &&
    !/function buildProduct8VerificationItems/.test(helper) &&
    /buildProductMigrationVerificationItems/.test(api)
);

console.log(`\nJSEO-B4 GSC workflow: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
