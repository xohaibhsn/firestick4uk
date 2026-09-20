const fs = require("fs");
const path = require("path");
for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (!m) continue;
  let v = m[2].trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (!process.env[m[1].trim()]) process.env[m[1].trim()] = v;
}
const mysql = require("mysql2/promise");
(async () => {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT) || 3306,
  });
  const [r] = await db.query(
    "SELECT content_value FROM site_content WHERE content_key='home_hero_title' LIMIT 1"
  );
  console.log("home_hero_title=", JSON.stringify(r[0]?.content_value));
  const [s] = await db.query(
    "SELECT COUNT(1) AS c FROM admin_staff WHERE email LIKE '%@test.local' OR name LIKE 'Phase%'"
  );
  console.log("test_staff=", s[0].c);
  const [o] = await db.query(
    "SELECT COUNT(1) AS c FROM orders WHERE customer_email LIKE '%@test.local'"
  );
  console.log("test_orders=", o[0].c);
  const [a] = await db.query(
    "SELECT COUNT(1) AS c FROM admin_audit_log WHERE actor_name LIKE 'Phase%'"
  );
  console.log("phase_audit=", a[0].c);
  const [p] = await db.query(
    "SELECT COUNT(1) AS c FROM site_content WHERE content_value LIKE '%P3 Manager Content%'"
  );
  console.log("p3_manager_content_rows=", p[0].c);
  await db.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
