/**
 * F4UK-HOME-REVIEWS-R1-61 — Trustpilot-style (look-alike only) home reviews.
 * Mocked data only. No network. No fabricated production seeds.
 */
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const { execSync } = require("child_process");

const ROOT = process.cwd();

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

let passed = 0;
let failed = 0;
function ok(id, cond, detail = "") {
  if (cond) {
    passed += 1;
    console.log(`PASS  ${id}${detail ? " — " + detail : ""}`);
  } else {
    failed += 1;
    console.error(`FAIL  ${id}${detail ? " — " + detail : ""}`);
  }
}

function loadTsModule(rel) {
  const src = read(rel);
  const { outputText } = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: rel,
  });
  const fakeModule = { exports: {} };
  const dirname = path.join(ROOT, path.dirname(rel));
  const filename = path.join(ROOT, rel);
  const fn = new Function(
    "require",
    "module",
    "exports",
    "__dirname",
    "__filename",
    outputText
  );
  fn(require, fakeModule, fakeModule.exports, dirname, filename);
  return fakeModule.exports;
}

function loadHelper() {
  const {
    parseHomeTestimonialRating,
    isHomeTestimonialApproved,
    isHomeTestimonialHidden,
    getPublishableHomeTestimonials,
    computeHomeTestimonialsSummary,
    shouldShowHomeTestimonialsSummary,
    parseShowSummaryToggle,
    parseMinReviewsForSummary,
    getHomeTestimonialsTitle,
    getHomeTestimonialsSubtitle,
    homeTestimonialInitials,
    HOME_TESTIMONIALS_DEFAULTS,
  } = loadTsModule("lib/homeTestimonials.ts");

  const xssPayload = '<img src=x onerror=alert(1)><script>alert(1)</script>';
  const oldShape = getPublishableHomeTestimonials([
    { name: "Alex", text: "Great service", approved: true, rating: 5, date: "2024-01-02", service: "Firestick" },
  ]);
  const mixed = getPublishableHomeTestimonials([
    { name: "Hidden", text: "Nope", approved: true, hidden: true, rating: 5 },
    { name: "", text: "blank name", approved: true, rating: 4 },
    { name: "Blank text", text: "  ", approved: true, rating: 4 },
    { name: "Unapproved", text: "Skip", approved: false, rating: 5 },
    { name: "Perm", text: "Via permission", permission: true, rating: 3, date: "2024-06-01" },
    { name: "Pinned", text: "First", approved: true, pinned: true, rating: 5, date: "2023-01-01", order: 9 },
    { name: "Ordered", text: "Second", approved: true, order: 1, rating: 4, date: "2024-01-01" },
    { name: "Dated", text: "Third", approved: true, rating: 2, date: "2024-12-01" },
    { name: "XSS", text: xssPayload, approved: true, rating: 1, verifiedOrderId: "ORD-1", sourceLabel: "Email" },
    { name: "NoStars", text: "No rating shown", approved: true },
    { name: "NoBadge", text: "No verified id", approved: true, rating: 5, verifiedOrderId: "" },
  ]);

  return {
    ratingNulls: [
      parseHomeTestimonialRating(undefined),
      parseHomeTestimonialRating(null),
      parseHomeTestimonialRating(""),
      parseHomeTestimonialRating(0),
      parseHomeTestimonialRating(6),
      parseHomeTestimonialRating("nope"),
    ],
    ratingOk: [
      parseHomeTestimonialRating(5),
      parseHomeTestimonialRating("4"),
      parseHomeTestimonialRating(3.9),
    ],
    approved: [
      isHomeTestimonialApproved({ approved: true }),
      isHomeTestimonialApproved({ permission: true }),
      isHomeTestimonialApproved({ approved: false }),
    ],
    hidden: isHomeTestimonialHidden({ hidden: true }),
    oldLen: oldShape.length,
    oldName: oldShape[0]?.name,
    mixedNames: mixed.map((m) => m.name),
    mixedRatings: mixed.map((m) => m.rating),
    verified: mixed.filter((m) => m.verifiedOrderId).map((m) => m.name),
    xssText: mixed.find((m) => m.name === "XSS")?.text,
    summaryOn: shouldShowHomeTestimonialsSummary(
      { showSummary: true, minReviewsForSummary: 3 },
      mixed
    ),
    summaryOff: shouldShowHomeTestimonialsSummary(
      { showSummary: false, minReviewsForSummary: 3 },
      mixed
    ),
    summaryLow: shouldShowHomeTestimonialsSummary(
      { showSummary: true, minReviewsForSummary: 99 },
      mixed
    ),
    summaryDefault: shouldShowHomeTestimonialsSummary({}, mixed),
    stats: computeHomeTestimonialsSummary(mixed),
    showToggleDefault: parseShowSummaryToggle({}),
    minDefault: parseMinReviewsForSummary({}),
    titleDefault: getHomeTestimonialsTitle({}),
    subtitleDefault: getHomeTestimonialsSubtitle({}),
    initials: homeTestimonialInitials("Jane Doe"),
    defaults: HOME_TESTIMONIALS_DEFAULTS,
    longClamp: getPublishableHomeTestimonials([
      { name: "A".repeat(200), text: "B".repeat(3000), approved: true },
    ])[0],
  };
}

function sha256File(rel) {
  const crypto = require("crypto");
  const buf = fs.readFileSync(path.join(ROOT, rel));
  return crypto.createHash("sha256").update(buf).digest("hex");
}

(async () => {
  const home = read("app/HomeClient.tsx");
  const helperSrc = read("lib/homeTestimonials.ts");
  const sidhu = read("app/sidhu/page.tsx");
  const seed = read("lib/siteContentSeed.ts");
  const layout = read("app/layout.tsx");
  const page = read("app/page.tsx");

  // ——— Source contracts ———
  ok("src_no_trustpilot", !/Trustpilot/i.test(home + helperSrc + sidhu), "no Trustpilot string");
  ok(
    "src_no_jsonld_review",
    !/AggregateRating/.test(home + helperSrc) &&
      !/"@type"\s*:\s*"Review"/.test(home + helperSrc) &&
      !/application\/ld\+json/.test(home),
    "no Review/AggregateRating JSON-LD"
  );
  ok(
    "src_no_dangerously_set",
    !/dangerouslySetInnerHTML/.test(
      home.match(/aria-labelledby="home-reviews-heading"[\s\S]*?Share Your Experience[\s\S]*?<\/section>/)?.[0] ||
        "dangerouslySetInnerHTML"
    ),
    "reviews use React text"
  );
  ok("src_empty_invite", /Genuine customer reviews will be featured here with permission/.test(home), "empty invite intact");
  ok("src_empty_cta", /Share Your Experience/.test(home) && /href="\/contact"/.test(home), "empty CTA");
  ok("src_default_empty_items", /home_testimonials:\s*\{\s*title:\s*"What Our Customers Say",\s*items:\s*\[\s*\]\s*\}/.test(home), "client default empty");
  ok(
    "src_seed_empty",
    /"home_testimonials",\s*\n\s*'\{"title":"What Our Customers Say","items":\[\]\}'/.test(seed),
    "seed empty items"
  );
  ok("src_no_demo_names", !/John Smith/.test(home + seed) && !/Sarah Jones/.test(home + seed), "no demo names");
  ok("src_verified_order_label", /Verified order/.test(home), "verified order badge label");
  ok("src_no_verified_purchase", !/Verified Purchase/.test(home), "no Verified Purchase");
  ok("src_carousel_a11y", /aria-label="Customer reviews"/.test(home) && /aria-roledescription="carousel"/.test(home), "carousel a11y");
  ok("src_keyboard", /ArrowRight/.test(home) && /ArrowLeft/.test(home), "keyboard scroll");
  ok("src_read_more", /Read more/.test(home) && /aria-expanded/.test(home), "read more a11y");
  ok("src_initials_avatar", /homeTestimonialInitials/.test(home) && /review-avatar/.test(home), "initials avatar");
  ok("src_scroll_snap", /scroll-snap-type:\s*x\s+mandatory/.test(home), "mobile scroll-snap");
  ok("src_summary_copy", /Based on \{reviewsSummary\.ratedCount\} reviews shown here/.test(home), "summary copy");
  ok("src_cms_fields", /showSummary/.test(sidhu) && /minReviewsForSummary/.test(sidhu) && /verifiedOrderId/.test(sidhu) && /sourceLabel/.test(sidhu) && /pinned/.test(sidhu) && /hidden/.test(sidhu), "CMS new fields");
  ok("src_cms_approval", /Customer permission granted — publish on homepage/.test(sidhu) && /approved:false/.test(sidhu), "approval gate intact");
  ok("src_helper_exports", /shouldShowHomeTestimonialsSummary/.test(helperSrc) && /computeHomeTestimonialsSummary/.test(helperSrc), "helper summary APIs");

  // SEO shell files untouched by this change set (static presence + H1/title paths)
  ok("seo_layout_present", /export default async function RootLayout/.test(layout), "layout intact");
  ok("seo_page_h1_path", /home_top_hero_title|Best Firestick Service in UK/.test(page), "page H1 path intact");
  ok("seo_home_h1_client", /home-seo-hero|topHeroTitle/.test(home), "HomeClient H1 path intact");

  // Static check: layout / page meta files byte-stable vs HEAD when only allowlisted edits exist
  try {
    const dirty = execSync("git diff --name-only HEAD", { cwd: ROOT, encoding: "utf8" })
      .split(/\r?\n/)
      .map((s) => s.trim().replace(/\\/g, "/"))
      .filter(Boolean);
    const untracked = execSync("git ls-files --others --exclude-standard", {
      cwd: ROOT,
      encoding: "utf8",
    })
      .split(/\r?\n/)
      .map((s) => s.trim().replace(/\\/g, "/"))
      .filter(Boolean);
    const touched = [...new Set([...dirty, ...untracked])];
    const allow = (f) =>
      f === "app/HomeClient.tsx" ||
      f === "lib/homeTestimonials.ts" ||
      f === "app/sidhu/page.tsx" ||
      f === "scripts/phase-home-reviews-61-tests.js" ||
      f === "scripts/phase-home-testimonials-foundation-tests.js" ||
      f === "scripts/phase19b-content-integrity-tests.js" ||
      f === "scripts/phase-windup-59-tests.js" ||
      f === "scripts/phase-ux-batch-51-tests.js" ||
      f === "scripts/phase-ux-fix-53-tests.js" ||
      f === "scripts/phase-cod-restore-54-tests.js" ||
      f === "scripts/phase-sidhu-insights-57-tests.js" ||
      f === "scripts/phase19b-content-integrity-tests.js" ||
      // F4UK-W4-INSIGHTS-LIVE-63
      f === "components/TrackingConsent.tsx" ||
      f === "lib/trackingConsent.ts" ||
            f === "lib/insightsClient.ts" ||
      f === "components/SidhuInsightsBeacon.tsx" ||
      f === "components/sidhu/insights/SettingsScreen.tsx" ||
      f === "scripts/phase-city-cleanup-64-tests.js" ||
f === "scripts/phase-insights-live-63-tests.js" ||
      f === "scripts/phase20g3b-tracking-consent-tests.js" ||
      f === "scripts/phase-clarity-35-tests.js" ||
      f === "scripts/phase-tracking-consent-final-tests.js" ||
      // F4UK-PAY-CMS-66
      f === "lib/paymentMethodSettings.ts" ||
      f === "lib/paymentMethodSettingsServer.ts" ||
      f === "lib/siteContentDefaults.ts" ||
      f === "pages/api/orders.ts" ||
      f === "app/cart/page.tsx" ||
      f === "scripts/phase-pay-cms-66-tests.js" ||
      f === "REPO_AUDIT_REPORT.md" ||
      // F4UK-INSIGHTS-SLIM-67
      ["lib/insightsIngest.ts", "lib/insightsGeo.ts", "pages/api/insights-collect.ts", "package.json", "package-lock.json", "scripts/phase-sidhu-insights-56-tests.js", "scripts/phase-insights-w2-60-tests.js", "scripts/phase-insights-slim-67-tests.js"].includes(f) ||
      f.startsWith("pages/api/admin-insights/") ||
      f.startsWith("components/sidhu/insights/") ||
      // F4UK-BLACK-FRIDAY-68
      [
        "components/product/SeasonalCountdown.tsx",
        "components/home/SeasonalHomePromoStrip.tsx",
        "components/Footer.tsx",
        "lib/seasonalCountdownLabel.ts",
        "lib/seasonalPriceValidUntil.ts",
        "lib/adminContentFields.ts",
        "app/page.tsx",
        "app/HomeClient.tsx",
        "app/seasonal-offers/page.tsx",
        "app/products/[slug]/page.tsx",
        "app/products/[slug]/ProductDetail.tsx",
        "scripts/phase-black-friday-68-tests.js",
        "scripts/phase-insights-live-63-tests.js",
        "scripts/phase-city-cleanup-64-tests.js",
        "scripts/phase-cod-restore-54-tests.js",
        "scripts/phase-ux-batch-51-tests.js",
        "scripts/phase-ux-fix-53-tests.js",
      ].includes(f);
    const unexpected = touched.filter((f) => !allow(f));
    // BF-68 may edit app/page.tsx (promo) + Footer (seasonal link); layout/Navbar/sitemap/robots stay frozen.
    const seoTouched = touched.filter((f) =>
      /^(app\/layout\.tsx|.*sitemap|.*robots|components\/Navbar)/i.test(f)
    );
    ok("allowlist_working_tree", unexpected.length === 0, unexpected.join(",") || "clean");
    ok("seo_shell_untouched", seoTouched.length === 0, seoTouched.join(",") || "clean");
  } catch (e) {
    ok("allowlist_working_tree", false, String(e.message || e));
    ok("seo_shell_untouched", false, "git check failed");
  }

  let h;
  try {
    h = loadHelper();
  } catch (e) {
    ok("helper_load", false, String(e.message || e));
    console.log(`\nHOME-REVIEWS-61: ${passed} passed, ${failed} failed`);
    process.exit(1);
  }
  ok("helper_load", true);

  ok(
    "rating_validation",
    h.ratingNulls.every((v) => v === null) &&
      h.ratingOk[0] === 5 &&
      h.ratingOk[1] === 4 &&
      h.ratingOk[2] === 3,
    "1-5 or null"
  );
  ok("approval_gate", h.approved[0] === true && h.approved[1] === true && h.approved[2] === false);
  ok("hidden_flag", h.hidden === true);
  ok("compat_old_shape", h.oldLen === 1 && h.oldName === "Alex", "old item shape publishable");
  ok(
    "filter_publishable",
    JSON.stringify(h.mixedNames) ===
      JSON.stringify(["Pinned", "Ordered", "Dated", "Perm", "XSS", "NoStars", "NoBadge"]),
    h.mixedNames.join(",")
  );
  ok("sort_pinned_order_date", h.mixedNames[0] === "Pinned" && h.mixedNames[1] === "Ordered", "pinned then order");
  ok("verified_only_with_id", JSON.stringify(h.verified) === JSON.stringify(["XSS"]), h.verified.join(","));
  ok(
    "xss_inert_text",
    h.xssText === '<img src=x onerror=alert(1)><script>alert(1)</script>',
    "payload kept as text (React-escaped at render)"
  );
  ok("summary_toggle_default_off", h.showToggleDefault === false && h.summaryDefault === false);
  ok("summary_threshold_default_3", h.minDefault === 3);
  ok("summary_on_when_enough", h.summaryOn === true);
  ok("summary_off_toggle", h.summaryOff === false);
  ok("summary_below_threshold", h.summaryLow === false);
  ok(
    "summary_maths",
    h.stats &&
      h.stats.ratedCount === 6 &&
      Math.abs(h.stats.average - (5 + 4 + 2 + 1 + 5 + 3) / 6) < 0.05,
    JSON.stringify(h.stats)
  );
  ok("title_default", h.titleDefault === "What Our Customers Say");
  ok("subtitle_default", h.subtitleDefault === "Your feedback helps us improve our service.");
  ok("initials", h.initials === "JD");
  ok(
    "clamp_lengths",
    h.longClamp &&
      h.longClamp.name.length === h.defaults.maxName &&
      h.longClamp.text.length === h.defaults.maxText,
    "name/text clamped"
  );

  // Layout SHA stable vs HEAD. app/page.tsx may change for BF-68 promo strip (H1/meta paths still asserted above).
  ok("layout_sha_stable_vs_head", (() => {
    try {
      const out = execSync("git diff --name-only HEAD -- app/layout.tsx", {
        cwd: ROOT,
        encoding: "utf8",
      }).trim();
      return out.length === 0;
    } catch {
      return false;
    }
  })());

  console.log(`\nHOME-REVIEWS-61: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
