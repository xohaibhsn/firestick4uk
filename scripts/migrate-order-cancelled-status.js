/**
 * F4UK-MULTI-100 — orders cancelled status + cancel_reason.
 *
 * DEFAULT / --check : prints SQL + SHA256; does NOT load .env*; does NOT connect.
 * Professor already applied this on live (15 Nov 2026). This file is documentation
 * + checksum only — never imported by runtime/build/API.
 *
 * --apply is intentionally unsupported here (live change was via phpMyAdmin).
 */
"use strict";

const crypto = require("crypto");

/** Exact ALTER body Professor applied (stable for hashing). */
const SQL_BODY = `ALTER TABLE orders
  MODIFY COLUMN status ENUM('pending','confirmed','dispatched','delivered','cancelled') NULL DEFAULT 'pending',
  ADD COLUMN cancel_reason VARCHAR(50) NULL DEFAULT NULL AFTER status;`.trim();

function sqlBodySha256(body = SQL_BODY) {
  return crypto.createHash("sha256").update(body, "utf8").digest("hex");
}

if (process.argv.includes("--apply")) {
  console.error(
    "migrate-order-cancelled-status.js: --apply is not supported. Professor applies via phpMyAdmin."
  );
  process.exit(2);
}

console.log("=== migrate-order-cancelled-status (--check) ===");
console.log(SQL_BODY);
console.log("---");
console.log("SHA256:", sqlBodySha256());
process.exit(0);
