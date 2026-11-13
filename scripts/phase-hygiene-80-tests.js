/**
 * F4UK-HYGIENE-80 — email escape regression, digital-ack admin label,
 * product save concurrency contracts, null-safe legacy order display.
 * Mocked helpers only — no DB / SMTP / network.
 */
const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");
const { execSync } = require("child_process");

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

const cache = new Map();
function loadTs(rel, stubs = {}) {
  const abs = path.join(ROOT, rel);
  const key = abs + "::" + Object.keys(stubs).sort().join(",");
  if (cache.has(key)) return cache.get(key);
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
    if (stubs[id]) return stubs[id];
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
  cache.set(key, m.exports);
  return m.exports;
}

(async () => {
  const orders = read("pages/api/orders.ts");
  const sidhu = read("app/sidhu/page.tsx");
  const tracking = read("app/order-tracking/page.tsx");
  const adminProducts = read("pages/api/admin-products.ts");
  const contactApi = read("pages/api/contact.ts");
  const exportApi = read("pages/api/admin-orders-export.ts");
  const csvLib = read("lib/adminOrdersQuery.ts");

  const { escapeHtml, escapeHtmlWithLineBreaks } = loadTs("lib/contentHtml.ts");

  // ── B1: escapeHtml on hostile payload used in both email paths ───────────
  const hostile = `<b>x</b>&"'`;
  const escaped = escapeHtml(hostile);
  ok(
    "B1_hostile_escaped",
    escaped.includes("&lt;b&gt;x&lt;/b&gt;") &&
      escaped.includes("&amp;") &&
      escaped.includes("&quot;") &&
      !escaped.includes("<b>") &&
      !escaped.includes("</b>")
  );
  ok(
    "B1_notes_escape_before_br",
    escapeHtmlWithLineBreaks(hostile + "\nline2").includes("&lt;b&gt;") &&
      escapeHtmlWithLineBreaks(hostile + "\nline2").includes("<br />")
  );
  ok(
    "B1_orders_admin_and_customer_use_escapeHtml",
    /safeAdminCustomerName\s*=\s*escapeHtml/.test(orders) &&
      /const safeName = escapeHtml\(String\(customer_name/.test(orders) &&
      /escapeHtmlWithLineBreaks\(\s*formatAdminEmailNotesDisplay/.test(orders)
  );
  ok(
    "B1_contact_api_no_html_email",
    !/nodemailer|sendMail|createTransport/.test(contactApi)
  );

  // ── B2: admin email readable label; DB marker untouched ──────────────────
  ok(
    "B2_formatAdminEmailNotesDisplay_present",
    /function formatAdminEmailNotesDisplay/.test(orders) &&
      /Digital supply acknowledgement: accepted/.test(orders)
  );
  ok(
    "B2_marker_still_written_via_builder",
    /buildDigitalSupplyAckNotes/.test(orders) &&
      /DIGITAL_SUPPLY_ACK_V1/.test(read("lib/productFulfilment.ts"))
  );

  // ── B4: product optimistic concurrency regression ────────────────────────
  ok(
    "B4_put_guards_product_version",
    /WHERE id=\? AND product_version=\? AND slug=\?/.test(adminProducts)
  );
  ok(
    "B4_stale_returns_409",
    /status\(409\)/.test(adminProducts) &&
      /stale_version|concurrent_conflict|expected_version/.test(adminProducts)
  );
  ok(
    "B4_sidhu_sends_expected_version",
    /expected_version/.test(sidhu) && /r\.status === 409/.test(sidhu)
  );
  ok(
    "B4_sidhu_conflict_ui",
    /product-content-conflict/.test(sidhu) &&
      /Server state changed \(409\)/.test(sidhu)
  );

  const writer = loadTs("lib/productWriterTx.ts");
  if (typeof writer.gateExpectedVersionAllowMaxNoop === "function") {
    const stale = writer.gateExpectedVersionAllowMaxNoop(
      { product_version: 3 },
      2,
      false
    );
    ok(
      "B4_gate_stale_409",
      stale && stale.ok === false && Number(stale.status) === 409
    );
  } else {
    ok("B4_gate_stale_409", false, "gateExpectedVersionAllowMaxNoop missing");
  }

  // ── B5: null-safe legacy order display ───────────────────────────────────
  ok(
    "B5_mapOrderRow_dash_for_empty_identity",
    /customer:\s*o\.customer_name\s*\|\|\s*"—"/.test(sidhu) &&
      /email:\s*o\.customer_email\s*\|\|\s*"—"/.test(sidhu) &&
      /phone:\s*o\.customer_phone\s*\|\|\s*"—"/.test(sidhu)
  );
  ok(
    "B5_order_modal_dash",
    /orderModal\.customer\s*\|\|\s*"—"/.test(sidhu) &&
      /orderModal\.email\s*\|\|\s*"—"/.test(sidhu) &&
      /orderModal\.phone\s*\|\|\s*"—"/.test(sidhu)
  );
  ok(
    "B5_tracking_dash_on_null_identity",
    /name:\s*o\.customer_name\s*\|\|\s*"—"/.test(tracking) &&
      /email:\s*o\.customer_email\s*\|\|\s*"—"/.test(tracking) &&
      /phone:\s*o\.customer_phone\s*\|\|\s*"—"/.test(tracking)
  );
  ok(
    "B5_csv_null_to_empty_string",
    /value == null \? "" : String\(value\)/.test(csvLib) &&
      /csvEscapeCell/.test(exportApi)
  );

  // TEST-HYG-1: scope allowlist to this commit / working tree range
  const HYG80_ALLOW = new Set([
    "app/sidhu/page.tsx",
    "app/order-tracking/page.tsx",
    "scripts/phase-hygiene-80-tests.js",
  ]);
  let dirtyNames = [];
  try {
    dirtyNames = execSync("git diff --name-only origin/main...HEAD", {
      cwd: ROOT,
      encoding: "utf8",
    })
      .split(/\r?\n/)
      .map((s) => s.trim().replace(/\\/g, "/"))
      .filter(Boolean);
    const wt = execSync("git diff --name-only HEAD", {
      cwd: ROOT,
      encoding: "utf8",
    })
      .split(/\r?\n/)
      .map((s) => s.trim().replace(/\\/g, "/"))
      .filter(Boolean);
    const untracked = execSync("git ls-files --others --exclude-standard", {
      cwd: ROOT,
      encoding: "utf8",
    })
      .split(/\r?\n/)
      .map((s) => s.trim().replace(/\\/g, "/"))
      .filter(Boolean);
    dirtyNames = [...new Set([...dirtyNames, ...wt, ...untracked])];
  } catch (e) {
    ok("diff_allowlist_hyg80", false, String(e.message || e));
  }
  const unexpected = dirtyNames.filter((f) => !HYG80_ALLOW.has(f));
  ok(
    "diff_allowlist_hyg80",
    unexpected.length === 0,
    unexpected.join(",") || `files=${dirtyNames.length}`
  );

  console.log(`\nHYGIENE-80: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
