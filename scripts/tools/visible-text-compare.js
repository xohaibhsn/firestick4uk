/**
 * Compare two visible-text capture JSON files.
 * Usage: node scripts/tools/visible-text-compare.js --a <file> --b <file> --out <file>
 * Exit 0 only if allMatch.
 */
"use strict";

const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const out = { a: null, b: null, outFile: null };
  for (let i = 2; i < argv.length; i++) {
    const x = argv[i];
    if (x === "--a") out.a = argv[++i];
    else if (x === "--b") out.b = argv[++i];
    else if (x === "--out") out.outFile = argv[++i];
  }
  return out;
}

function loadCapture(file) {
  const abs = path.resolve(file);
  const data = JSON.parse(fs.readFileSync(abs, "utf8"));
  if (!data || !Array.isArray(data.pages)) {
    throw new Error("invalid capture: " + abs);
  }
  return data;
}

function compare(a, b) {
  const byKeyA = new Map(a.pages.map((p) => [p.key, p]));
  const byKeyB = new Map(b.pages.map((p) => [p.key, p]));
  const keys = [
    ...new Set([...byKeyA.keys(), ...byKeyB.keys()]),
  ].sort();
  const rows = [];
  let matchCount = 0;
  for (const key of keys) {
    const pa = byKeyA.get(key);
    const pb = byKeyB.get(key);
    const match = !!(
      pa &&
      pb &&
      pa.hash &&
      pb.hash &&
      pa.hash === pb.hash
    );
    if (match) matchCount++;
    rows.push({
      key,
      match,
      aLen: pa ? pa.len : null,
      bLen: pb ? pb.len : null,
      aHash: pa ? pa.hash : null,
      bHash: pb ? pb.hash : null,
    });
  }
  const total = keys.length;
  return {
    matchCount,
    total,
    allMatch: matchCount === total && total > 0,
    aCapturedAt: a.capturedAt || null,
    bCapturedAt: b.capturedAt || null,
    rows: rows.map(({ key, match, aLen, bLen }) => ({
      key,
      match,
      aLen,
      bLen,
    })),
  };
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.a || !args.b || !args.outFile) {
    console.error(
      "Usage: node scripts/tools/visible-text-compare.js --a <file> --b <file> --out <file>"
    );
    process.exit(1);
  }
  const a = loadCapture(args.a);
  const b = loadCapture(args.b);
  const result = compare(a, b);
  const outAbs = path.resolve(args.outFile);
  fs.mkdirSync(path.dirname(outAbs), { recursive: true });
  fs.writeFileSync(outAbs, JSON.stringify(result, null, 2) + "\n", "utf8");
  console.log(
    "compare",
    result.matchCount + "/" + result.total,
    "allMatch=" + result.allMatch,
    "wrote",
    outAbs
  );
  process.exit(result.allMatch ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = { compare };
