/**
 * Task-10: fresh offline checks under an explicit Node20 runtime.
 * Process-only unreachable DB_* stubs. No schema apply / mutation / .env edits.
 */
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "../..");
const OUT = path.join(ROOT, "review-artifacts/visibility-10/checks");
fs.mkdirSync(OUT, { recursive: true });

const nodeBin = process.execPath;
const nodeVer = process.version;
if (!/^v20\./.test(nodeVer)) {
  console.error(`REFUSING: expected Node20 parent, got ${nodeVer} at ${nodeBin}`);
  process.exit(2);
}

const env = {
  ...process.env,
  DB_HOST: "127.0.0.1",
  DB_PORT: "1",
  DB_USER: "offline_dummy_user",
  DB_PASSWORD: "offline_dummy_password_not_real",
  DB_NAME: "offline_dummy_db_unreachable",
  ALLOW_DB_MUTATION_TESTS: "",
  // Keep child npm/node on this Node20 first
  PATH: `${path.dirname(nodeBin)}${path.delimiter}${process.env.PATH || ""}`,
};

function writeLog(name, meta, stdout, stderr) {
  const body = [
    `command: ${meta.command}`,
    `runtime: ${nodeVer}`,
    `execPath: ${nodeBin}`,
    `cwd: ${ROOT}`,
    `startedAt: ${meta.startedAt}`,
    `finishedAt: ${meta.finishedAt}`,
    `elapsedMs: ${meta.elapsedMs}`,
    `exitCode: ${meta.exitCode}`,
    "",
    "===== STDOUT =====",
    stdout || "(empty)",
    "",
    "===== STDERR =====",
    stderr || "(empty)",
    "",
  ].join("\n");
  fs.writeFileSync(path.join(OUT, `${name}.txt`), body, "utf8");
  fs.writeFileSync(path.join(OUT, `${name}.meta.json`), JSON.stringify(meta, null, 2), "utf8");
}

function run(name, command, args, { shell = false, timeoutMs = 600000 } = {}) {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const res = spawnSync(command, args, {
    cwd: ROOT,
    env,
    encoding: "utf8",
    shell,
    timeout: timeoutMs,
    maxBuffer: 20 * 1024 * 1024,
  });
  const finishedAt = new Date().toISOString();
  const meta = {
    name,
    command: shell ? String(command) : [command, ...args].join(" "),
    runtime: nodeVer,
    execPath: nodeBin,
    exitCode: res.status === null ? (res.signal ? 124 : 1) : res.status,
    startedAt,
    finishedAt,
    elapsedMs: Date.now() - t0,
    signal: res.signal || null,
    error: res.error ? String(res.error.message || res.error) : null,
  };
  writeLog(name, meta, res.stdout || "", res.stderr || "");
  console.log(
    JSON.stringify({
      name,
      exitCode: meta.exitCode,
      elapsedMs: meta.elapsedMs,
      runtime: nodeVer,
    })
  );
  return meta;
}

const summary = {
  task: "F4UK-CMS-PRODUCT-VISIBILITY-10",
  runtime: nodeVer,
  execPath: nodeBin,
  npmVersion: null,
  checks: [],
};

const npmProbe = spawnSync(nodeBin, ["-e", "console.log(process.version+'|'+process.execPath)"], {
  env,
  encoding: "utf8",
});
summary.childNodeProbe = (npmProbe.stdout || "").trim();

const npmV = spawnSync(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["-v"],
  { env, encoding: "utf8", shell: true, cwd: ROOT }
);
summary.npmVersion = (npmV.stdout || "").trim();

const checks = [
  ["v05-verification", nodeBin, ["scripts/phase-product-visibility-05-verification-tests.js"]],
  ["v06-verification", nodeBin, ["scripts/phase-product-visibility-06-verification-tests.js"]],
  ["v07-verification", nodeBin, ["scripts/phase-product-visibility-07-verification-tests.js"]],
  ["v08-verification", nodeBin, ["scripts/phase-product-visibility-08-verification-tests.js"]],
  ["v09-verification", nodeBin, ["scripts/phase-product-visibility-09-verification-tests.js"]],
  ["seasonality", nodeBin, ["scripts/phase-product-seasonality-tests.js"]],
  ["visibility", nodeBin, ["scripts/phase-product-visibility-tests.js"]],
  ["preservation", nodeBin, ["scripts/phase-product-active-preservation-tests.js"]],
  ["seo-revision-restore-guard", nodeBin, ["scripts/phase-seo-revision-restore-guard-tests.js"]],
  ["url-migration", nodeBin, ["scripts/phase-p1-product-url-migration-tests.js"]],
  ["lint", "npm.cmd", ["run", "lint"]],
  ["tsc", "npx.cmd", ["tsc", "--noEmit"]],
  ["build", "npm.cmd", ["run", "build"]],
  ["npm-audit", "npm.cmd", ["audit"]],
  ["npm-audit-omit-dev", "npm.cmd", ["audit", "--omit=dev"]],
  ["check-runtime-ddl", nodeBin, ["scripts/check-runtime-ddl.js"]],
  ["check-tracked-secrets", nodeBin, ["scripts/check-tracked-secrets.js"]],
  ["git-diff-check", "git", ["diff", "--check"]],
];

for (const [name, cmd, args] of checks) {
  const shell = /\.cmd$/i.test(cmd) || cmd === "git";
  const meta = run(name, cmd, args, { shell: process.platform === "win32" && shell });
  summary.checks.push({
    name,
    exitCode: meta.exitCode,
    elapsedMs: meta.elapsedMs,
    command: meta.command,
  });
}

fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(summary, null, 2), "utf8");
const failed = summary.checks.filter((c) => c.exitCode !== 0);
console.log(
  JSON.stringify(
    {
      ok: failed.length === 0,
      failed: failed.map((f) => f.name),
      runtime: nodeVer,
      npm: summary.npmVersion,
      childProbe: summary.childNodeProbe,
    },
    null,
    2
  )
);
process.exit(failed.length === 0 ? 0 : 1);
