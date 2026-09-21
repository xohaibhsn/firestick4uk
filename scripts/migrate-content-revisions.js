/**
 * Phase 9 — one-time content_revisions schema.
 * DEFAULT / --check : READ ONLY
 * --apply : WRITE (requires ALLOW_DB_MUTATION_TESTS=YES_I_UNDERSTAND)
 *
 * Does NOT backfill historical revisions.
 * Does NOT modify CMS content rows.
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
    require("./testMutationGuard").requireMutationOptIn("migrate-content-revisions");
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

  const exists = await tableExists(db, schema, "content_revisions");
  if (!exists) {
    pending.push("[schema] CREATE TABLE content_revisions");
  } else {
    const needed = [
      "idx_cr_entity_created",
      "idx_cr_created",
      "idx_cr_actor_staff",
      "idx_cr_action",
    ];
    for (const idx of needed) {
      if (!(await indexExists(db, schema, "content_revisions", idx))) {
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
      CREATE TABLE content_revisions (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        entity_type VARCHAR(50) NOT NULL,
        entity_id VARCHAR(191) NOT NULL,
        entity_label VARCHAR(255) NULL,
        revision_action VARCHAR(30) NOT NULL,
        snapshot_json LONGTEXT NOT NULL,
        changed_fields_json TEXT NULL,
        actor_type ENUM('master','staff') NOT NULL,
        actor_staff_id INT NULL,
        actor_name VARCHAR(255) NOT NULL,
        actor_role ENUM('super_admin','manager','writer') NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_cr_entity_created (entity_type, entity_id, created_at),
        INDEX idx_cr_created (created_at),
        INDEX idx_cr_actor_staff (actor_staff_id),
        INDEX idx_cr_action (revision_action)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log("OK [schema] CREATE TABLE content_revisions");
  } else {
    if (!(await indexExists(db, schema, "content_revisions", "idx_cr_entity_created"))) {
      await db.query(
        "ALTER TABLE content_revisions ADD INDEX idx_cr_entity_created (entity_type, entity_id, created_at)"
      );
      console.log("OK [schema] ADD INDEX idx_cr_entity_created");
    }
    if (!(await indexExists(db, schema, "content_revisions", "idx_cr_created"))) {
      await db.query("ALTER TABLE content_revisions ADD INDEX idx_cr_created (created_at)");
      console.log("OK [schema] ADD INDEX idx_cr_created");
    }
    if (!(await indexExists(db, schema, "content_revisions", "idx_cr_actor_staff"))) {
      await db.query("ALTER TABLE content_revisions ADD INDEX idx_cr_actor_staff (actor_staff_id)");
      console.log("OK [schema] ADD INDEX idx_cr_actor_staff");
    }
    if (!(await indexExists(db, schema, "content_revisions", "idx_cr_action"))) {
      await db.query("ALTER TABLE content_revisions ADD INDEX idx_cr_action (revision_action)");
      console.log("OK [schema] ADD INDEX idx_cr_action");
    }
  }

  // Re-check
  const existsAfter = await tableExists(db, schema, "content_revisions");
  let pendingAfter = 0;
  if (!existsAfter) pendingAfter = 1;
  else {
    for (const idx of [
      "idx_cr_entity_created",
      "idx_cr_created",
      "idx_cr_actor_staff",
      "idx_cr_action",
    ]) {
      if (!(await indexExists(db, schema, "content_revisions", idx))) pendingAfter += 1;
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
