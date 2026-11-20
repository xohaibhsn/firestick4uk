/**
 * F4UK-MULTI-138 — VT-STABILITY-1: stable reads, text persistence, diffs.
 * Mocked only; no network / no real DB.
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const TOOLS = path.join(ROOT, "scripts", "tools");

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

const { readUntilStable } = require(path.join(TOOLS, "visible-text-stable.js"));
const { compare } = require(path.join(TOOLS, "visible-text-compare.js"));
const {
  normalizeVisibleText,
  NORMALIZE_VISIBLE_TEXT_SOURCE,
} = require(path.join(TOOLS, "visible-text-normalize.js"));

// --- readUntilStable ---
(async () => {
  const sleeps = [];
  const sleep = async (ms) => {
    sleeps.push(ms);
  };

  {
    let n = 0;
    const r = await readUntilStable(
      async () => {
        n++;
        return { hash: "aaa", len: 10, text: "x" };
      },
      { maxReads: 6, intervalMs: 1500, sleep }
    );
    ok("stable_first_two_equal", r.stable === true && r.reads === 2 && r.distinctHashes === 1);
    ok("stable_first_two_sleep_once", sleeps.length === 1 && sleeps[0] === 1500);
  }

  {
    const sleeps2 = [];
    let n = 0;
    const hashes = ["h1", "h2", "h2"];
    const r = await readUntilStable(
      async () => {
        const hash = hashes[Math.min(n, hashes.length - 1)];
        n++;
        return { hash, len: 10, text: hash };
      },
      {
        maxReads: 6,
        intervalMs: 100,
        sleep: async (ms) => {
          sleeps2.push(ms);
        },
      }
    );
    ok(
      "stable_after_flip",
      r.stable === true && r.reads === 3 && r.distinctHashes === 2 && r.final.hash === "h2",
      `reads=${r.reads} distinct=${r.distinctHashes}`
    );
  }

  {
    let n = 0;
    const r = await readUntilStable(
      async () => {
        n++;
        return { hash: "h" + n, len: 10, text: "t" + n };
      },
      { maxReads: 4, intervalMs: 50, sleep: async () => {} }
    );
    ok(
      "unstable_after_maxReads",
      r.stable === false && r.reads === 4 && r.distinctHashes === 4,
      `reads=${r.reads} distinct=${r.distinctHashes}`
    );
  }

  // --- compare + diffs ---
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "f4uk-vt-138-"));
    const textsA = path.join(tmp, "visible-text-a.texts");
    const textsB = path.join(tmp, "visible-text-b.texts");
    fs.mkdirSync(textsA);
    fs.mkdirSync(textsB);
    fs.writeFileSync(path.join(textsA, "home.txt"), "line1\nline2\n", "utf8");
    fs.writeFileSync(path.join(textsB, "home.txt"), "line1\nline2\n", "utf8");
    fs.writeFileSync(path.join(textsA, "cart.txt"), "alpha\nbeta\n", "utf8");
    fs.writeFileSync(path.join(textsB, "cart.txt"), "alpha\ngamma\n", "utf8");

    const fileA = path.join(tmp, "visible-text-a.json");
    const fileB = path.join(tmp, "visible-text-b.json");
    const capA = {
      capturedAt: "2026-11-19T00:00:00.000Z",
      textsDir: "visible-text-a.texts",
      pages: [
        { key: "home", hash: "aaa", len: 12, textFile: "visible-text-a.texts/home.txt" },
        { key: "cart", hash: "bbb", len: 11, textFile: "visible-text-a.texts/cart.txt" },
      ],
    };
    const capB = {
      capturedAt: "2026-11-19T00:01:00.000Z",
      textsDir: "visible-text-b.texts",
      pages: [
        { key: "home", hash: "aaa", len: 12, textFile: "visible-text-b.texts/home.txt" },
        { key: "cart", hash: "ccc", len: 12, textFile: "visible-text-b.texts/cart.txt" },
      ],
    };
    fs.writeFileSync(fileA, JSON.stringify(capA) + "\n", "utf8");
    fs.writeFileSync(fileB, JSON.stringify(capB) + "\n", "utf8");

    // compare() used as library — attach __file like CLI loadCapture
    capA.__file = fileA;
    capB.__file = fileB;
    const r = compare(capA, capB);
    ok("compare_allMatch_false", r.allMatch === false && r.matchCount === 1 && r.total === 2);
    const home = r.rows.find((x) => x.key === "home");
    const cart = r.rows.find((x) => x.key === "cart");
    ok("compare_diff_only_on_mismatch", !home.diff && !!cart.diff);
    ok(
      "compare_diff_has_positional",
      cart.diff &&
        !cart.diff.textUnavailable &&
        Array.isArray(cart.diff.positional) &&
        cart.diff.positional.some((p) => p.a === "beta" && p.b === "gamma")
    );

    const oldA = {
      capturedAt: "x",
      __file: path.join(tmp, "old-a.json"),
      pages: [{ key: "home", hash: "aaa", len: 1 }],
    };
    const oldB = {
      capturedAt: "y",
      __file: path.join(tmp, "old-b.json"),
      pages: [{ key: "home", hash: "zzz", len: 2 }],
    };
    const oldR = compare(oldA, oldB);
    ok(
      "compare_old_capture_text_unavailable",
      oldR.rows[0].diff &&
        oldR.rows[0].diff.textUnavailable === true &&
        oldR.rows[0].diff.message === "text unavailable"
    );

    // CLI exit codes
    const outJson = path.join(tmp, "cmp-out.json");
    const cli = spawnSync(
      process.execPath,
      [
        path.join(TOOLS, "visible-text-compare.js"),
        "--a",
        fileA,
        "--b",
        fileB,
        "--out",
        outJson,
      ],
      { encoding: "utf8" }
    );
    ok("compare_cli_exit_1_on_mismatch", cli.status === 1, `status=${cli.status}`);
    ok("compare_cli_wrote_json", fs.existsSync(outJson));
    ok(
      "compare_cli_wrote_diff_txt",
      fs.existsSync(outJson.replace(/\.json$/i, "") + ".diff.txt")
    );

    const sameOut = path.join(tmp, "cmp-same.json");
    const sameB = JSON.parse(JSON.stringify(capA));
    sameB.capturedAt = "z";
    sameB.__file = path.join(tmp, "visible-text-same-b.json");
    sameB.textsDir = "visible-text-a.texts";
    sameB.pages = sameB.pages.map((p) => ({
      ...p,
      textFile: p.textFile.replace("visible-text-a.texts", "visible-text-a.texts"),
    }));
    fs.writeFileSync(sameB.__file, JSON.stringify(sameB) + "\n", "utf8");
    const cliSame = spawnSync(
      process.execPath,
      [
        path.join(TOOLS, "visible-text-compare.js"),
        "--a",
        fileA,
        "--b",
        sameB.__file,
        "--out",
        sameOut,
      ],
      { encoding: "utf8" }
    );
    ok("compare_cli_exit_0_on_allMatch", cliSame.status === 0, `status=${cliSame.status}`);

    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }

  // --- capture source assertions ---
  {
    const src = fs.readFileSync(path.join(TOOLS, "visible-text-capture.js"), "utf8");
    ok(
      "capture_networkidle_best_effort",
      /waitForLoadState\(\s*["']networkidle["']/.test(src) &&
        /timeout:\s*20000/.test(src) &&
        /\.catch\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/.test(src)
    );
    ok("capture_fonts_ready", /document\.fonts\.ready/.test(src));
    ok("capture_uses_readUntilStable", /readUntilStable\s*\(/.test(src));
    ok(
      "capture_texts_never_overwrite",
      /REFUSE overwrite existing file:/.test(src) &&
        /textsDir/.test(src) &&
        /process\.exit\(3\)/.test(src)
    );
    ok(
      "capture_exit3_string_present",
      /process\.exit\(3\)/.test(src) && /REFUSE overwrite/.test(src)
    );
    ok(
      "capture_exit2_string_present",
      /process\.exit\(2\)/.test(src) && /playwright-core not found/.test(src)
    );
    ok(
      "capture_len_lt_150_failure",
      /len\s*<\s*150/.test(src) && /too_short/.test(src)
    );
    ok(
      "capture_3_attempt_retry",
      /attempt\s*<=\s*3/.test(src) || /attempt = 1; attempt <= 3/.test(src)
    );
  }

  // --- normaliser: previous cases + injection ---
  {
    const countdownLong =
      "Offer Ends in 14 days 9 hours 42 minutes 10 seconds more";
    const n1 = normalizeVisibleText(countdownLong);
    ok(
      "norm_countdown_long_phrase",
      /Offer Ends in # days # hours # minutes # seconds/.test(n1)
    );
    const compact = "⏳ Ends in 14d 09:42:40";
    ok("norm_countdown_compact", /Ends in #d #:#:#/.test(normalizeVisibleText(compact)));
    const hmsOnly = "Starts in 03:12:45";
    ok("norm_countdown_hms", /Starts in #:#:#/.test(normalizeVisibleText(hmsOnly)));
    const productPrice = "Firestick 4K £49.99 Black Friday £78.00 checkout";
    const n4 = normalizeVisibleText(productPrice);
    ok("norm_product_prices_untouched", n4.includes("£49.99") && n4.includes("£78.00"));
    const mc =
      "[[MC]]Cart £49.99 subtotal £49.99[[/MC]]\nBody price £78.00 stays";
    const n5 = normalizeVisibleText(mc);
    ok(
      "norm_mini_cart_money_only_inside_MC",
      n5.includes("£#.##") && n5.includes("£78.00")
    );
    const rel = "Posted 3 days ago and yesterday and today and tomorrow";
    const n6 = normalizeVisibleText(rel);
    ok(
      "norm_relative_dates",
      n6.includes("# days ago") && (n6.match(/#rel/g) || []).length === 3
    );

    // eslint-disable-next-line no-new-func
    const injected = new Function(
      "return (" + NORMALIZE_VISIBLE_TEXT_SOURCE + ")"
    )();
    const sample =
      "Ends in 2d 01:02:03 [[MC]]£12.00[[/MC]] body £99.00 5 minutes ago today";
    ok(
      "norm_injected_copy_identical",
      typeof injected === "function" &&
        injected(sample) === normalizeVisibleText(sample)
    );
  }

  // --- no-forbidden-diff ---
  {
    const diff = spawnSync(
      "git",
      ["diff", "--name-only", "30740f04cb7b3db893f6062e1c3df7e8feb7e421..HEAD"],
      { cwd: ROOT, encoding: "utf8" }
    );
    // Uncommitted: also check working tree vs base
    const unstaged = spawnSync(
      "git",
      ["diff", "--name-only", "30740f04cb7b3db893f6062e1c3df7e8feb7e421"],
      { cwd: ROOT, encoding: "utf8" }
    );
    const status = spawnSync("git", ["status", "--porcelain"], {
      cwd: ROOT,
      encoding: "utf8",
    });
    const allowed = new Set([
      "scripts/tools/visible-text-capture.js",
      "scripts/tools/visible-text-normalize.js",
      "scripts/tools/visible-text-compare.js",
      "scripts/tools/visible-text-stable.js",
      "scripts/phase-multi-138-tests.js",
      "scripts/phase-multi-112-tests.js",
      // F4UK-MULTI-139: atomic staff password + SEO reconcile lock (+ plumbing).
      "lib/adminStaffPasswordTx.ts",
      "lib/namedLock.ts",
      "pages/api/admin-profile.ts",
      "pages/api/admin-staff-password.ts",
      "lib/seoIssueMemoryServer.ts",
      "pages/api/admin-seo-issues/reconcile.ts",
      "scripts/phase-multi-139-tests.js",
      "scripts/phase-multi-116-tests.js",
      "scripts/phase-multi-130-tests.js",
      "scripts/phase-multi-131-tests.js",
      "scripts/phase-multi-132-tests.js",
      "scripts/phase-multi-133-tests.js",
      "scripts/phase-multi-135-tests.js",
      "scripts/phase-multi-136-tests.js",
      "scripts/phase-multi-137-tests.js",
      // F4UK-MULTI-140: content_drafts check-only migrate + Draft/Publish design doc.
      "scripts/migrate-content-drafts.js",
      "scripts/phase-multi-140-tests.js",
      "docs/design/DRAFT-PUBLISH.md",
      // F4UK-MULTI-142: admin drafts API for CMS pages (Draft/Publish D2).
      "pages/api/admin-drafts.ts",
      "lib/contentDrafts.ts",
      "lib/contentDraftsCapability.ts",
      "scripts/phase-multi-142-tests.js",
      // F4UK-MULTI-143: Draft/Publish D3 admin UI (CmsDraftBar + client helper).
      "components/admin/CmsDraftBar.tsx",
      "lib/contentDraftClient.ts",
      "app/sidhu/page.tsx",
      "scripts/phase-multi-143-tests.js",
      // F4UK-MULTI-144: health-check network retry + capture waits for CMS load.
      "scripts/live-health-check.js",
      "scripts/tools/visible-text-capture.js",
      "scripts/phase-multi-144-tests.js",
      "scripts/phase-multi-135-tests.js",
      // F4UK-MULTI-145: health 429 warn, draft base keep, atomic staff login session.
      "lib/contentDraftClient.ts",
      "components/admin/CmsDraftBar.tsx",
      "lib/adminStaffPasswordTx.ts",
      "pages/api/admin-login.ts",
      "scripts/phase-multi-145-tests.js",
      "scripts/phase-multi-139-tests.js",
      "scripts/phase-multi-116-tests.js",
      "scripts/phase-multi-131-tests.js",
      "scripts/phase-multi-132-tests.js",
      "scripts/phase-multi-133-tests.js",
      "scripts/phase-multi-136-tests.js",
      "scripts/phase-multi-140-tests.js",
      "scripts/phase-multi-142-tests.js",
      "scripts/phase-multi-143-tests.js",
      "scripts/phase-multi-144-tests.js",
      "scripts/phase-multi-130-tests.js",
      "scripts/phase-multi-135-tests.js",
      "scripts/phase-multi-137-tests.js",

    // F4UK-MULTI-146: /products H1 no duplicate + checkout optional-field tags.
    "app/products/ProductsClient.tsx",
    "lib/productsPageTitle.ts",
    "app/cart/page.tsx",
    "lib/adminContentFields.ts",
    "scripts/phase-multi-146-tests.js",
    "scripts/phase-multi-116-tests.js",
    "scripts/phase-multi-130-tests.js",
    "scripts/phase-multi-131-tests.js",
    "scripts/phase-multi-132-tests.js",
    "scripts/phase-multi-133-tests.js",
    "scripts/phase-multi-135-tests.js",
    "scripts/phase-multi-136-tests.js",
    "scripts/phase-multi-137-tests.js",
    "scripts/phase-multi-138-tests.js",
    "scripts/phase-multi-139-tests.js",
    "scripts/phase-multi-140-tests.js",
    "scripts/phase-multi-142-tests.js",
    "scripts/phase-multi-143-tests.js",
    "scripts/phase-multi-144-tests.js",
    "scripts/phase-multi-145-tests.js",

    // F4UK-MULTI-147: optional-tag dedupe, contact phone hint, PDP sticky ATC tuck.
    "lib/optionalLabel.ts",
    "app/cart/page.tsx",
    "app/contact/page.tsx",
    "app/products/[slug]/ProductDetail.tsx",
    "scripts/phase-multi-147-tests.js",
    "scripts/phase-multi-116-tests.js",
    "scripts/phase-multi-130-tests.js",
    "scripts/phase-multi-131-tests.js",
    "scripts/phase-multi-132-tests.js",
    "scripts/phase-multi-133-tests.js",
    "scripts/phase-multi-135-tests.js",
    "scripts/phase-multi-136-tests.js",
    "scripts/phase-multi-137-tests.js",
    "scripts/phase-multi-138-tests.js",
    "scripts/phase-multi-139-tests.js",
    "scripts/phase-multi-140-tests.js",
    "scripts/phase-multi-142-tests.js",
    "scripts/phase-multi-143-tests.js",
    "scripts/phase-multi-144-tests.js",
    "scripts/phase-multi-145-tests.js",
    "scripts/phase-multi-146-tests.js",

    // F4UK-MULTI-148: hydration-safe seasonal card countdown + London blog dates.
    "components/product/SeasonalCardCountdown.tsx",
    "app/blog/BlogClient.tsx",
    "app/blog/[slug]/BlogPostClient.tsx",
    "lib/blogDateFormat.ts",
    "scripts/phase-multi-148-tests.js",
    "scripts/phase-multi-116-tests.js",
    "scripts/phase-multi-130-tests.js",
    "scripts/phase-multi-131-tests.js",
    "scripts/phase-multi-132-tests.js",
    "scripts/phase-multi-133-tests.js",
    "scripts/phase-multi-135-tests.js",
    "scripts/phase-multi-136-tests.js",
    "scripts/phase-multi-137-tests.js",
    "scripts/phase-multi-138-tests.js",
    "scripts/phase-multi-139-tests.js",
    "scripts/phase-multi-140-tests.js",
    "scripts/phase-multi-142-tests.js",
    "scripts/phase-multi-143-tests.js",
    "scripts/phase-multi-144-tests.js",
    "scripts/phase-multi-145-tests.js",
    "scripts/phase-multi-146-tests.js",
    "scripts/phase-multi-147-tests.js",

    // F4UK-MULTI-149: compact mobile consent banner (presentation only).
    "components/TrackingConsent.tsx",
    "scripts/phase-multi-149-tests.js",
    "scripts/phase-multi-116-tests.js",
    "scripts/phase-multi-130-tests.js",
    "scripts/phase-multi-131-tests.js",
    "scripts/phase-multi-132-tests.js",
    "scripts/phase-multi-133-tests.js",
    "scripts/phase-multi-135-tests.js",
    "scripts/phase-multi-136-tests.js",
    "scripts/phase-multi-137-tests.js",
    "scripts/phase-multi-138-tests.js",
    "scripts/phase-multi-139-tests.js",
    "scripts/phase-multi-140-tests.js",
    "scripts/phase-multi-142-tests.js",
    "scripts/phase-multi-143-tests.js",
    "scripts/phase-multi-144-tests.js",
    "scripts/phase-multi-145-tests.js",
    "scripts/phase-multi-146-tests.js",
    "scripts/phase-multi-147-tests.js",
    "scripts/phase-multi-148-tests.js",
]);
    const names = new Set();
    for (const block of [diff.stdout || "", unstaged.stdout || ""]) {
      for (const line of block.split(/\r?\n/)) {
        const t = line.trim();
        if (t) names.add(t.replace(/\\/g, "/"));
      }
    }
    for (const line of (status.stdout || "").split(/\r?\n/)) {
      const t = line.trim();
      if (!t) continue;
      // porcelain: XY path
      const m = t.match(/^\?\?\s+(.+)$/) || t.match(/^[ MADRCU?]{1,2}\s+(.+)$/);
      if (m) names.add(m[1].replace(/\\/g, "/"));
    }
    const bad = [...names].filter((f) => !allowed.has(f));
    ok(
      "no_forbidden_diff",
      bad.length === 0,
      bad.length ? bad.join(",") : [...names].join(",") || "(clean-or-approved)"
    );
  }

  console.log(`\nphase-multi-138: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
