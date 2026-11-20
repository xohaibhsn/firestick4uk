/**
 * F4UK-MULTI-116 — encrypted off-site DB backup (inert) offline tests.
 * Mocked mysql2 / Cloudinary only. No real DB, network, or uploads.
 */
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const { spawnSync } = require("child_process");
const mysql = require("mysql2");

const ROOT = path.resolve(__dirname, "..");
const bk = require("./backup/offsite-db-backup");
const decryptMod = require("./backup/decrypt-backup");
const { parseInsertTuples } = require("./backup/sql-tuple-parser");

let passed = 0;
let failed = 0;
const consoleChunks = [];
const origLog = console.log;
const origErr = console.error;

function captureStart() {
  consoleChunks.length = 0;
  console.log = (...a) => {
    consoleChunks.push(a.map(String).join(" "));
    origLog.apply(console, a);
  };
  console.error = (...a) => {
    consoleChunks.push(a.map(String).join(" "));
    origErr.apply(console, a);
  };
}
function captureStop() {
  console.log = origLog;
  console.error = origErr;
}
function capturedText() {
  return consoleChunks.join("\n");
}

function ok(name, cond, detail = "") {
  if (cond) {
    passed++;
    origLog(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed++;
    origErr(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function randKey() {
  return crypto.randomBytes(32).toString("hex");
}

function makeMockConnection(spec) {
  const tables = spec.tables; // { name: { create, rows: [{}...] } }
  const tableNames = Object.keys(tables).sort();
  let inTx = false;
  return {
    async query(sql, params) {
      const s = String(sql);
      if (/SET SESSION TRANSACTION/i.test(s)) return [[], []];
      if (/START TRANSACTION/i.test(s)) {
        inTx = true;
        return [[], []];
      }
      if (/^COMMIT/i.test(s)) {
        inTx = false;
        return [[], []];
      }
      if (/SELECT DATABASE\(\)/i.test(s)) {
        return [[{ db: spec.database }], []];
      }
      if (/information_schema\.TABLES/i.test(s)) {
        return [tableNames.map((name) => ({ name })), []];
      }
      if (/SHOW CREATE TABLE/i.test(s)) {
        const m = /SHOW CREATE TABLE `?([A-Za-z0-9_]+)`?/i.exec(s);
        const name = m[1];
        return [
          [
            {
              Table: name,
              "Create Table": tables[name].create,
            },
          ],
          [],
        ];
      }
      if (/SELECT \* FROM/i.test(s)) {
        const m = /SELECT \* FROM `?([A-Za-z0-9_]+)`?/i.exec(s);
        const name = m[1];
        const limit = params[0];
        const offset = params[1];
        const slice = tables[name].rows.slice(offset, offset + limit);
        return [slice, []];
      }
      throw new Error("unexpected SQL: " + s.slice(0, 120) + " tx=" + inTx);
    },
    async end() {},
  };
}

async function runDumperCase() {
  const blob = Buffer.from([0x00, 0xff, 0x10, 0x20]);
  const rowsA = [
    {
      id: 1,
      note: null,
      title: "say \"hi\" \\and\\ 'bye'",
      emoji: "fire🔥uk",
      bin: blob,
      ts: "2024-01-02 03:04:05",
      meta: '{"a":1,"b":"x"}',
    },
  ];
  // Second table with >500 rows to exercise batching
  const rowsB = [];
  for (let i = 0; i < 520; i++) {
    rowsB.push({ id: i + 1, label: "r" + i });
  }

  const conn = makeMockConnection({
    database: "u992747032_firestick4uk",
    tables: {
      alpha: {
        create:
          "CREATE DEFINER=`admin`@`localhost` TABLE `alpha` (" +
          "`id` int, `note` varchar(50), `title` varchar(200), `emoji` varchar(50), " +
          "`bin` blob, `ts` datetime, `meta` json)",
        rows: rowsA,
      },
      beta: {
        create: "CREATE TABLE `beta` (`id` int, `label` varchar(50))",
        rows: rowsB,
      },
    },
  });

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "f4uk-116-dump-"));
  const gzPath = path.join(tmp, "out.sql.gz");
  try {
    const stats = await bk.dumpDatabaseToGzipFile(mysql, conn, {
      dbName: "u992747032_firestick4uk",
      outGzipPath: gzPath,
      batchSize: 500,
    });
    ok("dump_table_count", stats.tableCount === 2);
    ok("dump_total_rows", stats.totalRows === 1 + 520);
    ok("dump_alpha_rows", stats.tables.alpha === 1);
    ok("dump_beta_rows", stats.tables.beta === 520);

    const sql = zlib.gunzipSync(fs.readFileSync(gzPath)).toString("utf8");
    ok("no_USE", !/\bUSE\b/i.test(sql));
    ok("no_CREATE_DATABASE", !/CREATE\s+DATABASE/i.test(sql));
    ok("no_DEFINER", !/DEFINER\s*=/i.test(sql));
    ok("has_SET_NAMES", /SET NAMES utf8mb4/.test(sql));
    ok("fk_off_on", /SET FOREIGN_KEY_CHECKS=0/.test(sql) && /SET FOREIGN_KEY_CHECKS=1/.test(sql));

    const inserts = parseInsertTuples(sql);
    const alpha = inserts.find((x) => x.table === "alpha");
    ok("alpha_insert_present", !!alpha);
    if (alpha) {
      const r = alpha.rows[0];
      ok("alpha_null", r.note === null);
      ok("alpha_quotes", r.title === "say \"hi\" \\and\\ 'bye'");
      ok("alpha_emoji", r.emoji === "fire🔥uk");
      ok(
        "alpha_blob",
        Buffer.isBuffer(r.bin) && r.bin.equals(blob),
        Buffer.isBuffer(r.bin) ? r.bin.toString("hex") : typeof r.bin
      );
      ok("alpha_ts", r.ts === "2024-01-02 03:04:05");
      ok("alpha_json", r.meta === '{"a":1,"b":"x"}');
    }

    const betaInserts = inserts.filter((x) => x.table === "beta");
    const betaRowCount = betaInserts.reduce((n, x) => n + x.rows.length, 0);
    ok("beta_all_rows", betaRowCount === 520);
    ok(
      "beta_batches_le_500",
      betaInserts.every((x) => x.rows.length <= 500) && betaInserts.length >= 2,
      "batches=" + betaInserts.map((x) => x.rows.length).join(",")
    );

    // Ensure sample row values never appear in our status logging path for this SQL
    // (checked globally later against captured console for encrypt path)
    return { sql, sampleTitle: rowsA[0].title, sampleEmoji: rowsA[0].emoji };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

async function main() {
  // --- key validation ---
  ok("key_ok", !!bk.validateBackupKey(randKey()));
  ok("key_missing", bk.validateBackupKey(undefined) === null);
  ok("key_short", bk.validateBackupKey("abcd") === null);
  ok("key_non_hex", bk.validateBackupKey("z".repeat(64)) === null);

  // --- encrypt round-trip (random + gzip sample SQL) ---
  const key = Buffer.from(randKey(), "hex");
  const randomPlain = crypto.randomBytes(2048);
  const packed1 = bk.packEncryptedFile(
    key,
    { tables: { t: 1 }, gzip_sha256: crypto.createHash("sha256").update(randomPlain).digest("hex"), table_count: 1, total_rows: 1 },
    randomPlain
  );
  const u1 = bk.unpackEncryptedFile(key, packed1);
  ok("roundtrip_random", u1.gzipPlain.equals(randomPlain));

  const sampleSql = Buffer.from(
    "SET NAMES utf8mb4;\nCREATE TABLE `t` (`id` int);\nINSERT INTO `t` (`id`) VALUES\n(1);\n",
    "utf8"
  );
  const sampleGz = zlib.gzipSync(sampleSql);
  const packed2 = bk.packEncryptedFile(
    key,
    {
      tables: { t: 1 },
      gzip_sha256: crypto.createHash("sha256").update(sampleGz).digest("hex"),
      table_count: 1,
      total_rows: 1,
      script_version: bk.SCRIPT_VERSION,
    },
    sampleGz
  );
  const u2 = bk.unpackEncryptedFile(key, packed2);
  ok("roundtrip_gzip_sql", u2.gzipPlain.equals(sampleGz));
  ok("roundtrip_gunzip_sql", zlib.gunzipSync(u2.gzipPlain).equals(sampleSql));

  // tampered byte → tag failure
  let tamperFail = false;
  try {
    const bad = Buffer.from(packed2);
    bad[bad.length - 5] ^= 0xff;
    bk.unpackEncryptedFile(key, bad);
  } catch {
    tamperFail = true;
  }
  ok("tamper_tag_fail", tamperFail);

  // wrong key → failure
  let wrongKeyFail = false;
  try {
    bk.unpackEncryptedFile(crypto.randomBytes(32), packed2);
  } catch {
    wrongKeyFail = true;
  }
  ok("wrong_key_fail", wrongKeyFail);

  // --- wrong-DB guard ---
  captureStart();
  const wrongConn = makeMockConnection({
    database: "someone_else",
    tables: {},
  });
  process.env.BACKUP_ENC_KEY = randKey();
  for (const n of [...bk.DB_ENV_NAMES, ...bk.CLOUDINARY_ENV_NAMES]) {
    if (!process.env[n]) process.env[n] = "test-placeholder";
  }
  let wrongCode = null;
  try {
    await bk.runBackup({
      args: { dryRun: true, expectDb: bk.EXPECTED_DB_DEFAULT, keepLocal: null },
      connection: wrongConn,
      skipCloudinaryConfig: true,
      cloudinary: {
        uploader: {
          upload: async () => {
            throw new Error("upload should not run");
          },
        },
        api: { resources: async () => ({ resources: [] }) },
        config() {},
      },
      mysql: {
        createConnection: async () => wrongConn,
      },
      mysqlSync: mysql,
    });
  } catch (e) {
    wrongCode = e.code;
  }
  captureStop();
  ok("wrong_db_exit_3", wrongCode === 3);

  // --- dumper mocked ---
  const dumpMeta = await runDumperCase();

  // --- retention ---
  const resources = [];
  for (let i = 1; i <= 15; i++) {
    const day = String(i).padStart(2, "0");
    resources.push({
      public_id: `firestick4uk-backups/f4uk-db-202601${day}-031700`,
    });
  }
  resources.push({ public_id: "firestick4uk-backups/other-file" });
  resources.push({ public_id: "elsewhere/f4uk-db-20260101-031700" });
  const ret = bk.retentionDeletes(resources, 12);
  ok("retention_matched_15", ret.matchedCount === 15);
  ok("retention_keep_12", ret.retained.length === 12);
  ok("retention_delete_3", ret.toDelete.length === 3);
  ok(
    "retention_deletes_oldest",
    ret.toDelete.includes("firestick4uk-backups/f4uk-db-20260101-031700") &&
      ret.toDelete.includes("firestick4uk-backups/f4uk-db-20260102-031700") &&
      ret.toDelete.includes("firestick4uk-backups/f4uk-db-20260103-031700")
  );
  ok(
    "retention_ignores_other_prefix",
    !ret.toDelete.includes("firestick4uk-backups/other-file") &&
      !ret.retained.includes("elsewhere/f4uk-db-20260101-031700")
  );

  // OFFSITE-118: Cloudinary returns public_id with ".enc" — retention must count them
  const encResources = [];
  for (let i = 1; i <= 15; i++) {
    const day = String(i).padStart(2, "0");
    encResources.push({
      public_id: `firestick4uk-backups/f4uk-db-202601${day}-031700.enc`,
    });
  }
  const retEnc = bk.retentionDeletes(encResources, 12);
  ok("retention_enc_suffix_matched_15", retEnc.matchedCount === 15);
  ok("retention_enc_suffix_keep_12", retEnc.retained.length === 12);
  ok("retention_enc_suffix_delete_3", retEnc.toDelete.length === 3);
  ok(
    "parse_stamp_with_enc",
    bk.parseStampFromPublicId(
      "firestick4uk-backups/f4uk-db-20261116-235102.enc"
    ) === "20261116-235102"
  );

  // --- dry-run never calls upload; temps deleted ---
  let uploadCalls = 0;
  const goodConn = makeMockConnection({
    database: "u992747032_firestick4uk",
    tables: {
      t1: {
        create: "CREATE TABLE `t1` (`id` int)",
        rows: [{ id: 1 }],
      },
    },
  });
  captureStart();
  const dryResult = await bk.runBackup({
    args: { dryRun: true, expectDb: "u992747032_firestick4uk", keepLocal: null },
    connection: goodConn,
    skipCloudinaryConfig: true,
    cloudinary: {
      uploader: {
        upload: async () => {
          uploadCalls++;
          return { public_id: "should-not" };
        },
        destroy: async () => {
          uploadCalls++;
        },
      },
      api: {
        resources: async () => {
          uploadCalls++;
          return { resources: [] };
        },
      },
      config() {},
    },
    mysqlSync: mysql,
  });
  const dryOut = capturedText();
  captureStop();
  ok("dry_run_no_upload", uploadCalls === 0 && dryResult.upload && dryResult.upload.dryRun === true);
  ok("dry_run_temps_gone", !fs.existsSync(dryResult.tmpDir));

  // error path cleanup
  const errTmpTracker = { dir: null };
  let errCleanupOk = false;
  try {
    const boomConn = {
      async query(sql) {
        if (/SELECT DATABASE/i.test(sql)) return [[{ db: "u992747032_firestick4uk" }], []];
        throw new Error("boom-dump");
      },
      async end() {},
    };
    await bk.runBackup({
      args: { dryRun: true, expectDb: "u992747032_firestick4uk", keepLocal: null },
      connection: boomConn,
      skipCloudinaryConfig: true,
      cloudinary: { uploader: {}, api: {}, config() {} },
      mysqlSync: mysql,
      skipCleanup: false,
    });
  } catch (e) {
    errCleanupOk = /boom-dump/.test(e.message);
  }
  ok("error_path_throws", errCleanupOk);
  // mkdtemp dirs with f4uk-bk- should not linger from the failed run (best-effort)
  const left = fs
    .readdirSync(os.tmpdir())
    .filter((n) => n.startsWith("f4uk-bk-"));
  ok("error_temps_cleaned", left.length === 0, "left=" + left.length);

  // --- decrypt tool round-trip via keep-local outside repo ---
  const keepDir = fs.mkdtempSync(path.join(os.tmpdir(), "f4uk-116-keep-"));
  const keepFile = path.join(keepDir, "sample.enc");
  const outGz = path.join(keepDir, "out.sql.gz");
  captureStart();
  const keepConn = makeMockConnection({
    database: "testdb",
    tables: {
      t1: {
        create: "CREATE TABLE `t1` (`id` int)",
        rows: [{ id: 42 }],
      },
    },
  });
  process.env.BACKUP_ENC_KEY = randKey();
  await bk.runBackup({
    args: { dryRun: true, expectDb: "testdb", keepLocal: keepFile },
    connection: keepConn,
    skipCloudinaryConfig: true,
    cloudinary: { uploader: {}, api: {}, config() {} },
    mysqlSync: mysql,
  });
  captureStop();
  ok("keep_local_written", fs.existsSync(keepFile));

  captureStart();
  const dec = await decryptMod.decryptBackup({
    inFile: keepFile,
    outFile: outGz,
  });
  const decOut = capturedText();
  captureStop();
  ok("decrypt_ok", dec.ok && fs.existsSync(outGz));
  ok("decrypt_sha_printed", /gzip_sha256=[0-9a-f]{64}/.test(decOut));
  ok("decrypt_counts", /rows\.t1=1/.test(decOut));

  let overwriteRefused = false;
  try {
    await decryptMod.decryptBackup({ inFile: keepFile, outFile: outGz });
  } catch (e) {
    overwriteRefused = /overwrite/i.test(e.message);
  }
  ok("decrypt_no_overwrite", overwriteRefused);
  fs.rmSync(keepDir, { recursive: true, force: true });

  // keep-local refuses repo path
  let refuseRepo = false;
  try {
    bk.assertKeepLocalSafe(path.join(ROOT, "tmp-enc.bin"), ROOT);
  } catch (e) {
    refuseRepo = e.code === 2;
  }
  ok("keep_local_refuse_repo", refuseRepo);

  // --- console must not contain sample row values from dumper fixture ---
  const allOut = dryOut + "\n" + decOut + "\n" + capturedText();
  ok(
    "no_sample_row_in_console",
    !allOut.includes(dumpMeta.sampleTitle) && !allOut.includes(dumpMeta.sampleEmoji)
  );

  // --- git diff check: no changes under app/pages/lib/components/public from this suite ---
  // (suite does not mutate those trees; assert working tree for those paths is clean vs HEAD for tracked files)
  const diffCheck = spawnSync(
    "git",
    ["diff", "--name-only", "HEAD", "--", "app", "pages", "lib", "components", "public"],
    { cwd: ROOT, encoding: "utf8" }
  );
  // MULTI-132 may touch ProductDetail + product preview channel (approved for that task only).
  // MULTI-133: preview-frame tracking exclusion (lib only + phase test).
  const MULTI132_OK = new Set([
    "app/products/[slug]/ProductDetail.tsx",
    "app/sidhu/page.tsx",
    "lib/productPreview.ts",
    "components/admin/ProductPreviewPane.tsx",
  ]);
  const MULTI133_OK = new Set([
    "lib/cmsPreview.ts",
    "lib/insightsClient.ts",
    "lib/adsConversions.ts",
    "scripts/phase-multi-133-tests.js",
  ]);
  // F4UK-MULTI-135: public bank-identity redaction (+ phase test).
  const MULTI135_OK = new Set([
    "lib/publicSiteContentFilter.ts",
    "scripts/phase-multi-135-tests.js",
  ]);
  // F4UK-MULTI-136: suppress Google tags on /sidhu + admin preview iframes.
  const MULTI136_OK = new Set([
    "lib/cmsPreview.ts",
    "components/TrackingConsent.tsx",
    "scripts/phase-multi-136-tests.js",
  ]);
  // F4UK-MULTI-137: stale-write guards (coupons / FAQ reorder / review moderation).
  const MULTI137_OK = new Set([
    "lib/couponBaseHash.ts",
    "lib/reviewModerationHash.ts",
    "pages/api/coupons.ts",
    "pages/api/faqs.ts",
    "pages/api/admin-reviews.ts",
    "app/sidhu/page.tsx",
    "components/sidhu/ReviewsPanel.tsx",
    "scripts/phase-multi-137-tests.js",
  ]);
  // F4UK-MULTI-139: atomic staff password + SEO reconcile lock.
  const MULTI139_OK = new Set([
    "lib/adminStaffPasswordTx.ts",
    "lib/namedLock.ts",
    "pages/api/admin-profile.ts",
    "pages/api/admin-staff-password.ts",
    "lib/seoIssueMemoryServer.ts",
    "pages/api/admin-seo-issues/reconcile.ts",
    "scripts/phase-multi-139-tests.js",
  ]);
  // F4UK-MULTI-142: admin drafts API for CMS pages (Draft/Publish D2).
  const MULTI142_OK = new Set([
    "pages/api/admin-drafts.ts",
    "lib/contentDrafts.ts",
    "lib/contentDraftsCapability.ts",
  ]);
  // F4UK-MULTI-143: Draft/Publish D3 admin UI (CmsDraftBar + client helper).
  const MULTI143_OK = new Set([
    "components/admin/CmsDraftBar.tsx",
    "lib/contentDraftClient.ts",
    "app/sidhu/page.tsx",
    "scripts/phase-multi-143-tests.js",
    "pages/api/admin-drafts.ts",
    "lib/contentDrafts.ts",
    "docs/design/DRAFT-PUBLISH.md",
  ]);
  // F4UK-MULTI-144: health-check network retry + capture waits for CMS load.
  const MULTI144_OK = new Set([
    "scripts/live-health-check.js",
    "scripts/tools/visible-text-capture.js",
    "scripts/phase-multi-144-tests.js",
    "scripts/phase-multi-135-tests.js",
    "scripts/phase-multi-138-tests.js",
    "scripts/phase-multi-131-tests.js",
    "scripts/phase-multi-132-tests.js",
    "scripts/phase-multi-133-tests.js",
    "scripts/phase-multi-136-tests.js",
    "scripts/phase-multi-139-tests.js",
    "scripts/phase-multi-140-tests.js",
    "scripts/phase-multi-142-tests.js",
    "scripts/phase-multi-143-tests.js",
  ]);
  // F4UK-MULTI-145: health 429 warn, draft base keep, atomic staff login session.
  const MULTI145_OK = new Set([
    "scripts/live-health-check.js",
    "lib/contentDraftClient.ts",
    "components/admin/CmsDraftBar.tsx",
    "lib/adminStaffPasswordTx.ts",
    "pages/api/admin-login.ts",
    "scripts/phase-multi-145-tests.js",
    "scripts/phase-multi-139-tests.js",
    "scripts/phase-multi-116-tests.js",
    "scripts/phase-multi-131-tests.js",
    "scripts/phase-multi-132-tests.js",
    "scripts/phase-multi-133-tests.js",
    "scripts/phase-multi-135-tests.js",
    "scripts/phase-multi-136-tests.js",
    "scripts/phase-multi-138-tests.js",
    "scripts/phase-multi-140-tests.js",
    "scripts/phase-multi-142-tests.js",
    "scripts/phase-multi-143-tests.js",
    "scripts/phase-multi-144-tests.js",
    "scripts/phase-multi-130-tests.js",
    "scripts/phase-multi-135-tests.js",
    "scripts/phase-multi-137-tests.js",
  ]);
  // F4UK-MULTI-146: /products H1 no duplicate + checkout optional-field tags.
  const MULTI146_OK = new Set([
    "app/products/ProductsClient.tsx",
    "lib/productsPageTitle.ts",
    "app/cart/page.tsx",
    "lib/adminContentFields.ts",
    "scripts/phase-multi-146-tests.js",
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
    "scripts/phase-multi-140-tests.js",
    "scripts/phase-multi-142-tests.js",
    "scripts/phase-multi-143-tests.js",
    "scripts/phase-multi-144-tests.js",
    "scripts/phase-multi-145-tests.js",
  ]);
  const dirtyNames = (diffCheck.stdout || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter(
      (n) =>
        !MULTI132_OK.has(n) &&
        !MULTI133_OK.has(n) &&
        !MULTI135_OK.has(n) &&
        !MULTI136_OK.has(n) &&
        !MULTI137_OK.has(n) &&
        !MULTI139_OK.has(n) &&
        !MULTI142_OK.has(n) &&
        !MULTI143_OK.has(n) &&
        !MULTI144_OK.has(n) &&
        !MULTI145_OK.has(n) &&
        !MULTI146_OK.has(n)
    );
  ok("no_app_tree_diff", dirtyNames.length === 0, dirtyNames.join(",") || "clean");

  // scripts + docs exist
  ok(
    "files_present",
    fs.existsSync(path.join(ROOT, "scripts/backup/offsite-db-backup.js")) &&
      fs.existsSync(path.join(ROOT, "scripts/backup/decrypt-backup.js")) &&
      fs.existsSync(path.join(ROOT, "docs/backup/OFFSITE-BACKUP.md"))
  );
  ok(
    "docs_mention_format",
    fs.readFileSync(path.join(ROOT, "docs/backup/OFFSITE-BACKUP.md"), "utf8").includes("F4UKBK1")
  );
  ok(
    "docs_phase2_to_confirm",
    /TO CONFIRM IN PHASE 2/.test(
      fs.readFileSync(path.join(ROOT, "docs/backup/OFFSITE-BACKUP.md"), "utf8")
    )
  );

  // stripDefiner unit
  ok(
    "strip_definer",
    !/DEFINER/.test(
      bk.stripDefiner("CREATE DEFINER=`u`@`%` TABLE `x` (id int)")
    )
  );

  // CLI key missing exits 2
  const cli = spawnSync(
    process.execPath,
    [path.join(ROOT, "scripts/backup/offsite-db-backup.js"), "--dry-run"],
    {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, BACKUP_ENC_KEY: "" },
    }
  );
  ok("cli_missing_key_exit_2", cli.status === 2, "status=" + cli.status);

  // P4: --expect-db without --dry-run must exit 2
  let expectOnlyThrown = false;
  try {
    bk.parseArgs([
      process.execPath,
      "offsite-db-backup.js",
      "--expect-db",
      "testdb",
    ]);
  } catch (e) {
    expectOnlyThrown = e && e.code === 2 && /requires --dry-run/.test(e.message);
  }
  ok("expect_db_requires_dry_run_parse", expectOnlyThrown);

  const expectOk = bk.parseArgs([
    process.execPath,
    "offsite-db-backup.js",
    "--dry-run",
    "--expect-db",
    "testdb",
  ]);
  ok(
    "expect_db_with_dry_run_ok",
    expectOk.dryRun === true &&
      expectOk.expectDb === "testdb" &&
      expectOk.expectDbOverridden === true
  );

  const cliExpect = spawnSync(
    process.execPath,
    [
      path.join(ROOT, "scripts/backup/offsite-db-backup.js"),
      "--expect-db",
      "testdb",
    ],
    {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, BACKUP_ENC_KEY: "a".repeat(64) },
    }
  );
  ok(
    "cli_expect_db_without_dry_run_exit_2",
    cliExpect.status === 2,
    "status=" + cliExpect.status
  );

  origLog(`\nMULTI-116: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  origErr(e);
  process.exit(1);
});
