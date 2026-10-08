/**
 * AB-2 — Autonomous-safe blog persistence adapter tests.
 * Source contracts + injectable fake persistence — no real DB / HTTP / providers.
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
  const sandbox = { exports: {}, module: { exports: {} } };
  const localRequire = (id) => {
    if (Object.prototype.hasOwnProperty.call(stubs, id)) return stubs[id];
    // Never load real mysql pool in unit fixtures
    if (
      id === "@/lib/db" ||
      id === "./db" ||
      id === "../db" ||
      id.endsWith("/lib/db") ||
      id.endsWith("/db")
    ) {
      return stubs["@/lib/db"] || dbStub;
    }
    if (id.startsWith("@/lib/")) {
      const mapped = id.replace("@/lib/", "lib/") + ".ts";
      if (fs.existsSync(path.join(ROOT, mapped))) {
        return loadTsModule(mapped, stubs);
      }
    }
    if (id.startsWith("./") || id.startsWith("../")) {
      const base = path.resolve(path.dirname(path.join(ROOT, rel)), id);
      if (fs.existsSync(base + ".ts")) {
        return loadTsModule(path.relative(ROOT, base + ".ts").replace(/\\/g, "/"), stubs);
      }
    }
    return require(id);
  };
  const fn = new Function("exports", "module", "require", outputText);
  fn(sandbox.exports, sandbox.module, localRequire);
  return sandbox.module.exports && Object.keys(sandbox.module.exports).length
    ? sandbox.module.exports
    : sandbox.exports;
}

const apiSrc = read("pages/api/blog.ts");
const svcSrc = read("lib/blogPersistenceServer.ts");
const qaSrc = read("lib/blogPrePublishQa.ts");
const sidhuSrc = read("app/sidhu/page.tsx");

const dbStub = {
  __esModule: true,
  default: {
    query: async () => {
      throw new Error("default DB must not run in AB-2 unit fixtures");
    },
    getConnection: async () => {
      throw new Error("default DB connection must not run in AB-2 unit fixtures");
    },
  },
};

const stubs = { "@/lib/db": dbStub };
const {
  BlogPersistenceError,
  normalizeBlogWriteSlug,
  normalizeBlogFaqs,
  requireExplicitBlogStatus,
  requireSuppliedBlogStatus,
  createBlogPost,
  updateBlogPost,
  createAutonomousBlogDraft,
  updateAutonomousBlogDraft,
  publishAutonomousBlogDraft,
} = loadTsModule("lib/blogPersistenceServer.ts", stubs);

const {
  evaluateAutonomousBlogPrePublish,
  normalizeAutonomousBlogSlug,
} = loadTsModule("lib/blogPrePublishQa.ts", stubs);

const actor = {
  authenticated: true,
  principalType: "master",
  name: "Test Admin",
  role: "super_admin",
  sessionId: 1,
};

function bodyParagraphs(minChars) {
  const unit =
    "<p>Firestick maintenance tips for UK households covering cache cleanup, storage, WiFi, and app hygiene.</p>";
  let html = "<h2>Overview</h2>";
  while (
    html
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim().length < minChars
  ) {
    html += unit;
  }
  return html;
}

function makeStore(seedRows = []) {
  let nextId = 1;
  const rows = seedRows.map((r) => {
    const id = r.id != null ? Number(r.id) : nextId++;
    if (id >= nextId) nextId = id + 1;
    return { ...r, id, active: r.active != null ? r.active : 1 };
  });

  const calls = {
    inserts: 0,
    updates: 0,
    selects: 0,
    revisions: 0,
    audits: [],
    sitemap: 0,
    seoGuards: 0,
    qaCalls: 0,
    sql: [],
  };

  async function query(sql, params = []) {
    const s = String(sql).replace(/\s+/g, " ").trim();
    calls.sql.push({ sql: s, params });
    if (/^SELECT \* FROM blog_posts WHERE id = \? LIMIT 1$/i.test(s)) {
      calls.selects += 1;
      const id = Number(params[0]);
      return [rows.filter((r) => r.id === id), []];
    }
    if (/^SELECT id, status FROM blog_posts WHERE id = \? LIMIT 1$/i.test(s)) {
      calls.selects += 1;
      const id = Number(params[0]);
      return [
        rows
          .filter((r) => r.id === id)
          .map((r) => ({ id: r.id, status: r.status })),
        [],
      ];
    }
    if (/^SELECT id FROM blog_posts WHERE slug = \? LIMIT 1$/i.test(s)) {
      calls.selects += 1;
      const slug = String(params[0]);
      return [rows.filter((r) => r.slug === slug).map((r) => ({ id: r.id })), []];
    }
    if (/^SELECT id FROM blog_posts WHERE slug = \? AND id <> \? LIMIT 1$/i.test(s)) {
      calls.selects += 1;
      const slug = String(params[0]);
      const exclude = Number(params[1]);
      return [
        rows
          .filter((r) => r.slug === slug && r.id !== exclude)
          .map((r) => ({ id: r.id })),
        [],
      ];
    }
    if (
      /^SELECT id, title, slug, status, active FROM blog_posts ORDER BY id ASC LIMIT 5000$/i.test(
        s
      )
    ) {
      calls.selects += 1;
      return [
        rows.map((r) => ({
          id: r.id,
          title: r.title,
          slug: r.slug,
          status: r.status,
          active: r.active,
        })),
        [],
      ];
    }
    if (/^INSERT INTO blog_posts/i.test(s)) {
      calls.inserts += 1;
      const id = nextId++;
      const row = {
        id,
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
        active: 1,
      };
      rows.push(row);
      return [{ insertId: id }, []];
    }
    if (/^UPDATE blog_posts SET/i.test(s)) {
      calls.updates += 1;
      const id = Number(params[params.length - 1]);
      const row = rows.find((r) => r.id === id);
      if (!row) return [{ affectedRows: 0 }, []];
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
      return [{ affectedRows: 1 }, []];
    }
    throw new Error("Unexpected SQL in fake store: " + s);
  }

  async function getConnection() {
    return {
      beginTransaction: async () => {},
      commit: async () => {},
      rollback: async () => {},
      release: () => {},
      query,
    };
  }

  function deps(overrides = {}) {
    return {
      query,
      getConnection,
      recordAdminAudit: async (input) => {
        calls.audits.push(input);
      },
      recordContentRevision: async () => {
        calls.revisions += 1;
        return 1;
      },
      snapshotBlog: (row) => ({ ...row }),
      invalidateSitemapCache: () => {
        calls.sitemap += 1;
      },
      runPostSaveSeoGuard: async (args) => {
        calls.seoGuards += 1;
        return {
          status: "checked",
          entity_type: "blog",
          entity_id: String(args.entityId),
          operation: args.operation,
          issue_count: 0,
          needs_attention: 0,
          review: 0,
          issues: [],
          memory_synced: true,
        };
      },
      shouldRunPostSaveSeoGuard: () => ({
        run: false,
        skip_reason: "noop_update",
      }),
      evaluateAutonomousBlogPrePublish: (input) => {
        calls.qaCalls += 1;
        return evaluateAutonomousBlogPrePublish(input);
      },
      ...overrides,
    };
  }

  return { rows, calls, query, getConnection, deps };
}

console.log("\nAB-2 Blog Persistence Adapter\n");

// ── SOURCE: MANUAL CREATE STATUS ───────────────────────────────────────────

ok(
  "A_api_no_status_or_published",
  !/status\s*\|\|\s*['"]published['"]/.test(apiSrc)
);
ok(
  "B_service_no_status_or_published_default",
  !/status\s*\|\|\s*['"]published['"]/.test(svcSrc)
);
ok(
  "C_api_requires_explicit_status",
  /requireExplicitBlogStatus/.test(apiSrc) && /createBlogPost/.test(apiSrc)
);
ok(
  "D_api_put_delegates_update",
  /updateBlogPost/.test(apiSrc) && !/INSERT INTO blog_posts/.test(apiSrc)
);
ok(
  "E_api_post_no_inline_insert",
  !/INSERT INTO blog_posts/.test(apiSrc)
);
ok(
  "F_api_put_no_inline_update_business",
  !/UPDATE blog_posts SET title=\?/.test(apiSrc)
);
ok(
  "G_sidhu_sends_status_explicitly",
  /status:\s*"published"\s*as\s*"published"\s*\|\s*"draft"/.test(sidhuSrc) ||
    /status:\s*"published"\s*as\s*"published"\|"draft"/.test(sidhuSrc)
);
ok(
  "H_get_security_split_preserved",
  /status\s*=\s*"published"\s*AND\s*active\s*=\s*1/.test(apiSrc) &&
    /mutate:\s*false/.test(apiSrc)
);
ok(
  "I_no_autonomous_http_route",
  !fs.existsSync(path.join(ROOT, "pages/api/autonomous-blog.ts")) &&
    !fs.existsSync(path.join(ROOT, "pages/api/blog-autonomous.ts")) &&
    !/autonomous-blog|blog-autonomous|\/api\/cron/.test(apiSrc)
);
ok(
  "J_no_provider_imports",
  !/seoAi|openai|gemini|OpenAI|@google/i.test(svcSrc)
);
ok(
  "K_ab1_reused_not_copied",
  /evaluateAutonomousBlogPrePublish/.test(svcSrc) &&
    !/publicationIntent === "publish"/.test(svcSrc)
);
ok(
  "L_shared_slug_normalizer_exported",
  /export function normalizeBlogWriteSlug/.test(svcSrc)
);
ok(
  "M_slug_algo_matches_ab1",
  normalizeBlogWriteSlug("//Evil Example!!") ===
    normalizeAutonomousBlogSlug("//Evil Example!!") &&
    normalizeBlogWriteSlug("Hello World") === "hello-world"
);
ok(
  "N_no_db_unique_migration_in_diff_scope",
  !/UNIQUE.*slug|ADD UNIQUE|CREATE UNIQUE/i.test(svcSrc) &&
    !fs.existsSync(path.join(ROOT, "scripts/migrate-blog-slug-unique.js"))
);
ok(
  "O_delete_remains_in_api",
  /req\.method === ['"]DELETE['"]/.test(apiSrc)
);

// ── PURE STATUS HELPERS ────────────────────────────────────────────────────

{
  let threw = false;
  try {
    requireExplicitBlogStatus(undefined);
  } catch (e) {
    threw = e instanceof BlogPersistenceError && e.code === "invalid_status";
  }
  ok("P_missing_status_rejected", threw);
}
{
  let threw = false;
  try {
    requireExplicitBlogStatus(null);
  } catch (e) {
    threw = e instanceof BlogPersistenceError && e.code === "invalid_status";
  }
  ok("Q_null_status_rejected", threw);
}
{
  let threw = false;
  try {
    requireExplicitBlogStatus("");
  } catch (e) {
    threw = e instanceof BlogPersistenceError && e.code === "invalid_status";
  }
  ok("R_empty_status_rejected", threw);
}
{
  let threw = false;
  try {
    requireExplicitBlogStatus("something-invalid");
  } catch (e) {
    threw = e instanceof BlogPersistenceError && e.code === "invalid_status";
  }
  ok("S_unknown_status_rejected", threw);
}
ok("T_explicit_draft_mode", requireExplicitBlogStatus("draft") === "draft");
ok(
  "U_explicit_published_mode",
  requireExplicitBlogStatus("published") === "publish"
);
ok(
  "V_supplied_invalid_update_status",
  (() => {
    try {
      requireSuppliedBlogStatus("live");
      return false;
    } catch (e) {
      return e.code === "invalid_status";
    }
  })()
);
ok(
  "W_faqs_normalize_object",
  normalizeBlogFaqs([{ question: "Q", answer: "A" }]) ===
    JSON.stringify([{ question: "Q", answer: "A" }])
);

// ── MANUAL CREATE VIA SERVICE ──────────────────────────────────────────────

async function runAsync() {
  {
    const store = makeStore();
    const res = await createBlogPost({
      actor,
      input: {
        title: "Draft Create Test",
        slug: "draft-create-test",
        excerpt: "e",
        content: "c",
      },
      mode: "draft",
      source: "manual_cms",
      deps: store.deps(),
    });
    ok(
      "X_manual_create_draft",
      res.success === true &&
        store.rows[0].status === "draft" &&
        store.calls.inserts === 1 &&
        store.calls.audits[0].action === "blog.created" &&
        store.calls.sitemap === 1 &&
        store.calls.seoGuards === 1
    );
  }

  {
    const store = makeStore();
    const res = await createBlogPost({
      actor,
      input: {
        title: "Published Create Test",
        slug: "published-create-test",
        excerpt: "e",
        content: "c",
      },
      mode: "publish",
      source: "manual_cms",
      deps: store.deps(),
    });
    ok(
      "Y_manual_create_published",
      res.success === true && store.rows[0].status === "published"
    );
  }

  {
    const store = makeStore([
      {
        id: 10,
        title: "Existing",
        slug: "taken-slug",
        status: "published",
        excerpt: "",
        content: "",
        featured_image: "",
        meta_title: "",
        meta_description: "",
        focus_keyword: "",
        canonical_url: "https://firestick4uk.com/blog/taken-slug",
        faqs: null,
        featured: 0,
        category: "Guides",
        emoji: "📝",
        badge: "guide",
        badgeText: "Guide",
      },
    ]);
    let err = null;
    try {
      await createBlogPost({
        actor,
        input: {
          title: "Collision Title Unique",
          slug: "taken-slug",
          excerpt: "e",
          content: "c",
        },
        mode: "draft",
        source: "manual_cms",
        deps: store.deps(),
      });
    } catch (e) {
      err = e;
    }
    ok(
      "Z_create_slug_collision_409",
      err &&
        err.code === "slug_conflict" &&
        err.status === 409 &&
        store.calls.inserts === 0 &&
        store.calls.audits.length === 0
    );
  }

  // ── MANUAL UPDATE ────────────────────────────────────────────────────────

  {
    const store = makeStore([
      {
        id: 20,
        title: "Keep Me",
        slug: "keep-me",
        status: "draft",
        excerpt: "ex",
        content: "body",
        featured_image: "",
        meta_title: "",
        meta_description: "",
        focus_keyword: "",
        canonical_url: "https://firestick4uk.com/blog/keep-me",
        faqs: null,
        featured: 0,
        category: "Guides",
        emoji: "📝",
        badge: "guide",
        badgeText: "Guide",
        active: 1,
      },
    ]);
    const res = await updateBlogPost({
      actor,
      id: 20,
      patch: { id: 20 },
      source: "manual_cms",
      deps: store.deps(),
    });
    ok(
      "AA_omitted_status_preserves_draft_noop",
      res.changed_fields.length === 0 &&
        store.rows[0].status === "draft" &&
        store.calls.updates === 0 &&
        store.calls.revisions === 0 &&
        store.calls.audits.length === 0 &&
        store.calls.sitemap === 0
    );
  }

  {
    const store = makeStore([
      {
        id: 21,
        title: "Partial",
        slug: "partial-update",
        status: "draft",
        excerpt: "old",
        content: "body",
        featured_image: "",
        meta_title: "",
        meta_description: "",
        focus_keyword: "",
        canonical_url: "https://firestick4uk.com/blog/partial-update",
        faqs: null,
        featured: 0,
        category: "Guides",
        emoji: "📝",
        badge: "guide",
        badgeText: "Guide",
        active: 1,
      },
    ]);
    const res = await updateBlogPost({
      actor,
      id: 21,
      patch: { excerpt: "new excerpt" },
      source: "manual_cms",
      deps: store.deps(),
    });
    ok(
      "AB_partial_fields_preserved",
      res.changed_fields.includes("excerpt") &&
        store.rows[0].excerpt === "new excerpt" &&
        store.rows[0].title === "Partial" &&
        store.rows[0].status === "draft" &&
        store.calls.revisions === 1 &&
        store.calls.audits[0].action === "blog.updated"
    );
  }

  {
    const store = makeStore([
      {
        id: 22,
        title: "To Publish Manual",
        slug: "to-publish-manual",
        status: "draft",
        excerpt: "e",
        content: "c",
        featured_image: "",
        meta_title: "",
        meta_description: "",
        focus_keyword: "",
        canonical_url: "https://firestick4uk.com/blog/to-publish-manual",
        faqs: null,
        featured: 0,
        category: "Guides",
        emoji: "📝",
        badge: "guide",
        badgeText: "Guide",
        active: 1,
      },
    ]);
    const res = await updateBlogPost({
      actor,
      id: 22,
      patch: {},
      mode: "publish",
      source: "manual_cms",
      deps: store.deps(),
    });
    ok(
      "AC_explicit_publish_mode",
      res.changed_fields.includes("status") &&
        store.rows[0].status === "published"
    );
  }

  {
    const store = makeStore([
      {
        id: 23,
        title: "Pub Slug Lock",
        slug: "pub-slug-lock",
        status: "published",
        excerpt: "e",
        content: "c",
        featured_image: "",
        meta_title: "",
        meta_description: "",
        focus_keyword: "",
        canonical_url: "https://firestick4uk.com/blog/pub-slug-lock",
        faqs: null,
        featured: 0,
        category: "Guides",
        emoji: "📝",
        badge: "guide",
        badgeText: "Guide",
        active: 1,
      },
    ]);
    let err = null;
    try {
      await updateBlogPost({
        actor,
        id: 23,
        patch: { slug: "new-slug-attempt" },
        source: "manual_cms",
        deps: store.deps(),
      });
    } catch (e) {
      err = e;
    }
    ok(
      "AD_published_slug_protected",
      err &&
        err.code === "published_slug_protected" &&
        err.status === 409 &&
        store.calls.updates === 0
    );
  }

  {
    const store = makeStore([
      {
        id: 24,
        title: "A",
        slug: "slug-a",
        status: "draft",
        excerpt: "",
        content: "",
        featured_image: "",
        meta_title: "",
        meta_description: "",
        focus_keyword: "",
        canonical_url: "https://firestick4uk.com/blog/slug-a",
        faqs: null,
        featured: 0,
        category: "Guides",
        emoji: "📝",
        badge: "guide",
        badgeText: "Guide",
        active: 1,
      },
      {
        id: 25,
        title: "B",
        slug: "slug-b",
        status: "draft",
        excerpt: "",
        content: "",
        featured_image: "",
        meta_title: "",
        meta_description: "",
        focus_keyword: "",
        canonical_url: "https://firestick4uk.com/blog/slug-b",
        faqs: null,
        featured: 0,
        category: "Guides",
        emoji: "📝",
        badge: "guide",
        badgeText: "Guide",
        active: 1,
      },
    ]);
    let err = null;
    try {
      await updateBlogPost({
        actor,
        id: 25,
        patch: { slug: "slug-a" },
        mode: "draft",
        source: "manual_cms",
        deps: store.deps(),
      });
    } catch (e) {
      err = e;
    }
    ok(
      "AE_draft_slug_change_collision",
      err && err.code === "slug_conflict" && store.calls.updates === 0
    );

    const same = await updateBlogPost({
      actor,
      id: 24,
      patch: { slug: "slug-a", title: "A Renamed" },
      mode: "draft",
      source: "manual_cms",
      deps: store.deps(),
    });
    ok(
      "AF_unchanged_own_slug_allowed",
      same.success === true &&
        store.rows.find((r) => r.id === 24).slug === "slug-a" &&
        store.rows.find((r) => r.id === 24).title === "A Renamed"
    );
  }

  // ── AUTONOMOUS DRAFT CREATE / UPDATE ─────────────────────────────────────

  {
    const store = makeStore();
    const res = await createAutonomousBlogDraft({
      actor,
      input: {
        title: "Auto Draft",
        slug: "auto-draft",
        excerpt: "e",
        content: "c",
        status: "published",
      },
      deps: store.deps(),
    });
    ok(
      "AG_autonomous_create_always_draft",
      res.success === true &&
        store.rows[0].status === "draft" &&
        store.calls.audits[0].metadata.source === "autonomous" &&
        store.calls.qaCalls === 0
    );
  }

  {
    const store = makeStore([
      {
        id: 30,
        title: "Auto Draft Up",
        slug: "auto-draft-up",
        status: "draft",
        excerpt: "old",
        content: "c",
        featured_image: "",
        meta_title: "",
        meta_description: "",
        focus_keyword: "",
        canonical_url: "https://firestick4uk.com/blog/auto-draft-up",
        faqs: null,
        featured: 0,
        category: "Guides",
        emoji: "📝",
        badge: "guide",
        badgeText: "Guide",
        active: 1,
      },
    ]);
    const res = await updateAutonomousBlogDraft({
      actor,
      id: 30,
      patch: { excerpt: "newer" },
      deps: store.deps(),
    });
    ok(
      "AH_autonomous_draft_update_remains_draft",
      res.changed_fields.includes("excerpt") &&
        store.rows[0].status === "draft" &&
        store.calls.revisions === 1
    );
  }

  {
    const store = makeStore([
      {
        id: 31,
        title: "Published No Auto Edit",
        slug: "published-no-auto",
        status: "published",
        excerpt: "e",
        content: "c",
        featured_image: "",
        meta_title: "",
        meta_description: "",
        focus_keyword: "",
        canonical_url: "https://firestick4uk.com/blog/published-no-auto",
        faqs: null,
        featured: 0,
        category: "Guides",
        emoji: "📝",
        badge: "guide",
        badgeText: "Guide",
        active: 1,
      },
    ]);
    let err = null;
    try {
      await updateAutonomousBlogDraft({
        actor,
        id: 31,
        patch: { excerpt: "x" },
        deps: store.deps(),
      });
    } catch (e) {
      err = e;
    }
    ok(
      "AI_autonomous_update_rejects_published",
      err && err.code === "not_draft" && store.calls.updates === 0
    );
  }

  // ── AUTONOMOUS PUBLISH ───────────────────────────────────────────────────

  function readyDraft(overrides = {}) {
    return {
      id: 40,
      title: "How to Speed Up a Slow Firestick Autonomously",
      slug: "how-to-speed-up-a-slow-firestick-autonomously",
      excerpt: "Practical Firestick speed tips for UK streaming setups.",
      content: bodyParagraphs(1300),
      category: "Guides",
      emoji: "📝",
      badge: "guide",
      badgeText: "Guide",
      featured_image: "/uploads/firestick-speed.jpg",
      meta_title: "How to Speed Up a Slow Firestick Autonomously",
      meta_description:
        "Practical Firestick speed tips for UK streaming setups and cache cleanup.",
      focus_keyword: "slow firestick",
      status: "draft",
      featured: 0,
      canonical_url:
        "https://firestick4uk.com/blog/how-to-speed-up-a-slow-firestick-autonomously",
      faqs: JSON.stringify([
        {
          question: "Does this work on Fire TV Stick 4K?",
          answer: "Yes, the steps apply to common Firestick models in the UK.",
        },
      ]),
      active: 1,
      ...overrides,
    };
  }

  {
    const store = makeStore([readyDraft()]);
    const holdDeps = store.deps({
      evaluateAutonomousBlogPrePublish: (input) => {
        store.calls.qaCalls += 1;
        ok(
          "AJ_publish_intent_forced",
          input.candidate.publicationIntent === "publish"
        );
        ok(
          "AK_evidence_forwarded",
          input.candidate.evidenceState === "missing"
        );
        ok(
          "AL_media_forwarded",
          input.candidate.mediaState.featuredImageReady === false
        );
        ok(
          "AM_saved_db_authority",
          input.candidate.title === store.rows[0].title &&
            input.candidate.slug === store.rows[0].slug
        );
        ok(
          "AN_inventory_supplied",
          Array.isArray(input.existingPosts) && input.existingPosts.length >= 1
        );
        return {
          verdict: "HOLD",
          blockers: [
            {
              code: "evidence-not-ready",
              severity: "blocker",
              message: "hold",
              field: "evidenceState",
              evidence: "missing",
            },
          ],
          warnings: [],
          existingSeoIssues: [],
          checks: {},
        };
      },
    });
    const res = await publishAutonomousBlogDraft({
      actor,
      id: 40,
      evidenceState: "missing",
      mediaState: { featuredImageReady: false },
      deps: holdDeps,
    });
    ok(
      "AO_hold_zero_mutation",
      res.outcome === "HELD" &&
        store.calls.updates === 0 &&
        store.calls.revisions === 0 &&
        store.calls.audits.length === 0 &&
        store.calls.sitemap === 0 &&
        store.calls.seoGuards === 0 &&
        store.rows[0].status === "draft"
    );
  }

  {
    const store = makeStore([readyDraft()]);
    // Real AB-1 with ready evidence/media should PASS for this fixture
    const res = await publishAutonomousBlogDraft({
      actor,
      id: 40,
      evidenceState: "ready",
      mediaState: { featuredImageReady: true },
      deps: store.deps(),
    });
    ok(
      "AP_pass_publishes_status_only",
      res.outcome === "PUBLISHED" &&
        res.qa.verdict === "PASS" &&
        store.rows[0].status === "published" &&
        store.rows[0].title === readyDraft().title &&
        store.rows[0].content === readyDraft().content &&
        res.changed_fields.includes("status") &&
        !res.changed_fields.includes("title") &&
        !res.changed_fields.includes("content") &&
        store.calls.revisions === 1 &&
        store.calls.audits.some((a) => a.action === "blog.updated") &&
        store.calls.sitemap === 1 &&
        store.calls.seoGuards === 1 &&
        store.calls.qaCalls === 1
    );
    ok(
      "AQ_warnings_do_not_block_when_pass",
      res.qa.verdict === "PASS"
    );
  }

  {
    const store = makeStore([
      readyDraft({ id: 41, status: "published", slug: "already-pub" }),
    ]);
    let err = null;
    try {
      await publishAutonomousBlogDraft({
        actor,
        id: 41,
        evidenceState: "ready",
        mediaState: { featuredImageReady: true },
        deps: store.deps(),
      });
    } catch (e) {
      err = e;
    }
    ok(
      "AR_publish_requires_draft",
      err && err.code === "not_draft" && store.calls.qaCalls === 0
    );
  }

  {
    const store = makeStore([readyDraft({ id: 42 })]);
    const res = await publishAutonomousBlogDraft({
      actor,
      id: 42,
      evidenceState: "ready",
      mediaState: { featuredImageReady: true },
      deps: store.deps({
        evaluateAutonomousBlogPrePublish: (input) => {
          store.calls.qaCalls += 1;
          const real = evaluateAutonomousBlogPrePublish(input);
          return {
            ...real,
            verdict: "PASS",
            blockers: [],
            warnings: [
              {
                code: "soft-warning",
                severity: "warning",
                message: "warn",
                field: null,
                evidence: "x",
              },
            ],
          };
        },
      }),
    });
    ok(
      "AS_warnings_allow_publish",
      res.outcome === "PUBLISHED" &&
        res.qa.warnings.length === 1 &&
        store.rows[0].status === "published"
    );
  }

  // Actor model
  ok(
    "AT_autonomous_requires_admin_identity_param",
    /actor:\s*AdminIdentity/.test(svcSrc) &&
      /createAutonomousBlogDraft/.test(svcSrc) &&
      !/principalType:\s*["']system["']/.test(svcSrc) &&
      !/fake.*session|pretend.*master/i.test(svcSrc)
  );
  ok(
    "AU_no_principal_type_expansion",
    !/PrincipalType.*=.*"system"/.test(svcSrc)
  );

  // Real AB-1 HOLD via evidence
  {
    const store = makeStore([readyDraft({ id: 50 })]);
    const res = await publishAutonomousBlogDraft({
      actor,
      id: 50,
      evidenceState: "stale",
      mediaState: { featuredImageReady: true },
      deps: store.deps(),
    });
    ok(
      "AV_real_ab1_hold_on_stale_evidence",
      res.outcome === "HELD" &&
        res.qa.verdict === "HOLD" &&
        store.calls.updates === 0
    );
  }

  console.log(`\nAB-2 results: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

runAsync().catch((err) => {
  console.error(err);
  process.exit(1);
});
