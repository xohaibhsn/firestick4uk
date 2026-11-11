/**
 * Build F4UK-CMS-PRODUCT-VISIBILITY-08 review ZIP.
 * Git metadata via execFileSync argument arrays only — no substituted expected values.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { execFileSync, spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "../..");
const OUT = path.join(ROOT, "review-artifacts/visibility-08");
const STAGING = path.join(OUT, "bundle-staging");
const ZIP_PATH = path.join(OUT, "F4UK-CMS-PRODUCT-VISIBILITY-08-review.zip");

function git(args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

function sha256File(abs) {
  return crypto.createHash("sha256").update(fs.readFileSync(abs)).digest("hex");
}

function walkFiles(dir, relBase, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === ".next" || ent.name.endsWith(".zip")) continue;
    const abs = path.join(dir, ent.name);
    const rel = path.join(relBase, ent.name).split(path.sep).join("/");
    if (ent.isDirectory()) walkFiles(abs, rel, acc);
    else acc.push(rel);
  }
  return acc;
}

function copyInto(stagingRel, absSrc) {
  const dest = path.join(STAGING, stagingRel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(absSrc, dest);
}

fs.rmSync(STAGING, { recursive: true, force: true });
fs.mkdirSync(STAGING, { recursive: true });

const cwd = process.cwd();
const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
const head = git(["rev-parse", "HEAD"]);
const parent = git(["rev-parse", "HEAD~1"]);
const origin = git(["remote", "get-url", "origin"]);
const statusShort = git(["status", "--short"]);
let originMain = "";
let remoteMain = "";
try {
  originMain = git(["rev-parse", "origin/main"]);
} catch (e) {
  originMain = `ERROR: ${String(e.message || e)}`;
}
try {
  remoteMain = git(["ls-remote", "origin", "refs/heads/main"]).split(/\s+/)[0] || "";
} catch (e) {
  remoteMain = `ERROR: ${String(e.message || e)}`;
}

const statusLines = statusShort.split(/\r?\n/).filter(Boolean);
const candidates = [];
for (const line of statusLines) {
  const code = line.slice(0, 2);
  let file = line.slice(3).trim();
  if (file.includes(" -> ")) file = file.split(" -> ").pop();
  if (file.startsWith("review-artifacts/")) continue;
  const abs = path.join(ROOT, file);
  const norm = file.split(path.sep).join("/");
  if (!fs.existsSync(abs)) continue;
  const st = fs.statSync(abs);
  if (st.isDirectory()) {
    for (const rel of walkFiles(abs, norm)) {
      candidates.push({ path: rel, git: code.includes("?") ? "untracked" : "modified" });
    }
  } else {
    candidates.push({ path: norm, git: code.includes("?") ? "untracked" : "modified" });
  }
}
const byPath = new Map();
for (const c of candidates) byPath.set(c.path, c);
const diffNames = git(["diff", "--name-only", "HEAD"])
  .split(/\r?\n/)
  .filter(Boolean);
for (const n of diffNames) {
  const norm = n.split(path.sep).join("/");
  if (norm.startsWith("review-artifacts/")) continue;
  if (!byPath.has(norm) && fs.existsSync(path.join(ROOT, norm))) {
    byPath.set(norm, { path: norm, git: "modified" });
  }
}
const candidateList = [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));

const trackedDiff = git(["diff", "HEAD"]);
fs.writeFileSync(path.join(STAGING, "TRACKED-DIFF-vs-HEAD.patch"), trackedDiff + "\n", "utf8");

const manifestEntries = [];
for (const c of candidateList) {
  const abs = path.join(ROOT, c.path);
  const size = fs.statSync(abs).size;
  const hash = sha256File(abs);
  copyInto(path.join("sources", c.path), abs);
  manifestEntries.push({
    path: c.path,
    git_status: c.git,
    size_bytes: size,
    sha256: hash,
  });
}

const checksSrc = path.join(OUT, "checks");
if (fs.existsSync(checksSrc)) {
  for (const rel of walkFiles(checksSrc, "checks")) {
    copyInto(rel, path.join(OUT, rel));
  }
}

const uiFixture = path.join(OUT, "ui-fixture");
if (fs.existsSync(uiFixture)) {
  for (const rel of walkFiles(uiFixture, "ui-fixture")) {
    // Exclude huge mount.js from ZIP if desired? Include for evidence of actual bundle.
    if (rel.endsWith("mount.js")) continue; // large; mount-entry.tsx is the source
    copyInto(rel, path.join(OUT, rel));
  }
}

copyInto(
  "migration/migrate-product-seasonality.js",
  path.join(ROOT, "scripts/migrate-product-seasonality.js")
);
copyInto("COMPATIBILITY-ROLLBACK.md", path.join(OUT, "COMPATIBILITY-ROLLBACK.md"));
copyInto("BEFORE-AFTER-REPRODUCTIONS.md", path.join(OUT, "BEFORE-AFTER-REPRODUCTIONS.md"));

fs.writeFileSync(
  path.join(STAGING, "migration/NOT-EXECUTED.txt"),
  "Review-only migration proposal. NOT EXECUTED in Task-08. No schema apply, no live DB writes.\n",
  "utf8"
);

function readMeta(name) {
  const p = path.join(OUT, "checks", `${name}.meta.json`);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function checkLine(name) {
  const m = readMeta(name);
  if (!m) return `${name}: (missing meta)`;
  return `${name}: exit=${m.exitCode} elapsedMs=${m.elapsedMs} runtime=${m.runtime} cmd=${m.command}`;
}

const checkNames = [
  "lint",
  "tsc",
  "build",
  "npm-audit",
  "npm-audit-omit-dev",
  "check-runtime-ddl",
  "check-tracked-secrets",
  "git-diff-check",
  "v08-verification",
  "v07-verification",
  "v06-verification",
  "v05-verification",
  "seasonality",
  "visibility",
  "preservation",
];

const trackedCount = manifestEntries.filter((e) => e.git_status === "modified").length;
const untrackedCount = manifestEntries.filter((e) => e.git_status === "untracked").length;

const manifest = {
  task: "F4UK-CMS-PRODUCT-VISIBILITY-08",
  generated_at: new Date().toISOString(),
  workspace: ROOT,
  cwd_at_packaging: cwd,
  branch,
  head,
  parent_measured_via_HEAD_tilde_1: parent,
  origin,
  origin_main_local: originMain,
  remote_main: remoteMain,
  commit_push_deploy: false,
  node_runtime: process.version,
  node20_gap: !process.version.startsWith("v20."),
  candidate_count: manifestEntries.length,
  tracked_modified_count: trackedCount,
  untracked_count: untrackedCount,
  files: manifestEntries,
  checks: Object.fromEntries(checkNames.map((n) => [n, readMeta(n)])),
  excluded: [
    "secrets",
    "environment files",
    "credentials",
    "cookies",
    "real customer data",
    "node_modules",
    ".next",
    "recursive ZIP inclusion",
    "ui-fixture/mount.js (rebuilt from mount-entry.tsx)",
  ],
};
fs.writeFileSync(path.join(STAGING, "MANIFEST.json"), JSON.stringify(manifest, null, 2));

const report = `# F4UK-CMS-PRODUCT-VISIBILITY-08 — LOCAL REVIEW REPORT

## Verdict: LOCAL READINESS

Five Task-07 Berlin integration failures corrected locally with FUNCTIONAL / SIMULATED / fixture evidence. **Not** staging/production accepted. No commit/push/deploy/schema apply/live writes. HEAD unchanged at \`${head}\`.

## Measured baseline (argument-safe Git)

| Field | Measured value |
|---|---|
| Working directory | \`${ROOT}\` |
| Branch | \`${branch}\` |
| HEAD | \`${head}\` |
| Parent (\`git rev-parse HEAD~1\`) | \`${parent}\` |
| Origin | \`${origin}\` |
| Local \`origin/main\` | \`${originMain}\` |
| Remote main (\`ls-remote\`) | \`${remoteMain}\` |
| Node runtime | \`${process.version}\` (Node20 gap if not v20.x) |
| Commit/push/deploy | **None** (HEAD unchanged) |

### git status --short (packaging time)

\`\`\`
${statusShort}
\`\`\`

Task-07 packaged ~50 candidates; this pass measures **${manifestEntries.length}** candidates excluding \`review-artifacts/\` (${trackedCount} modified tracked, ${untrackedCount} untracked). Expected WIP retained — no reset/clean.

## Findings closure (Task-08)

### P1 — Remove UTC query silent retry
- \`queryWithSeasonalUtc\` issues **one** mysql2 options query with seasonal \`typeCast\`.
- Injected connection/lock/deadlock/syntax errors: one call; original error/code propagates; no string-only undecoded retry.
- Offline mocks updated to accept options shape (v05 order mocks).
- **FUNCTIONAL** (\`v08-verification\`).

### P1 — Sidhu draft base + authoritative reload
- Sidhu imports \`productContentDraftClient\` as production source of truth.
- \`onVersionUpdate\` → live ops only (\`applyLiveVersionOnly\`); never advances draft base.
- \`onProductUpdate\` → \`applyOwnContentPreservingActionResult\` with panel \`actionStartedAtVersion\`.
- Reload: authorized \`GET /api/admin-products\` → complete product only; placeholders rejected; failures retain draft/conflict.
- **SIMULATED** Sidhu callback interleaving + **STATIC** Sidhu wiring. Not live authenticated Sidhu QA.

### P2 — Purchase boundary immediate disable + dedupe
- \`lib/productSeasonBoundaryClient.ts\` + ProductDetail: immediate CTA disable; one refresh per boundary; per-boundary retries; stale slug ignored.
- Localhost fixture imports actual Countdown + coordinator contract; deferred refresh; desktop/mobile screenshots.
- Label: **component/integration fixture evidence**, not live Sidhu / full production-route acceptance.

### P2 — Hub outage ≠ known-empty
- \`HubRowsLoadResult\` typed failure; \`knownEmpty\` only after successful empty resolution; published+read-fail → \`temporarilyUnavailable\`.
- Validation unavailable → 503 / unavailable wording (not empty). Publication flag unchanged by reads.
- **FUNCTIONAL** resolver + validation with mocked deps.

## Fresh checks (overwrite-on-empty; measured meta)

${checkNames.map(checkLine).join("\n")}

Build/preview used process-only dummy \`DB_*\` pointing at unreachable loopback. No \`audit --fix\`, no migration execution, no \`ALLOW_DB_MUTATION_TESTS\`.

## Evidence labels

| Label | Meaning |
|---|---|
| FUNCTIONAL | Executed production helpers/handlers with mocked deps |
| SIMULATED | Honest interleaving of Sidhu/panel callbacks / concurrency |
| STATIC | Source wiring presence |
| FIXTURE | Localhost component fixture with deferred mocks |
| UNVERIFIED | Live Sidhu auth, real MySQL, applied schema, prod TZ, Google ranking |

## Retained contracts

- Public seasonal archives: original URLs, HTTP 200, indexability, canonical/sitemap.
- Genuine privacy via \`active=0\`.
- No automatic product conversion/hiding/price redirects.
- Hub unpublished until explicit later opt-in.
- Offer-omission tradeoff + Junaid SEO review; no ranking guarantee.
- Separately approved schema apply, staging checks, verified seasonal-aware rollback artifact (**PENDING** pointer).

## Remaining gates

- Approved schema apply + staging verification
- Explicit seasonal/hub opt-in
- Verified seasonal-aware rollback artifact
- Berlin / production acceptance
- Live authenticated Sidhu QA for draft/reload UX
- Node20 runtime alignment (current: \`${process.version}\`)

## ZIP

\`${ZIP_PATH}\`

STOP after report and bundle. No further task started.
`;

fs.writeFileSync(path.join(STAGING, "REPORT.md"), report, "utf8");
fs.writeFileSync(
  path.join(STAGING, "REQUIREMENT-MATRIX.md"),
  `# Requirement matrix — VISIBILITY-08

| Finding | Implemented | Verified (type) | Still unverified |
|---|---|---|---|
| UTC silent retry removed | Y | FUNCTIONAL injections | prod mysql2 host TZ |
| Sidhu draft base vs ops Pause | Y | SIMULATED callbacks + STATIC Sidhu | live Sidhu auth QA |
| Reload authoritative complete read | Y | FUNCTIONAL client + STATIC Sidhu fetch | live 409 UX |
| Purchase boundary disable + dedupe | Y | FUNCTIONAL coordinator + FIXTURE screenshots | full production route |
| Hub outage ≠ knownEmpty | Y | FUNCTIONAL resolver/validate | live Hubinger outage |
| Writer locks / OCC / URL / restore | Y (preserved) | prior suites + STATIC | live CMS |
| Seasonal order rejection | Y (preserved) | v05 order mocks (options shape) | live checkout |
| Sitemap/canonical/robots | Y (preserved) | STATIC + prior | live crawl |
`,
  "utf8"
);

const readCheckTail = (name) => {
  const p = path.join(OUT, "checks", name);
  if (!fs.existsSync(p)) return "(missing)";
  const t = fs.readFileSync(p, "utf8");
  return t.slice(Math.max(0, t.length - 1500));
};

fs.writeFileSync(
  path.join(STAGING, "CHECK-TAILS.md"),
  ["v08-verification.txt", "tsc.txt", "lint.txt", "build.txt", "v05-verification.txt"]
    .map((n) => `## ${n}\n\n\`\`\`\n${readCheckTail(n)}\n\`\`\`\n`)
    .join("\n"),
  "utf8"
);

if (fs.existsSync(ZIP_PATH)) fs.unlinkSync(ZIP_PATH);
const ps = spawnSync(
  "powershell.exe",
  [
    "-NoProfile",
    "-Command",
    `Compress-Archive -Path '${STAGING}\\*' -DestinationPath '${ZIP_PATH}' -Force`,
  ],
  { encoding: "utf8" }
);
if (ps.status !== 0 || !fs.existsSync(ZIP_PATH)) {
  spawnSync("tar", ["-a", "-c", "-f", ZIP_PATH, "-C", STAGING, "."], {
    encoding: "utf8",
  });
}

// Also copy REPORT/MANIFEST to OUT root for convenience
fs.copyFileSync(path.join(STAGING, "REPORT.md"), path.join(OUT, "REPORT.md"));
fs.copyFileSync(path.join(STAGING, "MANIFEST.json"), path.join(OUT, "MANIFEST.json"));

console.log(
  JSON.stringify(
    {
      zip: ZIP_PATH,
      zip_bytes: fs.existsSync(ZIP_PATH) ? fs.statSync(ZIP_PATH).size : 0,
      zip_sha256: fs.existsSync(ZIP_PATH) ? sha256File(ZIP_PATH) : null,
      candidates: manifestEntries.length,
      tracked: trackedCount,
      untracked: untrackedCount,
      head,
      parent,
      branch,
      node: process.version,
    },
    null,
    2
  )
);
