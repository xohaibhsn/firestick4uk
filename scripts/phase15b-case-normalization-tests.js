/**
 * Phase 15B — product URL case normalization (READ ONLY).
 *
 * Usage:
 *   BASE_URL=http://127.0.0.1:3010 node scripts/phase15b-case-normalization-tests.js
 *   BASE_URL=https://firestick4uk.com node scripts/phase15b-case-normalization-tests.js
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

function request(method, urlPath) {
  const base = process.env.BASE_URL || "http://127.0.0.1:3010";
  const u = new URL(urlPath, base);
  const lib = u.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: u.pathname + u.search,
        method,
        headers: { Accept: "text/html,application/json,*/*" },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            text: Buffer.concat(chunks).toString("utf8"),
            location: res.headers.location || "",
          });
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

function isPermanentRedirect(status) {
  return status === 308 || status === 301;
}

function locPointsToProduct(loc, slug) {
  const s = String(loc || "");
  return s === `/products/${slug}` || s.endsWith(`/products/${slug}`);
}

async function main() {
  loadEnvLocal();
  const out = {};
  const mark = (id, ok, detail = "") => {
    out[id] = ok ? "PASS" : "FAIL";
    console.log(`${ok ? "PASS" : "FAIL"} ${id}${detail ? " — " + detail : ""}`);
  };

  const mysql = require("mysql2/promise");
  const db = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT) || 3306,
  });

  try {
    const [bySlug] = await db.query(
      `SELECT id, name, slug FROM products
       WHERE active = 1 AND slug IN ('firestick-4k', 'b1g-1-month-plan')
       ORDER BY FIELD(slug, 'firestick-4k', 'b1g-1-month-plan')`
    );
    const firestick = bySlug.find((p) => p.slug === "firestick-4k");
    const b1g = bySlug.find((p) => p.slug === "b1g-1-month-plan");
    if (!firestick || !b1g) {
      throw new Error("Required products firestick-4k / b1g-1-month-plan not found active");
    }

    const slug = "firestick-4k";
    const b1gSlug = "b1g-1-month-plan";

    // A — lowercase canonical → 200
    const a = await request("GET", `/products/${slug}`);
    mark("A", a.status === 200, `status=${a.status}`);

    // B — mixed-case canonical → 308 lowercase
    const b = await request("GET", `/products/Firestick-4K`);
    mark(
      "B",
      isPermanentRedirect(b.status) && locPointsToProduct(b.location, slug),
      `status=${b.status} loc=${b.location}`
    );

    // C — B1G mixed-case → 308 lowercase
    const c = await request("GET", `/products/B1G-1-Month-Plan`);
    mark(
      "C",
      isPermanentRedirect(c.status) && locPointsToProduct(c.location, b1gSlug),
      `status=${c.status} loc=${c.location}`
    );

    // D — trailing slash → canonical lowercase (platform 308)
    const d = await request("GET", `/products/${slug}/`);
    mark(
      "D",
      isPermanentRedirect(d.status) && locPointsToProduct(d.location, slug),
      `status=${d.status} loc=${d.location}`
    );

    // E — legacy product alias still → 308 authoritative slug
    const [legacyCandidates] = await db.query(
      `SELECT id, name, slug FROM products
       WHERE active = 1 AND slug IS NOT NULL AND TRIM(slug) <> ''
       ORDER BY id ASC
       LIMIT 20`
    );
    let legacyOk = false;
    let legacyDetail = "no distinct name alias found among sample";
    for (const p of legacyCandidates) {
      const stored = String(p.slug).trim().toLowerCase();
      const nameAlias = String(p.name || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
      if (!nameAlias || nameAlias === stored) continue;
      const e = await request("GET", `/products/${encodeURIComponent(nameAlias)}`);
      legacyOk = isPermanentRedirect(e.status) && locPointsToProduct(e.location, stored);
      legacyDetail = `alias=${nameAlias} → status=${e.status} loc=${e.location}`;
      break;
    }
    if (legacyDetail.startsWith("no distinct")) {
      // Known production alias from Phase 15A
      const e = await request("GET", "/products/2-years-subscription");
      legacyOk =
        isPermanentRedirect(e.status) && locPointsToProduct(e.location, "b1g-2-years-plan");
      legacyDetail = `fallback 2-years-subscription → status=${e.status} loc=${e.location}`;
    }
    mark("E", legacyOk, legacyDetail);

    // F — unknown slug → 404
    const f = await request("GET", `/products/phase15b-missing-${Date.now()}`);
    mark("F", f.status === 404, `status=${f.status}`);

    // G — canonical tag remains authoritative lowercase (on 200 page)
    const canonMatch =
      (a.text || "").match(/rel=["']canonical["'][^>]*href=["']([^"']+)["']/i) ||
      (a.text || "").match(/href=["']([^"']+)["'][^>]*rel=["']canonical["']/i);
    const canonical = canonMatch?.[1] || "";
    mark(
      "G",
      canonical === `https://firestick4uk.com/products/${slug}`,
      `canonical=${canonical}`
    );

    // H — sitemap unchanged (contains lowercase slugs, not mixed-case)
    const sm = await request("GET", "/sitemap.xml");
    const smText = sm.text || "";
    mark(
      "H",
      sm.status === 200 &&
        smText.includes(`https://firestick4uk.com/products/${slug}`) &&
        smText.includes(`https://firestick4uk.com/products/${b1gSlug}`) &&
        !smText.includes("/products/Firestick-4K") &&
        !smText.includes("/products/B1G-1-Month-Plan"),
      `status=${sm.status} total-ish=${(smText.match(/<loc>/g) || []).length}`
    );
  } finally {
    try {
      await db.end();
    } catch {
      /* ignore */
    }
  }

  const fails = Object.entries(out).filter(([, v]) => v === "FAIL");
  console.log("\n========== SUMMARY ==========");
  for (const [k, v] of Object.entries(out)) console.log(`${v} ${k}`);
  console.log(fails.length ? `\nFAILED: ${fails.length}` : "\nALL PASS");
  process.exit(fails.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
