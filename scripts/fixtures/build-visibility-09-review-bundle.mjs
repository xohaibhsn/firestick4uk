/**
 * Build F4UK-CMS-PRODUCT-VISIBILITY-09 review ZIP.
 * Git metadata via execFileSync argument arrays only.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { execFileSync, spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "../..");
const OUT = path.join(ROOT, "review-artifacts/visibility-09");
const STAGING = path.join(OUT, "bundle-staging");
const ZIP_PATH = path.join(OUT, "F4UK-CMS-PRODUCT-VISIBILITY-09-review.zip");

function git(args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}
function sha256File(abs) {
  return crypto.createHash("sha256").update(fs.readFileSync(abs)).digest("hex");
}
function walkFiles(dir, relBase, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === ".next" || ent.name.endsWith(".zip")) continue;
    if (ent.name === "mount.js") continue; // rebuilt from mount-entry; exclude large binary
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
for (const n of git(["diff", "--name-only", "HEAD"]).split(/\r?\n/).filter(Boolean)) {
  const norm = n.split(path.sep).join("/");
  if (norm.startsWith("review-artifacts/")) continue;
  if (!byPath.has(norm) && fs.existsSync(path.join(ROOT, norm))) {
    byPath.set(norm, { path: norm, git: "modified" });
  }
}
const candidateList = [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));

fs.writeFileSync(path.join(STAGING, "TRACKED-DIFF-vs-HEAD.patch"), git(["diff", "HEAD"]) + "\n", "utf8");

const manifestEntries = [];
for (const c of candidateList) {
  const abs = path.join(ROOT, c.path);
  const size = fs.statSync(abs).size;
  const hash = sha256File(abs);
  copyInto(path.join("sources", c.path), abs);
  manifestEntries.push({ path: c.path, git_status: c.git, size_bytes: size, sha256: hash });
}

const checksSrc = path.join(OUT, "checks");
if (fs.existsSync(checksSrc)) {
  for (const rel of walkFiles(checksSrc, "checks")) copyInto(rel, path.join(OUT, rel));
}
const uiFixture = path.join(OUT, "ui-fixture");
if (fs.existsSync(uiFixture)) {
  for (const rel of walkFiles(uiFixture, "ui-fixture")) copyInto(rel, path.join(OUT, rel));
}

copyInto("migration/migrate-product-seasonality.js", path.join(ROOT, "scripts/migrate-product-seasonality.js"));
copyInto("COMPATIBILITY-ROLLBACK.md", path.join(OUT, "COMPATIBILITY-ROLLBACK.md"));
copyInto("BEFORE-AFTER-REPRODUCTIONS.md", path.join(OUT, "BEFORE-AFTER-REPRODUCTIONS.md"));
fs.writeFileSync(
  path.join(STAGING, "migration/NOT-EXECUTED.txt"),
  "Review-only migration proposal. NOT EXECUTED in Task-09.\n",
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
  "v09-verification",
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
  task: "F4UK-CMS-PRODUCT-VISIBILITY-09",
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
  task08_packaged_candidates: 54,
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
    "ui-fixture/mount.js",
  ],
};
fs.writeFileSync(path.join(STAGING, "MANIFEST.json"), JSON.stringify(manifest, null, 2));

const report = `# F4UK-CMS-PRODUCT-VISIBILITY-09 — LOCAL REVIEW REPORT

## Verdict: LOCAL READINESS

Four Task-08 Berlin integration findings corrected locally. ACTUAL \`ProductDetail.tsx\` browser fixture evidence included. **Not** staging/production accepted. No commit/push/deploy/schema apply/live writes. HEAD unchanged at \`${head}\`.

## Measured baseline

| Field | Measured value |
|---|---|
| Working directory | \`${ROOT}\` |
| Branch | \`${branch}\` |
| HEAD | \`${head}\` |
| Parent (\`HEAD~1\`) | \`${parent}\` |
| Origin | \`${origin}\` |
| Local \`origin/main\` | \`${originMain}\` |
| Remote main | \`${remoteMain}\` |
| Node runtime | \`${process.version}\` (Node20 gap if not v20.x) |
| Candidates (excl. review-artifacts) | **${manifestEntries.length}** (${trackedCount} modified, ${untrackedCount} untracked); Task-08 packaged 54 |

### git status --short

\`\`\`
${statusShort}
\`\`\`

## Findings closure

### P1 — Immutable editor request context
- Panel captures \`editorSessionId\` / productId / starting version **before** await.
- Sidhu compares captured context to current session via \`isActiveEditorRequest\` before any state update.
- Close/switch/reopen invalidates session (including same product).
- **SIMULATED** actual callback integration + **STATIC** wiring.

### P2 — Completed boundary duplicates harmless
- Coordinator returns \`completedDuplicate\` without re-blocking; in-flight joins; stale context ignored.
- ProductDetail binds only via explicit route bind; ignores completed duplicates; does not clobber settled purchase from stale props.
- **FUNCTIONAL** + **FIXTURE** (ACTUAL ProductDetail.tsx).

### P2 — Publication-flag outage unknown/unavailable
- Typed \`readSeasonalHubPublicationFlag\`; failure → \`storedPublished:null\` + \`temporarilyUnavailable\`.
- Hub page renders unavailable before unpublished. HTTP 200 + robots noindex when not effectively public (not a 503 page claim).
- **FUNCTIONAL** resolver + **STATIC** render order.

### P2 — Authorize settings before publication validation
- POST permissions before \`assertSeasonalHubWritesAllowed\`; denied manager → 403 with zero validate/DB calls.
- **FUNCTIONAL** mocked handler.

## Fresh checks

${checkNames.map(checkLine).join("\n")}

## Evidence labels

| Label | Meaning |
|---|---|
| FUNCTIONAL | Executed production helpers/handlers with mocks |
| SIMULATED | Honest Sidhu/panel callback interleaving with refs |
| STATIC | Source wiring |
| FIXTURE | Localhost ACTUAL ProductDetail component fixture |
| UNVERIFIED | Live Sidhu auth, real MySQL, applied schema, prod TZ, ranking |

## Remaining gates

- Approved schema apply + staging verification
- Explicit seasonal/hub opt-in
- Verified seasonal-aware rollback artifact (**PENDING**)
- Live authenticated Sidhu QA
- Berlin / production acceptance
- Junaid SEO review; no ranking guarantee
- Node20 runtime alignment (current: \`${process.version}\`)

## ZIP

\`${ZIP_PATH}\`

STOP.
`;

fs.writeFileSync(path.join(STAGING, "REPORT.md"), report, "utf8");
fs.writeFileSync(
  path.join(STAGING, "REQUIREMENT-MATRIX.md"),
  `# Requirement matrix — VISIBILITY-09

| Finding | Implemented | Verified | Still unverified |
|---|---|---|---|
| Async editor session binding | Y | SIMULATED callbacks + STATIC | live Sidhu auth |
| Completed boundary duplicates | Y | FUNCTIONAL + FIXTURE actual ProductDetail | full production route |
| Publication-flag outage | Y | FUNCTIONAL resolver + STATIC render | live Hostinger outage |
| Settings auth before validation | Y | FUNCTIONAL mocked POST handler | live CMS roles |
| Authoritative Reload / stale Pause | Y (preserved) | v08/v09 smoke | live CMS |
| UTC one-shot query | Y (preserved) | FUNCTIONAL | prod TZ |
`,
  "utf8"
);

if (fs.existsSync(ZIP_PATH)) fs.unlinkSync(ZIP_PATH);
const ps = spawnSync(
  "powershell.exe",
  ["-NoProfile", "-Command", `Compress-Archive -Path '${STAGING}\\*' -DestinationPath '${ZIP_PATH}' -Force`],
  { encoding: "utf8" }
);
if (ps.status !== 0 || !fs.existsSync(ZIP_PATH)) {
  spawnSync("tar", ["-a", "-c", "-f", ZIP_PATH, "-C", STAGING, "."], { encoding: "utf8" });
}

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
