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
 * AB-5M1B: exact index column/order/uniqueness via information_schema.statistics;
 * id PRIMARY KEY + AUTO_INCREMENT; created_at CURRENT_TIMESTAMP default;
 * FK mapping + RESTRICT/NO ACTION only. No DROP/recreate of conflicting indexes.
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

/** @type {{ name: string, unique: boolean, columns: string[] }[]} */
const DECISION_INDEX_SPECS = [
  {
    name: "idx_sde_opportunity_decided",
    unique: false,
    columns: ["opportunity_id", "decided_at"],
  },
  {
    name: "idx_sde_action_decided",
    unique: false,
    columns: ["decision_action", "decided_at"],
  },
  {
    name: "idx_sde_target_entity_decided",
    unique: false,
    columns: ["target_entity_id", "decided_at"],
  },
];

/** @type {{ name: string, unique: boolean, columns: string[] }[]} */
const OUTCOME_INDEX_SPECS = [
  {
    name: "uq_sdo_decision_window",
    unique: true,
    columns: ["decision_id", "window_days"],
  },
  {
    name: "idx_sdo_observed",
    unique: false,
    columns: ["observed_at"],
  },
];

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

async function loadColumns(db, schema, table) {
  const [rows] = await db.query(
    `SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE,
            COLUMN_KEY, EXTRA, COLUMN_DEFAULT, COLUMN_TYPE
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

/**
 * Identity column: BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT.
 * @returns {string|null} issue or null if compatible
 */
function identityColumnIssue(actual, columnName) {
  if (!actual) return `missing column ${columnName}`;
  const dataType = String(actual.DATA_TYPE || "").toLowerCase();
  if (dataType !== "bigint") {
    return `${columnName} type ${dataType} incompatible with bigint`;
  }
  const nullable = String(actual.IS_NULLABLE || "").toUpperCase() === "YES";
  if (nullable) return `${columnName} is nullable but must be NOT NULL`;
  const key = String(actual.COLUMN_KEY || "").toUpperCase();
  if (key !== "PRI") {
    return `${columnName} is not PRIMARY KEY (COLUMN_KEY=${key || "none"})`;
  }
  const extra = String(actual.EXTRA || "").toLowerCase();
  if (!extra.includes("auto_increment")) {
    return `${columnName} is not AUTO_INCREMENT (runtime insertId depends on it)`;
  }
  return null;
}

/** MySQL-equivalent CURRENT_TIMESTAMP default forms. */
function hasCurrentTimestampDefault(actual) {
  if (!actual) return false;
  const def = String(actual.COLUMN_DEFAULT ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  if (/^CURRENT_TIMESTAMP(\(\d*\))?$/.test(def)) return true;
  // Some MySQL versions expose default via EXTRA for generated timestamps.
  const extra = String(actual.EXTRA || "").toLowerCase();
  if (extra.includes("default_generated") && /current_timestamp/i.test(extra)) {
    return true;
  }
  return false;
}

/**
 * created_at must be TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP(+).
 * @returns {string|null}
 */
function createdAtDefaultIssue(actual, columnName) {
  if (!actual) return `missing column ${columnName}`;
  const dataType = String(actual.DATA_TYPE || "").toLowerCase();
  if (dataType !== "timestamp") {
    return `${columnName} type ${dataType} incompatible with timestamp`;
  }
  const nullable = String(actual.IS_NULLABLE || "").toUpperCase() === "YES";
  if (nullable) return `${columnName} is nullable but must be NOT NULL`;
  if (!hasCurrentTimestampDefault(actual)) {
    return `${columnName} lacks usable CURRENT_TIMESTAMP default (runtime INSERT omits created_at)`;
  }
  return null;
}

/**
 * Classify an index from statistics rows vs expected spec.
 * @param {Array<{ NON_UNIQUE?: any, SEQ_IN_INDEX?: any, COLUMN_NAME?: any }>|null|undefined} rows
 * @param {{ name: string, unique: boolean, columns: string[] }} spec
 * @returns {"missing"|"compatible"|"incompatible"}
 */
function classifyIndexDefinition(rows, spec) {
  if (!rows || rows.length === 0) return "missing";
  const ordered = rows
    .slice()
    .sort((a, b) => Number(a.SEQ_IN_INDEX) - Number(b.SEQ_IN_INDEX));
  const cols = ordered.map((r) => String(r.COLUMN_NAME || "").toLowerCase());
  const expected = spec.columns.map((c) => c.toLowerCase());
  if (
    cols.length !== expected.length ||
    cols.some((c, i) => c !== expected[i])
  ) {
    return "incompatible";
  }
  const nonUnique = Number(ordered[0].NON_UNIQUE);
  const isUnique = nonUnique === 0;
  if (spec.unique && !isUnique) return "incompatible";
  if (!spec.unique && isUnique) {
    // Unique when non-unique expected still satisfies lookup; accept as compatible
    // only if columns match — uniqueness is stricter, not wrong for regular indexes.
    // Spec requires exact: regular indexes should be non-unique. Flag incompatible.
    return "incompatible";
  }
  return "compatible";
}

async function loadIndexRows(db, schema, table, indexName) {
  const [rows] = await db.query(
    `SELECT INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME
     FROM information_schema.statistics
     WHERE table_schema=? AND table_name=? AND index_name=?
     ORDER BY SEQ_IN_INDEX ASC`,
    [schema, table, indexName]
  );
  return rows || [];
}

async function verifyColumns(db, schema, table, required) {
  /** @type {string[]} */
  const issues = [];
  const cols = await loadColumns(db, schema, table);
  for (const spec of required) {
    const issue = columnCompatible(cols.get(spec.name.toLowerCase()), spec);
    if (issue) issues.push(`[incompatible] ${table}.${issue}`);
  }
  return { issues, cols };
}

async function verifyTableInvariants(db, schema, table, requiredColumns, indexSpecs) {
  /** @type {string[]} */
  const pending = [];
  /** @type {string[]} */
  const incompatible = [];

  const { issues, cols } = await verifyColumns(db, schema, table, requiredColumns);
  incompatible.push(...issues);

  const idIssue = identityColumnIssue(cols.get("id"), "id");
  if (idIssue) incompatible.push(`[incompatible] ${table}.${idIssue}`);

  const createdIssue = createdAtDefaultIssue(cols.get("created_at"), "created_at");
  if (createdIssue) incompatible.push(`[incompatible] ${table}.${createdIssue}`);

  for (const spec of indexSpecs) {
    const rows = await loadIndexRows(db, schema, table, spec.name);
    const status = classifyIndexDefinition(rows, spec);
    if (status === "missing") {
      pending.push(`[schema] ADD INDEX ${table}.${spec.name}`);
    } else if (status === "incompatible") {
      incompatible.push(
        `[incompatible] ${table}.${spec.name} exists but definition does not match ` +
          `${spec.unique ? "UNIQUE " : ""}(${spec.columns.join(", ")})`
      );
    }
  }

  return { pending, incompatible, cols };
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

/**
 * Classify FK row vs required mapping / delete rule.
 * @returns {"missing"|"compatible"|"incompatible"}
 */
function classifyForeignKey(fk, expected) {
  if (!fk) return "missing";
  const col = String(fk.COLUMN_NAME || "").toLowerCase();
  const refTable = String(fk.REFERENCED_TABLE_NAME || "").toLowerCase();
  const refCol = String(fk.REFERENCED_COLUMN_NAME || "").toLowerCase();
  const del = String(fk.DELETE_RULE || "").toUpperCase();
  if (
    col !== expected.column ||
    refTable !== expected.referencedTable ||
    refCol !== expected.referencedColumn
  ) {
    return "incompatible";
  }
  if (del === "CASCADE" || del === "SET NULL" || del === "SET DEFAULT") {
    return "incompatible";
  }
  // RESTRICT / NO ACTION / empty (MySQL often reports RESTRICT)
  return "compatible";
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
    const d = await verifyTableInvariants(
      db,
      schema,
      DECISION_TABLE,
      DECISION_REQUIRED_COLUMNS,
      DECISION_INDEX_SPECS
    );
    pending.push(...d.pending);
    incompatible.push(...d.incompatible);
  }

  const outcomeExists = await tableExists(db, schema, OUTCOME_TABLE);
  if (!outcomeExists) {
    pending.push(`[schema] CREATE TABLE ${OUTCOME_TABLE}`);
  } else {
    const o = await verifyTableInvariants(
      db,
      schema,
      OUTCOME_TABLE,
      OUTCOME_REQUIRED_COLUMNS,
      OUTCOME_INDEX_SPECS
    );
    pending.push(...o.pending);
    incompatible.push(...o.incompatible);

    // Parent/child BIGINT compatibility when both tables exist
    if (decisionExists) {
      const decisionCols = await loadColumns(db, schema, DECISION_TABLE);
      const outcomeCols = o.cols || (await loadColumns(db, schema, OUTCOME_TABLE));
      const parentId = decisionCols.get("id");
      const childFk = outcomeCols.get("decision_id");
      if (parentId && childFk) {
        const pType = String(parentId.DATA_TYPE || "").toLowerCase();
        const cType = String(childFk.DATA_TYPE || "").toLowerCase();
        if (pType !== "bigint" || cType !== "bigint") {
          incompatible.push(
            `[incompatible] ${OUTCOME_TABLE}.decision_id / ${DECISION_TABLE}.id BIGINT type mismatch`
          );
        }
      }
    }

    const fk = await loadForeignKey(db, schema, OUTCOME_TABLE, "fk_sdo_decision");
    const fkStatus = classifyForeignKey(fk, {
      column: "decision_id",
      referencedTable: DECISION_TABLE,
      referencedColumn: "id",
    });
    if (fkStatus === "missing") {
      pending.push(`[schema] ADD FK ${OUTCOME_TABLE}.fk_sdo_decision`);
    } else if (fkStatus === "incompatible") {
      const del = fk ? String(fk.DELETE_RULE || "").toUpperCase() : "";
      if (del === "CASCADE" || del === "SET NULL" || del === "SET DEFAULT") {
        incompatible.push(
          `[incompatible] ${OUTCOME_TABLE}.fk_sdo_decision DELETE_RULE=${del} (require RESTRICT/NO ACTION)`
        );
      } else {
        incompatible.push(
          `[incompatible] ${OUTCOME_TABLE}.fk_sdo_decision mapping is not decision_id→seo_decision_evidence.id`
        );
      }
    }
  }

  return { pending, incompatible, decisionExists, outcomeExists };
}

/** Name-only existence (APPLY add-if-absent only; never used to claim compatibility). */
async function indexExists(db, schema, table, indexName) {
  const rows = await loadIndexRows(db, schema, table, indexName);
  return rows.length > 0;
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
    for (const spec of DECISION_INDEX_SPECS) {
      if (!(await indexExists(db, schema, DECISION_TABLE, spec.name))) {
        const cols = spec.columns.join(", ");
        await db.query(
          `ALTER TABLE ${DECISION_TABLE} ADD KEY ${spec.name} (${cols})`
        );
        console.log(`OK [schema] ADD INDEX ${spec.name}`);
      }
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
    for (const spec of OUTCOME_INDEX_SPECS) {
      if (!(await indexExists(db, schema, OUTCOME_TABLE, spec.name))) {
        if (spec.unique) {
          await db.query(
            `ALTER TABLE ${OUTCOME_TABLE} ADD UNIQUE KEY ${spec.name} (${spec.columns.join(", ")})`
          );
        } else {
          await db.query(
            `ALTER TABLE ${OUTCOME_TABLE} ADD KEY ${spec.name} (${spec.columns.join(", ")})`
          );
        }
        console.log(`OK [schema] ADD INDEX ${spec.name}`);
      }
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

module.exports = {
  DECISION_TABLE,
  OUTCOME_TABLE,
  DECISION_INDEX_SPECS,
  OUTCOME_INDEX_SPECS,
  DECISION_REQUIRED_COLUMNS,
  OUTCOME_REQUIRED_COLUMNS,
  columnCompatible,
  identityColumnIssue,
  createdAtDefaultIssue,
  hasCurrentTimestampDefault,
  classifyIndexDefinition,
  classifyForeignKey,
  collectPending,
};

if (require.main === module) {
  main().catch((err) => {
    console.error(err?.message || err);
    process.exit(1);
  });
}
