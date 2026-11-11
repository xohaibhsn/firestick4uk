/**
 * Build F4UK-CMS-PRODUCT-VISIBILITY-06 review ZIP (local packaging only).
 * Does not commit, push, or deploy.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { execSync, spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "../..");
const OUT = path.join(ROOT, "review-artifacts/visibility-06");
const STAGING = path.join(OUT, "bundle-staging");
const ZIP_PATH = path.join(OUT, "F4UK-CMS-PRODUCT-VISIBILITY-06-review.zip");

function sh(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: "utf8" }).trim();
}

function sha256File(abs) {
  const h = crypto.createHash("sha256");
  h.update(fs.readFileSync(abs));
  return h.digest("hex");
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

const branch = sh("git rev-parse --abbrev-ref HEAD");
const head = sh("git rev-parse HEAD");
const parent = sh("git rev-parse HEAD^");
const origin = sh("git remote get-url origin");
const statusShort = sh("git status --short");
let originMain = "";
let remoteMain = "";
try {
  originMain = sh("git rev-parse origin/main");
} catch {
  originMain = "(unavailable)";
}
try {
  remoteMain = sh("git ls-remote origin refs/heads/main").split(/\s+/)[0] || "";
} catch {
  remoteMain = "(unavailable)";
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
      candidates.push({
        path: rel,
        git: code.includes("?") ? "untracked" : "modified",
      });
    }
  } else {
    candidates.push({
      path: norm,
      git: code.includes("?") ? "untracked" : "modified",
    });
  }
}
const byPath = new Map();
for (const c of candidates) byPath.set(c.path, c);
const candidateList = [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));

// Unified tracked diff vs HEAD (includes sidhu)
const trackedDiff = sh("git diff HEAD");
fs.writeFileSync(path.join(STAGING, "TRACKED-DIFF-vs-HEAD.patch"), trackedDiff + "\n", "utf8");

// Full contents of every candidate source
const sourcesDir = path.join(STAGING, "sources");
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

// Checks (sanitized — already written without secrets)
const checksSrc = path.join(OUT, "checks");
if (fs.existsSync(checksSrc)) {
  for (const rel of walkFiles(checksSrc, "checks")) {
    copyInto(rel, path.join(OUT, rel));
  }
}

// UI fixture evidence (exclude vendor react copies / huge bundles from ZIP? include screenshots + evidence + html + notes)
const fixtureSrc = path.join(OUT, "ui-fixture");
const fixtureKeep = [
  "desktop-interactive.html",
  "mobile-interactive.html",
  "desktop-after-pause.png",
  "mobile-after-pause.png",
  "visibility-06-desktop-after-pause.png",
  "visibility-06-mobile-after-pause.png",
  "interaction-results.json",
  "browser-interaction-evidence.json",
  "harness-server.json",
  "FIXTURE-NOTES.md",
];
fs.writeFileSync(
  path.join(fixtureSrc, "FIXTURE-NOTES.md"),
  `# Interactive fixture notes (Task-06)

## Distinction
- **Component fixture**: actual \`ProductSeasonalityPanel\` mounted via esbuild IIFE + \`ReactDOM.createRoot\`, fetch mocked at boundary.
- **Integration harness**: Node \`postSeasonPatch\` contract + browser click evidence.
- **NOT** full Sidhu authenticated CMS QA. No production auth-bypass routes.

## Evidence
- Desktop viewport recorded as 1920x1080; mobile emulation 390x844; overflowX false both.
- Pause click sent PATCH \`{ action:\"pause\", id:42, expected_version:4 }\`; authoritative version became 5; message "✅ Pause season".
- Window inputs populated from UTC SQL via London wall+offset (\`2026-12-01T00:00:00\` / \`+00:00\`).

## How to reproduce
\`\`\`
node scripts/fixtures/seasonality-panel-interactive-harness.mjs
# open http://127.0.0.1:8766/desktop-interactive.html
\`\`\`
`,
  "utf8"
);
for (const name of fixtureKeep) {
  const abs = path.join(fixtureSrc, name);
  if (fs.existsSync(abs)) copyInto(path.join("ui-fixture", name), abs);
}

// Migration proposal (review-only)
copyInto(
  "migration/migrate-product-seasonality.js",
  path.join(ROOT, "scripts/migrate-product-seasonality.js")
);

const trackedCount = manifestEntries.filter((e) => e.git_status === "modified").length;
const untrackedCount = manifestEntries.filter((e) => e.git_status === "untracked").length;

const manifest = {
  task: "F4UK-CMS-PRODUCT-VISIBILITY-06",
  generated_at: new Date().toISOString(),
  workspace: ROOT,
  branch,
  head,
  parent,
  origin,
  origin_main_local: originMain,
  remote_main: remoteMain,
  commit_push_deploy: false,
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
    "ui-fixture vendor/react bundles",
  ],
};
fs.writeFileSync(path.join(STAGING, "MANIFEST.json"), JSON.stringify(manifest, null, 2));

const report = `# F4UK-CMS-PRODUCT-VISIBILITY-06 — LOCAL REVIEW REPORT

## Verdict: LOCAL READINESS

Local implementation and offline/interactive verification for product visibility/seasonality Task-06 are complete enough for Berlin review packaging. **Not accepted** for staging/production. Schema apply, Berlin acceptance, production acceptance, live CMS QA, and real MySQL concurrency remain pending.

## Baseline (before/after HEAD unchanged — no commit)

| Field | Value |
|---|---|
| Working directory | \`${ROOT}\` |
| Branch | \`${branch}\` |
| HEAD (before & after) | \`${head}\` |
| Parent | \`${parent}\` |
| Origin | \`${origin}\` |
| Local \`origin/main\` | \`${originMain}\` |
| Remote \`main\` (ls-remote) | \`${remoteMain}\` |
| Commit / push / deploy | **None** |

### git status --short (at packaging)

\`\`\`
${statusShort}
\`\`\`

Candidate source files (excluding \`review-artifacts/\`): **${manifestEntries.length}** (${trackedCount} modified tracked, ${untrackedCount} untracked). Classification from actual \`git status\` (old Task-05 manifest classification discrepancies superseded).

## Task-05 defects corrected (closure)

### 2. Product writer concurrency
- Shared \`lib/productWriterTx.ts\`: \`FOR UPDATE\` lock, version gate, merge omitted content from locked row, slug protection, 409 stale, single version increment, no-op without revision/audit/increment, max-version no-op without increment, assert update outcomes.
- Wired into ordinary PUT, privacy/visibility PATCH, lifecycle/listing/presentation PATCH, DELETE, restore, URL migration.
- Restore remains content-only; expected_version from current product under lock; never restores privacy/shop/lifecycle/window/pause/version from history.
- **SIMULATED** mocked interleavings only — not proof of real MySQL concurrency.

### 3. CMS client contracts / refresh
- Delete sends \`expected_version\`.
- Seasonal PATCH returns authoritative \`product\` + version; Sidhu \`applyAuthoritativeProductRow\` / modal sync after loadProducts; URL migration updates slug+version.
- Panel syncs London wall+offset inputs when server product changes; Permanent = year-round (not lifetime).
- Conflict handling: refresh/reload path; no silent auto-resubmit of stale content.

### 4. Customer-facing seasonal experience
- \`SeasonalCountdown\` + \`SeasonalAlternativeCards\` on product detail.
- Available = purchasable eligible only; Upcoming = upcoming rule; server-resolved; no private leak.
- Archive: HTTP 200, canonical/indexable, purchase disabled, Offer omitted when not purchasable.

### 5. Hub publication / SEO
- Hub unpublished by default (\`isSeasonalHubPublished\`); product hub link gated on published.
- Empty publish rejected server-side; sitemap TTL behavior unchanged (300s cache; invalidation shim is no-op — no immediate invalidation claim).

### 6. Capability fail-closed
- Empty/error/partial/contradictory → unknown; never manufacture expanded from subset SELECT.
- Cache scoped by schema/pool/context; adapter tests in v06 suite.
- Order eligibility after locks; unknown denies purchase; public active=1 pages still resolve.

### 7. UTC read/write contract
- Strict London validation; store UTC; portable DATETIME decode; reject Feb 30 / junk; summer/winter TZ tests in seasonality suite.
- Migration remains **review-only / NOT EXECUTED**.

## Verification (fresh after last source changes)

Runtime: **Node v24.16.0** (Node 20 preferred — **gap**: Node20 binary not used for this final pass).

| Check | Result |
|---|---|
| \`npm run lint\` | 0 errors (497 pre-existing warnings); \`review-artifacts/**\` ignored |
| \`npx tsc --noEmit\` | PASS |
| \`npm run build\` | PASS (dummy unreachable DB_* process env) |
| \`npm audit\` | 0 vulnerabilities |
| \`npm audit --omit=dev\` | 0 vulnerabilities |
| \`check-runtime-ddl.js\` | PASS |
| \`check-tracked-secrets.js\` | PASS |
| \`git diff --check\` | PASS |
| visibility offline | 78/0 |
| seasonality offline | 54/0 |
| visibility-06 verification | 26/0 |
| visibility-05 verification | 41/0 |
| active preservation | 16/0 |
| SEO revision restore guard | 44/0 |
| URL migration | 52/0 |
| Interactive fixture | PASS (desktop+mobile; pause PATCH expected_version) |

Refused / unavailable: live DB, migration execute, \`ALLOW_DB_MUTATION_TESTS\`, Hostinger/env changes, authenticated Sidhu CMS QA, real MySQL concurrency, Google ranking/indexing acceptance.

## Requirement matrix (abbrev)

| Area | Status |
|---|---|
| Writer OCC under lock | Implemented + offline SIMULATED |
| CMS delete version + refresh | Implemented + fixture verified |
| Countdown + alt cards | Implemented + suite verified |
| Hub unpublished / gated links | Implemented + suite verified |
| Capability fail-closed + cache isolation | Implemented + suite verified |
| UTC portable contract | Implemented + suite verified |
| Migration apply | Review-only proposal — **not executed** |
| Berlin / production acceptance | **Still unverified** |
| Live authenticated CMS | **Still unverified** |

## Compatibility notes

1. **Before expansion**: legacy \`active\` privacy + checkout preserved; unknown capability denies seasonal purchase paths.
2. **After defaults (expanded schema, no opt-in)**: permanent products keep prior public/SEO presentation; hub unpublished; no bulk seasonal links.
3. **After seasonal opt-in**: window/pause/listing/countdown/alternatives apply; archives remain indexable without purchase Offer.

Still required separately: approved schema apply, staging verification, explicit hub/product opt-in, compatible rollback build.

## Interactive evidence paths

- \`ui-fixture/desktop-after-pause.png\` / \`mobile-after-pause.png\`
- \`ui-fixture/browser-interaction-evidence.json\`
- \`ui-fixture/FIXTURE-NOTES.md\`

## ZIP

\`${ZIP_PATH}\`

STOP — no further task started.
`;

fs.writeFileSync(path.join(STAGING, "REPORT.md"), report, "utf8");

// Requirement matrix file
fs.writeFileSync(
  path.join(STAGING, "REQUIREMENT-MATRIX.md"),
  `# Requirement matrix — VISIBILITY-06

| ID | Requirement | Implemented | Verified | Simulated | Still unverified |
|---|---|---|---|---|---|
| W1 | PUT lock+version before write | Y | offline | Y (interleave) | real MySQL |
| W2 | PATCH privacy/lifecycle under lock | Y | offline | Y | real MySQL |
| W3 | DELETE version gate | Y | offline+client | Y | live CMS |
| W4 | Restore content-only + current version | Y | suite | partial | live CMS |
| W5 | URL migration version+slug protect | Y | suite | Y | live CMS |
| C1 | deleteProduct expected_version | Y | fixture/source | | live Sidhu |
| C2 | Mutation refresh modal+list | Y | source+fixture | | live Sidhu |
| C3 | London window init/sync | Y | fixture | | |
| P1 | Countdown display control | Y | suite | | browser SSR prod |
| P2 | Available/Upcoming cards | Y | suite | | browser SSR prod |
| P3 | Archive SEO/Offer omit | Y | suite/source | | staging crawl |
| H1 | Hub unpublished default | Y | suite | | staging |
| H2 | Hub link gated | Y | suite | | staging |
| H3 | Empty publish reject | Y | suite | | live settings write |
| Cap1 | Fail-closed unknown | Y | suite | | multi-DB prod |
| Cap2 | Cache schema/pool scoped | Y | suite | | |
| UTC1 | Strict parse + portable read | Y | suite | | prod TZ unverified |
| Mig1 | Migration proposal only | Y | review text | | apply approval |
| Int1 | Real panel interactive | Y | browser fixture | | Sidhu auth QA |
`,
  "utf8"
);

fs.writeFileSync(
  path.join(STAGING, "COMPATIBILITY-ROLLBACK.md"),
  `# Compatibility / rollback

- Pre-expansion: no seasonal columns → capability legacy/unknown; permanent commerce unchanged.
- Expanded defaults: shop_listed/lifecycle defaults; hub unpublished; non-opted products retain SEO.
- Opt-in seasonal: uses UTC windows; pause/end archive purchasability without rewriting content/SEO fields.
- Rollback: deploy prior build that ignores new columns; do not drop columns without approved plan; migration script is CHECK/default review-only and was NOT executed in Task-06.
`,
  "utf8"
);

// Create ZIP via PowerShell Compress-Archive (exclude nesting prior zip)
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
if (ps.status !== 0) {
  console.error(ps.stderr || ps.stdout);
  process.exit(1);
}

const zipStat = fs.statSync(ZIP_PATH);
console.log(
  JSON.stringify(
    {
      zip: ZIP_PATH,
      zip_bytes: zipStat.size,
      zip_sha256: sha256File(ZIP_PATH),
      candidates: manifestEntries.length,
      tracked: trackedCount,
      untracked: untrackedCount,
      head,
      branch,
    },
    null,
    2
  )
);
