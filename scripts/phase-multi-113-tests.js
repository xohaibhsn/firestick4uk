/**
 * F4UK-MULTI-113 — Blog editor stale-write guard
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
    id: 7,
    title: "Original Title",
    slug: "original-title",
    excerpt: "Original excerpt",
    content: "<p>Body</p>",
    category: "Guides",
    emoji: "📝",
    badge: "guide",
    badgeText: "Guide",
    featured_image: "",
    meta_title: "Meta",
    meta_description: "Desc",
    focus_keyword: "firestick",
    status: "draft",
    featured: 0,
    canonical_url: "https://firestick4uk.com/blog/original-title",
    faqs: null,
    active: 1,
    created_at: "2020-01-01 00:00:00",
    ...over,
  };
}

function makeHarness() {
  const rows = [seedRow()];
  const sqlLog = [];
  const audits = [];
  const revisions = [];
  const seoGuards = [];
  const stats = {
    updates: 0,
    began: 0,
    committed: 0,
    rolled: 0,
    released: 0,
    sitemap: 0,
  };

  function query(sql, params = []) {
    const s = String(sql).replace(/\s+/g, " ").trim();
    sqlLog.push(s);
    if (/FOR UPDATE/i.test(s)) {
      const id = Number(params[0]);
      return [rows.filter((r) => r.id === id).map((r) => ({ ...r })), []];
    }
    if (/SELECT \* FROM blog_posts WHERE id = \? LIMIT 1/i.test(s)) {
      const id = Number(params[0]);
      return [rows.filter((r) => r.id === id).map((r) => ({ ...r })), []];
    }
    if (/SELECT \* FROM blog_posts WHERE slug = \?/i.test(s)) {
      return [rows.filter((r) => r.slug === params[0]).map((r) => ({ ...r })), []];
    }
    if (/SELECT \* FROM blog_posts WHERE active = 1/i.test(s)) {
      return [rows.filter((r) => Number(r.active) === 1).map((r) => ({ ...r })), []];
    }
    if (/SELECT id FROM blog_posts WHERE slug = \?/i.test(s)) {
      return [[], []];
    }
    if (/^UPDATE blog_posts SET/i.test(s)) {
      stats.updates += 1;
      const id = Number(params[params.length - 1]);
      const row = rows.find((r) => r.id === id);
      if (row) {
        Object.assign(row, {
          title: params[0],
          slug: params[1],
          excerpt: params[2],
          content: params[3],
          category: params[4],
          emoji: params[5],
          badge: params[6],
          badgeText: params[7],
          featured_image: params[8],
          meta_title: params[9],
          meta_description: params[10],
          focus_keyword: params[11],
          status: params[12],
          featured: params[13],
          canonical_url: params[14],
          faqs: params[15],
        });
      }
      return [{ affectedRows: row ? 1 : 0 }, []];
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
    "../../lib/contentRevisions": {
      recordContentRevision: async (entry) => {
        revisions.push(entry);
      },
      snapshotBlog: (row) => ({ ...row }),
    },
    "@/lib/contentRevisions": {
      recordContentRevision: async (entry) => {
        revisions.push(entry);
      },
      snapshotBlog: (row) => ({ ...row }),
    },
    "../../lib/hostingerResourceInvalidation": {
      invalidateSitemapCache() {
        stats.sitemap += 1;
      },
    },
    "@/lib/hostingerResourceInvalidation": {
      invalidateSitemapCache() {
        stats.sitemap += 1;
      },
    },
    "../../lib/postSaveSeoGuard": {
      runPostSaveSeoGuard: async (args) => {
        seoGuards.push(args);
        return { status: "checked", entity_type: "blog", entity_id: String(args.entityId), operation: args.operation, issue_count: 0, needs_attention: 0, review: 0, issues: [], memory_synced: true };
      },
      shouldRunPostSaveSeoGuard: () => ({ run: false, skip_reason: "noop_update" }),
    },
    "@/lib/postSaveSeoGuard": {
      runPostSaveSeoGuard: async (args) => {
        seoGuards.push(args);
        return { status: "checked", entity_type: "blog", entity_id: String(args.entityId), operation: args.operation, issue_count: 0, needs_attention: 0, review: 0, issues: [], memory_synced: true };
      },
      shouldRunPostSaveSeoGuard: () => ({ run: false, skip_reason: "noop_update" }),
    },
    "../../lib/rateLimit": {
      getClientIp: () => "127.0.0.1",
      RL_PUBLIC_GET: () => ({ allowed: true, retryAfterSec: 0 }),
    },
    "@/lib/rateLimit": {
      getClientIp: () => "127.0.0.1",
      RL_PUBLIC_GET: () => ({ allowed: true, retryAfterSec: 0 }),
    },
  };

  const mod = loadTs("pages/api/blog.ts", stubs);
  return {
    handler: mod.default || mod,
    rows,
    sqlLog,
    audits,
    revisions,
    seoGuards,
    stats,
    reset() {
      rows.splice(0, rows.length, seedRow());
      sqlLog.splice(0, sqlLog.length);
      audits.splice(0, audits.length);
      revisions.splice(0, revisions.length);
      seoGuards.splice(0, seoGuards.length);
      stats.updates = 0;
      stats.began = 0;
      stats.committed = 0;
      stats.rolled = 0;
      stats.released = 0;
      stats.sitemap = 0;
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
  console.log("\n# MULTI-113 blog stale-write guard");

  const hashes = loadTs("lib/blogBaseHash.ts");
  const { blogRowBaseHash, BLOG_WRITE_COLUMNS } = hashes;

  const base = seedRow();
  const baseHash = blogRowBaseHash(base);
  ok("hash_is_sha256_hex", typeof baseHash === "string" && baseHash.length === 64);
  ok("hash_stable", blogRowBaseHash(base) === baseHash);
  ok(
    "null_and_empty_string_hash_differ",
    blogRowBaseHash({ ...base, excerpt: null }) !== blogRowBaseHash({ ...base, excerpt: "" })
  );
  ok(
    "created_at_does_not_change_hash",
    blogRowBaseHash({ ...base, created_at: "2030-01-01" }) === baseHash
  );
  ok(
    "active_does_not_change_hash",
    blogRowBaseHash({ ...base, active: 0 }) === baseHash
  );
  ok(
    "id_does_not_change_hash",
    blogRowBaseHash({ ...base, id: 99 }) === baseHash
  );
  for (const col of BLOG_WRITE_COLUMNS) {
    const next = { ...base };
    next[col] = base[col] === "x-changed" ? "y-changed" : "x-changed";
    ok(`hash_changes_when_${col}_changes`, blogRowBaseHash(next) !== baseHash);
  }
  ok(
    "raw_featured_not_coerced",
    blogRowBaseHash({ ...base, featured: 0 }) !== blogRowBaseHash({ ...base, featured: false })
  );

  const h = makeHarness();

  // --- Public GET: no base_hash ---
  {
    h.reset();
    const res = await invoke(h.handler, {
      method: "GET",
      query: { slug: "original-title" },
    });
    ok("public_get_200", res.statusCode === 200 && res.body && res.body.id === 7);
    ok(
      "public_get_no_base_hash",
      res.body && !Object.prototype.hasOwnProperty.call(res.body, "base_hash")
    );
    ok("public_get_keeps_raw_excerpt", res.body && res.body.excerpt === "Original excerpt");
  }

  // --- Admin list + id include base_hash of the raw row ---
  {
    h.reset();
    const list = await invoke(h.handler, { method: "GET", query: {} });
    ok("admin_list_200", list.statusCode === 200 && Array.isArray(list.body) && list.body.length === 1);
    ok(
      "admin_list_base_hash",
      list.body[0].base_hash === blogRowBaseHash(h.rows[0]) &&
        list.body[0].base_hash === baseHash
    );
    const one = await invoke(h.handler, { method: "GET", query: { id: "7" } });
    ok("admin_id_200", one.statusCode === 200 && one.body && one.body.id === 7);
    ok("admin_id_base_hash", one.body.base_hash === baseHash);
    ok("admin_id_keeps_created_at", one.body.created_at === "2020-01-01 00:00:00");
  }

  // --- PUT match → update + revision + SEO guard + new base_hash ---
  {
    h.reset();
    const res = await invoke(h.handler, {
      method: "PUT",
      query: {},
      body: { id: 7, excerpt: "Updated excerpt", base_hash: baseHash },
    });
    ok("put_match_200", res.statusCode === 200 && res.body && res.body.success === true);
    ok("put_match_updated", h.stats.updates === 1 && h.rows[0].excerpt === "Updated excerpt");
    ok("put_match_revision", h.revisions.length === 1);
    ok(
      "put_match_seo_guard",
      h.seoGuards.length === 1 && h.seoGuards[0].operation === "update"
    );
    ok("put_match_sitemap", h.stats.sitemap === 1);
    ok("put_match_released", h.stats.released === 1 && h.stats.committed === 1);
    const expected = blogRowBaseHash(h.rows[0]);
    ok(
      "put_match_returns_new_base_hash",
      res.body.base_hash === expected && res.body.base_hash !== baseHash
    );
    ok(
      "put_match_no_overwrite_audit",
      !h.audits.some((a) => a.action === "blog.overwrite_stale")
    );
  }

  // --- mismatch → 409, no write, no revision, no audit, no SEO, connection released ---
  {
    h.reset();
    const res = await invoke(h.handler, {
      method: "PUT",
      query: {},
      body: {
        id: 7,
        title: "Hijack Title",
        excerpt: "stale excerpt",
        base_hash: blogRowBaseHash({ ...base, excerpt: "someone-else" }),
      },
    });
    ok("put_mismatch_409", res.statusCode === 409 && res.body && res.body.error === "stale");
    ok(
      "put_mismatch_conflicts",
      Array.isArray(res.body.conflicts) &&
        res.body.conflicts.length === 1 &&
        res.body.conflicts[0].id === 7 &&
        res.body.conflicts[0].title === "Original Title"
    );
    ok("put_mismatch_no_update", h.stats.updates === 0 && h.rows[0].excerpt === "Original excerpt");
    ok("put_mismatch_title_unchanged", h.rows[0].title === "Original Title");
    ok("put_mismatch_no_revision", h.revisions.length === 0);
    ok("put_mismatch_no_audit", h.audits.length === 0);
    ok("put_mismatch_no_seo", h.seoGuards.length === 0);
    ok("put_mismatch_no_sitemap", h.stats.sitemap === 0);
    ok("put_mismatch_rolled_back", h.stats.rolled === 1 && h.stats.committed === 0);
    ok("put_mismatch_released", h.stats.released === 1);
    ok(
      "put_mismatch_no_update_sql",
      h.sqlLog.some((s) => /FOR UPDATE/i.test(s)) &&
        !h.sqlLog.some((s) => /^UPDATE blog_posts/i.test(s))
    );
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
        body: { id: 7, excerpt: "Legacy excerpt" },
      });
    } finally {
      console.log = orig;
    }
    const legacy = seen.filter((a) => a[0] === "blog.save_without_base_hash");
    ok("put_legacy_200", res.statusCode === 200 && res.body && res.body.success === true);
    ok("put_legacy_wrote", h.stats.updates === 1 && h.rows[0].excerpt === "Legacy excerpt");
    ok("put_legacy_seo", h.seoGuards.length === 1);
    ok(
      "put_legacy_log_id_only",
      legacy.length === 1 && legacy[0].length === 2 && String(legacy[0][1]) === "7"
    );
    ok(
      "put_legacy_returns_base_hash",
      res.body.base_hash === blogRowBaseHash(h.rows[0])
    );
  }

  // --- force → write + blog.overwrite_stale (id only) ---
  {
    h.reset();
    const forcedExcerpt = "FORCED_EXCERPT_VALUE";
    const res = await invoke(h.handler, {
      method: "PUT",
      query: {},
      body: {
        id: 7,
        excerpt: forcedExcerpt,
        base_hash: blogRowBaseHash({ ...base, excerpt: "wrong" }),
        force: true,
      },
    });
    ok("put_force_200", res.statusCode === 200 && h.rows[0].excerpt === forcedExcerpt);
    ok("put_force_revision_and_seo", h.revisions.length === 1 && h.seoGuards.length === 1);
    const ow = h.audits.find((a) => a.action === "blog.overwrite_stale");
    const owJson = JSON.stringify(ow || {});
    ok("put_force_overwrite_audit", !!ow && String(ow.entityId) === "7");
    ok(
      "put_force_audit_id_only",
      ow &&
        ow.metadata &&
        Object.keys(ow.metadata).join(",") === "id" &&
        ow.metadata.id === 7 &&
        !owJson.includes(forcedExcerpt) &&
        !owJson.includes("Original Title")
    );
    ok(
      "put_force_new_base_hash",
      res.body.base_hash === blogRowBaseHash(h.rows[0]) && res.body.base_hash !== baseHash
    );
    ok("put_force_released", h.stats.released === 1);
  }

  // --- second save with returned hash does not false-conflict ---
  {
    h.reset();
    const first = await invoke(h.handler, {
      method: "PUT",
      query: {},
      body: { id: 7, excerpt: "First save", base_hash: baseHash },
    });
    const second = await invoke(h.handler, {
      method: "PUT",
      query: {},
      body: { id: 7, excerpt: "Second save", base_hash: first.body.base_hash },
    });
    ok(
      "put_second_save_no_false_conflict",
      second.statusCode === 200 &&
        second.body.success === true &&
        h.rows[0].excerpt === "Second save"
    );
  }

  // --- public helpers / pages do not grow base_hash ---
  for (const rel of [
    "lib/publicBlogServer.ts",
    "app/blog/page.tsx",
    "app/blog/[slug]/page.tsx",
    "app/sitemap.ts",
    "lib/sitemapDataServer.ts",
    "lib/postSaveSeoGuard.ts",
  ]) {
    ok(`source_${rel}_no_base_hash`, !/base_hash/.test(read(rel)));
  }

  const api = read("pages/api/blog.ts");
  const postStart = api.indexOf("if (req.method === 'POST')");
  const putStart = api.indexOf("if (req.method === 'PUT')");
  const delStart = api.indexOf("if (req.method === 'DELETE')");
  const postBlock = api.slice(postStart, putStart);
  const putBlock = api.slice(putStart, delStart);
  const delBlock = api.slice(delStart, api.indexOf("return res.status(405)"));
  const getBlock = api.slice(api.indexOf("if (req.method === 'GET')"), postStart);
  const slugBranch = getBlock.slice(0, getBlock.indexOf("setAdminNoStore"));
  ok("source_public_slug_no_base_hash", !/base_hash|blogRowBaseHash/.test(slugBranch));
  ok("source_admin_get_attaches_hash", /withAdminBlogBaseHash/.test(getBlock));
  ok("source_post_unchanged", !/base_hash|baseHash|\bforce\b/.test(postBlock));
  ok("source_delete_unchanged", !/base_hash|baseHash/.test(delBlock));
  ok(
    "source_put_passes_base_hash_and_force",
    /baseHash:\s*typeof body\.base_hash === 'string' \? body\.base_hash : undefined/.test(putBlock) &&
      /force:\s*body\.force === true/.test(putBlock)
  );
  ok(
    "source_put_409_shape",
    /error:\s*'stale'/.test(putBlock) && /conflicts:/.test(putBlock)
  );

  const sidhu = read("app/sidhu/page.tsx");
  ok(
    "client_blogpost_has_base_hash",
    /type BlogPost = \{[\s\S]*?base_hash\?: string;/.test(sidhu)
  );
  const saveStart = sidhu.indexOf("const saveBlog = async");
  const saveEnd = sidhu.indexOf("const deleteBlog = async", saveStart);
  const saveBlock = sidhu.slice(saveStart, saveEnd);
  ok(
    "client_editor_put_sends_base_hash",
    /body\.base_hash = blogEditorBaseHash/.test(saveBlock) &&
      /method: isNew \? "POST" : "PUT"/.test(saveBlock)
  );
  ok(
    "client_new_post_does_not_attach_hash",
    /const body: Record<string, unknown> = isNew\s*\?\s*\{ \.\.\.payload \}/.test(saveBlock) &&
      /if \(!isNew && typeof blogEditorBaseHash === "string"\)/.test(saveBlock)
  );
  ok(
    "client_stores_returned_base_hash",
    /setBlogEditorBaseHash\(nextHash\)/.test(saveBlock) &&
      /base_hash: nextHash/.test(saveBlock)
  );
  ok(
    "client_open_keeps_server_hash",
    /setBlogEditorBaseHash\(typeof p\.base_hash === "string" \? p\.base_hash : undefined\)/.test(sidhu)
  );
  const staleAt = saveBlock.indexOf('status === 409 && res.error === "stale"');
  const successAt = saveBlock.indexOf("if (res.success)");
  const conflictBlock = saveBlock.slice(staleAt, successAt);
  ok("client_handles_409_stale", staleAt >= 0 && successAt > staleAt);
  ok(
    "client_409_keeps_editor_open",
    !/setBlogModal\(null\)/.test(conflictBlock)
  );
  ok(
    "client_conflict_message",
    /This post was changed by someone else after you opened it:/.test(conflictBlock) &&
      /Reload to get the latest version, or Overwrite to keep yours\./.test(conflictBlock)
  );
  ok(
    "client_reload_overwrite_cancel",
    /label:\s*"Reload"/.test(conflictBlock) &&
      /label:\s*"Overwrite"/.test(conflictBlock) &&
      /Save cancelled — unresolved conflict/.test(conflictBlock)
  );
  ok("client_overwrite_sends_force", /saveBlog\(\{\s*force:\s*true\s*\}\)/.test(conflictBlock));
  const reloadAt = conflictBlock.indexOf('choice === "reload"');
  const confirmAt = conflictBlock.indexOf("askConfirm(");
  const refetchAt = conflictBlock.indexOf("/api/blog?id=");
  ok(
    "client_reload_confirms_then_refetches",
    reloadAt >= 0 && confirmAt > reloadAt && refetchAt > confirmAt &&
      /openEditBlog\(fresh\)/.test(conflictBlock)
  );

  const mapAt = sidhu.indexOf("{blogPosts.map(p => (");
  const mapEnd = sidhu.indexOf("</tbody>", mapAt);
  const mapBlock = sidhu.slice(mapAt, mapEnd);
  ok(
    "client_list_toggles_do_not_send_base_hash",
    mapAt >= 0 &&
      !/base_hash/.test(mapBlock) &&
      !/method:\s*"PUT"/.test(mapBlock) &&
      !/\/api\/blog/.test(mapBlock)
  );
  const deleteStart = sidhu.indexOf("const deleteBlog = async");
  const deleteEnd = sidhu.indexOf("const deleteProduct = async", deleteStart);
  ok(
    "client_delete_does_not_send_base_hash",
    !/base_hash/.test(sidhu.slice(deleteStart, deleteEnd))
  );

  console.log(`\nphase-multi-113: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error("FAIL  suite_exception —", err && err.stack ? err.stack : err);
  process.exit(1);
});
