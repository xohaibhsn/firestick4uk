/**
 * One-time idempotent migration: create url_redirects.
 * Run: node scripts/migrate-url-redirects.js
 * Does NOT run on API requests or builds.
 *
 * RM-B1: do NOT execute against production until RM-B1M / approved migration window.
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

    for (const sql of [
      "ALTER TABLE url_redirects ADD UNIQUE KEY uq_url_redirects_source (source_path)",
      "ALTER TABLE url_redirects ADD KEY idx_url_redirects_active (active)",
      "ALTER TABLE url_redirects ADD KEY idx_url_redirects_updated (updated_at)",
    ]) {
      try {
        await conn.query(sql);
      } catch {
        /* already exists */
      }
    }

    const [rows] = await conn.query(
      `SELECT COUNT(*) AS c
       FROM information_schema.tables
       WHERE table_schema = ? AND table_name = 'url_redirects'`,
      [database]
    );
    const exists = Number(rows[0]?.c || 0) > 0;
    if (!exists) {
      console.error("FAIL: url_redirects not found after CREATE");
      process.exit(1);
    }

    console.log("SUCCESS: url_redirects is ready");
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error("FAIL:", err?.message || err);
  process.exit(1);
});
