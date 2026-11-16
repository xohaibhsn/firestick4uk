/**
 * F4UK off-site encrypted DB backup (PHASE 1 — inert; nothing schedules this).
 *
 * Exit codes:
 *   0  success
 *   1  unexpected error
 *   2  missing/invalid env (incl. BACKUP_ENC_KEY) or bad flags
 *   3  wrong database (SELECT DATABASE() mismatch)
 *   4  dump/encrypt/upload failure
 *
 * Usage:
 *   node scripts/backup/offsite-db-backup.js [--dry-run] [--expect-db <name>] [--keep-local <path>]
 *
 * Env (names only — values never logged):
 *   BACKUP_ENC_KEY (64 hex chars)
 *   DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT (optional, default 3306)
 *   CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
 */
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const { pipeline } = require("stream/promises");
const { PassThrough } = require("stream");
const { once } = require("events");

const SCRIPT_VERSION = "1.0.0";
const MAGIC = Buffer.from("F4UKBK1", "ascii");
const FORMAT_VERSION = 1;
const EXPECTED_DB_DEFAULT = "u992747032_firestick4uk";
const BATCH_SIZE = 500;
const RETENTION_KEEP = 12;
const CLOUD_FOLDER = "firestick4uk-backups";
const PUBLIC_ID_PREFIX = "f4uk-db-";
const KEY_HEX_RE = /^[0-9a-fA-F]{64}$/;

const DB_ENV_NAMES = ["DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME"];
const CLOUDINARY_ENV_NAMES = [
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
];

function parseArgs(argv) {
  const out = {
    dryRun: false,
    expectDb: EXPECTED_DB_DEFAULT,
    keepLocal: null,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--expect-db") {
      const v = argv[++i];
      if (!v) throw Object.assign(new Error("missing --expect-db value"), { code: 2 });
      out.expectDb = v;
    } else if (a === "--keep-local") {
      const v = argv[++i];
      if (!v) throw Object.assign(new Error("missing --keep-local value"), { code: 2 });
      out.keepLocal = path.resolve(v);
    } else if (a === "--help" || a === "-h") {
      out.help = true;
    } else {
      throw Object.assign(new Error("unknown flag: " + a), { code: 2 });
    }
  }
  return out;
}

function validateBackupKey(hex) {
  if (!hex || typeof hex !== "string" || !KEY_HEX_RE.test(hex)) {
    return null;
  }
  return Buffer.from(hex, "hex");
}

function requireEnvNames(names) {
  const missing = names.filter((n) => !process.env[n]);
  return missing;
}

function assertKeepLocalSafe(keepLocal, repoRoot) {
  if (!keepLocal) return;
  const resolved = path.resolve(keepLocal);
  const root = path.resolve(repoRoot);
  const publicDir = path.join(root, "public");
  const under = (base) =>
    resolved === base || resolved.startsWith(base + path.sep);
  if (under(root) || under(publicDir)) {
    const err = new Error("--keep-local refuses paths inside the repo or public/");
    err.code = 2;
    throw err;
  }
}

function stripDefiner(createSql) {
  return String(createSql).replace(
    /\s*DEFINER\s*=\s*(?:`[^`]+`|'[^']+'|"[^"]+"|[^\s]+)\s*@\s*(?:`[^`]+`|'[^']+'|"[^"]+"|[^\s]+)/gi,
    ""
  );
}

function escapeSqlValue(mysql, value) {
  if (value === null || value === undefined) return "NULL";
  if (Buffer.isBuffer(value)) {
    if (value.length === 0) return "X''";
    return "X'" + value.toString("hex") + "'";
  }
  return mysql.escape(value);
}

function encryptAesGcm(key, plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { iv, ciphertext: ct, tag };
}

function decryptAesGcm(key, iv, ciphertext, tag) {
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * Compound encrypted file:
 *   MAGIC(7) | VER(u8=1) | MANIFEST_LEN(u32BE) | MANIFEST_BLOB | DATA_BLOB
 * Each BLOB = IV(12) + ciphertext + TAG(16)
 */
function packEncryptedFile(key, manifestObj, gzipPlaintext) {
  const manifestJson = Buffer.from(JSON.stringify(manifestObj), "utf8");
  const m = encryptAesGcm(key, manifestJson);
  const manifestBlob = Buffer.concat([m.iv, m.ciphertext, m.tag]);
  const d = encryptAesGcm(key, gzipPlaintext);
  const dataBlob = Buffer.concat([d.iv, d.ciphertext, d.tag]);
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(manifestBlob.length, 0);
  return Buffer.concat([
    MAGIC,
    Buffer.from([FORMAT_VERSION]),
    lenBuf,
    manifestBlob,
    dataBlob,
  ]);
}

function unpackEncryptedFile(key, fileBuf) {
  if (!Buffer.isBuffer(fileBuf) || fileBuf.length < 8 + 4 + 12 + 16) {
    throw new Error("file too short");
  }
  if (!fileBuf.subarray(0, 7).equals(MAGIC)) {
    throw new Error("bad magic");
  }
  const ver = fileBuf[7];
  if (ver !== FORMAT_VERSION) {
    throw new Error("unsupported format version: " + ver);
  }
  const manifestLen = fileBuf.readUInt32BE(8);
  const manifestStart = 12;
  const manifestEnd = manifestStart + manifestLen;
  if (manifestEnd > fileBuf.length || manifestLen < 12 + 16) {
    throw new Error("bad manifest length");
  }
  const manifestBlob = fileBuf.subarray(manifestStart, manifestEnd);
  const dataBlob = fileBuf.subarray(manifestEnd);
  if (dataBlob.length < 12 + 16) {
    throw new Error("data blob too short");
  }
  const mIv = manifestBlob.subarray(0, 12);
  const mTag = manifestBlob.subarray(manifestBlob.length - 16);
  const mCt = manifestBlob.subarray(12, manifestBlob.length - 16);
  const dIv = dataBlob.subarray(0, 12);
  const dTag = dataBlob.subarray(dataBlob.length - 16);
  const dCt = dataBlob.subarray(12, dataBlob.length - 16);
  const manifestBuf = decryptAesGcm(key, mIv, mCt, mTag);
  const gzipPlain = decryptAesGcm(key, dIv, dCt, dTag);
  const manifest = JSON.parse(manifestBuf.toString("utf8"));
  return { manifest, gzipPlain };
}

function utcStamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return (
    d.getUTCFullYear() +
    p(d.getUTCMonth() + 1) +
    p(d.getUTCDate()) +
    "-" +
    p(d.getUTCHours()) +
    p(d.getUTCMinutes()) +
    p(d.getUTCSeconds())
  );
}

function parseStampFromPublicId(publicId) {
  // firestick4uk-backups/f4uk-db-YYYYMMDD-HHMMSS
  const base = String(publicId).split("/").pop() || "";
  const m = /^f4uk-db-(\d{8}-\d{6})$/.exec(base);
  return m ? m[1] : null;
}

/**
 * Given Cloudinary resource list items with public_id, return public_ids to delete
 * (older than newest RETENTION_KEEP matching the backup prefix in CLOUD_FOLDER).
 */
function retentionDeletes(resources, keep = RETENTION_KEEP) {
  const prefix = CLOUD_FOLDER + "/" + PUBLIC_ID_PREFIX;
  const matched = [];
  for (const r of resources || []) {
    const id = r && r.public_id;
    if (!id || typeof id !== "string") continue;
    if (!id.startsWith(prefix)) continue;
    // Reject anything outside folder or with extra path segments after stamp
    const rest = id.slice(CLOUD_FOLDER.length + 1);
    if (!rest.startsWith(PUBLIC_ID_PREFIX)) continue;
    if (rest.includes("/")) continue;
    const stamp = parseStampFromPublicId(id);
    if (!stamp) continue;
    matched.push({ public_id: id, stamp });
  }
  matched.sort((a, b) => (a.stamp < b.stamp ? 1 : a.stamp > b.stamp ? -1 : 0));
  const toDelete = matched.slice(keep).map((x) => x.public_id);
  const retained = matched.slice(0, keep).map((x) => x.public_id);
  return { toDelete, retained, matchedCount: matched.length };
}

async function dumpDatabaseToGzipFile(mysql, connection, opts) {
  const {
    dbName,
    outGzipPath,
    batchSize = BATCH_SIZE,
  } = opts;

  await connection.query("SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ");
  await connection.query("START TRANSACTION WITH CONSISTENT SNAPSHOT");

  const [tables] = await connection.query(
    `SELECT TABLE_NAME AS name
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME`
  );

  const pass = new PassThrough();
  const gzip = zlib.createGzip({ level: 9 });
  const out = fs.createWriteStream(outGzipPath);
  const writePromise = pipeline(pass, gzip, out);

  const write = async (chunk) => {
    if (!pass.write(chunk)) {
      await once(pass, "drain");
    }
  };

  const header =
    "-- F4UK offsite backup\n" +
    "-- database: " +
    dbName +
    "\n" +
    "-- utc: " +
    new Date().toISOString() +
    "\n" +
    "-- script_version: " +
    SCRIPT_VERSION +
    "\n" +
    "SET NAMES utf8mb4;\n" +
    "SET FOREIGN_KEY_CHECKS=0;\n\n";
  await write(header);

  const manifestTables = {};
  let totalRows = 0;

  for (const row of tables) {
    const table = row.name;
    const qTable = mysql.escapeId(table);

    await write("DROP TABLE IF EXISTS " + qTable + ";\n");

    const [createRows] = await connection.query("SHOW CREATE TABLE " + qTable);
    const createKey = Object.keys(createRows[0]).find((k) =>
      /create table/i.test(k)
    );
    let createSql = createRows[0][createKey];
    createSql = stripDefiner(createSql);
    await write(createSql + ";\n\n");

    let offset = 0;
    let tableRows = 0;
    for (;;) {
      const [rows] = await connection.query(
        "SELECT * FROM " + qTable + " LIMIT ? OFFSET ?",
        [batchSize, offset]
      );
      if (!rows.length) break;
      if (rows.length > batchSize) {
        throw new Error("batch exceeded limit");
      }
      const cols = Object.keys(rows[0]);
      const colList = cols.map((c) => mysql.escapeId(c)).join(",");
      const valueTuples = rows.map((r) => {
        const vals = cols.map((c) => escapeSqlValue(mysql, r[c]));
        return "(" + vals.join(",") + ")";
      });
      await write(
        "INSERT INTO " +
          qTable +
          " (" +
          colList +
          ") VALUES\n" +
          valueTuples.join(",\n") +
          ";\n"
      );
      tableRows += rows.length;
      offset += rows.length;
      if (rows.length < batchSize) break;
    }
    await write("\n");
    manifestTables[table] = tableRows;
    totalRows += tableRows;
  }

  await write("SET FOREIGN_KEY_CHECKS=1;\n");
  pass.end();
  await writePromise;
  await connection.query("COMMIT");

  return {
    tableCount: tables.length,
    totalRows,
    tables: manifestTables,
  };
}

async function uploadAndRetain(cloudinary, encPath, publicId, dryRun) {
  if (dryRun) {
    return { public_id: null, retained: 0, deleted: 0, dryRun: true };
  }
  const uploadResult = await cloudinary.uploader.upload(encPath, {
    resource_type: "raw",
    type: "private",
    folder: CLOUD_FOLDER,
    public_id: publicId,
    overwrite: false,
  });

  let resources = [];
  let nextCursor = undefined;
  do {
    const page = await cloudinary.api.resources({
      type: "private",
      resource_type: "raw",
      prefix: CLOUD_FOLDER + "/" + PUBLIC_ID_PREFIX,
      max_results: 500,
      next_cursor: nextCursor,
    });
    resources = resources.concat(page.resources || []);
    nextCursor = page.next_cursor;
  } while (nextCursor);

  const { toDelete, retained } = retentionDeletes(resources, RETENTION_KEEP);
  for (const id of toDelete) {
    await cloudinary.uploader.destroy(id, {
      resource_type: "raw",
      type: "private",
      invalidate: true,
    });
  }
  return {
    public_id: uploadResult.public_id || CLOUD_FOLDER + "/" + publicId,
    retained: retained.length,
    deleted: toDelete.length,
    dryRun: false,
  };
}

async function runBackup(options = {}) {
  const args = options.args || parseArgs(process.argv);
  if (args.help) {
    console.log(
      "Usage: node offsite-db-backup.js [--dry-run] [--expect-db <name>] [--keep-local <path>]"
    );
    return { ok: true, help: true };
  }

  const repoRoot = options.repoRoot || path.resolve(__dirname, "..", "..");
  assertKeepLocalSafe(args.keepLocal, repoRoot);

  const key = validateBackupKey(process.env.BACKUP_ENC_KEY);
  if (!key) {
    console.error("missing/invalid key");
    const err = new Error("missing/invalid key");
    err.code = 2;
    throw err;
  }

  const missing = requireEnvNames([...DB_ENV_NAMES, ...CLOUDINARY_ENV_NAMES]);
  if (missing.length) {
    console.error("missing env: " + missing.join(","));
    const err = new Error("missing env");
    err.code = 2;
    throw err;
  }

  const mysql = options.mysql || require("mysql2/promise");
  const mysqlSync = options.mysqlSync || require("mysql2");
  const cloudinaryMod = options.cloudinary || require("cloudinary").v2;

  if (!options.skipCloudinaryConfig) {
    cloudinaryMod.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "f4uk-bk-"));
  const sqlGzPath = path.join(tmpDir, "dump.sql.gz");
  const encPath = path.join(tmpDir, "dump.sql.gz.enc");
  let connection;
  const temps = [sqlGzPath, encPath, tmpDir];

  const cleanup = () => {
    for (const p of [sqlGzPath, encPath]) {
      try {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      } catch {
        /* ignore */
      }
    }
    try {
      if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  };

  try {
    connection =
      options.connection ||
      (await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: Number(process.env.DB_PORT) || 3306,
        dateStrings: true,
        supportBigNumbers: true,
        bigNumberStrings: true,
        typeCast(field, next) {
          const t = field.type;
          if (
            t === "BLOB" ||
            t === "TINY_BLOB" ||
            t === "MEDIUM_BLOB" ||
            t === "LONG_BLOB" ||
            t === "BINARY" ||
            t === "VARBINARY" ||
            t === "BIT"
          ) {
            return field.buffer();
          }
          return next();
        },
      }));

    const [dbRows] = await connection.query("SELECT DATABASE() AS db");
    const actualDb = dbRows[0] && dbRows[0].db;
    if (actualDb !== args.expectDb) {
      console.error("wrong database");
      const err = new Error("wrong database");
      err.code = 3;
      throw err;
    }

    const dumpStats = await dumpDatabaseToGzipFile(mysqlSync, connection, {
      dbName: actualDb,
      outGzipPath: sqlGzPath,
      batchSize: options.batchSize || BATCH_SIZE,
    });

    const gzipBuf = fs.readFileSync(sqlGzPath);
    const gzipSha256 = crypto.createHash("sha256").update(gzipBuf).digest("hex");
    const stamp = utcStamp();
    const publicIdBase = PUBLIC_ID_PREFIX + stamp;

    const manifest = {
      script_version: SCRIPT_VERSION,
      utc: new Date().toISOString(),
      database: actualDb,
      tables: dumpStats.tables,
      table_count: dumpStats.tableCount,
      total_rows: dumpStats.totalRows,
      gzip_bytes: gzipBuf.length,
      gzip_sha256: gzipSha256,
      public_id: CLOUD_FOLDER + "/" + publicIdBase,
    };

    const encBuf = packEncryptedFile(key, manifest, gzipBuf);
    fs.writeFileSync(encPath, encBuf);
    const encSha256 = crypto.createHash("sha256").update(encBuf).digest("hex");

    if (args.keepLocal) {
      fs.mkdirSync(path.dirname(args.keepLocal), { recursive: true });
      fs.copyFileSync(encPath, args.keepLocal);
    }

    const up = await uploadAndRetain(
      cloudinaryMod,
      encPath,
      publicIdBase,
      args.dryRun
    );

    console.log("status=ok");
    console.log("dry_run=" + (args.dryRun ? "1" : "0"));
    console.log("gzip_bytes=" + gzipBuf.length);
    console.log("enc_bytes=" + encBuf.length);
    console.log("gzip_sha256=" + gzipSha256);
    console.log("enc_sha256=" + encSha256);
    console.log("table_count=" + dumpStats.tableCount);
    console.log("total_rows=" + dumpStats.totalRows);
    console.log("public_id=" + (up.public_id || "(none-dry-run)"));
    console.log("retained_count=" + (args.dryRun ? 0 : up.retained));
    console.log("deleted_count=" + (args.dryRun ? 0 : up.deleted));

    return {
      ok: true,
      manifest,
      encSha256,
      gzipSha256,
      upload: up,
      temps,
      tmpDir,
    };
  } finally {
    if (connection && connection.end && !options.connection) {
      try {
        await connection.end();
      } catch {
        /* ignore */
      }
    }
    if (!options.skipCleanup) cleanup();
  }
}

async function main() {
  try {
    await runBackup();
    process.exit(0);
  } catch (err) {
    const code = err && err.code ? Number(err.code) : 1;
    if (code === 2 || code === 3 || code === 4) {
      process.exit(code);
    }
    if (err && err.message && !/missing\/invalid key|wrong database|missing env/.test(err.message)) {
      console.error("error=" + (err.message || "unknown"));
    }
    process.exit(Number.isFinite(code) && code > 0 ? code : 1);
  }
}

module.exports = {
  SCRIPT_VERSION,
  MAGIC,
  FORMAT_VERSION,
  EXPECTED_DB_DEFAULT,
  BATCH_SIZE,
  RETENTION_KEEP,
  CLOUD_FOLDER,
  PUBLIC_ID_PREFIX,
  DB_ENV_NAMES,
  CLOUDINARY_ENV_NAMES,
  parseArgs,
  validateBackupKey,
  requireEnvNames,
  assertKeepLocalSafe,
  stripDefiner,
  escapeSqlValue,
  encryptAesGcm,
  decryptAesGcm,
  packEncryptedFile,
  unpackEncryptedFile,
  utcStamp,
  parseStampFromPublicId,
  retentionDeletes,
  dumpDatabaseToGzipFile,
  uploadAndRetain,
  runBackup,
};

if (require.main === module) {
  main();
}
