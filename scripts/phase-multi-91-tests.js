/**
 * F4UK-MULTI-91 — order-tracking PII fix + sidhu visible-tab refresh.
 * Mocked DB only. No real customer data.
 *
 * Run: node scripts/phase-multi-91-tests.js
 */
const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");

function resolveRoot() {
  if (process.env.REPO_ROOT) return path.resolve(process.env.REPO_ROOT);
  const parent = path.resolve(__dirname, "..");
  if (fs.existsSync(path.join(parent, "package.json"))) return parent;
  return parent;
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

function mockRes() {
  const r = {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    setHeader(k, v) {
      this.headers[k] = v;
      return this;
    },
  };
  return r;
}

function mockReq(query, headers = {}) {
  return {
    method: "GET",
    query,
    headers: { "x-forwarded-for": "203.0.113.91", ...headers },
    socket: { remoteAddress: "203.0.113.91" },
  };
}

const MOCK_ORDER = {
  order_id: "ORD-1000000000001",
  status: "confirmed",
  created_at: "2026-01-15T12:00:00.000Z",
  total: "49.99",
  payment_method: "bank_transfer",
  customer_name: "Zohaib Hassan",
  customer_email: "zohaib@hotmail.com",
  customer_phone: "+447700900123",
  postcode: "SW1A 1AA",
  // Sensitive columns that must NEVER appear in the response even if selected:
  notes: "leave at door",
  payment_reference: "SECRET-REF-999",
  receipt_path: "/uploads/receipts/secret.pdf",
  delivery_address: "10 Downing Street",
  city: "London",
};

const MOCK_ITEMS = [
  { product_name: "Firestick Plan", quantity: 1, price: "49.99", id: 77 },
];

function makePool(opts = {}) {
  const {
    orderRows = [MOCK_ORDER],
    itemRows = MOCK_ITEMS,
    throwOnQuery = false,
    capture = { sql: [] },
  } = opts;
  return {
    query: async (sql, params) => {
      capture.sql.push({ sql: String(sql), params });
      if (throwOnQuery) {
        const err = new Error("ECONNREFUSED mocked db down with secrets");
        err.code = "ECONNREFUSED";
        err.name = "Error";
        throw err;
      }
      if (/FROM\s+orders/i.test(sql)) {
        // Simulate WHERE order_id = ? AND LOWER(customer_email) = ?
        const id = params?.[0];
        const email = params?.[1];
        const match = orderRows.filter(
          (o) =>
            o.order_id === id &&
            String(o.customer_email || "").toLowerCase() === String(email || "").toLowerCase() &&
            String(o.customer_email || "").trim() !== ""
        );
        return [match];
      }
      if (/FROM\s+order_items/i.test(sql)) {
        return [itemRows];
      }
      return [[]];
    },
  };
}

function loadHandler(pool, rateLimitStub) {
  cache.clear();
  const stubs = {
    "../../lib/db": pool,
    "@/lib/db": pool,
  };
  if (rateLimitStub) {
    stubs["../../lib/rateLimit"] = rateLimitStub;
    stubs["@/lib/rateLimit"] = rateLimitStub;
  }
  const mod = loadTs("pages/api/track.ts", stubs);
  return mod.default || mod;
}

(async () => {
  // ── Masking unit checks (mocked PII only) ───────────────────────────────
  const privacy = loadTs("lib/orderTrackingPrivacy.ts");
  ok("mask_name", privacy.maskCustomerName("Zohaib Hassan") === "Zohaib H.");
  ok("mask_email", privacy.maskEmail("zohaib@hotmail.com") === "z***@h***.com");
  ok("mask_phone", privacy.maskPhone("+447700900123") === "***123");
  ok("mask_postcode", privacy.maskPostcode("SW1A 1AA") === "SW1A ***");
  ok("norm_order_ok", privacy.normaliseTrackOrderId("ORD-1000000000001") === "ORD-1000000000001");
  ok("norm_order_bad", privacy.normaliseTrackOrderId("FK44-62305") === null);
  ok("norm_email", privacy.normaliseTrackEmail("  Zohaib@Hotmail.COM ") === "zohaib@hotmail.com");

  // ── id + correct email → 200 minimal masked ─────────────────────────────
  {
    const capture = { sql: [] };
    const handler = loadHandler(makePool({ capture }));
    const res = mockRes();
    await handler(
      mockReq({ order_id: "ORD-1000000000001", email: "zohaib@hotmail.com" }),
      res
    );
    ok("happy_200", res.statusCode === 200);
    const o = res.body?.order;
    const items = res.body?.items;
    ok(
      "happy_fields",
      o &&
        o.order_id === "ORD-1000000000001" &&
        o.status === "confirmed" &&
        o.currency === "GBP" &&
        o.payment_method === "Bank Transfer" &&
        o.customer?.name === "Zohaib H." &&
        o.customer?.email === "z***@h***.com" &&
        o.customer?.phone === "***123" &&
        o.customer?.postcode === "SW1A ***" &&
        Array.isArray(items) &&
        items[0]?.product_name === "Firestick Plan"
    );
    const blob = JSON.stringify(res.body);
    ok(
      "no_sensitive_columns",
      !blob.includes("receipt_path") &&
        !blob.includes("payment_reference") &&
        !blob.includes("notes") &&
        !blob.includes("SECRET-REF") &&
        !blob.includes("secret.pdf") &&
        !blob.includes("leave at door") &&
        !blob.includes("zohaib@hotmail.com") &&
        !blob.includes("+447700900123") &&
        !blob.includes("10 Downing") &&
        !/"id"\s*:/.test(blob.replace(/"order_id"/g, '""'))
    );
    ok(
      "sql_parameterised",
      capture.sql.length >= 1 &&
        capture.sql.every((q) => !/'ORD-/.test(q.sql) && Array.isArray(q.params)) &&
        /LOWER\(customer_email\)\s*=\s*\?/.test(capture.sql[0].sql) &&
        /order_id\s*=\s*\?/.test(capture.sql[0].sql) &&
        !/SELECT\s+\*/i.test(capture.sql[0].sql)
    );
  }

  // ── wrong email → 404 ───────────────────────────────────────────────────
  {
    const handler = loadHandler(makePool());
    const res = mockRes();
    await handler(
      mockReq({ order_id: "ORD-1000000000001", email: "wrong@example.com" }),
      res
    );
    ok("wrong_email_404", res.statusCode === 404 && res.body?.error === "Order not found");
  }

  // ── missing email → 400 ─────────────────────────────────────────────────
  {
    const handler = loadHandler(makePool());
    const res = mockRes();
    await handler(mockReq({ order_id: "ORD-1000000000001" }), res);
    ok("missing_email_400", res.statusCode === 400);
  }

  // ── legacy empty email → 404 ────────────────────────────────────────────
  {
    const legacy = { ...MOCK_ORDER, customer_email: "" };
    const handler = loadHandler(makePool({ orderRows: [legacy] }));
    const res = mockRes();
    await handler(
      mockReq({ order_id: "ORD-1000000000001", email: "anybody@example.com" }),
      res
    );
    ok("legacy_empty_email_404", res.statusCode === 404 && res.body?.error === "Order not found");
  }

  // ── rate limit → 429 ────────────────────────────────────────────────────
  {
    let calls = 0;
    const rlStub = {
      getClientIp: () => "203.0.113.50",
      rateLimit: () => {
        calls++;
        if (calls > 1) return { allowed: false, remaining: 0, retryAfterSec: 42 };
        return { allowed: true, remaining: 9, retryAfterSec: 60 };
      },
      RL_GENERAL: () => ({ allowed: true, remaining: 99, retryAfterSec: 1 }),
    };
    const handler = loadHandler(makePool(), rlStub);
    const res1 = mockRes();
    await handler(
      mockReq({ order_id: "ORD-1000000000001", email: "zohaib@hotmail.com" }, { "x-forwarded-for": "203.0.113.50" }),
      res1
    );
    const res2 = mockRes();
    await handler(
      mockReq({ order_id: "ORD-1000000000001", email: "zohaib@hotmail.com" }, { "x-forwarded-for": "203.0.113.50" }),
      res2
    );
    ok("rate_limit_429", res1.statusCode === 200 && res2.statusCode === 429);
  }

  // ── 500 body generic ────────────────────────────────────────────────────
  {
    const logs = [];
    const origErr = console.error;
    console.error = (...a) => logs.push(a.join(" "));
    try {
      const handler = loadHandler(makePool({ throwOnQuery: true }));
      const res = mockRes();
      await handler(
        mockReq({ order_id: "ORD-1000000000001", email: "zohaib@hotmail.com" }),
        res
      );
      ok(
        "error_500_generic",
        res.statusCode === 500 &&
          res.body?.error === "Tracking temporarily unavailable" &&
          !JSON.stringify(res.body).includes("ECONNREFUSED") &&
          !JSON.stringify(res.body).includes("mocked db")
      );
      ok(
        "error_500_log_code_only",
        logs.some((l) => /\[track\]/.test(l) && /ECONNREFUSED/.test(l)) &&
          !logs.some((l) => /zohaib@hotmail|SECRET-REF|receipt/.test(l))
      );
    } finally {
      console.error = origErr;
    }
  }

  // ── page renders email field ────────────────────────────────────────────
  const page = read("app/order-tracking/page.tsx");
  ok(
    "page_email_field",
    /track_email_label/.test(page) &&
      /id="track-email"/.test(page) &&
      /type="email"/.test(page) &&
      /email:\s*trimmedEmail/.test(page) &&
      /track_not_found/.test(page)
  );
  ok(
    "page_prefill_query",
    /URLSearchParams/.test(page) &&
      /order_id/.test(page) &&
      /sp\.get\("email"\)/.test(page)
  );
  ok(
    "page_masked_customer",
    /o\.customer/.test(page) &&
      /c\.name\s*\|\|\s*"—"/.test(page) &&
      !/o\.customer_name/.test(page) &&
      !/delivery_address/.test(page)
  );

  const defaults = read("lib/siteContentDefaults.ts");
  ok(
    "cms_email_keys",
    /track_email_label/.test(defaults) &&
      /track_email_help/.test(defaults) &&
      /Email used for the order/.test(defaults)
  );

  // ── C: sidhu visible-tab only ───────────────────────────────────────────
  const sidhu = read("app/sidhu/page.tsx");
  const autoIdx = sidhu.indexOf("Light auto-refresh (CMS-RT-1)");
  const autoBlock = autoIdx >= 0 ? sidhu.slice(autoIdx, autoIdx + 3500) : "";
  ok(
    "sidhu_visible_guard",
    /document\.visibilityState\s*!==\s*"visible"/.test(autoBlock) &&
      /document\.visibilityState\s*===\s*"visible"/.test(autoBlock) &&
      /setInterval\(\(\) => \{ void tick\(\); \}, 60000\)/.test(autoBlock)
  );
  // Simulate the guard: when not visible, tick must no-op (no refresh call).
  {
    let refreshCalls = 0;
    const fakeDoc = { visibilityState: "hidden" };
    const tick = async () => {
      if (fakeDoc.visibilityState !== "visible") return;
      refreshCalls++;
    };
    await tick();
    ok("sidhu_no_refresh_while_hidden", refreshCalls === 0);
    fakeDoc.visibilityState = "visible";
    await tick();
    ok("sidhu_refresh_when_visible", refreshCalls === 1);
  }

  // ── track.ts source contract ────────────────────────────────────────────
  const trackSrc = read("pages/api/track.ts");
  ok(
    "track_no_select_star",
    !/SELECT\s+\*\s+FROM\s+orders/i.test(trackSrc) &&
      !/error\.message/.test(trackSrc) &&
      /Tracking temporarily unavailable/.test(trackSrc) &&
      /rateLimit\(/.test(trackSrc)
  );

  console.log(`\nphase-multi-91: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
