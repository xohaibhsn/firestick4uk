/**
 * RM-B3 HTTP production-mode runtime tests (local server).
 *
 * Requires:
 *   ALLOW_DB_MUTATION_TESTS=YES_I_UNDERSTAND
 *   BASE_URL=http://127.0.0.1:3040
 *   Server already running: NODE_ENV=production RM_B3_TEST_INSTRUMENT=1 npm start -p 3040
 *
 * Uses only __rm_runtime_* sources and always deletes them.
 */
require("dotenv").config({ path: ".env.local" });
const http = require("http");
const mysql = require("mysql2/promise");
const { requireMutationOptIn } = require("./testMutationGuard");

requireMutationOptIn("phase-rm-b3-http-runtime-tests");

const BASE = process.env.BASE_URL || "http://127.0.0.1:3040";
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

function request(path, { method = "GET", headers = {}, maxRedirects = 0 } = {}) {
  const url = new URL(path, BASE);
  return new Promise((resolve, reject) => {
    const req = http.request(
      url,
      { method, headers },
      (res) => {
        res.resume();
        resolve({
          status: res.statusCode,
          location: res.headers.location || "",
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

(async () => {
  const pool = await mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  try {
    // Cleanup any leftover test rows
    await pool.query("DELETE FROM url_redirects WHERE source_path LIKE ?", ["%__rm_runtime%"]);
    await pool.query("DELETE FROM url_redirects WHERE source_path = ? AND destination_path = ?", [
      "/about",
      "/faq",
    ]);

    await pool.query(
      `INSERT INTO url_redirects (source_path, destination_path, redirect_type, active, created_at, updated_at) VALUES
       ('/__rm_runtime_deep/path', '/faq', 308, 1, NOW(), NOW()),
       ('/__rm_runtime_root', '/contact', 308, 1, NOW(), NOW()),
       ('/products/__rm_runtime_product', '/products', 308, 1, NOW(), NOW()),
       ('/blog/__rm_runtime_blog', '/blog', 308, 1, NOW(), NOW()),
       ('/about', '/faq', 308, 1, NOW(), NOW())`
    );

    // Wait for cache TTL if a warm empty cache existed — up to ~70s on first miss batch.
    // First probe may miss if cache was warm-empty; retry.
    async function expect308(path, locContains) {
      let last = null;
      for (let i = 0; i < 8; i++) {
        last = await request(path, { maxRedirects: 0 });
        if (last.status === 308 && String(last.location).includes(locContains)) return last;
        await sleep(10000);
      }
      return last;
    }

    const a = await expect308("/__rm_runtime_deep/path", "/faq");
    ok("A_global_deep_308", a.status === 308 && a.location.includes("/faq"), `status=${a.status} loc=${a.location}`);

    const b = await expect308("/__rm_runtime_root", "/contact");
    ok("B_root_308", b.status === 308 && b.location.includes("/contact"), `status=${b.status} loc=${b.location}`);

    const c = await expect308("/products/__rm_runtime_product", "/products");
    const cPath = c.location ? new URL(c.location, BASE).pathname : "";
    ok(
      "C_product_miss_308",
      c.status === 308 && (cPath === "/products" || c.location.includes("/products")),
      `status=${c.status} loc=${c.location}`
    );

    const d = await expect308("/blog/__rm_runtime_blog", "/blog");
    ok("D_blog_miss_308", d.status === 308 && d.location.includes("/blog"), `status=${d.status} loc=${d.location}`);

    const e = await request("/__rm_runtime_no_rule/deep");
    ok("E_no_rule_404", e.status === 404, `status=${e.status}`);

    const f = await expect308("/__rm_runtime_deep/path?utm_source=test&a=1", "utm_source=test");
    ok(
      "F_query_preserved",
      f.status === 308 && f.location.includes("/faq") && f.location.includes("utm_source=test") && f.location.includes("a=1"),
      `loc=${f.location}`
    );

    for (const p of ["/", "/about", "/faq", "/products", "/blog", "/iptv-subscriptions-uk"]) {
      const r = await request(p);
      ok(`G_valid_${p}`, r.status === 200, `status=${r.status}`);
    }

    const h = await request("/about");
    ok("H_live_about_stays_200", h.status === 200, `status=${h.status} loc=${h.location}`);

    // Inactive — wait for TTL
    await pool.query("UPDATE url_redirects SET active=0 WHERE source_path=?", ["/__rm_runtime_root"]);
    let inactive = null;
    for (let i = 0; i < 8; i++) {
      await sleep(10000);
      inactive = await request("/__rm_runtime_root");
      if (inactive.status === 404) break;
    }
    ok("I_inactive_404", inactive && inactive.status === 404, `status=${inactive && inactive.status}`);

    // Spoof headers — actual path authoritative
    const spoof = await request("/__rm_runtime_no_rule/deep", {
      headers: {
        "x-f4uk-original-path": "/__rm_runtime_deep/path",
        "x-f4uk-original-search": "?evil=1",
      },
    });
    ok("J_spoof_ignored_404", spoof.status === 404, `status=${spoof.status} loc=${spoof.location}`);
  } finally {
    await pool.query("DELETE FROM url_redirects WHERE source_path LIKE ?", ["%__rm_runtime%"]);
    await pool.query("DELETE FROM url_redirects WHERE source_path = ? AND destination_path = ?", [
      "/about",
      "/faq",
    ]);
    const [c] = await pool.query(
      "SELECT COUNT(*) AS n FROM url_redirects WHERE source_path LIKE '%__rm_runtime%' OR (source_path='/about' AND destination_path='/faq')"
    );
    ok("cleanup_zero_test_rows", Number(c[0].n) === 0, `leftover=${c[0].n}`);
    await pool.end();
  }

  console.log(`\nRM-B3 HTTP: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error("FATAL", e.message);
  process.exit(1);
});
