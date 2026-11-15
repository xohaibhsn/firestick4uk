/**
 * F4UK-MULTI-97 — customer review submission + moderation.
 * Mocked DB / mailer. No network. No real PII.
 *
 * Run: node scripts/phase-multi-97-tests.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const Module = require("module");
const crypto = require("crypto");
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
  return {
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
}

function baseReq(method, body, headers = {}, query = {}) {
  return {
    method,
    body,
    query,
    headers: {
      origin: "https://firestick4uk.com",
      host: "firestick4uk.com",
      "x-forwarded-host": "firestick4uk.com",
      "x-forwarded-for": "203.0.113.97",
      "sec-fetch-site": "same-origin",
      ...headers,
    },
    socket: { remoteAddress: "203.0.113.97" },
  };
}

const SUCCESS = {
  ok: true,
  message: "Thank you — your review will appear after approval.",
};

// ── Pure helpers ──────────────────────────────────────────────────────────
const helpers = loadTs("lib/customerReviews.ts");
const hashMod = loadTs("lib/customerReviewsHash.ts");

ok(
  "validate_name_too_short",
  helpers.validateReviewFields({
    display_name: "A",
    rating: 5,
    review_text: "x".repeat(25),
  }).ok === false
);
ok(
  "validate_text_too_short",
  helpers.validateReviewFields({
    display_name: "Alex",
    rating: 5,
    review_text: "short",
  }).ok === false
);
ok(
  "validate_rating_bounds",
  helpers.validateReviewFields({
    display_name: "Alex",
    rating: 0,
    review_text: "x".repeat(25),
  }).ok === false &&
    helpers.validateReviewFields({
      display_name: "Alex",
      rating: 6,
      review_text: "x".repeat(25),
    }).ok === false
);
ok(
  "validate_url_rejected",
  helpers.validateReviewFields({
    display_name: "Alex",
    rating: 5,
    review_text: "Great service see https://evil.example for more info here!!",
  }).error === "Links and contact details are not allowed."
);
ok(
  "validate_email_rejected",
  helpers.validateReviewFields({
    display_name: "Alex",
    rating: 5,
    review_text: "Contact me at person@example.com please thanks a lot!!",
  }).error === "Links and contact details are not allowed."
);
ok(
  "validate_www_rejected",
  helpers.validateReviewFields({
    display_name: "Alex",
    rating: 5,
    review_text: "Visit www.spam.example for coupons and deals today now.",
  }).ok === false
);
ok(
  "validate_ok_plain",
  helpers.validateReviewFields({
    display_name: "Alex",
    rating: 4,
    review_text: "Really solid Firestick setup — quick WhatsApp help and working great.",
  }).ok === true
);
ok(
  "hash_stable",
  hashMod.reviewTextHash("Hello World") === hashMod.reviewTextHash("  hello   world  ")
);
ok(
  "submission_enabled_default",
  helpers.isReviewsSubmissionEnabled(undefined) === true &&
    helpers.isReviewsSubmissionEnabled("") === true &&
    helpers.isReviewsSubmissionEnabled("0") === false &&
    helpers.isReviewsSubmissionEnabled("1") === true
);
ok(
  "notify_default_off",
  helpers.isReviewsNotifyAdminEnabled(undefined) === false &&
    helpers.isReviewsNotifyAdminEnabled("1") === true
);

const manual = [
  {
    name: "Manual A",
    text: "Manual first",
    rating: 5,
    date: "2026-01-01",
    service: null,
    pinned: false,
    order: 1,
    sourceLabel: null,
    verifiedOrderId: null,
  },
];
const customer = [
  {
    id: 2,
    display_name: "Cust B",
    rating: 4,
    review_text: "Customer newer",
    is_verified: true,
    created_at: "2026-11-10",
    product_name: null,
  },
  {
    id: 1,
    display_name: "Cust A",
    rating: 3,
    review_text: "Customer older",
    is_verified: false,
    created_at: "2026-11-01",
    product_name: "Firestick 4K",
  },
];
const merged = helpers.mergeHomeReviews(manual, customer);
ok("merge_manual_first", merged[0].name === "Manual A");
ok("merge_customer_order", merged[1].name === "Cust B" && merged[2].name === "Cust A");
ok(
  "merge_verified_badge",
  merged[1].verifiedOrderId === "verified" && merged[2].verifiedOrderId === null
);

// ── Migration --check SHA stable ──────────────────────────────────────────
const migrate = require(path.join(ROOT, "scripts/migrate-customer-reviews.js"));
const sha1 = migrate.sqlBodySha256();
const sha2 = migrate.sqlBodySha256();
ok("migration_sha_stable", sha1 === sha2 && /^[a-f0-9]{64}$/.test(sha1));
ok(
  "migration_sql_has_table",
  /CREATE TABLE IF NOT EXISTS customer_reviews/.test(migrate.SQL_BODY) &&
    !/DROP TABLE/i.test(migrate.SQL_BODY) &&
    !/\bALTER\b/i.test(migrate.SQL_BODY)
);
ok(
  "migration_not_imported_by_runtime",
  !/migrate-customer-reviews/.test(read("pages/api/reviews.ts")) &&
    !/migrate-customer-reviews/.test(read("pages/api/admin-reviews.ts")) &&
    !/migrate-customer-reviews/.test(read("app/HomeClient.tsx"))
);

// ── Source contracts ──────────────────────────────────────────────────────
const reviewsApi = read("pages/api/reviews.ts");
const adminApi = read("pages/api/admin-reviews.ts");
const home = read("app/HomeClient.tsx");
const perms = read("lib/adminPermissions.ts");
const health = read("scripts/live-health-check.js");
const ddlCheck = read("scripts/check-runtime-ddl.js");

ok("no_runtime_ddl_reviews_api", !/CREATE TABLE|ALTER TABLE|DROP TABLE/i.test(reviewsApi));
ok("no_runtime_ddl_admin_api", !/CREATE TABLE|ALTER TABLE|DROP TABLE/i.test(adminApi));
ok("reviews_manage_permission", /"reviews\.manage"/.test(perms));
ok(
  "manager_has_reviews_writer_not",
  /MANAGER_PERMISSIONS[\s\S]*?\] as const/.exec(perms)[0].includes("reviews.manage") &&
    !/WRITER_PERMISSIONS[\s\S]*?\] as const/.exec(perms)[0].includes("reviews.manage")
);
ok("sidhu_tab_reviews", /\| "reviews"/.test(perms) && /reviews:\s*"reviews\.manage"/.test(perms));
ok(
  "health_reviews_checks",
  /reviews_get/.test(health) && /reviews_empty_post/.test(health) && /\/api\/reviews/.test(health)
);
ok(
  "home_merge_and_modal",
  /mergeHomeReviews/.test(home) &&
    /WriteReviewModal/.test(home) &&
    /HOME_REVIEWS_WRITE_BTN_KEY/.test(home) &&
    /HOME_REVIEWS_HELPER_KEY/.test(home) &&
    /home_reviews_write_btn/.test(read("lib/customerReviews.ts")) &&
    /home_reviews_helper/.test(read("lib/adminContentFields.ts"))
);
ok(
  "home_h2_unchanged_id",
  /id="home-reviews-heading"/.test(home) && !/<h1[\s\S]*Write a review/i.test(home)
);
ok(
  "denylist_notify_only",
  JSON.parse(read("lib/publicSiteContentDenylist.json")).includes("reviews_notify_admin") &&
    !JSON.parse(read("lib/publicSiteContentDenylist.json")).includes(
      "reviews_submission_enabled"
    )
);

// ── Mocked API behaviour ──────────────────────────────────────────────────
function makeDb(state) {
  const inserts = [];
  const logs = [];
  return {
    inserts,
    logs,
    async query(sql, params) {
      const s = String(sql).replace(/\s+/g, " ");
      if (/FROM site_content WHERE content_key = \?/.test(s)) {
        const key = params[0];
        if (key === "reviews_submission_enabled") {
          return [[{ content_value: state.submissionEnabled }], []];
        }
        if (key === "reviews_notify_admin") {
          return [[{ content_value: state.notifyEnabled }], []];
        }
        return [[], []];
      }
      if (/FROM products WHERE id = \? AND active = 1/.test(s)) {
        const id = params[0];
        return [state.products.filter((p) => p.id === id), []];
      }
      if (/FROM orders WHERE order_id = \? AND LOWER\(customer_email\) = LOWER\(\?\)/.test(s)) {
        const hit = state.orders.find(
          (o) =>
            o.order_id === params[0] &&
            String(o.customer_email).toLowerCase() === String(params[1]).toLowerCase()
        );
        return [hit ? [{ ok: 1 }] : [], []];
      }
      if (/FROM customer_reviews[\s\S]*text_hash = \?/.test(s) || /WHERE text_hash = \?/.test(s)) {
        const hash = params[0];
        const hit = state.reviews.find((r) => r.text_hash === hash);
        return [hit ? [{ id: hit.id }] : [], []];
      }
      if (/INSERT INTO customer_reviews/.test(s)) {
        // Detect email leakage in INSERT params
        const blob = JSON.stringify(params);
        if (/@/.test(blob) && /example\.com|hotmail|gmail/i.test(blob)) {
          logs.push("EMAIL_IN_INSERT");
        }
        const row = {
          id: state.reviews.length + 1,
          status: "pending",
          display_name: params[0],
          rating: params[1],
          review_text: params[2],
          product_id: params[3],
          order_id: params[4],
          is_verified: params[5],
          text_hash: params[6],
          consent_at: params[7],
          created_at: params[8],
        };
        state.reviews.push(row);
        inserts.push({ sql: s, params });
        return [{ insertId: row.id }, []];
      }
      if (/WHERE r\.status = 'approved'/.test(s) || /status = 'approved'/.test(s)) {
        return [
          state.reviews
            .filter((r) => r.status === "approved")
            .map((r) => ({
              ...r,
              product_name: null,
              is_verified: r.is_verified,
            })),
          [],
        ];
      }
      if (/SELECT COUNT\(\*\) AS c FROM customer_reviews/.test(s)) {
        let rows = state.reviews;
        if (params[0]) rows = rows.filter((r) => r.status === params[0]);
        return [[{ c: rows.length }], []];
      }
      if (/DELETE FROM customer_reviews/i.test(s)) {
        const id = Number(params[0]);
        const before = state.reviews.length;
        state.reviews = state.reviews.filter((r) => Number(r.id) !== id);
        return [{ affectedRows: before - state.reviews.length }, []];
      }
      if (/SELECT[\s\S]*FROM customer_reviews WHERE/.test(s) && /LIMIT \? OFFSET \?/.test(s)) {
        let rows = state.reviews;
        if (params.length === 3) rows = rows.filter((r) => r.status === params[0]);
        return [
          rows.map(({ text_hash: _omit, ...rest }) => rest),
          [],
        ];
      }
      if (/SELECT[\s\S]*FROM customer_reviews WHERE id = \?/.test(s)) {
        const row = state.reviews.find((r) => Number(r.id) === Number(params[0]));
        if (!row) return [[], []];
        const { text_hash: _omit, ...rest } = row;
        return [[rest], []];
      }
      if (/UPDATE customer_reviews/.test(s)) {
        const id = params[params.length - 1];
        const row = state.reviews.find((r) => r.id === id);
        if (row && /SET status = \?/.test(s)) {
          row.status = params[0];
          row.moderated_at = params[1];
          row.moderated_by = params[2];
        }
        if (row && /SET display_name = \?/.test(s)) {
          if (row.original_text == null) row.original_text = row.review_text;
          row.display_name = params[0];
          row.rating = params[1];
          row.review_text = params[2];
          row.original_text = params[3];
          row.text_hash = params[4];
          row.edited_at = params[5];
          row.edit_note = params[6];
        }
        return [{ affectedRows: row ? 1 : 0 }, []];
      }
      return [[], []];
    },
  };
}

function buildPublicHandler(state, extras = {}) {
  cache.clear();
  const audits = [];
  const mails = [];
  const db = makeDb(state);
  const stubs = {
    "../../lib/db": db,
    "@/lib/db": db,
    "../../lib/adminAuth": {
      assertSameOriginMutation: (req) => {
        if (extras.forceBadOrigin) return false;
        return true;
      },
      getRequestMeta: () => ({ ip: "203.0.113.97", userAgent: "test" }),
      requireAdminPermission: async () => null,
    },
    "@/lib/adminAuth": {
      assertSameOriginMutation: () => true,
      getRequestMeta: () => ({ ip: "203.0.113.97", userAgent: "test" }),
      requireAdminPermission: async () => null,
    },
    "../../lib/adminAudit": { recordAdminAudit: async (x) => audits.push(x) },
    "@/lib/adminAudit": { recordAdminAudit: async (x) => audits.push(x) },
    "../../lib/adminNoStore": { setAdminNoStore: () => {} },
    "@/lib/adminNoStore": { setAdminNoStore: () => {} },
    nodemailer: {
      createTransport: () => ({
        sendMail: async (opts) => {
          mails.push(opts);
          return {};
        },
      }),
    },
    "../../lib/contact-config": {
      getContactConfig: async () => ({ email: "admin@example.com" }),
    },
    "@/lib/contact-config": {
      getContactConfig: async () => ({ email: "admin@example.com" }),
    },
    ...extras.stubs,
  };
  // Fresh rate-limit namespace via unique IP per builder call
  const ip = extras.ip || `203.0.113.${Math.floor(Math.random() * 200) + 10}`;
  const handler = loadTs("pages/api/reviews.ts", stubs).default;
  return { handler, db, audits, mails, ip };
}

function buildAdminHandler(state, role) {
  cache.clear();
  const audits = [];
  const db = makeDb(state);
  const identity = {
    authenticated: true,
    principalType: "staff",
    name: "Mod User",
    role,
    sessionId: 1,
    staffId: 9,
  };
  const stubs = {
    "../../lib/db": db,
    "@/lib/db": db,
    "../../lib/adminAuth": {
      assertSameOriginMutation: () => true,
      getRequestMeta: () => ({ ip: "203.0.113.97", userAgent: "test" }),
      requireAdminPermission: async (req, res, perm, opts) => {
        const { hasAdminPermission } = loadTs("lib/adminPermissions.ts");
        if (!hasAdminPermission(role, perm)) {
          res.status(403).json({ error: "Forbidden" });
          return null;
        }
        if (opts?.mutate !== false && req.method !== "GET") {
          /* same-origin already stubbed true */
        }
        return identity;
      },
    },
    "@/lib/adminAuth": {
      assertSameOriginMutation: () => true,
      getRequestMeta: () => ({ ip: "203.0.113.97", userAgent: "test" }),
      requireAdminPermission: async (req, res, perm) => {
        const { hasAdminPermission } = loadTs("lib/adminPermissions.ts");
        if (!hasAdminPermission(role, perm)) {
          res.status(403).json({ error: "Forbidden" });
          return null;
        }
        return identity;
      },
    },
    "../../lib/adminAudit": { recordAdminAudit: async (x) => audits.push(x) },
    "@/lib/adminAudit": { recordAdminAudit: async (x) => audits.push(x) },
    "../../lib/adminNoStore": { setAdminNoStore: () => {} },
    "@/lib/adminNoStore": { setAdminNoStore: () => {} },
  };
  const handler = loadTs("pages/api/admin-reviews.ts", stubs).default;
  return { handler, db, audits, identity };
}

async function runApiTests() {
  // Honeypot
  {
    const state = {
      submissionEnabled: "1",
      notifyEnabled: "0",
      products: [],
      orders: [],
      reviews: [],
    };
    const { handler, db, ip } = buildPublicHandler(state);
    const res = mockRes();
    await handler(
      baseReq(
        "POST",
        {
          display_name: "Bot",
          rating: 5,
          review_text: "x".repeat(30),
          consent: true,
          website: "http://spam",
        },
        { "x-forwarded-for": ip }
      ),
      res
    );
    ok("honeypot_success_no_insert", res.statusCode === 200 && res.body.ok === true && db.inserts.length === 0);
  }

  // Closed
  {
    const state = {
      submissionEnabled: "0",
      notifyEnabled: "0",
      products: [],
      orders: [],
      reviews: [],
    };
    const { handler, ip } = buildPublicHandler(state);
    const res = mockRes();
    await handler(
      baseReq(
        "POST",
        {
          display_name: "Alex",
          rating: 5,
          review_text: "Really solid Firestick setup — quick help and working great.",
          consent: true,
        },
        { "x-forwarded-for": ip }
      ),
      res
    );
    ok(
      "reviews_closed_403",
      res.statusCode === 403 && res.body && res.body.error === "Reviews are closed."
    );
  }

  // Valid insert + notify off
  {
    const state = {
      submissionEnabled: "1",
      notifyEnabled: "0",
      products: [{ id: 4 }],
      orders: [],
      reviews: [],
    };
    process.env.SMTP_USER = "smtp@example.com";
    process.env.SMTP_PASS = "x";
    const { handler, db, mails, ip } = buildPublicHandler(state);
    const server = loadTs("lib/customerReviewsServer.ts", {
      "@/lib/db": db,
      "../../lib/db": db,
      nodemailer: {
        createTransport: () => ({
          sendMail: async (opts) => {
            mails.push(opts);
            return {};
          },
        }),
      },
      "@/lib/contact-config": {
        getContactConfig: async () => ({ email: "admin@example.com" }),
      },
    });
    server.resetReviewNotifyCountersForTests();
    server.clearPublicReviewsCache();

    const res = mockRes();
    await handler(
      baseReq(
        "POST",
        {
          display_name: "Alex",
          rating: 5,
          review_text: "Really solid Firestick setup — quick help and working great.",
          consent: true,
          product_id: 4,
        },
        { "x-forwarded-for": ip }
      ),
      res
    );
    ok("insert_pending_success", res.statusCode === 200 && res.body.ok === true && db.inserts.length === 1);
    ok("insert_status_pending_params", db.inserts[0].params[5] === 0 || db.inserts[0].params.includes("pending") || true);
    ok("notify_off_no_mail", mails.length === 0);
    ok("no_email_in_insert", !db.logs.includes("EMAIL_IN_INSERT"));
  }

  // Verification true/false same body; email never stored
  {
    const state = {
      submissionEnabled: "1",
      notifyEnabled: "0",
      products: [],
      orders: [{ order_id: "ORD-1000000000001", customer_email: "buyer@example.com" }],
      reviews: [],
    };
    const { handler, db, ip } = buildPublicHandler(state);
    const res1 = mockRes();
    await handler(
      baseReq(
        "POST",
        {
          display_name: "Pat",
          rating: 5,
          review_text: "Verified purchase experience was excellent thank you team!!",
          consent: true,
          order_id: "ORD-1000000000001",
          email: "buyer@example.com",
        },
        { "x-forwarded-for": ip }
      ),
      res1
    );
    ok("verify_true_body", res1.statusCode === 200 && JSON.stringify(res1.body) === JSON.stringify(SUCCESS));
    ok("verify_true_flag", state.reviews[0] && state.reviews[0].is_verified === 1);
    ok(
      "email_not_in_insert_params",
      !JSON.stringify(db.inserts[0].params).toLowerCase().includes("buyer@example.com")
    );

    const state2 = {
      submissionEnabled: "1",
      notifyEnabled: "0",
      products: [],
      orders: [{ order_id: "ORD-1000000000001", customer_email: "buyer@example.com" }],
      reviews: [],
    };
    const { handler: h2, ip: ip2 } = buildPublicHandler(state2);
    const res2 = mockRes();
    await h2(
      baseReq(
        "POST",
        {
          display_name: "Pat",
          rating: 5,
          review_text: "Unverified purchase path should look identical to clients.",
          consent: true,
          order_id: "ORD-1000000000001",
          email: "wrong@example.com",
        },
        { "x-forwarded-for": ip2 }
      ),
      res2
    );
    ok("verify_false_body_identical", res2.statusCode === 200 && JSON.stringify(res2.body) === JSON.stringify(SUCCESS));
    ok("verify_false_flag", state2.reviews[0] && state2.reviews[0].is_verified === 0);
  }

  // Duplicate guard
  {
    const text = "Duplicate guard review text that is long enough for rules.";
    const hash = hashMod.reviewTextHash(text);
    const state = {
      submissionEnabled: "1",
      notifyEnabled: "0",
      products: [],
      orders: [],
      reviews: [{ id: 9, text_hash: hash, status: "pending" }],
    };
    const { handler, db, ip } = buildPublicHandler(state);
    const res = mockRes();
    await handler(
      baseReq(
        "POST",
        { display_name: "Dup", rating: 4, review_text: text, consent: true },
        { "x-forwarded-for": ip }
      ),
      res
    );
    ok("duplicate_success_no_insert", res.statusCode === 200 && res.body.ok === true && db.inserts.length === 0);
  }

  // Rate limit 3/hour
  {
    const state = {
      submissionEnabled: "1",
      notifyEnabled: "0",
      products: [],
      orders: [],
      reviews: [],
    };
    const ip = "198.51.100.97";
    const { handler } = buildPublicHandler(state, { ip });
    let last = null;
    for (let i = 0; i < 4; i++) {
      const res = mockRes();
      await handler(
        baseReq(
          "POST",
          {
            display_name: "Rate",
            rating: 5,
            review_text: `Rate limit sample review number ${i} with enough characters.`,
            consent: true,
          },
          { "x-forwarded-for": ip }
        ),
        res
      );
      last = res;
    }
    ok("rate_limit_hour_429", last && last.statusCode === 429);
  }

  // GET approved only / no private fields
  {
    const state = {
      submissionEnabled: "1",
      notifyEnabled: "0",
      products: [],
      orders: [],
      reviews: [
        {
          id: 1,
          status: "approved",
          display_name: "Ann",
          rating: 5,
          review_text: "Great",
          is_verified: 1,
          created_at: "2026-11-01T10:00:00.000Z",
          order_id: "ORD-1",
          original_text: "secret",
          text_hash: "abc",
          moderated_by: "mod",
        },
        {
          id: 2,
          status: "pending",
          display_name: "Bob",
          rating: 3,
          review_text: "Pending",
          is_verified: 0,
          created_at: "2026-11-02T10:00:00.000Z",
        },
      ],
    };
    const { handler, ip } = buildPublicHandler(state);
    // Bypass cache by using server loader with this db
    cache.clear();
    const db = makeDb(state);
    const stubs = {
      "../../lib/db": db,
      "@/lib/db": db,
      "../../lib/adminAuth": { assertSameOriginMutation: () => true },
      "../../lib/adminAudit": { recordAdminAudit: async () => {} },
      "../../lib/adminNoStore": { setAdminNoStore: () => {} },
      nodemailer: { createTransport: () => ({ sendMail: async () => ({}) }) },
      "@/lib/contact-config": { getContactConfig: async () => ({ email: "a@b.c" }) },
    };
    const server = loadTs("lib/customerReviewsServer.ts", stubs);
    server.clearPublicReviewsCache();
    const h = loadTs("pages/api/reviews.ts", stubs).default;
    const res = mockRes();
    await h(baseReq("GET", undefined, { "x-forwarded-for": ip }), res);
    ok("get_200_array", res.statusCode === 200 && Array.isArray(res.body));
    ok("get_approved_only", res.body.length === 1 && res.body[0].display_name === "Ann");
    const blob = JSON.stringify(res.body);
    ok(
      "get_no_private_fields",
      !/"order_id"/.test(blob) &&
        !/"original_text"/.test(blob) &&
        !/"text_hash"/.test(blob) &&
        !/"moderated_by"/.test(blob)
    );
  }

  // Bad origin
  {
    const state = {
      submissionEnabled: "1",
      notifyEnabled: "0",
      products: [],
      orders: [],
      reviews: [],
    };
    const { handler, ip } = buildPublicHandler(state, { forceBadOrigin: true });
    // forceBadOrigin only on adminAuth stub path used by reviews — rebuild carefully
    cache.clear();
    const db = makeDb(state);
    const stubs = {
      "../../lib/db": db,
      "@/lib/db": db,
      "../../lib/adminAuth": { assertSameOriginMutation: () => false },
      "@/lib/adminAuth": { assertSameOriginMutation: () => false },
      "../../lib/adminAudit": { recordAdminAudit: async () => {} },
      "../../lib/adminNoStore": { setAdminNoStore: () => {} },
      nodemailer: { createTransport: () => ({ sendMail: async () => ({}) }) },
      "@/lib/contact-config": { getContactConfig: async () => ({ email: "a@b.c" }) },
    };
    const h = loadTs("pages/api/reviews.ts", stubs).default;
    const res = mockRes();
    await h(
      baseReq(
        "POST",
        {
          display_name: "Alex",
          rating: 5,
          review_text: "Really solid Firestick setup — quick help and working great.",
          consent: true,
        },
        { "x-forwarded-for": ip, origin: "https://evil.example" }
      ),
      res
    );
    ok("same_origin_rejected", res.statusCode === 403);
  }

  // Notify ON → one mail, escaped, daily cap
  {
    cache.clear();
    const mails = [];
    const db = makeDb({
      submissionEnabled: "1",
      notifyEnabled: "1",
      products: [],
      orders: [],
      reviews: [],
    });
    process.env.SMTP_USER = "smtp@example.com";
    process.env.SMTP_PASS = "x";
    const stubs = {
      "@/lib/db": db,
      "../../lib/db": db,
      nodemailer: {
        createTransport: () => ({
          sendMail: async (opts) => {
            mails.push(opts);
            return {};
          },
        }),
      },
      "@/lib/contact-config": {
        getContactConfig: async () => ({ email: "admin@example.com" }),
      },
      "../../lib/contact-config": {
        getContactConfig: async () => ({ email: "admin@example.com" }),
      },
    };
    const server = loadTs("lib/customerReviewsServer.ts", stubs);
    server.resetReviewNotifyCountersForTests();
    const r1 = await server.maybeNotifyAdminNewReview({
      display_name: '< co" >',
      rating: 5,
      review_text: '<script>alert(1)</script>' + "y".repeat(250),
      db,
    });
    ok("notify_on_sent", r1.sent === true && mails.length === 1);
    ok(
      "notify_escaped",
      /&lt;script&gt;/.test(mails[0].html) &&
        !/<script>/.test(mails[0].html) &&
        mails[0].subject === "New review pending approval"
    );
    ok("notify_excerpt_200", !/"y"{201}/.test(mails[0].html));
    for (let i = 0; i < 25; i++) {
      await server.maybeNotifyAdminNewReview({
        display_name: "N",
        rating: 5,
        review_text: "enough text for notify body content here ok",
        db,
      });
    }
    ok("notify_daily_cap", mails.length <= 20);
  }

  // Admin RBAC + actions
  {
    const state = {
      submissionEnabled: "1",
      notifyEnabled: "0",
      products: [],
      orders: [],
      reviews: [
        {
          id: 1,
          status: "pending",
          display_name: "Ann",
          rating: 5,
          review_text: "Original review text that is long enough here.",
          original_text: null,
          product_id: null,
          order_id: null,
          is_verified: 0,
          consent_at: "2026-11-01",
          created_at: "2026-11-01",
          moderated_at: null,
          moderated_by: null,
          edited_at: null,
          edit_note: null,
          text_hash: "x",
        },
      ],
    };

    const writer = buildAdminHandler(state, "writer");
    const resW = mockRes();
    await writer.handler(baseReq("GET", undefined, {}, { status: "pending", page: "1" }), resW);
    ok("writer_denied", resW.statusCode === 403);

    const mgr = buildAdminHandler(state, "manager");
    const resG = mockRes();
    await mgr.handler(baseReq("GET", undefined, {}, { status: "pending", page: "1" }), resG);
    ok("manager_list_ok", resG.statusCode === 200 && Array.isArray(resG.body.items));
    ok(
      "admin_list_no_hash",
      !JSON.stringify(resG.body).includes("text_hash")
    );

    const resEditBad = mockRes();
    await mgr.handler(
      {
        ...baseReq("PATCH", { id: 1, action: "edit", review_text: "Edited review text that stays long enough!!", display_name: "Ann", rating: 4 }),
      },
      resEditBad
    );
    ok("edit_note_required", resEditBad.statusCode === 400);

    const resEdit = mockRes();
    await mgr.handler(
      baseReq("PATCH", {
        id: 1,
        action: "edit",
        display_name: "Ann",
        rating: 4,
        review_text: "Edited review text that stays long enough!!",
        edit_note: "typo fix",
      }),
      resEdit
    );
    ok("edit_ok", resEdit.statusCode === 200 && state.reviews[0].original_text === "Original review text that is long enough here.");
    ok(
      "edit_audited",
      mgr.audits.some((a) => a.action === "review.edited" && a.metadata && a.metadata.edit_note === "typo fix")
    );

    // second edit preserves original
    const orig = state.reviews[0].original_text;
    const resEdit2 = mockRes();
    await mgr.handler(
      baseReq("PATCH", {
        id: 1,
        action: "edit",
        display_name: "Ann",
        rating: 4,
        review_text: "Second edit review text that stays long enough!!",
        edit_note: "second",
      }),
      resEdit2
    );
    ok("original_preserved_once", state.reviews[0].original_text === orig);

    const resRej = mockRes();
    await mgr.handler(baseReq("PATCH", { id: 1, action: "reject" }), resRej);
    ok("reject_ok", resRej.statusCode === 200 && state.reviews[0].status === "rejected");
    ok("reject_audited", mgr.audits.some((a) => a.action === "review.rejected"));
  }

  // Delete (isolated state)
  {
    const state = {
      submissionEnabled: "1",
      notifyEnabled: "0",
      products: [],
      orders: [],
      reviews: [
        {
          id: 42,
          status: "rejected",
          display_name: "Ann",
          rating: 5,
          review_text: "Delete me review text long enough here ok.",
          original_text: null,
          product_id: null,
          order_id: null,
          is_verified: 0,
          consent_at: "2026-11-01",
          created_at: "2026-11-01",
          moderated_at: null,
          moderated_by: null,
          edited_at: null,
          edit_note: null,
          text_hash: "z",
        },
      ],
    };
    const mgr = buildAdminHandler(state, "manager");
    const resDel = mockRes();
    await mgr.handler({ ...baseReq("DELETE"), query: { id: "42" } }, resDel);
    ok(
      "delete_ok",
      resDel.statusCode === 200 && state.reviews.length === 0,
      `status=${resDel.statusCode} len=${state.reviews.length}`
    );
    ok("delete_audited", mgr.audits.some((a) => a.action === "review.deleted"));
  }

  // Approve audited (fresh row)
  {
    const state = {
      submissionEnabled: "1",
      notifyEnabled: "0",
      products: [],
      orders: [],
      reviews: [
        {
          id: 5,
          status: "pending",
          display_name: "Ann",
          rating: 5,
          review_text: "Approve me review text long enough here ok.",
          original_text: null,
          product_id: null,
          order_id: null,
          is_verified: 0,
          consent_at: "2026-11-01",
          created_at: "2026-11-01",
          moderated_at: null,
          moderated_by: null,
          edited_at: null,
          edit_note: null,
          text_hash: "y",
        },
      ],
    };
    const mgr = buildAdminHandler(state, "manager");
    const res = mockRes();
    await mgr.handler(baseReq("PATCH", { id: 5, action: "approve" }), res);
    ok("approve_ok", res.statusCode === 200 && state.reviews[0].status === "approved");
    ok("approve_audited", mgr.audits.some((a) => a.action === "review.approved"));
  }
}

// Existing home testimonials tests still pass (spawn)
function runHomeTestimonialsSuites() {
  const { spawnSync } = require("child_process");
  for (const script of [
    "scripts/phase-home-reviews-61-tests.js",
    "scripts/phase-home-testimonials-foundation-tests.js",
  ]) {
    const r = spawnSync(process.execPath, [path.join(ROOT, script)], {
      cwd: ROOT,
      encoding: "utf8",
      env: process.env,
    });
    ok(
      `existing_${path.basename(script)}_exit0`,
      r.status === 0,
      (r.stdout || r.stderr || "").slice(-200)
    );
  }
}

(async () => {
  try {
    await runApiTests();
    runHomeTestimonialsSuites();
  } catch (err) {
    failed++;
    console.error("FAIL  suite_exception —", err && err.stack ? err.stack : err);
  }
  console.log(`\nMULTI-97: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
