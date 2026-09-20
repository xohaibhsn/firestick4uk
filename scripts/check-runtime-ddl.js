/**
 * Phase 6B — fail if core runtime paths reintroduce schema DDL.
 * Excludes: scripts/migrate-*, scripts/cleanup-*, scripts/phase*-tests,
 * scripts/check-*, ERP paths, node_modules, .next, .tmp*
 *
 * Usage: node scripts/check-runtime-ddl.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SCAN_DIRS = ["pages/api", "lib", "app"];
const EXCLUDE_DIR_PARTS = [
  `${path.sep}erp${path.sep}`,
  `${path.sep}node_modules${path.sep}`,
  `${path.sep}.next${path.sep}`,
  `${path.sep}.tmp`,
];

const PROHIBITED = [
  /CREATE\s+TABLE/i,
  /ALTER\s+TABLE/i,
  /ADD\s+COLUMN/i,
  /ADD\s+KEY/i,
  /ADD\s+UNIQUE\s+KEY/i,
  /CREATE\s+INDEX/i,
];

function shouldSkip(filePath) {
  const rel = path.relative(ROOT, filePath);
  if (rel.startsWith(`scripts${path.sep}`)) return true;
  for (const part of EXCLUDE_DIR_PARTS) {
    if ((path.sep + rel).includes(part)) return true;
  }
  return false;
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      if (name === "erp" || name === "node_modules" || name === ".next") continue;
      walk(full, out);
    } else if (/\.(ts|tsx|js|jsx)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

const hits = [];
for (const dir of SCAN_DIRS) {
  for (const file of walk(path.join(ROOT, dir))) {
    if (shouldSkip(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    const lines = text.split(/\r?\n/);
    lines.forEach((line, i) => {
      // Ignore comments
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return;
      for (const re of PROHIBITED) {
        if (re.test(line)) {
          hits.push(`${path.relative(ROOT, file)}:${i + 1}: ${trimmed.slice(0, 120)}`);
          break;
        }
      }
    });
  }
}

if (hits.length) {
  console.error("FAIL: prohibited runtime DDL found in core paths:\n");
  for (const h of hits) console.error("  " + h);
  process.exit(1);
}

console.log("PASS: no prohibited CREATE/ALTER schema DDL in core runtime paths");
process.exit(0);
