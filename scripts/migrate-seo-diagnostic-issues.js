/**
 * One-time seo_diagnostic_issues schema (SEO Issue Memory V1).
 * DEFAULT / --check : READ ONLY
 * --apply : WRITE (requires ALLOW_DB_MUTATION_TESTS=YES_I_UNDERSTAND)
 *
 * Does NOT seed issue rows.
 * Does NOT modify CMS content.
 * Not imported by runtime/build/API.
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
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

const APPLY = process.argv.includes("--apply");
const TABLE = "seo_diagnostic_issues";
const INDEXES = ["uq_sdi_issue_key", "idx_sdi_entity_status", "idx_sdi_status_last_seen"];

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

async function main() {
  loadEnvLocal();
  if (APPLY) {
    require("./testMutationGuard").requireMutationOptIn("migrate-seo-diagnostic-issues");
  }

  const mysql = require("mysql2/promise");
  const schema = process.env.DB_NAME;
  if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_PASSWORD || !schema) {
    console.error("Missing DB_* environment variables");
    process.exit(1);
  }

  const db = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: schema,
    port: Number(process.env.DB_PORT) || 3306,
  });

  console.log(`Mode: ${APPLY ? "APPLY" : "CHECK"}`);
  console.log(
    `Target DB: ${process.env.DB_USER}@${process.env.DB_HOST}:${process.env.DB_PORT || 3306}/${schema}`
  );

  /** @type {string[]} */
  const pending = [];
  const exists = await tableExists(db, schema, TABLE);
  if (!exists) {
    pending.push(`[schema] CREATE TABLE ${TABLE}`);
  } else {
    for (const idx of INDEXES) {
      if (!(await indexExists(db, schema, TABLE, idx))) {
        pending.push(`[schema] ADD INDEX ${idx}`);
      }
    }
  }

  console.log("\n========== PENDING ACTIONS ==========");
  if (!pending.length) console.log("(none)");
  else for (const p of pending) console.log(p);
  console.log(`\nPending: ${pending.length}`);

  if (!APPLY) {
    console.log("\nNo changes made");
    await db.end();
    process.exit(0);
  }

  console.log("\n========== APPLYING ==========");
  if (!exists) {
    await db.query(`
      CREATE TABLE seo_diagnostic_issues (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        issue_key VARCHAR(191) NOT NULL,
        rule_code VARCHAR(64) NOT NULL,
        entity_type ENUM('product','blog') NOT NULL,
        entity_id VARCHAR(32) NOT NULL,
        entity_label VARCHAR(255) NULL,
        category VARCHAR(32) NOT NULL,
        severity VARCHAR(32) NOT NULL,
        field_name VARCHAR(64) NULL,
        status ENUM('open','resolved') NOT NULL DEFAULT 'open',
        resolution_reason VARCHAR(64) NULL,
        first_seen_at DATETIME NOT NULL,
        last_seen_at DATETIME NOT NULL,
        resolved_at DATETIME NULL,
        reopened_count INT UNSIGNED NOT NULL DEFAULT 0,
        occurrence_count INT UNSIGNED NOT NULL DEFAULT 1,
        latest_message VARCHAR(500) NOT NULL,
        latest_evidence VARCHAR(500) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_sdi_issue_key (issue_key),
        KEY idx_sdi_entity_status (entity_type, entity_id, status),
        KEY idx_sdi_status_last_seen (status, last_seen_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log(`OK [schema] CREATE TABLE ${TABLE}`);
  } else {
    if (!(await indexExists(db, schema, TABLE, "uq_sdi_issue_key"))) {
      await db.query(
        `ALTER TABLE ${TABLE} ADD UNIQUE KEY uq_sdi_issue_key (issue_key)`
      );
      console.log("OK [schema] ADD INDEX uq_sdi_issue_key");
    }
    if (!(await indexExists(db, schema, TABLE, "idx_sdi_entity_status"))) {
      await db.query(
        `ALTER TABLE ${TABLE} ADD KEY idx_sdi_entity_status (entity_type, entity_id, status)`
      );
      console.log("OK [schema] ADD INDEX idx_sdi_entity_status");
    }
    if (!(await indexExists(db, schema, TABLE, "idx_sdi_status_last_seen"))) {
      await db.query(
        `ALTER TABLE ${TABLE} ADD KEY idx_sdi_status_last_seen (status, last_seen_at)`
      );
      console.log("OK [schema] ADD INDEX idx_sdi_status_last_seen");
    }
  }

  const existsAfter = await tableExists(db, schema, TABLE);
  let pendingAfter = 0;
  if (!existsAfter) pendingAfter = 1;
  else {
    for (const idx of INDEXES) {
      if (!(await indexExists(db, schema, TABLE, idx))) pendingAfter += 1;
    }
  }
  console.log(`\nPending after apply: ${pendingAfter}`);
  await db.end();
  process.exit(pendingAfter === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
