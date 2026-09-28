/**
 * JSEO-B3 — product/blog public URL slug safety + blog canonical validation.
 * Static / pure helper tests. No DB mutations.
 */
const fs = require("fs");
const path = require("path");
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

function loadTsModule(rel) {
  const src = read(rel);
  const { outputText } = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
    },
  });
  const sandbox = { exports: {} };
  const fn = new Function("exports", "module", "require", outputText);
  fn(sandbox.exports, sandbox, require);
  return sandbox.exports;
}

const sidhu = read("app/sidhu/page.tsx");
const productsApi = read("pages/api/admin-products.ts");
const blogApi = read("pages/api/blog.ts");
const legacy = read("lib/productLegacyRedirects.ts");
const helperSrc = read("lib/blogSeoSafety.ts");

const safety = loadTsModule("lib/blogSeoSafety.ts");
const {
  expectedBlogCanonical,
  normalizeBlogCanonicalInput,
  isAutoCanonicalForSlug,
  resolveBlogCanonicalForPut,
  PRODUCT_SLUG_PROTECTED_MESSAGE,
  BLOG_PUBLISHED_SLUG_PROTECTED_MESSAGE,
} = safety;

const SLUG = "slow-firestick-fix";
const EXPECTED = `https://firestick4uk.com/blog/${SLUG}`;

// --- HELPER CANONICAL MATRIX ---
ok("helper_exists_pure", /No DB, no HTTP, no side effects/.test(helperSrc));
ok("blank_canonical", normalizeBlogCanonicalInput("", SLUG).ok && normalizeBlogCanonicalInput("", SLUG).canonical === EXPECTED);
ok("exact_canonical", normalizeBlogCanonicalInput(EXPECTED, SLUG).ok && normalizeBlogCanonicalInput(EXPECTED, SLUG).canonical === EXPECTED);
ok(
  "trailing_slash",
  normalizeBlogCanonicalInput(EXPECTED + "/", SLUG).ok &&
    normalizeBlogCanonicalInput(EXPECTED + "/", SLUG).canonical === EXPECTED
);
ok("http_rejected", !normalizeBlogCanonicalInput(`http://firestick4uk.com/blog/${SLUG}`, SLUG).ok);
ok("www_rejected", !normalizeBlogCanonicalInput(`https://www.firestick4uk.com/blog/${SLUG}`, SLUG).ok);
ok("external_rejected", !normalizeBlogCanonicalInput(`https://example.com/blog/${SLUG}`, SLUG).ok);
ok("relative_rejected", !normalizeBlogCanonicalInput(`/blog/${SLUG}`, SLUG).ok);
ok("malformed_rejected", !normalizeBlogCanonicalInput("https://", SLUG).ok);
ok("wrong_slug_rejected", !normalizeBlogCanonicalInput(`https://firestick4uk.com/blog/other-slug`, SLUG).ok);
ok("query_rejected", !normalizeBlogCanonicalInput(`${EXPECTED}?x=1`, SLUG).ok);
ok("hash_rejected", !normalizeBlogCanonicalInput(`${EXPECTED}#sec`, SLUG).ok);
ok("credentials_rejected", !normalizeBlogCanonicalInput(`https://user:pass@firestick4uk.com/blog/${SLUG}`, SLUG).ok);
ok("port_rejected", !normalizeBlogCanonicalInput(`https://firestick4uk.com:8443/blog/${SLUG}`, SLUG).ok);
ok("is_auto_blank", isAutoCanonicalForSlug("", SLUG) === true);
ok("is_auto_exact", isAutoCanonicalForSlug(EXPECTED, SLUG) === true);
ok("is_auto_other_false", isAutoCanonicalForSlug("https://evil.com/x", SLUG) === false);

ok(
  "put_blank_explicit",
  resolveBlogCanonicalForPut({
    bodyHasCanonical: true,
    suppliedCanonical: "",
    currentCanonical: "https://firestick4uk.com/blog/old",
    oldSlug: "old",
    finalSlug: SLUG,
    slugChanged: false,
  }).canonical === EXPECTED
);

ok(
  "put_omit_no_slug_change_preserves",
  resolveBlogCanonicalForPut({
    bodyHasCanonical: false,
    suppliedCanonical: undefined,
    currentCanonical: "https://legacy.example/keep-me",
    oldSlug: SLUG,
    finalSlug: SLUG,
    slugChanged: false,
  }).canonical === "https://legacy.example/keep-me"
);

ok(
  "put_draft_slug_change_aligns_old_auto",
  resolveBlogCanonicalForPut({
    bodyHasCanonical: false,
    suppliedCanonical: undefined,
    currentCanonical: "https://firestick4uk.com/blog/old-slug",
    oldSlug: "old-slug",
    finalSlug: SLUG,
    slugChanged: true,
  }).canonical === EXPECTED
);

ok(
  "put_draft_slug_change_rejects_mismatch",
  !resolveBlogCanonicalForPut({
    bodyHasCanonical: false,
    suppliedCanonical: undefined,
    currentCanonical: "https://evil.com/blog/old-slug",
    oldSlug: "old-slug",
    finalSlug: SLUG,
    slugChanged: true,
  }).ok
);

ok("expected_helper", expectedBlogCanonical(SLUG) === EXPECTED);

// --- PRODUCT UI ---
ok(
  "new_product_slug_editable",
  /productModal !== "new"/.test(sidhu) &&
    /readOnly=\{productModal !== "new"\}/.test(sidhu) &&
    /shouldAuto = productModal === "new"/.test(sidhu)
);
ok(
  "existing_product_slug_protected_ui",
  /Public URL is protected\. Slug changes require a controlled SEO migration with a redirect\./.test(
    sidhu
  )
);
ok(
  "existing_name_no_auto_slug",
  /shouldAuto = productModal === "new"/.test(sidhu) &&
    !/productModal === "new" \|\| !p\.slug \|\| p\.slug === toSlug\(p\.name\)/.test(sidhu)
);

// --- PRODUCT API ---
ok(
  "api_put_slug_only_when_hasOwn_slug",
  /if \(hasOwn\(body, 'slug'\)\) \{/.test(productsApi) &&
    !/hasOwn\(body, 'slug'\) \|\| hasOwn\(body, 'name'\)/.test(productsApi)
);
ok(
  "api_put_different_slug_409",
  /status\(409\)/.test(productsApi) &&
    /Existing product URL slug is protected/.test(productsApi)
);
ok(
  "api_name_only_preserves_slug_comment_or_logic",
  /let slug = String\(current\.slug \|\| ''\);/.test(productsApi) &&
    /if \(hasOwn\(body, 'slug'\)\) \{/.test(productsApi)
);
ok(
  "active_preservation_intact",
  /let active = Number\(current\.active\) === 1 \? 1 : 0;/.test(productsApi) &&
    /hasOwn\(body, 'active'\)/.test(productsApi)
);
ok("strict_price_intact", /STRICT_PRICE_NUMERIC/.test(productsApi));
ok("og_image_still_optional", /'og_image'/.test(productsApi));
ok(
  "product8_map_unchanged",
  /"world-cup-offer-3-years": PRODUCT8_CANONICAL_SLUG/.test(legacy) &&
    /"3-years-season-pass": PRODUCT8_CANONICAL_SLUG/.test(legacy) &&
    /PRODUCT8_CANONICAL_SLUG = "3-years-subscription"/.test(legacy)
);

// --- BLOG UI ---
ok("blog_slug_locked_state", /blogSlugLocked/.test(sidhu));
ok(
  "published_open_locks_slug",
  /setBlogSlugLocked\(p\.status === "published"\)/.test(sidhu)
);
ok(
  "new_blog_unlocks_slug",
  /setBlogSlugLocked\(false\)/.test(sidhu)
);
ok(
  "published_slug_warning",
  /Published URL is protected\. A slug change requires a controlled redirect migration\./.test(
    sidhu
  )
);
ok(
  "canonical_helper_text",
  /Canonical must use the current Firestick4UK blog URL/.test(sidhu) &&
    /Leave empty to auto-generate from slug/.test(sidhu)
);
ok(
  "title_auto_respects_lock",
  /canAutoSlug = !blogSlugLocked/.test(sidhu)
);

// --- BLOG API ---
ok(
  "blog_api_uses_helper",
  /blogSeoSafety/.test(blogApi) &&
    /normalizeBlogCanonicalInput/.test(blogApi) &&
    /resolveBlogCanonicalForPut/.test(blogApi)
);
ok(
  "blog_published_slug_rename_rejected",
  /currentWasPublishedPublic/.test(blogApi) &&
    /BLOG_PUBLISHED_SLUG_PROTECTED_MESSAGE/.test(blogApi) &&
    /status\(409\)/.test(blogApi)
);
ok(
  "blog_post_requires_slug",
  /Title and slug are required/.test(blogApi)
);
ok(
  "blog_post_validates_canonical",
  /normalizeBlogCanonicalInput\(canonical_url, finalSlug\)/.test(blogApi)
);
ok(
  "blog_put_hasOwn_canonical",
  /bodyHasCanonical = hasOwn\(body, 'canonical_url'\)/.test(blogApi)
);
ok(
  "messages_exported",
  typeof PRODUCT_SLUG_PROTECTED_MESSAGE === "string" &&
    typeof BLOG_PUBLISHED_SLUG_PROTECTED_MESSAGE === "string"
);

ok("erp_untouched", fs.existsSync(path.join(ROOT, "app/erp")));
ok(
  "no_redirect_manager",
  !/CREATE TABLE.*redirect/i.test(sidhu) &&
    !/redirect_manager/.test(blogApi) &&
    !/redirect_manager/.test(productsApi)
);

console.log(`\nJSEO-B3 URL safety: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
