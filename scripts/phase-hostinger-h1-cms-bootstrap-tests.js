/**
 * Hostinger H1 — shared public CMS bootstrap / no duplicate page=all fetches.
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

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

function walkFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === "erp") continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walkFiles(full, out);
    else if (/\.(tsx?|jsx?)$/.test(name)) out.push(full);
  }
  return out;
}

const provider = read("components/SiteContentProvider.tsx");
const layout = read("app/layout.tsx");
const useSite = read("hooks/useSiteContent.ts");
const useContact = read("hooks/useContactConfig.ts");
const navbar = read("components/Navbar.tsx");
const wa = read("components/WhatsAppButton.tsx");
const footer = read("components/Footer.tsx");
const home = read("app/HomeClient.tsx");
const about = read("app/about/page.tsx");
const homePage = read("app/page.tsx");
const productsPage = read("app/products/page.tsx");
const productSlug = read("app/products/[slug]/page.tsx");
const blogPage = read("app/blog/page.tsx");
const faqPage = read("app/faq/page.tsx");
const termsPage = read("app/terms/page.tsx");
const tracking = read("components/TrackingConsent.tsx");
const sidhu = read("app/sidhu/page.tsx");

ok("provider_exists", exists("components/SiteContentProvider.tsx"));
ok(
  "provider_owns_page_all_fetch",
  /fetch\(["']\/api\/site-content\?page=all["']\)/.test(provider) &&
    /SiteContentProvider/.test(provider)
);
ok(
  "root_layout_mounts_provider_once",
  /SiteContentProvider/.test(layout) &&
    (layout.match(/<SiteContentProvider>/g) || []).length === 1 &&
    /<WhatsAppButton\s*\/>/.test(layout) &&
    layout.indexOf("<SiteContentProvider>") < layout.indexOf("<WhatsAppButton")
);
ok(
  "provider_wraps_cart_and_whatsapp",
  /SiteContentProvider[\s\S]*CartProvider[\s\S]*WhatsAppButton[\s\S]*<\/SiteContentProvider>/.test(
    layout
  )
);

ok(
  "useSiteContent_no_page_all_fetch",
  !/site-content\?page=all/.test(useSite) &&
    /useSharedCmsHelpers|useSiteContentContext/.test(useSite)
);
ok(
  "useContactConfig_no_page_all_fetch",
  !/site-content\?page=all/.test(useContact) &&
    /useSiteContentContext/.test(useContact) &&
    /normalizeContactFromMap/.test(useContact) &&
    /CONTACT_CONFIG_FALLBACK/.test(useContact)
);
ok(
  "navbar_no_page_all_fetch",
  !/site-content\?page=all/.test(navbar) && /useSiteContent/.test(navbar)
);
ok(
  "whatsapp_no_page_all_fetch",
  !/site-content\?page=all/.test(wa) && /useSiteContent/.test(wa)
);
ok(
  "home_no_page_all_fetch",
  !/site-content\?page=all/.test(home) && /useSiteContent/.test(home)
);
ok(
  "about_no_page_all_fetch",
  !/site-content\?page=all/.test(about) && /useSiteContent/.test(about)
);
ok(
  "footer_uses_shared_hook",
  /useSiteContent/.test(footer) && !/site-content\?page=all/.test(footer)
);

// Public storefront: only SiteContentProvider may fetch page=all
const publicRoots = [
  path.join(ROOT, "app"),
  path.join(ROOT, "components"),
  path.join(ROOT, "hooks"),
];
const publicFetchFiles = [];
for (const root of publicRoots) {
  for (const file of walkFiles(root)) {
    const rel = path.relative(ROOT, file).replace(/\\/g, "/");
    if (rel.startsWith("app/sidhu/")) continue;
    if (rel.startsWith("app/erp/")) continue;
    if (rel.includes("/admin")) continue;
    const src = fs.readFileSync(file, "utf8");
    if (/\/api\/site-content\?page=all/.test(src)) {
      publicFetchFiles.push(rel);
    }
  }
}
ok(
  "public_only_one_page_all_implementation",
  publicFetchFiles.length === 1 &&
    publicFetchFiles[0] === "components/SiteContentProvider.tsx",
  publicFetchFiles.join(", ")
);

ok(
  "sidhu_admin_page_all_untouched",
  (sidhu.match(/site-content\?page=all/g) || []).length >= 2
);

ok(
  "home_ssr_products_remain",
  /getPublicActiveProducts/.test(homePage) &&
    /initialProducts/.test(home) &&
    /initialProducts\.length === 0/.test(home)
);
ok("products_ssr_remain", /getPublicActiveProducts/.test(productsPage));
ok(
  "product_detail_ssr_remain",
  /resolveProduct|SELECT \* FROM products/.test(productSlug)
);
ok("blog_ssr_remain", /getPublicPublishedPosts/.test(blogPage));
ok("faq_ssr_remain", /getPublicVisibleFaqs/.test(faqPage));
ok(
  "legal_ssr_remain",
  /getPublicSiteContent/.test(termsPage) && /force-dynamic/.test(termsPage)
);
ok("tracking_consent_remains", /TrackingConsent/.test(layout) && exists("components/TrackingConsent.tsx") && /Privacy|Analytics|Advertising/.test(tracking));
ok("erp_ui_absent_after_r2b", !exists("app/erp"));
ok(
  "no_next_config_change_in_scope",
  /Cache-Control.*no-store, no-cache, must-revalidate/.test(
    read("next.config.ts")
  )
);
ok(
  "site_content_page_all_uses_server_cache",
  /getCachedPublicSiteContentAll/.test(read("pages/api/site-content.ts")) &&
    !/s-maxage/.test(read("pages/api/site-content.ts"))
);
ok(
  "contact_initial_preference",
  /if\s*\(\s*!loaded\s*\)/.test(useContact) &&
    /initial \|\| CONTACT_CONFIG_FALLBACK/.test(useContact)
);
ok(
  "navbar_logoUrl_override",
  /logoUrl !== undefined/.test(navbar) && /site_logo_url/.test(navbar)
);

console.log(`\nphase-hostinger-h1-cms-bootstrap: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
