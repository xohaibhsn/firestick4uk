/**
 * F4UK-MULTI-127 — order_idempotency_keys side table. Never imported by runtime/build/API. Professor applies via his own Firestick phpMyAdmin for live.
 *
 * DEFAULT / --check : prints SQL + SHA256; does NOT load .env*; does NOT connect.
 * --apply : WRITE — requires:
 *   1) --expect-db <exact DB_NAME>
 *   2) ALLOW_DB_MUTATION_TESTS=YES_I_UNDERSTAND
 *   3) process.env.DB_NAME === --expect-db value
 *
 * Never imported by runtime/build/API. Professor applies via his own Firestick phpMyAdmin for live.
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

/** Exact MULTI-127 SQL body (stable for hashing / phpMyAdmin paste). */
const SQL_BODY = `SET NAMES utf8mb4;
CREATE TABLE IF NOT EXISTS order_idempotency_keys (
  idempotency_key CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'client UUID v4 lowercase',
  request_hash    CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'sha256 of canonical order request; no raw PII',
  order_id        VARCHAR(20) NOT NULL,
  created_at      DATETIME(3) NOT NULL,
  PRIMARY KEY (idempotency_key),
  UNIQUE KEY uq_oik_order_id (order_id),
  KEY idx_oik_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`.trim();

/** Read-only; owner runs BEFORE the CREATE. */
const PREFLIGHT_SQL = `SELECT DATABASE() AS db, VERSION() AS version;
SELECT TABLE_NAME, ENGINE, TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('orders','order_items','order_idempotency_keys');`.trim();

/** Read-only; owner runs AFTER the CREATE. */
const VERIFY_SQL = `SHOW CREATE TABLE order_idempotency_keys;
SELECT COUNT(*) AS key_rows FROM order_idempotency_keys;`.trim();

/** NOT APPROVED — separate owner approval, only if key_rows = 0. */
const ROLLBACK_TEXT = `DROP TABLE order_idempotency_keys;`.trim();

function sha256Hex(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function sqlBodySha256(body = SQL_BODY) {
  return sha256Hex(body);
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
  console.log("=== migrate-order-idempotency ===");
  console.log("Mode:", APPLY ? "APPLY" : "CHECK");
  console.log("SQL_BODY_SHA256:", hash);
  console.log("--- SQL_BODY (paste into Firestick phpMyAdmin only) ---");
  console.log(SQL_BODY);
  console.log("--- end SQL_BODY ---");
  console.log("PREFLIGHT_SQL_SHA256:", sha256Hex(PREFLIGHT_SQL));
  console.log("--- PREFLIGHT_SQL (read-only; owner runs BEFORE the CREATE) ---");
  console.log(PREFLIGHT_SQL);
  console.log("--- end PREFLIGHT_SQL ---");
  console.log("VERIFY_SQL_SHA256:", sha256Hex(VERIFY_SQL));
  console.log("--- VERIFY_SQL (read-only; owner runs AFTER the CREATE) ---");
  console.log(VERIFY_SQL);
  console.log("--- end VERIFY_SQL ---");
  console.log(
    "ROLLBACK_TEXT_SHA256:",
    sha256Hex(ROLLBACK_TEXT),
    '(labelled "NOT APPROVED — separate owner approval, only if key_rows = 0")'
  );
  console.log(
    '--- ROLLBACK_TEXT (NOT APPROVED — separate owner approval, only if key_rows = 0) ---'
  );
  console.log(ROLLBACK_TEXT);
  console.log("--- end ROLLBACK_TEXT ---");
  console.log("Table: order_idempotency_keys (CREATE IF NOT EXISTS; no FOREIGN KEY)");
  console.log("No email / phone / name / IP / address columns by design.");
}

async function main() {
  const hash = sqlBodySha256();
  printPlan(hash);

  if (!APPLY) {
    console.log("CHECK complete. No .env loaded. No DB connection. No schema changes.");
    console.log(
      "To apply later (requires approval): node scripts/migrate-order-idempotency.js --apply --expect-db <DB_NAME>"
    );
    process.exit(0);
  }

  if (!EXPECT_DB) {
    console.error("REFUSED: --apply requires --expect-db <exact DB_NAME>");
    process.exit(1);
  }

  require("./testMutationGuard").requireMutationOptIn("migrate-order-idempotency");
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
    console.log("SUCCESS: order_idempotency_keys ready (idempotent CREATE IF NOT EXISTS)");
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
  PREFLIGHT_SQL,
  VERIFY_SQL,
  ROLLBACK_TEXT,
  sqlBodySha256,
  APPLY,
  EXPECT_DB,
};
