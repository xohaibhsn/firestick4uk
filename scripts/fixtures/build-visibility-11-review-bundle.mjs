/**
 * Package F4UK-CMS-PRODUCT-VISIBILITY-11 review ZIP.
 * Does not modify application/fixture sources (reports/logs only already generated).
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "../..");
const OUT = path.join(ROOT, "review-artifacts/visibility-11");
const STAGING = path.join(OUT, "bundle-staging");
const ZIP_PATH = path.join(OUT, "F4UK-CMS-PRODUCT-VISIBILITY-11-review.zip");

function git(args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}
function sha256File(abs) {
  return crypto.createHash("sha256").update(fs.readFileSync(abs)).digest("hex");
}
function walkFiles(dir, relBase, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".next", ".git", "bundle-staging"].includes(ent.name) || ent.name.endsWith(".zip"))
      continue;
    if (ent.name === "mount.js") continue;
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
function readJson(abs) {
  return JSON.parse(fs.readFileSync(abs, "utf8").replace(/^\uFEFF/, ""));
}

fs.rmSync(STAGING, { recursive: true, force: true });
fs.mkdirSync(STAGING, { recursive: true });

const freeze = readJson(path.join(OUT, "FROZEN-SOURCE-MANIFEST.json"));
fs.writeFileSync(path.join(STAGING, "TRACKED-DIFF-vs-HEAD.patch"), git(["diff", "HEAD"]) + "\n", "utf8");

for (const f of freeze.files) {
  copyInto(path.join("sources", f.path), path.join(ROOT, f.path));
}
copyInto("FROZEN-SOURCE-MANIFEST.json", path.join(OUT, "FROZEN-SOURCE-MANIFEST.json"));
copyInto("FROZEN-SOURCE-DIGEST.txt", path.join(OUT, "FROZEN-SOURCE-DIGEST.txt"));
copyInto("FROZEN-SOURCE-HASHLIST.txt", path.join(OUT, "FROZEN-SOURCE-HASHLIST.txt"));

for (const rel of ["checks", "ui-fixture"]) {
  const abs = path.join(OUT, rel);
  if (!fs.existsSync(abs)) continue;
  for (const r of walkFiles(abs, rel)) copyInto(r, path.join(OUT, r));
}
for (const doc of ["REPORT.md", "REQUIREMENT-MATRIX.md", "COMPATIBILITY-ROLLBACK.md", "MANIFEST.json"]) {
  const abs = path.join(OUT, doc);
  if (fs.existsSync(abs)) copyInto(doc, abs);
}

const mig = path.join(STAGING, "migration");
fs.mkdirSync(mig, { recursive: true });
fs.writeFileSync(
  path.join(mig, "NOT-EXECUTED.txt"),
  "Review-only. Migration NOT executed in any mode. ALLOW_DB_MUTATION_TESTS not enabled.\n",
  "utf8"
);

const manifest = {
  task: "F4UK-CMS-PRODUCT-VISIBILITY-11",
  generated_at: new Date().toISOString(),
  head: freeze.head,
  branch: freeze.branch,
  origin: git(["remote", "get-url", "origin"]),
  frozen_source_manifest_digest_sha256: freeze.source_manifest_digest_sha256,
  candidate_count: freeze.candidate_count,
  task10_zip_sha256: "0b1ef981b596e49327e4cc7d6dce122ed3eb1a8b906289487b2085cc00d4e08b",
  application_source_changed_vs_task10: freeze.application_source_changed_vs_task10,
  files: freeze.files,
};
fs.writeFileSync(path.join(OUT, "MANIFEST.json"), JSON.stringify(manifest, null, 2), "utf8");
copyInto("MANIFEST.json", path.join(OUT, "MANIFEST.json"));

if (fs.existsSync(ZIP_PATH)) fs.rmSync(ZIP_PATH);
execFileSync("tar", ["-a", "-c", "-f", ZIP_PATH, "-C", STAGING, "."], { cwd: ROOT, encoding: "utf8" });
const zipHash = sha256File(ZIP_PATH);
const zipStat = fs.statSync(ZIP_PATH);
fs.writeFileSync(
  path.join(OUT, "ZIP-SHA256.txt"),
  `${zipHash}  F4UK-CMS-PRODUCT-VISIBILITY-11-review.zip\nsize_bytes=${zipStat.size}\n`,
  "utf8"
);
console.log(JSON.stringify({ ok: true, zip: ZIP_PATH, sha256: zipHash, size_bytes: zipStat.size }, null, 2));
