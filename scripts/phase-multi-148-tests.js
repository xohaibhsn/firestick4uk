/**
 * F4UK-MULTI-148 — hydration-safe seasonal card countdown + London blog dates.
 * No real network/DB.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const Module = require("module");
const { createHash } = require("crypto");
const { spawnSync } = require("child_process");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..");
const BASE = "b5c242535f664dbbfbef5993778b45be98ceeff7";
const NODE = process.execPath;

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

function sha256(s) {
  return createHash("sha256").update(String(s), "utf8").digest("hex");
}

function gitShow(ref, rel) {
  const r = spawnSync("git", ["show", `${ref}:${rel}`], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error(r.stderr || `git show failed: ${ref}:${rel}`);
  return r.stdout;
}

function loadTs(rel, stubs = {}) {
  const abs = path.join(ROOT, rel);
  const src = fs.readFileSync(abs, "utf8");
  const out = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
    },
    fileName: abs,
  }).outputText;
  const m = new Module(abs, module);
  m.filename = abs;
  m.paths = Module._nodeModulePaths(path.dirname(abs));
  const orig = m.require.bind(m);
  m.require = (id) => {
    if (Object.prototype.hasOwnProperty.call(stubs, id)) return stubs[id];
    if (id.startsWith("@/")) {
      const mapped = id.slice(2);
      for (const candidate of [
        path.join(ROOT, mapped + ".ts"),
        path.join(ROOT, mapped + ".tsx"),
        path.join(ROOT, mapped + ".js"),
      ]) {
        if (fs.existsSync(candidate)) {
          return loadTs(path.relative(ROOT, candidate).replace(/\\/g, "/"), stubs);
        }
      }
    }
    return orig(id);
  };
  m._compile(out, abs);
  return m.exports;
}

// ─── formatBlogDate ─────────────────────────────────────────────────────────

function runFormatBlogDate() {
  console.log("\n# formatBlogDate");
  const mod = loadTs("lib/blogDateFormat.ts");
  const fn = mod.formatBlogDate;

  ok("sql_utc_nov", fn("2026-11-01 23:30:00") === "1 November 2026");
  ok("iso_z_bst_july", fn("2026-06-30T23:30:00Z") === "1 July 2026");
  ok(
    "date_object",
    fn(new Date("2026-11-01T12:00:00Z")) === "1 November 2026"
  );
  ok("invalid_empty_string", fn("") === "");
  ok("invalid_null", fn(null) === "");
  ok("invalid_garbage", fn("not-a-date") === "");
  ok("never_throws", (() => {
    try {
      fn(undefined);
      fn({});
      fn([]);
      fn(Symbol("x"));
      return true;
    } catch {
      return false;
    }
  })());

  // Deterministic under TZ=Asia/Karachi and TZ=UTC via child processes
  const helper = path.join(
    process.env.TEMP || "/tmp",
    "f4uk-148-tmp",
    "tz-format-blog-date.js"
  );
  fs.mkdirSync(path.dirname(helper), { recursive: true });
  fs.writeFileSync(
    helper,
    `
const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require(${JSON.stringify(require.resolve("typescript"))});
const ROOT = ${JSON.stringify(ROOT)};
function loadTs(rel) {
  const abs = path.join(ROOT, rel);
  const src = fs.readFileSync(abs, "utf8");
  const out = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    fileName: abs,
  }).outputText;
  const m = new Module(abs, module);
  m.filename = abs;
  m.paths = Module._nodeModulePaths(path.dirname(abs));
  const orig = m.require.bind(m);
  m.require = (id) => {
    if (id.startsWith("@/")) {
      const mapped = id.slice(2);
      for (const candidate of [
        path.join(ROOT, mapped + ".ts"),
        path.join(ROOT, mapped + ".tsx"),
        path.join(ROOT, mapped + ".js"),
      ]) {
        if (fs.existsSync(candidate)) {
          return loadTs(path.relative(ROOT, candidate).replace(/\\\\/g, "/"));
        }
      }
    }
    return orig(id);
  };
  m._compile(out, abs);
  return m.exports;
}
const fn = loadTs("lib/blogDateFormat.ts").formatBlogDate;
const samples = ["2026-11-01 23:30:00", "2026-06-30T23:30:00Z"];
process.stdout.write(JSON.stringify(samples.map((s) => fn(s))));
`,
    "utf8"
  );

  function runTz(tz) {
    const r = spawnSync(NODE, [helper], {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, TZ: tz },
      timeout: 30000,
    });
    if (r.status !== 0) {
      return { ok: false, err: r.stderr || r.stdout || "spawn failed" };
    }
    try {
      return { ok: true, values: JSON.parse(r.stdout) };
    } catch (e) {
      return { ok: false, err: String(e) };
    }
  }

  const karachi = runTz("Asia/Karachi");
  const utc = runTz("UTC");
  ok(
    "tz_child_runs",
    karachi.ok && utc.ok,
    karachi.ok && utc.ok ? "" : `k=${karachi.err} u=${utc.err}`
  );
  ok(
    "tz_deterministic",
    karachi.ok &&
      utc.ok &&
      JSON.stringify(karachi.values) === JSON.stringify(utc.values) &&
      karachi.values[0] === "1 November 2026" &&
      karachi.values[1] === "1 July 2026",
    karachi.ok && utc.ok
      ? `k=${JSON.stringify(karachi.values)} u=${JSON.stringify(utc.values)}`
      : ""
  );
}

// ─── SeasonalCardCountdown source ───────────────────────────────────────────

function runCardSource() {
  console.log("\n# SeasonalCardCountdown source");
  const src = read("components/product/SeasonalCardCountdown.tsx");
  const ticker = read("hooks/useSharedSecondTicker.ts");
  const tickerBase = gitShow(BASE, "hooks/useSharedSecondTicker.ts");

  ok("mounted_gate_useState", /const \[mounted,\s*setMounted\]\s*=\s*useState\(false\)/.test(src));
  ok("mounted_gate_effect", /useEffect\(\s*\(\)\s*=>\s*setMounted\(true\)\s*,\s*\[\s*\]\s*\)/.test(src));
  ok(
    "label_only_when_mounted",
    /!mounted\s*\|\|\s*remainingSec\s*==\s*null/.test(src) ||
      /mounted\s*&&[\s\S]{0,80}formatSeasonalCardCountdown/.test(src)
  );
  ok(
    "remaining_gated_by_mounted",
    /mounted\s*&&\s*live\s*&&\s*endMs\s*!=\s*null/.test(src)
  );
  ok(
    "onEnded_gated",
    /if\s*\(\s*!mounted\s*\|\|\s*!ended\s*\|\|\s*!onEnded/.test(src)
  );
  ok("testid_unchanged", /data-testid="seasonal-card-countdown"/.test(src));
  ok("role_unchanged", /role="timer"/.test(src));
  ok("aria_live_unchanged", /aria-live="off"/.test(src));
  ok("minHeight_unchanged", /minHeight:\s*22/.test(src));
  ok(
    "uses_shared_ticker",
    /useSharedSecondTicker/.test(src) && !/setInterval/.test(src)
  );
  ok(
    "ticker_untouched_hash",
    sha256(ticker) === sha256(tickerBase),
    sha256(ticker).slice(0, 12)
  );
}

// ─── Blog files ─────────────────────────────────────────────────────────────

function runBlogFiles() {
  console.log("\n# Blog date formatting");
  const list = read("app/blog/BlogClient.tsx");
  const post = read("app/blog/[slug]/BlogPostClient.tsx");

  ok("blog_client_imports_formatBlogDate", /from\s+["']@\/lib\/blogDateFormat["']/.test(list));
  ok("blog_post_imports_formatBlogDate", /from\s+["']@\/lib\/blogDateFormat["']/.test(post));
  ok("blog_client_uses_formatBlogDate", /date:\s*formatBlogDate\(p\.created_at\)/.test(list));
  ok(
    "blog_post_uses_formatBlogDate",
    /dateStr\s*=\s*formatBlogDate\(post\?\.created_at\)/.test(post)
  );
  ok(
    "blog_client_no_toLocaleDateString",
    !/toLocaleDateString/.test(list)
  );
  ok(
    "blog_post_no_toLocaleDateString",
    !/toLocaleDateString/.test(post)
  );

  // numstat: only small line-budget changes vs BASE
  const num = spawnSync(
    "git",
    ["diff", "--numstat", BASE, "--", "app/blog/BlogClient.tsx", "app/blog/[slug]/BlogPostClient.tsx"],
    { cwd: ROOT, encoding: "utf8" }
  );
  const lines = (num.stdout || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  let okBudget = lines.length >= 1;
  for (const line of lines) {
    const parts = line.split(/\s+/);
    const add = Number(parts[0]);
    const del = Number(parts[1]);
    // import + replace date block — keep tight
    if (!(add <= 12 && del <= 12)) okBudget = false;
  }
  ok("blog_numstat_small", okBudget, lines.join(" | ") || "no-diff-yet");
}

// ─── ProductDetail (only if changed) ────────────────────────────────────────

function runProductDetailIfChanged() {
  console.log("\n# ProductDetail (optional)");
  const cur = read("app/products/[slug]/ProductDetail.tsx");
  const base = gitShow(BASE, "app/products/[slug]/ProductDetail.tsx");
  if (sha256(cur) === sha256(base)) {
    ok("product_detail_unchanged", true, "no UXA-06 code change");
    return;
  }
  // If changed: only tuck effect/CSS region — hash the rest
  function stripTuck(src) {
    return src
      .replace(
        /\/\/ Tuck sticky ATC[\s\S]*?}, \[displayProduct, canPurchase\]\);/,
        "/*TUCK_EFFECT*/"
      )
      .replace(
        /\.pdp-sticky-atc\.pdp-sticky-atc--tucked\{[^}]*\}/,
        "/*TUCK_CSS*/"
      )
      .replace(
        /@media \(prefers-reduced-motion: reduce\)\{\s*\.pdp-sticky-atc\{transition:none;\}\s*\}/,
        "/*TUCK_MOTION*/"
      );
  }
  ok(
    "product_detail_only_tuck_region",
    sha256(stripTuck(cur)) === sha256(stripTuck(base)),
    "non-tuck regions must match BASE"
  );
}

// ─── no-forbidden-diff ──────────────────────────────────────────────────────

function runDiffAllowlist() {
  console.log("\n# no-forbidden-diff");
  const allowed = new Set([
    "components/product/SeasonalCardCountdown.tsx",
    "app/blog/BlogClient.tsx",
    "app/blog/[slug]/BlogPostClient.tsx",
    "lib/blogDateFormat.ts",
    "app/products/[slug]/ProductDetail.tsx",
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
    "scripts/phase-ux-batch-51-tests.js",
    "scripts/phase-seasonal-ux-72-tests.js",
    "scripts/phase-multi-128-tests.js",
  
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
// F4UK-MULTI-150: product drafts (Draft/Publish D4).
    "lib/contentDrafts.ts",
    "pages/api/admin-drafts.ts",
    "pages/api/admin-products.ts",
    "components/admin/ProductDraftBar.tsx",
    "lib/productDraftClient.ts",
    "app/sidhu/page.tsx",
    "scripts/phase-multi-150-tests.js",
    "docs/design/DRAFT-PUBLISH.md",
    "scripts/phase-multi-116-tests.js",
    "scripts/phase-multi-130-tests.js",
    "scripts/phase-multi-131-tests.js",
    "scripts/phase-multi-132-tests.js",
    "scripts/phase-multi-142-tests.js",
    "scripts/phase-multi-143-tests.js",
    "scripts/phase-multi-145-tests.js",
    "scripts/phase-multi-146-tests.js",
    "scripts/phase-multi-147-tests.js",
    "scripts/phase-multi-148-tests.js",
    "scripts/phase-multi-149-tests.js",
  ]);
  const diff = spawnSync("git", ["diff", "--name-only", `${BASE}..HEAD`], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const unstaged = spawnSync("git", ["diff", "--name-only", BASE], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const status = spawnSync("git", ["status", "--porcelain"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const names = new Set();
  for (const block of [diff.stdout || "", unstaged.stdout || ""]) {
    for (const line of block.split(/\r?\n/)) {
      const t = line.trim().replace(/\\/g, "/");
      if (t) names.add(t);
    }
  }
  for (const line of (status.stdout || "").split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
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

runFormatBlogDate();
runCardSource();
runBlogFiles();
runProductDetailIfChanged();
runDiffAllowlist();
console.log(`\nphase-multi-148: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
