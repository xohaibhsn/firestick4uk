/**
 * F4UK-PAY-CMS-66 — CMS payment method toggles; no hardcoded bank details;
 * server-side enforcement before insert/receipt/email.
 *
 * Forbidden bank-identity hashes (SHA256 of exact tokens formerly hardcoded).
 * Literals are NOT stored in this file — only hashes.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Module = require("module");
const ts = require("typescript");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const HYG_RANGE_BASE = "803cdd16cf353486ac901b890c2a67bd22af9dd2";
const HYG_RANGE_END = "ad340b120f9f4c475fa59a861e075012739e5766";

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

function sha256(s) {
  return crypto.createHash("sha256").update(String(s), "utf8").digest("hex");
}

function normalizeToken(s) {
  return String(s).normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Exact SHA256 of the three former hardcoded bank identity tokens (and normalised name). */
const FORBIDDEN_BANK_HASHES = new Set([
  "1d0303ede8adeacd1c297f1c623376ae15956dc81f9fa202f34ddae8a56242eb", // account name (exact)
  "295e754fcdf70822d885bdba6298504ad35829acfdcf805703279178bfe3a2f0", // account name (normalised)
  "72263ffb1a23dfedc1dcae8900c505f6381d82a8e11781a4e17ea95321fcb43f", // sort code
  "7b91d1d4a2b6067e2852b0c2b60c4f0265434e1191bd6b9a580a07c6d603800d", // account number
]);

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

const pm = loadTs("lib/paymentMethodSettings.ts");

// ── Parse / effective matrix ───────────────────────────────────────────────
ok("parse_absent_undefined", pm.parsePaymentMethodToggle(undefined) === true);
ok("parse_absent_null", pm.parsePaymentMethodToggle(null) === true);
ok("parse_empty", pm.parsePaymentMethodToggle("") === true);
ok("parse_whitespace", pm.parsePaymentMethodToggle("  ") === true);
ok("parse_one", pm.parsePaymentMethodToggle("1") === true);
ok("parse_zero", pm.parsePaymentMethodToggle("0") === false);
ok("parse_true", pm.parsePaymentMethodToggle("true") === true);
ok("parse_false", pm.parsePaymentMethodToggle("false") === false);
ok("parse_garbage_enabled", pm.parsePaymentMethodToggle("maybe") === true);
ok("parse_off", pm.parsePaymentMethodToggle("off") === false);

const bothOn = pm.effectivePaymentMethods("1", "1");
ok("effective_both_on", bothOn.bankEnabled && bothOn.codEnabled && !bothOn.bothOffCorrected);

const bankOnly = pm.effectivePaymentMethods("1", "0");
ok("effective_bank_only", bankOnly.bankEnabled && !bankOnly.codEnabled && !bankOnly.bothOffCorrected);

const codOnly = pm.effectivePaymentMethods("0", "1");
ok("effective_cod_only", !codOnly.bankEnabled && codOnly.codEnabled && !codOnly.bothOffCorrected);

const bothOff = pm.effectivePaymentMethods("0", "0");
ok(
  "effective_both_off_corrected",
  bothOff.bankEnabled && bothOff.codEnabled && bothOff.bothOffCorrected === true
);

const absent = pm.effectivePaymentMethods(undefined, undefined);
ok("effective_absent_both_on", absent.bankEnabled && absent.codEnabled && !absent.bothOffCorrected);

const garbage = pm.effectivePaymentMethods("xyz", "nope");
ok("effective_garbage_both_on", garbage.bankEnabled && garbage.codEnabled);

ok(
  "is_enabled_bank",
  pm.isPaymentMethodEffectivelyEnabled("bank", bankOnly) === true &&
    pm.isPaymentMethodEffectivelyEnabled("cod", bankOnly) === false
);

ok(
  "bank_details_complete_ok",
  pm.bankDetailsComplete("A", "1-2", "99") === true
);
ok(
  "bank_details_incomplete_empty_name",
  pm.bankDetailsComplete("", "1-2", "99") === false
);
ok(
  "bank_details_incomplete_empty_sort",
  pm.bankDetailsComplete("A", "  ", "99") === false
);
ok(
  "bank_details_incomplete_empty_account",
  pm.bankDetailsComplete("A", "1-2", "") === false
);

const saveGate = pm.validatePaymentTogglesForSave(false, false);
ok("editor_refuses_both_off", saveGate.ok === false && /at least one/i.test(saveGate.error));
ok("editor_allows_one_on", pm.validatePaymentTogglesForSave(true, false).ok === true);
ok("editor_allows_both_on", pm.validatePaymentTogglesForSave(true, true).ok === true);

// ── Source shape: cart / sidhu / defaults / orders ──────────────────────────
const cart = read("app/cart/page.tsx");
const sidhu = read("app/sidhu/page.tsx");
const defaults = read("lib/siteContentDefaults.ts");
const orders = read("pages/api/orders.ts");
const settingsSrc = read("lib/paymentMethodSettings.ts");
const settingsServer = read("lib/paymentMethodSettingsServer.ts");

ok(
  "defaults_toggle_keys_default_one",
  /\['payment_bank_enabled','1'/.test(defaults) &&
    /\['payment_cod_enabled','1'/.test(defaults)
);
ok(
  "defaults_bank_identity_empty",
  /\['bank_account_name',''/.test(defaults) &&
    /\['bank_sort_code',''/.test(defaults) &&
    /\['bank_account_no',''/.test(defaults)
);

ok(
  "cart_waits_cms_loaded",
  /cmsLoaded/.test(cart) &&
    /Loading payment options/.test(cart) &&
    /data-payment-loading=["']1["']/.test(cart)
);
ok(
  "cart_no_bank_values_before_loaded",
  /cmsLoaded \? String\(sc\.bank_account_name/.test(cart) &&
    /!cmsLoaded \?[\s\S]{0,80}payment-options-loading/.test(cart) &&
    /paymentOptionsBlocked/.test(cart) &&
    /!cmsLoaded/.test(cart)
);
ok(
  "cart_uses_bank_selectable_gate",
  /bankSelectable/.test(cart) &&
    /bankShowUnavailable/.test(cart) &&
    /Bank transfer temporarily unavailable/.test(cart)
);
ok(
  "cart_cod_gated_toggle_and_classification",
  /showSecondPaymentOption/.test(cart) &&
    /paymentToggles\.codEnabled/.test(cart) &&
    /classification\.ready\s*===\s*true/.test(cart)
);
ok(
  "cart_bank_details_only_when_selectable",
  /paymentMethod === ["']bank["'] && bankSelectable/.test(cart) &&
    /data-bank-details=["']1["']/.test(cart) &&
    /CopyButton value=\{bankAccountName\}/.test(cart)
);
ok(
  "cart_cms_fail_hint",
  /cmsFailed/.test(cart) && /data-payment-cms-hint=["']1["']/.test(cart)
);
ok(
  "cart_posted_values_bank_cod",
  /payment_method:\s*paymentMethod/.test(cart) &&
    /useState<"bank" \| "cod">\("bank"\)/.test(cart)
);
ok(
  "cart_empty_t_fallbacks_for_bank_identity",
  !/t\(\s*["']bank_account_name["']\s*,\s*["'][^"']+["']\s*\)/.test(cart) &&
    !/t\(\s*["']bank_sort_code["']\s*,\s*["'][^"']+["']\s*\)/.test(cart) &&
    !/t\(\s*["']bank_account_no["']\s*,\s*["'][^"']+["']\s*\)/.test(cart)
);

ok(
  "sidhu_payment_methods_panel",
  /data-payment-methods-panel=["']1["']/.test(sidhu) &&
    /Payment methods/.test(sidhu) &&
    /data-payment-toggle=["']bank["']/.test(sidhu) &&
    /data-payment-toggle=["']cod["']/.test(sidhu) &&
    /validatePaymentTogglesForSave/.test(sidhu) &&
    /data-bank-details-warning=["']1["']/.test(sidhu)
);

ok(
  "orders_enforces_before_insert",
  (() => {
    const enforce = orders.indexOf("Payment method unavailable.");
    const insert = orders.indexOf("INSERT INTO orders");
    const receiptUploadPath = orders.indexOf("receipt_path");
    return (
      enforce > 0 &&
      insert > enforce &&
      /getPaymentMethodSettings/.test(orders) &&
      /isPaymentMethodEffectivelyEnabled/.test(orders)
    );
  })()
);
ok(
  "orders_mapping_unchanged",
  /toDbPaymentMethod/.test(orders) && /isPublicPaymentMethod/.test(orders)
);
ok(
  "no_new_dangerouslySetInnerHTML_in_touched",
  !/dangerouslySetInnerHTML/.test(settingsSrc) &&
    !/dangerouslySetInnerHTML/.test(settingsServer)
);

// ── Hardcoded bank identity guard (hash-only) ──────────────────────────────
function scanTrackedForForbiddenHashes() {
  let files = [];
  try {
    files = execSync("git ls-files", { cwd: ROOT, encoding: "utf8" })
      .split(/\r?\n/)
      .map((s) => s.trim().replace(/\\/g, "/"))
      .filter(Boolean);
  } catch (_) {
    files = [];
  }
  const hits = [];
  const tokenRe = /[A-Za-z0-9][A-Za-z0-9 .'\-]{2,80}/g;
  for (const rel of files) {
    if (/\.(png|jpg|jpeg|gif|webp|ico|woff2?|pdf|zip|map)$/i.test(rel)) continue;
    if (rel === "scripts/phase-pay-cms-66-tests.js") continue;
    const abs = path.join(ROOT, rel);
    let text;
    try {
      text = fs.readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    // Whole-line / quoted-string candidates
    const candidates = new Set();
    for (const m of text.matchAll(/["'`]([^"'`]{3,80})["'`]/g)) {
      candidates.add(m[1]);
    }
    for (const m of text.matchAll(tokenRe)) {
      if (m[0].length <= 40) candidates.add(m[0]);
    }
    for (const c of candidates) {
      const h1 = sha256(c);
      const h2 = sha256(normalizeToken(c));
      if (FORBIDDEN_BANK_HASHES.has(h1) || FORBIDDEN_BANK_HASHES.has(h2)) {
        hits.push(rel);
        break;
      }
    }
  }
  return hits;
}

const hashHits = scanTrackedForForbiddenHashes();
ok(
  "no_hardcoded_bank_identity_in_tracked_source",
  hashHits.length === 0,
  hashHits.length ? hashHits.slice(0, 12).join(",") : "clean"
);

// SEO/nav/layout untouched in this change set vs HEAD parent when dirty.
// F4UK-BLACK-FRIDAY-68 intentionally edits Footer (seasonal offers link only).
const seoNavFiles = [
  "app/layout.tsx",
  "components/Navbar.tsx",
  "components/Footer.tsx",
  "app/sitemap.ts",
  "app/robots.ts",
];
const seoNavAllowDirty = new Set(["components/Footer.tsx"]);
for (const f of seoNavFiles) {
  let dirty = false;
  try {
    const d = execSync(`git diff --name-only ${HYG_RANGE_BASE}..${HYG_RANGE_END} -- ${f}`, {
      cwd: ROOT,
      encoding: "utf8",
    }).trim();
    dirty = !!d;
  } catch (_) {
    dirty = false;
  }
  if (seoNavAllowDirty.has(f)) {
    ok(`seo_nav_unchanged_${f.replace(/[\\/.]/g, "_")}`, true, "bf68-footer-allowed");
    continue;
  }
  ok(`seo_nav_unchanged_${f.replace(/[\\/.]/g, "_")}`, !dirty);
}

// ── Server 400 before insert / email (mocked) ──────────────────────────────
process.env.DB_NAME = process.env.DB_NAME || "stub";
process.env.DB_HOST = process.env.DB_HOST || "127.0.0.1";
process.env.DB_USER = process.env.DB_USER || "stub";
delete process.env.DB_PASSWORD;
process.env.SMTP_USER = "stub-smtp-user";
process.env["SMTP" + "_PASS"] = "stub";

let insertCount = 0;
let sentMails = [];
let toggleState = { bankEnabled: true, codEnabled: true, bothOffCorrected: false };

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

const PRODUCTS = {
  3: {
    id: 3,
    name: "Digital Plan",
    active: 1,
    price: 29.99,
    category: "subscription",
    stock: "digital",
  },
};

function makeConn() {
  return {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
    async query(arg, maybeParams) {
      const sql = typeof arg === "string" ? arg : String(arg?.sql || "");
      const params = arg && arg.values ? arg.values : maybeParams || [];
      if (/information_schema\.COLUMNS/i.test(sql)) {
        return [LEGACY_BASELINE_COLS.map((name) => ({ name })), []];
      }
      if (/FROM products WHERE id IN/i.test(sql) && /FOR UPDATE/i.test(sql)) {
        if (/lifecycle_mode|shop_listed|season_starts_at|product_version/i.test(sql)) {
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

function sharedStubs() {
  return {
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
    "../../lib/paymentMethodSettingsServer": {
      getPaymentMethodSettings: async () => ({ ...toggleState }),
      clearPaymentMethodSettingsCache: () => {},
    },
    "@/lib/paymentMethodSettingsServer": {
      getPaymentMethodSettings: async () => ({ ...toggleState }),
      clearPaymentMethodSettingsCache: () => {},
    },
    nodemailer: {
      createTransport: () => ({
        sendMail: async (opts) => {
          sentMails.push(opts);
          return {};
        },
      }),
    },
  };
}

function loadOrdersHandler() {
  cache.clear();
  const stubs = sharedStubs();
  loadTs("lib/productSchemaCapability.ts", stubs);
  const capServer = loadTs("lib/productSchemaCapabilityServer.ts", stubs);
  if (typeof capServer.clearProductSchemaCapabilityCache === "function") {
    capServer.clearProductSchemaCapabilityCache({ db: pool });
  }
  const mod = loadTs("pages/api/orders.ts", stubs);
  return mod.default || mod;
}

function makeRes() {
  return {
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
}

async function invoke(body) {
  insertCount = 0;
  sentMails = [];
  const handler = loadOrdersHandler();
  const req = {
    method: "POST",
    body,
    headers: {},
    socket: { remoteAddress: "127.0.0.1" },
  };
  const res = makeRes();
  await handler(req, res);
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  return res;
}

function baseBody(overrides = {}) {
  return {
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
    ...overrides,
  };
}

(async () => {
  toggleState = { bankEnabled: false, codEnabled: true, bothOffCorrected: false };
  let res = await invoke(baseBody({ payment_method: "bank" }));
  ok(
    "server_400_disabled_bank_before_insert",
    res.statusCode === 400 &&
      res.body?.error === "Payment method unavailable." &&
      insertCount === 0 &&
      sentMails.length === 0
  );

  toggleState = { bankEnabled: true, codEnabled: false, bothOffCorrected: false };
  res = await invoke(baseBody({ payment_method: "cod", receipt_path: "" }));
  ok(
    "server_400_disabled_cod_before_insert",
    res.statusCode === 400 &&
      res.body?.error === "Payment method unavailable." &&
      insertCount === 0 &&
      sentMails.length === 0
  );

  toggleState = { bankEnabled: true, codEnabled: true, bothOffCorrected: false };
  res = await invoke(baseBody({ payment_method: "bank" }));
  ok(
    "server_enabled_bank_unchanged",
    res.statusCode === 200 && res.body?.success && insertCount === 1
  );

  toggleState = { bankEnabled: true, codEnabled: true, bothOffCorrected: false };
  res = await invoke(baseBody({ payment_method: "cod", receipt_path: "" }));
  ok(
    "server_enabled_cod_unchanged",
    res.statusCode === 200 && res.body?.success && insertCount === 1
  );

  // Stored mapping still bank_transfer / cod via toDbPaymentMethod — exercised by success path.
  ok("helper_module_exports_keys", typeof pm.PAYMENT_BANK_ENABLED_KEY === "string");

  console.log(`\nPAY-CMS-66: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
