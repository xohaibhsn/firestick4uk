/**
 * F4UK-MULTI-111 — Page Builder POST /api/sections stale-write guard
 * (server base_hash on admin GET ?all=1, 409 reload/overwrite).
 * Static checks + mocked handlers only. No real DB / network.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");
const { createHash } = require("crypto");

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

function sha256(s) {
  return createHash("sha256").update(String(s), "utf8").digest("hex");
}

function makeHarness(opts = {}) {
  const rawValue =
    opts.rawValue !== undefined
      ? opts.rawValue
      : JSON.stringify({ title: "Hello" });
  const row = {
    content_key: opts.key || "home_hidden_test",
    content_value: rawValue,
    content_type: "json",
    page_name: opts.page || "home",
    label: opts.label || "Hidden Test",
    section_order: 1,
    is_visible: opts.visible === undefined ? 0 : opts.visible,
  };
  const calls = [];
  const audits = [];
  const revisions = [];
  let released = 0;
  let began = 0;
  let committed = 0;
  let rolled = 0;
  let cacheHits = 0;
  let invalidateHits = 0;

  const conn = {
    async beginTransaction() {
      began++;
    },
    async commit() {
      committed++;
    },
    async rollback() {
      rolled++;
    },
    release() {
      released++;
    },
    async query(sqlOrObj, maybeParams) {
      const sql =
        typeof sqlOrObj === "string" ? sqlOrObj : String(sqlOrObj?.sql || "");
      const params = sqlOrObj?.values || maybeParams || [];
      calls.push({ sql, params, via: "conn" });
      if (/FOR UPDATE/i.test(sql)) {
        return [[row], []];
      }
      if (/UPDATE site_content SET content_value/i.test(sql)) {
        row.content_value = params[0];
        return [{ affectedRows: 1 }, []];
      }
      return [[], []];
    },
  };

  const pool = {
    async getConnection() {
      return conn;
    },
    async query(sqlOrObj, maybeParams) {
      const sql =
        typeof sqlOrObj === "string" ? sqlOrObj : String(sqlOrObj?.sql || "");
      const params = sqlOrObj?.values || maybeParams || [];
      calls.push({ sql, params, via: "pool" });
      if (/FROM site_content WHERE page_name=/i.test(sql)) {
        return [[row], []];
      }
      if (/FROM site_content WHERE content_key=/i.test(sql)) {
        return [[row], []];
      }
      if (/UPDATE site_content SET content_value/i.test(sql)) {
        row.content_value = params[0];
        return [{ affectedRows: 1 }, []];
      }
      return [[], []];
    },
  };

  const stubs = {
    "../../lib/db": { __esModule: true, default: pool },
    "../../lib/adminAuth": {
      requireAdminPermission: async () => ({
        id: 1,
        username: "tester",
        role: "super_admin",
        staff_id: 1,
      }),
      getRequestMeta: () => ({ ip: "127.0.0.1" }),
    },
    "../../lib/adminAudit": {
      recordAdminAudit: async (entry) => {
        audits.push(entry);
      },
    },
    "../../lib/adminNoStore": { setAdminNoStore: () => {} },
    "../../lib/contentRevisions": {
      recordContentRevision: async (entry) => {
        revisions.push(entry);
      },
    },
    "../../lib/publicCmsDataServer": {
      getCachedPublicVisibleSections: async (page) => {
        cacheHits++;
        return [
          {
            key: "home_visible",
            label: "Visible",
            page,
            order: 1,
            visible: true,
            data: { title: "pub" },
          },
        ];
      },
      invalidatePublicCmsCache() {
        invalidateHits++;
      },
    },
    "../../lib/rateLimit": {
      getClientIp: () => "127.0.0.1",
      RL_PUBLIC_GET: () => ({ allowed: true, retryAfterSec: 0 }),
    },
  };

  const mod = loadTs("pages/api/sections.ts", stubs);
  return {
    handler: mod.default || mod,
    calls,
    audits,
    revisions,
    row,
    stats: () => ({
      released,
      began,
      committed,
      rolled,
      cacheHits,
      invalidateHits,
    }),
  };
}

async function invoke(harness, req) {
  const res = makeRes();
  await harness.handler(req, res);
  return res;
}

(async () => {
  console.log("\n# MULTI-111 Page Builder stale-write guard");

  const hashes = loadTs("lib/siteContentBaseHash.ts");

  // Raw string whose JSON.stringify(JSON.parse(raw)) differs — server must hash RAW.
  const rawWeird = '{ "title" : "A", "b" : 1 }';
  const parsedReserialized = JSON.stringify(JSON.parse(rawWeird));
  ok(
    "raw_vs_reserialized_differ",
    rawWeird !== parsedReserialized,
    `raw=${JSON.stringify(rawWeird)} reser=${JSON.stringify(parsedReserialized)}`
  );
  const expectedRawHash = hashes.hashSiteContentValue(rawWeird, true);
  ok(
    "raw_hash_equals_sha256_of_raw",
    expectedRawHash === sha256(rawWeird)
  );
  ok(
    "raw_hash_differs_from_reserialized",
    expectedRawHash !== hashes.hashSiteContentValue(parsedReserialized, true)
  );

  // --- Admin GET ?all=1 includes base_hash of RAW content_value ---
  {
    const h = makeHarness({ rawValue: rawWeird, visible: 0 });
    const res = await invoke(h, {
      method: "GET",
      query: { page: "home", all: "1" },
      headers: {},
      body: {},
    });
    ok("admin_get_all_200", res.statusCode === 200 && Array.isArray(res.body));
    const row0 = res.body?.[0];
    ok(
      "admin_get_includes_base_hash_of_raw",
      row0 &&
        row0.base_hash === expectedRawHash &&
        row0.key === "home_hidden_test" &&
        typeof row0.data === "object"
    );
    ok(
      "admin_get_does_not_use_public_cache",
      h.stats().cacheHits === 0
    );
  }

  // --- Public GET: cache, no base_hash ---
  {
    const h = makeHarness();
    const res = await invoke(h, {
      method: "GET",
      query: { page: "home" },
      headers: {},
      body: {},
    });
    ok("public_get_200", res.statusCode === 200 && Array.isArray(res.body));
    ok("public_get_uses_cache", h.stats().cacheHits === 1);
    ok(
      "public_get_no_base_hash",
      res.body.every((r) => !Object.prototype.hasOwnProperty.call(r, "base_hash"))
    );
    ok(
      "public_get_shape_keys",
      res.body.every(
        (r) =>
          "key" in r &&
          "label" in r &&
          "page" in r &&
          "order" in r &&
          "visible" in r &&
          "data" in r
      )
    );
  }

  const matchRaw = JSON.stringify({ title: "Hello" });
  const matchHash = hashes.hashSiteContentValue(matchRaw, true);

  // --- POST match → write + revision + audit + new base_hash ---
  {
    const h = makeHarness({ rawValue: matchRaw });
    const next = JSON.stringify({ title: "Updated" });
    const res = await invoke(h, {
      method: "POST",
      query: {},
      headers: {},
      body: { key: "home_hidden_test", value: { title: "Updated" }, base_hash: matchHash },
    });
    ok("post_match_200", res.statusCode === 200 && res.body?.success === true);
    ok(
      "post_match_returns_new_base_hash",
      res.body?.base_hash === hashes.hashSiteContentValue(next, true)
    );
    ok("post_match_revision", h.revisions.length === 1);
    ok(
      "post_match_audit_updated",
      h.audits.some((a) => a.action === "page_builder.updated")
    );
    ok(
      "post_match_wrote",
      h.calls.some((c) => /UPDATE site_content SET content_value/i.test(c.sql))
    );
    ok("post_match_for_update", h.calls.some((c) => /FOR UPDATE/i.test(c.sql)));
    ok("post_match_invalidate", h.stats().invalidateHits === 1);
    ok("post_match_released", h.stats().released === 1);
  }

  // --- POST mismatch → 409, zero writes, no audit, release ---
  {
    const h = makeHarness({ rawValue: matchRaw });
    const res = await invoke(h, {
      method: "POST",
      query: {},
      headers: {},
      body: {
        key: "home_hidden_test",
        value: { title: "Stale attempt" },
        base_hash: hashes.hashSiteContentValue("someone-else", true),
      },
    });
    ok(
      "post_mismatch_409_shape",
      res.statusCode === 409 &&
        res.body?.error === "stale" &&
        res.body?.conflicts?.[0]?.key === "home_hidden_test" &&
        res.body?.conflicts?.[0]?.label === "Hidden Test"
    );
    ok(
      "post_mismatch_zero_writes",
      !h.calls.some((c) => /UPDATE site_content SET content_value/i.test(c.sql))
    );
    ok("post_mismatch_no_audit", h.audits.length === 0);
    ok("post_mismatch_no_revision", h.revisions.length === 0);
    ok("post_mismatch_released", h.stats().released === 1);
    ok("post_mismatch_rolled_back", h.stats().rolled >= 1);
    ok("post_mismatch_no_invalidate", h.stats().invalidateHits === 0);
  }

  // --- Legacy (no base_hash) → write ---
  {
    const h = makeHarness({ rawValue: matchRaw });
    const res = await invoke(h, {
      method: "POST",
      query: {},
      headers: {},
      body: { key: "home_hidden_test", value: { title: "Legacy" } },
    });
    ok("post_legacy_200", res.statusCode === 200 && res.body?.success === true);
    ok(
      "post_legacy_wrote",
      h.calls.some((c) => /UPDATE site_content SET content_value/i.test(c.sql))
    );
    ok(
      "post_legacy_audit",
      h.audits.some((a) => a.action === "page_builder.updated")
    );
    ok(
      "post_legacy_returns_base_hash",
      typeof res.body?.base_hash === "string" && res.body.base_hash.length === 64
    );
  }

  // --- Force → write + overwrite_stale audit (key only, no values) ---
  {
    const h = makeHarness({ rawValue: matchRaw });
    const forced = { title: "forced-secret-value-xyz" };
    const res = await invoke(h, {
      method: "POST",
      query: {},
      headers: {},
      body: {
        key: "home_hidden_test",
        value: forced,
        base_hash: hashes.hashSiteContentValue("wrong", true),
        force: true,
      },
    });
    ok("post_force_200", res.statusCode === 200 && res.body?.success === true);
    const ow = h.audits.find((a) => a.action === "page_builder.overwrite_stale");
    ok("post_force_overwrite_audit", !!ow);
    ok(
      "post_force_audit_keys_only_no_values",
      ow &&
        ow.metadata?.section_key === "home_hidden_test" &&
        !JSON.stringify(ow).includes("forced-secret-value-xyz")
    );
    ok(
      "post_force_also_updated_audit",
      h.audits.some((a) => a.action === "page_builder.updated")
    );
  }

  // --- Unchanged value → no revision ---
  {
    const h = makeHarness({ rawValue: matchRaw });
    const res = await invoke(h, {
      method: "POST",
      query: {},
      headers: {},
      body: {
        key: "home_hidden_test",
        value: JSON.parse(matchRaw),
        base_hash: matchHash,
      },
    });
    ok("post_unchanged_200", res.statusCode === 200 && res.body?.success === true);
    ok("post_unchanged_no_revision", h.revisions.length === 0);
    ok(
      "post_unchanged_still_updates",
      h.calls.some((c) => /UPDATE site_content SET content_value/i.test(c.sql))
    );
    ok(
      "post_unchanged_base_hash_same",
      res.body?.base_hash === matchHash
    );
  }

  // --- Error path still releases ---
  {
    let releasedOnErr = false;
    const pool = {
      async getConnection() {
        return {
          async beginTransaction() {},
          async commit() {},
          async rollback() {},
          release() {
            releasedOnErr = true;
          },
          async query(sql) {
            if (/FOR UPDATE/i.test(sql)) {
              return [
                [
                  {
                    content_key: "k",
                    content_value: matchRaw,
                    content_type: "json",
                    page_name: "home",
                    label: "L",
                    section_order: 1,
                    is_visible: 0,
                  },
                ],
                [],
              ];
            }
            return [{ affectedRows: 1 }, []];
          },
        };
      },
      async query() {
        return [[], []];
      },
    };
    const stubsBroken = {
      "../../lib/db": { __esModule: true, default: pool },
      "../../lib/adminAuth": {
        requireAdminPermission: async () => ({
          id: 1,
          username: "tester",
          role: "super_admin",
          staff_id: 1,
        }),
        getRequestMeta: () => ({ ip: "127.0.0.1" }),
      },
      "../../lib/adminAudit": { recordAdminAudit: async () => {} },
      "../../lib/adminNoStore": { setAdminNoStore: () => {} },
      "../../lib/contentRevisions": {
        recordContentRevision: async () => {
          const err = new Error("too large");
          err.code = "REVISION_TOO_LARGE";
          throw err;
        },
      },
      "../../lib/publicCmsDataServer": {
        getCachedPublicVisibleSections: async () => [],
        invalidatePublicCmsCache() {},
      },
      "../../lib/rateLimit": {
        getClientIp: () => "127.0.0.1",
        RL_PUBLIC_GET: () => ({ allowed: true, retryAfterSec: 0 }),
      },
    };
    const mod = loadTs("pages/api/sections.ts", stubsBroken);
    const res = makeRes();
    await (mod.default || mod)(
      {
        method: "POST",
        query: {},
        headers: {},
        body: {
          key: "k",
          value: { title: "bigger" },
          base_hash: matchHash,
        },
      },
      res
    );
    ok("post_revision_too_large_400", res.statusCode === 400);
    ok("post_error_releases", releasedOnErr === true);
  }

  // --- Source / client wiring ---
  const sectionsSrc = read("pages/api/sections.ts");
  ok(
    "source_imports_hashSiteContentValue",
    /hashSiteContentValue/.test(sectionsSrc)
  );
  ok(
    "source_for_update_in_post",
    /FOR UPDATE/.test(sectionsSrc) && /beginTransaction/.test(sectionsSrc)
  );
  ok(
    "source_overwrite_stale_action",
    /page_builder\.overwrite_stale/.test(sectionsSrc)
  );
  ok(
    "source_put_visibility_reorder_untouched_by_base_hash",
    /action === 'visibility'/.test(sectionsSrc) &&
      /action === 'reorder'/.test(sectionsSrc) &&
      !/base_hash/.test(
        sectionsSrc.slice(sectionsSrc.indexOf("if (req.method === 'PUT')"))
      )
  );

  const sidhu = read("app/sidhu/page.tsx");
  ok(
    "client_section_item_has_base_hash",
    /type SectionItem = \{[^}]*base_hash\?/.test(sidhu)
  );
  ok(
    "client_saveSectionModal_sends_base_hash",
    /const saveSectionModal = async/.test(sidhu) &&
      /body\.base_hash = sectionModalBaseHash/.test(sidhu)
  );
  ok(
    "client_stores_returned_base_hash",
    /setSectionModalBaseHash\(nextHash\)/.test(sidhu) ||
      /setSectionModalBaseHash\(\s*nextHash\s*\)/.test(sidhu)
  );
  const saveStart = sidhu.indexOf("const saveSectionModal = async");
  const saveEnd = sidhu.indexOf("/** PUT /api/sections?action=", saveStart);
  const saveBlock = sidhu.slice(saveStart, saveEnd);
  const conflictStart = saveBlock.indexOf('res.status === 409 && res.error === "stale"');
  ok("client_handles_409_stale", conflictStart >= 0);
  const conflictBlock = saveBlock.slice(conflictStart);
  ok(
    "client_409_keeps_modal_open",
    conflictStart >= 0 &&
      !/setSectionModal\(null\)/.test(
        conflictBlock.slice(0, conflictBlock.indexOf('if (res.success)'))
      )
  );
  ok(
    "client_conflict_message",
    /This section was changed by someone else after you opened it/.test(saveBlock)
  );
  ok(
    "client_reload_overwrite_buttons",
    /label:\s*"Reload"/.test(saveBlock) && /label:\s*"Overwrite"/.test(saveBlock)
  );
  ok(
    "client_overwrite_sends_force",
    /saveSectionModal\(\{\s*force:\s*true\s*\}/.test(saveBlock)
  );
  ok(
    "client_reload_refetches_sections",
    /loadBuilderSections\(builderPage\)/.test(saveBlock)
  );
  ok(
    "client_loadBuilderSections_all1",
    /\/api\/sections\?page=\$\{page\}&all=1/.test(sidhu)
  );
  ok(
    "client_refresh_uses_loadBuilderSections",
    /onClick=\{\(\)=>void loadBuilderSections\(builderPage\)\}/.test(sidhu) ||
      /onClick=\{\(\) => void loadBuilderSections\(builderPage\)\}/.test(sidhu)
  );

  const dialogs = read("components/admin/AdminDialogs.tsx");
  ok(
    "admin_dialogs_cancel_on_choose",
    />\s*Cancel\s*</.test(dialogs) && /choose:\s*\(message/.test(dialogs)
  );

  console.log(`\nphase-multi-111: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error("FAIL  suite_exception —", err?.stack || err);
  process.exit(1);
});
