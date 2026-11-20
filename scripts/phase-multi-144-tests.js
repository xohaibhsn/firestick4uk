/**
 * F4UK-MULTI-144 — HEALTH-RETRY-1 + VT-STABILITY-2 (tooling only; no network).
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const NODE = process.execPath;
const BASE_SHA = "a44104461cfad8996991b4727610e91551da219c";

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

const healthPath = path.join(ROOT, "scripts", "live-health-check.js");
const capturePath = path.join(
  ROOT,
  "scripts",
  "tools",
  "visible-text-capture.js"
);
const healthSrc = fs.readFileSync(healthPath, "utf8");
const captureSrc = fs.readFileSync(capturePath, "utf8");

const {
  isTransientNetworkError,
  politeFetch,
  getNetworkRetryCount,
  resetNetworkRetryCount,
  setSleepForTests,
  RETRY_BACKOFF_MS,
} = require(healthPath);

// ─── isTransientNetworkError ───────────────────────────────────────────────
{
  const codes = [
    "UND_ERR_CONNECT_TIMEOUT",
    "UND_ERR_HEADERS_TIMEOUT",
    "UND_ERR_SOCKET",
    "ECONNRESET",
    "ETIMEDOUT",
    "EAI_AGAIN",
    "ECONNREFUSED",
  ];
  for (const code of codes) {
    ok(
      `transient_cause_${code}`,
      isTransientNetworkError({
        name: "TypeError",
        message: "fetch failed",
        cause: { code },
      })
    );
  }
  ok(
    "transient_typeerror_fetch_failed",
    isTransientNetworkError({ name: "TypeError", message: "fetch failed" })
  );
  ok(
    "transient_aborterror",
    isTransientNetworkError({ name: "AbortError", message: "aborted" })
  );
  ok(
    "transient_timeouterror",
    isTransientNetworkError({ name: "TimeoutError", message: "timeout" })
  );
  ok(
    "not_transient_http_like",
    !isTransientNetworkError({
      name: "Error",
      message: "HTTP 500",
      status: 500,
    })
  );
  ok(
    "not_transient_generic",
    !isTransientNetworkError({ name: "Error", message: "something else" })
  );
  ok("not_transient_null", !isTransientNetworkError(null));
}

// ─── politeFetch retry (fake fetch + fast sleep) ───────────────────────────
(async () => {
  const realFetch = global.fetch;
  const sleeps = [];
  setSleepForTests(async (ms) => {
    sleeps.push(ms);
  });

  function makeTransient(code) {
    const err = new TypeError("fetch failed");
    err.cause = { code };
    return err;
  }

  // 1) transient twice then 200
  {
    resetNetworkRetryCount();
    sleeps.length = 0;
    let n = 0;
    let sawSignal = false;
    global.fetch = async (_url, opts) => {
      if (opts && opts.signal) sawSignal = true;
      n++;
      if (n <= 2) throw makeTransient("UND_ERR_CONNECT_TIMEOUT");
      return {
        status: 200,
        ok: true,
        headers: { get: () => null },
        text: async () => "ok",
      };
    };
    const res = await politeFetch("https://example.test/probe");
    ok("retry_twice_then_200_status", res.status === 200);
    ok("retry_twice_counted_2", getNetworkRetryCount() === 2, `n=${getNetworkRetryCount()}`);
    ok(
      "retry_backoff_2000_then_5000",
      sleeps.includes(2000) && sleeps.includes(5000),
      sleeps.join(",")
    );
    ok("timeout_signal_passed", sawSignal === true);
  }

  // 2) transient 3 times → throws
  {
    resetNetworkRetryCount();
    sleeps.length = 0;
    let n = 0;
    global.fetch = async () => {
      n++;
      throw makeTransient("ETIMEDOUT");
    };
    let threw = false;
    try {
      await politeFetch("https://example.test/fail");
    } catch (e) {
      threw = isTransientNetworkError(e);
    }
    ok("retry_exhausted_throws", threw === true);
    ok(
      "retry_exhausted_count_2",
      getNetworkRetryCount() === 2,
      `n=${getNetworkRetryCount()}`
    );
    ok("retry_exhausted_attempts_3", n === 3, `attempts=${n}`);
  }

  // 3) HTTP 500 → immediate return, 0 retries
  {
    resetNetworkRetryCount();
    sleeps.length = 0;
    let n = 0;
    global.fetch = async () => {
      n++;
      return {
        status: 500,
        ok: false,
        headers: { get: () => null },
        text: async () => "err",
      };
    };
    const res = await politeFetch("https://example.test/500");
    ok("http_500_no_retry_status", res.status === 500);
    ok("http_500_zero_retries", getNetworkRetryCount() === 0);
    ok("http_500_one_attempt", n === 1);
  }

  // 4) HTTP 404 → immediate return, 0 retries
  {
    resetNetworkRetryCount();
    let n = 0;
    global.fetch = async () => {
      n++;
      return {
        status: 404,
        ok: false,
        headers: { get: () => null },
        text: async () => "nope",
      };
    };
    const res = await politeFetch("https://example.test/404");
    ok("http_404_no_retry_status", res.status === 404);
    ok("http_404_zero_retries", getNetworkRetryCount() === 0 && n === 1);
  }

  // 5) caller-supplied signal still combined with timeout
  {
    resetNetworkRetryCount();
    let gotSignal = null;
    global.fetch = async (_url, opts) => {
      gotSignal = opts && opts.signal;
      return {
        status: 200,
        ok: true,
        headers: { get: () => null },
        text: async () => "ok",
      };
    };
    const ac = new AbortController();
    await politeFetch("https://example.test/sig", { signal: ac.signal });
    ok("caller_signal_respected", !!gotSignal);
  }

  ok(
    "retry_backoff_constants",
    Array.isArray(RETRY_BACKOFF_MS) &&
      RETRY_BACKOFF_MS[0] === 2000 &&
      RETRY_BACKOFF_MS[1] === 5000
  );

  global.fetch = realFetch;
  setSleepForTests(null);

  // ─── health source assertions ────────────────────────────────────────────
  {
    const probeSnippets = [
      "/sitemap.xml",
      "/api/products",
      "/api/reviews",
      "orders_empty_post",
      "track_no_email",
      "track_fake",
      "admin_redirect",
      "reviews_get",
      "reviews_empty_post",
      "site_content_scope_admin_unauth",
      "page=all&scope=admin",
      "/api/site-content?page=all",
      "/api/site-content?page=home",
      "keyGuard",
      "CRITICAL_PUBLIC_KEYS",
      "STATIC_PATHS",
      "content-security-policy",
      "strict-transport-security",
      "x-frame-options",
      "x-content-type-options",
      "diffSeoBaselines",
      "MIN_GAP_MS = 340",
      "firestick4uk.com",
    ];
    for (const s of probeSnippets) {
      ok(
        `health_probe_present_${s.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 40)}`,
        healthSrc.includes(s)
      );
    }

    ok(
      "fatal_includes_cause_code",
      /console\.error\(\s*["']fatal["']/.test(healthSrc) &&
        /cause\.code/.test(healthSrc) &&
        /\.slice\(\s*0\s*,\s*200\s*\)/.test(healthSrc)
    );
    ok(
      "require_main_guard",
      /require\.main\s*===\s*module/.test(healthSrc)
    );
    ok(
      "AbortSignal_timeout_20s",
      /AbortSignal\.timeout\(\s*20000\s*\)/.test(healthSrc)
    );
    ok(
      "network_retries_in_report",
      /Network retries:/.test(healthSrc) && /networkRetries/.test(healthSrc)
    );
    ok(
      "isTransientNetworkError_exported",
      /function isTransientNetworkError/.test(healthSrc) &&
        /isTransientNetworkError/.test(healthSrc)
    );

    // No new network targets beyond historical host + relative paths
    const urlLits = healthSrc.match(/https?:\/\/[a-zA-Z0-9._\-\/]+/g) || [];
    const hosts = [
      ...new Set(
        urlLits.map((u) => {
          try {
            return new URL(u.replace(/[\]\).,]+$/, "")).hostname;
          } catch {
            return u;
          }
        })
      ),
    ];
    ok(
      "no_new_network_hosts",
      hosts.length > 0 &&
        hosts.every((h) => h === "firestick4uk.com"),
      hosts.join(",")
    );
  }

  // ─── capture source assertions ───────────────────────────────────────────
  {
    const waitIdx = captureSrc.indexOf("waitForResponse");
    const gotoIdx = captureSrc.indexOf("page.goto");
    ok(
      "cms_waitForResponse_before_goto",
      waitIdx > 0 && gotoIdx > waitIdx,
      `wait=${waitIdx} goto=${gotoIdx}`
    );
    ok(
      "cms_wait_url_page_all",
      /\/api\/site-content\?page=all/.test(captureSrc) &&
        /waitForResponse/.test(captureSrc) &&
        /timeout:\s*45000/.test(captureSrc)
    );
    ok(
      "cms_not_loaded_failure",
      /cms_not_loaded/.test(captureSrc)
    );
    ok(
      "cmsLoaded_recorded",
      /cmsLoaded:\s*true/.test(captureSrc) && /cmsLoaded:\s*false/.test(captureSrc)
    );
    ok(
      "cmsStatus_recorded",
      /cmsStatus:/.test(captureSrc)
    );
    ok("capture_uses_readUntilStable", /readUntilStable\s*\(/.test(captureSrc));
    ok(
      "capture_mc_marker",
      /\[\[MC\]\]/.test(captureSrc) && /\[\[\/MC\]\]/.test(captureSrc)
    );
    ok(
      "capture_exit2_string",
      /process\.exit\(2\)/.test(captureSrc) &&
        /playwright-core not found/.test(captureSrc)
    );
    ok(
      "capture_exit3_string",
      /process\.exit\(3\)/.test(captureSrc) && /REFUSE overwrite/.test(captureSrc)
    );
    ok(
      "capture_len_lt_150",
      /len\s*<\s*150/.test(captureSrc) && /too_short/.test(captureSrc)
    );
    ok(
      "capture_3_attempt_loop",
      /attempt\s*<=\s*3/.test(captureSrc) ||
        /attempt = 1; attempt <= 3/.test(captureSrc)
    );
    ok(
      "capture_networkidle_best_effort",
      /waitForLoadState\(\s*["']networkidle["']/.test(captureSrc) &&
        /timeout:\s*20000/.test(captureSrc)
    );
  }

  // ─── no-forbidden-diff ───────────────────────────────────────────────────
  {
    const allowed = new Set([
      "scripts/live-health-check.js",
      "scripts/tools/visible-text-capture.js",
      "scripts/phase-multi-144-tests.js",
      // Coupled allowlist / NOT_APPROVED plumbing only
      "scripts/phase-multi-93-tests.js",
      "scripts/phase-multi-95-tests.js",
      "scripts/phase-multi-96-tests.js",
      "scripts/phase-multi-97-tests.js",
      "scripts/phase-multi-109-tests.js",
      "scripts/phase-multi-112-tests.js",
      "scripts/phase-multi-116-tests.js",
      "scripts/phase-multi-131-tests.js",
      "scripts/phase-multi-132-tests.js",
      "scripts/phase-multi-133-tests.js",
      "scripts/phase-multi-135-tests.js",
      "scripts/phase-multi-136-tests.js",
      "scripts/phase-multi-138-tests.js",
      "scripts/phase-multi-139-tests.js",
      "scripts/phase-multi-140-tests.js",
      "scripts/phase-multi-142-tests.js",
      "scripts/phase-multi-143-tests.js",
      // F4UK-MULTI-145: health 429 warn, draft base keep, atomic staff login session.
      "lib/contentDraftClient.ts",
      "components/admin/CmsDraftBar.tsx",
      "lib/adminStaffPasswordTx.ts",
      "pages/api/admin-login.ts",
      "scripts/phase-multi-145-tests.js",
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
    const diff = spawnSync(
      "git",
      ["diff", "--name-only", `${BASE_SHA}..HEAD`],
      { cwd: ROOT, encoding: "utf8" }
    );
    const unstaged = spawnSync("git", ["diff", "--name-only", BASE_SHA], {
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
        const t = line.trim();
        if (t) names.add(t.replace(/\\/g, "/"));
      }
    }
    for (const line of (status.stdout || "").split(/\r?\n/)) {
      const t = line.trim();
      if (!t) continue;
      const m =
        t.match(/^\?\?\s+(.+)$/) || t.match(/^[ MADRCU?]{1,2}\s+(.+)$/);
      if (m) names.add(m[1].replace(/\\/g, "/"));
    }
    const bad = [...names].filter((f) => !allowed.has(f));
    ok(
      "no_forbidden_diff",
      bad.length === 0,
      bad.length ? bad.join(",") : [...names].join(",") || "(clean-or-approved)"
    );
  }

  console.log(`\nphase-multi-144: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
