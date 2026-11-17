/**
 * F4UK-OFFSITE-120 — quote-aware SQL scanner for backup verification (offline).
 */
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const mysql = require("mysql2");

const ROOT = path.resolve(__dirname, "..");
const bk = require("./backup/offsite-db-backup");
const verifyMod = require("./backup/verify-latest-backup");
const {
  parseInsertTuples,
  countRowsByTable,
  countRowsByTableLegacyRegex,
  createInsertRowCounter,
} = require("./backup/sql-tuple-parser");

let passed = 0;
let failed = 0;
const origLog = console.log;
const origErr = console.error;

function ok(name, cond, detail = "") {
  if (cond) {
    passed++;
    origLog(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed++;
    origErr(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function feedChunks(sql, sizes) {
  const counter = createInsertRowCounter();
  const buf = Buffer.from(sql, "utf8");
  if (sizes === 1) {
    for (let i = 0; i < buf.length; i++) counter.write(buf.subarray(i, i + 1));
  } else if (Array.isArray(sizes)) {
    let off = 0;
    let si = 0;
    while (off < buf.length) {
      const n = Math.max(1, sizes[si % sizes.length]);
      counter.write(buf.subarray(off, Math.min(buf.length, off + n)));
      off += n;
      si++;
    }
  } else {
    // random-size chunks
    let off = 0;
    while (off < buf.length) {
      const n = 1 + Math.floor(Math.random() * 17);
      counter.write(buf.subarray(off, Math.min(buf.length, off + n)));
      off += n;
    }
  }
  return counter.end();
}

/** Fixture SQL whose string values contain the OFFSITE-119 failure modes. */
function buildNastyFixtureSql() {
  // Deliberately put ';' ');' ');\nINSERT INTO' etc. inside string literals.
  const html =
    "<div style=\"a:1;b:2\">done;</div><!-- );\\nINSERT INTO `x` (`id`) VALUES\\n(9); -->";
  const ua = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36";
  const withEscapes = "end\\'s \\\\ path \\\\\\' mix";
  const doubled = "it''s fine";
  const commentsInside = "has -- dash and /* block */ inside";
  const emoji = "fire🔥;ok";

  // Build with mysql.escape so we match dumper output shape.
  const esc = (v) => mysql.escape(v);

  let sql = "";
  sql += "-- F4UK offsite backup\n";
  sql += "SET NAMES utf8mb4;\n";
  sql += "SET FOREIGN_KEY_CHECKS=0;\n\n";

  // empty table (no INSERT)
  sql += "DROP TABLE IF EXISTS `empty_tbl`;\n";
  sql += "CREATE TABLE `empty_tbl` (`id` int);\n\n";

  // site_content-like: HTML/CSS with semicolons
  sql += "DROP TABLE IF EXISTS `site_content`;\n";
  sql += "CREATE TABLE `site_content` (`id` int, `body` mediumtext);\n\n";
  sql +=
    "INSERT INTO `site_content` (`id`,`body`) VALUES\n" +
    "(1," +
    esc(html) +
    "),\n" +
    "(2," +
    esc("plain") +
    ");\n\n";

  // admin_sessions-like: user-agent with ';'
  sql += "DROP TABLE IF EXISTS `admin_sessions`;\n";
  sql +=
    "CREATE TABLE `admin_sessions` (`id` int, `ua` varchar(255), `note` varchar(255));\n\n";
  sql +=
    "INSERT INTO `admin_sessions` (`id`,`ua`,`note`) VALUES\n" +
    "(1," +
    esc(ua) +
    "," +
    esc(withEscapes) +
    "),\n" +
    "(2," +
    esc("ok") +
    "," +
    esc(doubled) +
    "),\n" +
    "(3," +
    esc(commentsInside) +
    "," +
    esc(emoji) +
    ");\n\n";

  // misc: NULL, empty string, BLOB hex, injection-looking string
  const inject = ");\nINSERT INTO `pwned` (`id`) VALUES\n(99);";
  sql += "DROP TABLE IF EXISTS `misc`;\n";
  sql +=
    "CREATE TABLE `misc` (`id` int, `a` varchar(255), `b` blob, `c` varchar(50));\n\n";
  sql +=
    "INSERT INTO `misc` (`id`,`a`,`b`,`c`) VALUES\n" +
    "(1," +
    esc(inject) +
    ",X'deadbeef'," +
    esc("") +
    "),\n" +
    "(2,NULL,X''," +
    esc("x") +
    ");\n\n";

  sql += "SET FOREIGN_KEY_CHECKS=1;\n";
  return {
    sql,
    expected: {
      site_content: 2,
      admin_sessions: 3,
      misc: 2,
      // empty_tbl absent from parsed
    },
    expectedTotal: 7,
  };
}

function makeMockConnection(spec) {
  const tables = spec.tables;
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
          [{ Table: name, "Create Table": tables[name].create }],
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

async function main() {
  const fixture = buildNastyFixtureSql();
  const { sql, expected, expectedTotal } = fixture;

  // --- new scanner counts ---
  const counted = countRowsByTable(sql);
  ok(
    "scanner_site_content",
    counted.site_content === expected.site_content,
    "got=" + counted.site_content
  );
  ok(
    "scanner_admin_sessions",
    counted.admin_sessions === expected.admin_sessions,
    "got=" + counted.admin_sessions
  );
  ok("scanner_misc", counted.misc === expected.misc, "got=" + counted.misc);
  ok(
    "scanner_empty_absent",
    counted.empty_tbl === undefined,
    "keys=" + Object.keys(counted).join(",")
  );
  ok(
    "scanner_total",
    Object.values(counted).reduce((a, b) => a + b, 0) === expectedTotal
  );

  // --- parseInsertTuples still returns values (no crash on nasty strings) ---
  const inserts = parseInsertTuples(sql);
  const sc = inserts.find((x) => x.table === "site_content");
  ok("parse_site_content_rows", sc && sc.rows.length === 2);
  ok(
    "parse_html_keeps_semicolon",
    sc && typeof sc.rows[0].body === "string" && sc.rows[0].body.includes("a:1;b:2")
  );
  const misc = inserts.find((x) => x.table === "misc");
  ok("parse_null", misc && misc.rows[1].a === null);
  ok("parse_empty_string", misc && misc.rows[0].c === "");
  ok(
    "parse_blob",
    misc &&
      Buffer.isBuffer(misc.rows[0].b) &&
      misc.rows[0].b.toString("hex") === "deadbeef"
  );
  ok(
    "parse_inject_literal_not_statement",
    misc &&
      typeof misc.rows[0].a === "string" &&
      misc.rows[0].a.includes("INSERT INTO") &&
      !inserts.some((x) => x.table === "pwned")
  );

  // --- OFFSITE-119: legacy regex undercounts; new scanner does not ---
  const legacy = countRowsByTableLegacyRegex(sql);
  const legacyTotal = Object.values(legacy).reduce((a, b) => a + b, 0);
  ok(
    "legacy_regex_undercounts",
    legacyTotal < expectedTotal,
    "legacy=" + legacyTotal + " expected=" + expectedTotal
  );
  ok(
    "legacy_site_or_admin_wrong",
    legacy.site_content !== expected.site_content ||
      legacy.admin_sessions !== expected.admin_sessions ||
      legacy.misc !== expected.misc,
    JSON.stringify(legacy)
  );
  ok(
    "new_scanner_beats_legacy",
    Object.values(counted).reduce((a, b) => a + b, 0) === expectedTotal &&
      legacyTotal < expectedTotal
  );

  // --- chunk boundaries: 1-byte and random-size ---
  const oneByte = feedChunks(sql, 1);
  ok(
    "chunk_1byte_same",
    JSON.stringify(oneByte) === JSON.stringify(counted),
    JSON.stringify(oneByte)
  );
  const randomA = feedChunks(sql, "random");
  const randomB = feedChunks(sql, [3, 7, 1, 11, 2, 5]);
  ok(
    "chunk_random_same",
    JSON.stringify(randomA) === JSON.stringify(counted)
  );
  ok(
    "chunk_fixed_pattern_same",
    JSON.stringify(randomB) === JSON.stringify(counted)
  );

  // Place a chunk boundary mid-string explicitly
  const mid =
    "INSERT INTO `t` (`id`,`s`) VALUES\n(1,'hello;world');\n";
  const midCounter = createInsertRowCounter();
  const midBuf = Buffer.from(mid, "utf8");
  const cut = mid.indexOf("hello;") + 3; // inside 'hel|lo;world'
  midCounter.write(midBuf.subarray(0, cut));
  midCounter.write(midBuf.subarray(cut));
  const midCounts = midCounter.end();
  ok("mid_string_chunk_boundary", midCounts.t === 1);

  // --- empty tables excluded from equality but listed ---
  const key = crypto.randomBytes(32).toString("hex");
  const keyBuf = Buffer.from(key, "hex");
  // Build enc with empty + non-empty
  let dumpSql =
    "-- F4UK\nSET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\n\n";
  dumpSql += "DROP TABLE IF EXISTS `empty_a`;\nCREATE TABLE `empty_a` (`id` int);\n\n";
  dumpSql += "DROP TABLE IF EXISTS `empty_b`;\nCREATE TABLE `empty_b` (`id` int);\n\n";
  dumpSql += "DROP TABLE IF EXISTS `filled`;\nCREATE TABLE `filled` (`id` int);\n\n";
  dumpSql += "INSERT INTO `filled` (`id`) VALUES\n(1),\n(2);\n\n";
  dumpSql += "SET FOREIGN_KEY_CHECKS=1;\n";
  const gzipPlain = zlib.gzipSync(Buffer.from(dumpSql, "utf8"));
  const gzip_sha256 = crypto.createHash("sha256").update(gzipPlain).digest("hex");
  const manifest = {
    script_version: "1.0.0",
    utc: new Date().toISOString(),
    database: "testdb",
    tables: { empty_a: 0, empty_b: 0, filled: 2 },
    table_count: 3,
    total_rows: 2,
    gzip_bytes: gzipPlain.length,
    gzip_sha256,
    public_id: "firestick4uk-backups/f4uk-db-20261117-000000",
  };
  const encBuf = bk.packEncryptedFile(keyBuf, manifest, gzipPlain);

  process.env.BACKUP_ENC_KEY = key;
  process.env.CLOUDINARY_CLOUD_NAME = "test-cloud";
  process.env.CLOUDINARY_API_KEY = "key";
  process.env[["CLOUDINARY", "API", "SECRET"].join("_")] = "x";

  const chunks = [];
  const prevLog = console.log;
  console.log = (...a) => {
    chunks.push(a.map(String).join(" "));
    prevLog.apply(console, a);
  };
  const result = await verifyMod.verifyLatestBackup({
    skipCloudinaryConfig: true,
    cloudinary: {
      config() {},
      utils: {
        private_download_url() {
          return "https://example.test/dl";
        },
      },
      api: {
        async resources() {
          return {
            resources: [
              {
                public_id: "firestick4uk-backups/f4uk-db-20261117-000000.enc",
                created_at: "2026-11-17T00:00:00Z",
                bytes: encBuf.length,
              },
            ],
          };
        },
      },
    },
    downloadFn: async (_u, dest) => fs.writeFileSync(dest, encBuf),
  });
  const out = chunks.join("\n");
  console.log = prevLog;

  ok("empty_tables_verify_ok", result.ok === true);
  ok(
    "empty_tables_listed",
    /manifest_empty_tables=2/.test(out),
    out.match(/manifest_empty_tables=\d+/)?.[0] || "missing"
  );
  ok(
    "empty_tables_parsed_only_filled",
    result.parsed_tables === 1 && result.parsed_total_rows === 2
  );
  ok(
    "empty_tables_manifest_count",
    result.manifest_tables === 3 && result.manifest_empty_tables === 2
  );
  ok("empty_no_mismatch", /mismatches=\[\]/.test(out));

  // --- dumper round-trip: dump fixture → scan → equal counts ---
  const blob = Buffer.from([0xde, 0xad]);
  const conn = makeMockConnection({
    database: "u992747032_firestick4uk",
    tables: {
      empty_z: {
        create: "CREATE TABLE `empty_z` (`id` int)",
        rows: [],
      },
      content: {
        create:
          "CREATE TABLE `content` (`id` int, `body` mediumtext, `ua` varchar(255), `bin` blob, `note` varchar(100))",
        rows: [
          {
            id: 1,
            body: '<style>a:1;b:2</style>;done',
            ua: "Mozilla/5.0 (X11; Linux x86_64)",
            bin: blob,
            note: null,
          },
          {
            id: 2,
            body: ");\nINSERT INTO `nope` (`id`) VALUES\n(1);",
            ua: "ok",
            bin: Buffer.alloc(0),
            note: "it''s",
          },
        ],
      },
    },
  });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "f4uk-120-dump-"));
  const gzPath = path.join(tmp, "out.sql.gz");
  try {
    const stats = await bk.dumpDatabaseToGzipFile(mysql, conn, {
      dbName: "u992747032_firestick4uk",
      outGzipPath: gzPath,
      batchSize: 500,
    });
    const dumpedSql = zlib.gunzipSync(fs.readFileSync(gzPath)).toString("utf8");
    const scanned = countRowsByTable(dumpedSql);
    const one = feedChunks(dumpedSql, 1);
    ok("dump_manifest_empty_z", stats.tables.empty_z === 0);
    ok("dump_manifest_content", stats.tables.content === 2);
    ok(
      "dump_scan_matches_manifest",
      scanned.content === 2 && scanned.empty_z === undefined
    );
    ok(
      "dump_scan_total",
      Object.values(scanned).reduce((a, b) => a + b, 0) === stats.totalRows
    );
    ok(
      "dump_scan_1byte_matches",
      JSON.stringify(one) === JSON.stringify(scanned)
    );
    // legacy undercounts this dump too when ';' in body
    const leg = countRowsByTableLegacyRegex(dumpedSql);
    ok(
      "dump_legacy_undercounts_content",
      (leg.content || 0) < 2,
      "legacy_content=" + leg.content
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  origLog(`\nMULTI-120: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  origErr(e);
  process.exit(1);
});
