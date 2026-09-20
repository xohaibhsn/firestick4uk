/**
 * Phase 7 — READ-ONLY product content completeness audit.
 * Usage: node scripts/audit-product-content.js
 * Makes NO DB writes.
 */
const fs = require("fs");
const path = require("path");

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

function state(v) {
  const s = v == null ? "" : String(v).trim();
  return s ? "OK" : "EMPTY";
}

function classify(row) {
  const descEmpty =
    state(row.description) === "EMPTY" &&
    state(row.short_description) === "EMPTY" &&
    state(row.full_description) === "EMPTY";
  const imageEmpty = state(row.image) === "EMPTY";
  const seoEmpty =
    state(row.meta_description) === "EMPTY" &&
    state(row.short_description) === "EMPTY" &&
    state(row.description) === "EMPTY";
  const featuresEmpty = state(row.features) === "EMPTY";

  const missing = [];
  if (descEmpty) missing.push("content");
  if (imageEmpty) missing.push("image");
  if (seoEmpty) missing.push("seo");
  if (featuresEmpty && state(row.full_description) === "EMPTY") missing.push("details");

  if (missing.length === 0) return "Complete";
  if (missing.length >= 3) return "Needs Multiple Fields";
  if (missing.includes("content") && missing.includes("image")) return "Needs Multiple Fields";
  if (missing.includes("content")) return "Needs Content";
  if (missing.includes("image")) return "Needs Image";
  if (missing.includes("seo")) return "Needs SEO";
  if (missing.includes("details")) return "Needs Content";
  return "Needs Review";
}

async function main() {
  loadEnvLocal();
  const mysql = require("mysql2/promise");
  const host = process.env.DB_HOST;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const database = process.env.DB_NAME;
  const port = Number(process.env.DB_PORT) || 3306;
  if (!host || !user || !password || !database) {
    console.error("FAIL: Missing DB env");
    process.exit(1);
  }

  console.log(`Mode: READ-ONLY`);
  console.log(`Target DB: ${user}@${host}:${port}/${database}\n`);

  const db = await mysql.createConnection({ host, user, password, database, port });
  const [rows] = await db.query(
    `SELECT id, name, slug, category, active, price,
            description, short_description, full_description, image, features,
            seo_title, meta_description, focus_keyword, og_image
     FROM products
     ORDER BY id ASC`
  );
  await db.end();

  console.log(
    "ID\tSlug\tCategory\tActive\tdesc\tshort\tfull\timage\tfeat\tseo_t\tmeta\tfocus\toimg\tStatus"
  );
  for (const r of rows || []) {
    const status = classify(r);
    console.log(
      [
        r.id,
        r.slug || "",
        r.category || "",
        Number(r.active) === 1 ? 1 : 0,
        state(r.description),
        state(r.short_description),
        state(r.full_description),
        state(r.image),
        state(r.features),
        state(r.seo_title),
        state(r.meta_description),
        state(r.focus_keyword),
        state(r.og_image),
        status,
      ].join("\t")
    );
  }
  console.log(`\nTotal products: ${(rows || []).length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
