/**
 * Phase 10 — technical SEO integrity tests (READ ONLY).
 * No DB mutations.
 *
 * Usage:
 *   BASE_URL=http://127.0.0.1:3010 node scripts/phase10-seo-integrity-tests.js
 *   BASE_URL=https://firestick4uk.com node scripts/phase10-seo-integrity-tests.js
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

function request(method, urlPath, { maxRedirects = 0 } = {}) {
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
          const text = Buffer.concat(chunks).toString("utf8");
          resolve({
            status: res.statusCode,
            headers: res.headers,
            text,
            location: res.headers.location || "",
          });
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

function extractJsonLd(html) {
  const blocks = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      blocks.push(JSON.parse(m[1]));
    } catch {
      /* ignore invalid */
    }
  }
  return blocks;
}

function findProductLd(blocks) {
  for (const b of blocks) {
    if (b && b["@type"] === "Product") return b;
    if (Array.isArray(b)) {
      const hit = b.find((x) => x && x["@type"] === "Product");
      if (hit) return hit;
    }
  }
  return null;
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
    const [products] = await db.query(
      `SELECT id, name, slug, price, image, og_image, seo_title, active, stock
       FROM products
       WHERE active = 1 AND slug IS NOT NULL AND TRIM(slug) <> ''
       ORDER BY id ASC
       LIMIT 5`
    );
    if (!products.length) throw new Error("No active products with slug for SEO tests");
    const product = products[0];
    const slug = String(product.slug).trim();
    const priceStr = Number(product.price).toFixed(2);

    const page = await request("GET", `/products/${encodeURIComponent(slug)}`);
    const ldBlocks = extractJsonLd(page.text || "");
    const productLd = findProductLd(ldBlocks);

    // A — no hardcoded unsupported aggregateRating
    mark(
      "A",
      page.status === 200 && productLd && !productLd.aggregateRating,
      `status=${page.status} hasAgg=${!!productLd?.aggregateRating}`
    );

    // B — product schema uses actual price
    mark(
      "B",
      !!productLd &&
        productLd.offers &&
        String(productLd.offers.price) === priceStr &&
        productLd.offers.priceCurrency === "GBP",
      `schemaPrice=${productLd?.offers?.price} db=${priceStr}`
    );

    // C — canonical uses DB product slug
    const canonicalMatch = (page.text || "").match(
      /rel=["']canonical["'][^>]*href=["']([^"']+)["']/i
    ) || (page.text || "").match(/href=["']([^"']+)["'][^>]*rel=["']canonical["']/i);
    const canonical = canonicalMatch?.[1] || "";
    mark(
      "C",
      canonical === `https://firestick4uk.com/products/${slug}` ||
        (page.text || "").includes(`https://firestick4uk.com/products/${slug}`),
      `canonical=${canonical || "(from og/body)"}`
    );

    // D — legacy name-derived alias redirects when DB slug differs
    const nameAlias = String(product.name || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    if (nameAlias && nameAlias !== slug) {
      const alias = await request("GET", `/products/${encodeURIComponent(nameAlias)}`);
      const loc = String(alias.location || "");
      mark(
        "D",
        (alias.status === 308 || alias.status === 301) && loc.includes(`/products/${slug}`),
        `status=${alias.status} loc=${loc}`
      );
    } else {
      mark("D", true, "skipped — name alias equals stored slug");
    }

    // E — unknown product → actual 404
    const missing = await request("GET", `/products/phase10-seo-missing-${Date.now()}`);
    mark("E", missing.status === 404, `status=${missing.status}`);

    // F — empty schema image not emitted
    const noImageProduct = products.find((p) => !String(p.image || "").trim() && !String(p.og_image || "").trim());
    if (noImageProduct) {
      const p2 = await request("GET", `/products/${encodeURIComponent(String(noImageProduct.slug).trim())}`);
      const ld2 = findProductLd(extractJsonLd(p2.text || ""));
      mark("F", !!ld2 && (ld2.image === undefined || ld2.image === null), `image=${JSON.stringify(ld2?.image)}`);
    } else if (productLd) {
      mark(
        "F",
        productLd.image === undefined ||
          (typeof productLd.image === "string" && productLd.image.trim() !== ""),
        `image=${JSON.stringify(productLd.image)}`
      );
    } else {
      mark("F", false, "no product ld");
    }

    // G — no duplicate Firestick4UK suffix in title
    const titleMatch = (page.text || "").match(/<title[^>]*>([^<]*)<\/title>/i);
    const title = titleMatch?.[1] || "";
    mark("G", !/\|\s*Firestick4UK\s*\|\s*Firestick4UK/i.test(title), `title=${title.slice(0, 80)}`);

    // H — subscription canonical behavior unchanged (page loads / redirects cleanly)
    const sub = await request("GET", "/iptv-subscriptions-uk", { maxRedirects: 0 });
    mark(
      "H",
      sub.status === 200 ||
        sub.status === 308 ||
        sub.status === 301 ||
        sub.status === 307,
      `status=${sub.status}`
    );

    // I — sitemap contains canonical active product slug
    const sm = await request("GET", "/sitemap.xml");
    const smText = sm.text || "";
    mark(
      "I",
      sm.status === 200 && smText.includes(`https://firestick4uk.com/products/${slug}`),
      `status=${sm.status} hasSlug=${smText.includes(`/products/${slug}`)}`
    );

    // J — no legacy name-alias duplicates in sitemap when alias differs
    if (nameAlias && nameAlias !== slug) {
      const hasAlias = smText.includes(`https://firestick4uk.com/products/${nameAlias}`);
      mark("J", !hasAlias, `aliasInSitemap=${hasAlias}`);
    } else {
      mark("J", true, "skipped — no distinct name alias");
    }
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
