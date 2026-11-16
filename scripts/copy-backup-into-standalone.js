/**
 * Postbuild: copy the off-site backup script into Next.js standalone output
 * so Hostinger's hbuilds/current/nodejs tree includes it for Cron.
 *
 * No-op when .next/standalone is absent (non-standalone local builds).
 * Ensures full mysql2 + cloudinary packages (file tracing may omit entry files)
 * and fails loudly if they still cannot resolve from the script folder.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const STANDALONE = path.join(ROOT, ".next", "standalone");
const SRC = path.join(ROOT, "scripts", "backup", "offsite-db-backup.js");
const DEST_DIR = path.join(STANDALONE, "scripts", "backup");
const DEST = path.join(DEST_DIR, "offsite-db-backup.js");
const REQUIRED_PKGS = ["mysql2", "cloudinary"];

function fail(msg) {
  console.error("[copy-backup-into-standalone] ERROR: " + msg);
  process.exit(1);
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    if (ent.name === "node_modules") continue;
    const from = path.join(src, ent.name);
    const to = path.join(dest, ent.name);
    if (ent.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

function readDeps(pkgDir) {
  const pkgPath = path.join(pkgDir, "package.json");
  if (!fs.existsSync(pkgPath)) return [];
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  return Object.keys(pkg.dependencies || {});
}

function ensurePackage(name, seen) {
  if (seen.has(name)) return;
  seen.add(name);
  const src = path.join(ROOT, "node_modules", name);
  if (!fs.existsSync(src)) {
    fail("root node_modules missing package: " + name);
  }
  const dest = path.join(STANDALONE, "node_modules", name);
  copyDir(src, dest);
  for (const dep of readDeps(src)) {
    // Prefer nested install if present under the package; else hoist from root.
    const nested = path.join(src, "node_modules", dep);
    if (fs.existsSync(nested)) {
      copyDir(nested, path.join(dest, "node_modules", dep));
    } else if (fs.existsSync(path.join(ROOT, "node_modules", dep))) {
      ensurePackage(dep, seen);
    }
  }
}

if (!fs.existsSync(STANDALONE)) {
  console.log(
    "[copy-backup-into-standalone] .next/standalone missing — skip (non-standalone build)"
  );
  process.exit(0);
}

if (!fs.existsSync(SRC)) {
  fail("source missing: " + SRC);
}

fs.mkdirSync(DEST_DIR, { recursive: true });
fs.copyFileSync(SRC, DEST);
console.log("[copy-backup-into-standalone] copied → " + path.relative(ROOT, DEST));

const seen = new Set();
for (const name of REQUIRED_PKGS) {
  ensurePackage(name, seen);
}
console.log(
  "[copy-backup-into-standalone] ensured packages: " +
    Array.from(seen).sort().join(", ")
);

const probe = `
const path = require("path");
const scriptDir = ${JSON.stringify(DEST_DIR)};
const standalone = ${JSON.stringify(STANDALONE)};
try {
  require.resolve("mysql2", { paths: [scriptDir, standalone] });
  require.resolve("mysql2/promise", { paths: [scriptDir, standalone] });
  require.resolve("cloudinary", { paths: [scriptDir, standalone] });
  require("mysql2");
  require("mysql2/promise");
  require("cloudinary");
  console.log("ok");
} catch (e) {
  console.error(String(e && e.message ? e.message : e));
  process.exit(1);
}
`;

const probePath = path.join(DEST_DIR, "_resolve-probe.js");
fs.writeFileSync(probePath, probe, "utf8");
const r = spawnSync(process.execPath, [probePath], {
  cwd: DEST_DIR,
  encoding: "utf8",
  env: { ...process.env, NODE_PATH: path.join(STANDALONE, "node_modules") },
});
try {
  fs.unlinkSync(probePath);
} catch (_) {
  /* ignore */
}

if (r.status !== 0) {
  fail(
    "mysql2/cloudinary do not resolve from standalone scripts/backup: " +
      String(r.stderr || r.stdout || "").trim()
  );
}

console.log(
  "[copy-backup-into-standalone] verified mysql2 + cloudinary resolve from standalone"
);
process.exit(0);
