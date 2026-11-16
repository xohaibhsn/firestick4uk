/**
 * Local decrypt tool for F4UK off-site backups (owner-only).
 *
 * Usage:
 *   node scripts/backup/decrypt-backup.js --in <file.enc> --out <file.sql.gz>
 *
 * Reads BACKUP_ENC_KEY from env, or prompts (hidden) if unset.
 * Refuses to overwrite an existing --out file.
 * Prints plaintext (gzip) sha256 + manifest table counts. Never prints row data.
 */
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const {
  validateBackupKey,
  unpackEncryptedFile,
} = require("./offsite-db-backup");

function parseArgs(argv) {
  const out = { inFile: null, outFile: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--in") out.inFile = argv[++i];
    else if (a === "--out") out.outFile = argv[++i];
    else if (a === "--help" || a === "-h") out.help = true;
    else throw Object.assign(new Error("unknown flag: " + a), { code: 2 });
  }
  return out;
}

function promptHidden(question) {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const stdout = process.stderr;
    if (!stdin.isTTY) {
      reject(new Error("BACKUP_ENC_KEY missing and stdin is not a TTY"));
      return;
    }
    stdout.write(question);
    const rl = readline.createInterface({ input: stdin, output: stdout });
    stdin.on("data", onData);
    function onData(char) {
      char = char + "";
      switch (char) {
        case "\n":
        case "\r":
        case "\u0004":
          stdin.removeListener("data", onData);
          break;
        default:
          stdin.resume();
          break;
      }
    }
    // Mute echo
    stdin.setRawMode && stdin.setRawMode(true);
    let buf = "";
    stdin.on("data", function collect(c) {
      const s = c.toString("utf8");
      if (s === "\n" || s === "\r" || s === "\u0004") {
        stdin.setRawMode && stdin.setRawMode(false);
        stdin.removeListener("data", collect);
        stdout.write("\n");
        rl.close();
        resolve(buf);
      } else if (s === "\u0003") {
        stdin.setRawMode && stdin.setRawMode(false);
        rl.close();
        reject(new Error("cancelled"));
      } else if (s === "\u007f" || s === "\b") {
        buf = buf.slice(0, -1);
      } else {
        buf += s;
      }
    });
  });
}

async function resolveKey() {
  const fromEnv = validateBackupKey(process.env.BACKUP_ENC_KEY);
  if (fromEnv) return fromEnv;
  const typed = await promptHidden("BACKUP_ENC_KEY (hex, hidden): ");
  const key = validateBackupKey(String(typed || "").trim());
  if (!key) {
    const err = new Error("missing/invalid key");
    err.code = 2;
    throw err;
  }
  return key;
}

async function decryptBackup(opts) {
  const args = opts || parseArgs(process.argv);
  if (args.help) {
    console.log(
      "Usage: node decrypt-backup.js --in <file.enc> --out <file.sql.gz>"
    );
    return { ok: true, help: true };
  }
  if (!args.inFile || !args.outFile) {
    const err = new Error("require --in and --out");
    err.code = 2;
    throw err;
  }
  const inPath = path.resolve(args.inFile);
  const outPath = path.resolve(args.outFile);
  if (!fs.existsSync(inPath)) {
    const err = new Error("input not found");
    err.code = 2;
    throw err;
  }
  if (fs.existsSync(outPath)) {
    const err = new Error("refuse overwrite existing output");
    err.code = 2;
    throw err;
  }

  const key = await resolveKey();
  const fileBuf = fs.readFileSync(inPath);
  let unpacked;
  try {
    unpacked = unpackEncryptedFile(key, fileBuf);
  } catch (e) {
    const err = new Error("decrypt failed: " + (e.message || "auth"));
    err.code = 4;
    throw err;
  }

  const { manifest, gzipPlain } = unpacked;
  const sha = crypto.createHash("sha256").update(gzipPlain).digest("hex");
  if (manifest.gzip_sha256 && manifest.gzip_sha256 !== sha) {
    const err = new Error("gzip sha256 mismatch vs manifest");
    err.code = 4;
    throw err;
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, gzipPlain);

  console.log("status=ok");
  console.log("out=" + outPath);
  console.log("gzip_bytes=" + gzipPlain.length);
  console.log("gzip_sha256=" + sha);
  console.log("table_count=" + (manifest.table_count || 0));
  console.log("total_rows=" + (manifest.total_rows || 0));
  if (manifest.tables && typeof manifest.tables === "object") {
    const names = Object.keys(manifest.tables).sort();
    console.log("tables=" + names.join(","));
    for (const n of names) {
      console.log("rows." + n + "=" + manifest.tables[n]);
    }
  }
  return { ok: true, sha, manifest };
}

async function main() {
  try {
    await decryptBackup();
    process.exit(0);
  } catch (err) {
    const code = err && err.code ? Number(err.code) : 1;
    console.error("error=" + (err && err.message ? err.message : "unknown"));
    process.exit(Number.isFinite(code) && code > 0 ? code : 1);
  }
}

module.exports = { parseArgs, decryptBackup, resolveKey };

if (require.main === module) {
  main();
}
