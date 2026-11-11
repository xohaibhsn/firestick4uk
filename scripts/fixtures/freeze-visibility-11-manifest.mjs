/**
 * Freeze sorted candidate source manifest + digest BEFORE final verification.
 * Excludes review-artifacts, .tools, secrets, node_modules, .next, .git.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "../..");
const OUT = path.join(ROOT, "review-artifacts/visibility-11");
fs.mkdirSync(OUT, { recursive: true });

function git(args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}
function sha256Buf(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}
function sha256File(abs) {
  return sha256Buf(fs.readFileSync(abs));
}
function walkFiles(dir, relBase, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".next", ".git"].includes(ent.name) || ent.name.endsWith(".zip")) continue;
    const abs = path.join(dir, ent.name);
    const rel = path.join(relBase, ent.name).split(path.sep).join("/");
    if (ent.isDirectory()) walkFiles(abs, rel, acc);
    else acc.push(rel);
  }
  return acc;
}
function skip(norm) {
  return (
    norm.startsWith("review-artifacts/") ||
    norm.startsWith(".tools/") ||
    norm === ".tools" ||
    /(^|\/)\.env(\.|$)/.test(norm)
  );
}

const byPath = new Map();
for (const line of git(["status", "--short"]).split(/\r?\n/).filter(Boolean)) {
  const code = line.slice(0, 2);
  let file = line.slice(3).trim();
  if (file.includes(" -> ")) file = file.split(" -> ").pop();
  const norm = file.split(path.sep).join("/");
  if (skip(norm)) continue;
  const abs = path.join(ROOT, file);
  if (!fs.existsSync(abs)) continue;
  const st = fs.statSync(abs);
  if (st.isDirectory()) {
    for (const rel of walkFiles(abs, norm)) {
      if (skip(rel)) continue;
      byPath.set(rel, code.includes("?") ? "untracked" : "modified");
    }
  } else {
    byPath.set(norm, code.includes("?") ? "untracked" : "modified");
  }
}
for (const n of git(["diff", "--name-only", "HEAD"]).split(/\r?\n/).filter(Boolean)) {
  const norm = n.split(path.sep).join("/");
  if (skip(norm)) continue;
  if (!byPath.has(norm) && fs.existsSync(path.join(ROOT, norm))) byPath.set(norm, "modified");
}

const files = [...byPath.entries()]
  .map(([p, gitStatus]) => {
    const abs = path.join(ROOT, p);
    return {
      path: p,
      git_status: gitStatus,
      size_bytes: fs.statSync(abs).size,
      sha256: sha256File(abs),
    };
  })
  .sort((a, b) => a.path.localeCompare(b.path));

const digestMaterial = files.map((f) => `${f.sha256}  ${f.path}`).join("\n") + "\n";
const digest = sha256Buf(Buffer.from(digestMaterial, "utf8"));

const freeze = {
  task: "F4UK-CMS-PRODUCT-VISIBILITY-11",
  frozen_at_utc: new Date().toISOString(),
  head: git(["rev-parse", "HEAD"]),
  branch: git(["rev-parse", "--abbrev-ref", "HEAD"]),
  candidate_count: files.length,
  source_manifest_digest_sha256: digest,
  digest_algorithm: "sha256 over sorted lines '<file_sha256>  <path>\\n'",
  application_source_changed_vs_task10:
    files.find((f) => f.path === "app/products/[slug]/ProductDetail.tsx")?.sha256 !==
    "4fbec741b05ae84c3e62bac1d954dc7d7a42b4d1dcb9e1ea1eab65555c223c3a"
      ? true
      : false,
  productDetail_sha256: files.find((f) => f.path === "app/products/[slug]/ProductDetail.tsx")?.sha256 || null,
  task10_productDetail_sha256: "4fbec741b05ae84c3e62bac1d954dc7d7a42b4d1dcb9e1ea1eab65555c223c3a",
  files,
};

fs.writeFileSync(path.join(OUT, "FROZEN-SOURCE-MANIFEST.json"), JSON.stringify(freeze, null, 2), "utf8");
fs.writeFileSync(path.join(OUT, "FROZEN-SOURCE-DIGEST.txt"), `${digest}\n`, "utf8");
fs.writeFileSync(path.join(OUT, "FROZEN-SOURCE-HASHLIST.txt"), digestMaterial, "utf8");
console.log(
  JSON.stringify(
    {
      ok: true,
      candidate_count: files.length,
      digest,
      productDetailUnchanged: !freeze.application_source_changed_vs_task10,
    },
    null,
    2
  )
);
