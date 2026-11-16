/**
 * F4UK-MULTI-108 — COD receipt ignore + CMS stale-write protection.
 * Static checks and mocked handlers only. No real DB, SMTP, or network.
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

function loadTs(rel, stubs = {}) {
  const abs = path.join(ROOT, rel);
  const src = fs.readFileSync(abs, "utf8");
  const out = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
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
      const mapped = id.slice(2);
      for (const candidate of [
        path.join(ROOT, mapped + ".ts"),
        path.join(ROOT, mapped + ".tsx"),
        path.join(ROOT, mapped + ".js"),
      ]) {
        if (fs.existsSync(candidate)) {
          return loadTs(path.relative(ROOT, candidate).replace(/\\/g, "/"), stubs);
        }
      }
    }
    if (id.startsWith("./") || id.startsWith("../")) {
      const base = path.normalize(path.join(path.dirname(abs), id));
      for (const candidate of [base + ".ts", base + ".tsx", base + ".js"]) {
        if (fs.existsSync(candidate)) {
          return loadTs(path.relative(ROOT, candidate).replace(/\\/g, "/"), stubs);
        }
      }
    }
    return orig(id);
  };
  m._compile(out, abs);
  return m.exports;
}

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(k, v) {
      this.headers[String(k).toLowerCase()] = v;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

// ---------------------------------------------------------------------------
// A) RECEIPT-COD-IGNORE
// ---------------------------------------------------------------------------
console.log("\n# A) RECEIPT-COD-IGNORE");

const ordersSrc = read("pages/api/orders.ts");
const receiptBlock = ordersSrc.slice(
  ordersSrc.indexOf("// Receipt path allowlist"),
  ordersSrc.indexOf("// CMS on/off")
);
ok(
  "orders_cod_normalizes_receipt_to_empty",
  /publicPaymentMethod === ['"]cod['"][\s\S]*?\?\s*['"]['"]/.test(receiptBlock)
);
ok(
  "orders_cod_skips_receipt_allowlist",
  /publicPaymentMethod !== ['"]cod['"]\s*&&\s*!isAllowedReceiptPath\(receiptPathValue\)/.test(
    receiptBlock
  )
);
ok(
  "orders_keeps_receipt_error_message",
  receiptBlock.includes("Receipt upload is invalid — please upload your receipt again.")
);

const PRODUCT = {
  id: 3,
  name: "Digital Plan",
  active: 1,
  price: 29.99,
  category: "subscription",
  stock: "digital",
};
let lastOrderReceipt;

function ordersPool() {
  const conn = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
    async query(sqlOrObj, maybeParams) {
      const sql =
        typeof sqlOrObj === "string" ? sqlOrObj : String(sqlOrObj?.sql || "");
      const params = sqlOrObj?.values || maybeParams || [];
      if (/INSERT INTO orders/i.test(sql)) {
        lastOrderReceipt = params[9];
        return [{ affectedRows: 1 }, []];
      }
      if (/INSERT INTO order_items/i.test(sql)) return [{ affectedRows: 1 }, []];
      if (/FROM coupons/i.test(sql)) return [[], []];
      return [[], []];
    },
  };
  return {
    async getConnection() {
      return conn;
    },
    async query() {
      return [[], []];
    },
  };
}

function ordersStubs(pool) {
  const paymentSettings = {
    getPaymentMethodSettings: async () => ({
      bankEnabled: true,
      codEnabled: true,
      bothOffCorrected: false,
    }),
    clearPaymentMethodSettingsCache() {},
  };
  const eligibility = {
    lockAndAuthorizeOrderProducts: async ({ productIds }) => ({
      ok: true,
      productsById: new Map(productIds.map((id) => [id, PRODUCT])),
      capability: { mode: "legacy" },
      nowMs: Date.now(),
    }),
  };
  const vat = {
    getPricesIncludeVat: async () => false,
    isPricesIncludeVatReadError: () => false,
  };
  return {
    "../../lib/db": { __esModule: true, default: pool },
    "@/lib/db": { __esModule: true, default: pool },
    "../../lib/rateLimit": {
      RL_GENERAL: () => ({ allowed: true }),
      getClientIp: () => "127.0.0.1",
    },
    "../../lib/contact-config": {
      getContactConfig: async () => ({
        email: "orders@example.com",
        whatsappUrl: "https://wa.me/0",
        telegramUrl: "https://t.me/0",
      }),
    },
    "../../lib/paymentMethodSettingsServer": paymentSettings,
    "@/lib/paymentMethodSettingsServer": paymentSettings,
    "../../lib/orderProductEligibility": eligibility,
    "@/lib/orderProductEligibility": eligibility,
    "../../lib/pricesIncludeVatServer": vat,
    "@/lib/pricesIncludeVatServer": vat,
    nodemailer: {
      createTransport: () => ({ sendMail: async () => ({}) }),
    },
  };
}

function orderBody(overrides = {}) {
  return {
    customer_name: "Test Buyer",
    customer_email: "buyer@example.com",
    customer_phone: "+447123456789",
    delivery_address: "1 Test St",
    city: "London",
    postcode: "E1 1AA",
    notes: "",
    payment_method: "bank",
    receipt_path: "",
    items: [{ id: 3, qty: 1 }],
    coupon_code: "",
    payment_reference: "",
    digital_supply_acknowledgement: true,
    ...overrides,
  };
}

async function invokeOrders(body) {
  lastOrderReceipt = undefined;
  const pool = ordersPool();
  const mod = loadTs("pages/api/orders.ts", ordersStubs(pool));
  const res = makeRes();
  await (mod.default || mod)(
    {
      method: "POST",
      body,
      headers: {},
      socket: { remoteAddress: "127.0.0.1" },
    },
    res
  );
  await new Promise((resolve) => setImmediate(resolve));
  return res;
}

// ---------------------------------------------------------------------------
// B) CMS-STALE-1
// ---------------------------------------------------------------------------

function siteRows(values) {
  return Object.entries(values).map(([content_key, content_value]) => ({
    content_key,
    content_value,
    content_type: "text",
    page_name: "home",
    label: content_key,
  }));
}

function makeSiteHarness(values) {
  const calls = [];
  const audits = [];
  const rows = siteRows(values);
  const conn = {
    async beginTransaction() {
      calls.push({ kind: "begin" });
    },
    async commit() {
      calls.push({ kind: "commit" });
    },
    async rollback() {
      calls.push({ kind: "rollback" });
    },
    release() {
      calls.push({ kind: "release" });
    },
    async query(sql, params = []) {
      const text = String(sql);
      calls.push({ kind: "conn.query", sql: text, params });
      if (/^\s*SELECT/i.test(text)) {
        const wanted = new Set((params || []).map(String));
        return [rows.filter((r) => wanted.size === 0 || wanted.has(r.content_key)), []];
      }
      if (/INSERT INTO site_content/i.test(text)) return [{ affectedRows: 1 }, []];
      throw new Error("Unexpected connection SQL: " + text.slice(0, 100));
    },
  };
  const pool = {
    async query(sql, params = []) {
      const text = String(sql);
      calls.push({ kind: "pool.query", sql: text, params });
      if (/SELECT content_key/i.test(text)) {
        const wanted = new Set((params || []).map(String));
        return [rows.filter((r) => wanted.size === 0 || wanted.has(r.content_key)), []];
      }
      throw new Error("Unexpected pool SQL: " + text.slice(0, 100));
    },
    async getConnection() {
      calls.push({ kind: "getConnection" });
      return conn;
    },
  };
  const auth = {
    requireAdmin: async () => ({
      id: 1,
      username: "tester",
      role: "super_admin",
    }),
    getRequestMeta: () => ({ ip: "127.0.0.1" }),
  };
  const stubs = {
    "../../lib/db": { __esModule: true, default: pool },
    "../../lib/siteContentSeed": { SITE_CONTENT_DEFAULTS: [] },
    "../../lib/subscriptionSlug": {
      DEFAULT_SUBSCRIPTION_SLUG: "subscription",
      isAutoSubscriptionCanonical: () => false,
      normalizeSubscriptionSlug: (v) => String(v || ""),
      subscriptionPageUrl: (v) => `/subscriptions/${v}`,
      validateSubscriptionSlug: (v) => ({ ok: true, slug: String(v) }),
    },
    "../../lib/adminAuth": auth,
    "../../lib/adminPermissions": {
      hasAdminPermission: () => true,
      isSuperAdminSettingsKey: () => false,
    },
    "../../lib/adminAudit": {
      recordAdminAudit: async (entry) => {
        audits.push(entry);
      },
    },
    "../../lib/contentRevisions": {
      classifySiteContentEntityType: () => "site_content_batch",
      recordContentRevision: async () => {},
    },
    "../../lib/hostingerResourceInvalidation": {
      invalidateFaviconCache() {},
      invalidateSitemapCache() {},
      siteContentKeysAffectFavicon: () => false,
      siteContentKeysAffectSitemap: () => false,
    },
    "../../lib/publicCmsDataServer": {
      getCachedPublicSiteContentAll: async () => ({}),
      invalidatePublicCmsCache() {},
    },
    "../../lib/publicSiteContentFilter": {
      filterPublicSiteContentMap: (v) => v,
    },
    "../../lib/seasonalHubPublic": {
      SEASONAL_HUB_PUBLISHED_KEY: "seasonal_hub_published",
      validateSeasonalHubPublicationWrite: async () => ({ ok: true }),
    },
  };
  const mod = loadTs("pages/api/site-content.ts", stubs);
  return { handler: mod.default || mod, calls, audits };
}

async function invokeSite(values, body) {
  const harness = makeSiteHarness(values);
  const res = makeRes();
  await harness.handler(
    { method: "POST", body, query: {}, headers: {} },
    res
  );
  return { ...harness, res };
}

function writes(calls) {
  return calls.filter((c) => /INSERT INTO site_content/i.test(c.sql || ""));
}

(async () => {
  delete process.env.CLOUDINARY_CLOUD_NAME;
  delete process.env.CLOUDINARY_API_KEY;
  delete process.env.CLOUDINARY_API_SECRET;

  let res = await invokeOrders(
    orderBody({ payment_method: "cod", receipt_path: "../../garbage.exe" })
  );
  ok("cod_garbage_200", res.statusCode === 200 && res.body?.success === true);
  ok("cod_garbage_receipt_not_stored", !lastOrderReceipt, JSON.stringify(lastOrderReceipt));

  res = await invokeOrders(
    orderBody({ payment_method: "bank", receipt_path: "../../garbage.exe" })
  );
  ok(
    "bank_garbage_400_unchanged_message",
    res.statusCode === 400 &&
      res.body?.error ===
        "Receipt upload is invalid — please upload your receipt again."
  );

  const localPath = `/uploads/receipts/${"a".repeat(32)}.jpg`;
  res = await invokeOrders(orderBody({ payment_method: "bank", receipt_path: localPath }));
  ok("bank_valid_local_200", res.statusCode === 200 && res.body?.success === true);
  ok("bank_valid_local_stored", lastOrderReceipt === localPath);

  const cloudPath = `https://res.cloudinary.com/any/image/upload/firestick4uk/receipts/${"b".repeat(
    32
  )}.jpg`;
  res = await invokeOrders(orderBody({ payment_method: "cod", receipt_path: cloudPath }));
  ok("cod_cloud_shape_200", res.statusCode === 200 && res.body?.success === true);
  ok("cod_cloud_shape_not_stored", !lastOrderReceipt, JSON.stringify(lastOrderReceipt));

  console.log("\n# B) CMS-STALE-1");

  ok("siteContentBaseHash_exists", exists("lib/siteContentBaseHash.ts"));
  ok("siteContentBaseHashCore_exists", exists("lib/siteContentBaseHashCore.ts"));
  const hashes = loadTs("lib/siteContentBaseHash.ts");
  const hashCore = loadTs("lib/siteContentBaseHashCore.ts");
  ok(
    "absent_sentinel_exact",
    hashCore.SITE_CONTENT_ABSENT_SENTINEL === "\u0000<absent>"
  );

  const oldA = hashes.hashSiteContentValue("old-a", true);
  const oldB = hashes.hashSiteContentValue("old-b", true);
  let run = await invokeSite(
    { home_a: "old-a" },
    { updates: [{ key: "home_a", value: "new-a", base_hash: oldA }] }
  );
  ok("cms_hash_match_200", run.res.statusCode === 200 && run.res.body?.success);
  ok("cms_hash_match_writes", writes(run.calls).length === 1);

  run = await invokeSite(
    { home_a: "server-new" },
    { updates: [{ key: "home_a", value: "mine", base_hash: oldA }] }
  );
  ok(
    "cms_mismatch_409_shape",
    run.res.statusCode === 409 &&
      run.res.body?.error === "stale" &&
      run.res.body?.conflicts?.[0]?.key === "home_a"
  );
  ok("cms_mismatch_zero_writes", writes(run.calls).length === 0);

  run = await invokeSite(
    { home_a: "old-a", home_b: "server-new" },
    {
      updates: [
        { key: "home_a", value: "new-a", base_hash: oldA },
        { key: "home_b", value: "mine-b", base_hash: oldB },
      ],
    }
  );
  ok(
    "cms_mixed_match_mismatch_409",
    run.res.statusCode === 409 &&
      run.res.body?.conflicts?.some((c) => c.key === "home_b")
  );
  ok("cms_mixed_all_or_nothing_zero_writes", writes(run.calls).length === 0);

  run = await invokeSite(
    {},
    {
      updates: [
        {
          key: "missing_key",
          value: "created",
          base_hash: hashes.hashSiteContentValue(undefined, false),
        },
      ],
    }
  );
  ok("cms_absent_sentinel_match_writes", run.res.statusCode === 200 && writes(run.calls).length === 1);

  run = await invokeSite(
    { home_a: "server-new" },
    { updates: [{ key: "home_a", value: "legacy" }] }
  );
  ok("cms_missing_base_hash_legacy_write", run.res.statusCode === 200 && writes(run.calls).length === 1);

  run = await invokeSite(
    { home_a: "server-new" },
    {
      updates: [
        { key: "home_a", value: "forced-value", base_hash: oldA, force: true },
      ],
    }
  );
  const overwriteAudit = run.audits.find(
    (a) => a.action === "site_content.overwrite_stale"
  );
  ok("cms_force_writes", run.res.statusCode === 200 && writes(run.calls).length === 1);
  ok(
    "cms_force_audit_action_keys_only",
    overwriteAudit &&
      JSON.stringify(overwriteAudit.metadata) === '{"keys":["home_a"]}' &&
      !JSON.stringify(overwriteAudit).includes("forced-value")
  );

  const unicodeValue = "café 🔥\r\nline";
  const nodeHash = hashes.hashSiteContentValue(unicodeValue, true);
  const webHash = await hashCore.hashSiteContentValueWeb(unicodeValue, true);
  ok("hash_unicode_emoji_crlf_node_equals_web", nodeHash === webHash, nodeHash);

  const siteSrc = read("pages/api/site-content.ts");
  ok(
    "cms_source_transaction_and_for_update",
    /pool\.getConnection\(\)/.test(siteSrc) &&
      /beginTransaction\(\)/.test(siteSrc) &&
      /FOR UPDATE/.test(siteSrc)
  );

  const sidhu = read("app/sidhu/page.tsx");
  const saveStart = sidhu.indexOf("const saveContent = async");
  const saveEnd = sidhu.indexOf("/** Single-key POST helper", saveStart);
  const saveContent = sidhu.slice(saveStart, saveEnd);
  ok(
    "sidhu_saveContent_dirty_only",
    /const dirty = keys\.filter\(/.test(saveContent) &&
      /const updates = dirty\.map\(/.test(saveContent) &&
      !/const updates = keys\.map\(/.test(saveContent)
  );
  const conflictStart = saveContent.indexOf('if (res.status === 409 && res.error === "stale")');
  const successStart = saveContent.indexOf("if (res.success", conflictStart);
  const conflictBlock = saveContent.slice(conflictStart, successStart);
  ok(
    "sidhu_409_does_not_mark_saved",
    conflictStart >= 0 && !/setSiteContentSaved|applySavedContentKeys/.test(conflictBlock)
  );

  const dialogs = read("components/admin/AdminDialogs.tsx");
  ok(
    "admin_dialogs_exposes_choose",
    /choose:\s*\(message: string, options: AdminChoiceOption\[\]\)/.test(dialogs) &&
      /const choose = useCallback/.test(dialogs)
  );
  ok(
    "conflict_message_changed_by_someone_else",
    /changed by someone else/.test(saveContent)
  );
  ok(
    "conflict_buttons_reload_overwrite_cancel",
    /label:\s*"Reload"/.test(saveContent) &&
      /label:\s*"Overwrite"/.test(saveContent) &&
      />\s*Cancel\s*</.test(dialogs)
  );

  console.log(`\nphase-multi-108: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error("FAIL  suite_exception —", err?.stack || err);
  process.exit(1);
});
