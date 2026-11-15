/**
 * F4UK-MULTI-103 — clear revenue cards, order summary deltas, in-app dialogs.
 * Static + loadTs only. No .env*, no real DB, no network.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..");

let passed = 0;
let failed = 0;

function ok(name, cond, detail = "") {
  if (cond) {
    passed++;
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed++;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

const cache = new Map();
function loadTs(rel, stubs = {}) {
  const abs = path.join(ROOT, rel);
  const hasStubs = Object.keys(stubs).length > 0;
  const key = abs + "::" + Object.keys(stubs).sort().join(",");
  if (!hasStubs && cache.has(key)) return cache.get(key);
  const src = fs.readFileSync(abs, "utf8");
  const out = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React,
    },
    fileName: abs,
  }).outputText;
  const m = new Module(abs, module);
  m.filename = abs;
  m.paths = Module._nodeModulePaths(path.dirname(abs));
  const orig = m.require.bind(m);
  m.require = (id) => {
    if (Object.prototype.hasOwnProperty.call(stubs, id)) return stubs[id];
    if (id.startsWith("@/")) {
      const mapped = id.replace("@/", "");
      for (const c of [
        path.join(ROOT, mapped + ".ts"),
        path.join(ROOT, mapped + ".tsx"),
        path.join(ROOT, mapped + ".js"),
      ]) {
        if (fs.existsSync(c)) {
          return loadTs(path.relative(ROOT, c).replace(/\\/g, "/"), stubs);
        }
      }
    }
    if (id.startsWith("./") || id.startsWith("../")) {
      const resolved = path.normalize(path.join(path.dirname(abs), id));
      for (const c of [resolved + ".ts", resolved + ".tsx", resolved + ".js"]) {
        if (fs.existsSync(c)) {
          return loadTs(path.relative(ROOT, c).replace(/\\/g, "/"), stubs);
        }
      }
    }
    return orig(id);
  };
  m._compile(out, abs);
  if (!hasStubs) cache.set(key, m.exports);
  return m.exports;
}

(async () => {
  ok("delta_lib_exists", exists("lib/orderSummaryDelta.ts"));
  ok("dialogs_exists", exists("components/admin/AdminDialogs.tsx"));

  const delta = loadTs("lib/orderSummaryDelta.ts");
  ok("sql_confirmed", /confirmed','dispatched','delivered/.test(delta.SUMMARY_SQL_CASE.confirmed_revenue));
  ok("sql_delivered", /status = 'delivered'/.test(delta.SUMMARY_SQL_CASE.delivered_revenue));
  ok("sql_pending", /status = 'pending'/.test(delta.SUMMARY_SQL_CASE.pending_value));
  ok("sql_cancelled", /status = 'cancelled'/.test(delta.SUMMARY_SQL_CASE.cancelled_value));

  const ordersApi = read("pages/api/admin-orders.ts");
  ok(
    "api_has_delivered_revenue",
    /AS delivered_revenue/.test(ordersApi) && /delivered_revenue: Number/.test(ordersApi)
  );
  ok(
    "api_has_pending_value",
    /AS pending_value/.test(ordersApi) && /pending_value: Number/.test(ordersApi)
  );
  ok(
    "api_has_cancelled_value",
    /AS cancelled_value/.test(ordersApi) && /cancelled_value: Number/.test(ordersApi)
  );
  ok(
    "api_keeps_confirmed_revenue",
    /status IN \('confirmed','dispatched','delivered'\)/.test(ordersApi) &&
      /confirmed_revenue: Number/.test(ordersApi)
  );

  // Money parsing
  ok("money_plain", delta.parseMoney("12.50") === 12.5);
  ok("money_pound", delta.parseMoney("£1,234.56") === 1234.56);
  ok("money_spaces", delta.parseMoney(" £ 9.00 ") === 9);
  ok("money_bad", delta.parseMoney("abc") === 0);
  ok("money_null", delta.parseMoney(null) === 0);

  const base = {
    total_orders: 10,
    pending_orders: 2,
    delivered_orders: 3,
    cancelled_orders: 1,
    confirmed_revenue: 100,
    delivered_revenue: 40,
    pending_value: 20,
    cancelled_value: 15,
    customer_count: 5,
  };

  const statuses = ["pending", "confirmed", "dispatched", "delivered", "cancelled"];
  let matrixOk = true;
  const matrixFails = [];
  for (const from of statuses) {
    for (const to of statuses) {
      const start = { ...base };
      const out = delta.applyOrderSummaryDelta(start, {
        statusChange: { from, to, total: "10.00" },
      });
      if (from === to) {
        if (JSON.stringify(out) !== JSON.stringify(start)) {
          matrixOk = false;
          matrixFails.push(`${from}->${to} changed`);
        }
        continue;
      }
      const expect = { ...start };
      if (from === "pending") expect.pending_orders -= 1;
      if (to === "pending") expect.pending_orders += 1;
      if (from === "delivered") expect.delivered_orders -= 1;
      if (to === "delivered") expect.delivered_orders += 1;
      if (from === "cancelled") expect.cancelled_orders -= 1;
      if (to === "cancelled") expect.cancelled_orders += 1;

      const rev = ["confirmed", "dispatched", "delivered"];
      const wasRev = rev.includes(from);
      const isRev = rev.includes(to);
      if (wasRev && !isRev) expect.confirmed_revenue -= 10;
      if (!wasRev && isRev) expect.confirmed_revenue += 10;
      if (from === "delivered") expect.delivered_revenue -= 10;
      if (to === "delivered") expect.delivered_revenue += 10;
      if (from === "pending") expect.pending_value -= 10;
      if (to === "pending") expect.pending_value += 10;
      if (from === "cancelled") expect.cancelled_value -= 10;
      if (to === "cancelled") expect.cancelled_value += 10;

      for (const k of Object.keys(expect)) {
        if (Number(out[k]) !== Number(expect[k])) {
          matrixOk = false;
          matrixFails.push(`${from}->${to} ${k}: got ${out[k]} want ${expect[k]}`);
        }
      }
    }
  }
  ok("delta_status_matrix", matrixOk, matrixFails.slice(0, 3).join("; "));

  // Delete matrix for each status
  let deleteOk = true;
  const deleteFails = [];
  for (const status of statuses) {
    const start = { ...base };
    const out = delta.applyOrderSummaryDelta(start, {
      removed: { status, total: "10.00" },
      customerRemoved: false,
    });
    const expect = { ...start, total_orders: start.total_orders - 1 };
    if (status === "pending") {
      expect.pending_orders -= 1;
      expect.pending_value -= 10;
    }
    if (status === "delivered") {
      expect.delivered_orders -= 1;
      expect.delivered_revenue -= 10;
    }
    if (status === "cancelled") {
      expect.cancelled_orders -= 1;
      expect.cancelled_value -= 10;
    }
    if (["confirmed", "dispatched", "delivered"].includes(status)) {
      expect.confirmed_revenue -= 10;
    }
    for (const k of Object.keys(expect)) {
      if (Number(out[k]) !== Number(expect[k])) {
        deleteOk = false;
        deleteFails.push(`del ${status} ${k}: got ${out[k]} want ${expect[k]}`);
      }
    }
  }
  ok("delta_delete_matrix", deleteOk, deleteFails.slice(0, 3).join("; "));

  const delCust = delta.applyOrderSummaryDelta(
    { ...base },
    { removed: { status: "confirmed", total: "10" }, customerRemoved: true }
  );
  ok("delta_delete_customer", Number(delCust.customer_count) === 4);

  const sidhu = read("app/sidhu/page.tsx");
  ok("sidhu_confirmed_revenue_label", /Confirmed revenue/.test(sidhu));
  ok("sidhu_delivered_revenue_label", /Delivered revenue/.test(sidhu));
  ok("sidhu_pending_value_label", /Pending value/.test(sidhu));
  ok("sidhu_cancelled_value_label", /Cancelled value/.test(sidhu));
  ok("sidhu_no_total_revenue_label", !/Total Revenue/.test(sidhu));
  ok("sidhu_tooltip_confirmed", /Confirmed \+ Dispatched \+ Delivered orders/.test(sidhu));
  ok("sidhu_tooltip_delivered", /Delivered orders only/.test(sidhu));
  ok("sidhu_uses_delta_lib", /applyOrderSummaryDeltaPure/.test(sidhu));
  ok("sidhu_admin_dialogs_provider", /AdminDialogProvider/.test(sidhu));

  // No browser dialogs in admin surfaces
  function walk(dir, acc = []) {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.join(dir, e.name).replace(/\\/g, "/");
      if (e.isDirectory()) walk(rel, acc);
      else if (/\.(tsx?|jsx?)$/.test(e.name)) acc.push(rel);
    }
    return acc;
  }
  const adminFiles = [...walk("app/sidhu"), ...walk("components/admin")];
  let dialogHits = 0;
  for (const rel of adminFiles) {
    const t = read(rel);
    if (/window\.(alert|confirm|prompt)\s*\(/.test(t)) dialogHits++;
  }
  ok("admin_zero_window_dialogs", dialogHits === 0, `hits=${dialogHits}`);

  // Destructive actions still go through askConfirm / confirm modal
  ok("sidhu_delete_order_confirm", /askConfirm\(msg\)/.test(sidhu) || /await askConfirm\(msg\)/.test(sidhu));
  ok("sidhu_delete_blog_confirm", /Delete this blog post\?/.test(sidhu));
  ok("sidhu_delete_product_confirm", /Delete this product\?/.test(sidhu));
  ok("dialogs_confirm_modal", /alertdialog/.test(read("components/admin/AdminDialogs.tsx")));
  ok("dialogs_esc_cancel", /Escape/.test(read("components/admin/AdminDialogs.tsx")));
  ok("dialogs_focus_trap", /focusable|Tab/.test(read("components/admin/AdminDialogs.tsx")));
  ok("ease_confirm_no_window", !/window\.confirm/.test(read("components/admin/CmsEaseToolbar.tsx")));
  ok("redirect_uses_askConfirm", /askConfirm/.test(read("components/admin/RedirectManagerPanel.tsx")));
  ok(
    "seasonality_no_window_confirm",
    !/window\.confirm/.test(read("components/admin/ProductSeasonalityPanel.tsx"))
  );

  // FIX-NOW regression: adminAlert used instead of alert
  ok("sidhu_no_bare_alert", !/\balert\s*\(/.test(sidhu.replace(/adminAlert\s*\(/g, "")));
  ok("sidhu_uses_adminAlert", /adminAlert\(/.test(sidhu));

  // FIX-NOW: admin API no-store + logout same-origin
  ok("fix_logout_same_origin", /assertSameOriginMutation/.test(read("pages/api/admin-logout.ts")));
  ok("fix_logout_nostore", /setAdminNoStore/.test(read("pages/api/admin-logout.ts")));
  ok("fix_blog_research_nostore", /setAdminNoStore/.test(read("pages/api/admin-blog-research.ts")));
  ok("fix_url_migration_nostore", /setAdminNoStore/.test(read("pages/api/admin-product-url-migration.ts")));
  ok("fix_seo_ai_nostore", /setAdminNoStore/.test(read("pages/api/admin-seo-ai.ts")));
  ok("fix_staff_password_nostore", /setAdminNoStore/.test(read("pages/api/admin-staff-password.ts")));

  console.log(`\nphase-multi-103-tests: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
