/**
 * F4UK-MULTI-140 — content_drafts check-only migration + Draft/Publish design doc.
 * Pure node: no DB connection; mysql2 not required.
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const NODE = process.execPath;
const MIGRATE = path.join("scripts", "migrate-content-drafts.js");
const DESIGN = path.join("docs", "design", "DRAFT-PUBLISH.md");

let passed = 0;
let failed = 0;

function ok(name, cond, detail = "") {
  if (cond) {
    passed++;
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed++;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function sha256(s) {
  return crypto.createHash("sha256").update(String(s), "utf8").digest("hex");
}

function walkFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === ".next" || ent.name === ".git") continue;
      walkFiles(p, acc);
    } else if (ent.isFile()) {
      acc.push(p);
    }
  }
  return acc;
}

const EXPECTED_SQL_BODY = `SET NAMES utf8mb4;
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

// Match mutating SQL verbs; do not treat "ON UPDATE CURRENT_TIMESTAMP" as UPDATE DML.
const FORBIDDEN_OPS =
  /\bDROP\b|\bALTER\b|\bDELETE\b|(?<!\bON\s)\bUPDATE\b|\bINSERT\b|\bTRUNCATE\b|\bRENAME\b|\bGRANT\b/i;

const OTHER_TABLES =
  /\b(site_content|content_revisions|orders|products|admin_\w+|erp_\w+)\b/i;

const SECRETISH =
  /\b(password|passwd|secret|api[_-]?key|private[_-]?key|Bearer\s+[A-Za-z0-9._-]+|mysql:\/\/|DB_PASSWORD)\b/i;

function onlySelect(sql) {
  const stmts = String(sql)
    .split(/;\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  return (
    stmts.length > 0 &&
    stmts.every((s) => /^SELECT\b/i.test(s)) &&
    !FORBIDDEN_OPS.test(sql)
  );
}

function infoSchemaHasHardSchema(sql) {
  const stmts = String(sql)
    .split(/;\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => /information_schema/i.test(s));
  return (
    stmts.length > 0 &&
    stmts.every((s) => /TABLE_SCHEMA\s*=\s*'u992747032_firestick4uk'/i.test(s))
  );
}

function main() {
  const mig = require("./migrate-content-drafts.js");
  const src = fs.readFileSync(path.join(ROOT, MIGRATE), "utf8");

  // 1. SQL_BODY snapshot + stable SHA256
  ok("sql_body_exact_snapshot", mig.SQL_BODY === EXPECTED_SQL_BODY);
  const bodySha = mig.sqlBodySha256();
  ok("sql_body_sha_hex", /^[a-f0-9]{64}$/.test(bodySha), bodySha);
  ok("sql_body_sha_stable", bodySha === sha256(EXPECTED_SQL_BODY), bodySha);
  console.log("SQL_BODY_SHA256:", bodySha);

  // 2. Shape + forbidden ops / FK
  const body = mig.SQL_BODY;
  ok("sql_has_set_names", /^SET NAMES utf8mb4;/m.test(body));
  ok(
    "sql_create_content_drafts",
    (body.match(/CREATE TABLE IF NOT EXISTS content_drafts/g) || []).length === 1
  );
  ok("sql_no_mutating_ops", !FORBIDDEN_OPS.test(body));
  ok("sql_no_foreign_key", !/\bFOREIGN\s+KEY\b/i.test(body) && !/\bREFERENCES\b/i.test(body));

  // 3. Key assertions
  ok("sql_pk_id", /PRIMARY KEY\s*\(\s*id\s*\)/i.test(body));
  ok(
    "sql_uq_entity",
    /UNIQUE KEY\s+uq_cd_entity\s*\(\s*entity_type\s*,\s*entity_id\s*\)/i.test(body)
  );
  ok("sql_idx_updated", /KEY\s+idx_cd_updated\s*\(\s*updated_at\s*\)/i.test(body));
  ok("sql_innodb_utf8mb4", /ENGINE=InnoDB/i.test(body) && /utf8mb4_unicode_ci/i.test(body));
  ok("sql_entity_type_ascii_bin", /entity_type\s+VARCHAR\(30\)\s+CHARACTER SET ascii COLLATE ascii_bin/i.test(body));
  ok("sql_draft_json_longtext", /draft_json\s+LONGTEXT\s+NOT NULL/i.test(body));
  ok("sql_draft_version_default_1", /draft_version\s+INT\s+NOT NULL\s+DEFAULT\s+1/i.test(body));

  // 4. SQL_BODY must not mention other tables
  ok("sql_body_no_other_tables", !OTHER_TABLES.test(body));

  // 5. PREFLIGHT / VERIFY SELECT-only + hard TABLE_SCHEMA; no DATABASE() as filter
  ok("preflight_select_only", onlySelect(mig.PREFLIGHT_SQL));
  ok("verify_select_only", onlySelect(mig.VERIFY_SQL));
  ok("preflight_hard_schema", infoSchemaHasHardSchema(mig.PREFLIGHT_SQL));
  ok("verify_hard_schema", infoSchemaHasHardSchema(mig.VERIFY_SQL));
  ok(
    "preflight_no_database_filter",
    !/TABLE_SCHEMA\s*=\s*DATABASE\s*\(/i.test(mig.PREFLIGHT_SQL)
  );
  ok(
    "verify_no_database_filter",
    !/TABLE_SCHEMA\s*=\s*DATABASE\s*\(/i.test(mig.VERIFY_SQL) &&
      !/WHERE\s+.*DATABASE\s*\(/i.test(mig.VERIFY_SQL)
  );

  // 6. ROLLBACK export
  ok(
    "exports_rollback_text",
    typeof mig.ROLLBACK_TEXT === "string" &&
      /^DROP TABLE u992747032_firestick4uk\.content_drafts;$/m.test(mig.ROLLBACK_TEXT.trim()) &&
      !/\b(site_content|content_revisions)\b/i.test(mig.ROLLBACK_TEXT)
  );

  // 7. CHECK run: empty env, temp cwd
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "f4uk-multi-140-"));
  const beforeFiles = new Set(fs.readdirSync(tmpRoot));
  try {
    fs.mkdirSync(path.join(tmpRoot, "scripts"), { recursive: true });
    fs.copyFileSync(
      path.join(ROOT, "scripts", "migrate-content-drafts.js"),
      path.join(tmpRoot, "scripts", "migrate-content-drafts.js")
    );
    const check = spawnSync(NODE, [path.join("scripts", "migrate-content-drafts.js")], {
      cwd: tmpRoot,
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
      },
    });
    const checkOut = String(check.stdout || "") + String(check.stderr || "");
    ok("check_exit_0", check.status === 0, String(check.status));
    ok("check_prints_sql_body", checkOut.includes(mig.SQL_BODY));
    ok("check_prints_hash", checkOut.includes(bodySha));
    ok("check_prints_complete", /CHECK complete/i.test(checkOut));
    ok("check_labels_not_approved", /NOT APPROVED/i.test(checkOut));
    const afterFiles = fs.readdirSync(tmpRoot).filter((n) => n !== "scripts");
    ok("check_creates_no_files", afterFiles.every((n) => beforeFiles.has(n)), afterFiles.join(","));
  } finally {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch (_) {
      /* ignore */
    }
  }

  // 8. --apply / unknown → REFUSED exit 1
  for (const badArg of ["--apply", "--foo", "apply"]) {
    const r = spawnSync(NODE, [MIGRATE, badArg], {
      cwd: ROOT,
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        DB_HOST: "should-not-connect",
        DB_NAME: "should-not-connect",
      },
    });
    const out = String(r.stdout || "") + String(r.stderr || "");
    ok(
      `refuse_${badArg.replace(/[^a-z0-9]+/gi, "_")}`,
      r.status === 1 && /REFUSED:\s*check-only script/i.test(out),
      String(r.status)
    );
    ok(
      `refuse_${badArg.replace(/[^a-z0-9]+/gi, "_")}_no_connect`,
      !/createConnection|mysql2|connecting|ECONNREFUSED|DB_HOST/i.test(out)
    );
  }

  // 9. Source: no mysql2 / dotenv / net
  ok("src_no_mysql2", !/require\s*\(\s*["']mysql2/.test(src));
  ok(
    "src_no_dotenv",
    !/require\s*\(\s*["']dotenv["']\s*\)/.test(src) &&
      !/\.env\.local|\.env["']|readFileSync\([^)]*\.env|loadEnv/i.test(src)
  );
  ok("src_no_net_http", !/require\s*\(\s*["'](net|http|https)["']\s*\)/.test(src));

  // 10. Repo-wide: no refs outside scripts/ except design doc
  const hits = [];
  const scanRoots = ["app", "lib", "pages", "components", "public", "docs"].map((d) =>
    path.join(ROOT, d)
  );
  for (const dir of scanRoots) {
    for (const file of walkFiles(dir)) {
      const rel = path.relative(ROOT, file).replace(/\\/g, "/");
      if (rel === "docs/design/DRAFT-PUBLISH.md") continue;
      const text = fs.readFileSync(file, "utf8");
      if (text.includes("migrate-content-drafts") || text.includes("content_drafts")) {
        hits.push(rel);
      }
    }
  }
  // scripts/ may reference; only flag non-scripts (already scanned above excluding design)
  ok("no_runtime_refs_outside_scripts", hits.length === 0, hits.join(",") || "none");

  // Scripts may list the path on coupled allowlists; forbid require/import of the migrate module.
  const scriptRequireHits = [];
  for (const file of walkFiles(path.join(ROOT, "scripts"))) {
    const rel = path.relative(ROOT, file).replace(/\\/g, "/");
    if (
      rel === "scripts/migrate-content-drafts.js" ||
      rel === "scripts/phase-multi-140-tests.js"
    ) {
      continue;
    }
    const text = fs.readFileSync(file, "utf8");
    if (/require\s*\(\s*["'].*migrate-content-drafts["']\s*\)/.test(text)) {
      scriptRequireHits.push(rel);
    }
  }
  ok("no_other_script_requires_migrate", scriptRequireHits.length === 0, scriptRequireHits.join(",") || "none");

  // 11. Design doc
  ok("design_doc_exists", fs.existsSync(path.join(ROOT, DESIGN)));
  const design = fs.existsSync(path.join(ROOT, DESIGN))
    ? fs.readFileSync(path.join(ROOT, DESIGN), "utf8")
    : "";
  const decisions = [
    "Pages only first",
    "one shared draft per page",
    "no new roles",
    "no scheduled publish",
    "table approved",
    "no auto-delete",
  ];
  ok(
    "design_six_owner_decisions",
    decisions.every((d) => design.toLowerCase().includes(d.toLowerCase())),
    decisions.filter((d) => !design.toLowerCase().includes(d.toLowerCase())).join(",")
  );
  ok("design_public_seo_none", /Public\/SEO impact:\s*none/i.test(design));
  ok("design_no_secrets", !SECRETISH.test(design));

  // 12. check-runtime-ddl
  const ddl = spawnSync(NODE, [path.join("scripts", "check-runtime-ddl.js")], {
    cwd: ROOT,
    encoding: "utf8",
  });
  ok("check_runtime_ddl_exit_0", ddl.status === 0, String(ddl.status));

  // 13. no-forbidden-diff vs b0fd72d
  const BASE = "b0fd72d8081bae8f08c1fca1a4f452196cb144ce";
  const allowed = new Set([
    "scripts/migrate-content-drafts.js",
    "scripts/phase-multi-140-tests.js",
    "docs/design/DRAFT-PUBLISH.md",
    // Coupled allowlist plumbing only
    "scripts/phase-multi-116-tests.js",
    "scripts/phase-multi-130-tests.js",
    "scripts/phase-multi-131-tests.js",
    "scripts/phase-multi-132-tests.js",
    "scripts/phase-multi-133-tests.js",
    "scripts/phase-multi-135-tests.js",
    "scripts/phase-multi-136-tests.js",
    "scripts/phase-multi-137-tests.js",
    "scripts/phase-multi-138-tests.js",
    "scripts/phase-multi-139-tests.js",
  ]);
  const diff = spawnSync("git", ["diff", "--name-only", `${BASE}..HEAD`], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const unstaged = spawnSync("git", ["diff", "--name-only", BASE], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const status = spawnSync("git", ["status", "--porcelain"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const names = new Set();
  for (const block of [diff.stdout || "", unstaged.stdout || ""]) {
    for (const line of block.split(/\r?\n/)) {
      const t = line.trim().replace(/\\/g, "/");
      if (t) names.add(t);
    }
  }
  for (const line of (status.stdout || "").split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    const m = t.match(/^\?\?\s+(.+)$/) || t.match(/^[ MADRCU?]{1,2}\s+(.+)$/);
    if (m) names.add(m[1].replace(/\\/g, "/"));
  }
  const bad = [...names].filter((f) => !allowed.has(f));
  ok(
    "no_forbidden_diff",
    bad.length === 0,
    bad.length ? bad.join(",") : [...names].join(",") || "(clean-or-approved)"
  );

  console.log(`\nphase-multi-140: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main();
