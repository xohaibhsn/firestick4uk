/**
 * F4UK-MULTI-97 — customer_reviews table.
 *
 * DEFAULT / --check : prints SQL + SHA256; does NOT load .env*; does NOT connect.
 * --apply : WRITE — requires:
 *   1) --expect-db <exact DB_NAME>
 *   2) ALLOW_DB_MUTATION_TESTS=YES_I_UNDERSTAND
 *   3) process.env.DB_NAME === --expect-db value
 *
 * Never imported by runtime/build/API. Professor applies via phpMyAdmin for live.
 */
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const APPLY = process.argv.includes("--apply");

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= process.argv.length) return null;
  return String(process.argv[idx + 1] || "").trim() || null;
}

const EXPECT_DB = argValue("--expect-db");

/** Exact section-M SQL body (stable for hashing / phpMyAdmin paste). */
const SQL_BODY = `SET NAMES utf8mb4;
CREATE TABLE IF NOT EXISTS customer_reviews (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  status         ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  display_name   VARCHAR(80)  NOT NULL,
  rating         TINYINT UNSIGNED NOT NULL,
  review_text    TEXT NOT NULL,
  original_text  TEXT NULL COMMENT 'set on first admin edit; never shown publicly',
  product_id     INT NULL,
  order_id       VARCHAR(20) NULL,
  is_verified    TINYINT(1) NOT NULL DEFAULT 0,
  text_hash      CHAR(64) NOT NULL COMMENT 'sha256 of normalised text for duplicate guard',
  consent_at     DATETIME(3) NOT NULL,
  created_at     DATETIME(3) NOT NULL,
  moderated_at   DATETIME(3) NULL,
  moderated_by   VARCHAR(100) NULL,
  edited_at      DATETIME(3) NULL,
  edit_note      VARCHAR(255) NULL,
  PRIMARY KEY (id),
  KEY idx_status_created (status, created_at),
  KEY idx_product_status (product_id, status),
  KEY idx_text_hash (text_hash),
  CONSTRAINT chk_rating CHECK (rating BETWEEN 1 AND 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`.trim();

function sqlBodySha256(body = SQL_BODY) {
  return crypto.createHash("sha256").update(body, "utf8").digest("hex");
}

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

function splitStatements(sql) {
  return sql
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function printPlan(hash) {
  console.log("=== migrate-customer-reviews ===");
  console.log("Mode:", APPLY ? "APPLY" : "CHECK");
  console.log("SQL_BODY_SHA256:", hash);
  console.log("--- SQL (paste into Firestick phpMyAdmin only) ---");
  console.log(SQL_BODY);
  console.log("--- end SQL ---");
  console.log("Table: customer_reviews (CREATE IF NOT EXISTS)");
  console.log("No email / IP columns by design.");
}

async function main() {
  const hash = sqlBodySha256();
  printPlan(hash);

  if (!APPLY) {
    console.log("CHECK complete. No .env loaded. No DB connection. No schema changes.");
    console.log(
      "To apply later (requires approval): node scripts/migrate-customer-reviews.js --apply --expect-db <DB_NAME>"
    );
    process.exit(0);
  }

  if (!EXPECT_DB) {
    console.error("REFUSED: --apply requires --expect-db <exact DB_NAME>");
    process.exit(1);
  }

  require("./testMutationGuard").requireMutationOptIn("migrate-customer-reviews");
  loadEnvLocal();

  const schema = process.env.DB_NAME;
  if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_PASSWORD || !schema) {
    console.error("REFUSED: Missing DB_HOST / DB_USER / DB_PASSWORD / DB_NAME");
    process.exit(1);
  }
  if (schema !== EXPECT_DB) {
    console.error(
      `REFUSED: DB_NAME "${schema}" does not match --expect-db "${EXPECT_DB}"`
    );
    process.exit(1);
  }

  const mysql = require("mysql2/promise");
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: schema,
    port: Number(process.env.DB_PORT) || 3306,
    multipleStatements: false,
  });

  try {
    console.log(`Target DB: ${process.env.DB_USER}@${process.env.DB_HOST}/${schema}`);
    for (const stmt of splitStatements(SQL_BODY)) {
      await conn.query(stmt);
    }
    console.log("SUCCESS: customer_reviews ready (idempotent CREATE IF NOT EXISTS)");
    console.log("SQL_BODY_SHA256:", hash);
  } finally {
    await conn.end();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error("FAIL:", err && err.message ? err.message : err);
    process.exit(1);
  });
}

module.exports = {
  SQL_BODY,
  sqlBodySha256,
  APPLY,
  EXPECT_DB,
};
