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

/**
 * Narrow allowlist: phase-*-tests.js may assign obvious dummy SMTP stubs.
 * Real-looking values in the same files still FAIL. Non-test paths never match.
 */
const PHASE_TEST_PATH_RE = /(^|[\\/])scripts[\\/]phase-[^\\/]+-tests\.js$/i;
const DUMMY_SMTP_VALUE_RE = /SMTP_PASS(?:WORD)?\s*[:=]\s*['"](x|test|dummy)['"]/i;

function isPhaseTestDummySmtp(rel, ruleId, line) {
  if (ruleId !== "smtp-secret-literal") return false;
  if (!PHASE_TEST_PATH_RE.test(rel.replace(/\\/g, "/"))) return false;
  return DUMMY_SMTP_VALUE_RE.test(line);
}

function isLikelyFalsePositive(ruleId, line, rel) {
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
  // Documented: phase suite SMTP stubs only when value is an obvious dummy
  if (rel && isPhaseTestDummySmtp(rel, ruleId, line)) return true;
  return false;
}

/** Self-test: realistic SMTP stub in a non-test path must still be detected.
 *  Lines are built at runtime so this file itself is not flagged by the scan. */
function runSelfTest() {
  const key = ["SMTP", "PASS"].join("_");
  const mk = (val) => `process.env.${key} = "${val}";`;
  const cases = [
    {
      name: "phase-test-dummy-allowed",
      rel: "scripts/phase-multi-97-tests.js",
      line: mk("x"),
      ruleId: "smtp-secret-literal",
      expectFp: true,
    },
    {
      name: "phase-test-real-still-fails",
      rel: "scripts/phase-multi-97-tests.js",
      line: mk("SuperSecret99!"),
      ruleId: "smtp-secret-literal",
      expectFp: false,
    },
    {
      name: "non-test-realistic-fails",
      rel: "lib/mailer.ts",
      line: mk("SuperSecret99!"),
      ruleId: "smtp-secret-literal",
      expectFp: false,
    },
    {
      name: "non-test-dummy-still-fails",
      rel: "lib/mailer.ts",
      line: `${key} = "x";`,
      ruleId: "smtp-secret-literal",
      expectFp: false,
    },
  ];
  for (const c of cases) {
    const rule = RULES.find((r) => r.id === c.ruleId);
    if (!rule || !rule.re.test(c.line)) {
      console.error(`SELF-TEST FAIL: ${c.name} — rule did not match line`);
      process.exit(1);
    }
    const fp = isLikelyFalsePositive(c.ruleId, c.line, c.rel);
    if (fp !== c.expectFp) {
      console.error(
        `SELF-TEST FAIL: ${c.name} — expected falsePositive=${c.expectFp}, got ${fp}`
      );
      process.exit(1);
    }
  }
  console.log("SELF-TEST PASS: smtp-secret-literal allowlist scoped to phase-*-tests.js dummies only");
}

runSelfTest();

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
      if (isLikelyFalsePositive(rule.id, line, rel)) continue;
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
