/**
 * Phase 20E.1 — Server-rendered product + blog discovery invariants.
 */
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

function mark(id, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${id}${detail ? " — " + detail : ""}`);
  return ok;
}

let failed = 0;
const fail = (id, ok, detail) => {
  if (!mark(id, ok, detail)) failed += 1;
};

const productsPage = read("app/products/page.tsx");
const productsClient = read("app/products/ProductsClient.tsx");
const productsHelper = read("lib/publicProductsServer.ts");
const productsApi = read("pages/api/products.ts");

const blogPage = read("app/blog/page.tsx");
const blogClient = read("app/blog/BlogClient.tsx");
const blogHelper = read("lib/publicBlogServer.ts");
const blogApi = read("pages/api/blog.ts");

// --- PRODUCTS ---
fail(
  "P1_products_page_not_use_client",
  !productsPage.includes('"use client"') &&
    !productsPage.includes("'use client'")
);

fail(
  "P2_products_page_fetches_initial",
  /getPublicActiveProducts/.test(productsPage) &&
    /initialProducts/.test(productsPage) &&
    /ProductsClient/.test(productsPage)
);

fail(
  "P3_products_client_accepts_initial",
  /"use client"/.test(productsClient) &&
    /initialProducts/.test(productsClient) &&
    /useState<Product\[\]>\(initialProducts\)/.test(productsClient)
);

fail(
  "P4_products_loading_avoids_flash",
  /useState\(initialProducts\.length === 0\)/.test(productsClient) &&
    /if \(initialProducts\.length > 0\) return/.test(productsClient)
);

fail(
  "P5_products_server_query_active_order",
  /WHERE\s+active\s*=\s*1/i.test(productsHelper) &&
    /ORDER BY\s+id\s+ASC/i.test(productsHelper) &&
    /getPublicActiveProducts/.test(productsHelper)
);

fail(
  "P6_products_cards_real_href",
  /href=\{href\}/.test(productsClient) &&
    /productDetailHref|`\/products\/\$\{p\.slug\}`|\/products\/\$\{/.test(
      productsClient
    ) &&
    !/onClick=\{\(\)\s*=>\s*window\.location\.href=/.test(productsClient)
);

fail(
  "P7_product8_not_hardcoded_in_listing",
  !/3-years-subscription/.test(productsPage) &&
    !/3-years-subscription/.test(productsClient) &&
    !/3 Years Subscription/.test(productsHelper) &&
    !/\bid\s*===\s*8\b/.test(productsHelper) &&
    !/\bid\s*==\s*8\b/.test(productsClient)
);

fail(
  "P8_api_products_intact",
  exists("pages/api/products.ts") &&
    /active\s*=\s*1/.test(productsApi) &&
    /featured:\s*['"]id ASC['"]/.test(productsApi) &&
    /ORDER BY \$\{/.test(productsApi)
);

fail(
  "P9_add_to_cart_outside_anchor",
  /className="add-btn"/.test(productsClient) &&
    /handleAddToCart/.test(productsClient)
);

// --- BLOG ---
fail(
  "B1_blog_page_not_use_client",
  !blogPage.includes('"use client"') && !blogPage.includes("'use client'")
);

fail(
  "B2_blog_page_fetches_published",
  /getPublicPublishedPosts/.test(blogPage) &&
    /initialPosts/.test(blogPage) &&
    /BlogClient/.test(blogPage)
);

fail(
  "B3_blog_public_query_published_only",
  /active\s*=\s*1/.test(blogHelper) &&
    /status\s*=\s*'published'/.test(blogHelper) &&
    /ORDER BY\s+created_at\s+DESC/i.test(blogHelper)
);

fail(
  "B4_blog_client_uses_initialPosts",
  /"use client"/.test(blogClient) &&
    /initialPosts/.test(blogClient) &&
    /initialPosts\.map\(mapPublicPost\)/.test(blogClient) &&
    !/fetch\(["']\/api\/blog["']\)/.test(blogClient)
);

fail(
  "B5_blog_real_hrefs",
  /href=\{`\/blog\/\$\{/.test(blogClient) &&
    !/onClick=\{\(\)\s*=>\s*window\.location\.href=/.test(blogClient)
);

fail(
  "B6_blog_no_hardcoded_article_slug_in_render",
  !/how-to-speed-up-a-slow-firestick-in-10-minutes/.test(blogClient) &&
    !/how-to-speed-up-a-slow-firestick-in-10-minutes/.test(blogPage) &&
    !/how-to-speed-up-a-slow-firestick-in-10-minutes/.test(blogHelper)
);

fail(
  "B7_api_blog_not_casually_rewritten",
  exists("pages/api/blog.ts") &&
    /FROM blog_posts/.test(blogApi) &&
    /status/.test(blogApi)
);

// --- GLOBAL ---
const pkg = JSON.parse(read("package.json"));
fail(
  "G1_no_framework_migration",
  pkg.dependencies?.next != null && pkg.dependencies?.react != null
);

fail(
  "G2_no_sitemap_change_in_scope",
  (() => {
    // This phase should not modify sitemap — helper files must not import sitemap
    return (
      !/sitemap/.test(productsHelper) &&
      !/sitemap/.test(blogHelper) &&
      !/sitemap/.test(productsPage) &&
      !/sitemap/.test(blogPage)
    );
  })()
);

fail(
  "G3_product_legacy_redirects_untouched_by_helpers",
  !/productLegacyRedirects/.test(productsHelper) &&
    !/productLegacyRedirects/.test(productsClient) &&
    !/productLegacyRedirects/.test(productsPage)
);

fail(
  "G4_helpers_empty_on_error",
  /catch\s*\{[\s\S]*return\s*\[\]/.test(productsHelper) &&
    /catch\s*\{[\s\S]*return\s*\[\]/.test(blogHelper)
);

fail(
  "G5_files_exist",
  exists("lib/publicProductsServer.ts") &&
    exists("lib/publicBlogServer.ts") &&
    exists("app/products/ProductsClient.tsx") &&
    exists("app/blog/BlogClient.tsx")
);

console.log("");
if (failed > 0) {
  console.log(`FAILED: ${failed} check(s)`);
  process.exit(1);
}
console.log("ALL Phase20E.1 server-discovery checks PASSED");
