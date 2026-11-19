/**
 * F4UK-MULTI-140 — content_drafts side table (Draft/Publish D1).
 * Never imported by runtime/build/API. Owner applies via Firestick phpMyAdmin only.
 *
 * CHECK-ONLY script: --check / --help / (no args) prints SQL + SHA256.
 * Does NOT load environment files; does NOT connect; there is NO --apply mode.
 */
"use strict";

const crypto = require("crypto");

const args = process.argv.slice(2).filter((a) => a !== "--");
const HELP = args.includes("--help") || args.includes("-h");
const CHECK_FLAG = args.includes("--check");
const UNKNOWN = args.filter((a) => a !== "--check" && a !== "--help" && a !== "-h");

/** Exact MULTI-140 SQL body (stable for hashing / phpMyAdmin paste). */
const SQL_BODY = `SET NAMES utf8mb4;
CREATE TABLE IF NOT EXISTS content_drafts (
  id                  BIGINT NOT NULL AUTO_INCREMENT,
  entity_type         VARCHAR(30) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'phase 1: site_content_page',
  entity_id           VARCHAR(191) NOT NULL COMMENT 'page_name for site_content_page',
  draft_json          LONGTEXT NOT NULL COMMENT 'changed keys only: {key:{value,base_hash}}; no secrets',
  draft_version       INT NOT NULL DEFAULT 1,
  created_by_name     VARCHAR(255) NOT NULL,
  created_by_staff_id INT NULL,
  updated_by_name     VARCHAR(255) NOT NULL,
  updated_by_staff_id INT NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cd_entity (entity_type, entity_id),
  KEY idx_cd_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`.trim();

/** Read-only; owner runs BEFORE the CREATE. Hard-coded TABLE_SCHEMA (not DATABASE() as filter). */
const PREFLIGHT_SQL = `SELECT DATABASE() AS current_db, VERSION() AS version;
SELECT TABLE_NAME, ENGINE, TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA = 'u992747032_firestick4uk' AND TABLE_NAME IN ('site_content','content_revisions','content_drafts');`.trim();

/** Read-only; owner runs AFTER the CREATE. */
const VERIFY_SQL = `SELECT TABLE_NAME, ENGINE, TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA = 'u992747032_firestick4uk' AND TABLE_NAME = 'content_drafts';
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'u992747032_firestick4uk' AND TABLE_NAME = 'content_drafts' ORDER BY ORDINAL_POSITION;
SELECT INDEX_NAME, NON_UNIQUE, COLUMN_NAME, SEQ_IN_INDEX FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = 'u992747032_firestick4uk' AND TABLE_NAME = 'content_drafts' ORDER BY INDEX_NAME, SEQ_IN_INDEX;
SELECT COUNT(*) AS draft_rows FROM u992747032_firestick4uk.content_drafts;`.trim();

/** NOT APPROVED — separate owner approval, only if draft_rows = 0. */
const ROLLBACK_TEXT = `DROP TABLE u992747032_firestick4uk.content_drafts;`.trim();

function sha256Hex(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function sqlBodySha256(body = SQL_BODY) {
  return sha256Hex(body);
}

function printHelp() {
  console.log("Usage: node scripts/migrate-content-drafts.js [--check|--help]");
  console.log("CHECK-ONLY: prints SQL_BODY / PREFLIGHT / VERIFY / ROLLBACK with SHA256.");
  console.log("No .env load. No DB connection. No --apply mode.");
}

function printPlan(hash) {
  console.log("=== migrate-content-drafts ===");
  console.log("Mode: CHECK");
  console.log("SQL_BODY_SHA256:", hash);
  console.log("--- BEGIN SQL_BODY ---");
  console.log(SQL_BODY);
  console.log("--- END SQL_BODY ---");
  console.log("PREFLIGHT_SQL_SHA256:", sha256Hex(PREFLIGHT_SQL));
  console.log("--- BEGIN PREFLIGHT_SQL ---");
  console.log(PREFLIGHT_SQL);
  console.log("--- END PREFLIGHT_SQL ---");
  console.log("VERIFY_SQL_SHA256:", sha256Hex(VERIFY_SQL));
  console.log("--- BEGIN VERIFY_SQL ---");
  console.log(VERIFY_SQL);
  console.log("--- END VERIFY_SQL ---");
  console.log(
    "ROLLBACK_TEXT_SHA256:",
    sha256Hex(ROLLBACK_TEXT),
    '(labelled "NOT APPROVED - separate owner approval, only if draft_rows = 0")'
  );
  console.log(
    '--- BEGIN ROLLBACK_TEXT (NOT APPROVED - separate owner approval, only if draft_rows = 0) ---'
  );
  console.log(ROLLBACK_TEXT);
  console.log("--- END ROLLBACK_TEXT ---");
  console.log("Table: content_drafts (CREATE IF NOT EXISTS; no FOREIGN KEY)");
  console.log("CHECK complete. No .env loaded. No DB connection. No schema changes.");
}

function main() {
  if (UNKNOWN.length > 0) {
    console.error("REFUSED: check-only script");
    process.exit(1);
  }

  if (HELP && !CHECK_FLAG && args.length > 0) {
    printHelp();
    process.exit(0);
  }

  // Default (no args) or --check: print plan and exit 0.
  const hash = sqlBodySha256();
  printPlan(hash);
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = {
  SQL_BODY,
  PREFLIGHT_SQL,
  VERIFY_SQL,
  ROLLBACK_TEXT,
  sqlBodySha256,
};
