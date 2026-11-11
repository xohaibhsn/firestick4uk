/**
 * F4UK Sidhu Insights schema — CHECK by default; APPLY only with explicit gates.
 *
 * DEFAULT / --check : prints plan + SQL body SHA256; does NOT load .env*;
 *   does NOT connect; makes NO change.
 * --apply : WRITE — requires:
 *   1) --expect-db <exact DB_NAME>
 *   2) ALLOW_DB_MUTATION_TESTS=YES_I_UNDERSTAND
 *   3) process.env.DB_NAME === --expect-db value
 *
 * Never imported by runtime/build/API. Do not run against production without
 * Professor approval + backup.
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

/** SQL body applied (CREATE IF NOT EXISTS + default rows). Stable for hashing. */
const SQL_BODY = `
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS insights_sessions (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  session_id            CHAR(36) NOT NULL COMMENT 'UUID v4 first-party session',
  visitor_id            CHAR(36) NOT NULL COMMENT 'UUID v4 first-party visitor; rotated on expiry',
  started_at            DATETIME(3) NOT NULL,
  last_seen_at          DATETIME(3) NOT NULL,
  ended_at              DATETIME(3) NULL,
  duration_ms           INT UNSIGNED NULL,
  is_new_visitor        TINYINT(1) NOT NULL DEFAULT 1,
  is_returning          TINYINT(1) NOT NULL DEFAULT 0,
  is_bot                TINYINT(1) NOT NULL DEFAULT 0,
  bot_score             TINYINT UNSIGNED NULL COMMENT '0-100 heuristic; NULL if unchecked',
  landing_path          VARCHAR(512) NOT NULL DEFAULT '/',
  exit_path             VARCHAR(512) NULL,
  referrer_host         VARCHAR(255) NULL,
  referrer_path         VARCHAR(512) NULL,
  utm_source            VARCHAR(128) NULL,
  utm_medium            VARCHAR(128) NULL,
  utm_campaign          VARCHAR(128) NULL,
  utm_term              VARCHAR(128) NULL,
  utm_content           VARCHAR(128) NULL,
  gclid                 VARCHAR(128) NULL,
  fbclid                VARCHAR(128) NULL,
  msclkid               VARCHAR(128) NULL,
  wbraid                VARCHAR(128) NULL,
  gbraid                VARCHAR(128) NULL,
  ip_address            VARCHAR(45) NULL COMMENT 'Full or masked; super_admin UI only for full',
  ip_masked             TINYINT(1) NOT NULL DEFAULT 0,
  ip_masked_at          DATETIME(3) NULL,
  country_code          CHAR(2) NULL,
  country_name          VARCHAR(128) NULL,
  region_name           VARCHAR(128) NULL,
  city_name             VARCHAR(128) NULL,
  asn                   INT UNSIGNED NULL,
  network_provider      VARCHAR(255) NULL COMMENT 'AS org / provider label',
  geo_source            ENUM('city_lite','country_lite','asn_lite','unknown','missing_file') NOT NULL DEFAULT 'unknown',
  device_type           ENUM('desktop','mobile','tablet','other','unknown') NOT NULL DEFAULT 'unknown',
  browser_name          VARCHAR(64) NULL,
  browser_version       VARCHAR(32) NULL,
  os_name               VARCHAR(64) NULL,
  os_version            VARCHAR(32) NULL,
  language              VARCHAR(32) NULL,
  screen_w              SMALLINT UNSIGNED NULL,
  screen_h              SMALLINT UNSIGNED NULL,
  pageview_count        INT UNSIGNED NOT NULL DEFAULT 0,
  event_count           INT UNSIGNED NOT NULL DEFAULT 0,
  order_id              VARCHAR(64) NULL COMMENT 'Linked when Place Order succeeds',
  consent_analytics     TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'Must be 1 to insert',
  created_at            DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at            DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_insights_sessions_session_id (session_id),
  KEY idx_insights_sessions_visitor_started (visitor_id, started_at),
  KEY idx_insights_sessions_started (started_at),
  KEY idx_insights_sessions_geo (country_code, region_name(64), city_name(64), started_at),
  KEY idx_insights_sessions_source (utm_source, utm_medium, started_at),
  KEY idx_insights_sessions_gclid (gclid),
  KEY idx_insights_sessions_order (order_id),
  KEY idx_insights_sessions_ip_mask (ip_masked, started_at),
  KEY idx_insights_sessions_bot (is_bot, started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS insights_events (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  session_id            CHAR(36) NOT NULL,
  visitor_id            CHAR(36) NOT NULL,
  event_time            DATETIME(3) NOT NULL,
  event_type            VARCHAR(64) NOT NULL COMMENT 'page_view|scroll_depth|click|search|error|checkout_*|...',
  path                  VARCHAR(512) NOT NULL,
  title                 VARCHAR(255) NULL COMMENT 'document.title truncated; never form field values',
  referrer_path         VARCHAR(512) NULL,
  props_json            JSON NULL,
  time_on_page_ms       INT UNSIGNED NULL,
  scroll_depth_pct      TINYINT UNSIGNED NULL COMMENT '0-100 max watermark',
  click_id              VARCHAR(64) NULL COMMENT 'Taxonomy id e.g. cart_add, mini_checkout',
  search_term           VARCHAR(128) NULL COMMENT 'site search query only; truncated/lowercased',
  http_status           SMALLINT UNSIGNED NULL COMMENT '404 etc when known',
  error_kind            VARCHAR(64) NULL COMMENT 'js_error|receipt_error_name|...',
  error_name            VARCHAR(128) NULL COMMENT 'Error name only; never stack with secrets',
  order_id              VARCHAR(64) NULL,
  created_at            DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_insights_events_session_time (session_id, event_time),
  KEY idx_insights_events_visitor_time (visitor_id, event_time),
  KEY idx_insights_events_type_time (event_type, event_time),
  KEY idx_insights_events_path_time (path(191), event_time),
  KEY idx_insights_events_click (click_id, event_time),
  KEY idx_insights_events_order (order_id),
  CONSTRAINT fk_insights_events_session
    FOREIGN KEY (session_id) REFERENCES insights_sessions (session_id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS insights_daily_summary (
  summary_date          DATE NOT NULL,
  visitors              INT UNSIGNED NOT NULL DEFAULT 0,
  sessions              INT UNSIGNED NOT NULL DEFAULT 0,
  pageviews             INT UNSIGNED NOT NULL DEFAULT 0,
  new_visitors          INT UNSIGNED NOT NULL DEFAULT 0,
  returning_visitors    INT UNSIGNED NOT NULL DEFAULT 0,
  bot_sessions          INT UNSIGNED NOT NULL DEFAULT 0,
  orders_attributed     INT UNSIGNED NOT NULL DEFAULT 0,
  add_to_cart           INT UNSIGNED NOT NULL DEFAULT 0,
  checkout_starts       INT UNSIGNED NOT NULL DEFAULT 0,
  place_order_clicks    INT UNSIGNED NOT NULL DEFAULT 0,
  avg_session_ms        INT UNSIGNED NULL,
  bounce_sessions       INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at            DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (summary_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS insights_geo_daily (
  summary_date          DATE NOT NULL,
  country_code          CHAR(2) NOT NULL DEFAULT '',
  country_name          VARCHAR(128) NOT NULL DEFAULT '',
  region_name           VARCHAR(128) NOT NULL DEFAULT '',
  city_name             VARCHAR(128) NOT NULL DEFAULT '',
  visitors              INT UNSIGNED NOT NULL DEFAULT 0,
  sessions              INT UNSIGNED NOT NULL DEFAULT 0,
  pageviews             INT UNSIGNED NOT NULL DEFAULT 0,
  orders_attributed     INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at            DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (summary_date, country_code, region_name, city_name),
  KEY idx_insights_geo_daily_country (country_code, summary_date),
  KEY idx_insights_geo_daily_city (country_code, region_name(64), city_name(64), summary_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS insights_source_daily (
  summary_date          DATE NOT NULL,
  source_bucket         VARCHAR(64) NOT NULL COMMENT 'direct|organic|google_ads|utm|referral|unknown',
  utm_source            VARCHAR(128) NOT NULL DEFAULT '',
  utm_medium            VARCHAR(128) NOT NULL DEFAULT '',
  utm_campaign          VARCHAR(128) NOT NULL DEFAULT '',
  visitors              INT UNSIGNED NOT NULL DEFAULT 0,
  sessions              INT UNSIGNED NOT NULL DEFAULT 0,
  orders_attributed     INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at            DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (summary_date, source_bucket, utm_source, utm_medium, utm_campaign)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS insights_page_daily (
  summary_date          DATE NOT NULL,
  path                  VARCHAR(512) NOT NULL,
  pageviews             INT UNSIGNED NOT NULL DEFAULT 0,
  unique_sessions       INT UNSIGNED NOT NULL DEFAULT 0,
  avg_time_on_page_ms   INT UNSIGNED NULL,
  avg_scroll_depth_pct  TINYINT UNSIGNED NULL,
  exits                 INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at            DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (summary_date, path(191)),
  KEY idx_insights_page_daily_path (path(191), summary_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS insights_settings (
  setting_key           VARCHAR(64) NOT NULL,
  setting_value         VARCHAR(512) NOT NULL,
  updated_at            DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by            VARCHAR(128) NULL,
  PRIMARY KEY (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO insights_settings (setting_key, setting_value) VALUES
  ('enabled', '0'),
  ('kill_switch', '0'),
  ('recording_enabled', '0'),
  ('geo_city_enabled', '0'),
  ('detail_retention_days', '90'),
  ('summary_retention_days', '365'),
  ('ip_full_retention_days', '30'),
  ('cleanup_batch_size', '500'),
  ('cleanup_min_interval_sec', '300'),
  ('ingest_max_body_bytes', '16384'),
  ('exclude_bots_from_kpis', '1');

CREATE TABLE IF NOT EXISTS insights_cleanup_lease (
  lease_name            VARCHAR(64) NOT NULL,
  holder                VARCHAR(128) NULL,
  acquired_at           DATETIME(3) NULL,
  last_success_at       DATETIME(3) NULL,
  last_error            VARCHAR(500) NULL,
  last_deleted_events   INT UNSIGNED NOT NULL DEFAULT 0,
  last_deleted_sessions INT UNSIGNED NOT NULL DEFAULT 0,
  last_masked_ips       INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (lease_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO insights_cleanup_lease (lease_name) VALUES ('insights_retention');
`.trim();

function sqlBodySha256(body = SQL_BODY) {
  return crypto.createHash("sha256").update(body, "utf8").digest("hex");
}

const TABLES = [
  "insights_sessions",
  "insights_events",
  "insights_daily_summary",
  "insights_geo_daily",
  "insights_source_daily",
  "insights_page_daily",
  "insights_settings",
  "insights_cleanup_lease",
];

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
  console.log("=== migrate-sidhu-insights ===");
  console.log("Mode:", APPLY ? "APPLY" : "CHECK");
  console.log("SQL_BODY_SHA256:", hash);
  console.log("Tables (CREATE IF NOT EXISTS):");
  for (const t of TABLES) console.log("  -", t);
  console.log("Default settings: enabled=0 kill_switch=0 recording_enabled=0 geo_city_enabled=0");
  console.log("Lease row: insights_retention");
}

async function main() {
  const hash = sqlBodySha256();
  printPlan(hash);

  if (!APPLY) {
    console.log("CHECK complete. No .env loaded. No DB connection. No schema changes.");
    console.log(
      "To apply later (requires approval): node scripts/migrate-sidhu-insights.js --apply --expect-db <DB_NAME>"
    );
    process.exit(0);
  }

  if (!EXPECT_DB) {
    console.error("REFUSED: --apply requires --expect-db <exact DB_NAME>");
    process.exit(1);
  }

  require("./testMutationGuard").requireMutationOptIn("migrate-sidhu-insights");
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
    console.log("SUCCESS: insights schema applied (idempotent CREATE IF NOT EXISTS)");
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
  TABLES,
  sqlBodySha256,
  APPLY,
  EXPECT_DB,
};
