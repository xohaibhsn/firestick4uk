/**
 * F4UK-MULTI-114 — FAQ edit + visibility stale-write guard
 * (server base_hash on admin GET, 409 reload/overwrite).
 * Static checks + mocked DB only. No real DB / network.
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
    body: undefined,
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

function seedRow(over = {}) {
  return {
    id: 42,
    question: "Original question?",
    answer: "Original answer.",
    category: "General",
    sort_order: 10,
    is_visible: 0,
    created_at: "2020-01-01 00:00:00",
    ...over,
  };
}

function makeHarness() {
  const rows = [seedRow()];
  const sqlLog = [];
  const audits = [];
  const stats = {
    updates: 0,
    began: 0,
    committed: 0,
    rolled: 0,
    released: 0,
  };

  function query(sql, params = []) {
    const s = String(sql).replace(/\s+/g, " ").trim();
    sqlLog.push(s);
    if (/SELECT \* FROM faqs WHERE id=\? FOR UPDATE/i.test(s)) {
      const id = Number(params[0]);
      return [rows.filter((r) => r.id === id).map((r) => ({ ...r })), []];
    }
    if (/^SELECT \* FROM faqs/i.test(s) && /ORDER BY/i.test(s)) {
      return [rows.map((r) => ({ ...r })), []];
    }
    if (/SELECT id, question, answer, category, sort_order FROM faqs WHERE is_visible=1/i.test(s)) {
      return [
        rows
          .filter((r) => Number(r.is_visible) === 1)
          .map((r) => ({
            id: r.id,
            question: r.question,
            answer: r.answer,
            category: r.category,
            sort_order: r.sort_order,
          })),
        [],
      ];
    }
    if (/^UPDATE faqs SET question=\?,answer=\?,category=\?,sort_order=\?,is_visible=\? WHERE id=\?/i.test(s)) {
      stats.updates += 1;
      const id = Number(params[5]);
      const row = rows.find((r) => r.id === id);
      if (row) {
        Object.assign(row, {
          question: params[0],
          answer: params[1],
          category: params[2],
          sort_order: params[3],
          is_visible: params[4],
        });
      }
      return [{ affectedRows: row ? 1 : 0 }, []];
    }
    if (/SELECT id FROM faqs FOR UPDATE/i.test(s)) {
      return [rows.map((r) => ({ id: r.id })), []];
    }
    if (/^UPDATE faqs SET sort_order = \? WHERE id = \?/i.test(s)) {
      stats.updates += 1;
      const row = rows.find((r) => r.id === Number(params[1]));
      if (row) row.sort_order = params[0];
      return [{ affectedRows: row ? 1 : 0 }, []];
    }
    if (/^INSERT INTO faqs/i.test(s)) {
      const id = 99;
      rows.push(
        seedRow({
          id,
          question: params[0],
          answer: params[1],
          category: params[2],
          sort_order: params[3],
          is_visible: 1,
        })
      );
      return [{ insertId: id }, []];
    }
    if (/^DELETE FROM faqs WHERE id=\?/i.test(s)) {
      const idx = rows.findIndex((r) => r.id === Number(params[0]));
      if (idx >= 0) rows.splice(idx, 1);
      return [{ affectedRows: idx >= 0 ? 1 : 0 }, []];
    }
    throw new Error("Unexpected SQL: " + s);
  }

  const conn = {
    async beginTransaction() {
      stats.began += 1;
    },
    async commit() {
      stats.committed += 1;
    },
    async rollback() {
      stats.rolled += 1;
    },
    release() {
      stats.released += 1;
    },
    query,
  };

  const pool = {
    async query(sql, params) {
      return query(sql, params);
    },
    async getConnection() {
      return conn;
    },
  };

  const admin = {
    authenticated: true,
    principalType: "master",
    name: "Test Admin",
    role: "super_admin",
    sessionId: 1,
  };

  const stubs = {
    "../../lib/db": { __esModule: true, default: pool },
    "@/lib/db": { __esModule: true, default: pool },
    "../../lib/adminAuth": {
      requireAdminPermission: async () => admin,
      getRequestMeta: () => ({ ip: "127.0.0.1" }),
    },
    "@/lib/adminAuth": {
      requireAdminPermission: async () => admin,
      getRequestMeta: () => ({ ip: "127.0.0.1" }),
    },
    "../../lib/adminAudit": {
      recordAdminAudit: async (entry) => {
        audits.push(entry);
      },
    },
    "@/lib/adminAudit": {
      recordAdminAudit: async (entry) => {
        audits.push(entry);
      },
    },
    "../../lib/adminNoStore": { setAdminNoStore() {} },
    "@/lib/adminNoStore": { setAdminNoStore() {} },
    "../../lib/rateLimit": {
      getClientIp: () => "127.0.0.1",
      RL_PUBLIC_GET: () => ({ allowed: true, retryAfterSec: 0 }),
    },
    "@/lib/rateLimit": {
      getClientIp: () => "127.0.0.1",
      RL_PUBLIC_GET: () => ({ allowed: true, retryAfterSec: 0 }),
    },
  };

  const mod = loadTs("pages/api/faqs.ts", stubs);
  return {
    handler: mod.default || mod,
    rows,
    sqlLog,
    audits,
    stats,
    reset() {
      rows.splice(0, rows.length, seedRow());
      sqlLog.splice(0, sqlLog.length);
      audits.splice(0, audits.length);
      stats.updates = 0;
      stats.began = 0;
      stats.committed = 0;
      stats.rolled = 0;
      stats.released = 0;
    },
  };
}

async function invoke(handler, req) {
  const res = makeRes();
  await handler(
    {
      headers: {},
      socket: { remoteAddress: "127.0.0.1" },
      ...req,
    },
    res
  );
  return res;
}

(async () => {
  console.log("\n# MULTI-114 FAQ stale-write guard");

  const hashes = loadTs("lib/faqBaseHash.ts");
  const { faqRowBaseHash, FAQ_WRITE_COLUMNS } = hashes;

  const base = seedRow();
  const baseHash = faqRowBaseHash(base);
  ok("hash_is_sha256_hex", typeof baseHash === "string" && baseHash.length === 64);
  ok("hash_stable", faqRowBaseHash(base) === baseHash);
  ok(
    "null_and_empty_string_hash_differ",
    faqRowBaseHash({ ...base, answer: null }) !== faqRowBaseHash({ ...base, answer: "" })
  );
  ok(
    "created_at_does_not_change_hash",
    faqRowBaseHash({ ...base, created_at: "2030-01-01" }) === baseHash
  );
  ok("id_does_not_change_hash", faqRowBaseHash({ ...base, id: 99 }) === baseHash);
  for (const col of FAQ_WRITE_COLUMNS) {
    const next = { ...base };
    if (col === "sort_order" || col === "is_visible") {
      next[col] = Number(base[col]) === 0 ? 1 : 0;
    } else {
      next[col] = base[col] === "x-changed" ? "y-changed" : "x-changed";
    }
    ok(`hash_changes_when_${col}_changes`, faqRowBaseHash(next) !== baseHash);
  }
  ok(
    "raw_is_visible_not_coerced",
    faqRowBaseHash({ ...base, is_visible: 0 }) !== faqRowBaseHash({ ...base, is_visible: false })
  );

  const h = makeHarness();

  // --- Public GET: no base_hash ---
  {
    h.reset();
    h.rows[0].is_visible = 1;
    const res = await invoke(h.handler, { method: "GET", query: {} });
    ok("public_get_200", res.statusCode === 200 && Array.isArray(res.body) && res.body.length === 1);
    ok(
      "public_get_no_base_hash",
      res.body[0] && !Object.prototype.hasOwnProperty.call(res.body[0], "base_hash")
    );
    ok(
      "public_get_columns_only",
      res.body[0] &&
        Object.keys(res.body[0]).sort().join(",") ===
          "answer,category,id,question,sort_order"
    );
  }

  // --- Admin GET includes base_hash of the raw row ---
  {
    h.reset();
    const list = await invoke(h.handler, { method: "GET", query: { admin: "true" } });
    ok("admin_list_200", list.statusCode === 200 && Array.isArray(list.body) && list.body.length === 1);
    ok(
      "admin_list_base_hash",
      list.body[0].base_hash === faqRowBaseHash(h.rows[0]) && list.body[0].base_hash === baseHash
    );
    ok("admin_list_keeps_created_at", list.body[0].created_at === "2020-01-01 00:00:00");
  }

  // --- PUT match → UPDATE + audit + new base_hash ---
  {
    h.reset();
    const res = await invoke(h.handler, {
      method: "PUT",
      query: {},
      body: {
        id: 42,
        question: base.question,
        answer: "Updated answer.",
        category: base.category,
        sort_order: base.sort_order,
        is_visible: base.is_visible,
        base_hash: baseHash,
      },
    });
    ok("put_match_200", res.statusCode === 200 && res.body && res.body.success === true);
    ok("put_match_updated", h.stats.updates === 1 && h.rows[0].answer === "Updated answer.");
    ok(
      "put_match_audit",
      h.audits.length === 1 && h.audits[0].action === "faq.updated"
    );
    ok("put_match_released", h.stats.released === 1 && h.stats.committed === 1);
    const expected = faqRowBaseHash(h.rows[0]);
    ok(
      "put_match_returns_new_base_hash",
      res.body.base_hash === expected && res.body.base_hash !== baseHash
    );
    ok(
      "put_match_no_overwrite_audit",
      !h.audits.some((a) => a.action === "faq.overwrite_stale")
    );
  }

  // --- mismatch → 409, no UPDATE, no audit, rollback, released ---
  {
    h.reset();
    const res = await invoke(h.handler, {
      method: "PUT",
      query: {},
      body: {
        id: 42,
        question: "Hijack?",
        answer: "stale answer",
        category: "General",
        sort_order: 10,
        is_visible: 0,
        base_hash: faqRowBaseHash({ ...base, answer: "someone-else" }),
      },
    });
    ok("put_mismatch_409", res.statusCode === 409 && res.body && res.body.error === "stale");
    ok(
      "put_mismatch_conflicts",
      Array.isArray(res.body.conflicts) &&
        res.body.conflicts.length === 1 &&
        res.body.conflicts[0].id === 42 &&
        res.body.conflicts[0].question === "Original question?"
    );
    ok("put_mismatch_no_update", h.stats.updates === 0 && h.rows[0].answer === "Original answer.");
    ok("put_mismatch_no_audit", h.audits.length === 0);
    ok("put_mismatch_rolled_back", h.stats.rolled === 1 && h.stats.committed === 0);
    ok("put_mismatch_released", h.stats.released === 1);
    ok(
      "put_mismatch_no_update_sql",
      h.sqlLog.some((s) => /FOR UPDATE/i.test(s)) &&
        !h.sqlLog.some((s) => /^UPDATE faqs SET question=/i.test(s))
    );
  }

  // --- toggle with stale hash → 409 (closes the silent-revert defect) ---
  {
    h.reset();
    const res = await invoke(h.handler, {
      method: "PUT",
      query: {},
      body: {
        id: 42,
        question: base.question,
        answer: base.answer,
        category: base.category,
        sort_order: base.sort_order,
        is_visible: 1,
        base_hash: faqRowBaseHash({ ...base, answer: "edited-elsewhere" }),
      },
    });
    ok("toggle_stale_409", res.statusCode === 409 && res.body.error === "stale");
    ok("toggle_stale_no_visibility_flip", h.rows[0].is_visible === 0);
    ok("toggle_stale_answer_untouched", h.rows[0].answer === "Original answer.");
    ok("toggle_stale_no_update", h.stats.updates === 0);
    ok("toggle_stale_no_audit", h.audits.length === 0);
    ok("toggle_stale_released", h.stats.released === 1);
  }

  // --- no base_hash → legacy write + id-only log ---
  {
    h.reset();
    const seen = [];
    const orig = console.log;
    console.log = (...args) => {
      seen.push(args);
    };
    let res;
    try {
      res = await invoke(h.handler, {
        method: "PUT",
        query: {},
        body: {
          id: 42,
          question: base.question,
          answer: "Legacy answer.",
          category: base.category,
          sort_order: base.sort_order,
          is_visible: base.is_visible,
        },
      });
    } finally {
      console.log = orig;
    }
    const legacy = seen.filter((a) => a[0] === "faq.save_without_base_hash");
    ok("put_legacy_200", res.statusCode === 200 && res.body && res.body.success === true);
    ok("put_legacy_wrote", h.stats.updates === 1 && h.rows[0].answer === "Legacy answer.");
    ok(
      "put_legacy_log_id_only",
      legacy.length === 1 && legacy[0].length === 2 && String(legacy[0][1]) === "42"
    );
    ok(
      "put_legacy_returns_base_hash",
      res.body.base_hash === faqRowBaseHash(h.rows[0])
    );
  }

  // --- force → write + faq.overwrite_stale (id only) ---
  {
    h.reset();
    const forcedAnswer = "FORCED_ANSWER_VALUE";
    const res = await invoke(h.handler, {
      method: "PUT",
      query: {},
      body: {
        id: 42,
        question: base.question,
        answer: forcedAnswer,
        category: base.category,
        sort_order: base.sort_order,
        is_visible: base.is_visible,
        base_hash: faqRowBaseHash({ ...base, answer: "wrong" }),
        force: true,
      },
    });
    ok("put_force_200", res.statusCode === 200 && h.rows[0].answer === forcedAnswer);
    const ow = h.audits.find((a) => a.action === "faq.overwrite_stale");
    const upd = h.audits.find((a) => a.action === "faq.updated");
    const owJson = JSON.stringify(ow || {});
    ok("put_force_updated_audit", !!upd);
    ok("put_force_overwrite_audit", !!ow && String(ow.entityId) === "42");
    ok(
      "put_force_audit_id_only",
      ow &&
        ow.metadata &&
        Object.keys(ow.metadata).join(",") === "id" &&
        ow.metadata.id === 42 &&
        !owJson.includes(forcedAnswer) &&
        !owJson.includes("Original question")
    );
    ok(
      "put_force_new_base_hash",
      res.body.base_hash === faqRowBaseHash(h.rows[0]) && res.body.base_hash !== baseHash
    );
    ok("put_force_released", h.stats.released === 1);
  }

  // --- second save with returned hash does not false-conflict ---
  {
    h.reset();
    const first = await invoke(h.handler, {
      method: "PUT",
      query: {},
      body: {
        id: 42,
        question: base.question,
        answer: "First save",
        category: base.category,
        sort_order: base.sort_order,
        is_visible: base.is_visible,
        base_hash: baseHash,
      },
    });
    const second = await invoke(h.handler, {
      method: "PUT",
      query: {},
      body: {
        id: 42,
        question: base.question,
        answer: "Second save",
        category: base.category,
        sort_order: base.sort_order,
        is_visible: base.is_visible,
        base_hash: first.body.base_hash,
      },
    });
    ok(
      "put_second_save_no_false_conflict",
      second.statusCode === 200 &&
        second.body.success === true &&
        h.rows[0].answer === "Second save"
    );
  }

  // --- public helpers / pages do not grow base_hash ---
  for (const rel of [
    "lib/publicFaqsServer.ts",
    "app/faq/FAQClient.tsx",
    "app/faq/page.tsx",
    "app/contact/page.tsx",
  ]) {
    ok(`source_${rel}_no_base_hash`, !/base_hash/.test(read(rel)));
  }

  const api = read("pages/api/faqs.ts");
  const postStart = api.indexOf("if (req.method === 'POST')");
  const putStart = api.indexOf("if (req.method === 'PUT')");
  const delStart = api.indexOf("if (req.method === 'DELETE')");
  const postBlock = api.slice(postStart, putStart);
  const putBlock = api.slice(putStart, delStart);
  const delBlock = api.slice(delStart, api.indexOf("return res.status(405)"));
  const getBlock = api.slice(api.indexOf("if (req.method === 'GET')"), postStart);
  const publicBranch = getBlock.slice(getBlock.indexOf("RL_PUBLIC_GET"));
  ok("source_public_get_no_base_hash", !/base_hash|faqRowBaseHash/.test(publicBranch));
  ok("source_admin_get_attaches_hash", /withAdminFaqBaseHash/.test(getBlock));
  const reorderBlock = postBlock.slice(
    postBlock.indexOf("action === 'reorder'"),
    postBlock.indexOf("const { question, answer, category, sort_order }")
  );
  ok(
    "source_reorder_unchanged",
    reorderBlock.length > 0 &&
      /FOR UPDATE/.test(reorderBlock) &&
      !/base_hash|baseHash|\bforce\b/.test(reorderBlock)
  );
  ok(
    "source_post_create_unchanged",
    /INSERT INTO faqs/.test(postBlock) &&
      !/base_hash|baseHash|\bforce\b/.test(postBlock.slice(postBlock.indexOf("INSERT INTO faqs")))
  );
  ok("source_delete_unchanged", !/base_hash|baseHash/.test(delBlock));
  ok(
    "source_put_stale_guard",
    /faqRowBaseHash\(locked\) !== bodyBaseHash/.test(putBlock) &&
      /bodyForce === true/.test(putBlock) &&
      /error:\s*'stale'/.test(putBlock) &&
      /faq\.overwrite_stale/.test(putBlock) &&
      /conn\.release\(\)/.test(putBlock)
  );
  ok("source_put_rbac_unchanged", /requireAdminPermission\(req, res, 'faqs\.manage'\)/.test(api));

  const sidhu = read("app/sidhu/page.tsx");
  ok(
    "client_faq_type_has_base_hash",
    /type FAQ = \{[\s\S]*?base_hash\?: string;/.test(sidhu)
  );
  const saveStart = sidhu.indexOf("const saveFaqModal = async");
  const toggleStart = sidhu.indexOf("const toggleFaqVisibility = async");
  const saveEnd = toggleStart;
  const toggleEnd = sidhu.indexOf("const handleProductImage = async", toggleStart);
  const saveBlock = sidhu.slice(saveStart, saveEnd);
  const toggleBlock = sidhu.slice(toggleStart, toggleEnd);
  ok("client_saveFaqModal_exists", saveStart >= 0);
  ok("client_toggleFaqVisibility_exists", toggleStart >= 0);
  ok(
    "client_modal_put_sends_base_hash",
    /body\.base_hash = current\.base_hash/.test(saveBlock) && /method:\s*"PUT"/.test(saveBlock)
  );
  ok(
    "client_toggle_put_sends_base_hash",
    /body\.base_hash = f\.base_hash/.test(toggleBlock) && /method:\s*"PUT"/.test(toggleBlock)
  );
  ok(
    "client_stores_returned_base_hash",
    /base_hash: nextHash/.test(saveBlock) && /base_hash: nextHash/.test(toggleBlock)
  );
  ok(
    "client_handles_409_stale_modal",
    /status === 409 && res\.error === "stale"/.test(saveBlock)
  );
  ok(
    "client_handles_409_stale_toggle",
    /status === 409 && res\.error === "stale"/.test(toggleBlock)
  );
  const staleAt = saveBlock.indexOf('status === 409 && res.error === "stale"');
  const successAt = saveBlock.indexOf("if (res.success)");
  const conflictBlock = saveBlock.slice(staleAt, successAt);
  ok("client_409_keeps_modal_open", !/setFaqModal\(null\)/.test(conflictBlock));
  ok(
    "client_conflict_message",
    /This FAQ was changed by someone else after you loaded it:/.test(conflictBlock) &&
      /Reload to get the latest version, or Overwrite to keep yours\./.test(conflictBlock)
  );
  ok(
    "client_reload_overwrite_cancel",
    /label:\s*"Reload"/.test(conflictBlock) &&
      /label:\s*"Overwrite"/.test(conflictBlock) &&
      /Save cancelled — unresolved conflict/.test(conflictBlock)
  );
  ok("client_overwrite_sends_force", /saveFaqModal\(\{\s*force:\s*true\s*\}\)/.test(conflictBlock));
  ok(
    "client_reload_confirms_then_refetches",
    /choice === "reload"/.test(conflictBlock) &&
      /askConfirm\(/.test(conflictBlock) &&
      /\/api\/faqs\?admin=true/.test(conflictBlock)
  );
  ok(
    "client_toggle_409_does_not_flip_local",
    !/setFaqs\(/.test(toggleBlock.slice(
      toggleBlock.indexOf('status === 409 && res.error === "stale"'),
      toggleBlock.indexOf("if (res.success)")
    ))
  );
  ok(
    "client_toggle_wired",
    /onClick=\{\(\)=>\{void toggleFaqVisibility\(f\);\}\}/.test(sidhu)
  );
  ok(
    "client_modal_save_wired",
    /void saveFaqModal\(\)/.test(sidhu)
  );
  ok(
    "client_reorder_still_loadFaqs",
    /action:\s*"reorder"/.test(sidhu) &&
      /void loadFaqs\(\)/.test(sidhu.slice(sidhu.indexOf("const saveFaqOrder"), sidhu.indexOf("const saveFaqModal")))
  );

  console.log(`\nphase-multi-114: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error("FAIL  suite_exception —", err && err.stack ? err.stack : err);
  process.exit(1);
});
