/**
 * AB-5M — One-time seo_decision_evidence + seo_decision_outcomes schema.
 * DEFAULT / --check : READ ONLY (information_schema inspect only)
 * --apply : WRITE (requires ALLOW_DB_MUTATION_TESTS=YES_I_UNDERSTAND)
 *
 * Does NOT seed decision/outcome rows.
 * Does NOT modify blog_posts, products, CMS content, or other business tables.
 * Not imported by runtime/build/API.
 *
 * AB-5M1A: CHECK reports missing/incompatible required columns and missing FK.
 * APPLY fails safely on incompatible pre-existing schema (no destructive ALTER).
 *
 * DO NOT run --apply without explicit approval.
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

const DECISION_TABLE = "seo_decision_evidence";
const OUTCOME_TABLE = "seo_decision_outcomes";

const DECISION_INDEXES = [
  "idx_sde_opportunity_decided",
  "idx_sde_action_decided",
  "idx_sde_target_entity_decided",
];

const OUTCOME_INDEXES = ["uq_sdo_decision_window", "idx_sdo_observed"];

/** @type {{ name: string, dataType: string, maxLen?: number|null, nullable?: boolean }[]} */
const DECISION_REQUIRED_COLUMNS = [
  { name: "id", dataType: "bigint", nullable: false },
  { name: "opportunity_id", dataType: "varchar", maxLen: 128, nullable: false },
  { name: "topic", dataType: "varchar", maxLen: 200, nullable: true },
  { name: "intent", dataType: "varchar", maxLen: 200, nullable: true },
  { name: "decision_action", dataType: "varchar", maxLen: 64, nullable: false },
  { name: "target_entity_id", dataType: "int", nullable: true },
  { name: "target_url", dataType: "varchar", maxLen: 500, nullable: true },
  { name: "scheduler_eligible", dataType: "tinyint", nullable: false },
  { name: "decision_reason_codes", dataType: "text", nullable: false },
  { name: "decision_explanation", dataType: "varchar", maxLen: 280, nullable: false },
  { name: "priority_tier", dataType: "tinyint", nullable: false },
  { name: "priority_class", dataType: "varchar", maxLen: 64, nullable: false },
  { name: "uncertainty", dataType: "varchar", maxLen: 16, nullable: false },
  { name: "uncertainty_reasons", dataType: "text", nullable: true },
  { name: "estimated_cost", dataType: "varchar", maxLen: 16, nullable: false },
  { name: "evidence_mode", dataType: "varchar", maxLen: 32, nullable: false },
  { name: "baseline_evidence", dataType: "text", nullable: true },
  { name: "decided_at", dataType: "datetime", nullable: false },
  { name: "created_at", dataType: "timestamp", nullable: false },
];

/** @type {{ name: string, dataType: string, maxLen?: number|null, nullable?: boolean }[]} */
const OUTCOME_REQUIRED_COLUMNS = [
  { name: "id", dataType: "bigint", nullable: false },
  { name: "decision_id", dataType: "bigint", nullable: false },
  { name: "window_days", dataType: "smallint", nullable: false },
  { name: "evidence_mode", dataType: "varchar", maxLen: 32, nullable: false },
  { name: "outcome_evidence", dataType: "text", nullable: true },
  { name: "observed_at", dataType: "datetime", nullable: false },
  { name: "created_at", dataType: "timestamp", nullable: false },
];

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

async function loadColumns(db, schema, table) {
  const [rows] = await db.query(
    `SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
     FROM information_schema.columns
     WHERE table_schema=? AND table_name=?`,
    [schema, table]
  );
  /** @type {Map<string, any>} */
  const map = new Map();
  for (const r of rows || []) {
    map.set(String(r.COLUMN_NAME).toLowerCase(), r);
  }
  return map;
}

function columnCompatible(actual, expected) {
  if (!actual) return `missing column ${expected.name}`;
  const dataType = String(actual.DATA_TYPE || "").toLowerCase();
  if (dataType !== expected.dataType) {
    return `${expected.name} type ${dataType} incompatible with ${expected.dataType}`;
  }
  if (expected.maxLen != null) {
    const len = Number(actual.CHARACTER_MAXIMUM_LENGTH);
    if (!Number.isFinite(len) || len < expected.maxLen) {
      return `${expected.name} length ${len} < required ${expected.maxLen}`;
    }
  }
  const nullable = String(actual.IS_NULLABLE || "").toUpperCase() === "YES";
  if (expected.nullable === false && nullable) {
    return `${expected.name} is nullable but must be NOT NULL`;
  }
  return null;
}

async function verifyColumns(db, schema, table, required) {
  /** @type {string[]} */
  const issues = [];
  const cols = await loadColumns(db, schema, table);
  for (const spec of required) {
    const issue = columnCompatible(cols.get(spec.name.toLowerCase()), spec);
    if (issue) issues.push(`[incompatible] ${table}.${issue}`);
  }
  return issues;
}

async function loadForeignKey(db, schema, table, constraintName) {
  const [rows] = await db.query(
    `SELECT
       kcu.CONSTRAINT_NAME,
       kcu.COLUMN_NAME,
       kcu.REFERENCED_TABLE_NAME,
       kcu.REFERENCED_COLUMN_NAME,
       rc.DELETE_RULE
     FROM information_schema.KEY_COLUMN_USAGE kcu
     JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
       ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
      AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
     WHERE kcu.TABLE_SCHEMA = ?
       AND kcu.TABLE_NAME = ?
       AND kcu.CONSTRAINT_NAME = ?
       AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
     LIMIT 1`,
    [schema, table, constraintName]
  );
  return rows && rows[0] ? rows[0] : null;
}

async function collectPending(db, schema) {
  /** @type {string[]} */
  const pending = [];
  /** @type {string[]} */
  const incompatible = [];

  const decisionExists = await tableExists(db, schema, DECISION_TABLE);
  if (!decisionExists) {
    pending.push(`[schema] CREATE TABLE ${DECISION_TABLE}`);
  } else {
    incompatible.push(
      ...(await verifyColumns(db, schema, DECISION_TABLE, DECISION_REQUIRED_COLUMNS))
    );
    for (const idx of DECISION_INDEXES) {
      if (!(await indexExists(db, schema, DECISION_TABLE, idx))) {
        pending.push(`[schema] ADD INDEX ${DECISION_TABLE}.${idx}`);
      }
    }
  }

  const outcomeExists = await tableExists(db, schema, OUTCOME_TABLE);
  if (!outcomeExists) {
    pending.push(`[schema] CREATE TABLE ${OUTCOME_TABLE}`);
  } else {
    incompatible.push(
      ...(await verifyColumns(db, schema, OUTCOME_TABLE, OUTCOME_REQUIRED_COLUMNS))
    );
    for (const idx of OUTCOME_INDEXES) {
      if (!(await indexExists(db, schema, OUTCOME_TABLE, idx))) {
        pending.push(`[schema] ADD INDEX ${OUTCOME_TABLE}.${idx}`);
      }
    }
    const fk = await loadForeignKey(db, schema, OUTCOME_TABLE, "fk_sdo_decision");
    if (!fk) {
      pending.push(`[schema] ADD FK ${OUTCOME_TABLE}.fk_sdo_decision`);
    } else {
      const col = String(fk.COLUMN_NAME || "").toLowerCase();
      const refTable = String(fk.REFERENCED_TABLE_NAME || "").toLowerCase();
      const refCol = String(fk.REFERENCED_COLUMN_NAME || "").toLowerCase();
      const del = String(fk.DELETE_RULE || "").toUpperCase();
      if (col !== "decision_id" || refTable !== DECISION_TABLE || refCol !== "id") {
        incompatible.push(
          `[incompatible] ${OUTCOME_TABLE}.fk_sdo_decision mapping is not decision_id→seo_decision_evidence.id`
        );
      }
      if (del === "CASCADE" || del === "SET NULL" || del === "SET DEFAULT") {
        incompatible.push(
          `[incompatible] ${OUTCOME_TABLE}.fk_sdo_decision DELETE_RULE=${del} (require RESTRICT/NO ACTION)`
        );
      }
    }
  }

  return { pending, incompatible, decisionExists, outcomeExists };
}

async function main() {
  loadEnvLocal();
  if (APPLY) {
    require("./testMutationGuard").requireMutationOptIn(
      "migrate-seo-decision-evidence"
    );
  }

  const mysql = require("mysql2/promise");
  const schema = process.env.DB_NAME;
  if (
    !process.env.DB_HOST ||
    !process.env.DB_USER ||
    !process.env.DB_PASSWORD ||
    !schema
  ) {
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

  const { pending, incompatible, decisionExists, outcomeExists } =
    await collectPending(db, schema);

  console.log("\n========== INCOMPATIBLE SCHEMA ==========");
  if (!incompatible.length) console.log("(none)");
  else for (const p of incompatible) console.log(p);

  console.log("\n========== PENDING ACTIONS ==========");
  if (!pending.length) console.log("(none)");
  else for (const p of pending) console.log(p);
  console.log(`\nPending: ${pending.length}`);
  console.log(`Incompatible: ${incompatible.length}`);

  if (!APPLY) {
    console.log("\nNo changes made");
    await db.end();
    process.exit(incompatible.length === 0 ? 0 : 2);
  }

  if (incompatible.length) {
    console.error(
      "\nAPPLY refused: incompatible pre-existing AB-5M schema detected. No destructive ALTER performed."
    );
    await db.end();
    process.exit(1);
  }

  console.log("\n========== APPLYING ==========");

  if (!decisionExists) {
    await db.query(`
      CREATE TABLE seo_decision_evidence (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        opportunity_id VARCHAR(128) NOT NULL,
        topic VARCHAR(200) NULL,
        intent VARCHAR(200) NULL,
        decision_action VARCHAR(64) NOT NULL,
        target_entity_id INT NULL,
        target_url VARCHAR(500) NULL,
        scheduler_eligible TINYINT(1) NOT NULL,
        decision_reason_codes TEXT NOT NULL,
        decision_explanation VARCHAR(280) NOT NULL,
        priority_tier TINYINT NOT NULL,
        priority_class VARCHAR(64) NOT NULL,
        uncertainty VARCHAR(16) NOT NULL,
        uncertainty_reasons TEXT NULL,
        estimated_cost VARCHAR(16) NOT NULL,
        evidence_mode VARCHAR(32) NOT NULL,
        baseline_evidence TEXT NULL,
        decided_at DATETIME(3) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_sde_opportunity_decided (opportunity_id, decided_at),
        KEY idx_sde_action_decided (decision_action, decided_at),
        KEY idx_sde_target_entity_decided (target_entity_id, decided_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log(`OK [schema] CREATE TABLE ${DECISION_TABLE}`);
  } else {
    if (
      !(await indexExists(db, schema, DECISION_TABLE, "idx_sde_opportunity_decided"))
    ) {
      await db.query(
        `ALTER TABLE ${DECISION_TABLE} ADD KEY idx_sde_opportunity_decided (opportunity_id, decided_at)`
      );
      console.log("OK [schema] ADD INDEX idx_sde_opportunity_decided");
    }
    if (!(await indexExists(db, schema, DECISION_TABLE, "idx_sde_action_decided"))) {
      await db.query(
        `ALTER TABLE ${DECISION_TABLE} ADD KEY idx_sde_action_decided (decision_action, decided_at)`
      );
      console.log("OK [schema] ADD INDEX idx_sde_action_decided");
    }
    if (
      !(await indexExists(
        db,
        schema,
        DECISION_TABLE,
        "idx_sde_target_entity_decided"
      ))
    ) {
      await db.query(
        `ALTER TABLE ${DECISION_TABLE} ADD KEY idx_sde_target_entity_decided (target_entity_id, decided_at)`
      );
      console.log("OK [schema] ADD INDEX idx_sde_target_entity_decided");
    }
  }

  const decisionReady = await tableExists(db, schema, DECISION_TABLE);
  if (!decisionReady) {
    console.error(`FAIL: ${DECISION_TABLE} missing before outcome create`);
    await db.end();
    process.exit(1);
  }

  if (!outcomeExists) {
    await db.query(`
      CREATE TABLE seo_decision_outcomes (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        decision_id BIGINT NOT NULL,
        window_days SMALLINT NOT NULL,
        evidence_mode VARCHAR(32) NOT NULL,
        outcome_evidence TEXT NULL,
        observed_at DATETIME(3) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_sdo_decision_window (decision_id, window_days),
        KEY idx_sdo_observed (observed_at),
        CONSTRAINT fk_sdo_decision
          FOREIGN KEY (decision_id) REFERENCES seo_decision_evidence(id)
          ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log(`OK [schema] CREATE TABLE ${OUTCOME_TABLE}`);
  } else {
    if (
      !(await indexExists(db, schema, OUTCOME_TABLE, "uq_sdo_decision_window"))
    ) {
      await db.query(
        `ALTER TABLE ${OUTCOME_TABLE} ADD UNIQUE KEY uq_sdo_decision_window (decision_id, window_days)`
      );
      console.log("OK [schema] ADD INDEX uq_sdo_decision_window");
    }
    if (!(await indexExists(db, schema, OUTCOME_TABLE, "idx_sdo_observed"))) {
      await db.query(
        `ALTER TABLE ${OUTCOME_TABLE} ADD KEY idx_sdo_observed (observed_at)`
      );
      console.log("OK [schema] ADD INDEX idx_sdo_observed");
    }
    const fk = await loadForeignKey(db, schema, OUTCOME_TABLE, "fk_sdo_decision");
    if (!fk) {
      await db.query(
        `ALTER TABLE ${OUTCOME_TABLE}
         ADD CONSTRAINT fk_sdo_decision
         FOREIGN KEY (decision_id) REFERENCES seo_decision_evidence(id)
         ON DELETE RESTRICT`
      );
      console.log("OK [schema] ADD FK fk_sdo_decision");
    }
  }

  const after = await collectPending(db, schema);
  if (after.incompatible.length) {
    console.error("\nIncompatible after apply:");
    for (const p of after.incompatible) console.error(p);
  }
  console.log(`\nPending after apply: ${after.pending.length}`);
  console.log(`Incompatible after apply: ${after.incompatible.length}`);
  await db.end();
  process.exit(
    after.pending.length === 0 && after.incompatible.length === 0 ? 0 : 1
  );
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
