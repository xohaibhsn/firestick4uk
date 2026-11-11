/**
 * Build F4UK-CMS-PRODUCT-VISIBILITY-10 review ZIP.
 * Excludes .tools Node20 cache, secrets, node_modules, .next, nested zips.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "../..");
const OUT = path.join(ROOT, "review-artifacts/visibility-10");
const STAGING = path.join(OUT, "bundle-staging");
const ZIP_PATH = path.join(OUT, "F4UK-CMS-PRODUCT-VISIBILITY-10-review.zip");

function git(args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}
function sha256File(abs) {
  return crypto.createHash("sha256").update(fs.readFileSync(abs)).digest("hex");
}
function walkFiles(dir, relBase, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (
      ent.name === "node_modules" ||
      ent.name === ".next" ||
      ent.name === ".git" ||
      ent.name.endsWith(".zip") ||
      ent.name === "mount.js"
    ) {
      continue;
    }
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
function shouldSkipCandidate(norm) {
  return (
    norm.startsWith("review-artifacts/") ||
    norm.startsWith(".tools/") ||
    norm === ".tools" ||
    norm.startsWith(".env") ||
    /(^|\/)\.env(\.|$)/.test(norm) ||
    /\.(pem|key|p12)$/i.test(norm)
  );
}

fs.rmSync(STAGING, { recursive: true, force: true });
fs.mkdirSync(STAGING, { recursive: true });

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
const byPath = new Map();
for (const line of statusLines) {
  const code = line.slice(0, 2);
  let file = line.slice(3).trim();
  if (file.includes(" -> ")) file = file.split(" -> ").pop();
  const norm = file.split(path.sep).join("/");
  if (shouldSkipCandidate(norm)) continue;
  const abs = path.join(ROOT, file);
  if (!fs.existsSync(abs)) continue;
  const st = fs.statSync(abs);
  if (st.isDirectory()) {
    for (const rel of walkFiles(abs, norm)) {
      if (shouldSkipCandidate(rel)) continue;
      byPath.set(rel, { path: rel, git: code.includes("?") ? "untracked" : "modified" });
    }
  } else {
    byPath.set(norm, { path: norm, git: code.includes("?") ? "untracked" : "modified" });
  }
}
for (const n of git(["diff", "--name-only", "HEAD"]).split(/\r?\n/).filter(Boolean)) {
  const norm = n.split(path.sep).join("/");
  if (shouldSkipCandidate(norm)) continue;
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

// checks + ui-fixture + docs already under OUT
function copyTree(relDir) {
  const abs = path.join(OUT, relDir);
  if (!fs.existsSync(abs)) return;
  for (const rel of walkFiles(abs, relDir)) {
    if (rel.includes("bundle-staging")) continue;
    copyInto(rel, path.join(OUT, rel));
  }
}
copyTree("checks");
copyTree("ui-fixture");
for (const doc of [
  "REPORT.md",
  "COMPATIBILITY-ROLLBACK.md",
  "REQUIREMENT-MATRIX.md",
  "MANIFEST.json",
]) {
  const abs = path.join(OUT, doc);
  if (fs.existsSync(abs)) copyInto(doc, abs);
}

// migration NOT EXECUTED marker
const migDir = path.join(STAGING, "migration");
fs.mkdirSync(migDir, { recursive: true });
fs.writeFileSync(
  path.join(migDir, "NOT-EXECUTED.txt"),
  "Review-only. migrate-product-seasonality.js was NOT executed (including CHECK mode).\nALLOW_DB_MUTATION_TESTS was not enabled.\n",
  "utf8"
);
if (fs.existsSync(path.join(ROOT, "scripts/migrate-product-seasonality.js"))) {
  copyInto(
    "migration/migrate-product-seasonality.js",
    path.join(ROOT, "scripts/migrate-product-seasonality.js")
  );
}

function readJsonSafe(abs) {
  if (!fs.existsSync(abs)) return {};
  const raw = fs.readFileSync(abs, "utf8").replace(/^\uFEFF/, "");
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
const runtimeMeta = readJsonSafe(path.join(OUT, "checks/runtime-node20.meta.json"));
const checkSummary = readJsonSafe(path.join(OUT, "checks/summary.json"));

const manifest = {
  task: "F4UK-CMS-PRODUCT-VISIBILITY-10",
  generated_at: new Date().toISOString(),
  workspace: ROOT,
  branch,
  head,
  parent_measured_via_HEAD_tilde_1: parent,
  origin,
  origin_main_local: originMain,
  remote_main: remoteMain,
  commit_push_deploy: false,
  node_runtime: runtimeMeta.node_version || process.version,
  npm_version: runtimeMeta.npm_version || null,
  node20_isolated: true,
  hostinger_parity_claim: false,
  task09_zip_sha256: "a1ca516ec64bb3d9a00a25b225b7797d6d4c32dffc4f5bdac3f6c99995e36937",
  task09_candidate_count: 59,
  candidate_count: manifestEntries.length,
  tracked_modified_count: manifestEntries.filter((e) => e.git_status === "modified").length,
  untracked_count: manifestEntries.filter((e) => e.git_status === "untracked").length,
  check_summary: checkSummary,
  files: manifestEntries,
};
fs.writeFileSync(path.join(OUT, "MANIFEST.json"), JSON.stringify(manifest, null, 2), "utf8");
copyInto("MANIFEST.json", path.join(OUT, "MANIFEST.json"));

// Zip via tar (avoids Compress-Archive file-lock flakiness on Windows)
if (fs.existsSync(ZIP_PATH)) fs.rmSync(ZIP_PATH);
execFileSync("tar", ["-a", "-c", "-f", ZIP_PATH, "-C", STAGING, "."], {
  cwd: ROOT,
  encoding: "utf8",
});

const zipHash = sha256File(ZIP_PATH);
const zipStat = fs.statSync(ZIP_PATH);
fs.writeFileSync(
  path.join(OUT, "ZIP-SHA256.txt"),
  `${zipHash}  F4UK-CMS-PRODUCT-VISIBILITY-10-review.zip\nsize_bytes=${zipStat.size}\n`,
  "utf8"
);

console.log(
  JSON.stringify(
    {
      ok: true,
      zip: ZIP_PATH,
      sha256: zipHash,
      size_bytes: zipStat.size,
      candidate_count: manifestEntries.length,
      head,
    },
    null,
    2
  )
);
