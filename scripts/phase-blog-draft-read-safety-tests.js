/**
 * Blog draft read safety — unauthenticated GET list/id must not expose drafts.
 * Public GET ?slug= remains published+active only.
 * Source/contract tests only — no DB mutation, no live provider calls.
 */
const fs = require("fs");
const path = require("path");

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

const blogApi = read("pages/api/blog.ts");
const blogPersistence = read("lib/blogPersistenceServer.ts");
const publicBlog = read("lib/publicBlogServer.ts");
const blogPage = read("app/blog/page.tsx");
const articlePage = read("app/blog/[slug]/page.tsx");
const permissions = read("lib/adminPermissions.ts");
const sidhu = read("app/sidhu/page.tsx");

// ── SOURCE / ROUTING ───────────────────────────────────────────────────────

const getBlockMatch = blogApi.match(
  /if\s*\(\s*req\.method\s*===\s*['"]GET['"]\s*\)\s*\{([\s\S]*?)(?=\n\s*if\s*\(\s*req\.method\s*===\s*['"]POST['"])/
);
const getBlock = getBlockMatch ? getBlockMatch[1] : "";

ok("A_get_block_extracted", getBlock.length > 80);

const slugIdx = getBlock.search(/if\s*\(\s*slug\s*\)/);
const authIdx = getBlock.search(
  /requireAdminPermission\s*\(\s*req\s*,\s*res\s*,\s*['"]blog\.manage['"]/
);
const idIdx = getBlock.search(/if\s*\(\s*id\s*\)/);
const listIdx = getBlock.search(
  /SELECT\s+\*\s+FROM\s+blog_posts\s+WHERE\s+active\s*=\s*1\s+ORDER\s+BY\s+created_at\s+DESC/i
);

ok("B_slug_branch_present", slugIdx >= 0);
ok(
  "C_slug_select_published_active",
  /status\s*=\s*["']published["']\s+AND\s+active\s*=\s*1/.test(getBlock) ||
    /status\s*=\s*"published"\s+AND\s+active\s*=\s*1/.test(getBlock)
);
ok(
  "D_slug_before_admin_auth",
  slugIdx >= 0 && authIdx >= 0 && slugIdx < authIdx
);
ok(
  "E_non_slug_requires_blog_manage",
  /requireAdminPermission\s*\(\s*req\s*,\s*res\s*,\s*['"]blog\.manage['"]/.test(
    getBlock
  )
);
ok(
  "F_read_auth_mutate_false",
  /requireAdminPermission\s*\(\s*req\s*,\s*res\s*,\s*['"]blog\.manage['"]\s*,\s*\{\s*mutate:\s*false\s*\}/.test(
    getBlock
  )
);
ok("G_id_after_auth", authIdx >= 0 && idIdx >= 0 && authIdx < idIdx);
ok("H_list_after_auth", authIdx >= 0 && listIdx >= 0 && authIdx < listIdx);

// No alternate unauthenticated id/list path before auth in GET block
const beforeAuth = authIdx >= 0 ? getBlock.slice(0, authIdx) : getBlock;
ok(
  "I_no_unauth_id_query_before_auth",
  !/SELECT\s+\*\s+FROM\s+blog_posts\s+WHERE\s+id\s*=/.test(beforeAuth)
);
ok(
  "J_no_unauth_list_query_before_auth",
  !/WHERE\s+active\s*=\s*1\s+ORDER\s+BY\s+created_at/.test(beforeAuth)
);

// Public slug must not call requireAdminPermission inside slug branch
const slugBranch = (() => {
  if (slugIdx < 0) return "";
  const after = getBlock.slice(slugIdx);
  const end = after.search(/\n\s*\/\/\s*CMS|\n\s*admin\s*=\s*await\s*requireAdminPermission/);
  return end >= 0 ? after.slice(0, end) : after.slice(0, 400);
})();
ok(
  "K_slug_branch_no_admin_auth",
  slugBranch.length > 0 && !/requireAdminPermission/.test(slugBranch)
);

// ── PUBLIC FRONTEND ────────────────────────────────────────────────────────

ok(
  "L_publicBlogServer_published_active",
  /active\s*=\s*1\s+AND\s+status\s*=\s*['"]published['"]/.test(publicBlog)
);
ok(
  "M_blog_page_uses_publicBlogServer",
  /getPublicPublishedPosts/.test(blogPage) &&
    /from\s+["']@\/lib\/publicBlogServer["']/.test(blogPage)
);
ok(
  "N_article_route_published_active",
  /status\s*=\s*["']published["']\s+AND\s+active\s*=\s*1/.test(articlePage) ||
    /active\s*=\s*1\s+AND\s+status\s*=\s*["']published["']/.test(articlePage)
);
ok(
  "O_sidhu_uses_api_blog_list",
  /fetch\s*\(\s*["']\/api\/blog["']/.test(sidhu)
);

// ── RBAC ───────────────────────────────────────────────────────────────────

ok(
  "P_blog_manage_permission_exists",
  /["']blog\.manage["']/.test(permissions)
);
ok(
  "Q_writer_retains_blog_manage",
  /WRITER_PERMISSIONS[\s\S]*?["']blog\.manage["']/.test(permissions)
);
ok(
  "R_no_new_blog_permission_constants",
  !/blog\.read|blog\.view|blog\.list/.test(permissions) &&
    !/blog\.read|blog\.view|blog\.list/.test(blogApi)
);

// ── NO MUTATION ON GET ─────────────────────────────────────────────────────

ok("S_get_no_INSERT", !/\bINSERT\b/i.test(getBlock));
ok("T_get_no_UPDATE", !/\bUPDATE\b/i.test(getBlock));
ok("U_get_no_DELETE", !/\bDELETE\b/i.test(getBlock));
ok(
  "V_get_no_revision",
  !/recordContentRevision/.test(getBlock)
);
ok("W_get_no_audit", !/recordAdminAudit/.test(getBlock));
ok(
  "X_get_no_sitemap_invalidate",
  !/invalidateSitemapCache/.test(getBlock)
);
ok(
  "Y_get_no_seo_reconcile",
  !/runPostSaveSeoGuard|reconcileSeoIssueMemory/.test(getBlock)
);
ok(
  "Z_get_no_provider_call",
  !/openai|gemini|seoAi|admin-seo-ai/i.test(getBlock)
);

// ── CONTRACT PRESERVED ─────────────────────────────────────────────────────

ok(
  "AA_post_still_requires_blog_manage",
  /if\s*\(\s*req\.method\s*!==\s*['"]GET['"]\s*\)\s*\{[\s\S]*?requireAdminPermission\s*\(\s*req\s*,\s*res\s*,\s*['"]blog\.manage['"]/.test(
    blogApi
  )
);
ok(
  "AB_published_slug_protection_untouched",
  /BLOG_PUBLISHED_SLUG_PROTECTED_MESSAGE/.test(blogPersistence) &&
    /currentWasPublishedPublic/.test(blogPersistence) &&
    /createBlogPost|updateBlogPost/.test(blogApi)
);
ok(
  "AC_canonical_helpers_untouched",
  /normalizeBlogCanonicalInput/.test(blogPersistence) &&
    /resolveBlogCanonicalForPut/.test(blogPersistence)
);
ok(
  "AD_post_save_guard_untouched",
  /runPostSaveSeoGuard/.test(blogPersistence) &&
    /shouldRunPostSaveSeoGuard/.test(blogPersistence)
);
ok(
  "AE_post_status_explicit_required",
  !/status\s*\|\|\s*['"]published['"]/.test(blogApi) &&
    !/status\s*\|\|\s*['"]published['"]/.test(blogPersistence) &&
    /requireExplicitBlogStatus/.test(blogApi)
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
