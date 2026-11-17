/**
 * F4UK-MULTI-127 — order_idempotency_keys migration script checks.
 * Pure node: no DB connection; mysql2 not required on CHECK path.
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const NODE = process.execPath;
const MIGRATE = path.join("scripts", "migrate-order-idempotency.js");

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
CREATE TABLE IF NOT EXISTS order_idempotency_keys (
  idempotency_key CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'client UUID v4 lowercase',
  request_hash    CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'sha256 of canonical order request; no raw PII',
  order_id        VARCHAR(20) NOT NULL,
  created_at      DATETIME(3) NOT NULL,
  PRIMARY KEY (idempotency_key),
  UNIQUE KEY uq_oik_order_id (order_id),
  KEY idx_oik_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`.trim();

function main() {
  const mig = require("./migrate-order-idempotency.js");

  // 1. SQL_BODY snapshot + stable SHA256
  ok("sql_body_exact_snapshot", mig.SQL_BODY === EXPECTED_SQL_BODY);
  const bodySha = mig.sqlBodySha256();
  ok("sql_body_sha_hex", /^[a-f0-9]{64}$/.test(bodySha), bodySha);
  ok("sql_body_sha_stable", bodySha === sha256(EXPECTED_SQL_BODY), bodySha);
  console.log("SQL_BODY_SHA256:", bodySha);

  // 2. Only SET NAMES + one CREATE TABLE IF NOT EXISTS; forbidden ops / FK
  const body = mig.SQL_BODY;
  ok("sql_has_set_names", /^SET NAMES utf8mb4;/m.test(body));
  ok(
    "sql_one_create_if_not_exists",
    (body.match(/CREATE TABLE IF NOT EXISTS order_idempotency_keys/g) || []).length === 1
  );
  const forbidden =
    /\bDROP\b|\bALTER\b|\bDELETE\b|\bUPDATE\b|\bINSERT\b|\bTRUNCATE\b|\bRENAME\b|\bGRANT\b/i;
  ok("sql_no_mutating_ops", !forbidden.test(body));
  ok("sql_no_foreign_key", !/\bFOREIGN\s+KEY\b/i.test(body) && !/\bREFERENCES\b/i.test(body));

  // 3. Keys present; no PII columns
  ok("sql_pk_idempotency_key", /PRIMARY KEY\s*\(\s*idempotency_key\s*\)/i.test(body));
  ok("sql_uq_order_id", /UNIQUE KEY\s+uq_oik_order_id\s*\(\s*order_id\s*\)/i.test(body));
  ok("sql_idx_created", /KEY\s+idx_oik_created\s*\(\s*created_at\s*\)/i.test(body));
  ok(
    "sql_no_pii_columns",
    !/\b(email|phone|name|ip|address)\b/i.test(body.replace(/COMMENT '[^']*'/g, ""))
  );

  // 4. PREFLIGHT / VERIFY are read-only SELECT/SHOW only
  function onlySelectShow(sql, label) {
    const stmts = String(sql)
      .split(/;\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
    return (
      stmts.length > 0 &&
      stmts.every((s) => /^(SELECT|SHOW)\b/i.test(s)) &&
      !forbidden.test(sql)
    );
  }
  ok("preflight_select_show_only", onlySelectShow(mig.PREFLIGHT_SQL, "PREFLIGHT"));
  ok("verify_select_show_only", onlySelectShow(mig.VERIFY_SQL, "VERIFY"));
  ok("exports_rollback_text", typeof mig.ROLLBACK_TEXT === "string" && /DROP TABLE/i.test(mig.ROLLBACK_TEXT));

  // 5. CHECK mode: exit 0, prints CHECK complete + SQL_BODY + hash; no .env* load
  const check = spawnSync(NODE, [MIGRATE], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env },
  });
  const checkOut = String(check.stdout || "") + String(check.stderr || "");
  ok("check_exit_0", check.status === 0, String(check.status));
  ok("check_prints_complete", /CHECK complete/i.test(checkOut));
  ok("check_prints_sql_body", checkOut.includes(mig.SQL_BODY));
  ok("check_prints_hash", checkOut.includes(bodySha));

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "f4uk-multi-127-"));
  try {
    // Minimal copy: only the migrate script + testMutationGuard (apply path); CHECK needs neither env nor guard.
    fs.mkdirSync(path.join(tmpRoot, "scripts"), { recursive: true });
    fs.copyFileSync(
      path.join(ROOT, "scripts", "migrate-order-idempotency.js"),
      path.join(tmpRoot, "scripts", "migrate-order-idempotency.js")
    );
    fs.copyFileSync(
      path.join(ROOT, "scripts", "testMutationGuard.js"),
      path.join(tmpRoot, "scripts", "testMutationGuard.js")
    );
    fs.writeFileSync(
      path.join(tmpRoot, ".env.local"),
      "DB_HOST=SHOULD_NOT_LOAD\nDB_NAME=SHOULD_NOT_LOAD\n",
      "utf8"
    );
    const envCheck = spawnSync(NODE, [path.join("scripts", "migrate-order-idempotency.js")], {
      cwd: tmpRoot,
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
      },
    });
    const envOut = String(envCheck.stdout || "") + String(envCheck.stderr || "");
    ok("check_tmp_cwd_exit_0", envCheck.status === 0, String(envCheck.status));
    ok(
      "check_does_not_load_env",
      !envOut.includes("SHOULD_NOT_LOAD"),
      "output must never contain SHOULD_NOT_LOAD"
    );
  } finally {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch (_) {
      /* ignore */
    }
  }

  // 6. --apply guards (no connection)
  const applyNoExpect = spawnSync(NODE, [MIGRATE, "--apply"], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, ALLOW_DB_MUTATION_TESTS: "YES_I_UNDERSTAND" },
  });
  const applyNoExpectOut =
    String(applyNoExpect.stdout || "") + String(applyNoExpect.stderr || "");
  ok(
    "apply_without_expect_db_refused",
    applyNoExpect.status !== 0 && /REFUSED/i.test(applyNoExpectOut),
    String(applyNoExpect.status)
  );

  const applyNoAllow = spawnSync(NODE, [MIGRATE, "--apply", "--expect-db", "x"], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, ALLOW_DB_MUTATION_TESTS: "" },
  });
  const applyNoAllowOut =
    String(applyNoAllow.stdout || "") + String(applyNoAllow.stderr || "");
  ok(
    "apply_without_allow_refused_no_connect",
    applyNoAllow.status !== 0 &&
      /Refusing DB mutations|YES_I_UNDERSTAND|REFUSED/i.test(applyNoAllowOut),
    String(applyNoAllow.status)
  );

  // 7. Runtime refs (MULTI-129 Part 2) — only approved order-idempotency paths.
  const ALLOWED_RUNTIME_REFS = new Set([
    path.normalize("lib/orderIdempotency.ts"),
    path.normalize("pages/api/orders.ts"),
    path.normalize("pages/api/admin-orders.ts"),
  ]);
  const scanDirs = ["app", "lib", "pages"].map((d) => path.join(ROOT, d));
  const runtimeHits = [];
  for (const dir of scanDirs) {
    for (const file of walkFiles(dir)) {
      const text = fs.readFileSync(file, "utf8");
      if (text.includes("migrate-order-idempotency") || text.includes("order_idempotency_keys")) {
        runtimeHits.push(path.normalize(path.relative(ROOT, file)));
      }
    }
  }
  const unexpected = runtimeHits.filter((f) => !ALLOWED_RUNTIME_REFS.has(f));
  ok(
    "runtime_refs_only_approved_multi129",
    unexpected.length === 0 &&
      ALLOWED_RUNTIME_REFS.has(path.normalize("pages/api/orders.ts")) &&
      runtimeHits.some((f) => f === path.normalize("pages/api/orders.ts")) &&
      runtimeHits.some((f) => f === path.normalize("pages/api/admin-orders.ts")),
    unexpected.length ? unexpected.join(",") : runtimeHits.join(",") || "none"
  );

  // 8. check-runtime-ddl
  const ddl = spawnSync(NODE, [path.join("scripts", "check-runtime-ddl.js")], {
    cwd: ROOT,
    encoding: "utf8",
  });
  ok("check_runtime_ddl_exit_0", ddl.status === 0, String(ddl.status));

  console.log(`\nphase-multi-127: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main();
