/**
 * F4UK-CHECKOUT-CONTACT-69 — mandatory email + phone at checkout (E.164),
 * country-code dropdown, server-side 400s before insert/email, CMS keys,
 * SAMEORIGIN framing, insights denylist unchanged.
 *
 * Standalone CommonJS script. Repo root is taken from REPO_ROOT (env) or
 * defaults to the cart-47 review-artifacts repo; falls back to the parent of
 * this file's directory if it contains package.json (when copied into scripts/).
 */
const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");

function resolveRoot() {
  if (process.env.REPO_ROOT) return path.resolve(process.env.REPO_ROOT);
  const parent = path.resolve(__dirname, "..");
  if (
    fs.existsSync(path.join(parent, "package.json")) &&
    fs.existsSync(path.join(parent, "lib", "phoneCountryCodes.ts"))
  ) {
    return parent;
  }
  return "C:\\Users\\LENOVO\\firestick44uk-ab8c2a-20261015\\review-artifacts\\cart-47\\repo";
}

const ROOT = resolveRoot();

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

// ── 1. PHONE_COUNTRY_CODES ──────────────────────────────────────────────────
const phoneLib = loadTs("lib/phoneCountryCodes.ts");
const { PHONE_COUNTRY_CODES, DEFAULT_PHONE_COUNTRY_DIAL, normalizePhoneE164 } = phoneLib;

ok(
  "codes_length_at_least_200",
  Array.isArray(PHONE_COUNTRY_CODES) && PHONE_COUNTRY_CODES.length >= 200,
  `length=${PHONE_COUNTRY_CODES.length}`
);
ok(
  "codes_first_is_GB_44",
  PHONE_COUNTRY_CODES[0]?.iso2 === "GB" && PHONE_COUNTRY_CODES[0]?.dial === "44"
);
ok(
  "codes_second_is_IE_353",
  PHONE_COUNTRY_CODES[1]?.iso2 === "IE" && PHONE_COUNTRY_CODES[1]?.dial === "353"
);
ok(
  "codes_third_is_US_1",
  PHONE_COUNTRY_CODES[2]?.iso2 === "US" && PHONE_COUNTRY_CODES[2]?.dial === "1"
);
{
  const rest = PHONE_COUNTRY_CODES.slice(3).map((c) => c.name);
  let firstBad = null;
  for (let i = 1; i < rest.length; i++) {
    if (rest[i - 1].localeCompare(rest[i], "en", { sensitivity: "base" }) > 0) {
      firstBad = `${rest[i - 1]} > ${rest[i]}`;
      break;
    }
  }
  ok("codes_rest_sorted_A_to_Z_by_name", firstBad === null, firstBad || "sorted");
}
{
  const seen = new Set();
  const dups = [];
  for (const c of PHONE_COUNTRY_CODES) {
    if (seen.has(c.iso2)) dups.push(c.iso2);
    seen.add(c.iso2);
  }
  ok("codes_no_duplicate_iso2", dups.length === 0, dups.join(",") || "unique");
}
ok(
  "codes_entries_well_formed",
  PHONE_COUNTRY_CODES.every(
    (c) => /^[A-Z]{2}$/.test(c.iso2) && /^[1-9]\d{0,3}$/.test(c.dial) && c.name.trim().length > 0
  )
);
ok("default_dial_is_44", DEFAULT_PHONE_COUNTRY_DIAL === "44");

// ── 2. normalizePhoneE164 matrix ────────────────────────────────────────────
ok("norm_uk_local_07123_456789", normalizePhoneE164("44", "07123 456789") === "+447123456789");
ok("norm_uk_plus_with_spaces", normalizePhoneE164("44", "+44 7123 456789") === "+447123456789");
ok("norm_uk_00_prefix", normalizePhoneE164("44", "00447123456789") === "+447123456789");
ok("norm_uk_bracket_zero_dash_dot", normalizePhoneE164("44", "(0)7123-456.789") === "+447123456789");
ok("norm_ie_081234567", normalizePhoneE164("353", "081234567") === "+35381234567");
ok("norm_us_212_555_1234", normalizePhoneE164("1", "212-555-1234") === "+12125551234");
ok("norm_spaces_and_dashes", normalizePhoneE164("44", "7123 - 456 789") === "+447123456789");
ok(
  "norm_plus_ignores_dropdown_dial",
  normalizePhoneE164("1", "+44 7123 456789") === "+447123456789"
);

// ── 3. Invalid phone inputs ────────────────────────────────────────────────
const identity = loadTs("lib/orderCustomerIdentity.ts");
const phoneOk = (e164) => phoneLib.isValidE164(e164) && phoneLib.isValidPhoneForCountryRules(e164);

ok("invalid_empty_normalizes_to_empty", normalizePhoneE164("44", "") === "");
ok("invalid_letters_only_normalizes_to_empty", normalizePhoneE164("44", "abcdef") === "");
ok(
  "invalid_letters_mixed_rejected",
  !phoneOk(normalizePhoneE164("44", "07123abc")) &&
    identity.validateCheckoutContact({
      customer_email: "a@example.com",
      customer_phone: "07123abc",
    }).ok === false
);
ok("invalid_uk_9_digit_national", !phoneOk("+44712345678"));
ok("invalid_too_short", !phoneOk("+4412") && !phoneOk(normalizePhoneE164("44", "12")));
ok("invalid_too_long", !phoneOk("+4471234567890123456789"));
ok(
  "coerce_without_plus_does_not_invent_country",
  phoneLib.coercePhoneToE164Candidate("07123 456789") === "07123456789" &&
    !phoneLib.coercePhoneToE164Candidate("7123456789").startsWith("+") &&
    phoneLib.isValidE164(phoneLib.coercePhoneToE164Candidate("447123456789")) === false
);
ok(
  "coerce_plus_form_kept",
  phoneLib.coercePhoneToE164Candidate("+44 7123 456789") === "+447123456789" &&
    phoneLib.coercePhoneToE164Candidate("00447123456789") === "+447123456789"
);

// ── 4. validateCheckoutContact ─────────────────────────────────────────────
const vc = identity.validateCheckoutContact;
const GOOD_PHONE = "+447123456789";
{
  const r = vc({ customer_email: "", customer_phone: GOOD_PHONE });
  ok("vcc_email_required", r.ok === false && r.field === "email" && r.code === "required");
}
{
  const r = vc({ customer_email: "not-an-email", customer_phone: GOOD_PHONE });
  ok("vcc_email_invalid", r.ok === false && r.field === "email" && r.code === "invalid");
}
{
  const r = vc({ customer_email: "a@b", customer_phone: GOOD_PHONE });
  ok("vcc_email_no_tld_invalid", r.ok === false && r.field === "email" && r.code === "invalid");
}
{
  const r = vc({ customer_email: "buyer@example.com", customer_phone: "" });
  ok("vcc_phone_required", r.ok === false && r.field === "phone" && r.code === "required");
}
{
  const r = vc({ customer_email: "buyer@example.com", customer_phone: "12345" });
  ok("vcc_phone_invalid", r.ok === false && r.field === "phone" && r.code === "invalid");
}
{
  const r = vc({ customer_email: "buyer@example.com", customer_phone: GOOD_PHONE });
  ok("vcc_ok_path", r.ok === true);
}
{
  const r = vc({ customer_email: "buyer@example.com", customer_phone: "+44 7123 456789" });
  ok("vcc_ok_path_spaced_plus", r.ok === true);
}

// ── 5/6. API tests via orders handler ──────────────────────────────────────
process.env.DB_NAME = process.env.DB_NAME || "stub";
process.env.DB_HOST = process.env.DB_HOST || "127.0.0.1";
process.env.DB_USER = process.env.DB_USER || "stub";
delete process.env.DB_PASSWORD;
process.env.SMTP_USER = "stub-smtp-user";
process.env["SMTP" + "_PASS"] = "stub";

let insertCount = 0;
let insertParams = null;
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
        insertParams = params;
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
  insertParams = null;
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

function isRejected400(res, field, code) {
  return (
    res.statusCode === 400 &&
    res.body?.field === field &&
    res.body?.code === code &&
    insertCount === 0 &&
    sentMails.length === 0
  );
}

// ── 7–10 static source checks (sync; run before async API block output order is irrelevant) ──
function runSourceChecks() {
  const cartSrc = read("app/cart/page.tsx");
  const defaultsSrc = read("lib/siteContentDefaults.ts");
  const adminFieldsSrc = read("lib/adminContentFields.ts");

  // 7. cart page source
  ok(
    "cart_phone_country_select_id",
    /id=["']checkout-phone-country["']/.test(cartSrc) && /<select/.test(cartSrc)
  );
  ok("cart_tel_national_autocomplete", /autoComplete=["']tel-national["']/.test(cartSrc));
  ok(
    "cart_uses_default_phone_country_dial",
    /import[\s\S]{0,300}DEFAULT_PHONE_COUNTRY_DIAL[\s\S]{0,200}from/.test(cartSrc) &&
      /useState\(DEFAULT_PHONE_COUNTRY_DIAL\)/.test(cartSrc)
  );
  ok(
    "cart_aria_required_on_fields",
    (cartSrc.match(/aria-required/g) || []).length >= 2
  );
  ok(
    "cart_phone_row_max_width_100",
    /\.phone-row\s*\{[^}]*max-width:\s*100%/.test(cartSrc)
  );

  const cmsKeys = [
    "cart_lbl_phone_country",
    "cart_err_email_required",
    "cart_err_email_invalid",
    "cart_err_phone_required",
    "cart_err_phone_invalid",
  ];
  for (const k of cmsKeys) {
    ok(
      `cms_key_${k}_in_defaults_and_admin_fields`,
      new RegExp(`\\['${k}'`).test(defaultsSrc) &&
        new RegExp(`key:\\s*["']${k}["']`).test(adminFieldsSrc)
    );
  }
  ok(
    "cms_files_no_literal_backslash_n_artifacts",
    !/\\n\s*\[/.test(defaultsSrc) && !/\\n\s*\{\s*key:/.test(adminFieldsSrc),
    "literal \\n between entries would break the TS source"
  );
  ok(
    "cms_cart_uses_error_keys",
    /cart_err_email_required/.test(cartSrc) &&
      /cart_err_email_invalid/.test(cartSrc) &&
      /cart_err_phone_required/.test(cartSrc) &&
      /cart_err_phone_invalid/.test(cartSrc)
  );

  // 8. insightsClient denylist
  const insightsSrc = read("lib/insightsClient.ts");
  const denyMatch = insightsSrc.match(/INSIGHTS_FORM_KEY_DENYLIST\s*=\s*\[([\s\S]*?)\]/);
  const denyBody = denyMatch ? denyMatch[1] : "";
  ok("insights_denylist_has_email", /["']email["']/.test(denyBody));
  ok("insights_denylist_has_phone", /["']phone["']/.test(denyBody));

  // 9. next.config.ts headers
  const nextCfg = read("next.config.ts");
  ok(
    "next_x_frame_options_sameorigin",
    /key:\s*["']X-Frame-Options["'],\s*value:\s*["']SAMEORIGIN["']/.test(nextCfg) &&
      !/X-Frame-Options["'],\s*value:\s*["']DENY["']/.test(nextCfg)
  );
  const fa = [...nextCfg.matchAll(/frame-ancestors\s+([^;"]+);/g)].map((m) => m[1].trim());
  ok(
    "next_csp_frame_ancestors_self_not_none",
    fa.length >= 1 && fa.every((v) => v === "'self'" && !/'none'/.test(v)),
    fa.join(" | ")
  );
  ok(
    "next_other_security_headers_present",
    /X-Content-Type-Options["'],\s*value:\s*["']nosniff["']/.test(nextCfg) &&
      /Referrer-Policy["'],\s*value:\s*["']strict-origin-when-cross-origin["']/.test(nextCfg)
  );

  // 10. windup-59 script fixed SHA range
  const windup = read("scripts/phase-windup-59-tests.js");
  ok(
    "windup59_range_base_76067a7",
    /RANGE_BASE\s*=\s*["']76067a7[0-9a-f]{33}["']/.test(windup)
  );
  ok(
    "windup59_range_end_f35ca7d",
    /RANGE_END\s*=\s*["']f35ca7d[0-9a-f]{33}["']/.test(windup)
  );
}

(async () => {
  toggleState = { bankEnabled: true, codEnabled: true, bothOffCorrected: false };

  // 5. API rejections
  let res = await invoke(baseBody({ customer_phone: "" }));
  ok("api_missing_phone_400", isRejected400(res, "phone", "required"));

  res = await invoke(baseBody({ customer_phone: undefined }));
  ok("api_undefined_phone_400", isRejected400(res, "phone", "required"));

  res = await invoke(baseBody({ customer_phone: "12345" }));
  ok("api_phone_12345_400", isRejected400(res, "phone", "invalid"));

  res = await invoke(baseBody({ customer_phone: "+44712345678" }));
  ok("api_uk_9_digit_phone_400", isRejected400(res, "phone", "invalid"));

  res = await invoke(baseBody({ customer_phone: "07123456789" }));
  ok("api_phone_without_plus_400_no_country_invented", isRejected400(res, "phone", "invalid"));

  res = await invoke(baseBody({ customer_email: "not-an-email" }));
  ok("api_bad_email_400", isRejected400(res, "email", "invalid"));

  res = await invoke(baseBody({ customer_email: "" }));
  ok("api_missing_email_400", isRejected400(res, "email", "required"));

  res = await invoke(baseBody({ customer_email: undefined }));
  ok("api_undefined_email_400", isRejected400(res, "email", "required"));

  // 6. API success path (cod, digital product 3)
  res = await invoke(
    baseBody({
      customer_phone: "+44 7123 456789",
      payment_method: "cod",
      receipt_path: "",
    })
  );
  ok(
    "api_200_spaced_plus44_cod",
    res.statusCode === 200 && res.body?.success && insertCount >= 1,
    `status=${res.statusCode} inserts=${insertCount}`
  );
  ok(
    "api_200_stores_normalized_e164",
    Array.isArray(insertParams) && insertParams.includes("+447123456789") &&
      !insertParams.includes("+44 7123 456789")
  );

  res = await invoke(baseBody({ payment_method: "cod", receipt_path: "" }));
  ok(
    "api_200_baseBody_e164_cod",
    res.statusCode === 200 && res.body?.success && insertCount >= 1
  );

  runSourceChecks();

  const total = passed + failed;
  if (total < 35) {
    failed++;
    console.error(`FAIL  minimum_check_count — only ${total} checks ran (need >= 35)`);
  }
  console.log(`\nCHECKOUT-CONTACT-69: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  console.log(`\nCHECKOUT-CONTACT-69: ${passed} passed, ${failed + 1} failed`);
  process.exit(1);
});
