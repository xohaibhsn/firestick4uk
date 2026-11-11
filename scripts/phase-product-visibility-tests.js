/**
 * F4UK-CMS-PRODUCT-VISIBILITY-01 — offline Hide/Unhide tests.
 * Mocked pool / no production MySQL, CMS, email, payment or live mutation.
 */
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..");
let passed = 0;
let failed = 0;

function ok(name, cond, detail = "") {
  if (cond) {
    passed += 1;
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed += 1;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function loadTsModule(rel, stubs = {}) {
  const src = read(rel);
  const { outputText } = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
    },
  });
  const mod = { exports: {} };
  const localRequire = (id) => {
    if (stubs[id]) return stubs[id];
    if (id === "@/lib/db" || id.endsWith("/db") || id === "../../lib/db") {
      return stubs.db || { getConnection: async () => { throw new Error("db stub"); } };
    }
    if (id === "@/lib/adminAuth" || id.endsWith("/adminAuth")) {
      return stubs.adminAuth || {};
    }
    if (id === "@/lib/adminAudit" || id.endsWith("/adminAudit")) {
      return stubs.adminAudit || { recordAdminAudit: async () => {} };
    }
    if (id === "@/lib/contentRevisions" || id.endsWith("/contentRevisions")) {
      return (
        stubs.contentRevisions || {
          recordContentRevision: async () => 1,
          snapshotProduct: (row) => ({ ...row }),
        }
      );
    }
    if (
      id === "@/lib/hostingerResourceInvalidation" ||
      id.endsWith("/hostingerResourceInvalidation")
    ) {
      return stubs.invalidation || { invalidateSitemapCache: () => {} };
    }
    if (id === "@/lib/productVisibility" || id.endsWith("/productVisibility")) {
      return loadTsModule("lib/productVisibility.ts", stubs);
    }
    if (
      id === "@/lib/productVisibilityServer" ||
      id.endsWith("/productVisibilityServer")
    ) {
      return loadTsModule("lib/productVisibilityServer.ts", stubs);
    }
    if (id === "@/lib/productSeasonActions" || id.endsWith("/productSeasonActions")) {
      return loadTsModule("lib/productSeasonActions.ts", stubs);
    }
    if (id === "@/lib/productSeasonLondon" || id.endsWith("/productSeasonLondon")) {
      return loadTsModule("lib/productSeasonLondon.ts", stubs);
    }
    if (id === "@/lib/productSeasonEligibility" || id.endsWith("/productSeasonEligibility")) {
      return loadTsModule("lib/productSeasonEligibility.ts", stubs);
    }
    if (id === "@/lib/productSchemaCapability" || id.endsWith("/productSchemaCapability")) {
      return loadTsModule("lib/productSchemaCapability.ts", stubs);
    }
    if (id === "@/lib/db" || id.endsWith("/db")) {
      return stubs.db || { getConnection: async () => { throw new Error("db stub"); } };
    }
    if (id === "@/lib/adminAudit" || id.endsWith("/adminAudit")) {
      return stubs.adminAudit || { recordAdminAudit: async () => {} };
    }
    if (id === "@/lib/contentRevisions" || id.endsWith("/contentRevisions")) {
      return stubs.contentRevisions || {
        recordContentRevision: async () => 1,
        snapshotProduct: (row) => ({ ...row }),
      };
    }
    if (
      id === "@/lib/hostingerResourceInvalidation" ||
      id.endsWith("/hostingerResourceInvalidation")
    ) {
      return stubs.invalidation || { invalidateSitemapCache: () => {} };
    }
    if (id === "@/lib/adminAuth" || id.endsWith("/adminAuth")) {
      return stubs.adminAuth || {};
    }
    return require(id);
  };
  const fn = new Function("exports", "module", "require", outputText);
  fn(mod.exports, mod, localRequire);
  return mod.exports;
}

const {
  parseProductVisibilityPayload,
  parsePositiveIntegerId,
  parseActiveFlag,
  normalizeStoredActive,
  visibilityLabel,
} = loadTsModule("lib/productVisibility.ts");

const api = read("pages/api/admin-products.ts");
const sidhu = read("app/sidhu/page.tsx");
const publicProducts = read("lib/publicProductsServer.ts");
const productsApi = read("pages/api/products.ts");
const searchApi = read("pages/api/search.ts");
const ordersApi = read("pages/api/orders.ts");
const productDetail = read("app/products/[slug]/page.tsx");
const sitemapData = read("lib/sitemapDataServer.ts");
const invalidation = read("lib/hostingerResourceInvalidation.ts");
const preserveScript = read("scripts/phase-product-active-preservation-tests.js");

// --- Pure payload contract ---
ok(
  "parse_ok_hide",
  parseProductVisibilityPayload({ id: 7, active: 0, expected_active: 1 }).ok === true
);
ok(
  "parse_ok_unhide",
  parseProductVisibilityPayload({ id: 7, active: 1, expected_active: 0 }).ok === true
);
ok("reject_string_id", parseProductVisibilityPayload({ id: "7", active: 0, expected_active: 1 }).ok === false);
ok("reject_fractional_id", parseProductVisibilityPayload({ id: 7.5, active: 0, expected_active: 1 }).ok === false);
ok("reject_zero_id", parseProductVisibilityPayload({ id: 0, active: 0, expected_active: 1 }).ok === false);
ok("reject_negative_id", parseProductVisibilityPayload({ id: -1, active: 0, expected_active: 1 }).ok === false);
ok("reject_bool_active", parseProductVisibilityPayload({ id: 7, active: false, expected_active: 1 }).ok === false);
ok("reject_string_active", parseProductVisibilityPayload({ id: 7, active: "0", expected_active: 1 }).ok === false);
ok("reject_true_active", parseProductVisibilityPayload({ id: 7, active: true, expected_active: 0 }).ok === false);
ok("reject_2_active", parseProductVisibilityPayload({ id: 7, active: 2, expected_active: 1 }).ok === false);
ok(
  "reject_missing_expected",
  parseProductVisibilityPayload({ id: 7, active: 0 }).ok === false
);
ok(
  "reject_mixed_name",
  parseProductVisibilityPayload({ id: 7, active: 0, expected_active: 1, name: "x" }).ok === false
);
ok(
  "reject_mixed_price",
  parseProductVisibilityPayload({ id: 7, active: 0, expected_active: 1, price: 9.99 }).ok === false
);
ok(
  "reject_array_body",
  parseProductVisibilityPayload([{ id: 7, active: 0, expected_active: 1 }]).ok === false
);
ok("parsePositiveIntegerId_ok", parsePositiveIntegerId(12) === 12);
ok("parsePositiveIntegerId_reject_string", parsePositiveIntegerId("12") === null);
ok("parseActiveFlag_strict", parseActiveFlag(0) === 0 && parseActiveFlag(1) === 1 && parseActiveFlag("1") === null);
ok("normalize_active", normalizeStoredActive(1) === 1 && normalizeStoredActive(0) === 0 && normalizeStoredActive(null) === 0);
ok("visibility_labels", visibilityLabel(1) === "Public" && visibilityLabel(0) === "Private");

// --- API route wiring ---
ok("api_has_patch_branch", /req\.method === ['"]PATCH['"]/.test(api));
ok("api_uses_parse_payload", /parseProductVisibilityPayload/.test(api));
ok("api_uses_apply_change", /applyProductVisibilityChange/.test(api));
ok("api_still_requires_products_manage", /requireAdminPermission\(req, res, ['"]products\.manage['"]\)/.test(api));
ok("api_put_active_preservation_intact", /let active = Number\(current\.active\) === 1 \? 1 : 0;/.test(api));
ok("api_put_hasOwn_active", /hasOwn\(body, ['"]active['"]\)/.test(api));
ok("api_no_runtime_ddl", !/CREATE TABLE|ALTER TABLE|ADD COLUMN/i.test(api));

// --- Sidhu CMS controls ---
ok("cms_hide_unhide_control", /Make Private/.test(sidhu) && /Make Public/.test(sidhu) && /toggleProductVisibility/.test(sidhu));
ok("cms_visibility_badge", /product-visibility-badge-/.test(sidhu) && /Public/.test(sidhu) && /Private/.test(sidhu));
ok(
  "cms_visibility_filters",
  /product-visibility-filters/.test(sidhu) &&
    /product-visibility-filter-\$\{value\}/.test(sidhu) &&
    /\["all", "All"\]/.test(sidhu) &&
    /\["visible", "Public"\]/.test(sidhu) &&
    /\["hidden", "Private"\]/.test(sidhu)
);
ok("cms_default_filter_all", /useState<"all" \| "visible" \| "hidden">\("all"\)/.test(sidhu));
ok("cms_pending_state", /productVisibilityPendingId/.test(sidhu) && /Privatising…/.test(sidhu) && /Publishing…/.test(sidhu));
ok(
  "cms_confirm_dialog",
  /window\.confirm/.test(sidhu) &&
    /public product page becomes unavailable \(404\)/.test(sidhu)
);
ok("cms_patch_payload", /method: "PATCH"/.test(sidhu) && /expected_active:/.test(sidhu));
ok("cms_refresh_on_conflict", /r\.status === 409/.test(sidhu) && /await loadProducts\(\)/.test(sidhu));
ok("cms_no_success_before_server", /!data\?\.success/.test(sidhu) && /✅/.test(sidhu));
ok("cms_help_text_404", /product-visibility-help/.test(sidhu) && /unavailable \(404\)/.test(sidhu));
ok("cms_stored_url_copy", /product-stored-url-/.test(sidhu) && /Copy URL/.test(sidhu));
ok("cms_editor_hidden_note", /product-editor-hidden-url-note/.test(sidhu));
ok("cms_edit_delete_intact", /openEditProduct\(p\)/.test(sidhu) && /deleteProduct\(p\.id\)/.test(sidhu));
ok(
  "cms_authz_gate_toggle",
  /const toggleProductVisibility = async[\s\S]*?if \(!can\("products\.manage"\)\) return;/.test(sidhu)
);
ok(
  "api_auth_before_methods",
  api.indexOf("requireAdminPermission") < api.indexOf("req.method === 'GET'") &&
    api.indexOf("requireAdminPermission") < api.indexOf("req.method === 'PATCH'")
);

// --- Ordinary edit still omits active (preservation) ---
const saveIdx = sidhu.indexOf("const saveProduct = async () => {");
const saveEnd = sidhu.indexOf("const resetProductAiState", saveIdx);
const saveSnippet =
  saveIdx >= 0 && saveEnd > saveIdx ? sidhu.slice(saveIdx, saveEnd) : "";
ok(
  "ordinary_edit_omits_active",
  /isNew\s*\?\s*payload\s*:/.test(saveSnippet) &&
    /\.\.\.payload/.test(saveSnippet) &&
    /id:\s*\(productModal/.test(saveSnippet) &&
    /expected_version/.test(saveSnippet) &&
    !/, active:/.test(saveSnippet) &&
    !/active:\s*0/.test(saveSnippet) &&
    !/active:\s*1/.test(saveSnippet) &&
    !/\bactive\b\s*:/.test(saveSnippet)
);
ok("preservation_script_still_present", /PS-ACTIVE/.test(preserveScript));

// --- Public / commerce active=1 contract ---
ok("public_listings_active_1", /WHERE active = 1/.test(publicProducts));
ok("products_api_active_1", /active=1/.test(productsApi));
ok("search_api_active_1", /active=1/.test(searchApi));
ok("detail_resolves_active_1", /WHERE active = 1 AND slug = \?/.test(productDetail));
ok("detail_notFound_on_missing", /notFound\(\)/.test(productDetail));
ok("sitemap_active_1", /WHERE active = 1/.test(sitemapData));
ok("sitemap_ttl_300", /SITEMAP_CACHE_TTL_SECONDS = 300/.test(sitemapData));
ok("sitemap_invalidate_ttl_only", /TTL-only compatibility shim/.test(invalidation) && /function invalidateSitemapCache\(\): void/.test(invalidation));
ok(
  "orders_reject_inactive",
  /lockAndAuthorizeOrderProducts/.test(ordersApi) &&
    (/no longer available/.test(ordersApi) ||
      /no longer available/.test(
        fs.readFileSync(path.join(ROOT, "lib/orderProductEligibility.ts"), "utf8")
      ))
);

// --- Behavioral mocked mutation ---
function makeProductRow(overrides = {}) {
  return {
    id: 42,
    name: "Seasonal Offer",
    slug: "seasonal-offer",
    description: "desc",
    price: 49.99,
    category: "Subscription",
    badge: null,
    image: "/img.png",
    stock: "Digital",
    active: 1,
    short_description: "short",
    full_description: "full",
    seo_title: "seo",
    meta_description: "meta",
    focus_keyword: "kw",
    features: "feat",
    og_image: "",
    ...overrides,
  };
}

function makeFakeStore(seedRows, options = {}) {
  const rows = seedRows.map((r) => ({ ...r }));
  const calls = {
    begins: 0,
    commits: 0,
    rollbacks: 0,
    releases: 0,
    lockedSelects: 0,
    updates: 0,
    revisions: 0,
    audits: [],
    sitemap: 0,
    revisionSnapshots: [],
    updateParams: [],
    order: [],
  };
  let inTx = false;
  let revisionFailOnce = false;
  if (options.failRevisionOnce) revisionFailOnce = true;

  async function query(sql, params = []) {
    const s = String(sql).replace(/\s+/g, " ").trim();
    if (/^SELECT \* FROM products WHERE id = \? LIMIT 1 FOR UPDATE$/i.test(s)) {
      if (!inTx) throw new Error("FOR UPDATE outside transaction");
      calls.lockedSelects += 1;
      calls.order.push("locked_select");
      if (typeof options.onBeforeLockedSelect === "function") {
        options.onBeforeLockedSelect(rows, params);
      }
      const id = Number(params[0]);
      return [rows.filter((r) => r.id === id).map((r) => ({ ...r }))];
    }
    if (/^UPDATE products SET active = \? WHERE id = \?$/i.test(s)) {
      calls.updates += 1;
      calls.order.push("update");
      calls.updateParams.push(params.slice());
      const active = Number(params[0]);
      const id = Number(params[1]);
      const row = rows.find((r) => r.id === id);
      if (!row) return [{ affectedRows: 0 }];
      row.active = active;
      return [{ affectedRows: 1 }];
    }
    throw new Error("Unexpected SQL: " + s);
  }

  async function getConnection() {
    return {
      beginTransaction: async () => {
        inTx = true;
        calls.begins += 1;
        calls.order.push("begin");
      },
      commit: async () => {
        inTx = false;
        calls.commits += 1;
        calls.order.push("commit");
      },
      rollback: async () => {
        inTx = false;
        calls.rollbacks += 1;
        calls.order.push("rollback");
      },
      release: () => {
        calls.releases += 1;
        calls.order.push("release");
      },
      query,
    };
  }

  const deps = {
    getConnection,
    recordContentRevision: async (input) => {
      if (revisionFailOnce) {
        revisionFailOnce = false;
        const err = new Error("simulated revision failure");
        err.code = "ER_LOCK_WAIT_TIMEOUT";
        throw err;
      }
      calls.revisions += 1;
      calls.order.push("revision");
      calls.revisionSnapshots.push({
        snapshot: input.snapshot,
        changedFields: input.changedFields,
      });
      return 99;
    },
    recordAdminAudit: async (input) => {
      calls.order.push("audit");
      calls.audits.push(input);
    },
    invalidateSitemapCache: () => {
      calls.sitemap += 1;
      calls.order.push("sitemap");
    },
    snapshotProduct: (row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      active: row.active,
      price: row.price,
    }),
  };

  return { rows, calls, deps };
}

const actor = {
  principalType: "staff",
  staffId: 3,
  name: "Tester",
  role: "super_admin",
  email: "t@example.com",
};

async function runBehavioral() {
  const { applyProductVisibilityChange } = loadTsModule("lib/productVisibilityServer.ts");

  // Authorized hide
  {
    const store = makeFakeStore([makeProductRow({ active: 1 })]);
    const r = await applyProductVisibilityChange(
      { id: 42, active: 0, expected_active: 1 },
      actor,
      "127.0.0.1",
      store.deps
    );
    ok("beh_hide_ok", r.ok === true && r.active === 0 && r.noop === false);
    ok("beh_hide_update_only_active", store.calls.updates === 1 && store.calls.updateParams[0][0] === 0);
    ok("beh_hide_preserves_other_fields", store.rows[0].price === 49.99 && store.rows[0].slug === "seasonal-offer" && store.rows[0].name === "Seasonal Offer");
    ok("beh_hide_revision", store.calls.revisions === 1 && store.calls.revisionSnapshots[0].changedFields.includes("active"));
    ok("beh_hide_revision_pre_change", store.calls.revisionSnapshots[0].snapshot.active === 1);
    ok("beh_hide_audit", store.calls.audits.length === 1 && store.calls.audits[0].action === "product.visibility_changed");
    ok("beh_hide_sitemap_invalidate_called", store.calls.sitemap === 1);
    ok(
      "beh_hide_tx_order",
      store.calls.order.indexOf("begin") < store.calls.order.indexOf("locked_select") &&
        store.calls.order.indexOf("locked_select") < store.calls.order.indexOf("revision") &&
        store.calls.order.indexOf("revision") < store.calls.order.indexOf("update") &&
        store.calls.order.indexOf("update") < store.calls.order.indexOf("commit") &&
        store.calls.order.indexOf("commit") < store.calls.order.indexOf("audit")
    );
    ok("beh_hide_public_flag", r.public_page_available === false);
  }

  // Authorized unhide
  {
    const store = makeFakeStore([makeProductRow({ active: 0 })]);
    const r = await applyProductVisibilityChange(
      { id: 42, active: 1, expected_active: 0 },
      actor,
      null,
      store.deps
    );
    ok("beh_unhide_ok", r.ok === true && r.active === 1 && r.noop === false);
    ok("beh_unhide_row", store.rows[0].active === 1);
    ok("beh_unhide_public_flag", r.public_page_available === true);
  }

  // Missing product
  {
    const store = makeFakeStore([]);
    const r = await applyProductVisibilityChange(
      { id: 99, active: 0, expected_active: 1 },
      actor,
      null,
      store.deps
    );
    ok("beh_missing_404", r.ok === false && r.status === 404 && r.code === "not_found");
    ok("beh_missing_rollback", store.calls.rollbacks === 1 && store.calls.commits === 0 && store.calls.updates === 0);
  }

  // Stale expected state
  {
    const store = makeFakeStore([makeProductRow({ active: 0 })]);
    const r = await applyProductVisibilityChange(
      { id: 42, active: 0, expected_active: 1 },
      actor,
      null,
      store.deps
    );
    ok("beh_stale_conflict", r.ok === false && r.status === 409 && r.code === "stale_active" && r.current_active === 0);
    ok("beh_stale_no_update", store.calls.updates === 0 && store.calls.revisions === 0 && store.calls.audits.length === 0);
  }

  // Simultaneous / conflicting visibility: second request sees already-hidden
  {
    const store = makeFakeStore([makeProductRow({ active: 1 })]);
    const first = await applyProductVisibilityChange(
      { id: 42, active: 0, expected_active: 1 },
      actor,
      null,
      store.deps
    );
    const second = await applyProductVisibilityChange(
      { id: 42, active: 0, expected_active: 1 },
      actor,
      null,
      store.deps
    );
    ok("beh_concurrent_first_ok", first.ok === true && first.active === 0);
    ok("beh_concurrent_second_conflict", second.ok === false && second.code === "stale_active");
    ok("beh_concurrent_single_revision", store.calls.revisions === 1);
  }

  // No-op same state
  {
    const store = makeFakeStore([makeProductRow({ active: 1 })]);
    const r = await applyProductVisibilityChange(
      { id: 42, active: 1, expected_active: 1 },
      actor,
      null,
      store.deps
    );
    ok("beh_noop_ok", r.ok === true && r.noop === true && r.changed_fields.length === 0);
    ok("beh_noop_no_revision_or_update", store.calls.updates === 0 && store.calls.revisions === 0 && store.calls.audits.length === 0);
    ok("beh_noop_commits", store.calls.commits === 1);
  }

  // Pre-commit revision failure → rollback, no audit
  {
    const store = makeFakeStore([makeProductRow({ active: 1 })], { failRevisionOnce: true });
    let threw = false;
    try {
      await applyProductVisibilityChange(
        { id: 42, active: 0, expected_active: 1 },
        actor,
        null,
        store.deps
      );
    } catch {
      threw = true;
    }
    ok("beh_precommit_failure_throws_or_rolls", threw === true || store.calls.rollbacks >= 1);
    ok("beh_precommit_no_commit_audit", store.calls.commits === 0 && store.calls.audits.length === 0);
    ok("beh_precommit_active_unchanged", store.rows[0].active === 1);
  }

  // Duplicate-click style: two no-ops after already hidden with matching expected
  {
    const store = makeFakeStore([makeProductRow({ active: 0 })]);
    const a = await applyProductVisibilityChange(
      { id: 42, active: 0, expected_active: 0 },
      actor,
      null,
      store.deps
    );
    const b = await applyProductVisibilityChange(
      { id: 42, active: 0, expected_active: 0 },
      actor,
      null,
      store.deps
    );
    ok("beh_dup_noop", a.noop === true && b.noop === true && store.calls.updates === 0 && store.calls.revisions === 0);
  }
}

async function main() {
  await runBehavioral();
  console.log(`\nProduct visibility offline: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
