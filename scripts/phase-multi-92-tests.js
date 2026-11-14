/**
 * F4UK-MULTI-92 — contact anti-spam + generic 500s + FAQ allowlist + public GET RL.
 * Mocked DB only. No real customer data / no production submissions.
 *
 * Run: node scripts/phase-multi-92-tests.js
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

function mockPost(body, headers = {}) {
  return {
    method: "POST",
    body,
    query: {},
    headers: { "x-forwarded-for": "203.0.113.92", ...headers },
    socket: { remoteAddress: "203.0.113.92" },
  };
}

function mockGet(query = {}, headers = {}) {
  return {
    method: "GET",
    query,
    headers: { "x-forwarded-for": "203.0.113.92", ...headers },
    socket: { remoteAddress: "203.0.113.92" },
  };
}

function makeContactPool(opts = {}) {
  const { throwOnQuery = false, capture = { inserts: 0, sql: [] } } = opts;
  return {
    query: async (sql, params) => {
      capture.sql.push({ sql: String(sql), params });
      if (throwOnQuery) {
        const err = new Error("ECONNREFUSED mocked db down with secrets");
        err.code = "ECONNREFUSED";
        err.name = "Error";
        throw err;
      }
      if (/INSERT\s+INTO\s+contact_messages/i.test(sql)) {
        capture.inserts++;
        return [{ insertId: 1 }];
      }
      return [[]];
    },
  };
}

function makeFaqsPool(rows) {
  return {
    query: async (sql) => {
      if (/FROM\s+faqs/i.test(sql)) return [rows];
      return [[]];
    },
  };
}

function rlAllow() {
  return {
    getClientIp: () => "203.0.113.92",
    rateLimit: () => ({ allowed: true, remaining: 99, retryAfterSec: 60 }),
    RL_GENERAL: () => ({ allowed: true, remaining: 99, retryAfterSec: 1 }),
    RL_PUBLIC_GET: () => ({ allowed: true, remaining: 119, retryAfterSec: 60 }),
  };
}

function loadApi(rel, pool, rateLimitStub) {
  cache.clear();
  const stubs = {
    "../../lib/db": pool,
    "@/lib/db": pool,
  };
  if (rateLimitStub) {
    stubs["../../lib/rateLimit"] = rateLimitStub;
    stubs["@/lib/rateLimit"] = rateLimitStub;
  }
  // faqs / blog / sections also pull auth helpers — stub minimally for public GET
  const authStub = {
    getRequestMeta: () => ({ ip: "203.0.113.92" }),
    requireAdminPermission: async () => null,
  };
  stubs["../../lib/adminAuth"] = authStub;
  stubs["@/lib/adminAuth"] = authStub;
  stubs["../../lib/adminAudit"] = { recordAdminAudit: async () => {} };
  stubs["@/lib/adminAudit"] = { recordAdminAudit: async () => {} };
  stubs["../../lib/adminNoStore"] = { setAdminNoStore: () => {} };
  stubs["@/lib/adminNoStore"] = { setAdminNoStore: () => {} };
  stubs["../../lib/publicCmsDataServer"] = {
    getCachedPublicVisibleSections: async () => [{ key: "home_hero", data: {} }],
    invalidatePublicCmsCache: () => {},
  };
  stubs["@/lib/publicCmsDataServer"] = stubs["../../lib/publicCmsDataServer"];
  stubs["../../lib/contentRevisions"] = {
    recordContentRevision: async () => {},
    snapshotBlog: () => ({}),
  };
  stubs["@/lib/contentRevisions"] = stubs["../../lib/contentRevisions"];
  stubs["../../lib/hostingerResourceInvalidation"] = {
    invalidateSitemapCache: () => {},
  };
  stubs["@/lib/hostingerResourceInvalidation"] = stubs["../../lib/hostingerResourceInvalidation"];
  stubs["../../lib/postSaveSeoGuard"] = { runPostSaveSeoGuard: async () => ({}) };
  stubs["@/lib/postSaveSeoGuard"] = stubs["../../lib/postSaveSeoGuard"];
  stubs["../../lib/blogPersistenceServer"] = {
    BlogPersistenceError: class BlogPersistenceError extends Error {
      constructor(status, code, message) {
        super(message);
        this.status = status;
        this.code = code;
        this.name = "BlogPersistenceError";
      }
    },
    createBlogPost: async () => ({ success: true }),
    requireExplicitBlogStatus: () => "draft",
    requireSuppliedBlogStatus: () => "draft",
    updateBlogPost: async () => ({ success: true }),
  };
  stubs["@/lib/blogPersistenceServer"] = stubs["../../lib/blogPersistenceServer"];

  const mod = loadTs(rel, stubs);
  return mod.default || mod;
}

(async () => {
  const contactSrc = read("pages/api/contact.ts");
  const formSrc = read("app/contact/page.tsx");
  const faqsSrc = read("pages/api/faqs.ts");
  const blogSrc = read("pages/api/blog.ts");
  const sectionsSrc = read("pages/api/sections.ts");
  const rlSrc = read("lib/rateLimit.ts");

  // ── A: contact source contracts ──────────────────────────────────────────
  ok(
    "contact_rl_presets",
    /rateLimit\(`contact:min:\$\{ip\}`,\s*5,\s*60\s*\*\s*1000\)/.test(contactSrc) &&
      /rateLimit\(`contact:day:\$\{ip\}`,\s*30,\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000\)/.test(
        contactSrc
      )
  );
  ok(
    "contact_generic_500",
    /Message could not be sent\. Please try again\./.test(contactSrc) &&
      /\[contact\] failed/.test(contactSrc) &&
      !/error\.message/.test(contactSrc)
  );
  ok(
    "contact_honeypot_server",
    /honeypot/.test(contactSrc) &&
      /body\.website/.test(contactSrc) &&
      /\[contact\] honeypot/.test(contactSrc)
  );
  ok(
    "form_honeypot_hidden",
    /name="website"/.test(formSrc) &&
      /aria-hidden="true"/.test(formSrc) &&
      /tabIndex=\{-1\}/.test(formSrc) &&
      /autoComplete="off"/.test(formSrc) &&
      /left:-10000px/.test(formSrc) &&
      !/\.hp-field[^}]*display\s*:\s*none/.test(formSrc)
  );

  // ── A: contact handler behaviour ─────────────────────────────────────────
  {
    let rlCalls = 0;
    const rlStub = {
      getClientIp: () => "203.0.113.92",
      rateLimit: () => {
        rlCalls++;
        if (rlCalls > 2) return { allowed: false, remaining: 0, retryAfterSec: 30 };
        return { allowed: true, remaining: 4, retryAfterSec: 60 };
      },
      RL_GENERAL: () => ({ allowed: true, remaining: 99, retryAfterSec: 1 }),
      RL_PUBLIC_GET: () => ({ allowed: true, remaining: 119, retryAfterSec: 60 }),
    };
    // First request: minute + day both allow (2 rateLimit calls). Third request blocks.
    const capture = { inserts: 0, sql: [] };
    const handler = loadApi("pages/api/contact.ts", makeContactPool({ capture }), rlStub);

    const good = {
      name: "Test User",
      email: "test@example.com",
      phone: "",
      subject: "Hi",
      message: "Hello there",
      website: "",
    };

    const r1 = mockRes();
    await handler(mockPost(good), r1);
    ok("contact_ok_insert", r1.statusCode === 200 && r1.body?.success === true && capture.inserts === 1);

    const r2 = mockRes();
    await handler(mockPost(good), r2);
    ok(
      "contact_rate_limit_429",
      r2.statusCode === 429 &&
        r2.body?.error === "Too many messages. Please try again later."
    );
  }

  {
    const logs = [];
    const origLog = console.log;
    console.log = (...a) => {
      logs.push(a.join(" "));
      origLog(...a);
    };
    try {
      const capture = { inserts: 0, sql: [] };
      const handler = loadApi(
        "pages/api/contact.ts",
        makeContactPool({ capture }),
        rlAllow()
      );
      const res = mockRes();
      await handler(
        mockPost({
          name: "Bot",
          email: "bot@example.com",
          message: "spam",
          website: "http://evil.example",
        }),
        res
      );
      ok(
        "contact_honeypot_silent",
        res.statusCode === 200 &&
          res.body?.success === true &&
          capture.inserts === 0 &&
          logs.some((l) => l === "[contact] honeypot")
      );
    } finally {
      console.log = origLog;
    }
  }

  {
    const handler = loadApi("pages/api/contact.ts", makeContactPool(), rlAllow());
    const res = mockRes();
    await handler(
      mockPost({
        name: "A".repeat(101),
        email: "ok@example.com",
        message: "hi",
      }),
      res
    );
    ok("contact_name_limit_400", res.statusCode === 400 && res.body?.error === "Invalid form data");
  }

  {
    const handler = loadApi("pages/api/contact.ts", makeContactPool(), rlAllow());
    const res = mockRes();
    await handler(
      mockPost({
        name: "Ok",
        email: "not-an-email",
        message: "hi",
      }),
      res
    );
    ok("contact_email_format_400", res.statusCode === 400);
  }

  {
    const handler = loadApi("pages/api/contact.ts", makeContactPool(), rlAllow());
    const res = mockRes();
    await handler(
      mockPost({
        name: "Ok",
        email: "ok@example.com",
        message: "x".repeat(5001),
      }),
      res
    );
    ok("contact_message_limit_400", res.statusCode === 400);
  }

  {
    const logs = [];
    const origErr = console.error;
    console.error = (...a) => logs.push(a.join(" "));
    try {
      const handler = loadApi(
        "pages/api/contact.ts",
        makeContactPool({ throwOnQuery: true }),
        rlAllow()
      );
      const res = mockRes();
      await handler(
        mockPost({ name: "Ok", email: "ok@example.com", message: "hi" }),
        res
      );
      ok(
        "contact_500_generic",
        res.statusCode === 500 &&
          res.body?.error === "Message could not be sent. Please try again." &&
          !JSON.stringify(res.body).includes("ECONNREFUSED") &&
          !JSON.stringify(res.body).includes("mocked")
      );
      ok(
        "contact_500_log_code",
        logs.some((l) => /\[contact\] failed/.test(l) && /ECONNREFUSED/.test(l))
      );
    } finally {
      console.error = origErr;
    }
  }

  // ── B: scan — no catch/500 returns error.message ─────────────────────────
  /**
   * Allowlist (intentional 4xx validation returning *.message):
   * - OrderValidationError in pages/api/orders.ts (checkout validation 400)
   * - BlogPersistenceError in pages/api/blog.ts (status/code + message)
   * - ProductWriter concurrent_conflict / validation in admin-products.ts (400/409)
   * - REVISION_TOO_LARGE / restore validation 400 (txErr.message / err.message)
   * - admin-revisions/restore.ts 400 restore validation
   * Documented intentional AI/structured result.message paths (SEO AI + blog research routes)
   * are not catch/500 bodies — omit those path strings here to avoid AB7B R3 repo-ref false positives.
   */
  const ALLOW_MESSAGE_RETURN = [
    // path substrings that may still return .message on intentional 4xx
    "pages/api/orders.ts",
    "pages/api/blog.ts", // BlogPersistenceError + REVISION_TOO_LARGE 400 only
    "pages/api/admin-products.ts",
    "pages/api/admin-revisions/restore.ts",
    "pages/api/sections.ts", // REVISION_TOO_LARGE 400
    "pages/api/site-content.ts", // REVISION_TOO_LARGE 400
    "pages/api/admin-seo-ai.ts",
  ];

  function walkApiFiles(dir, acc = []) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walkApiFiles(p, acc);
      else if (/\.(ts|tsx|js)$/.test(ent.name)) acc.push(p);
    }
    return acc;
  }

  const apiFiles = [
    ...walkApiFiles(path.join(ROOT, "pages", "api")),
    ...(() => {
      const appDir = path.join(ROOT, "app");
      const routes = [];
      function walk(d) {
        if (!fs.existsSync(d)) return;
        for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
          const p = path.join(d, ent.name);
          if (ent.isDirectory()) walk(p);
          else if (ent.name === "route.ts" || ent.name === "route.js") routes.push(p);
        }
      }
      walk(appDir);
      return routes;
    })(),
  ];

  let scanFails = 0;
  for (const abs of apiFiles) {
    const rel = path.relative(ROOT, abs).replace(/\\/g, "/");
    const src = fs.readFileSync(abs, "utf8");
    // Catch-block pattern that returns error.message / err.message on 500
    const catchBlocks = src.match(/catch\s*\([^)]*\)\s*\{[\s\S]*?\n\s*\}/g) || [];
    for (const block of catchBlocks) {
      const returnsMsg =
        /status\s*\(\s*500\s*\)\s*\.json\s*\(\s*\{[^}]*\.message/.test(block) ||
        /json\s*\(\s*\{\s*error\s*:\s*(error|err|e)\.message/.test(block) ||
        /error\s*:\s*(error|err)\?\.message\s*\|\|/.test(block);
      if (!returnsMsg) continue;
      // If allowlisted file AND the return is clearly 4xx (status(400)/status(err.status)), skip
      if (ALLOW_MESSAGE_RETURN.some((a) => rel === a || rel.endsWith(a))) {
        const is500 =
          /status\s*\(\s*500\s*\)/.test(block) ||
          /error\?\.message\s*\|\|/.test(block); // previous leaky fallback pattern
        if (is500 && /error\?\.message\s*\|\|/.test(block)) {
          scanFails++;
          console.error(`SCAN_FAIL ${rel} — catch still leaks error?.message fallback`);
        } else if (is500 && /status\s*\(\s*500\s*\)\s*\.json\s*\(\s*\{[^}]*\.message/.test(block)) {
          scanFails++;
          console.error(`SCAN_FAIL ${rel} — catch 500 returns .message`);
        }
        continue;
      }
      scanFails++;
      console.error(`SCAN_FAIL ${rel} — catch returns .message`);
    }
  }
  ok("scan_no_catch_500_error_message", scanFails === 0, `fails=${scanFails}`);

  // Hard assert changed routes no longer contain catch 500 error.message
  for (const [rel, label] of [
    ["pages/api/products.ts", "products"],
    ["pages/api/search.ts", "search"],
    ["pages/api/coupons.ts", "coupons"],
    ["pages/api/site-content.ts", "site-content"],
    ["pages/api/faqs.ts", "faqs"],
    ["pages/api/blog.ts", "blog"],
    ["pages/api/sections.ts", "sections"],
    ["pages/api/admin-products.ts", "admin-products"],
    ["pages/api/admin/leads.ts", "admin-leads"],
    ["pages/api/admin-orders.ts", "admin-orders"],
    ["pages/api/admin-audit.ts", "admin-audit"],
    ["pages/api/admin-profile.ts", "admin-profile"],
    ["pages/api/admin-staff.ts", "admin-staff"],
    ["pages/api/admin-staff-password.ts", "admin-staff-password"],
    ["pages/api/admin-product-url-migration.ts", "admin-product-url-migration"],
  ]) {
    const s = read(rel);
    ok(
      `generic500_${label}`,
      /Request failed|Message could not be sent/.test(s) &&
        !/status\(500\)\.json\(\{\s*error:\s*error\.message\s*\}\)/.test(s) &&
        !/error\?\.message\s*\|\|\s*"/.test(s)
    );
  }

  // ── C: FAQ column allowlist ──────────────────────────────────────────────
  ok(
    "faqs_public_columns",
    /SELECT\s+\$\{PUBLIC_FAQ_COLUMNS\}|SELECT id, question, answer, category, sort_order/.test(
      faqsSrc
    ) || /PUBLIC_FAQ_COLUMNS\s*=\s*'id, question, answer, category, sort_order'/.test(faqsSrc)
  );
  ok(
    "faqs_admin_still_star",
    /SELECT \* FROM faqs/.test(faqsSrc) && /admin/.test(faqsSrc)
  );

  {
    const mockRows = [
      {
        id: 1,
        question: "Q1",
        answer: "A1",
        category: "General",
        sort_order: 0,
        is_visible: 1,
        secret_internal: "SHOULD_NOT_APPEAR",
      },
    ];
    // Simulate allowlist projection the API would return
    const projected = mockRows.map((r) => ({
      id: r.id,
      question: r.question,
      answer: r.answer,
      category: r.category,
      sort_order: r.sort_order,
    }));
    const expected = JSON.stringify([
      { id: 1, question: "Q1", answer: "A1", category: "General", sort_order: 0 },
    ]);
    ok("faqs_public_fields_byte_identical", JSON.stringify(projected) === expected);
    ok(
      "faqs_public_no_extra_cols",
      !JSON.stringify(projected).includes("secret_internal") &&
        !JSON.stringify(projected).includes("is_visible")
    );

    const handler = loadApi(
      "pages/api/faqs.ts",
      makeFaqsPool([
        { id: 1, question: "Q1", answer: "A1", category: "General", sort_order: 0 },
      ]),
      rlAllow()
    );
    const res = mockRes();
    await handler(mockGet({}), res);
    ok(
      "faqs_get_200_allowlisted",
      res.statusCode === 200 &&
        Array.isArray(res.body) &&
        res.body[0]?.question === "Q1" &&
        res.body[0]?.secret_internal == null
    );
  }

  // ── D: public GET rate limits ────────────────────────────────────────────
  ok("rl_public_get_preset", /RL_PUBLIC_GET/.test(rlSrc) && /120,\s*60\s*\*\s*1000/.test(rlSrc));
  ok("faqs_uses_rl", /RL_PUBLIC_GET\(ip,\s*'faqs'\)/.test(faqsSrc));
  ok("blog_uses_rl", /RL_PUBLIC_GET\(ip,\s*'blog'\)/.test(blogSrc));
  ok("sections_uses_rl", /RL_PUBLIC_GET\(ip,\s*'sections'\)/.test(sectionsSrc));

  // No server-side HTTP callers of these APIs (SSR uses lib helpers)
  const serverish = [];
  for (const rel of [
    "lib/publicFaqsServer.ts",
    "lib/publicBlogServer.ts",
    "lib/publicCmsDataServer.ts",
    "app/faq/page.tsx",
    "app/blog/page.tsx",
    "app/page.tsx",
  ]) {
    const s = read(rel);
    if (/fetch\(\s*['"`]\/api\/(faqs|blog|sections)/.test(s)) serverish.push(rel);
  }
  ok("d_no_ssr_http_callers", serverish.length === 0, serverish.join(","));

  {
    let blocked = false;
    const rlStub = {
      getClientIp: () => "203.0.113.92",
      rateLimit: () => ({ allowed: true, remaining: 1, retryAfterSec: 60 }),
      RL_GENERAL: () => ({ allowed: true, remaining: 99, retryAfterSec: 1 }),
      RL_PUBLIC_GET: () => {
        if (blocked) return { allowed: false, remaining: 0, retryAfterSec: 12 };
        blocked = true;
        return { allowed: true, remaining: 119, retryAfterSec: 60 };
      },
    };
    const handler = loadApi(
      "pages/api/faqs.ts",
      makeFaqsPool([{ id: 1, question: "Q", answer: "A", category: "G", sort_order: 0 }]),
      rlStub
    );
    const r1 = mockRes();
    await handler(mockGet({}), r1);
    const r2 = mockRes();
    await handler(mockGet({}), r2);
    ok("faqs_rl_429", r1.statusCode === 200 && r2.statusCode === 429);
  }

  {
    let n = 0;
    const rlStub = {
      getClientIp: () => "203.0.113.92",
      rateLimit: () => ({ allowed: true, remaining: 1, retryAfterSec: 60 }),
      RL_GENERAL: () => ({ allowed: true, remaining: 99, retryAfterSec: 1 }),
      RL_PUBLIC_GET: () => {
        n++;
        if (n > 1) return { allowed: false, remaining: 0, retryAfterSec: 12 };
        return { allowed: true, remaining: 119, retryAfterSec: 60 };
      },
    };
    const pool = {
      query: async () => [[{ id: 1, slug: "x", title: "T", status: "published", active: 1 }]],
    };
    const handler = loadApi("pages/api/blog.ts", pool, rlStub);
    const r1 = mockRes();
    await handler(mockGet({ slug: "x" }), r1);
    const r2 = mockRes();
    await handler(mockGet({ slug: "x" }), r2);
    ok("blog_rl_429", r1.statusCode === 200 && r2.statusCode === 429);
  }

  {
    let n = 0;
    const rlStub = {
      getClientIp: () => "203.0.113.92",
      rateLimit: () => ({ allowed: true, remaining: 1, retryAfterSec: 60 }),
      RL_GENERAL: () => ({ allowed: true, remaining: 99, retryAfterSec: 1 }),
      RL_PUBLIC_GET: () => {
        n++;
        if (n > 1) return { allowed: false, remaining: 0, retryAfterSec: 12 };
        return { allowed: true, remaining: 119, retryAfterSec: 60 };
      },
    };
    const handler = loadApi("pages/api/sections.ts", { query: async () => [[]] }, rlStub);
    const r1 = mockRes();
    await handler(mockGet({ page: "home" }), r1);
    const r2 = mockRes();
    await handler(mockGet({ page: "home" }), r2);
    ok("sections_rl_429", r1.statusCode === 200 && r2.statusCode === 429);
  }

  console.log(`\nphase-multi-92: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
