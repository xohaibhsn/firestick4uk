/**
 * One-time idempotent migration: create url_redirects.
 * Run: node scripts/migrate-url-redirects.js
 * Does NOT run on API requests or builds.
 *
 * RM-B1/B1.1: do NOT execute against production until RM-B1M / approved migration window.
 */
const fs = require("fs");
const path = require("path");

const REQUIRED_INDEXES = [
  { name: "uq_url_redirects_source", unique: true, column: "source_path" },
  { name: "idx_url_redirects_active", unique: false, column: "active" },
  { name: "idx_url_redirects_updated", unique: false, column: "updated_at" },
];

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

async function indexExists(conn, database, indexName) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS c
     FROM information_schema.statistics
     WHERE table_schema = ?
       AND table_name = 'url_redirects'
       AND index_name = ?`,
    [database, indexName]
  );
  return Number(rows[0]?.c || 0) > 0;
}

async function ensureIndex(conn, database, spec) {
  const exists = await indexExists(conn, database, spec.name);
  if (exists) {
    console.log(`OK [index] ${spec.name} already exists — skip`);
    return;
  }

  const unique = spec.unique ? "UNIQUE KEY" : "KEY";
  const sql = `ALTER TABLE url_redirects ADD ${unique} ${spec.name} (${spec.column})`;
  console.log(`RUN [index] ${sql}`);
  try {
    await conn.query(sql);
  } catch (err) {
    console.error(`FAIL [index] ${spec.name}:`, err?.message || err);
    process.exit(1);
  }

  const verified = await indexExists(conn, database, spec.name);
  if (!verified) {
    console.error(`FAIL [index] ${spec.name} missing after ALTER`);
    process.exit(1);
  }
  console.log(`OK [index] ${spec.name} created`);
}

async function main() {
  loadEnvLocal();

  const host = process.env.DB_HOST;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const database = process.env.DB_NAME;
  const port = Number(process.env.DB_PORT) || 3306;

  if (!host || !user || !password || !database) {
    console.error("FAIL: Missing DB_HOST / DB_USER / DB_PASSWORD / DB_NAME");
    process.exit(1);
  }

  console.log(`Target DB: ${user}@${host}:${port}/${database}`);

  const mysql = require("mysql2/promise");
  const conn = await mysql.createConnection({ host, user, password, database, port });

  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS url_redirects (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        source_path VARCHAR(512) NOT NULL,
        destination_path VARCHAR(512) NOT NULL,
        redirect_type SMALLINT NOT NULL DEFAULT 308,
        active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_url_redirects_source (source_path),
        KEY idx_url_redirects_active (active),
        KEY idx_url_redirects_updated (updated_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    for (const spec of REQUIRED_INDEXES) {
      await ensureIndex(conn, database, spec);
    }

    const [tableRows] = await conn.query(
      `SELECT COUNT(*) AS c
       FROM information_schema.tables
       WHERE table_schema = ? AND table_name = 'url_redirects'`,
      [database]
    );
    if (!(Number(tableRows[0]?.c || 0) > 0)) {
      console.error("FAIL: url_redirects not found after CREATE");
      process.exit(1);
    }

    for (const spec of REQUIRED_INDEXES) {
      const ok = await indexExists(conn, database, spec.name);
      if (!ok) {
        console.error(`FAIL: required index missing: ${spec.name}`);
        process.exit(1);
      }
    }

    console.log("SUCCESS: url_redirects table and required indexes are ready");
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error("FAIL:", err?.message || err);
  process.exit(1);
});
