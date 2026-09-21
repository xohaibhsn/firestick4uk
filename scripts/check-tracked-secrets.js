/**
 * Phase 8.5 — read-only scan of tracked source for obvious hardcoded secrets.
 * Never prints secret values (findings are redacted).
 *
 * Usage: node scripts/check-tracked-secrets.js
 *
 * Skips: node_modules, .next, .git, ERP paths (frozen — report separately),
 * and process.env references without string-literal credential fallbacks.
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const SKIP_PATH_PARTS = [
  `${path.sep}node_modules${path.sep}`,
  `${path.sep}.next${path.sep}`,
  `${path.sep}.git${path.sep}`,
  `${path.sep}erp${path.sep}`, // ERP frozen; weak defaults tracked separately
  `/erp/`,
  `\\erp\\`,
];

const SCAN_EXT = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".yml",
  ".yaml",
  ".sql",
  ".env",
  ".txt",
]);

/** Patterns that indicate a hardcoded credential (not env references alone). */
const RULES = [
  {
    id: "private-key",
    re: /BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY/i,
  },
  {
    id: "mysql-url-creds",
    re: /mysql:\/\/[^:\s]+:[^@\s]+@/i,
  },
  {
    id: "db-password-fallback",
    re: /DB_PASSWORD\s*\|\|\s*['"][^'"]+['"]/,
  },
  {
    id: "password-prop-literal",
    // password: '...' or password = "..." with non-empty literal (exclude empty UI defaults)
    re: /\bpassword\s*[:=]\s*['"][^'"]{4,}['"]/i,
  },
  {
    id: "smtp-secret-literal",
    re: /SMTP_PASS(?:WORD)?\s*[:=]\s*['"][^'"]+['"]/i,
  },
  {
    id: "cloudinary-secret-literal",
    re: /CLOUDINARY_API_SECRET\s*[:=]\s*['"][^'"]+['"]/i,
  },
  {
    id: "admin-password-literal",
    re: /ADMIN_PASSWORD\s*[:=]\s*['"][^'"]+['"]/i,
  },
  {
    id: "secret-key-literal",
    re: /(?:SECRET_KEY|API_SECRET)\s*[:=]\s*['"][^'"]{8,}['"]/i,
  },
  {
    id: "bearer-literal",
    re: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/,
  },
];

function listTrackedFiles() {
  const out = execSync("git ls-files -z", { cwd: ROOT, encoding: "buffer" });
  return out
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map((f) => f.replace(/\//g, path.sep));
}

function shouldSkip(rel) {
  const full = path.sep + rel;
  for (const part of SKIP_PATH_PARTS) {
    if (full.includes(part) || rel.includes("pages/api/erp") || rel.includes("pages\\api\\erp")) {
      return true;
    }
  }
  const ext = path.extname(rel).toLowerCase();
  if (!SCAN_EXT.has(ext) && !rel.endsWith(".env") && !rel.includes(".env.")) return true;
  // Never scan ignored env files if somehow listed
  if (/(^|[\\/])\.env(\.|$)/.test(rel)) return true;
  return false;
}

function redact(line) {
  return line
    .replace(/(['"`])([^'"`]{2,})(['"`])/g, (_, a, _v, c) => `${a}[REDACTED]${c}`)
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/mysql:\/\/[^@\s]+@/gi, "mysql://[REDACTED]@")
    .slice(0, 160);
}

function isLikelyFalsePositive(ruleId, line) {
  const t = line.trim();
  // UI empty password state
  if (/\bpassword\s*[:=]\s*['"]{2}/.test(line)) return true;
  // process.env.X without literal fallback
  if (/process\.env\.[A-Z0-9_]+/.test(line) && !/\|\|\s*['"]/.test(line) && !(/[:=]\s*['"][^'"]+['"]/.test(line) && /PASSWORD|SECRET|KEY/.test(line))) {
    if (ruleId === "password-prop-literal" && /process\.env/.test(line)) return true;
  }
  // Documentation placeholders
  if (/\[REDACTED/.test(line) || /your[_-]?password|example\.com|changeme|TODO/i.test(line)) return true;
  // Comment-only discussion of password fields
  if (ruleId === "password-prop-literal" && (t.startsWith("//") || t.startsWith("*") || t.startsWith("#"))) {
    if (!/['"][^'"]{4,}['"]/.test(line)) return true;
  }
  // Form state objects with empty strings already filtered; allow password:"" patterns
  if (ruleId === "password-prop-literal" && /password\s*[:=]\s*['"]['"]/.test(line)) return true;
  // Hash/compare of password variable names
  if (ruleId === "password-prop-literal" && /password\s*[:=]\s*[a-zA-Z_][\w.]*/.test(line) && !/['"]/.test(line.match(/password\s*[:=]\s*(.+)/i)?.[1] || "")) {
    return true;
  }
  return false;
}

const findings = [];
for (const rel of listTrackedFiles()) {
  if (shouldSkip(rel)) continue;
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) continue;
  let text;
  try {
    text = fs.readFileSync(abs, "utf8");
  } catch {
    continue;
  }
  // Skip binary-ish
  if (text.includes("\0")) continue;

  const lines = text.split(/\r?\n/);
  lines.forEach((line, idx) => {
    for (const rule of RULES) {
      if (!rule.re.test(line)) continue;
      if (isLikelyFalsePositive(rule.id, line)) continue;
      findings.push({
        file: rel.replace(/\\/g, "/"),
        line: idx + 1,
        category: rule.id,
        snippet: redact(line.trim()),
      });
      break;
    }
  });
}

if (findings.length) {
  console.error("FAIL: potential hardcoded secrets in tracked files (values redacted):\n");
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line} [${f.category}] ${f.snippet}`);
  }
  console.error(`\nTotal: ${findings.length}`);
  process.exit(1);
}

console.log("PASS: no obvious hardcoded secrets in tracked non-ERP source files");
process.exit(0);
