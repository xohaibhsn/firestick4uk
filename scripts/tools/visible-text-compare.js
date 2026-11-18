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
  data.__file = abs;
  return data;
}

function resolveTextPath(capture, page) {
  if (!page) return null;
  const baseDir = path.dirname(capture.__file || ".");
  const candidates = [];
  if (page.textFile) {
    candidates.push(path.resolve(baseDir, page.textFile));
  }
  if (capture.textsDir) {
    candidates.push(path.resolve(baseDir, capture.textsDir, page.key + ".txt"));
  }
  const sibling = (capture.__file || "").replace(/\.json$/i, ".texts");
  if (sibling && page.key) {
    candidates.push(path.join(sibling, page.key + ".txt"));
  }
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return null;
}

function loadTextLines(filePath) {
  if (!filePath) return null;
  const raw = fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const text = raw.endsWith("\n") ? raw.slice(0, -1) : raw;
  return text.split("\n");
}

/**
 * Build a compact line-set + positional diff (max 20 each side).
 * @param {string[]|null} linesA
 * @param {string[]|null} linesB
 */
function buildDiff(linesA, linesB) {
  if (!linesA || !linesB) {
    return {
      textUnavailable: true,
      message: "text unavailable",
      onlyInA: [],
      onlyInB: [],
      positional: [],
    };
  }
  const setA = new Set(linesA);
  const setB = new Set(linesB);
  const onlyInA = [];
  const onlyInB = [];
  for (const line of setA) {
    if (!setB.has(line)) onlyInA.push(line);
  }
  for (const line of setB) {
    if (!setA.has(line)) onlyInB.push(line);
  }
  const positional = [];
  const maxLen = Math.max(linesA.length, linesB.length);
  for (let i = 0; i < maxLen; i++) {
    const a = i < linesA.length ? linesA[i] : undefined;
    const b = i < linesB.length ? linesB[i] : undefined;
    if (a !== b) {
      positional.push({
        line: i + 1,
        a: a === undefined ? null : a,
        b: b === undefined ? null : b,
      });
    }
  }
  return {
    textUnavailable: false,
    onlyInA: onlyInA.slice(0, 20),
    onlyInB: onlyInB.slice(0, 20),
    positional: positional.slice(0, 20),
    onlyInATotal: onlyInA.length,
    onlyInBTotal: onlyInB.length,
    positionalTotal: positional.length,
  };
}

function formatDiffPlain(rows) {
  const parts = [];
  for (const row of rows) {
    if (row.match) continue;
    parts.push("=== " + row.key + " ===");
    if (!row.diff || row.diff.textUnavailable) {
      parts.push("text unavailable");
      continue;
    }
    const d = row.diff;
    if (d.positional && d.positional.length) {
      parts.push("-- first differing lines (positional, up to 20) --");
      for (const p of d.positional) {
        parts.push("  L" + p.line + " A: " + (p.a === null ? "<missing>" : p.a));
        parts.push("  L" + p.line + " B: " + (p.b === null ? "<missing>" : p.b));
      }
    }
    if (d.onlyInA && d.onlyInA.length) {
      parts.push("-- only in A (set, up to 20) --");
      for (const line of d.onlyInA) parts.push("  - " + line);
    }
    if (d.onlyInB && d.onlyInB.length) {
      parts.push("-- only in B (set, up to 20) --");
      for (const line of d.onlyInB) parts.push("  + " + line);
    }
    parts.push("");
  }
  return parts.join("\n");
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
    const row = {
      key,
      match,
      aLen: pa ? pa.len : null,
      bLen: pb ? pb.len : null,
      aHash: pa ? pa.hash : null,
      bHash: pb ? pb.hash : null,
    };
    if (!match) {
      const pathA = resolveTextPath(a, pa);
      const pathB = resolveTextPath(b, pb);
      if (!pathA || !pathB) {
        row.diff = {
          textUnavailable: true,
          message: "text unavailable",
          onlyInA: [],
          onlyInB: [],
          positional: [],
        };
      } else {
        row.diff = buildDiff(loadTextLines(pathA), loadTextLines(pathB));
      }
    }
    rows.push(row);
  }
  const total = keys.length;
  return {
    matchCount,
    total,
    allMatch: matchCount === total && total > 0,
    aCapturedAt: a.capturedAt || null,
    bCapturedAt: b.capturedAt || null,
    rows: rows.map(({ key, match, aLen, bLen, diff }) => {
      const out = { key, match, aLen, bLen };
      if (diff) out.diff = diff;
      return out;
    }),
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

  const diffPath = outAbs.replace(/\.json$/i, "") + ".diff.txt";
  const plain = formatDiffPlain(result.rows);
  fs.writeFileSync(diffPath, (plain || "(no mismatches)") + "\n", "utf8");

  for (const row of result.rows) {
    if (row.match) continue;
    console.log("mismatch", row.key);
    if (!row.diff || row.diff.textUnavailable) {
      console.log("  text unavailable");
      continue;
    }
    const pos = row.diff.positional || [];
    for (const p of pos.slice(0, 5)) {
      console.log("  L" + p.line + " A:", p.a === null ? "<missing>" : p.a);
      console.log("  L" + p.line + " B:", p.b === null ? "<missing>" : p.b);
    }
  }

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
