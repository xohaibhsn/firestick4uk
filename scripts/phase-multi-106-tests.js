/**
 * F4UK-MULTI-106 — CMS Revisions UI: side-by-side compare, per-field History drawer.
 * Static + stubbed handler + SSR render only. No .env*, no real DB, no network.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const Module = require("module");
const { execFileSync } = require("child_process");
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

function count(re, s) {
  const m = s.match(re);
  return m ? m.length : 0;
}

const cache = new Map();
function loadTs(rel, stubs = {}) {
  const abs = path.join(ROOT, rel);
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

/** Minimal mock Next req/res. */
function mockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v;
    },
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
  };
  return res;
}

(async () => {
  // React is needed for tsx transpiled with the classic JSX runtime.
  global.React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const h = global.React.createElement;

  // ───────────────────────── files exist ─────────────────────────
  ok("textDiff_exists", exists("lib/textDiff.ts"));
  ok("revisionCompare_exists", exists("lib/revisionCompare.ts"));
  ok("compareView_exists", exists("components/admin/RevisionCompareView.tsx"));
  ok("fieldDrawer_exists", exists("components/admin/FieldHistoryDrawer.tsx"));
  ok("seo_guard_tests_still_exist", exists("scripts/phase-seo-revision-restore-guard-tests.js"));

  // ───────────────────────── A. textDiff ─────────────────────────
  const td = loadTs("lib/textDiff.ts");
  const join = (ops, ...types) => ops.filter((o) => types.includes(o.type)).map((o) => o.text).join("");

  {
    const d = td.diffWords("hello brave world", "hello brave world");
    ok(
      "diff_unchanged",
      !d.tooLarge && d.ops.length === 1 && d.ops[0].type === "equal" && d.ops[0].text === "hello brave world"
    );
  }
  {
    const d = td.diffWords("the quick fox", "the quick brown fox");
    ok(
      "diff_insert",
      d.ops.some((o) => o.type === "insert" && o.text.trim() === "brown") &&
        !d.ops.some((o) => o.type === "delete")
    );
    ok("diff_insert_roundtrip", join(d.ops, "equal", "insert") === "the quick brown fox" && join(d.ops, "equal", "delete") === "the quick fox");
  }
  {
    const d = td.diffWords("the quick brown fox", "the quick fox");
    ok(
      "diff_delete",
      d.ops.some((o) => o.type === "delete" && o.text.trim() === "brown") &&
        !d.ops.some((o) => o.type === "insert")
    );
  }
  {
    const d = td.diffWords("price is cheap today", "price is expensive today");
    const del = d.ops.find((o) => o.type === "delete");
    const ins = d.ops.find((o) => o.type === "insert");
    ok("diff_replace", !!del && !!ins && del.text.trim() === "cheap" && ins.text.trim() === "expensive");
    ok(
      "diff_replace_delete_before_insert",
      d.ops.findIndex((o) => o.type === "delete") < d.ops.findIndex((o) => o.type === "insert")
    );
    ok(
      "diff_replace_roundtrip",
      join(d.ops, "equal", "delete") === "price is cheap today" &&
        join(d.ops, "equal", "insert") === "price is expensive today"
    );
  }
  {
    const a = "Café — streaming 📺 für Ärzte 日本語 テスト";
    const b = "Café — streaming 📺 für Ärzte 中文 テスト";
    const d = td.diffWords(a, b);
    ok(
      "diff_unicode",
      !d.tooLarge &&
        join(d.ops, "equal", "delete") === a &&
        join(d.ops, "equal", "insert") === b &&
        d.ops.some((o) => o.type === "delete" && o.text.includes("日本語")) &&
        d.ops.some((o) => o.type === "insert" && o.text.includes("中文"))
    );
  }
  {
    const e1 = td.diffWords("", "");
    ok("diff_empty_both", !e1.tooLarge && e1.ops.length === 0);
    const e2 = td.diffWords("", "added");
    ok("diff_from_empty", e2.ops.length === 1 && e2.ops[0].type === "insert");
    const e3 = td.diffWords("gone", "");
    ok("diff_to_empty", e3.ops.length === 1 && e3.ops[0].type === "delete");
    const e4 = td.diffWords(null, undefined);
    ok("diff_nullish_safe", !e4.tooLarge && e4.ops.length === 0);
  }
  {
    const big = "word ".repeat(td.TEXT_DIFF_MAX_CHARS / 5 + 10);
    const d = td.diffWords(big, "small");
    ok("diff_large_input_fallback", d.tooLarge === true && d.ops.length === 0, `len=${big.length}`);
    ok("diff_large_other_side_fallback", td.diffWords("small", big).tooLarge === true);
    ok("diff_limit_constant_20000", td.TEXT_DIFF_MAX_CHARS === 20000);
    // Many distinct tokens each side -> LCS table cap even when under the char cap.
    const a = Array.from({ length: 4500 }, (_, i) => "a" + i).join(" ");
    const b = Array.from({ length: 4500 }, (_, i) => "b" + i).join(" ");
    const dd = td.diffWords(a, b, 1_000_000);
    ok("diff_cell_cap_fallback", dd.tooLarge === true);
    const t0 = Date.now();
    const common = Array.from({ length: 3000 }, (_, i) => "w" + i).join(" ");
    const near = td.diffWords(common + " tail1", common + " tail2");
    ok("diff_common_prefix_fast", !near.tooLarge && Date.now() - t0 < 1500);
  }
  {
    const text = td.stripHtmlForDiff('<p>Hello&nbsp;<strong>world</strong></p><script>alert(1)</script><style>p{}</style> &amp; &lt;ok&gt;');
    ok("strip_html_text_only", text === "Hello world & <ok>", JSON.stringify(text));
    ok("strip_html_no_double_decode", td.stripHtmlForDiff("&amp;lt;") === "&lt;");
    ok("valuesEqual_null_and_empty", td.valuesEqual(null, "") && td.valuesEqual(1, "1") && !td.valuesEqual("a", "b"));
  }

  // ───────────────────────── revisionCompare lib ─────────────────────────
  const rc = loadTs("lib/revisionCompare.ts");
  const serverRev = loadTs("lib/contentRevisions.ts", { "./db": { default: { query: async () => [[]] } } });

  {
    const serverFields = Array.from(serverRev.PRODUCT_SNAPSHOT_FIELDS);
    const compareFields = Array.from(rc.PRODUCT_COMPARE_FIELDS);
    const skipped = new Set(["id", "product_version"]);
    ok(
      "compare_fields_cover_server_snapshot_fields",
      serverFields.filter((f) => !skipped.has(f)).every((f) => compareFields.includes(f)),
      serverFields.filter((f) => !skipped.has(f) && !compareFields.includes(f)).join(",")
    );
    ok(
      "compare_fields_subset_of_server_snapshot_fields",
      compareFields.every((f) => serverFields.includes(f))
    );
    ok(
      "compare_fields_include_required",
      ["name", "price", "slug", "short_description", "full_description", "seo_title", "meta_description", "season_name", "season_starts_at", "season_ends_at"].every(
        (f) => compareFields.includes(f)
      )
    );
    const blogServer = Array.from(serverRev.BLOG_SNAPSHOT_FIELDS).filter((f) => f !== "id");
    ok("blog_compare_fields_cover_server", blogServer.every((f) => rc.BLOG_COMPARE_FIELDS.includes(f)));
  }
  {
    const rows = rc.buildCompareRows({
      entityType: "product",
      revisionSnapshot: { name: "Old", slug: "s", price: "9.90", short_description: "<p>a</p>", season_name: "Sale" },
      currentSnapshot: { name: "New", slug: "s", price: 9.9, short_description: "<p>b</p>", season_name: "Sale" },
    });
    const byField = Object.fromEntries(rows.map((r) => [r.field, r]));
    ok("rows_name_changed", byField.name.changed && byField.name.before === "Old" && byField.name.after === "New");
    ok("rows_price_numeric_equal", byField.price.changed === false);
    ok("rows_slug_unchanged", byField.slug.changed === false);
    ok("rows_html_flagged", byField.short_description.html === true && byField.short_description.changed === true);
    ok("rows_seasonal_included", !!byField.season_name && byField.season_name.changed === false);
    ok("rows_missing_field_not_marked_changed", (() => {
      const r = rc.buildCompareRows({ entityType: "product", revisionSnapshot: { name: "x" }, currentSnapshot: { name: "x", seo_title: "t" } });
      const row = r.find((x) => x.field === "seo_title");
      return row && row.recorded === false && row.changed === false;
    })());
    const focus = rc.buildCompareRows({
      entityType: "product",
      revisionSnapshot: { name: "A", price: "1" },
      currentSnapshot: { name: "A", price: "2" },
      focusField: "price",
    });
    ok("rows_focus_field_first", focus[0].field === "price");
  }
  {
    const batch = { values: { home_a: "1", home_b: "2" }, metadata: { rows: {}, keys: ["home_a", "home_b"] } };
    const legacy = { content_key: "k1", content_value: "v1" };
    ok("snapshotValues_batch", JSON.stringify(rc.snapshotValues("site_content_batch", batch)) === JSON.stringify({ home_a: "1", home_b: "2" }));
    ok("snapshotValues_legacy_single", rc.snapshotValues("site_content", legacy).k1 === "v1");
    ok("snapshotFieldValue_key", rc.snapshotFieldValue("site_content", batch, "home_b") === "2");
    ok("snapshotFieldNames_batch", rc.snapshotFieldNames("site_content_batch", batch).join(",") === "home_a,home_b");
  }
  {
    const calls = [];
    const mkFetch = (routes) => async (url, init) => {
      calls.push({ url, init });
      for (const [match, resp] of routes) {
        if (url.includes(match)) {
          return { ok: resp.status >= 200 && resp.status < 300, status: resp.status, json: async () => resp.body };
        }
      }
      return { ok: false, status: 404, json: async () => null };
    };
    const prod = await rc.fetchCurrentForRevision(
      "product",
      "7",
      {},
      mkFetch([["/api/admin-products", { status: 200, body: [{ id: 1 }, { id: 7, name: "P", product_version: 4 }] }]])
    );
    ok("fetch_current_product", prod.ok && prod.version === 4 && prod.snapshot.name === "P");
    const missing = await rc.fetchCurrentForRevision("product", "99", {}, mkFetch([["/api/admin-products", { status: 200, body: [] }]]));
    ok("fetch_current_product_missing", !missing.ok && missing.status === 404);
    const forbidden = await rc.fetchCurrentForRevision("product", "7", {}, mkFetch([["/api/admin-products", { status: 403, body: {} }]]));
    ok("fetch_current_product_403", !forbidden.ok && forbidden.status === 403);
    const blog = await rc.fetchCurrentForRevision("blog", "3", {}, mkFetch([["/api/blog?id=3", { status: 200, body: { id: 3, title: "T" } }]]));
    ok("fetch_current_blog", blog.ok && blog.snapshot.title === "T" && blog.version === null);
    const content = await rc.fetchCurrentForRevision(
      "site_content_batch",
      "a,b",
      { values: { a: "old", b: "old" } },
      mkFetch([["/api/site-content?page=all&scope=admin", { status: 200, body: { a: "now", z: "ignored" } }]])
    );
    ok(
      "fetch_current_site_content_values_for_snapshot_keys",
      content.ok && content.snapshot.values.a === "now" && content.snapshot.values.b === "" && !("z" in content.snapshot.values)
    );
    ok(
      "fetch_current_is_GET_no_body",
      calls.every((c) => !c.init || !c.init.method || c.init.method === "GET") && calls.every((c) => !(c.init && c.init.body))
    );
    const unsupported = await rc.fetchCurrentForRevision("section", "1", {}, mkFetch([]));
    ok("fetch_current_unsupported_type", !unsupported.ok);
    const q = rc.buildFieldHistoryQuery({ entityType: "product", entityId: 5, field: "name", page: 2, limit: 10 });
    ok(
      "field_history_query_shape",
      q.includes("entity_type=product") && q.includes("entity_id=5") && q.includes("field=name") && q.includes("page=2")
    );
  }

  // ───────────────────────── C. client permission helpers ─────────────────────────
  const client = loadTs("lib/contentRevisionsClient.ts");
  const perms = loadTs("lib/adminPermissions.ts");
  {
    const roles = ["super_admin", "manager", "writer"];
    const types = ["product", "blog", "site_content", "site_settings", "site_content_batch", "section", "bogus"];
    let mismatch = [];
    for (const r of roles) {
      for (const t of types) {
        if (client.canRestoreRevisionEntity(r, t) !== serverRev.canRestoreRevisionEntity(r, t)) mismatch.push(`${r}:${t}`);
        if (client.canViewRevisionEntity(r, t) !== serverRev.canViewRevisionEntity(r, t)) mismatch.push(`view ${r}:${t}`);
      }
      if (JSON.stringify(client.revisionEntityTypesForRole(r)) !== JSON.stringify(serverRev.revisionEntityTypesForRole(r))) {
        mismatch.push(`types ${r}`);
      }
    }
    ok("client_canRestore_mirrors_server_all_roles_types", mismatch.length === 0, mismatch.join(","));
  }
  {
    const upd = (t) => ({ entity_type: t, revision_action: "update" });
    ok("restore_offer_super_admin_all", ["product", "blog", "site_content", "site_settings", "site_content_batch", "section"].every((t) => client.canOfferRestoreRevision(upd(t), "super_admin")));
    ok("restore_offer_manager_product_blog_content", client.canOfferRestoreRevision(upd("product"), "manager") && client.canOfferRestoreRevision(upd("blog"), "manager") && client.canOfferRestoreRevision(upd("site_content"), "manager") && client.canOfferRestoreRevision(upd("site_content_batch"), "manager"));
    ok("restore_offer_manager_no_settings_or_section", !client.canOfferRestoreRevision(upd("site_settings"), "manager") && !client.canOfferRestoreRevision(upd("section"), "manager"));
    ok("restore_offer_writer_blog_only", client.canOfferRestoreRevision(upd("blog"), "writer") && !client.canOfferRestoreRevision(upd("product"), "writer") && !client.canOfferRestoreRevision(upd("site_content"), "writer"));
    ok("restore_offer_deleted_product_blog_view_only", !client.canOfferRestoreRevision({ entity_type: "product", revision_action: "delete" }, "super_admin") && !client.canOfferRestoreRevision({ entity_type: "blog", revision_action: "delete" }, "super_admin"));
    ok("restore_offer_deleted_content_ok", client.canOfferRestoreRevision({ entity_type: "site_content", revision_action: "delete" }, "manager"));
    ok("canViewRevisions_all_roles_have_permission", ["super_admin", "manager", "writer"].every((r) => client.canViewRevisionsForRole(r) === perms.hasAdminPermission(r, "revisions.view")));
    ok("client_uses_pure_adminPermissions", /from "\.\/adminPermissions"/.test(read("lib/contentRevisionsClient.ts")) && !/from "\.\/db"|mysql2|adminAuth/.test(read("lib/contentRevisionsClient.ts")));
    // Pre-existing panel behaviour preserved through the delegation (old inline matrix).
    function oldCanOfferRestore(item, role) {
      if (item.revision_action === "delete") return item.entity_type === "site_content" || item.entity_type === "site_settings";
      if (item.entity_type === "site_settings" && role !== "super_admin") return false;
      if (item.entity_type === "section" && role !== "super_admin") return false;
      if (item.entity_type === "product" || item.entity_type === "blog") return role === "super_admin" || role === "manager" || (item.entity_type === "blog" && role === "writer");
      if (item.entity_type === "site_content" || item.entity_type === "site_content_batch") return role === "super_admin" || role === "manager";
      return role === "super_admin";
    }
    const diffs = [];
    for (const r of ["super_admin", "manager", "writer"]) {
      for (const t of ["product", "blog", "site_content", "site_settings", "site_content_batch", "section"]) {
        for (const a of ["update", "delete", "restore"]) {
          const item = { entity_type: t, revision_action: a };
          // Old panel only evaluated rows the role could already see.
          if (!client.canViewRevisionEntity(r, t)) continue;
          if (oldCanOfferRestore(item, r) !== client.canOfferRestoreRevision(item, r)) diffs.push(`${r}:${t}:${a}`);
        }
      }
    }
    ok("history_panel_restore_matrix_unchanged", diffs.length === 0, diffs.join(","));
  }
  {
    const body = client.buildRestoreBody(12, 3);
    ok("restore_body_with_expected_version", JSON.stringify(body) === '{"revision_id":12,"expected_version":3}');
    ok("restore_body_without_expected_version", JSON.stringify(client.buildRestoreBody(12)) === '{"revision_id":12}' && JSON.stringify(client.buildRestoreBody(12, null)) === '{"revision_id":12}');
    ok("restore_body_zero_version_kept", JSON.stringify(client.buildRestoreBody(12, 0)) === '{"revision_id":12,"expected_version":0}');
    ok("restore_endpoint_existing", client.RESTORE_ENDPOINT === "/api/admin-revisions/restore" && exists("pages/api/admin-revisions/restore.ts"));
  }

  // The legend always renders exactly one sample <del> and one sample <ins>.
  const LEGEND_TAGS = 1;

  // ───────────────────────── A. compare view (source + SSR) ─────────────────────────
  const cmpSrc = read("components/admin/RevisionCompareView.tsx");
  ok("compare_uses_del_and_ins", /<del[\s>]/.test(cmpSrc) && /<ins[\s>]/.test(cmpSrc));
  ok("compare_not_colour_only_sr_labels", /\[removed: /.test(cmpSrc) && /\[added: /.test(cmpSrc) && /line-through/.test(cmpSrc) && /underline/.test(cmpSrc));
  ok("compare_changed_badge_text", /● Changed/.test(cmpSrc));
  ok("compare_labels_revision_vs_current", /Revision \$\{when\}, \$\{who\}/.test(cmpSrc) && /currentLabel = "Current"/.test(cmpSrc));
  ok("compare_stacked_mobile_grid", /grid-template-columns:1fr 1fr/.test(cmpSrc) && /@media \(max-width: 720px\)\{\.f4uk-rev-grid\{grid-template-columns:1fr\}/.test(cmpSrc));
  ok("compare_too_large_message", /too large to diff — showing both versions/.test(cmpSrc));
  ok("compare_rendered_toggle", /compare-mode-rendered/.test(cmpSrc) && /Rendered/.test(cmpSrc) && /compare-mode-text/.test(cmpSrc));
  ok("compare_rendered_uses_CmsBody", /import CmsBody from "@\/components\/CmsBody"/.test(cmpSrc) && count(/<CmsBody html=/g, cmpSrc) >= 3);
  ok("compare_no_dangerouslySetInnerHTML", !/dangerouslySetInnerHTML/.test(cmpSrc));
  ok("compare_no_direct_xss_or_innerHTML", !/from "xss"/.test(cmpSrc) && !/innerHTML/.test(cmpSrc));
  ok("compare_uses_textDiff_and_strip", /diffWords/.test(cmpSrc) && /stripHtmlForDiff/.test(cmpSrc));
  ok("compare_current_fetch_read_only", !/method:\s*["'](POST|PUT|PATCH|DELETE)/.test(cmpSrc + read("lib/revisionCompare.ts")));

  // Which files may use dangerouslySetInnerHTML: none of the new/edited revision UI files.
  const uiFiles = [
    "components/admin/RevisionCompareView.tsx",
    "components/admin/FieldHistoryDrawer.tsx",
    "components/admin/ContentHistoryPanel.tsx",
    "components/admin/AdminContentPanel.tsx",
    "components/admin/CmsPreviewPane.tsx",
    "lib/revisionCompare.ts",
    "lib/textDiff.ts",
    "lib/contentRevisionsClient.ts",
  ];
  ok("no_dangerouslySetInnerHTML_in_revision_ui", uiFiles.every((f) => !/dangerouslySetInnerHTML/.test(read(f))), uiFiles.filter((f) => /dangerouslySetInnerHTML/.test(read(f))).join(","));
  const cmsBodySrc = read("components/CmsBody.tsx");
  ok("CmsBody_sanitises_with_xss", /xss\(html, bodyXss\)/.test(cmsBodySrc) && /stripIgnoreTag:\s*true/.test(cmsBodySrc));
  ok("CmsBody_unmodified_scope", !/revision/i.test(cmsBodySrc));

  {
    // SSR: real CmsBody + real compare view.
    const Compare = loadTs("components/admin/RevisionCompareView.tsx").default;
    const rev = { name: "Old name here", short_description: "<p>Hello <strong>world</strong></p>", price: "9.99" };
    const cur = { name: "New name here", short_description: "<p>Hello brave world</p>", price: "9.99" };
    const textHtml = renderToStaticMarkup(
      h(Compare, {
        entityType: "product",
        revisionSnapshot: rev,
        currentSnapshot: cur,
        revisionLabel: "Revision 1 Jan 2026, Alice",
      })
    );
    ok("ssr_text_mode_has_del_and_ins", /<del[\s>]/.test(textHtml) && /<ins[\s>]/.test(textHtml));
    ok("ssr_accessible_labels", /\[removed: /.test(textHtml) && /\[added: /.test(textHtml));
    ok("ssr_revision_vs_current_headers", textHtml.includes("Revision 1 Jan 2026, Alice") && textHtml.includes(">Current<"));
    ok("ssr_product_field_rows_highlighted", /data-compare-field="name" data-compare-changed="1"/.test(textHtml) && /data-compare-field="short_description" data-compare-changed="1"/.test(textHtml));
    ok("ssr_unchanged_fields_hidden_by_default", !/data-compare-field="price"/.test(textHtml));
    ok("ssr_text_mode_strips_html_tags", !/<strong>/.test(textHtml) && !/<p>/.test(textHtml));

    const evil =
      '<p>safe</p><script>alert("x")</script><img src=x onerror="alert(1)"><a href="javascript:alert(1)">bad</a>';
    const renderedEvil = renderToStaticMarkup(
      h(Compare, {
        entityType: "site_content",
        revisionSnapshot: { values: { about_body: evil } },
        currentSnapshot: { values: { about_body: "<p>other</p>" } },
        revisionLabel: "Revision",
        defaultMode: "rendered",
      })
    );
    ok("ssr_rendered_mode_sanitised_script_removed", !/<script/i.test(renderedEvil) && !/onerror/i.test(renderedEvil));
    ok("ssr_rendered_mode_javascript_href_removed", !/href="javascript:/i.test(renderedEvil));
    ok("ssr_rendered_mode_keeps_safe_html", /<p>safe<\/p>/.test(renderedEvil) && /<p>other<\/p>/.test(renderedEvil));

    const textEvil = renderToStaticMarkup(
      h(Compare, {
        entityType: "site_content",
        revisionSnapshot: { values: { about_body: evil } },
        currentSnapshot: { values: { about_body: "<p>other</p>" } },
        revisionLabel: "Revision",
      })
    );
    ok("ssr_text_mode_never_injects_html", !/<script/i.test(textEvil) && !/<img/i.test(textEvil) && !/onerror/i.test(textEvil));

    const longA = "word ".repeat(5000);
    const longB = "other ".repeat(5000);
    const bigHtml = renderToStaticMarkup(
      h(Compare, {
        entityType: "site_content",
        revisionSnapshot: { values: { k: longA } },
        currentSnapshot: { values: { k: longB } },
        revisionLabel: "Revision",
      })
    );
    ok("ssr_too_large_message_and_both_versions", /too large to diff — showing both versions/.test(bigHtml) && bigHtml.includes("word word") && bigHtml.includes("other other") && count(/<del[\s>]/g, bigHtml) === LEGEND_TAGS && count(/<ins[\s>]/g, bigHtml) === LEGEND_TAGS);

    const noCurrent = renderToStaticMarkup(
      h(Compare, {
        entityType: "site_content",
        revisionSnapshot: { values: { k: "v" } },
        currentSnapshot: null,
        currentError: "Permission denied",
        revisionLabel: "Revision",
      })
    );
    ok("ssr_current_unavailable_shows_revision_only", /Current version unavailable — Permission denied/.test(noCurrent) && count(/<del[\s>]/g, noCurrent) === LEGEND_TAGS);

    const same = renderToStaticMarkup(
      h(Compare, {
        entityType: "site_content",
        revisionSnapshot: { values: { k: "same" } },
        currentSnapshot: { values: { k: "same" } },
        revisionLabel: "Revision",
      })
    );
    ok("ssr_no_differences_message", /No differences/.test(same));

    const focused = renderToStaticMarkup(
      h(Compare, {
        entityType: "site_content_batch",
        revisionSnapshot: { values: { a: "1", b: "x" } },
        currentSnapshot: { values: { a: "1", b: "y" } },
        revisionLabel: "Revision",
        focusField: "a",
      })
    );
    ok("ssr_focus_field_shown_even_if_unchanged_others_collapsed", /data-compare-field="a"/.test(focused) && !/data-compare-field="b"/.test(focused));
  }

  // ───────────────────────── B. drawer / buttons ─────────────────────────
  const drawerSrc = read("components/admin/FieldHistoryDrawer.tsx");
  const drawerMod = loadTs("components/admin/FieldHistoryDrawer.tsx");
  {
    const off = drawerMod.FieldHistoryButton({ canViewRevisions: false, label: "X", onOpen() {} });
    const on = drawerMod.FieldHistoryButton({ canViewRevisions: true, label: "X", onOpen() {} });
    ok("button_hidden_without_revisions_view", off === null);
    ok("button_shown_with_revisions_view", !!on && on.type === "button" && /History/.test(renderToStaticMarkup(on)));

    const target = { kind: "content", fieldKey: "home_title", label: "Home title" };
    const hidden = renderToStaticMarkup(h(drawerMod.default, { target, role: "manager", canViewRevisions: false, onClose() {} }));
    ok("drawer_not_rendered_without_revisions_view", hidden === "");
    const closed = renderToStaticMarkup(h(drawerMod.default, { target: null, role: "manager", canViewRevisions: true, onClose() {} }));
    ok("drawer_not_rendered_without_target", closed === "");
    const shown = renderToStaticMarkup(h(drawerMod.default, { target, role: "manager", canViewRevisions: true, onClose() {} }));
    ok("drawer_renders_with_permission", /role="dialog"/.test(shown) && /History — Home title/.test(shown) && /No history yet/.test(shown));
  }
  ok("drawer_lists_via_existing_endpoint_with_field_param", /\/api\/admin-revisions\?\$\{qs\}/.test(drawerSrc) && /buildFieldHistoryQuery/.test(drawerSrc));
  ok("drawer_paginated_newest_first", /Prev/.test(drawerSrc) && /Next →/.test(drawerSrc) && /newest first/.test(drawerSrc));
  ok("drawer_shows_actor_time", /item\.actor_name/.test(drawerSrc) && /toLocaleString/.test(drawerSrc));
  ok("drawer_compare_with_current_button", /Compare with current/.test(drawerSrc) && /RevisionCompareLoader/.test(drawerSrc));
  ok("drawer_empty_state_text", /No history yet/.test(drawerSrc));
  ok("drawer_restore_label", /Restore this version/.test(drawerSrc));
  ok("drawer_restore_uses_existing_endpoint", /RESTORE_ENDPOINT/.test(drawerSrc) && /buildRestoreBody\(confirmRev\.id, expected\)/.test(drawerSrc) && /method:\s*"POST"/.test(drawerSrc));
  ok("drawer_only_one_restore_fetch", count(/fetch\(RESTORE_ENDPOINT/g, drawerSrc) === 1 && !/admin-revisions\/restore["'`]/.test(drawerSrc.replace(/RESTORE_ENDPOINT/g, "")));
  ok("drawer_no_new_write_endpoint", !/fetch\([^)]*,\s*\{[^}]*method:\s*"(PUT|PATCH|DELETE)"/.test(drawerSrc));
  ok("drawer_expected_version_from_current_read", /bound\.result\.version/.test(drawerSrc) && !/snapshot[^;\n]*product_version/.test(drawerSrc));
  ok("drawer_409_not_auto_resubmitted", /not auto-resubmitted/.test(drawerSrc));
  // Confirm required: the restore function is reachable only from the confirm modal button.
  ok("drawer_confirm_modal_exists", /data-testid="field-history-confirm"/.test(drawerSrc) && /Confirm restore/.test(drawerSrc));
  ok("drawer_doRestore_wired_once_to_confirm_button", count(/onClick=\{doRestore\}/g, drawerSrc) === 1 && /data-testid="field-history-confirm-restore-btn"\s+onClick=\{doRestore\}/.test(drawerSrc));
  ok("drawer_list_restore_buttons_open_confirm_only", count(/onClick=\{\(\) => openConfirm\(/g, drawerSrc) >= 2 && !/openConfirm[\s\S]{0,40}doRestore\(\)/.test(drawerSrc));
  ok("drawer_doRestore_requires_confirmRev", /const doRestore = async \(\) => \{\s*if \(!confirmRev\) return;/.test(drawerSrc));
  ok("drawer_confirm_shows_diff_again", /<RevisionCompareLoader[\s\S]{0,200}key=\{`\$\{confirmRev\.id\}:\$\{confirmKey\}`\}/.test(drawerSrc) || /key=\{`\$\{confirmRev\.id\}:\$\{confirmKey\}`\}[\s\S]{0,200}revision=\{confirmRev\}/.test(drawerSrc));
  ok("drawer_confirm_warns_whole_revision_restored", /whole revision/.test(drawerSrc) && /otherKeys/.test(drawerSrc));
  ok("drawer_refresh_callback_and_toast", /onRestored\?\.\(\{/.test(drawerSrc) && /onToast\?\.\(text, "success"\)/.test(drawerSrc));
  ok("drawer_restore_gated_by_canOfferRestoreRevision", /canOfferRestoreRevision\(item, role\)/.test(drawerSrc) && count(/offerRestore\(/g, drawerSrc) >= 2);
  ok("drawer_product_non_restored_fields_view_only", /PRODUCT_FIELDS_NOT_RESTORED/.test(drawerSrc) && /view \/ compare only/.test(drawerSrc));
  ok("drawer_preview_restore_content_only", /Preview restore/.test(drawerSrc) && /target\.kind !== "content"/.test(drawerSrc) && /onPreviewRestore\?\.\(\{ \[target\.fieldKey\]: v \}\)/.test(drawerSrc));
  ok("drawer_clears_preview_on_close_unmount", /clearPreview/.test(drawerSrc) && /useEffect\(\(\) => \(\) => clearPreview\(\), \[clearPreview\]\)/.test(drawerSrc) && /onPreviewRef\.current\?\.\(null\)/.test(drawerSrc));
  ok("drawer_no_dangerouslySetInnerHTML", !/dangerouslySetInnerHTML/.test(drawerSrc));

  // ───────────────────────── Preview pane (MULTI-101 channel) ─────────────────────────
  const paneSrc = read("components/admin/CmsPreviewPane.tsx");
  ok("pane_forceOverrides_prop", /forceOverrides\?: Record<string, string> \| null/.test(paneSrc));
  ok("pane_merges_force_over_dirty", /\.\.\.buildDirtyOverrides\(siteContent, savedContent\),\s*\.\.\.\(forceOverrides \|\| \{\}\)/.test(paneSrc));
  ok("pane_reposts_on_force_change", /\[open, iframeReady, postOverrides, siteContent, savedContent, forceOverrides\]/.test(paneSrc));
  ok("pane_still_dirty_only_channel", /postMessage/.test(paneSrc) && /DEBOUNCE_MS\s*=\s*300/.test(paneSrc) && !/setSiteContent|localStorage|sessionStorage|fetch\(/.test(paneSrc));

  // ───────────────────────── Wiring: Content Editor, Site Settings, Product editor ─────────────────────────
  const panelSrc = read("components/admin/AdminContentPanel.tsx");
  ok("content_panel_history_button_per_field", /<FieldHistoryButton[\s\S]{0,200}canViewRevisions=\{canViewRevisions\}/.test(panelSrc) && /kind: "content", fieldKey: field\.key/.test(panelSrc));
  ok("content_panel_default_no_history", /canViewRevisions = false/.test(panelSrc));
  ok("content_panel_mounts_drawer", /<FieldHistoryDrawer/.test(panelSrc) && /onPreviewRestore=\{onPreviewRestore\}/.test(panelSrc) && /onFieldsRestored\?\.\(info\.keys\)/.test(panelSrc));
  {
    const panelMod = loadTs("components/admin/AdminContentPanel.tsx", {
      "next/dynamic": { __esModule: true, default: () => () => null },
      "@/components/admin/CmsUpdatesAfterSaveChip": { __esModule: true, default: () => null },
      "@/components/admin/CollapsibleSection": {
        __esModule: true,
        default: (p) => h("section", null, p.children),
      },
    });
    const adminFields = loadTs("lib/adminContentFields.ts");
    const firstPage = Object.keys(adminFields.ADMIN_CONTENT_SECTIONS)[0];
    const props = { page: firstPage, siteContent: {}, setSiteContent() {}, onSave() {}, saving: false };
    const without = renderToStaticMarkup(h(panelMod.default, { ...props, canViewRevisions: false, role: "manager" }));
    const withHist = renderToStaticMarkup(h(panelMod.default, { ...props, canViewRevisions: true, role: "manager" }));
    ok("ssr_content_panel_no_history_buttons_without_permission", !/data-field-history-btn/.test(without));
    ok("ssr_content_panel_history_buttons_with_permission", count(/data-field-history-btn/g, withHist) >= 1, String(count(/data-field-history-btn/g, withHist)));
    const defaultRender = renderToStaticMarkup(h(panelMod.default, props));
    ok("ssr_content_panel_default_hides_buttons", !/data-field-history-btn/.test(defaultRender));
  }

  const sidhu = read("app/sidhu/page.tsx");
  ok("sidhu_canViewRevisions_from_can", /const canViewRevisions = can\("revisions\.view"\)/.test(sidhu));
  ok("sidhu_history_buttons_receive_permission", /canViewRevisions=\{canViewRevisions\}[\s\S]{0,200}fieldKey: key/.test(sidhu) && /canViewRevisions=\{canViewRevisions\}[\s\S]{0,300}kind: "product"/.test(sidhu));
  ok("sidhu_content_panels_get_history_props", count(/\{\.\.\.cmsHistoryProps\}/g, sidhu) === count(/<AdminContentPanel\b/g, sidhu) && count(/<AdminContentPanel\b/g, sidhu) >= 5);
  ok("sidhu_history_props_pass_role_and_permission", /const cmsHistoryProps = \{\s*canViewRevisions,\s*role: adminRole,/.test(sidhu));
  for (const [key] of [["site_title"], ["site_tagline"], ["site_meta_description"], ["site_logo_url"], ["favicon_url"], ["og_default_image"], ["contact_email"], ["contact_whatsapp"]]) {
    ok(`sidhu_settings_history_${key}`, new RegExp(`settingsHistoryBtn\\("${key}"`).test(sidhu));
  }
  for (const f of ["name", "slug", "price", "short_description", "full_description", "seo_title", "meta_description", "focus_keyword", "og_image", "features"]) {
    ok(`sidhu_product_history_${f}`, new RegExp(`productHistoryBtn\\("${f}"`).test(sidhu));
  }
  ok("sidhu_product_seasonal_history", /product-seasonal-history/.test(sidhu) && /season_starts_at/.test(sidhu) && /season_ends_at/.test(sidhu) && /season_name/.test(sidhu));
  ok("sidhu_product_history_only_existing_products", /productModal !== "new" && productModal\.id/.test(sidhu));
  ok("sidhu_mounts_shared_drawer", /<FieldHistoryDrawer\s+target=\{fieldHistoryTarget\}/.test(sidhu) && /role=\{adminRole\}/.test(sidhu));
  ok("sidhu_product_restore_refreshes_editor", /refreshProductAfterHistoryRestore/.test(sidhu) && /applyAuthoritativeProductRow\(row, \{ replaceContent: true, reason: "history-restore" \}\)/.test(sidhu));
  ok(
    "sidhu_content_restore_refreshes_keys",
    /refreshRestoredContentKeys/.test(sidhu) &&
      (/setSiteContentSaved\(\(s\) => \(\{ \.\.\.s, \.\.\.fresh \}\)\)/.test(sidhu) ||
        /applySavedContentKeys\(Object\.keys\(fresh\), fresh\)/.test(sidhu))
  );
  ok("sidhu_preview_force_wired", /forceOverrides=\{cmsPreviewForce\}/.test(sidhu) && /setCmsPreviewForce\(overrides\)/.test(sidhu) && /if \(overrides\) setCmsPreviewOpen\(true\)/.test(sidhu));
  ok("sidhu_preview_cleared_on_pane_close", /setCmsPreviewOpen\(false\); setCmsPreviewForce\(null\)/.test(sidhu));
  ok("sidhu_history_tab_still_gated", /tab==="history" && can\("revisions\.view"\)/.test(sidhu));

  // ───────────────────────── ContentHistoryPanel (History tab) ─────────────────────────
  const histSrc = read("components/admin/ContentHistoryPanel.tsx");
  ok("history_panel_uses_compare_loader_in_view", /Compare with current/.test(histSrc) && /<RevisionCompareLoader/.test(histSrc));
  ok("history_panel_confirm_shows_diff_again", /data-testid="confirm-restore-diff"/.test(histSrc) && count(/<RevisionCompareLoader/g, histSrc) >= 2);
  ok("history_panel_confirm_still_required", /data-testid="confirm-restore-btn"\s+onClick=\{doRestore\}/.test(histSrc) && count(/fetch\("\/api\/admin-revisions\/restore"/g, histSrc) === 1);
  ok("history_panel_payload_shape_unchanged", /revision_id: confirmRestore\.id,\s*\.\.\.\(expected != null \? \{ expected_version: expected \} : \{\}\)/.test(histSrc));
  ok("history_panel_delegates_restore_gate", /canOfferRestoreRevision\(item, role\)/.test(histSrc));
  ok("history_panel_keeps_seo_banner_and_version_binding", /formatRestoreSeoBanner/.test(histSrc) && /boundRestoreVersion/.test(histSrc) && /Version restored/.test(histSrc));
  ok("history_panel_raw_snapshot_still_escaped_text", /Raw snapshot \(escaped text\)/.test(histSrc) && /<pre/.test(histSrc));

  // ───────────────────────── API: field filter (stubbed handler) ─────────────────────────
  const handlerSrc = read("pages/api/admin-revisions.ts");
  {
    const sqlLiterals = (handlerSrc.match(/`[^`]*`/g) || []).join("\n");
    ok("api_no_write_sql", !/\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|TRUNCATE|REPLACE)\b/.test(sqlLiterals));
    ok("api_only_pool_query_reads", count(/pool\.query\(/g, handlerSrc) === 2 && !/getConnection|beginTransaction|execute\(/.test(handlerSrc));
  }
  ok("api_get_only", /req\.method !== "GET"/.test(handlerSrc));
  ok("api_requires_revisions_view", /requireAdminPermission\(req, res, "revisions\.view", \{ mutate: false \}\)/.test(handlerSrc));
  ok("api_sets_no_store_first", /setAdminNoStore\(res\);[\s\S]{0,200}requireAdminPermission/.test(handlerSrc));
  ok("api_field_param_parameterised", /JSON_CONTAINS\(changed_fields_json, \?\)/.test(handlerSrc) && /JSON\.stringify\(field\)/.test(handlerSrc) && !/\$\{field\}/.test(handlerSrc));
  ok("api_field_validated", /REVISION_FIELD_RE\s*=\s*\/\^\[A-Za-z0-9_\.-\]\{1,120\}\$\//.test(handlerSrc));

  function makeHandler() {
    const queries = [];
    const authCalls = [];
    const pool = {
      query: async (sql, params) => {
        queries.push({ sql: String(sql), params: params || [] });
        if (/COUNT\(\*\)/.test(sql)) return [[{ total: 2 }]];
        if (/FROM content_revisions\s+WHERE/.test(sql) || /FROM content_revisions/.test(sql)) {
          return [
            [
              { id: 9, entity_type: "site_content", entity_id: "home_title", entity_label: "home_title", revision_action: "update", changed_fields_json: '["home_title"]', actor_name: "A", actor_role: "manager", created_at: "2026-01-02" },
              { id: 8, entity_type: "site_content_batch", entity_id: "home_title,home_sub", entity_label: "Batch (2 keys)", revision_action: "update", changed_fields_json: '["home_title","home_sub"]', actor_name: "B", actor_role: "manager", created_at: "2026-01-01" },
            ],
          ];
        }
        return [[]];
      },
    };
    const requireAdminPermission = async (req, res, permission, opts) => {
      authCalls.push({ permission, opts });
      if (!req.admin) {
        res.status(401).json({ error: "Unauthorized" });
        return null;
      }
      if (!perms.hasAdminPermission(req.admin.role, permission)) {
        res.status(403).json({ error: "Forbidden" });
        return null;
      }
      return req.admin;
    };
    const stubs = {
      "../../lib/db": { __esModule: true, default: pool },
      "./db": { __esModule: true, default: pool },
      "../../lib/adminAuth": { requireAdminPermission },
    };
    const mod = loadTs("pages/api/admin-revisions.ts", stubs);
    return { handler: mod.default, queries, authCalls };
  }

  async function call(handler, { method = "GET", query = {}, admin } = {}) {
    const req = { method, query, admin };
    const res = mockRes();
    await handler(req, res);
    return res;
  }

  {
    const { handler, queries, authCalls } = makeHandler();
    const post = await call(handler, { method: "POST", query: { field: "x" }, admin: { role: "super_admin" } });
    ok("api_405_non_get", post.statusCode === 405 && queries.length === 0);

    const anon = await call(handler, { query: { field: "home_title" } });
    ok("api_401_unauthenticated", anon.statusCode === 401 && queries.length === 0);
    ok("api_no_store_header_even_when_unauthenticated", /no-store/.test(anon.headers["cache-control"] || ""));
    ok("api_auth_called_revisions_view_read_only", authCalls.length >= 1 && authCalls.every((c) => c.permission === "revisions.view" && c.opts && c.opts.mutate === false));
  }
  {
    const { handler, queries } = makeHandler();
    const bad = ["a b", "x';DROP TABLE content_revisions;--", "../etc", "x".repeat(121), "名前", 'a"b', "a,b"];
    const results = [];
    for (const f of bad) results.push(await call(handler, { query: { field: f }, admin: { role: "super_admin" } }));
    ok("api_field_invalid_values_400", results.every((r) => r.statusCode === 400), results.map((r) => r.statusCode).join(","));
    const arr = await call(handler, { query: { field: ["a", "b"] }, admin: { role: "super_admin" } });
    ok("api_field_array_400", arr.statusCode === 400);
    ok("api_invalid_field_never_queries", queries.length === 0);
    const empty = await call(handler, { query: { field: "  " }, admin: { role: "manager" } });
    ok("api_blank_field_ignored_like_other_filters", empty.statusCode === 200 && !/JSON_CONTAINS/.test(queries[0].sql));
  }
  {
    const { handler, queries } = makeHandler();
    const res = await call(handler, { query: { field: "home_title" }, admin: { role: "manager" } });
    const q = queries.find((x) => !/COUNT/.test(x.sql));
    const c = queries.find((x) => /COUNT/.test(x.sql));
    ok("api_field_manager_200_items", res.statusCode === 200 && Array.isArray(res.body.items) && res.body.items.length === 2);
    ok("api_field_no_store", /no-store/.test(res.headers["cache-control"] || ""));
    ok("api_field_types_restricted_to_content_for_manager", JSON.stringify(q.params.slice(0, 2)) === JSON.stringify(["site_content", "site_content_batch"]), JSON.stringify(q.params));
    ok("api_field_sql_has_entity_id_or_json_contains", /entity_id = \? OR/.test(q.sql) && /JSON_CONTAINS\(changed_fields_json, \?\)/.test(q.sql));
    ok("api_field_params_bound_not_interpolated", q.params.includes("home_title") && q.params.includes('"home_title"') && !q.sql.includes("home_title"));
    ok("api_field_json_valid_guard", /CASE WHEN JSON_VALID\(changed_fields_json\)/.test(q.sql));
    ok("api_field_count_uses_same_filter", /JSON_CONTAINS/.test(c.sql) && JSON.stringify(c.params) === JSON.stringify(q.params.slice(0, c.params.length)));
    ok("api_field_newest_first_paginated", /ORDER BY created_at DESC, id DESC/.test(q.sql) && /LIMIT \? OFFSET \?/.test(q.sql) && q.params.slice(-2).join(",") === "25,0");
    ok("api_field_only_selects_no_snapshot_in_list", queries.every((x) => /^\s*SELECT/i.test(x.sql)) && !/snapshot_json/.test(q.sql));
    ok("api_field_pagination_meta", res.body.pagination && res.body.pagination.total === 2 && res.body.pagination.page === 1);
  }
  {
    const { handler, queries } = makeHandler();
    await call(handler, { query: { field: "site_title" }, admin: { role: "super_admin" } });
    const q = queries.find((x) => !/COUNT/.test(x.sql));
    ok("api_field_super_admin_searches_all_three_content_types", JSON.stringify(q.params.slice(0, 3)) === JSON.stringify(["site_content", "site_settings", "site_content_batch"]), JSON.stringify(q.params.slice(0, 3)));
  }
  {
    const { handler, queries } = makeHandler();
    const w = await call(handler, { query: { field: "home_title" }, admin: { role: "writer" } });
    ok("api_field_writer_has_no_content_types_empty_list_no_query", w.statusCode === 200 && w.body.items.length === 0 && queries.length === 0);
  }
  {
    const { handler, queries } = makeHandler();
    const forbidden = await call(handler, { query: { entity_type: "site_settings", field: "site_title" }, admin: { role: "manager" } });
    ok("api_field_respects_role_entity_type_403", forbidden.statusCode === 403 && queries.length === 0);
    const writerProduct = await call(handler, { query: { entity_type: "product", entity_id: "5", field: "name" }, admin: { role: "writer" } });
    ok("api_field_writer_product_403", writerProduct.statusCode === 403 && queries.length === 0);
  }
  {
    const { handler, queries } = makeHandler();
    const res = await call(handler, { query: { entity_type: "product", entity_id: "5", field: "name", page: "2", limit: "10" }, admin: { role: "manager" } });
    const q = queries.find((x) => !/COUNT/.test(x.sql));
    ok("api_product_field_200", res.statusCode === 200);
    ok("api_product_field_scoped_entity", q.params[0] === "product" && q.params.includes("5"));
    ok("api_product_field_json_contains_only", /JSON_CONTAINS\(changed_fields_json, \?\)/.test(q.sql) && !/entity_id = \? OR/.test(q.sql) && q.params.includes('"name"'));
    ok("api_product_field_page_offset", q.params.slice(-2).join(",") === "10,10", q.params.slice(-2).join(","));
  }
  {
    const { handler, queries } = makeHandler();
    await call(handler, { query: { entity_type: "site_content" }, admin: { role: "manager" } });
    ok("api_without_field_unchanged_no_json_clause", !/JSON_CONTAINS|JSON_VALID/.test(queries[0].sql));
  }

  // ───────────────────────── Constraints: restore / SEO guard / schema untouched ─────────────────────────
  const restoreSrc = read("pages/api/admin-revisions/restore.ts");
  ok("restore_still_calls_runPostSaveSeoGuard", count(/runPostSaveSeoGuard\(\{/g, restoreSrc) >= 2 && /operation: "restore"/.test(restoreSrc) && /import \{ runPostSaveSeoGuard \} from "\.\.\/\.\.\/\.\.\/lib\/postSaveSeoGuard"/.test(restoreSrc));
  ok("restore_still_server_authoritative_rbac", /canRestoreRevisionEntity\(admin\.role, revision\.entity_type\)/.test(restoreSrc));
  ok("restore_still_requires_revisions_view", /requireAdminPermission\(req, res, "revisions\.view"\)/.test(restoreSrc));
  ok("seo_guard_test_asserts_restore_guard", /runPostSaveSeoGuard/.test(read("scripts/phase-seo-revision-restore-guard-tests.js")));
  {
    let changed = null;
    try {
      const out = execFileSync("git", ["status", "--porcelain", "--", "pages/api/admin-revisions/restore.ts", "lib/contentRevisions.ts", "lib/adminPermissions.ts", "package.json", "package-lock.json", "scripts/migrate-content-revisions.js", "lib/postSaveSeoGuard.ts"], { cwd: ROOT, encoding: "utf8" });
      changed = out.trim();
    } catch {
      changed = null;
    }
    if (changed === null) ok("restore_and_server_libs_unmodified_(git_unavailable_skipped)", true);
    else ok("restore_and_server_libs_unmodified", changed === "", changed);
  }
  {
    const paths = ["pages/api/admin-revisions/restore.ts", "lib/contentRevisions.ts"];
    ok("no_new_restore_route", !exists("pages/api/admin-revisions/restore-field.ts") && !exists("pages/api/admin-revisions-field.ts") && paths.every(exists));
  }
  {
    // Public pages must never import the new admin revision components.
    const publicFiles = ["app/page.tsx", "app/layout.tsx", "components/SiteContentProvider.tsx", "components/CmsBody.tsx"].filter(exists);
    ok("public_files_do_not_import_revision_ui", publicFiles.every((f) => !/RevisionCompareView|FieldHistoryDrawer|revisionCompare|textDiff/.test(read(f))), publicFiles.join(","));
  }
  {
    const pkg = JSON.parse(read("package.json"));
    const deps = Object.keys({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) });
    ok("no_diff_library_dependency", !deps.some((d) => /^(diff|jsdiff|diff-match-patch|fast-diff|react-diff-viewer.*)$/.test(d)));
  }

  console.log(`\nphase-multi-106: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error("FAIL  suite_exception —", err && err.stack ? err.stack : err);
  process.exit(1);
});
