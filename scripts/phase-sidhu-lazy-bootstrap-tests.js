/**
 * Sidhu tab-lazy bootstrap — source architecture guards.
 * Run: node scripts/phase-sidhu-lazy-bootstrap-tests.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
let passed = 0;
let failed = 0;

function ok(name, cond, detail = "") {
  if (cond) {
    passed += 1;
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed += 1;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const sidhu = read("app/sidhu/page.tsx");
const db = read("lib/db.ts");
const ordersApi = read("pages/api/admin-orders.ts");
const perms = read("lib/adminPermissions.ts");
const seoPanel = read("components/admin/SeoOverviewPanel.tsx");

console.log("\nSidhu lazy bootstrap\n");

// Extract the primary tab-scoped data-load effect region (after session).
const tabEffectIdx = sidhu.indexOf("Tab-scoped data loads");
const tabRegion =
  tabEffectIdx >= 0
    ? sidhu.slice(tabEffectIdx, tabEffectIdx + 6500)
    : sidhu;

ok(
  "A_no_broad_loggedIn_only_bootstrap",
  /Tab-scoped data loads/.test(sidhu) &&
    !/\}, \[loggedIn, adminRole\]\);\s*\n\s*\/\/ Load orders\/customers/.test(sidhu) &&
    /\[loggedIn, tab, adminRole\]/.test(tabRegion)
);

ok(
  "B_products_tab_scoped",
  /tab === ["']products["']/.test(tabRegion) &&
    /loadProducts\(\)/.test(tabRegion) &&
    !/if \(can\(["']products\.view["']\)\) \{\s*loadProducts\(\);/.test(
      sidhu.slice(0, sidhu.indexOf("Tab-scoped data loads") > 0 ? sidhu.indexOf("Tab-scoped data loads") : 0)
    )
);

ok(
  "C_blog_tab_loads",
  /tab === ["']blog["'] && can\(["']blog\.manage["']\)/.test(tabRegion) &&
    /\/api\/blog/.test(tabRegion)
);

ok(
  "D_writer_dashboard_blog",
  /Writer Dashboard/.test(tabRegion) &&
    /tab === ["']dashboard["']/.test(tabRegion) &&
    /!can\(["']orders\.view["']\)|else \{[\s\S]*can\(["']blog\.manage["']\)/.test(tabRegion) &&
    /\/api\/blog/.test(tabRegion)
);

ok(
  "E_coupons_lazy",
  /tab === ["']coupons["']/.test(tabRegion) && /\/api\/coupons/.test(tabRegion)
);

ok(
  "F_builder_lazy",
  /tab === ["']builder["']/.test(tabRegion) &&
    /\/api\/sections\?page=home&all=1/.test(tabRegion)
);

ok(
  "G_faqs_lazy",
  /tab === ["']faqadmin["']/.test(tabRegion) &&
    /\/api\/faqs\?admin=true/.test(tabRegion)
);

ok(
  "H_full_leads_lazy",
  /tab === ["']leads["']/.test(tabRegion) &&
    /\/api\/admin\/leads/.test(tabRegion)
);

ok(
  "I_training_retired",
  !/tab === ["']training["']/.test(tabRegion) &&
    !/\/api\/admin\/berlin-training/.test(sidhu) &&
    !/Berlin Training/.test(sidhu) &&
    !/training\.manage/.test(sidhu)
);

ok(
  "J_staff_lazy",
  /tab === ["']staff["']/.test(tabRegion) && /\/api\/admin-staff/.test(tabRegion)
);

ok(
  "K_audit_remains_lazy",
  /tab !== ["']audit["']/.test(sidhu) && /\/api\/admin-audit/.test(sidhu)
);

ok(
  "L_content_settings_page_all_tab_scoped",
  /tab !== ["']settings["'] && tab !== ["']pages["']/.test(sidhu) &&
    /\/api\/site-content\?page=all/.test(sidhu) &&
    !/Tab-scoped data loads[\s\S]{0,4500}\/api\/site-content\?page=all/.test(sidhu)
);

ok(
  "M_dashboard_order_summary",
  /tab === ["']dashboard["']/.test(tabRegion) &&
    /\/api\/admin-orders\?summary=1/.test(tabRegion)
);

ok(
  "N_dashboard_recent_orders",
  // 16a0887: the fetch moved into refreshRecentOrders() (page.tsx:585-598); the dashboard branch of the
  // tab-scoped effect still triggers it (page.tsx:955), so recent orders stay dashboard-lazy.
  /const refreshRecentOrders = async/.test(sidhu) &&
    /\/api\/admin-orders\?page=1&limit=10/.test(sidhu) &&
    /tab === ["']dashboard["'][\s\S]{0,900}void refreshRecentOrders\(\)/.test(tabRegion)
);

ok(
  "O_seo_overview_owns_api",
  /\/api\/admin-seo-overview/.test(seoPanel) &&
    !/\/api\/admin-seo-overview/.test(tabRegion)
);

// The tab-scoped bootstrap effect itself must never poll. Bound it by the next top-level effect instead of a
// fixed 6500/8000-char window (97ac729 added a 1s runtime-cooldown timer, 16a0887 a 60s auto-refresh; both
// live in their own effects).
const tabEffectStart = sidhu.indexOf("useEffect(", tabEffectIdx);
const tabEffectEnd = sidhu.indexOf("\n  useEffect(", tabEffectStart + 10);
const tabEffectOnly =
  tabEffectStart >= 0 && tabEffectEnd > tabEffectStart
    ? sidhu.slice(tabEffectStart, tabEffectEnd)
    : "";
ok(
  "P_no_polling",
  tabEffectOnly.length > 0 && !/setInterval\s*\(/.test(tabEffectOnly)
);
ok(
  "P2_auto_refresh_is_guarded_60s",
  // 16a0887 (instant updates): single 60s tick, visible-tab only, skipped while modals are open, no overlap, orders.view only.
  /window\.setInterval\(\(\) => \{ void tick\(\); \}, 60000\)/.test(sidhu) &&
    /document\.hidden/.test(sidhu) &&
    /autoRefreshBlockedRef\.current/.test(sidhu) &&
    /autoRefreshLockRef\.current/.test(sidhu) &&
    /autoRefreshTickRef\.current = async \(\) => \{\s*if \(!can\("orders\.view"\)\) return;/.test(sidhu)
);

ok(
  "Q_db_pool_unchanged",
  /connectionLimit:\s*3/.test(db) &&
    /queueLimit:\s*5/.test(db) &&
    /waitForConnections:\s*true/.test(db)
);

ok(
  "R_rbac_unchanged",
  /canAccessSeoOverview/.test(perms) &&
    /canAccessSidhuTab/.test(perms) &&
    !/"seo\.manage"/.test(perms)
);

ok(
  "S_leads_badge_via_summary_count",
  /leads_last_24/.test(ordersApi) &&
    /leads_last_24/.test(sidhu) &&
    /INTERVAL 24 HOUR/.test(ordersApi) &&
    /COUNT\(\*\)/.test(ordersApi) &&
    /tab === ["']leads["'][\s\S]{0,400}\/api\/admin\/leads/.test(tabRegion) &&
    !/Tab-scoped data loads[\s\S]{0,800}\/api\/admin\/leads/.test(
      // full leads must not appear before leads tab gate in region start
      tabRegion.slice(0, 800)
    )
);

ok(
  "T_no_erp_changes",
  !/erp/i.test(tabRegion) &&
    !fs.existsSync(path.join(ROOT, "app/erp")) // soft: no new erp path required
);

// Extra: login-time site-content duplicate removed from bootstrap
ok(
  "no_login_site_content_all_in_bootstrap",
  !/}, \[loggedIn, adminRole\]\);/.test(
    sidhu.match(/useEffect\(\(\) => \{\s*if \(!loggedIn\) return;[\s\S]*?site-content\?page=all[\s\S]*?\}, \[loggedIn, adminRole\]\)/)?.[0] || ""
  )
);

ok(
  "summary_gated_by_leads_view",
  /hasAdminPermission\(admin\.role[\s\S]*leads\.view/.test(ordersApi) ||
    /leads\.view[\s\S]{0,200}leads_last_24|leads_last_24[\s\S]{0,400}leads\.view/.test(ordersApi)
);

ok(
  "summary_no_lead_pii",
  /leads_last_24/.test(ordersApi) &&
    !/SELECT \* FROM chat_leads/.test(ordersApi) &&
    !/customer_name|whatsapp|phone/.test(
      ordersApi.slice(ordersApi.indexOf("leads_last_24") - 200, ordersApi.indexOf("leads_last_24") + 400)
    )
);

console.log(`\nSidhu lazy bootstrap: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
