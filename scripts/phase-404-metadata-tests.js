/**
 * Leaf 404 metadata: source invariants + optional raw HTTP against a running server.
 * Set BASE_URL (e.g. http://127.0.0.1:3458) to run the HTTP matrix.
 * Raw production-mode HTML is the authoritative proof — these HTTP checks require next start.
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const { URL } = require("url");

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

const notFound = read("app/not-found.tsx");
const globalNotFound = read("app/global-not-found.tsx");
const rootLayout = read("app/layout.tsx");
const productsLayout = read("app/products/layout.tsx");
const blogLayout = read("app/blog/layout.tsx");

ok(
  "not_found_title",
  /title:\s*["']Page Not Found — Firestick4UK["']/.test(notFound)
);
ok(
  "not_found_robots_noindex_follow",
  /robots:\s*\{[\s\S]*?index:\s*false[\s\S]*?follow:\s*true[\s\S]*?googleBot:\s*\{[\s\S]*?index:\s*false[\s\S]*?follow:\s*true/.test(
    notFound
  )
);
ok(
  "not_found_clears_canonical_null",
  /alternates:\s*\{[\s\S]*?canonical:\s*null/.test(notFound)
);
ok(
  "not_found_clears_og_url_null",
  /openGraph:\s*\{[\s\S]*?url:\s*null/.test(notFound)
);
ok(
  "global_not_found_untouched_manual_head",
  /<title>Page Not Found — Firestick4UK<\/title>/.test(globalNotFound) &&
    !/export const metadata/.test(globalNotFound) &&
    !/canonical/.test(globalNotFound)
);
ok(
  "root_layout_indexable_canonical_untouched",
  /index:\s*true/.test(rootLayout) &&
    /canonical:\s*["']https:\/\/firestick4uk\.com["']/.test(rootLayout)
);
ok(
  "products_layout_canonical_untouched",
  /canonical:\s*["']https:\/\/firestick4uk\.com\/products["']/.test(
    productsLayout
  )
);
ok(
  "blog_layout_canonical_untouched",
  /canonical:\s*["']https:\/\/firestick4uk\.com\/blog["']/.test(blogLayout)
);
ok(
  "layouts_not_edited_for_404",
  !/canonical:\s*null/.test(rootLayout) &&
    !/canonical:\s*null/.test(productsLayout) &&
    !/canonical:\s*null/.test(blogLayout)
);

function fetchRaw(base, pathname) {
  return new Promise((resolve, reject) => {
    const u = new URL(pathname, base);
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.get(
      u,
      { headers: { "user-agent": "f4uk-404-metadata-test" } },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          resolve({
            status: res.statusCode,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(25000, () => {
      req.destroy(new Error("timeout"));
    });
  });
}

function parseMeta(html) {
  const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || "";
  const robots = [
    ...html.matchAll(
      /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)["'][^>]*>/gi
    ),
  ].map((m) => m[1]);
  const robots2 = [
    ...html.matchAll(
      /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']robots["'][^>]*>/gi
    ),
  ].map((m) => m[1]);
  const googlebot = [
    ...html.matchAll(
      /<meta[^>]+name=["']googlebot["'][^>]+content=["']([^"']*)["'][^>]*>/gi
    ),
  ].map((m) => m[1]);
  const googlebot2 = [
    ...html.matchAll(
      /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']googlebot["'][^>]*>/gi
    ),
  ].map((m) => m[1]);
  const canonical = [
    ...html.matchAll(
      /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["'][^>]*>/gi
    ),
  ].map((m) => m[1]);
  const canonical2 = [
    ...html.matchAll(
      /<link[^>]+href=["']([^"']*)["'][^>]+rel=["']canonical["'][^>]*>/gi
    ),
  ].map((m) => m[1]);
  const ogUrl = [
    ...html.matchAll(
      /<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']*)["'][^>]*>/gi
    ),
  ].map((m) => m[1]);
  const ogUrl2 = [
    ...html.matchAll(
      /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:url["'][^>]*>/gi
    ),
  ].map((m) => m[1]);
  return {
    title: title.trim(),
    robots: [...new Set([...robots, ...robots2])],
    googlebot: [...new Set([...googlebot, ...googlebot2])],
    canonical: [...new Set([...canonical, ...canonical2])],
    ogUrl: [...new Set([...ogUrl, ...ogUrl2])],
  };
}

function assertLeaf404(label, status, meta) {
  ok(`${label}_status_404`, status === 404, `got ${status}`);
  ok(
    `${label}_title`,
    meta.title === "Page Not Found — Firestick4UK",
    meta.title
  );
  const robotsJoined = meta.robots.join(" | ").toLowerCase();
  ok(
    `${label}_robots_noindex`,
    meta.robots.some((r) => /noindex/i.test(r)),
    robotsJoined || "(none)"
  );
  ok(
    `${label}_no_robots_index_follow`,
    !meta.robots.some((r) => /\bindex\b/i.test(r) && !/noindex/i.test(r)),
    robotsJoined || "(none)"
  );
  const gb = meta.googlebot.join(" | ").toLowerCase();
  ok(
    `${label}_no_googlebot_index_follow`,
    !meta.googlebot.some((r) => /\bindex\b/i.test(r) && !/noindex/i.test(r)),
    gb || "(none)"
  );
  ok(
    `${label}_no_canonical`,
    meta.canonical.length === 0,
    meta.canonical.join(" | ") || "(none)"
  );
  ok(
    `${label}_no_og_url`,
    meta.ogUrl.length === 0,
    meta.ogUrl.join(" | ") || "(none)"
  );
}

async function runHttp() {
  const base = process.env.BASE_URL;
  if (!base) {
    console.log("SKIP  http_matrix — set BASE_URL to exercise raw HTML checks");
    return;
  }

  const leafPaths = [
    ["leaf_root", "/__404-fix-root"],
    ["leaf_product", "/products/__404-fix-product"],
    ["leaf_blog", "/blog/__404-fix-post"],
  ];
  for (const [label, p] of leafPaths) {
    const { status, body } = await fetchRaw(base, p);
    assertLeaf404(label, status, parseMeta(body));
  }

  const global = await fetchRaw(base, "/__404-fix/deep/missing/path");
  const gMeta = parseMeta(global.body);
  ok("global_status_404", global.status === 404, `got ${global.status}`);
  ok(
    "global_robots_noindex",
    gMeta.robots.some((r) => /noindex/i.test(r)) ||
      /noindex/i.test(global.body),
    gMeta.robots.join(" | ") || "(check body)"
  );
  ok(
    "global_no_canonical",
    gMeta.canonical.length === 0,
    gMeta.canonical.join(" | ") || "(none)"
  );
  ok(
    "global_no_og_url",
    gMeta.ogUrl.length === 0,
    gMeta.ogUrl.join(" | ") || "(none)"
  );

  const valid = [
    ["home", "/", "https://firestick4uk.com"],
    ["products", "/products", "https://firestick4uk.com/products"],
    ["blog", "/blog", "https://firestick4uk.com/blog"],
  ];
  for (const [label, p, expectedCanonical] of valid) {
    const { status, body } = await fetchRaw(base, p);
    const meta = parseMeta(body);
    ok(`${label}_valid_200`, status === 200, `got ${status}`);
    ok(
      `${label}_valid_canonical`,
      meta.canonical.includes(expectedCanonical) ||
        meta.canonical.includes(expectedCanonical + "/"),
      meta.canonical.join(" | ")
    );
    ok(
      `${label}_valid_has_og_url`,
      meta.ogUrl.length > 0,
      meta.ogUrl.join(" | ") || "(none)"
    );
    ok(
      `${label}_valid_not_noindex_only`,
      !meta.robots.every((r) => /^noindex/i.test(r.trim())),
      meta.robots.join(" | ")
    );
  }
}

(async () => {
  try {
    await runHttp();
  } catch (err) {
    failed++;
    console.error(`FAIL  http_matrix — ${err && err.message ? err.message : err}`);
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
