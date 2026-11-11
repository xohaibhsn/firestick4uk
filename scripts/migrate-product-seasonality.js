/**
 * F4UK product seasonality schema — REVIEW / CHECK ONLY by default.
 *
 * DEFAULT / --check : READ ONLY (lists pending DDL). Does NOT execute ALTER.
 * --apply : WRITE — blocked unless ALLOW_DB_MUTATION_TESTS=YES_I_UNDERSTAND
 *
 * THIS FILE IS NOT EXECUTED BY TASK-04 LOCAL IMPLEMENTATION.
 * Schema execution requires separate approval + verified runtime DB.
 *
 * MariaDB JSON columns store JSON documents; application validates arrays of IDs.
 * TINYINT(1) alone is not a boolean constraint — CHECK used where supported.
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

const APPLY = process.argv.includes("--apply");

const PROPOSED_DDL = `
-- NOT EXECUTED by Task-04. Separately approved migration only.
ALTER TABLE products
  ADD COLUMN product_version INT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN lifecycle_mode ENUM('permanent','seasonal') NOT NULL DEFAULT 'permanent',
  ADD COLUMN shop_listed TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN season_name VARCHAR(120) NULL,
  ADD COLUMN season_starts_at DATETIME NULL COMMENT 'UTC instant inclusive',
  ADD COLUMN season_ends_at DATETIME NULL COMMENT 'UTC instant exclusive',
  ADD COLUMN season_paused TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN season_show_countdown TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN season_ended_notice TEXT NULL,
  ADD COLUMN available_offers_heading VARCHAR(120) NULL,
  ADD COLUMN season_available_ids JSON NULL,
  ADD COLUMN season_upcoming_ids JSON NULL,
  ADD CONSTRAINT chk_products_shop_listed CHECK (shop_listed IN (0,1)),
  ADD CONSTRAINT chk_products_season_paused CHECK (season_paused IN (0,1)),
  ADD CONSTRAINT chk_products_season_countdown CHECK (season_show_countdown IN (0,1)),
  ADD CONSTRAINT chk_products_season_window CHECK (
    season_starts_at IS NULL OR season_ends_at IS NULL OR season_starts_at < season_ends_at
  ),
  ADD INDEX idx_products_sales_cards (active, shop_listed, lifecycle_mode, season_paused, season_starts_at, season_ends_at),
  ADD INDEX idx_products_hub_season (lifecycle_mode, active, season_starts_at, season_ends_at);
`.trim();

async function columnExists(db, schema, table, column) {
  const [rows] = await db.query(
    `SELECT 1 AS ok FROM information_schema.columns
     WHERE table_schema=? AND table_name=? AND column_name=? LIMIT 1`,
    [schema, table, column]
  );
  return rows.length > 0;
}

async function main() {
  console.log("=== migrate-product-seasonality (proposal) ===");
  console.log("Mode:", APPLY ? "APPLY (mutation opt-in required)" : "CHECK (read-only)");
  console.log("\nProposed DDL (NOT auto-executed):\n");
  console.log(PROPOSED_DDL);
  console.log("\n---");

  if (!APPLY) {
    console.log("CHECK complete. No schema changes applied.");
    console.log("To apply later (UNAUTHORIZED in Task-04): node scripts/migrate-product-seasonality.js --apply");
    process.exit(0);
  }

  loadEnvLocal();
  require("./testMutationGuard").requireMutationOptIn("migrate-product-seasonality");

  const mysql = require("mysql2/promise");
  const schema = process.env.DB_NAME;
  if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_PASSWORD || !schema) {
    console.error("Missing DB_* environment variables");
    process.exit(1);
  }

  // APPLY path intentionally still requires explicit opt-in; Task-04 must not run it.
  const db = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: schema,
    port: Number(process.env.DB_PORT) || 3306,
  });

  const needed = [
    "product_version",
    "lifecycle_mode",
    "shop_listed",
    "season_name",
    "season_starts_at",
    "season_ends_at",
    "season_paused",
    "season_show_countdown",
    "season_ended_notice",
    "available_offers_heading",
    "season_available_ids",
    "season_upcoming_ids",
  ];
  const missing = [];
  for (const col of needed) {
    if (!(await columnExists(db, schema, "products", col))) missing.push(col);
  }
  if (missing.length === 0) {
    console.log("All seasonal columns already present.");
  } else {
    console.log("Would add columns:", missing.join(", "));
    console.log("APPLY of full ALTER is intentionally left for a reviewed ops run.");
  }
  await db.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

module.exports = { PROPOSED_DDL };
