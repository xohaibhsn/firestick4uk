/**
 * Phase 13 — CMS data integrity (mostly static/source checks).
 * Mutating integration tests (if any) require ALLOW_DB_MUTATION_TESTS=YES_I_UNDERSTAND.
 *
 * Usage:
 *   node scripts/phase13-cms-data-integrity-tests.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const SIDHU = path.join(ROOT, "app", "sidhu", "page.tsx");
const ADMIN_PRODUCTS = path.join(ROOT, "pages", "api", "admin-products.ts");

function read(p) {
  return fs.readFileSync(p, "utf8");
}

function main() {
  const out = {};
  const mark = (id, ok, detail = "") => {
    out[id] = ok ? "PASS" : "FAIL";
    console.log(`${ok ? "PASS" : "FAIL"} ${id}${detail ? " — " + detail : ""}`);
  };

  const src = read(SIDHU);
  const api = read(ADMIN_PRODUCTS);

  // A–C no runtime demo arrays
  mark("A", !/\bconst\s+demoProducts\s*=\s*\[/.test(src) && !/\bdemoProducts\b/.test(src), "demoProducts absent");
  mark("B", !/\bconst\s+demoOrders\s*=\s*\[/.test(src) && !/\bdemoOrders\b/.test(src), "demoOrders absent");
  mark("C", !/\bconst\s+demoCustomers\s*=\s*\[/.test(src) && !/\bdemoCustomers\b/.test(src), "demoCustomers absent");

  // D products initial state empty
  mark(
    "D",
    /useState\s*<[^>]*>\s*\(\s*\[\s*\]\s*\)/.test(src) &&
      /const\s+\[products,\s*setProducts\]\s*=\s*useState/.test(src) &&
      !/useState\s*<[^>]*>\s*\(\s*demoProducts\s*\)/.test(src),
    "products = []"
  );

  // E empty array accepted (no length > 0 gate on setProducts from API)
  mark(
    "E",
    /setProducts\(\s*Array\.isArray\(data\)\s*\?\s*data\s*:\s*\[\s*\]\s*\)/.test(src) &&
      !/Array\.isArray\(data\)\s*&&\s*data\.length\s*>\s*0\s*\)\s*setProducts/.test(src),
    "empty array sets []"
  );

  // F failure clears products
  mark(
    "F",
    /Failed to load products/.test(src) &&
      /setProductsError\(\s*"Failed to load products"\s*\)/.test(src) &&
      /setProducts\(\s*\[\s*\]\s*\)/.test(src),
    "error clears products"
  );

  // G create failure does not add local row — no optimistic append on create
  mark(
    "G",
    !/setProducts\(\s*\[\s*\.\.\.products,\s*\{\s*\.\.\.editProduct/.test(src) &&
      /await loadProducts\(\)/.test(src),
    "no optimistic create append"
  );

  // H no Date.now() product id fallback
  mark("H", !/res\.id\s*\|\|\s*Date\.now\(\)/.test(src) && !/id:\s*newId.*Date\.now/.test(src), "no Date.now id");

  // I update failure does not mutate local row optimistically
  mark(
    "I",
    !/setProducts\(\s*products\.map\(\s*p\s*=>\s*p\.id\s*===\s*productModal\.id/.test(src),
    "no optimistic update map"
  );

  // J delete requires confirmation text about history/restore
  mark(
    "J",
    /Delete this product\? A history snapshot will be kept/.test(src) &&
      /cannot be restored automatically/.test(src),
    "confirm text"
  );

  // K delete failure keeps row (only loadProducts after success)
  mark(
    "K",
    /const deleteProduct = async/.test(src) &&
      !/setProducts\(\s*products\.filter\(\s*p\s*=>\s*p\.id\s*!==\s*id\s*\)\s*\)/.test(src) &&
      /await loadProducts\(\)/.test(src),
    "no optimistic filter delete"
  );

  // L/M/N successful mutations reload
  mark("L", /setProductMsg\("✅ Product saved"\)[\s\S]{0,80}await loadProducts\(\)/.test(src), "create reload");
  mark("M", /await loadProducts\(\)/.test(src) && /method:\s*isNew \? "POST" : "PUT"/.test(src), "update uses loadProducts");
  mark("N", /setProductMsg\("✅ Product deleted"\)[\s\S]{0,80}await loadProducts\(\)/.test(src), "delete reload");

  // O Writer products roles — nav item roles exclude writer
  mark(
    "O",
    /id:\s*"products"[\s\S]{0,120}roles:\s*\[\s*"super_admin"\s*,\s*"manager"\s*\]/.test(src),
    "products nav SA+manager only"
  );

  // P Manager/Super unchanged — products.view gate still used
  mark("P", /can\("products\.view"\)/.test(src) && /can\("products\.manage"\)/.test(src), "RBAC gates present");

  // Q Media picker still wired for products
  mark(
    "Q",
    /Choose from Library/.test(src) &&
      /setMediaPicker/.test(src) &&
      /firestick4uk\/products|purpose.*products|purposes:.*products/.test(src),
    "media picker present"
  );

  // R History backend path still used
  mark(
    "R",
    /recordContentRevision/.test(api) &&
      /snapshotProduct/.test(api) &&
      /\/api\/admin-products/.test(src) &&
      !/pool\.query/.test(src),
    "revisions via admin-products API"
  );

  const fails = Object.entries(out).filter(([, v]) => v === "FAIL");
  console.log("\n========== SUMMARY ==========");
  for (const id of "ABCDEFGHIJKLMNOPQR".split("")) console.log(`${out[id] || "MISSING"} ${id}`);
  console.log(fails.length ? `\nFAILED: ${fails.length}` : "\nALL PASS");
  process.exit(fails.length ? 1 : 0);
}

main();
