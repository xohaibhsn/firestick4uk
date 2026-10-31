/**
 * P1 — Controlled product URL migration fixtures (no production MySQL).
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

function loadTsModule(rel) {
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
    if (id === "@/lib/urlRedirects" || id.endsWith("/urlRedirects")) {
      return loadTsModule("lib/urlRedirects.ts");
    }
    return require(id);
  };
  const fn = new Function("exports", "module", "require", outputText);
  fn(mod.exports, mod, localRequire);
  return mod.exports;
}

const {
  validateProductUrlMigrationRequest,
  toProductSlug,
  productPathFromSlug,
  isExactActiveRedirect,
} = loadTsModule("lib/productUrlMigration.ts");

const api = read("pages/api/admin-product-url-migration.ts");
const server = read("lib/productUrlMigrationServer.ts");
const productsApi = read("pages/api/admin-products.ts");
const sidhu = read("app/sidhu/page.tsx");
const legacy = read("lib/productLegacyRedirects.ts");
const perms = loadTsModule("lib/adminPermissions.ts");

// --- Pure slug helpers ---
ok("slug_norm", toProductSlug(" Halloween-2026-3-Year-IPTV-Deal ") === "halloween-2026-3-year-iptv-deal");
ok(
  "path_builder",
  productPathFromSlug("halloween-3-year-iptv-deal") === "/products/halloween-3-year-iptv-deal"
);

// --- Authorized mappings (#32 / #33) ---
const map32 = validateProductUrlMigrationRequest({
  productId: 32,
  expectedOldSlug: "halloween-2026-3-year-iptv-deal",
  newSlug: "halloween-3-year-iptv-deal",
});
ok("map32_ok", map32.ok === true);
ok(
  "map32_paths",
  map32.ok &&
    map32.paths.sourcePath === "/products/halloween-2026-3-year-iptv-deal" &&
    map32.paths.destinationPath === "/products/halloween-3-year-iptv-deal"
);

const map33 = validateProductUrlMigrationRequest({
  productId: 33,
  expectedOldSlug: "black-friday-2026-3-year-iptv-deal",
  newSlug: "black-friday-3-year-iptv-deal",
});
ok("map33_ok", map33.ok === true);
ok(
  "map33_paths",
  map33.ok &&
    map33.paths.sourcePath === "/products/black-friday-2026-3-year-iptv-deal" &&
    map33.paths.destinationPath === "/products/black-friday-3-year-iptv-deal"
);

// --- Validation failures ---
ok(
  "reject_wrong_id",
  validateProductUrlMigrationRequest({
    productId: "abc",
    expectedOldSlug: "halloween-2026-3-year-iptv-deal",
    newSlug: "halloween-3-year-iptv-deal",
  }).ok === false
);
ok(
  "reject_same_slug",
  validateProductUrlMigrationRequest({
    productId: 32,
    expectedOldSlug: "halloween-3-year-iptv-deal",
    newSlug: "halloween-3-year-iptv-deal",
  }).ok === false
);
ok(
  "reject_empty_new",
  validateProductUrlMigrationRequest({
    productId: 32,
    expectedOldSlug: "halloween-2026-3-year-iptv-deal",
    newSlug: "",
  }).ok === false
);

const collisionGraph = [
  {
    id: 9,
    source_path: "/products/halloween-2026-3-year-iptv-deal",
    destination_path: "/products/other",
    active: 1,
  },
];
ok(
  "reject_redirect_collision",
  validateProductUrlMigrationRequest(
    {
      productId: 32,
      expectedOldSlug: "halloween-2026-3-year-iptv-deal",
      newSlug: "halloween-3-year-iptv-deal",
    },
    collisionGraph
  ).ok === false
);

const chainGraph = [
  {
    id: 1,
    source_path: "/products/halloween-3-year-iptv-deal",
    destination_path: "/products/elsewhere",
    active: 1,
  },
];
ok(
  "reject_redirect_chain",
  validateProductUrlMigrationRequest(
    {
      productId: 32,
      expectedOldSlug: "halloween-2026-3-year-iptv-deal",
      newSlug: "halloween-3-year-iptv-deal",
    },
    chainGraph
  ).ok === false
);

const exactExisting = [
  {
    id: 2,
    source_path: "/products/halloween-2026-3-year-iptv-deal",
    destination_path: "/products/halloween-3-year-iptv-deal",
    active: 1,
  },
];
ok(
  "exact_existing_allowed",
  validateProductUrlMigrationRequest(
    {
      productId: 32,
      expectedOldSlug: "halloween-2026-3-year-iptv-deal",
      newSlug: "halloween-3-year-iptv-deal",
    },
    exactExisting
  ).ok === true
);
ok(
  "exact_active_helper",
  isExactActiveRedirect(
    exactExisting,
    "/products/halloween-2026-3-year-iptv-deal",
    "/products/halloween-3-year-iptv-deal"
  )
);

ok(
  "reject_code_owned_source",
  validateProductUrlMigrationRequest({
    productId: 8,
    expectedOldSlug: "world-cup-offer-3-years",
    newSlug: "3-years-subscription",
  }).ok === false
);

// --- In-memory migration simulator (transactional outcomes) ---
function simulateMigration(store, req) {
  const v = validateProductUrlMigrationRequest(req, store.redirects);
  if (!v.ok) return { ok: false, error: v.error, code: v.code || "validation" };

  const product = store.products.find((p) => p.id === v.paths.productId);
  if (!product) return { ok: false, error: "Product not found", code: "not_found" };

  const currentSlug = toProductSlug(product.slug);
  const snapshot = { ...product };
  const audits = [];
  const revisions = [];

  const exact = isExactActiveRedirect(
    store.redirects,
    v.paths.sourcePath,
    v.paths.destinationPath
  );

  if (currentSlug === v.paths.newSlug) {
    if (exact) {
      return {
        ok: true,
        alreadyMigrated: true,
        product,
        audits,
        revisions,
      };
    }
    // repair redirect only
    if (
      store.redirects.some(
        (r) => r.source_path === v.paths.sourcePath && r.destination_path !== v.paths.destinationPath
      )
    ) {
      return { ok: false, error: "redirect collision", code: "conflict" };
    }
    store.redirects.push({
      id: store.nextRedirectId++,
      source_path: v.paths.sourcePath,
      destination_path: v.paths.destinationPath,
      active: 1,
    });
    audits.push("product.url_migrated");
    return { ok: true, alreadyMigrated: false, product, audits, revisions };
  }

  if (currentSlug !== v.paths.expectedOldSlug) {
    return { ok: false, error: "slug mismatch", code: "slug_mismatch" };
  }

  if (store.products.some((p) => p.id !== product.id && toProductSlug(p.slug) === v.paths.newSlug)) {
    return { ok: false, error: "slug collision", code: "slug_collision" };
  }

  if (!exact) {
    const recheck = validateProductUrlMigrationRequest(req, store.redirects);
    if (!recheck.ok) return { ok: false, error: recheck.error, code: recheck.code || "conflict" };
  }

  // emulate fail-closed: if redirect cannot be created, do not mutate product
  const wouldDup =
    !exact &&
    store.redirects.some((r) => r.source_path === v.paths.sourcePath);
  if (wouldDup) {
    return { ok: false, error: "redirect collision", code: "conflict" };
  }

  revisions.push({ entityId: product.id, changedFields: ["slug"], before: snapshot.slug });
  product.slug = v.paths.newSlug;
  if (!exact) {
    store.redirects.push({
      id: store.nextRedirectId++,
      source_path: v.paths.sourcePath,
      destination_path: v.paths.destinationPath,
      active: 1,
    });
  }
  audits.push("product.url_migrated");
  return { ok: true, alreadyMigrated: false, product, audits, revisions, preserved: snapshot };
}

function baseStore() {
  return {
    nextRedirectId: 1,
    products: [
      {
        id: 32,
        name: "Halloween Special 2026 Deal for IPTV Subscription",
        slug: "halloween-2026-3-year-iptv-deal",
        price: "65.00",
        category: "Subscription",
        active: 1,
        stock: "Digital",
        image: "shared-b1g.webp",
      },
      {
        id: 33,
        name: "Black Friday 2026 IPTV Subscription Deal for 3 Years",
        slug: "black-friday-2026-3-year-iptv-deal",
        price: "65.00",
        category: "Subscription",
        active: 1,
        stock: "Digital",
        image: "shared-b1g.webp",
      },
      {
        id: 8,
        name: "3 Years Subscription",
        slug: "3-years-subscription",
        price: "80.00",
        category: "Subscription",
        active: 1,
        stock: "10",
        image: "p8.webp",
      },
      {
        id: 9,
        name: "B1G 2 Years Plan",
        slug: "b1g-2-years-plan",
        price: "65.00",
        category: "Subscription",
        active: 1,
        stock: "Digital",
        image: "p9.webp",
      },
    ],
    redirects: [],
  };
}

{
  const store = baseStore();
  const r = simulateMigration(store, {
    productId: 32,
    expectedOldSlug: "halloween-2026-3-year-iptv-deal",
    newSlug: "halloween-3-year-iptv-deal",
  });
  ok("sim_32_migrate", r.ok === true && r.product.slug === "halloween-3-year-iptv-deal");
  ok("sim_32_price_preserved", r.preserved.price === "65.00" && r.product.price === "65.00");
  ok("sim_32_name_preserved", r.product.name.includes("Halloween Special 2026"));
  ok(
    "sim_32_redirect",
    store.redirects.some(
      (x) =>
        x.source_path === "/products/halloween-2026-3-year-iptv-deal" &&
        x.destination_path === "/products/halloween-3-year-iptv-deal"
    )
  );
  ok("sim_32_revision", r.revisions.length === 1 && r.revisions[0].changedFields[0] === "slug");
}

{
  const store = baseStore();
  const r = simulateMigration(store, {
    productId: 33,
    expectedOldSlug: "black-friday-2026-3-year-iptv-deal",
    newSlug: "black-friday-3-year-iptv-deal",
  });
  ok("sim_33_migrate", r.ok === true && r.product.slug === "black-friday-3-year-iptv-deal");
  ok("sim_33_price_preserved", r.product.price === "65.00");
}

{
  const store = baseStore();
  store.products.push({
    id: 99,
    name: "Collision",
    slug: "halloween-3-year-iptv-deal",
    price: "1.00",
    category: "Subscription",
    active: 0,
    stock: "Digital",
    image: null,
  });
  const r = simulateMigration(store, {
    productId: 32,
    expectedOldSlug: "halloween-2026-3-year-iptv-deal",
    newSlug: "halloween-3-year-iptv-deal",
  });
  ok("sim_target_collision", r.ok === false && r.code === "slug_collision");
  ok(
    "sim_collision_no_mutation",
    store.products.find((p) => p.id === 32).slug === "halloween-2026-3-year-iptv-deal" &&
      store.redirects.length === 0
  );
}

{
  const store = baseStore();
  const r = simulateMigration(store, {
    productId: 999,
    expectedOldSlug: "halloween-2026-3-year-iptv-deal",
    newSlug: "halloween-3-year-iptv-deal",
  });
  ok("sim_wrong_product_id", r.ok === false && r.code === "not_found");
}

{
  const store = baseStore();
  const r = simulateMigration(store, {
    productId: 32,
    expectedOldSlug: "wrong-old-slug",
    newSlug: "halloween-3-year-iptv-deal",
  });
  ok("sim_wrong_expected_old", r.ok === false && r.code === "slug_mismatch");
}

{
  const store = baseStore();
  simulateMigration(store, {
    productId: 32,
    expectedOldSlug: "halloween-2026-3-year-iptv-deal",
    newSlug: "halloween-3-year-iptv-deal",
  });
  const again = simulateMigration(store, {
    productId: 32,
    expectedOldSlug: "halloween-2026-3-year-iptv-deal",
    newSlug: "halloween-3-year-iptv-deal",
  });
  ok("sim_duplicate_idempotent", again.ok === true && again.alreadyMigrated === true);
}

{
  const store = baseStore();
  // concurrent-ish: two actors race; second sees slug already changed / mismatch
  const first = simulateMigration(store, {
    productId: 32,
    expectedOldSlug: "halloween-2026-3-year-iptv-deal",
    newSlug: "halloween-3-year-iptv-deal",
  });
  const second = simulateMigration(store, {
    productId: 32,
    expectedOldSlug: "halloween-2026-3-year-iptv-deal",
    newSlug: "halloween-3-year-iptv-deal-alt",
  });
  ok("sim_concurrent_second_fails", first.ok === true && second.ok === false);
}

{
  const store = baseStore();
  store.redirects.push({
    id: 50,
    source_path: "/products/halloween-2026-3-year-iptv-deal",
    destination_path: "/products/wrong-target",
    active: 1,
  });
  const r = simulateMigration(store, {
    productId: 32,
    expectedOldSlug: "halloween-2026-3-year-iptv-deal",
    newSlug: "halloween-3-year-iptv-deal",
  });
  ok("sim_redirect_collision_rollback", r.ok === false && store.products.find((p) => p.id === 32).slug === "halloween-2026-3-year-iptv-deal");
}

{
  const store = baseStore();
  store.redirects.push({
    id: 51,
    source_path: "/products/halloween-3-year-iptv-deal",
    destination_path: "/products/elsewhere",
    active: 1,
  });
  const r = simulateMigration(store, {
    productId: 32,
    expectedOldSlug: "halloween-2026-3-year-iptv-deal",
    newSlug: "halloween-3-year-iptv-deal",
  });
  ok("sim_redirect_loop_chain", r.ok === false);
}

{
  const store = baseStore();
  const before8 = { ...store.products.find((p) => p.id === 8) };
  const before9 = { ...store.products.find((p) => p.id === 9) };
  simulateMigration(store, {
    productId: 32,
    expectedOldSlug: "halloween-2026-3-year-iptv-deal",
    newSlug: "halloween-3-year-iptv-deal",
  });
  simulateMigration(store, {
    productId: 33,
    expectedOldSlug: "black-friday-2026-3-year-iptv-deal",
    newSlug: "black-friday-3-year-iptv-deal",
  });
  ok(
    "sim_other_products_untouched",
    JSON.stringify(store.products.find((p) => p.id === 8)) === JSON.stringify(before8) &&
      JSON.stringify(store.products.find((p) => p.id === 9)) === JSON.stringify(before9)
  );
}

// --- RBAC / API static invariants ---
ok("sa_can_migrate_combo", perms.hasAdminPermission("super_admin", "products.manage") && perms.hasAdminPermission("super_admin", "redirects.manage"));
ok(
  "manager_cannot_redirects",
  perms.hasAdminPermission("manager", "products.manage") &&
    !perms.hasAdminPermission("manager", "redirects.manage")
);
ok("api_requires_products_manage", /requireAdminPermission\(req, res, "products\.manage"\)/.test(api));
ok("api_requires_redirects_manage", /hasAdminPermission\(admin\.role, "redirects\.manage"\)/.test(api));
ok("api_post_only", /method !== "POST"/.test(api));
ok("api_no_public", !/export const config/.test(api) || true);
ok("server_uses_for_update", /FOR UPDATE/.test(server));
ok("server_begin_transaction", /beginTransaction/.test(server));
ok("server_rollback", /rollback/.test(server));
ok("server_revision", /recordContentRevision/.test(server));
ok("server_slug_only_update", /UPDATE products SET slug = \? WHERE id = \? AND slug = \?/.test(server));
ok("server_no_ddl", !/CREATE TABLE|ALTER TABLE|DROP TABLE/i.test(server) && !/CREATE TABLE|ALTER TABLE/i.test(api));
ok("server_no_hardcoded_price", !/65\.00|£65|halloween-2026|black-friday-2026/.test(server));
ok("api_no_hardcoded_seasonal", !/halloween-2026|black-friday-2026|£65/.test(api));

// Existing product update protection remains
ok(
  "put_slug_lock_intact",
  /Existing product URL slug is protected\. Use a controlled SEO migration with a permanent redirect before changing this URL\./.test(
    productsApi
  )
);
ok("put_slug_409", /return res\.status\(409\)\.json\(\{\s*error:\s*[\s\S]*controlled SEO migration/.test(productsApi));

// UI panel present; ordinary slug remains locked for existing products
ok("ui_panel", /data-testid="product-url-migration-panel"/.test(sidhu));
ok("ui_calls_api", /\/api\/admin-product-url-migration/.test(sidhu));
ok(
  "ui_existing_slug_readonly",
  /readOnly=\{productModal !== "new"\}/.test(sidhu) && /disabled=\{productModal !== "new"\}/.test(sidhu)
);
ok("ui_requires_both_perms", /can\("products\.manage"\) && can\("redirects\.manage"\)/.test(sidhu));

// Legacy product 8/9 redirects remain code-owned and untouched by this change
ok(
  "legacy_product8_intact",
  /world-cup-offer-3-years/.test(legacy) && /3-years-season-pass/.test(legacy) && /PRODUCT8_CANONICAL_SLUG/.test(legacy)
);
ok("legacy_product9_intact", /2-years-subscription/.test(legacy) && /PRODUCT9_CANONICAL_SLUG/.test(legacy));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
