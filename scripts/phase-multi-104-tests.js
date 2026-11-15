/**
 * F4UK-MULTI-104 — admin global search API, FIX regressions, flow-matrix contract smoke.
 * Static + loadTs with stubs only. No .env*, no real DB, no network.
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

const cache = new Map();
function loadTs(rel, stubs = {}) {
  const abs = path.join(ROOT, rel);
  // Do not cache when stubs are present — stub object identity matters (mocked pools).
  const hasStubs = Object.keys(stubs).length > 0;
  const key = abs + "::" + Object.keys(stubs).sort().join(",");
  if (!hasStubs && cache.has(key)) return cache.get(key);
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
    if (Object.prototype.hasOwnProperty.call(stubs, id)) return stubs[id];
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
  if (!hasStubs) cache.set(key, m.exports);
  return m.exports;
}

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    },
  };
}

function makePool(handlers) {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql: String(sql), params });
      for (const h of handlers) {
        if (h.match(String(sql), params || [])) {
          if (h.throw) throw h.throw;
          return h.result;
        }
      }
      throw new Error("Unexpected SQL: " + String(sql).slice(0, 120));
    },
  };
}

/** Slice of source starting at `marker` for `len` chars ("" if marker missing). */
function slice(src, marker, len = 1200) {
  const i = src.indexOf(marker);
  return i < 0 ? "" : src.slice(i, i + len);
}

// ---------------------------------------------------------------------------
// admin-search harness
// ---------------------------------------------------------------------------
const noStoreReal = loadTs("lib/adminNoStore.ts");

function loadSearchHandler({ pool, role = "super_admin", rl, admin } = {}) {
  const rlCalls = [];
  const adminCalls = [];
  const stubs = {
    "../../lib/db": { __esModule: true, default: pool },
    "../../lib/adminAuth": {
      requireAdmin: async (req, res, opts) => {
        adminCalls.push({ opts });
        if (admin === null) {
          res.status(401).json({ error: "Unauthorized" });
          return null;
        }
        return admin || { id: 1, username: "tester", role };
      },
    },
    "../../lib/adminNoStore": noStoreReal,
    "../../lib/rateLimit": {
      getClientIp: () => "203.0.113.9",
      RL_SEARCH: (ip) => {
        rlCalls.push(ip);
        return rl ? rl(ip) : { allowed: true, retryAfterSec: 0 };
      },
    },
  };
  const mod = loadTs("pages/api/admin-search.ts", stubs);
  return { handler: mod.default, rlCalls, adminCalls };
}

function sqlTable(sql) {
  const m = /FROM\s+(\w+)/i.exec(sql);
  return m ? m[1].toLowerCase() : "";
}

(async () => {
  // =========================================================================
  // A) Admin search API
  // =========================================================================
  console.log("\n# A) admin-search");
  const searchSrc = read("pages/api/admin-search.ts");

  // A1 source contracts
  ok("A1_setAdminNoStore", /setAdminNoStore\(res\)/.test(searchSrc));
  ok(
    "A1_requireAdmin_mutate_false",
    /requireAdmin\(\s*req\s*,\s*res\s*,\s*\{\s*mutate:\s*false\s*\}\s*\)/.test(searchSrc)
  );
  ok("A1_getClientIp", /getClientIp\(req\)/.test(searchSrc));
  ok("A1_RL_SEARCH", /RL_SEARCH\(ip\)/.test(searchSrc));
  ok("A1_429_retry_after", /Retry-After/.test(searchSrc) && /status\(429\)/.test(searchSrc));
  ok("A1_q_min_2", /Q_MIN\s*=\s*2\b/.test(searchSrc));
  ok("A1_q_max_80", /Q_MAX\s*=\s*80\b/.test(searchSrc));
  ok("A1_per_type_limit_6", /PER_TYPE_LIMIT\s*=\s*6\b/.test(searchSrc));
  ok(
    "A1_generic_500",
    /status\(500\)\.json\(\{\s*error:\s*"Request failed"\s*\}\)/.test(searchSrc)
  );
  ok("A1_no_error_message_leak", !/error\.message|error\?\.message|err\.message/.test(searchSrc));
  ok("A1_get_only", /req\.method\s*!==\s*"GET"/.test(searchSrc));
  const likeParamCount = (searchSrc.match(/LIKE \?/g) || []).length;
  ok("A1_parameterized_like", likeParamCount >= 8, `LIKE ? x${likeParamCount}`);
  ok(
    "A1_no_sql_concat_of_q",
    !/\$\{\s*(q|like|req\.query)/.test(searchSrc.replace(/`%\$\{q\}%`/, "").replace(/Search CMS texts for '\$\{q\}'/, "")),
    "no template interpolation of q/like inside SQL"
  );
  ok("A1_real_cache_header", noStoreReal.ADMIN_CACHE_CONTROL === "no-store, private");

  // A2a writer: only blog group
  {
    const pool = makePool([
      {
        match: (sql) => sqlTable(sql) === "blog_posts",
        result: [[{ id: 7, title: "Firestick setup guide", status: "published" }]],
      },
    ]);
    const { handler, adminCalls, rlCalls } = loadSearchHandler({ pool, role: "writer" });
    const res = makeRes();
    await handler({ method: "GET", query: { q: "firestick" }, headers: {} }, res);
    ok("A2_writer_200", res.statusCode === 200, `status=${res.statusCode}`);
    const groups = (res.body && res.body.groups) || {};
    ok("A2_writer_has_blog", Array.isArray(groups.blog) && groups.blog.length === 1);
    ok("A2_writer_blog_shape", groups.blog && groups.blog[0].type === "blog" && groups.blog[0].id === 7 && groups.blog[0].title === "Firestick setup guide");
    for (const g of ["orders", "customers", "products", "faqs", "reviews"]) {
      ok(`A2_writer_no_${g}`, !(g in groups), `keys=${Object.keys(groups).join(",")}`);
    }
    ok(
      "A2_writer_only_blog_query",
      pool.calls.length === 1 && sqlTable(pool.calls[0].sql) === "blog_posts",
      `queries=${pool.calls.map((c) => sqlTable(c.sql)).join(",")}`
    );
    ok("A2_requireAdmin_mutate_false_runtime", adminCalls.length === 1 && adminCalls[0].opts && adminCalls[0].opts.mutate === false);
    ok("A2_rate_limit_keyed_by_ip", rlCalls.length === 1 && rlCalls[0] === "203.0.113.9");
    ok("A2_cache_control_no_store", /no-store/.test(String(res.headers["Cache-Control"] || "")), String(res.headers["Cache-Control"]));
    ok("A2_body_q_and_cms_hint", res.body && res.body.q === "firestick" && /Search CMS texts for 'firestick'/.test(res.body.cms_find_hint));
    // Real permissions sanity
    const perms = loadTs("lib/adminPermissions.ts");
    ok("A2_real_writer_blog_manage", perms.hasAdminPermission("writer", "blog.manage") === true);
    ok("A2_real_writer_no_orders_view", perms.hasAdminPermission("writer", "orders.view") === false);
    ok("A2_real_writer_no_customers_view", perms.hasAdminPermission("writer", "customers.view") === false);
  }

  // A2b super_admin: all groups, masked fields, limit param
  {
    const pool = makePool([
      {
        match: (sql) => sqlTable(sql) === "orders" && /order_id LIKE/.test(sql) && !/customer_email/.test(sql),
        result: [[{ order_id: "F4UK-1001", status: "pending", created_at: "2026-01-01T00:00:00Z", customer_name: "john smith" }]],
      },
      {
        match: (sql) => sqlTable(sql) === "orders" && /customer_email LIKE/.test(sql),
        result: [[
          { customer_name: "Jane Doe", customer_email: "jane.doe@example.com", last_order: "2026-01-02" },
          { customer_name: "", customer_email: "bob@mail.co.uk", last_order: "2026-01-01" },
        ]],
      },
      { match: (sql) => sqlTable(sql) === "products", result: [[{ id: 3, name: "Fire Stick 4K", slug: "firestick-4k" }]] },
      { match: (sql) => sqlTable(sql) === "blog_posts", result: [[{ id: 7, title: "Guide", status: "draft" }]] },
      { match: (sql) => sqlTable(sql) === "faqs", result: [[{ id: 2, question: "How to install?" }]] },
      { match: (sql) => sqlTable(sql) === "customer_reviews", result: [[{ id: 9, display_name: "Sam", status: "approved" }]] },
    ]);
    const { handler } = loadSearchHandler({ pool, role: "super_admin" });
    const res = makeRes();
    await handler({ method: "GET", query: { q: "fire" }, headers: {} }, res);
    ok("A2_sa_200", res.statusCode === 200, `status=${res.statusCode} body=${JSON.stringify(res.body).slice(0, 120)}`);
    const g = (res.body && res.body.groups) || {};
    ok("A2_sa_all_six_groups", ["orders", "customers", "products", "blog", "faqs", "reviews"].every((k) => Array.isArray(g[k])), Object.keys(g).join(","));
    ok("A2_order_customer_initial_masked", g.orders && g.orders[0].customer_initial === "J." && !("customer_name" in g.orders[0]));
    ok("A2_order_no_email_or_phone", g.orders && !("customer_email" in g.orders[0]) && !("customer_phone" in g.orders[0]));
    ok("A2_customer_email_masked", g.customers && g.customers[0].email_masked === "j***@e***.com", g.customers && g.customers[0].email_masked);
    ok("A2_customer_email_masked_2", g.customers && g.customers[1].email_masked === "b***@m***.uk", g.customers && g.customers[1].email_masked);
    ok("A2_customer_no_raw_email", g.customers && g.customers.every((c) => !("customer_email" in c) && !("email" in c) && !JSON.stringify(c).includes("@example.com")));
    ok("A2_customer_default_display_name", g.customers && g.customers[1].display_name === "Customer");
    ok("A2_customer_display_name", g.customers && g.customers[0].display_name === "Jane Doe");
    ok("A2_product_shape", g.products && g.products[0].type === "product" && g.products[0].slug === "firestick-4k");
    ok("A2_faq_shape", g.faqs && g.faqs[0].type === "faq" && g.faqs[0].question === "How to install?");
    ok("A2_reviews_table_customer_reviews", /FROM customer_reviews/.test(searchSrc));
    ok("A2_review_shape", g.reviews && g.reviews[0].type === "review" && g.reviews[0].name === "Sam");
    ok("A2_limit_param_is_6", pool.calls.every((c) => Array.isArray(c.params) && c.params[c.params.length - 1] === 6));
  }

  // A2c min length / max length
  {
    const pool = makePool([]);
    const { handler } = loadSearchHandler({ pool });
    const r1 = makeRes();
    await handler({ method: "GET", query: { q: "a" }, headers: {} }, r1);
    ok("A2_min_len_400", r1.statusCode === 400 && /Query must be 2/.test(r1.body.error), `status=${r1.statusCode}`);
    const r2 = makeRes();
    await handler({ method: "GET", query: { q: "   a   " }, headers: {} }, r2);
    ok("A2_trimmed_min_len_400", r2.statusCode === 400);
    const r3 = makeRes();
    await handler({ method: "GET", query: {}, headers: {} }, r3);
    ok("A2_missing_q_400", r3.statusCode === 400);
    const r4 = makeRes();
    await handler({ method: "GET", query: { q: "x".repeat(81) }, headers: {} }, r4);
    ok("A2_max_len_400", r4.statusCode === 400);
    ok("A2_bad_q_no_db_calls", pool.calls.length === 0);
    const r5 = makeRes();
    await handler({ method: "POST", query: { q: "abc" }, headers: {} }, r5);
    ok("A2_post_405", r5.statusCode === 405 && pool.calls.length === 0);
  }

  // A2d injection safe
  {
    const raw = "' OR 1=1 --";
    const pool = makePool([
      { match: () => true, result: [[]] },
    ]);
    const { handler } = loadSearchHandler({ pool, role: "super_admin" });
    const res = makeRes();
    await handler({ method: "GET", query: { q: raw }, headers: {} }, res);
    ok("A2_injection_200", res.statusCode === 200, `status=${res.statusCode}`);
    ok("A2_injection_queries_ran", pool.calls.length === 6, `calls=${pool.calls.length}`);
    const like = `%${raw}%`;
    ok(
      "A2_injection_params_contain_raw_like",
      pool.calls.every((c) => c.params.some((p) => p === like)),
      "every query binds %q% as a param"
    );
    ok(
      "A2_injection_sql_not_concatenated",
      pool.calls.every((c) => !c.sql.includes("1=1") && !c.sql.includes("OR 1") && !c.sql.includes(raw)),
      "raw q never appears in SQL text"
    );
    ok("A2_injection_sql_uses_placeholders", pool.calls.every((c) => /LIKE \?/.test(c.sql)));
    ok("A2_injection_echo_is_json", res.body && res.body.q === raw);
  }

  // A2e rate limit
  {
    const pool = makePool([]);
    const { handler } = loadSearchHandler({ pool, rl: () => ({ allowed: false, retryAfterSec: 30 }) });
    const res = makeRes();
    await handler({ method: "GET", query: { q: "firestick" }, headers: {} }, res);
    ok("A2_rate_limit_429", res.statusCode === 429 && res.body.error === "Too many requests");
    ok("A2_rate_limit_retry_after", String(res.headers["Retry-After"]) === "30");
    ok("A2_rate_limit_no_db", pool.calls.length === 0);
    ok("A2_rate_limit_still_no_store", /no-store/.test(String(res.headers["Cache-Control"] || "")));
  }

  // A2f unauthenticated → requireAdmin handles response; no DB
  {
    const pool = makePool([]);
    const { handler, rlCalls } = loadSearchHandler({ pool, admin: null });
    const res = makeRes();
    await handler({ method: "GET", query: { q: "firestick" }, headers: {} }, res);
    ok("A2_unauth_401_no_db_no_rl", res.statusCode === 401 && pool.calls.length === 0 && rlCalls.length === 0);
  }

  // A2g per-group DB failure → empty groups (200), no leak; outer catch still present in source
  {
    const secret = "ER_ACCESS_DENIED secret-host.internal";
    const pool = makePool([{ match: () => true, throw: Object.assign(new Error(secret), { code: "ER_X" }) }]);
    const origErr = console.error;
    console.error = () => {};
    const { handler } = loadSearchHandler({ pool, role: "super_admin" });
    const res = makeRes();
    try {
      await handler({ method: "GET", query: { q: "firestick" }, headers: {} }, res);
    } finally {
      console.error = origErr;
    }
    ok(
      "A2_group_fail_resilient_200",
      res.statusCode === 200 &&
        res.body.groups &&
        ["orders", "customers", "products", "blog", "faqs", "reviews"].every(
          (k) => Array.isArray(res.body.groups[k]) && res.body.groups[k].length === 0
        )
    );
    ok("A2_500_no_leak", !JSON.stringify(res.body).includes("secret-host") && !JSON.stringify(res.body).includes("ER_"));
    ok("A2_outer_500_catch_present", /Request failed/.test(searchSrc) && /\[admin-search\] failed/.test(searchSrc));
  }

  // =========================================================================
  // B) FIX tests
  // =========================================================================
  console.log("\n# B) FIX regressions");
  const toolbar = read("components/admin/CmsEaseToolbar.tsx");
  const sidhu = read("app/sidhu/page.tsx");
  const adminProducts = read("pages/api/admin-products.ts");
  const writerTx = read("lib/productWriterTx.ts");

  // B1
  const saveDirty = slice(toolbar, "const saveDirtyForPage", 2000);
  ok("B1_saveDirtyForPage_exists", saveDirty.length > 0);
  ok("B1_no_pageKeys_spread_fallback", !/\[\s*\.\.\.pageKeys\s*\]/.test(saveDirty) && !/\[\s*\.\.\.pageKeys\s*\]/.test(toolbar));
  ok("B1_no_fallback_to_all_keys", !/toSave\.length\s*\?\s*toSave\s*:/.test(saveDirty));
  ok("B1_empty_toSave_returns", /if\s*\(\s*!toSave\.length\s*\)\s*return/.test(saveDirty));
  ok("B1_checks_onSave_false", /onSave\(toSave\)/.test(saveDirty) && /===\s*false/.test(saveDirty));
  ok("B1_onSave_type_boolean", /onSave:\s*\(keys:\s*string\[\]\)\s*=>\s*boolean\s*\|\s*void/.test(toolbar));

  // B2
  const saveContent = slice(sidhu, "const saveContent = async", 4200);
  ok("B2_saveContent_exists", saveContent.length > 0);
  ok("B2_saveContent_returns_true", /return true;/.test(saveContent));
  ok("B2_saveContent_returns_false", (saveContent.match(/return false;/g) || []).length >= 3);
  ok("B2_saveContent_401_session", /res\.status === 401[\s\S]{0,80}handleSessionExpired\(\)/.test(saveContent));
  ok("B2_saveContent_true_only_on_success", /if \(res\.success\) \{[\s\S]*return true;\s*\}\s*return false;/.test(saveContent));

  // B3
  ok("B3_statusPatchInFlight_ref", /statusPatchInFlight\s*=\s*useRef<Set<string>>\(new Set\(\)\)/.test(sidhu));
  ok("B3_inflight_early_return", /if \(statusPatchInFlight\.current\.has\(id\)\) return;/.test(sidhu));
  ok("B3_inflight_add", /statusPatchInFlight\.current\.add\(id\)/.test(sidhu));
  ok("B3_inflight_delete_finally", /\.finally\(\s*\(\)\s*=>\s*\{[\s\S]{0,120}statusPatchInFlight\.current\.delete\(id\)/.test(sidhu));

  // B4 / B5
  ok(
    "B4_admin_products_concurrent_conflict_message",
    /code === 'concurrent_conflict'|code === "concurrent_conflict"/.test(adminProducts) &&
      /409\)\.json\(\{\s*error:\s*['"]This product changed elsewhere\. Reload and re-apply your edits\.['"],\s*code:\s*['"]concurrent_conflict['"]/.test(adminProducts)
  );
  ok("B4_admin_products_conflict_both_paths", (adminProducts.match(/changed elsewhere/g) || []).length >= 2);
  ok("B4_sidhu_shows_conflict_message", /conflictCode === "concurrent_conflict"/.test(sidhu) && /changed elsewhere/.test(sidhu));
  ok("B5_productWriterTx_stale_message", /updated elsewhere/.test(writerTx) && (writerTx.match(/updated elsewhere/g) || []).length >= 2);
  ok("B5_productWriterTx_concurrent_code", /err\.code\s*=\s*"concurrent_conflict"/.test(writerTx));

  // B6 seasonal wizard
  const wizSrc = read("lib/seasonalOfferWizard.ts");
  ok("B6_step_type_has_set_shop_listed", /\|\s*"set_shop_listed"/.test(wizSrc));
  ok("B6_steps_array_has_set_shop_listed", /"set_archive_presentation",\s*"set_shop_listed",\s*\]/.test(wizSrc));
  ok("B6_only_patch_when_hidden", /if \(state\.shop_listed !== 0\) continue;/.test(wizSrc));
  {
    const wiz = loadTs("lib/seasonalOfferWizard.ts");
    const mkFetch = () => {
      const calls = [];
      let version = 1;
      const fetchImpl = async (url, init) => {
        const body = init && init.body ? JSON.parse(init.body) : {};
        calls.push({ url, method: init && init.method, body });
        if (init.method === "POST") {
          return { ok: true, status: 200, json: async () => ({ id: 55, slug: "xmas-offer", product_version: 1 }) };
        }
        version += 1;
        return { ok: true, status: 200, json: async () => ({ product: { product_version: version } }) };
      };
      return { fetchImpl, calls };
    };
    const baseState = () => ({
      ...wiz.emptyWizardState(),
      name: "Christmas Offer",
      price: "19.99",
      season_name: "Christmas",
      startsWall: "2026-12-01T00:00:00",
      startsOffset: "+00:00",
      endsWall: "2026-12-31T23:59:59",
      endsOffset: "+00:00",
    });

    const a = mkFetch();
    const outListed = await wiz.runSeasonalOfferCreate({ ...baseState(), shop_listed: 1 }, { fetchImpl: a.fetchImpl });
    ok("B6_listed_run_ok", outListed.ok === true, JSON.stringify(outListed.results.filter((r) => !r.ok)));
    ok(
      "B6_listed_no_set_shop_listed_patch",
      !a.calls.some((c) => c.body && c.body.action === "set_shop_listed") &&
        !outListed.results.some((r) => r.step === "set_shop_listed"),
      a.calls.map((c) => c.body.action || "create").join(",")
    );
    ok("B6_listed_patch_actions", a.calls.map((c) => c.body.action || "create").join(",") === "create,set_lifecycle_settings,set_season_window,set_archive_presentation");

    const b = mkFetch();
    const outHidden = await wiz.runSeasonalOfferCreate({ ...baseState(), shop_listed: 0 }, { fetchImpl: b.fetchImpl });
    const shopCall = b.calls.find((c) => c.body && c.body.action === "set_shop_listed");
    ok("B6_hidden_run_ok", outHidden.ok === true, JSON.stringify(outHidden.results.filter((r) => !r.ok)));
    ok("B6_hidden_has_set_shop_listed_patch", !!shopCall && shopCall.method === "PATCH");
    ok("B6_hidden_body", shopCall && shopCall.body.shop_listed === 0 && shopCall.body.id === 55 && typeof shopCall.body.expected_version === "number");
    ok("B6_hidden_set_shop_listed_is_last", b.calls[b.calls.length - 1].body.action === "set_shop_listed");
    ok("B6_hidden_result_step", outHidden.results[outHidden.results.length - 1].step === "set_shop_listed");
    ok("B6_credentials_include_all_calls", a.calls.length > 0 && /credentials:\s*"include"/.test(wizSrc));
  }

  // B7 page builder sections PUT
  const sectionsPut = slice(sidhu, "const sectionsPut = async", 1400);
  ok("B7_sectionsPut_exists", sectionsPut.length > 0);
  ok("B7_sectionsPut_credentials_include", /credentials:\s*"include"/.test(sectionsPut));
  ok("B7_sectionsPut_checks_r_ok", /!r\.ok/.test(sectionsPut));
  ok("B7_sectionsPut_returns_boolean", /Promise<boolean>/.test(sectionsPut) && /return true;/.test(sectionsPut) && /return false;/.test(sectionsPut));
  ok("B7_sectionsPut_401_session", /r\.status === 401[\s\S]{0,60}handleSessionExpired/.test(sectionsPut));

  // B8 AdminGlobalSearch
  const gs = read("components/admin/AdminGlobalSearch.tsx");
  ok("B8_component_exists", exists("components/admin/AdminGlobalSearch.tsx"));
  ok("B8_debounce_250", /DEBOUNCE_MS\s*=\s*250\b/.test(gs) && /\},\s*DEBOUNCE_MS\)/.test(gs));
  ok("B8_hotkey_fn_exported", /export function isAdminSearchHotkey/.test(gs));
  ok("B8_ctrl_meta_k", /e\.ctrlKey\s*\|\|\s*e\.metaKey/.test(gs) && /=== "k"/.test(gs));
  ok("B8_keydown_listener", /addEventListener\("keydown"/.test(gs) && /isAdminSearchHotkey\(e\)/.test(gs));
  ok("B8_testid", /data-testid="admin-global-search"/.test(gs));
  ok("B8_min_chars_2", /MIN_CHARS\s*=\s*2\b/.test(gs));
  ok("B8_aborts_stale_requests", /AbortController/.test(gs) && /ctrl\.abort\(\)/.test(gs));
  ok("B8_fetch_credentials_no_store", /credentials:\s*"include"/.test(gs) && /cache:\s*"no-store"/.test(gs));
  ok("B8_sidhu_mounts_search", /<AdminGlobalSearch\s+onNavigate=/.test(sidhu));
  {
    // Unit: hotkey helper via loadTs (React import resolved from node_modules; component not rendered).
    let hk = null;
    try {
      hk = loadTs("components/admin/AdminGlobalSearch.tsx").isAdminSearchHotkey;
    } catch (e) {
      hk = null;
    }
    ok("B8_hotkey_unit_loaded", typeof hk === "function");
    if (typeof hk === "function") {
      ok("B8_hotkey_ctrl_k", hk({ ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, key: "k" }) === true);
      ok("B8_hotkey_cmd_K", hk({ ctrlKey: false, metaKey: true, altKey: false, shiftKey: false, key: "K" }) === true);
      ok("B8_hotkey_plain_k_no", hk({ ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, key: "k" }) === false);
      ok("B8_hotkey_ctrl_shift_k_no", hk({ ctrlKey: true, metaKey: false, altKey: false, shiftKey: true, key: "k" }) === false);
      ok("B8_hotkey_ctrl_alt_k_no", hk({ ctrlKey: true, metaKey: false, altKey: true, shiftKey: false, key: "k" }) === false);
      ok("B8_hotkey_ctrl_j_no", hk({ ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, key: "j" }) === false);
    }
  }

  // B9 draft saved banner
  ok("B9_draft_saved_banner", /isDraft\s*\?\s*"✅ Draft saved"/.test(sidhu));
  ok("B9_published_banner_distinct", /"✅ Post published!"/.test(sidhu) && /"✅ Post updated!"/.test(sidhu));

  // =========================================================================
  // C) Flow matrix contract smoke
  // =========================================================================
  console.log("\n# C) flow matrix contract smoke");
  const exportSrc = read("pages/api/admin-orders-export.ts");
  const ordersApi = read("pages/api/admin-orders.ts");
  const ordersQuery = read("lib/adminOrdersQuery.ts");

  const headerBlock = /const header = \[([\s\S]*?)\];/.exec(exportSrc);
  const headerCols = headerBlock ? (headerBlock[1].match(/"[^"]+"/g) || []) : [];
  ok("C_O11_csv_17_headers", headerCols.length === 17, `headers=${headerCols.length}`);
  ok("C_O11_csv_bom_and_audit", /\\uFEFF/.test(exportSrc) && /order\.exported/.test(exportSrc));
  ok("C_O11_export_requires_orders_view_nonmutating", /requireAdminPermission\(req, res, "orders\.view", \{ mutate: false \}\)/.test(exportSrc));
  ok("C_O8_cancel_reason", /cancel_reason/.test(ordersApi) && /CANCEL_REASONS/.test(ordersQuery));
  ok("C_CT3_cms_find", /data-cms-find-input/.test(toolbar) && /data-cms-find-input/.test(sidhu) && /cms_find/.test(gs));
  ok("C_G1_session_expired_message", /Session expired\. Please sign in again\./.test(sidhu));
  ok("C_G1_401_handler_exists", /const handleSessionExpired = \(\)/.test(sidhu));
  ok("C_G2_admin_search_no_store", /setAdminNoStore/.test(searchSrc) && /setAdminNoStore/.test(exportSrc));
  ok("C_P1_product_conflict_flow", /concurrent_conflict/.test(adminProducts) && /updated elsewhere/.test(writerTx));
  ok("C_B1_blog_draft_flow", /Draft saved/.test(sidhu));
  ok("C_S1_seasonal_shop_listed_flow", /set_shop_listed/.test(wizSrc) && /set_shop_listed/.test(read("lib/productSeasonServer.ts")));

  console.log(`\nphase-multi-104-tests: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
