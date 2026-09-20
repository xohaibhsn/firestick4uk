/**
 * Phase 8 — one-time media_assets schema + CMS media backfill.
 * DEFAULT / --check : READ ONLY
 * --apply : WRITE (requires ALLOW_DB_MUTATION_TESTS=YES_I_UNDERSTAND)
 *
 * Does NOT modify products/blog/site_content source rows.
 * Does NOT index receipts.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

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

const APPLY = process.argv.includes("--apply");

function hashUrl(url) {
  return crypto.createHash("sha256").update(String(url || "").trim()).digest("hex");
}

function detectProvider(url) {
  const u = String(url || "");
  const cloud = process.env.CLOUDINARY_CLOUD_NAME || "";
  if (cloud && u.includes(`res.cloudinary.com/${cloud}/`)) return "cloudinary";
  if (u.includes("res.cloudinary.com/")) return "cloudinary";
  if (u.startsWith("/uploads/")) return "local";
  return "external";
}

async function tableExists(db, schema, table) {
  const [rows] = await db.query(
    `SELECT 1 AS ok FROM information_schema.tables
     WHERE table_schema=? AND table_name=? LIMIT 1`,
    [schema, table]
  );
  return rows.length > 0;
}

async function indexExists(db, schema, table, indexName) {
  const [rows] = await db.query(
    `SELECT 1 AS ok FROM information_schema.statistics
     WHERE table_schema=? AND table_name=? AND index_name=? LIMIT 1`,
    [schema, table, indexName]
  );
  return rows.length > 0;
}

async function collectCandidates(db) {
  /** @type {Array<{url:string,purpose:string}>} */
  const candidates = [];

  try {
    const [products] = await db.query(
      `SELECT image, og_image FROM products
       WHERE (image IS NOT NULL AND image <> '')
          OR (og_image IS NOT NULL AND og_image <> '')`
    );
    for (const p of products || []) {
      if (p.image && String(p.image).trim()) candidates.push({ url: String(p.image).trim(), purpose: "products" });
      if (p.og_image && String(p.og_image).trim()) candidates.push({ url: String(p.og_image).trim(), purpose: "products" });
    }
  } catch {
    /* products table missing */
  }

  try {
    const [posts] = await db.query(
      `SELECT featured_image FROM blog_posts
       WHERE featured_image IS NOT NULL AND featured_image <> ''`
    );
    for (const p of posts || []) {
      if (p.featured_image && String(p.featured_image).trim()) {
        candidates.push({ url: String(p.featured_image).trim(), purpose: "blog" });
      }
    }
  } catch {
    /* blog missing */
  }

  const keyPurpose = {
    site_logo_url: "logo",
    favicon_url: "favicon",
    og_default_image: "og",
    whatsapp_icon_url: "whatsapp",
    hero_slide_1: "hero",
    hero_slide_2: "hero",
    hero_slide_3: "hero",
    hero_slide_4: "hero",
  };
  try {
    const keys = Object.keys(keyPurpose);
    const ph = keys.map(() => "?").join(",");
    const [rows] = await db.query(
      `SELECT content_key, content_value FROM site_content
       WHERE content_key IN (${ph}) AND content_value IS NOT NULL AND content_value <> ''`,
      keys
    );
    for (const r of rows || []) {
      const purpose = keyPurpose[r.content_key];
      const url = String(r.content_value || "").trim();
      if (purpose && url) candidates.push({ url, purpose });
    }
  } catch {
    /* site_content missing */
  }

  // Deduplicate by url_hash+purpose
  const seen = new Set();
  const unique = [];
  for (const c of candidates) {
    const key = `${hashUrl(c.url)}:${c.purpose}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(c);
  }
  return unique;
}

async function main() {
  loadEnvLocal();
  if (APPLY) {
    require("./testMutationGuard").requireMutationOptIn("migrate-media-library");
  }

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

  console.log(`Mode: ${APPLY ? "APPLY" : "CHECK"}`);
  console.log(`Target DB: ${user}@${host}:${port}/${database}\n`);

  const db = await mysql.createConnection({ host, user, password, database, port });
  const pending = [];

  const exists = await tableExists(db, database, "media_assets");
  if (!exists) {
    pending.push({
      category: "schema",
      description: "CREATE TABLE media_assets",
      run: async (conn) => {
        await conn.query(`
          CREATE TABLE IF NOT EXISTS media_assets (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            url VARCHAR(1000) NOT NULL,
            url_hash CHAR(64) NOT NULL,
            public_id VARCHAR(500) NULL,
            provider VARCHAR(30) NOT NULL,
            purpose VARCHAR(50) NOT NULL,
            original_name VARCHAR(255) NULL,
            mime_type VARCHAR(100) NULL,
            format VARCHAR(50) NULL,
            bytes BIGINT NULL,
            width INT NULL,
            height INT NULL,
            resource_type VARCHAR(50) NULL,
            source VARCHAR(30) NOT NULL DEFAULT 'upload',
            uploaded_by_type VARCHAR(20) NULL,
            uploaded_by_staff_id INT NULL,
            uploaded_by_name VARCHAR(255) NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_media_url_purpose (url_hash, purpose),
            KEY idx_media_created (created_at),
            KEY idx_media_purpose (purpose),
            KEY idx_media_provider (provider),
            KEY idx_media_uploader (uploaded_by_staff_id)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
      },
    });
  } else {
    for (const [idx, desc] of [
      ["uniq_media_url_purpose", "UNIQUE (url_hash, purpose)"],
      ["idx_media_created", "KEY created_at"],
      ["idx_media_purpose", "KEY purpose"],
      ["idx_media_provider", "KEY provider"],
      ["idx_media_uploader", "KEY uploaded_by_staff_id"],
    ]) {
      if (!(await indexExists(db, database, "media_assets", idx))) {
        pending.push({
          category: "schema",
          description: `ADD INDEX ${idx} (${desc})`,
          run: async (conn) => {
            if (idx === "uniq_media_url_purpose") {
              await conn.query(
                "ALTER TABLE media_assets ADD UNIQUE KEY uniq_media_url_purpose (url_hash, purpose)"
              );
            } else if (idx === "idx_media_created") {
              await conn.query("ALTER TABLE media_assets ADD KEY idx_media_created (created_at)");
            } else if (idx === "idx_media_purpose") {
              await conn.query("ALTER TABLE media_assets ADD KEY idx_media_purpose (purpose)");
            } else if (idx === "idx_media_provider") {
              await conn.query("ALTER TABLE media_assets ADD KEY idx_media_provider (provider)");
            } else if (idx === "idx_media_uploader") {
              await conn.query(
                "ALTER TABLE media_assets ADD KEY idx_media_uploader (uploaded_by_staff_id)"
              );
            }
          },
        });
      }
    }
  }

  const candidates = await collectCandidates(db);
  let missingBackfill = [];
  if (exists) {
    for (const c of candidates) {
      const h = hashUrl(c.url);
      const [rows] = await db.query(
        "SELECT id FROM media_assets WHERE url_hash=? AND purpose=? LIMIT 1",
        [h, c.purpose]
      );
      if (!rows.length) missingBackfill.push(c);
    }
  } else {
    missingBackfill = candidates;
  }

  for (const c of missingBackfill) {
    pending.push({
      category: "backfill",
      description: `INDEX ${c.purpose}: ${c.url.slice(0, 80)}`,
      purpose: c.purpose,
      provider: detectProvider(c.url),
      run: async (conn) => {
        await conn.query(
          `INSERT IGNORE INTO media_assets
            (url, url_hash, public_id, provider, purpose, source)
           VALUES (?, ?, NULL, ?, ?, 'backfill')`,
          [c.url, hashUrl(c.url), detectProvider(c.url), c.purpose]
        );
      },
    });
  }

  console.log("========== PENDING ACTIONS ==========");
  if (!pending.length) {
    console.log("(none)\n");
  } else {
    for (const p of pending) {
      console.log(`[${p.category}] ${p.description}`);
    }
    console.log("");
  }
  console.log(`Pending: ${pending.length}`);

  const byPurpose = {};
  for (const p of pending.filter((x) => x.category === "backfill")) {
    byPurpose[p.purpose] = (byPurpose[p.purpose] || 0) + 1;
  }
  if (Object.keys(byPurpose).length) {
    console.log("Pending backfill by purpose:", byPurpose);
  }

  if (!APPLY) {
    console.log("\nNo changes made");
    await db.end();
    process.exit(0);
  }

  console.log("\n========== APPLYING ==========");
  for (const p of pending) {
    try {
      await p.run(db);
      console.log(`OK [${p.category}] ${p.description.slice(0, 100)}`);
    } catch (e) {
      console.error(`FAIL [${p.category}] ${p.description}:`, e.message);
      await db.end();
      process.exit(1);
    }
  }

  // Re-check
  const existsAfter = await tableExists(db, database, "media_assets");
  let remaining = 0;
  if (existsAfter) {
    const again = await collectCandidates(db);
    for (const c of again) {
      const [rows] = await db.query(
        "SELECT id FROM media_assets WHERE url_hash=? AND purpose=? LIMIT 1",
        [hashUrl(c.url), c.purpose]
      );
      if (!rows.length) remaining++;
    }
  } else {
    remaining = 1;
  }

  const [counts] = await db.query(
    `SELECT purpose, provider, COUNT(*) AS c FROM media_assets GROUP BY purpose, provider ORDER BY purpose, provider`
  );
  console.log("\nBackfilled/index counts:");
  for (const r of counts || []) {
    console.log(`  ${r.purpose}/${r.provider}: ${r.c}`);
  }
  console.log(`\nPending after apply: ${remaining}`);
  await db.end();
  process.exit(remaining === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
