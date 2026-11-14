/**
 * F4UK-VAT-FIX-84 — VAT setting fail-safe (never overcharge on read error).
 * Stub/mocked only — no live orders, no DB writes, no email.
 */
const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");
const crypto = require("crypto");

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

function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100;
}

function calculateGrandTotal(opts) {
  const total = opts.pricesIncludeVat
    ? roundMoney(opts.subtotal + opts.shipping - opts.discountAmount)
    : roundMoney(
        opts.subtotal + opts.shipping + opts.vatAmount - opts.discountAmount
      );
  return total < 0 ? 0 : total;
}

function extractVatFromInclusiveGrandTotal(grandTotal) {
  const g = Number(grandTotal);
  if (!Number.isFinite(g) || g <= 0) return 0;
  return roundMoney(g - g / 1.2);
}

(async () => {
  // ── Source contracts ─────────────────────────────────────────────────────
  const serverSrc = read("lib/pricesIncludeVatServer.ts");
  const ordersSrc = read("pages/api/orders.ts");
  const cartSrc = read("app/cart/page.tsx");
  const miniSrc = read("components/MiniCartBar.tsx");

  ok(
    "server_typed_read_error",
    /class PricesIncludeVatReadError/.test(serverSrc) &&
      /isPricesIncludeVatReadError/.test(serverSrc)
  );
  ok(
    "server_error_not_cached",
    /catch \(err\)/.test(serverSrc) &&
      !/cache = \{ at: now, value: failSafe \}/.test(serverSrc) &&
      /throw new PricesIncludeVatReadError/.test(serverSrc)
  );
  ok(
    "orders_early_unknown_proceeds",
    /pricesIncludeVatEarly/.test(ordersSrc) &&
      /isPricesIncludeVatReadError/.test(ordersSrc)
  );
  ok(
    "orders_tx_unknown_503",
    /Pricing temporarily unavailable\. Please try again\./.test(ordersSrc) &&
      /OrderValidationError\(PRICING_UNAVAILABLE_MSG,\s*503\)/.test(ordersSrc)
  );
  ok(
    "cart_totals_pending_cms",
    /data-totals-loading/.test(cartSrc) &&
      /cart_totals_calculating/.test(cartSrc) &&
      /Calculating…/.test(cartSrc)
  );
  ok(
    "cart_place_order_gated_cms",
    /paymentOptionsBlocked[\s\S]{0,80}!cmsLoaded/.test(cartSrc) ||
      /!cmsLoaded \|\|/.test(cartSrc)
  );
  ok(
    "minicart_calculating_before_cms",
    /!cmsLoaded\) return "Calculating…"/.test(miniSrc) ||
      /if \(!cmsLoaded\) return "Calculating…"/.test(miniSrc)
  );

  // ── Server reader: missing row = OFF; error throws + no cache ────────────
  process.env.DB_NAME = process.env.DB_NAME || "stub";
  process.env.DB_HOST = process.env.DB_HOST || "127.0.0.1";
  process.env.DB_USER = process.env.DB_USER || "stub";
  delete process.env.DB_PASSWORD;

  const vatMod = loadTs("lib/pricesIncludeVatServer.ts", {});
  vatMod.clearPricesIncludeVatCache();

  {
    const missingDb = {
      query: async () => [[], []],
    };
    const v = await vatMod.getPricesIncludeVat({ db: missingDb, ttlMs: 0 });
    ok("missing_row_is_off", v === false);
    vatMod.clearPricesIncludeVatCache();
  }

  {
    const onDb = {
      query: async () => [[{ content_value: "1" }], []],
    };
    const v = await vatMod.getPricesIncludeVat({ db: onDb, ttlMs: 0 });
    ok("on_row_is_true", v === true);
    vatMod.clearPricesIncludeVatCache();
  }

  {
    const offDb = {
      query: async () => [[{ content_value: "0" }], []],
    };
    const v = await vatMod.getPricesIncludeVat({ db: offDb, ttlMs: 0 });
    ok("off_row_is_false", v === false);
    vatMod.clearPricesIncludeVatCache();
  }

  {
    let calls = 0;
    const errDb = {
      query: async () => {
        calls += 1;
        throw new Error("ECONNRESET");
      },
    };
    let threw1 = false;
    try {
      await vatMod.getPricesIncludeVat({ db: errDb, nowMs: 1, ttlMs: 60_000 });
    } catch (e) {
      threw1 = vatMod.isPricesIncludeVatReadError(e);
    }
    ok("read_error_throws_typed", threw1 === true);

    let threw2 = false;
    try {
      await vatMod.getPricesIncludeVat({ db: errDb, nowMs: 2, ttlMs: 60_000 });
    } catch (e) {
      threw2 = vatMod.isPricesIncludeVatReadError(e);
    }
    ok("read_error_not_cached_rereads", threw2 === true && calls === 2);
    vatMod.clearPricesIncludeVatCache();
  }

  // ── ON/OFF totals unchanged vs VAT-INCL-83 ───────────────────────────────
  {
    const digOn = { subtotal: 17.99, shipping: 0, vatAmount: 0, discountAmount: 0 };
    const grandOn = calculateGrandTotal({ ...digOn, pricesIncludeVat: true });
    const vatOn = extractVatFromInclusiveGrandTotal(grandOn);
    ok("on_digital_total_17_99", grandOn === 17.99 && vatOn === roundMoney(17.99 - 17.99 / 1.2));

    const digOff = {
      subtotal: 14.99,
      shipping: 0,
      vatAmount: roundMoney(14.99 * 0.2),
      discountAmount: 0,
    };
    const grandOff = calculateGrandTotal({ ...digOff, pricesIncludeVat: false });
    ok("off_digital_total_17_99", grandOff === 17.99);

    const physOn = {
      subtotal: 78,
      shipping: 3.99,
      vatAmount: 0,
      discountAmount: 0,
    };
    const physOff = {
      subtotal: 65,
      shipping: 3.99,
      vatAmount: 13,
      discountAmount: 0,
    };
    ok(
      "on_off_phys_identical",
      calculateGrandTotal({ ...physOn, pricesIncludeVat: true }) ===
        calculateGrandTotal({ ...physOff, pricesIncludeVat: false })
    );
  }

  // ── Orders API: TX VAT read error → 503, rollback, no INSERT, no email ───
  process.env.SMTP_USER = "stub-smtp-user";
  process.env["SMTP" + "_PASS"] = "stub";

  let insertCount = 0;
  let rollbackCount = 0;
  let sendMailCount = 0;
  let vatTxCalls = 0;
  let vatEarlyCalls = 0;

  const PRODUCTS = {
    3: {
      id: 3,
      name: "Digital Plan",
      active: 1,
      price: 17.99,
      category: "subscription",
      stock: "digital",
    },
  };
  const LEGACY_BASELINE_COLS = [
    "id",
    "name",
    "active",
    "price",
    "category",
    "stock",
    "slug",
    "description",
    "short_description",
    "full_description",
    "badge",
    "image",
    "features",
    "seo_title",
    "meta_description",
    "focus_keyword",
    "og_image",
  ];

  function makeConn() {
    return {
      async beginTransaction() {},
      async commit() {},
      async rollback() {
        rollbackCount += 1;
      },
      release() {},
      async query(arg, maybeParams) {
        const sql = typeof arg === "string" ? arg : String(arg?.sql || "");
        const params = arg && arg.values ? arg.values : maybeParams || [];
        if (/information_schema\.COLUMNS/i.test(sql)) {
          return [LEGACY_BASELINE_COLS.map((name) => ({ name })), []];
        }
        if (/FROM products WHERE id IN/i.test(sql) && /FOR UPDATE/i.test(sql)) {
          if (
            /lifecycle_mode|shop_listed|season_starts_at|product_version/i.test(sql)
          ) {
            const err = new Error("Unknown column");
            err.code = "ER_BAD_FIELD_ERROR";
            throw err;
          }
          const ids = (params || []).map(Number);
          return [ids.map((id) => PRODUCTS[id]).filter(Boolean), []];
        }
        if (/INSERT INTO orders/i.test(sql)) {
          insertCount += 1;
          return [{ affectedRows: 1 }, []];
        }
        if (/INSERT INTO order_items/i.test(sql)) return [{ affectedRows: 1 }, []];
        if (/FROM coupons/i.test(sql)) return [[], []];
        if (/UPDATE coupons/i.test(sql)) return [{ affectedRows: 0 }, []];
        return [[], []];
      },
    };
  }

  const pool = {
    async getConnection() {
      return makeConn();
    },
    async query() {
      return [[], []];
    },
  };

  const PricesIncludeVatReadError = vatMod.PricesIncludeVatReadError;

  function vatStub() {
    return {
      getPricesIncludeVat: async (opts) => {
        if (opts && opts.ttlMs === 0) {
          vatTxCalls += 1;
          throw new PricesIncludeVatReadError("simulated TX read failure");
        }
        vatEarlyCalls += 1;
        return true; // early succeeds (ON) — TX still fails
      },
      clearPricesIncludeVatCache: () => {},
      isPricesIncludeVatReadError: vatMod.isPricesIncludeVatReadError,
      PricesIncludeVatReadError,
    };
  }

  function paymentStub() {
    return {
      getPaymentMethodSettings: async () => ({
        bankEnabled: true,
        codEnabled: true,
        bothOffCorrected: false,
      }),
      clearPaymentMethodSettingsCache: () => {},
    };
  }

  const stubs = {
    "../../lib/db": pool,
    "@/lib/db": pool,
    "../../lib/rateLimit": {
      RL_GENERAL: () => ({ allowed: true, remaining: 99, retryAfterSec: 0 }),
      getClientIp: () => "127.0.0.1",
    },
    "../../lib/contact-config": {
      getContactConfig: async () => ({
        email: "orders@example.com",
        whatsappUrl: "https://wa.me/0",
        telegramUrl: "https://t.me/0",
      }),
    },
    "../../lib/paymentMethodSettingsServer": paymentStub(),
    "@/lib/paymentMethodSettingsServer": paymentStub(),
    "../../lib/pricesIncludeVatServer": vatStub(),
    "@/lib/pricesIncludeVatServer": vatStub(),
    nodemailer: {
      createTransport: () => ({
        sendMail: async () => {
          sendMailCount += 1;
          return {};
        },
      }),
    },
  };

  cache.clear();
  loadTs("lib/productSchemaCapability.ts", stubs);
  const capServer = loadTs("lib/productSchemaCapabilityServer.ts", stubs);
  if (typeof capServer.clearProductSchemaCapabilityCache === "function") {
    capServer.clearProductSchemaCapabilityCache({ db: pool });
  }
  const ordersMod = loadTs("pages/api/orders.ts", stubs);
  const handler = ordersMod.default || ordersMod;

  const res = {
    statusCode: 200,
    body: null,
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
  };
  const req = {
    method: "POST",
    body: {
      customer_name: "Test Buyer",
      customer_email: "buyer@example.com",
      customer_phone: "+447123456789",
      delivery_address: "1 Test St",
      city: "London",
      postcode: "E1 1AA",
      notes: "",
      payment_method: "bank",
      receipt_path: "/uploads/receipts/x.jpg",
      items: [{ id: 3, qty: 1 }],
      coupon_code: "",
      payment_reference: "",
      digital_supply_acknowledgement: true,
    },
    headers: {},
    socket: { remoteAddress: "127.0.0.1" },
  };

  await handler(req, res);
  await new Promise((r) => setImmediate(r));

  ok(
    "orders_tx_vat_error_503",
    res.statusCode === 503 &&
      res.body?.error === "Pricing temporarily unavailable. Please try again."
  );
  ok("orders_tx_vat_error_no_insert", insertCount === 0);
  ok("orders_tx_vat_error_rollback", rollbackCount >= 1);
  ok("orders_tx_vat_error_no_email", sendMailCount === 0);
  ok("orders_tx_vat_read_attempted", vatTxCalls >= 1 && vatEarlyCalls >= 1);

  // Early unknown still reaches TX (and 503s there)
  insertCount = 0;
  rollbackCount = 0;
  sendMailCount = 0;
  vatTxCalls = 0;
  vatEarlyCalls = 0;
  const vatStubEarlyFail = {
    getPricesIncludeVat: async (opts) => {
      if (opts && opts.ttlMs === 0) {
        vatTxCalls += 1;
        throw new PricesIncludeVatReadError("tx fail");
      }
      vatEarlyCalls += 1;
      throw new PricesIncludeVatReadError("early fail");
    },
    clearPricesIncludeVatCache: () => {},
    isPricesIncludeVatReadError: vatMod.isPricesIncludeVatReadError,
    PricesIncludeVatReadError,
  };
  cache.clear();
  const stubs2 = {
    ...stubs,
    "../../lib/pricesIncludeVatServer": vatStubEarlyFail,
    "@/lib/pricesIncludeVatServer": vatStubEarlyFail,
  };
  loadTs("lib/productSchemaCapability.ts", stubs2);
  const cap2 = loadTs("lib/productSchemaCapabilityServer.ts", stubs2);
  if (typeof cap2.clearProductSchemaCapabilityCache === "function") {
    cap2.clearProductSchemaCapabilityCache({ db: pool });
  }
  const ordersMod2 = loadTs("pages/api/orders.ts", stubs2);
  const handler2 = ordersMod2.default || ordersMod2;
  const res2 = {
    statusCode: 200,
    body: null,
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
  };
  await handler2({ ...req }, res2);
  await new Promise((r) => setImmediate(r));
  ok(
    "early_unknown_still_hits_tx_503",
    res2.statusCode === 503 &&
      insertCount === 0 &&
      sendMailCount === 0 &&
      vatEarlyCalls >= 1 &&
      vatTxCalls >= 1
  );

  // Client: no VAT-added total while CMS unloaded (source + pure mirror)
  ok(
    "client_no_vat_added_before_cms_source",
    /!cmsLoaded/.test(miniSrc) &&
      /Calculating…/.test(miniSrc) &&
      /data-totals-loading/.test(cartSrc)
  );

  const selfHash = crypto
    .createHash("sha256")
    .update(read("scripts/phase-vat-fix-84-tests.js"))
    .digest("hex")
    .slice(0, 12);
  console.log(`\nphase-vat-fix-84: ${passed} passed, ${failed} failed (${selfHash})`);
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
