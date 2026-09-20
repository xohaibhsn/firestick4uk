/**
 * One-time idempotent migration: create admin_audit_log.
 * Run: node scripts/migrate-admin-audit-log.js
 * Does NOT run on API requests or builds.
 */
const fs = require("fs");
const path = require("path");

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

async function main() {
  loadEnvLocal();

  const host = process.env.DB_HOST;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const database = process.env.DB_NAME;
  const port = Number(process.env.DB_PORT) || 3306;

  if (!host || !user || !password || !database) {
    console.error("FAIL: Missing DB_HOST / DB_USER / DB_PASSWORD / DB_NAME");
    process.exit(1);
  }

  console.log(`Target DB: ${user}@${host}:${port}/${database}`);

  const mysql = require("mysql2/promise");
  const conn = await mysql.createConnection({ host, user, password, database, port });

  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS admin_audit_log (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        actor_type ENUM('master','staff') NOT NULL,
        actor_staff_id INT NULL,
        actor_name VARCHAR(255) NOT NULL,
        actor_role ENUM('super_admin','manager','writer') NOT NULL,
        action VARCHAR(100) NOT NULL,
        entity_type VARCHAR(100) NOT NULL,
        entity_id VARCHAR(191) NULL,
        summary VARCHAR(500) NULL,
        metadata_json TEXT NULL,
        ip_address VARCHAR(64) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        KEY idx_audit_created (created_at),
        KEY idx_audit_actor_staff (actor_staff_id),
        KEY idx_audit_action (action),
        KEY idx_audit_entity_type (entity_type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // Idempotent index ensures (in case table existed without them)
    for (const sql of [
      "ALTER TABLE admin_audit_log ADD KEY idx_audit_created (created_at)",
      "ALTER TABLE admin_audit_log ADD KEY idx_audit_actor_staff (actor_staff_id)",
      "ALTER TABLE admin_audit_log ADD KEY idx_audit_action (action)",
      "ALTER TABLE admin_audit_log ADD KEY idx_audit_entity_type (entity_type)",
    ]) {
      try {
        await conn.query(sql);
      } catch {
        /* already exists */
      }
    }

    const [rows] = await conn.query(
      `SELECT COUNT(*) AS c
       FROM information_schema.tables
       WHERE table_schema = ? AND table_name = 'admin_audit_log'`,
      [database]
    );
    const exists = Number(rows[0]?.c || 0) > 0;
    if (!exists) {
      console.error("FAIL: admin_audit_log not found after CREATE");
      process.exit(1);
    }

    console.log("SUCCESS: admin_audit_log is ready");
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error("FAIL:", err?.message || err);
  process.exit(1);
});
