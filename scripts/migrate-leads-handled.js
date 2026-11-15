/**
 * F4UK-MULTI-105 — chat_leads.handled / handled_at columns.
 *
 * DEFAULT / --check : prints exact ALTER + SHA256; does NOT load .env*; does NOT connect.
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

/** Exact SQL body (stable for hashing / phpMyAdmin paste). Schema prefix for Professor. */
const SQL_BODY = `ALTER TABLE u992747032_firestick4uk.chat_leads
  ADD COLUMN handled TINYINT(1) NOT NULL DEFAULT 0 AFTER chat_history,
  ADD COLUMN handled_at DATETIME NULL AFTER handled;`.trim();

const PRECHECK_SQL = `SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'u992747032_firestick4uk'
  AND TABLE_NAME = 'chat_leads'
  AND COLUMN_NAME IN ('handled', 'handled_at', 'chat_history')
ORDER BY ORDINAL_POSITION;`.trim();

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

function printPlan(hash) {
  console.log("=== migrate-leads-handled ===");
  console.log("Mode:", APPLY ? "APPLY" : "CHECK");
  console.log("SQL_BODY_SHA256:", hash);
  console.log("--- PRECHECK (read-only) ---");
  console.log(PRECHECK_SQL);
  console.log("--- ALTER (paste into Firestick phpMyAdmin only) ---");
  console.log(SQL_BODY);
  console.log("--- end SQL ---");
  console.log("Table: chat_leads (ADD handled + handled_at)");
}

async function main() {
  const hash = sqlBodySha256();
  printPlan(hash);

  if (!APPLY) {
    console.log("CHECK complete. No .env loaded. No DB connection. No schema changes.");
    console.log(
      "To apply locally only: ALLOW_DB_MUTATION_TESTS=YES_I_UNDERSTAND node scripts/migrate-leads-handled.js --apply --expect-db <DB_NAME>"
    );
    return;
  }

  if (process.env.ALLOW_DB_MUTATION_TESTS !== "YES_I_UNDERSTAND") {
    console.error("REFUSED: set ALLOW_DB_MUTATION_TESTS=YES_I_UNDERSTAND for --apply");
    process.exit(2);
  }
  if (!EXPECT_DB) {
    console.error("REFUSED: --expect-db <exact DB_NAME> required for --apply");
    process.exit(2);
  }

  loadEnvLocal();
  if (!process.env.DB_NAME || process.env.DB_NAME !== EXPECT_DB) {
    console.error("REFUSED: process.env.DB_NAME must equal --expect-db value");
    process.exit(2);
  }

  // Local apply only — strip schema qualifier; use connected DB.
  const localSql = SQL_BODY.replace(/^ALTER TABLE u992747032_firestick4uk\.chat_leads/m, "ALTER TABLE chat_leads");

  const mysql = require("mysql2/promise");
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT) || 3306,
  });
  try {
    const [cols] = await conn.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'chat_leads' AND COLUMN_NAME = 'handled'`
    );
    if (Array.isArray(cols) && cols.length) {
      console.log("SKIP: handled column already present");
      return;
    }
    await conn.query(localSql);
    console.log("APPLY complete.");
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error("migrate-leads-handled failed:", err && err.message ? err.message : err);
  process.exit(1);
});
