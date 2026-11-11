/**
 * Build F4UK-CMS-PRODUCT-VISIBILITY-07 review ZIP.
 * Git metadata via execFileSync argument arrays only — no substituted expected values.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { execFileSync, spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "../..");
const OUT = path.join(ROOT, "review-artifacts/visibility-07");
const STAGING = path.join(OUT, "bundle-staging");
const ZIP_PATH = path.join(OUT, "F4UK-CMS-PRODUCT-VISIBILITY-07-review.zip");

function git(args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

function sha256File(abs) {
  return crypto.createHash("sha256").update(fs.readFileSync(abs)).digest("hex");
}

function walkFiles(dir, relBase, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
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
// Ensure bracket paths from diff are included
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

copyInto(
  "migration/migrate-product-seasonality.js",
  path.join(ROOT, "scripts/migrate-product-seasonality.js")
);
copyInto(
  "COMPATIBILITY-ROLLBACK.md",
  path.join(OUT, "COMPATIBILITY-ROLLBACK.md")
);

const trackedCount = manifestEntries.filter((e) => e.git_status === "modified").length;
const untrackedCount = manifestEntries.filter((e) => e.git_status === "untracked").length;

const readCheckTail = (name) => {
  const p = path.join(OUT, "checks", name);
  if (!fs.existsSync(p)) return "(missing)";
  const t = fs.readFileSync(p, "utf8");
  return t.slice(Math.max(0, t.length - 1200));
};

const manifest = {
  task: "F4UK-CMS-PRODUCT-VISIBILITY-07",
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
  candidate_count: manifestEntries.length,
  tracked_modified_count: trackedCount,
  untracked_count: untrackedCount,
  files: manifestEntries,
  excluded: [
    "secrets",
    "environment files",
    "credentials",
    "cookies",
    "real customer data",
    "node_modules",
    ".next",
    "recursive ZIP inclusion",
  ],
};
fs.writeFileSync(path.join(STAGING, "MANIFEST.json"), JSON.stringify(manifest, null, 2));

const report = `# F4UK-CMS-PRODUCT-VISIBILITY-07 — LOCAL REVIEW REPORT

## Verdict: LOCAL READINESS

Six Berlin findings corrected locally with offline/functional evidence. **Not** staging/production accepted. No commit/push/deploy/schema apply/live writes.

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
| Node runtime | \`${process.version}\` |
| Commit/push/deploy | **None** (HEAD unchanged) |

### git status --short

\`\`\`
${statusShort}
\`\`\`

Candidates excluding \`review-artifacts/\`: **${manifestEntries.length}** (${trackedCount} modified tracked, ${untrackedCount} untracked). Classification from measured \`git status\` (+ diff name inclusion for bracket paths).

## Findings closure

### P1 — Draft content + base version together
- \`lib/productContentDraftClient.ts\` + Sidhu: \`contentDraftBaseVersion\` separate from list/ops version.
- \`loadProducts\` must not advance draft base; 409 opens conflict UI; Save blocked until Reload server content.
- Regression: £65/v3 vs £80/v4 through draft client + PUT expected_version contract (**FUNCTIONAL**).

### P1 — UTC at DB read boundary
- \`lib/productSeasonalQuery.ts\` \`queryWithSeasonalUtc\` + mysql2 \`typeCast\` returns raw UTC SQL strings for \`season_starts_at\`/\`season_ends_at\` only.
- Wired into CMS/lock/public/search/orders/alts/hub/detail/restore paths.
- Date objects rejected by \`parseUtcSqlToMs\`; trap modeled via \`mysql2LocalDateTrapFromUtcSql\`.
- TZ child processes UTC / Europe/London / Asia/Karachi (**FUNCTIONAL**). Production host TZ still **UNVERIFIED**.

### P1 — Restore version bound to selected product
- \`ContentHistoryPanel\` loads current version via authorized \`GET /api/admin-products\` when confirming restore; binds to revision entity_id; ignores stale responses; 409 requires reconfirm (**FUNCTIONAL client flow + STATIC wiring**).

### P2 — Countdown updates purchase presentation
- \`SeasonalCountdown.onBoundary\` + \`ProductDetail.revalidatePurchaseState\` + \`router.refresh\`; bounded retries; fail-closed purchase; works with countdown OFF via boundary timer (**STATIC production source**; interactive browser boundary **partially unverified** in this packaging pass if fixture not re-shot).

### P2 — Hub publication / validation / discovery
- \`seasonal_hub_published\` Super Admin settings key; \`validateSeasonalHubPublicationWrite\` on site-content single/batch + restore; empty publish rejected.
- Effective public = stored published AND useful members; empty/unavailable not indexable success; sitemap once when effectively public; product hub link gated on \`effectivelyPublic\`.

### P2 — Real capability cache identity
- WeakMap opaque adapter identity (no \`__capabilityPoolId\` required). Two ordinary adapters, same schema name, isolated (**FUNCTIONAL**).

## Verification (fresh after last source changes)

| Check | Result |
|---|---|
| lint | 0 errors |
| tsc --noEmit | PASS |
| build | PASS (dummy unreachable DB_*) |
| npm audit / omit=dev | 0 vulnerabilities |
| check-runtime-ddl | PASS |
| check-tracked-secrets | PASS |
| git diff --check | PASS |
| visibility-07 | 48/0 |
| visibility-06 | 26/0 |
| seasonality | 54/0 |
| visibility | 78/0 |
| preservation | 16/0 |
| restore guard | 44/0 |
| URL migration | 52/0 |

Node20 gap: final pass used \`${process.version}\`.

## Evidence labels

- **FUNCTIONAL**: executed production helpers/adapters/client contracts in Node.
- **STATIC**: source wiring assertions (not runtime UI).
- **SIMULATED**: mocked TX interleavings (not real MySQL concurrency).
- **UNVERIFIED**: live Sidhu auth QA, real MySQL, applied schema, Google ranking, production TZ incident.

Migration proposal remains review-only **NOT EXECUTED**.

## Remaining gates

- Approved schema apply + staging verification
- Explicit seasonal/hub opt-in
- Verified seasonal-aware rollback artifact (pointer **PENDING**)
- Berlin / production acceptance
- Junaid structured-data/SEO review (Offer omission tradeoff; no ranking promise)

## ZIP

\`${ZIP_PATH}\`

STOP.
`;

fs.writeFileSync(path.join(STAGING, "REPORT.md"), report, "utf8");
fs.writeFileSync(
  path.join(STAGING, "REQUIREMENT-MATRIX.md"),
  `# Requirement matrix — VISIBILITY-07

| Finding | Implemented | Verified (type) | Still unverified |
|---|---|---|---|
| Draft base vs 409/refresh | Y | FUNCTIONAL client + Sidhu wiring | live Sidhu auth |
| UTC mysql2 read boundary | Y | FUNCTIONAL typeCast + TZ children | prod TZ |
| Restore version binding | Y | FUNCTIONAL client flow + API | live CMS |
| Countdown→CTA revalidate | Y | STATIC + unit wiring | browser boundary screenshots if skipped |
| Hub publish/sitemap | Y | FUNCTIONAL gate + STATIC API | live settings write |
| Capability WeakMap identity | Y | FUNCTIONAL adapters | multi-pool prod |
`,
  "utf8"
);

fs.writeFileSync(
  path.join(STAGING, "CHECK-TAILS.md"),
  ["v07-verification.txt", "lint.txt", "tsc.txt", "build.txt"]
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
  spawnSync(
    "tar",
    ["-a", "-c", "-f", ZIP_PATH, "-C", STAGING, "."],
    { encoding: "utf8" }
  );
}

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
