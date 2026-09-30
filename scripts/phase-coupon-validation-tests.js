/**
 * Coupon admin / public preview input validation (pure + API source wiring).
 */
const fs = require("fs");
const path = require("path");

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

// Load compiled-ish TS via ts-node is not available; require through next transpile
// Use dynamic import of built JS is unavailable — instead eval via tsx or register.
// Prefer requiring after compiling with a tiny transpile of the pure module.
const ts = require("typescript");
const validationPath = path.join(ROOT, "lib/couponValidation.ts");
const pricingPath = path.join(ROOT, "lib/orderPricing.ts");
const fulfilmentPath = path.join(ROOT, "lib/productFulfilment.ts");

function transpileModule(filePath) {
  const src = fs.readFileSync(filePath, "utf8");
  const out = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filePath,
  }).outputText;
  return out;
}

function loadTsAsCjs(filePath, stubs = {}) {
  const Module = require("module");
  const code = transpileModule(filePath);
  const m = new Module(filePath);
  m.filename = filePath;
  m.paths = Module._nodeModulePaths(path.dirname(filePath));
  const originalRequire = m.require.bind(m);
  m.require = (id) => {
    if (stubs[id]) return stubs[id];
    if (id.startsWith("./") || id.startsWith("../")) {
      const resolved = path.resolve(path.dirname(filePath), id);
      const candidates = [`${resolved}.ts`, `${resolved}.js`, resolved];
      for (const c of candidates) {
        if (fs.existsSync(c) && c.endsWith(".ts")) {
          return loadTsAsCjs(c, stubs);
        }
        if (fs.existsSync(c) && c.endsWith(".js")) {
          return originalRequire(c);
        }
      }
    }
    return originalRequire(id);
  };
  m._compile(code, filePath);
  return m.exports;
}

const v = loadTsAsCjs(validationPath);

// ── CODE ──────────────────────────────────────────────────────────
ok("code_valid_uppercase", v.parseCouponCode(" save10 ").ok && v.parseCouponCode(" save10 ").value === "SAVE10");
ok("code_trim_normalize", v.parseCouponCode("  abc  ").value === "ABC");
ok("code_empty_rejected", !v.parseCouponCode("").ok && !v.parseCouponCode("   ").ok);
ok("code_over_50_rejected", !v.parseCouponCode("A".repeat(51)).ok);
ok("code_50_ok", v.parseCouponCode("A".repeat(50)).ok);

// ── TYPE ──────────────────────────────────────────────────────────
ok("type_percentage", v.parseCouponType("percentage").ok);
ok("type_fixed", v.parseCouponType("fixed").ok);
ok("type_unknown_rejected", !v.parseCouponType("percent").ok && !v.parseCouponType("").ok);

// ── VALUE ─────────────────────────────────────────────────────────
ok("value_pct_10", v.parseCouponValue(10, "percentage").ok && v.parseCouponValue(10, "percentage").value === 10);
ok("value_pct_100", v.parseCouponValue(100, "percentage").ok);
ok("value_pct_over_100", !v.parseCouponValue(100.01, "percentage").ok);
ok("value_pct_0", !v.parseCouponValue(0, "percentage").ok);
ok("value_negative", !v.parseCouponValue(-5, "fixed").ok);
ok("value_fixed_positive", v.parseCouponValue(5.5, "fixed").ok && v.parseCouponValue(5.5, "fixed").value === 5.5);
ok("value_fixed_0", !v.parseCouponValue(0, "fixed").ok);
ok("value_junk", !v.parseCouponValue("12abc", "fixed").ok);
ok("value_nan", !v.parseCouponValue(Number.NaN, "fixed").ok);
ok("value_infinity", !v.parseCouponValue(Infinity, "percentage").ok);

// ── MINIMUM ───────────────────────────────────────────────────────
ok("min_blank_0", v.parseMinimumOrder("").ok && v.parseMinimumOrder("").value === 0);
ok("min_null_0", v.parseMinimumOrder(null).ok && v.parseMinimumOrder(null).value === 0);
ok("min_zero", v.parseMinimumOrder(0).ok);
ok("min_decimal", v.parseMinimumOrder("19.99").ok && v.parseMinimumOrder("19.99").value === 19.99);
ok("min_negative", !v.parseMinimumOrder(-1).ok);
ok("min_junk", !v.parseMinimumOrder("abc").ok);

// ── USAGE ─────────────────────────────────────────────────────────
ok("usage_blank_null", v.parseUsageLimit("").ok && v.parseUsageLimit("").value === null);
ok("usage_null_null", v.parseUsageLimit(null).ok && v.parseUsageLimit(null).value === null);
ok("usage_1", v.parseUsageLimit(1).ok);
ok("usage_positive", v.parseUsageLimit("25").ok && v.parseUsageLimit("25").value === 25);
ok("usage_0_rejected", !v.parseUsageLimit(0).ok);
ok("usage_negative", !v.parseUsageLimit(-3).ok);
ok("usage_fractional", !v.parseUsageLimit(1.5).ok);
ok("usage_junk", !v.parseUsageLimit("10x").ok);

// ── EXPIRY ────────────────────────────────────────────────────────
ok("expiry_blank_null", v.parseExpiresAt("").ok && v.parseExpiresAt("").value === null);
ok("expiry_valid_ymd", v.parseExpiresAt("2026-12-31").ok && v.parseExpiresAt("2026-12-31").value === "2026-12-31");
ok("expiry_iso_normalized", v.parseExpiresAt("2026-12-31T00:00:00.000Z").ok && v.parseExpiresAt("2026-12-31T00:00:00.000Z").value === "2026-12-31");
ok("expiry_malformed", !v.parseExpiresAt("31/12/2026").ok && !v.parseExpiresAt("2026-13-01").ok);
ok("expiry_impossible", !v.parseExpiresAt("2026-02-30").ok);

// ── ID ────────────────────────────────────────────────────────────
ok("id_positive", v.parseCouponId(7).ok && v.parseCouponId("12").ok);
ok("id_zero", !v.parseCouponId(0).ok);
ok("id_negative", !v.parseCouponId(-1).ok);
ok("id_fraction", !v.parseCouponId(1.2).ok);
ok("id_junk", !v.parseCouponId("abc").ok);

// ── ACTIVE ────────────────────────────────────────────────────────
ok("active_true", v.parseIsActive(true).ok && v.parseIsActive(true).value === true);
ok("active_false", v.parseIsActive(false).ok && v.parseIsActive(false).value === false);
ok("active_1", v.parseIsActive(1).ok && v.parseIsActive(1).value === true);
ok("active_0", v.parseIsActive(0).ok && v.parseIsActive(0).value === false);
ok("active_string_false_not_true", !v.parseIsActive("false").ok || v.parseIsActive("false").value === false);
ok(
  "active_string_false_rejected_or_false",
  !v.parseIsActive("false").ok
);
ok("active_string_true_rejected", !v.parseIsActive("true").ok);

// ── PUBLIC PREVIEW cart_total ─────────────────────────────────────
ok("cart_malformed", !v.parseCartTotal("abc").ok);
ok("cart_negative", !v.parseCartTotal(-1).ok);
ok("cart_nan", !v.parseCartTotal(Number.NaN).ok);
ok("cart_infinity", !v.parseCartTotal(Infinity).ok);
ok("cart_valid", v.parseCartTotal(49.99).ok && v.parseCartTotal("10").ok);

// ── FULL ADMIN PAYLOAD ────────────────────────────────────────────
const good = v.parseCouponAdminInput({
  code: " welcome10 ",
  type: "percentage",
  value: "10",
  minimum_order: "",
  usage_limit: "",
  expires_at: "",
});
ok(
  "admin_payload_normalized",
  good.ok &&
    good.value.code === "WELCOME10" &&
    good.value.minimumOrder === 0 &&
    good.value.usageLimit === null &&
    good.value.expiresAt === null
);

const toggleLike = v.parseCouponAdminInput({
  id: 3,
  code: "SAVE5",
  type: "fixed",
  value: "5.00",
  minimum_order: "20.00",
  usage_limit: null,
  expires_at: "2027-01-15T00:00:00.000Z",
  is_active: 1,
});
ok(
  "toggle_row_shape_parses",
  toggleLike.ok &&
    toggleLike.value.expiresAt === "2027-01-15" &&
    toggleLike.value.value === 5 &&
    v.parseIsActive(false).ok
);

ok("admin_pct_101_rejected", !v.parseCouponAdminInput({
  code: "BAD",
  type: "percentage",
  value: 101,
  minimum_order: 0,
  usage_limit: null,
  expires_at: null,
}).ok);

// ── API SOURCE WIRING ─────────────────────────────────────────────
const api = read("pages/api/coupons.ts");
ok("api_imports_validator", /parseCouponAdminInput/.test(api));
ok("api_post_uses_validator", /parseCouponAdminInput\(req\.body\)/.test(api));
ok("api_put_uses_validator", /parseCouponId\(req\.body\?\.id\)/.test(api) && /parseIsActive/.test(api));
ok("api_delete_validates_id", /parseCouponId\(req\.query\.id\)/.test(api));
ok("api_validate_parses_cart_total", /parseCartTotal\(cart_total\)/.test(api));
ok("api_no_loose_minimum_or", !/minimum_order\s*\|\|\s*0/.test(api));
ok("api_no_loose_usage_or", !/usage_limit\s*\|\|\s*null/.test(api));
ok("api_no_truthy_is_active", !/is_active\s*\?\s*1\s*:\s*0/.test(api));
ok("api_duplicate_409", /Coupon code already exists/.test(api) && /1062|ER_DUP_ENTRY/.test(api));
ok("api_put_404", /Coupon not found/.test(api));
ok("api_still_uses_calculateCouponDiscount", /calculateCouponDiscount/.test(api));
ok("api_no_for_update_in_preview", !/FOR UPDATE/.test(api));

const orders = read("pages/api/orders.ts");
ok("orders_for_update_intact", /FOR UPDATE/.test(orders) && /evaluateLockedCoupon/.test(orders));
ok("orders_used_count_increment_intact", /used_count\s*=\s*used_count\s*\+\s*1/.test(orders));

const sidhu = read("app/sidhu/page.tsx");
ok("sidhu_imports_validator", /parseCouponAdminInput/.test(sidhu));
ok("sidhu_value_min_step", /min=["']0\.01["']/.test(sidhu) && /step=["']0\.01["']/.test(sidhu));
ok("sidhu_usage_min_1", /Usage Limit[\s\S]*min=["']1["']/.test(sidhu));
ok("sidhu_min_order_min_0", /Min Order[\s\S]*min=["']0["']/.test(sidhu));

const migrate = read("scripts/migrate-core-runtime-schema.js");
ok("no_schema_change_required", /CREATE TABLE IF NOT EXISTS coupons/.test(migrate));

console.log(`\nCoupon validation: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
