#!/usr/bin/env node
/**
 * F4UK-MULTI-93 — reusable live health check (public surface only).
 * Usage:
 *   node scripts/live-health-check.js [--base https://firestick4uk.com] [--write-baseline] [--out <dir>]
 * Exit 0 when all checks pass; 1 on any failure. ≤ 3 req/s.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const {
  extractSeoFields,
  diffSeoBaselines,
} = require("./lib/seoHealthDiff");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_BASE = "https://firestick4uk.com";
const BASELINE_PATH = path.join(ROOT, "scripts", "baselines", "seo-baseline.json");
const MIN_GAP_MS = 340; // ≤ 3 req/s

const STATIC_PATHS = [
  "/",
  "/products",
  "/iptv-subscriptions-uk",
  "/seasonal-offers",
  "/blog",
  "/contact",
  "/faq",
  "/order-tracking",
  "/about",
  "/cart",
  "/sidhu",
  "/sitemap.xml",
];

function parseArgs(argv) {
  const out = { base: DEFAULT_BASE, writeBaseline: false, outDir: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--write-baseline") out.writeBaseline = true;
    else if (a === "--base") out.base = String(argv[++i] || DEFAULT_BASE).replace(/\/$/, "");
    else if (a === "--out") out.outDir = argv[++i];
    else if (a === "--help" || a === "-h") {
      console.log(
        "Usage: node scripts/live-health-check.js [--base URL] [--write-baseline] [--out DIR]"
      );
      process.exit(0);
    }
  }
  return out;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

let lastReqAt = 0;
async function politeFetch(url, opts = {}) {
  const now = Date.now();
  const wait = MIN_GAP_MS - (now - lastReqAt);
  if (wait > 0) await sleep(wait);
  lastReqAt = Date.now();
  const res = await fetch(url, {
    redirect: "manual",
    ...opts,
    headers: {
      "user-agent": "F4UK-live-health-check/1.0",
      ...(opts.headers || {}),
    },
  });
  return res;
}

function isHtmlPath(p) {
  return p !== "/sitemap.xml" && !p.startsWith("/api/");
}

async function main() {
  const args = parseArgs(process.argv);
  const base = args.base;
  const failures = [];
  const notes = [];
  const httpResults = [];
  const seoLive = {};
  let sitemapCount = 0;
  let productsCount = 0;
  let productPaths = [];
  const securityHeaders = {};
  const negative = [];

  // 1 + product URLs from sitemap
  let sitemapXml = "";
  {
    const smUrl = `${base}/sitemap.xml`;
    const res = await politeFetch(smUrl);
    const body = await res.text();
    sitemapXml = body;
    sitemapCount = (body.match(/<loc>/g) || []).length;
    httpResults.push({ path: "/sitemap.xml", status: res.status, ok: res.status === 200 });
    if (res.status !== 200) failures.push(`HTTP /sitemap.xml → ${res.status}`);
    const locs = [...body.matchAll(/<loc>(https?:\/\/[^<]+)<\/loc>/gi)].map((m) => m[1]);
    productPaths = locs
      .map((u) => {
        try {
          return new URL(u).pathname;
        } catch {
          return null;
        }
      })
      .filter((p) => p && p.startsWith("/products/"));
  }

  const pathsToCheck = [...STATIC_PATHS.filter((p) => p !== "/sitemap.xml"), ...productPaths];

  for (const p of pathsToCheck) {
    const url = `${base}${p}`;
    let res;
    try {
      res = await politeFetch(url);
    } catch (err) {
      httpResults.push({ path: p, status: 0, ok: false, error: err && err.name });
      failures.push(`HTTP ${p} → network error`);
      continue;
    }
    const ok = res.status === 200;
    httpResults.push({ path: p, status: res.status, ok });
    if (!ok) failures.push(`HTTP ${p} → ${res.status}`);

    if (p === "/") {
      securityHeaders.contentSecurityPolicy = res.headers.get("content-security-policy") || "";
      securityHeaders.strictTransportSecurity = res.headers.get("strict-transport-security") || "";
      securityHeaders.xFrameOptions = res.headers.get("x-frame-options") || "";
      securityHeaders.xContentTypeOptions = res.headers.get("x-content-type-options") || "";
    }

    if (ok && isHtmlPath(p)) {
      const html = await res.text();
      seoLive[p] = extractSeoFields(html, p);
    }
  }

  // Security header assertions
  if (!/default-src\s+'self'/.test(securityHeaders.contentSecurityPolicy || "")) {
    failures.push("security: Content-Security-Policy missing app default-src 'self'");
  }
  if (!securityHeaders.strictTransportSecurity) {
    failures.push("security: Strict-Transport-Security missing");
  }
  if (String(securityHeaders.xFrameOptions || "").toUpperCase() !== "SAMEORIGIN") {
    failures.push(`security: X-Frame-Options expected SAMEORIGIN got ${securityHeaders.xFrameOptions}`);
  }
  if (!/nosniff/i.test(securityHeaders.xContentTypeOptions || "")) {
    failures.push("security: X-Content-Type-Options missing nosniff");
  }

  // 3. /api/products length
  {
    const res = await politeFetch(`${base}/api/products`);
    const text = await res.text();
    let arr = null;
    try {
      arr = JSON.parse(text);
    } catch {
      arr = null;
    }
    productsCount = Array.isArray(arr) ? arr.length : -1;
    httpResults.push({ path: "/api/products", status: res.status, ok: res.status === 200 });
    if (res.status !== 200) failures.push(`HTTP /api/products → ${res.status}`);
  }

  // 2. SEO baseline compare / write
  let seoDiffs = [];
  if (args.writeBaseline) {
    const baseline = {
      generatedAt: new Date().toISOString(),
      base,
      sitemapUrlCount: sitemapCount,
      productsCount,
      pages: seoLive,
    };
    fs.mkdirSync(path.dirname(BASELINE_PATH), { recursive: true });
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + "\n", "utf8");
    notes.push(`wrote baseline ${BASELINE_PATH} (${Object.keys(seoLive).length} pages)`);
  } else if (fs.existsSync(BASELINE_PATH)) {
    const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
    seoDiffs = diffSeoBaselines(baseline, seoLive);
    if (seoDiffs.length) {
      failures.push(`SEO diffs: ${seoDiffs.length} field(s)`);
    }
    if (typeof baseline.sitemapUrlCount === "number" && baseline.sitemapUrlCount !== sitemapCount) {
      failures.push(
        `sitemap count ${sitemapCount} != baseline ${baseline.sitemapUrlCount}`
      );
    }
    if (typeof baseline.productsCount === "number" && baseline.productsCount !== productsCount) {
      failures.push(
        `products count ${productsCount} != baseline ${baseline.productsCount}`
      );
    }
  } else {
    notes.push("no baseline file; SEO compare skipped (use --write-baseline)");
  }

  // 5. Negative API checks
  async function neg(name, method, urlPath, body, expectStatus) {
    const opts = { method };
    if (body !== undefined) {
      opts.headers = { "content-type": "application/json" };
      opts.body = typeof body === "string" ? body : JSON.stringify(body);
    }
    const res = await politeFetch(`${base}${urlPath}`, opts);
    // Follow one redirect hop for /admin if needed for status capture
    let status = res.status;
    const row = { name, method, path: urlPath, status, expect: expectStatus, ok: status === expectStatus };
    if (!row.ok) failures.push(`negative ${name}: got ${status} expect ${expectStatus}`);
    negative.push(row);
    // drain
    try {
      await res.text();
    } catch {
      /* ignore */
    }
  }

  await neg("orders_empty_post", "POST", "/api/orders", {}, 400);
  await neg("track_no_email", "GET", "/api/track?order_id=ORD-1000000000000", undefined, 400);
  await neg(
    "track_fake",
    "GET",
    "/api/track?order_id=ORD-1000000000000&email=nobody@example.com",
    undefined,
    404
  );
  await neg("admin_redirect", "GET", "/admin", undefined, 308);

  const summary = {
    ok: failures.length === 0,
    base,
    generatedAt: new Date().toISOString(),
    http: httpResults,
    sitemapUrlCount: sitemapCount,
    productsCount,
    productPaths,
    securityHeaders: {
      hasCspAppPolicy: /default-src\s+'self'/.test(securityHeaders.contentSecurityPolicy || ""),
      strictTransportSecurity: securityHeaders.strictTransportSecurity || null,
      xFrameOptions: securityHeaders.xFrameOptions || null,
      xContentTypeOptions: securityHeaders.xContentTypeOptions || null,
    },
    seoDiffCount: seoDiffs.length,
    seoDiffs,
    negative,
    failures,
    notes,
  };

  const md = [
    `# Live health check`,
    ``,
    `- Base: ${base}`,
    `- Result: **${summary.ok ? "PASS" : "FAIL"}**`,
    `- Sitemap URLs: ${sitemapCount}`,
    `- /api/products length: ${productsCount}`,
    `- SEO field diffs: ${seoDiffs.length}`,
    `- Failures: ${failures.length}`,
    ``,
    `## Failures`,
    ...(failures.length ? failures.map((f) => `- ${f}`) : ["- (none)"]),
    ``,
    `## Negative API`,
    ...negative.map((n) => `- ${n.name}: ${n.status} (expect ${n.expect}) ${n.ok ? "OK" : "FAIL"}`),
    ``,
    `## Security (/)`,
    `- CSP app policy: ${summary.securityHeaders.hasCspAppPolicy}`,
    `- HSTS: ${summary.securityHeaders.strictTransportSecurity}`,
    `- X-Frame-Options: ${summary.securityHeaders.xFrameOptions}`,
    `- X-Content-Type-Options: ${summary.securityHeaders.xContentTypeOptions}`,
    ``,
  ].join("\n");

  console.log(md);
  if (seoDiffs.length) {
    console.log("SEO diffs (first 20):");
    for (const d of seoDiffs.slice(0, 20)) {
      console.log(`  ${d.path} :: ${d.field}`);
    }
  }

  if (args.outDir) {
    fs.mkdirSync(args.outDir, { recursive: true });
    fs.writeFileSync(path.join(args.outDir, "health-summary.json"), JSON.stringify(summary, null, 2) + "\n");
    fs.writeFileSync(path.join(args.outDir, "health-summary.md"), md + "\n");
    notes.forEach((n) => console.log("note:", n));
  }

  process.exit(summary.ok ? 0 : 1);
}

main().catch((err) => {
  console.error("fatal", err && err.name ? err.name : "error");
  process.exit(1);
});
