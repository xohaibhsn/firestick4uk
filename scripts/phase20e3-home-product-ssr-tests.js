/**
 * Phase 20E.3 — Homepage server-rendered product discovery.
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

const page = read("app/page.tsx");
const home = read("app/HomeClient.tsx");
const helper = read("lib/publicProductsServer.ts");
const productsPage = read("app/products/page.tsx");
const blogPage = read("app/blog/page.tsx");
const rootLayout = read("app/layout.tsx");
const legacy = exists("lib/productLegacyRedirects.ts")
  ? read("lib/productLegacyRedirects.ts")
  : "";
const sitemap = read("app/sitemap.ts");

fail(
  "H1_page_reuses_getPublicActiveProducts",
  /getPublicActiveProducts/.test(page) &&
    /from\s+["']@\/lib\/publicProductsServer["']/.test(page)
);

fail(
  "H2_page_passes_initialProducts",
  /initialProducts=\{initialProducts\}/.test(page) ||
    /initialProducts={initialProducts}/.test(page)
);

fail(
  "H3_homeclient_accepts_initialProducts",
  /initialProducts\s*=\s*\[\]/.test(home) &&
    /PublicProduct/.test(home) &&
    /"use client"/.test(home)
);

fail(
  "H4_initial_state_from_ssr",
  /useState<Product\[\]>\(initialProducts\)/.test(home) &&
    /useState\(initialProducts\.length === 0\)/.test(home)
);

fail(
  "H5_no_loading_flash_when_ssr",
  /useState\(initialProducts\.length === 0\)/.test(home)
);

fail(
  "H6_fetch_only_when_empty",
  /if \(initialProducts\.length === 0\)/.test(home) &&
    /fetch\(['"]\/api\/products['"]\)/.test(home)
);

fail(
  "H7_real_product_hrefs",
  /productDetailHref/.test(home) &&
    /href=\{href\}/.test(home) &&
    !/onClick=\{\(\)\s*=>\s*window\.location\.href=`\/products\//.test(home)
);

fail(
  "H8_add_to_cart_separate",
  /className="add-btn"/.test(home) &&
    /handleAddToCart/.test(home) &&
    /product-image-link/.test(home)
);

fail(
  "H9_product8_not_hardcoded",
  !/3-years-subscription/.test(page) &&
    !/3 Years Subscription/.test(page) &&
    !/3-years-subscription/.test(home) &&
    !/\bid\s*===\s*8\b/.test(home) &&
    !/\bid\s*==\s*8\b/.test(page)
);

fail(
  "H10_no_new_product_helper",
  exists("lib/publicProductsServer.ts") &&
    !exists("lib/publicHomeProductsServer.ts") &&
    !exists("lib/homepageProductsServer.ts") &&
    !/FROM products/.test(page)
);

fail(
  "H11_shared_helper_intact",
  /WHERE\s+active\s*=\s*1/i.test(helper) &&
    /ORDER BY\s+id\s+ASC/i.test(helper) &&
    /getPublicActiveProducts/.test(helper)
);

fail(
  "H12_homepage_metadata_intact",
  /canonical:\s*"https:\/\/firestick4uk\.com"/.test(page) &&
    /url:\s*"https:\/\/firestick4uk\.com"/.test(page) &&
    /getDefaultOgImageFromSettings/.test(page) &&
    /BreadcrumbSchema/.test(page)
);

fail(
  "H13_sitemap_untouched_by_home",
  !/sitemap/.test(page) && !/sitemap/.test(home)
);

fail(
  "H14_redirects_untouched",
  /PRODUCT8_CANONICAL_SLUG/.test(legacy) &&
    !/productLegacyRedirects/.test(page) &&
    !/productLegacyRedirects/.test(home)
);

fail(
  "H15_no_faq_ssr_in_this_phase",
  !/faq/i.test(page.replace(/BreadcrumbSchema[\s\S]*?\/>/, "")) ||
    !/getPublicFaqs|initialFaqs/.test(page + home)
);

fail(
  "H16_products_listing_still_uses_helper",
  /getPublicActiveProducts/.test(productsPage)
);

fail(
  "H17_blog_ssr_still_present",
  /getPublicPublishedPosts/.test(blogPage)
);

fail(
  "H18_slice_eight_preserved",
  /products\.slice\(0,\s*8\)/.test(home)
);

console.log("");
if (failed > 0) {
  console.log(`FAILED: ${failed} check(s)`);
  process.exit(1);
}
console.log("ALL Phase20E.3 homepage product SSR checks PASSED");
