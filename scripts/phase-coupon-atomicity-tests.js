/**
 * Atomic coupon redemption: SELECT ... FOR UPDATE inside order transaction.
 */
const fs = require("fs");
const path = require("path");
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

function loadOrderPricing() {
  const src = read("lib/orderPricing.ts");
  // Inline the fulfilment import dependency by stubbing require
  const fulfilmentSrc = read("lib/productFulfilment.ts");
  const tmp = path.join(ROOT, ".tmp-coupon-atomicity");
  fs.mkdirSync(tmp, { recursive: true });
  for (const [name, content] of [
    ["productFulfilment.ts", fulfilmentSrc],
    ["orderPricing.ts", src],
  ]) {
    const { outputText } = ts.transpileModule(content, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2019,
        esModuleInterop: true,
      },
    });
    fs.writeFileSync(
      path.join(tmp, name.replace(/\.ts$/, ".js")),
      outputText.replace(/require\("\.\/([^"]+)"\)/g, 'require("./$1.js")')
    );
  }
  delete require.cache[require.resolve(path.join(tmp, "orderPricing.js"))];
  delete require.cache[require.resolve(path.join(tmp, "productFulfilment.js"))];
  return require(path.join(tmp, "orderPricing.js"));
}

const orders = read("pages/api/orders.ts");
const pricing = loadOrderPricing();
const {
  evaluateLockedCoupon,
  calculateCouponDiscount,
  calculateGrandTotal,
} = pricing;

const beginIdx = orders.indexOf("beginTransaction");
const forUpdateIdx = orders.indexOf("FOR UPDATE");
const insertIdx = orders.indexOf("INSERT INTO orders");
const updateIdx = orders.indexOf("UPDATE coupons SET used_count");
const commitIdx = orders.lastIndexOf("conn.commit()");
const releaseIdx = orders.indexOf("conn.release()");
const sendMailIdx = orders.indexOf("sendMail");

ok(
  "A_coupon_select_uses_conn_query",
  /conn\.query\(\s*[\n\s]*['"]SELECT \* FROM coupons WHERE code=\? AND is_active=1 LIMIT 1 FOR UPDATE['"]/.test(
    orders
  )
);
ok("B_coupon_select_has_for_update", /FOR UPDATE/.test(orders));
ok(
  "C_lock_after_begin_transaction",
  beginIdx >= 0 && forUpdateIdx > beginIdx && forUpdateIdx < insertIdx
);
ok(
  "D_usage_limit_via_evaluateLockedCoupon",
  /evaluateLockedCoupon\(/.test(orders) &&
    forUpdateIdx < orders.indexOf("evaluateLockedCoupon({")
);
ok(
  "E_discount_from_locked_eval",
  /discountAmount = evaluated\.discountAmount/.test(orders) ||
    /evaluated\.discountAmount/.test(orders)
);
ok(
  "F_grand_total_after_discount",
  (() => {
    const call = orders.indexOf("grandTotal = calculateGrandTotal");
    return call > forUpdateIdx && call < insertIdx;
  })()
);
ok(
  "G_coupon_increment_uses_conn",
  /conn\.query\(\s*['"]UPDATE coupons SET used_count=used_count\+1 WHERE code=\?['"]/.test(
    orders
  )
);
ok(
  "H_increment_before_commit",
  updateIdx > insertIdx && updateIdx < commitIdx
);
ok(
  "I_no_pre_tx_pool_coupon_select",
  !/pool\.query\(\s*[\n\s]*['"]SELECT \* FROM coupons WHERE code=\? AND is_active=1['"]/.test(
    orders
  )
);
ok(
  "J_rollback_on_validation_failure",
  /OrderValidationError/.test(orders) &&
    /rollback/.test(orders) &&
    /error instanceof OrderValidationError|error\?\.name === ['"]OrderValidationError['"]/.test(
      orders
    )
);
ok("K_release_in_finally", /finally\s*\{[\s\S]*conn\.release\(\)/.test(orders));
ok(
  "L_emails_after_commit",
  commitIdx >= 0 && sendMailIdx > commitIdx
);
ok(
  "M_admin_email_escaping_remains",
  /escapeHtml/.test(orders) &&
    /escapeHtmlWithLineBreaks/.test(orders) &&
    /sanitizeEmailHeaderText/.test(orders) &&
    /safeAdminCustomerName/.test(orders)
);
ok(
  "N_authoritative_product_pricing",
  /calculateAuthoritativePricing/.test(orders) &&
    /Client total \/ discount_amount/.test(orders)
);

// Pure business cases via evaluateLockedCoupon
const base = {
  code: "SAVE10",
  type: "percentage",
  value: 10,
  minimum_order: 0,
  usage_limit: null,
  used_count: 0,
};

ok(
  "case_unlimited",
  evaluateLockedCoupon({
    coupon: { ...base, usage_limit: null, used_count: 99 },
    cartTotalForCoupon: 50,
  }).ok === true
);

ok(
  "case_last_available",
  evaluateLockedCoupon({
    coupon: { ...base, usage_limit: 10, used_count: 9 },
    cartTotalForCoupon: 50,
  }).ok === true
);

const exhausted = evaluateLockedCoupon({
  coupon: { ...base, usage_limit: 10, used_count: 10 },
  cartTotalForCoupon: 50,
});
ok(
  "case_exhausted",
  exhausted.ok === false && exhausted.error === "Coupon usage limit reached."
);

const expired = evaluateLockedCoupon({
  coupon: { ...base, expires_at: "2020-01-01T00:00:00.000Z" },
  cartTotalForCoupon: 50,
  now: new Date("2026-01-01"),
});
ok("case_expired", expired.ok === false && expired.error === "Coupon has expired.");

const minOrder = evaluateLockedCoupon({
  coupon: { ...base, minimum_order: 100 },
  cartTotalForCoupon: 40,
});
ok(
  "case_minimum_order",
  minOrder.ok === false && /Minimum order £100\.00 required/.test(minOrder.error)
);

const pct = evaluateLockedCoupon({
  coupon: { ...base, type: "percentage", value: 10 },
  cartTotalForCoupon: 50,
});
ok(
  "case_percentage",
  pct.ok === true &&
    pct.discountAmount === calculateCouponDiscount({ type: "percentage", value: 10, cartTotal: 50 })
);

const fixed = evaluateLockedCoupon({
  coupon: { ...base, type: "fixed", value: 5 },
  cartTotalForCoupon: 50,
});
ok(
  "case_fixed",
  fixed.ok === true &&
    fixed.discountAmount === calculateCouponDiscount({ type: "fixed", value: 5, cartTotal: 50 })
);

const invalidDisc = evaluateLockedCoupon({
  coupon: { ...base, type: "percentage", value: Number.NaN },
  cartTotalForCoupon: 50,
});
ok(
  "case_invalid_discount",
  // Existing formula returns 0 for non-finite value; evaluate still accepts 0 discount.
  // Preserve reject path in source for !Number.isFinite || discount < 0:
  /Unable to apply coupon/.test(read("lib/orderPricing.ts")) &&
    invalidDisc.ok === true &&
    invalidDisc.discountAmount === 0
);

// Mocked concurrency model (no real DB)
function simulateSerialRedemptions(usage_limit, startUsed, attempts) {
  let used = startUsed;
  const results = [];
  for (let i = 0; i < attempts; i++) {
    // FOR UPDATE serializes: each attempt sees latest used
    const ev = evaluateLockedCoupon({
      coupon: {
        ...base,
        usage_limit,
        used_count: used,
      },
      cartTotalForCoupon: 50,
    });
    if (!ev.ok) {
      results.push({ ok: false, error: ev.error, used });
      continue;
    }
    used += 1; // commit increments
    results.push({ ok: true, usedAfter: used });
  }
  return { used, results };
}

const race = simulateSerialRedemptions(10, 9, 2);
ok(
  "concurrency_A_accepts_last_slot",
  race.results[0].ok === true && race.results[0].usedAfter === 10
);
ok(
  "concurrency_B_rejects_after_A",
  race.results[1].ok === false &&
    race.results[1].error === "Coupon usage limit reached." &&
    race.used === 10
);

ok(
  "grand_total_uses_discount",
  calculateGrandTotal({
    subtotal: 20,
    shipping: 0,
    vatAmount: 4,
    discountAmount: 2,
  }) === 22
);

ok(
  "erp_untouched",
  !fs.readFileSync(path.join(ROOT, "app/erp/ERPLayout.tsx"), "utf8").includes(
    "evaluateLockedCoupon"
  )
);

console.log(`\nphase-coupon-atomicity: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
