/**
 * Phase 6A — production test-artifact cleanup.
 * DEFAULT: dry-run (no writes). Apply only with: --apply
 *
 * Usage:
 *   node scripts/cleanup-production-test-artifacts.js
 *   node scripts/cleanup-production-test-artifacts.js --apply
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

const APPLY = process.argv.includes("--apply");
const HOME_HERO_BAD = "P3 Manager Content";
const HOME_HERO_GOOD = "Premium UK Streaming Service";

function isPhaseTestEmail(email) {
  const e = String(email || "").toLowerCase();
  return /^phase[345]\./.test(e) && e.endsWith("@test.local");
}

function isPhaseTestName(name) {
  return /^Phase[345]\b/i.test(String(name || "").trim());
}

function looksLikeTestAuditActor(name) {
  return /^Phase[345]/i.test(String(name || "").trim());
}

async function main() {
  loadEnvLocal();
  const mysql = require("mysql2/promise");
  const host = process.env.DB_HOST;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const database = process.env.DB_NAME;
  const port = Number(process.env.DB_PORT) || 3306;
  if (!host || !user || !password || !database) {
    console.error("FAIL: Missing DB env");
    process.exit(1);
  }

  console.log(`Mode: ${APPLY ? "APPLY" : "DRY-RUN"}`);
  console.log(`Target DB: ${user}@${host}:${port}/${database}\n`);

  const db = await mysql.createConnection({ host, user, password, database, port });
  const actions = [];
  const reportOnly = [];

  // ── site_content home_hero_title ─────────────────────────────────────────
  try {
    const [rows] = await db.query(
      "SELECT id, content_key, content_value FROM site_content WHERE content_key='home_hero_title' LIMIT 1"
    );
    if (rows[0]) {
      const val = String(rows[0].content_value || "");
      console.log(`[site_content] home_hero_title current=${JSON.stringify(val)}`);
      if (val === HOME_HERO_BAD) {
        actions.push({
          table: "site_content",
          id: rows[0].id,
          key: "home_hero_title",
          action: "RESTORE",
          reason: `Exact match "${HOME_HERO_BAD}" → "${HOME_HERO_GOOD}"`,
        });
      } else if (/P3|Phase[345]|Manager Content|Writer Content/i.test(val)) {
        reportOnly.push({
          table: "site_content",
          id: rows[0].id,
          key: "home_hero_title",
          reason: `Suspicious but not exact bad value: ${JSON.stringify(val.slice(0, 80))}`,
        });
      }
    }
  } catch (e) {
    console.log("[site_content] skip:", e.message);
  }

  // Other site_content with obvious test patterns
  try {
    const [rows] = await db.query(
      `SELECT id, content_key, LEFT(content_value, 120) AS preview
       FROM site_content
       WHERE content_value LIKE '%P3 Manager Content%'
          OR content_value LIKE '%@test.local%'
          OR content_value LIKE 'Phase3%'
          OR content_value LIKE 'Phase4%'
          OR content_value LIKE 'Phase5%'
          OR content_value LIKE '%phase3.%'
          OR content_value LIKE '%phase4.%'
          OR content_value LIKE '%phase5.%'`
    );
    for (const r of rows || []) {
      if (r.content_key === "home_hero_title") continue;
      reportOnly.push({
        table: "site_content",
        id: r.id,
        key: r.content_key,
        reason: `Suspicious content preview: ${JSON.stringify(r.preview)}`,
      });
    }
  } catch (e) {
    console.log("[site_content scan] skip:", e.message);
  }

  // ── admin_staff test users ───────────────────────────────────────────────
  let testStaff = [];
  try {
    const [rows] = await db.query(
      "SELECT id, name, email, role, active FROM admin_staff ORDER BY id"
    );
    for (const r of rows || []) {
      if (isPhaseTestEmail(r.email) || isPhaseTestName(r.name)) {
        testStaff.push(r);
        actions.push({
          table: "admin_staff",
          id: r.id,
          key: r.email,
          action: "DELETE_STAFF",
          reason: `Test staff name/email: ${r.name} / ${r.email} (role=${r.role})`,
        });
      }
    }
    console.log(`[admin_staff] total=${rows.length} testCandidates=${testStaff.length}`);
  } catch (e) {
    console.log("[admin_staff] skip:", e.message);
  }

  // ── admin_sessions for those staff ───────────────────────────────────────
  if (testStaff.length) {
    const ids = testStaff.map((s) => s.id);
    const ph = ids.map(() => "?").join(",");
    const [sess] = await db.query(
      `SELECT id, staff_id, principal_name, role FROM admin_sessions WHERE staff_id IN (${ph})`,
      ids
    );
    for (const s of sess || []) {
      actions.push({
        table: "admin_sessions",
        id: s.id,
        key: `staff_id=${s.staff_id}`,
        action: "DELETE_SESSION",
        reason: "Session for test staff",
      });
    }
  }

  // ── orders with @test.local / Phase public ───────────────────────────────
  try {
    const [rows] = await db.query(
      `SELECT order_id, customer_name, customer_email, status
       FROM orders
       WHERE customer_email LIKE '%@test.local'
          OR customer_name LIKE 'Phase%'
          OR customer_name LIKE 'Phase4 Public%'
          OR customer_email LIKE 'phase4.%'
          OR customer_email LIKE 'phase5.%'`
    );
    for (const r of rows || []) {
      const email = String(r.customer_email || "").toLowerCase();
      const name = String(r.customer_name || "");
      const clear =
        email.endsWith("@test.local") ||
        /^Phase[345]/i.test(name) ||
        /^Phase4 Public/i.test(name);
      if (clear) {
        actions.push({
          table: "orders",
          id: r.order_id,
          key: email || name,
          action: "DELETE_ORDER",
          reason: `Test order customer=${name} email=${email} status=${r.status}`,
        });
      } else {
        reportOnly.push({
          table: "orders",
          id: r.order_id,
          reason: `Uncertain match name=${name} email=${email}`,
        });
      }
    }
  } catch (e) {
    console.log("[orders] skip:", e.message);
  }

  // ── products integrity (report only) ─────────────────────────────────────
  try {
    const [rows] = await db.query(
      `SELECT id, name, slug,
              CASE WHEN description IS NULL OR description='' THEN 1 ELSE 0 END AS blank_description,
              CASE WHEN short_description IS NULL OR short_description='' THEN 1 ELSE 0 END AS blank_short,
              CASE WHEN full_description IS NULL OR full_description='' THEN 1 ELSE 0 END AS blank_full,
              CASE WHEN image IS NULL OR image='' THEN 1 ELSE 0 END AS blank_image,
              CASE WHEN features IS NULL OR features='' THEN 1 ELSE 0 END AS blank_features,
              CASE WHEN seo_title IS NULL OR seo_title='' THEN 1 ELSE 0 END AS blank_seo_title,
              CASE WHEN meta_description IS NULL OR meta_description='' THEN 1 ELSE 0 END AS blank_meta,
              CASE WHEN og_image IS NULL OR og_image='' THEN 1 ELSE 0 END AS blank_og
       FROM products`
    );
    for (const r of rows || []) {
      const blanks = [];
      if (r.blank_description) blanks.push("description");
      if (r.blank_short) blanks.push("short_description");
      if (r.blank_full) blanks.push("full_description");
      if (r.blank_image) blanks.push("image");
      if (r.blank_features) blanks.push("features");
      if (r.blank_seo_title) blanks.push("seo_title");
      if (r.blank_meta) blanks.push("meta_description");
      if (r.blank_og) blanks.push("og_image");
      // Only flag if multiple content fields blank (possible test wipe) — still report-only
      if (blanks.length >= 3) {
        reportOnly.push({
          table: "products",
          id: r.id,
          key: r.slug || r.name,
          reason: `Multiple blank fields (manual review): ${blanks.join(", ")}`,
        });
      }
    }
  } catch (e) {
    console.log("[products] skip:", e.message);
  }

  // ── blog / faqs / coupons obvious test ───────────────────────────────────
  for (const [table, sql] of [
    [
      "blog_posts",
      `SELECT id, title FROM blog_posts WHERE title LIKE '%Phase%' OR title LIKE '%@test.local%' OR slug LIKE '%phase%'`,
    ],
    [
      "faqs",
      `SELECT id, LEFT(question,80) AS title FROM faqs WHERE question LIKE '%Phase%' OR answer LIKE '%@test.local%'`,
    ],
    [
      "coupons",
      `SELECT id, code AS title FROM coupons WHERE code LIKE 'PHASE%' OR code LIKE 'TEST%'`,
    ],
  ]) {
    try {
      const [rows] = await db.query(sql);
      for (const r of rows || []) {
        reportOnly.push({
          table,
          id: r.id,
          key: r.title,
          reason: "Suspicious Phase/test pattern — report only",
        });
      }
    } catch (e) {
      /* table may differ */
    }
  }

  // ── admin_audit_log test actors ──────────────────────────────────────────
  let auditDeleteIds = [];
  try {
    const [rows] = await db.query(
      `SELECT id, actor_name, action, summary
       FROM admin_audit_log
       WHERE actor_name LIKE 'Phase3%'
          OR actor_name LIKE 'Phase4%'
          OR actor_name LIKE 'Phase5%'
          OR summary LIKE '%phase4-verify%'
          OR summary LIKE '%Phase4%'
          OR summary LIKE '%Phase5%'`
    );
    for (const r of rows || []) {
      if (looksLikeTestAuditActor(r.actor_name) || /phase[45]/i.test(String(r.summary || ""))) {
        auditDeleteIds.push(r.id);
        actions.push({
          table: "admin_audit_log",
          id: r.id,
          key: r.actor_name,
          action: "DELETE_AUDIT",
          reason: `Test audit actor/summary: ${r.actor_name} / ${r.action}`,
        });
      } else {
        reportOnly.push({
          table: "admin_audit_log",
          id: r.id,
          reason: `Uncertain audit: actor=${r.actor_name} action=${r.action}`,
        });
      }
    }
  } catch (e) {
    console.log("[admin_audit_log] skip:", e.message);
  }

  // ── Active staff super_admin presence ────────────────────────────────────
  try {
    const [sa] = await db.query(
      "SELECT id, name, email FROM admin_staff WHERE role='super_admin' AND active=1"
    );
    console.log(`\n[Active DB super_admins] count=${sa.length}`);
    for (const s of sa) {
      console.log(`  - id=${s.id} name=${s.name} email=${s.email}`);
    }
  } catch {
    /* ignore */
  }

  console.log("\n========== DRY-RUN / CANDIDATE ACTIONS ==========");
  for (const a of actions) {
    console.log(
      `${a.action.padEnd(14)} ${a.table}.${a.id} ${a.key || ""} — ${a.reason}`
    );
  }
  console.log(`\nActions: ${actions.length}`);
  console.log("\n========== REPORT ONLY (no auto-delete) ==========");
  for (const r of reportOnly) {
    console.log(
      `REPORT ${r.table}.${r.id} ${r.key || ""} — ${r.reason}`
    );
  }
  console.log(`Report-only: ${reportOnly.length}`);

  if (!APPLY) {
    console.log("\nNo changes made (dry-run). Re-run with --apply to execute safe actions.");
    await db.end();
    return;
  }

  console.log("\n========== APPLYING ==========");
  let restoredHero = false;
  let deletedStaff = 0;
  let deletedSessions = 0;
  let deletedOrders = 0;
  let deletedAudit = 0;

  for (const a of actions) {
    if (a.action === "RESTORE" && a.key === "home_hero_title") {
      const [check] = await db.query(
        "SELECT content_value FROM site_content WHERE content_key='home_hero_title' LIMIT 1"
      );
      if (check[0] && String(check[0].content_value) === HOME_HERO_BAD) {
        await db.query(
          "UPDATE site_content SET content_value=? WHERE content_key='home_hero_title' AND content_value=?",
          [HOME_HERO_GOOD, HOME_HERO_BAD]
        );
        restoredHero = true;
        console.log("RESTORED home_hero_title");
      } else {
        console.log("SKIP home_hero_title (value changed)");
      }
    }
  }

  // Sessions first
  const sessionIds = actions.filter((a) => a.action === "DELETE_SESSION").map((a) => a.id);
  if (sessionIds.length) {
    const ph = sessionIds.map(() => "?").join(",");
    const [r] = await db.query(`DELETE FROM admin_sessions WHERE id IN (${ph})`, sessionIds);
    deletedSessions = r.affectedRows || 0;
  }

  // Staff
  const staffIds = actions.filter((a) => a.action === "DELETE_STAFF").map((a) => a.id);
  if (staffIds.length) {
    // also wipe any remaining sessions
    const ph = staffIds.map(() => "?").join(",");
    await db.query(`DELETE FROM admin_sessions WHERE staff_id IN (${ph})`, staffIds);
    const [r] = await db.query(`DELETE FROM admin_staff WHERE id IN (${ph})`, staffIds);
    deletedStaff = r.affectedRows || 0;
  }

  // Orders + items
  const orderIds = actions.filter((a) => a.action === "DELETE_ORDER").map((a) => a.id);
  for (const oid of orderIds) {
    await db.query("DELETE FROM order_items WHERE order_id=?", [oid]);
    const [r] = await db.query("DELETE FROM orders WHERE order_id=?", [oid]);
    deletedOrders += r.affectedRows || 0;
  }

  // Audit
  const auditIds = actions.filter((a) => a.action === "DELETE_AUDIT").map((a) => a.id);
  if (auditIds.length) {
    const ph = auditIds.map(() => "?").join(",");
    const [r] = await db.query(`DELETE FROM admin_audit_log WHERE id IN (${ph})`, auditIds);
    deletedAudit = r.affectedRows || 0;
  }

  console.log("\n========== APPLY RESULTS ==========");
  console.log({ restoredHero, deletedStaff, deletedSessions, deletedOrders, deletedAudit });

  await db.end();
  console.log("DONE");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
