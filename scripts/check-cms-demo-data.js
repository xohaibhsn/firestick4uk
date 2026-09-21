/**
 * Read-only: flag known fake runtime CMS datasets in NON-ERP production source.
 * Does not scan scripts/, tests, ERP, or docs.
 *
 * Usage: node scripts/check-cms-demo-data.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const SCAN_DIRS = ["app", "components", "pages", "lib"];
const SKIP_DIR_PARTS = new Set(["erp", "node_modules", ".next", "scripts"]);

const PATTERNS = [
  { id: "demoProducts", re: /\bconst\s+demoProducts\s*=\s*\[/ },
  { id: "demoOrders", re: /\bconst\s+demoOrders\s*=\s*\[/ },
  { id: "demoCustomers", re: /\bconst\s+demoCustomers\s*=\s*\[/ },
];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = path.relative(ROOT, full).replace(/\\/g, "/");
    const parts = rel.split("/");
    if (parts.some((p) => SKIP_DIR_PARTS.has(p))) continue;
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(tsx?|jsx?)$/.test(name)) out.push(full);
  }
  return out;
}

const hits = [];
for (const dir of SCAN_DIRS) {
  for (const file of walk(path.join(ROOT, dir))) {
    const text = fs.readFileSync(file, "utf8");
    const rel = path.relative(ROOT, file).replace(/\\/g, "/");
    for (const p of PATTERNS) {
      if (p.re.test(text)) hits.push(`${rel}: ${p.id}`);
    }
  }
}

if (hits.length) {
  console.error("FAIL: runtime CMS demo datasets found:");
  for (const h of hits) console.error(" -", h);
  process.exit(1);
}

console.log("PASS: no runtime CMS demoProducts/demoOrders/demoCustomers arrays in non-ERP source");
process.exit(0);
