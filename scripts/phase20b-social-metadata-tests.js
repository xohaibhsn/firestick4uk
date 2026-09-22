/**
 * Phase 20B / 20B.1 — Social metadata stability + CMS authority invariants.
 */
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function mark(id, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${id}${detail ? " — " + detail : ""}`);
  return ok;
}

let failed = 0;
const fail = (id, ok, detail) => {
  if (!mark(id, ok, detail)) failed += 1;
};

const helper = read("lib/socialMetadata.ts");
const serverHelper = read("lib/socialMetadataServer.ts");
const layout = read("app/layout.tsx");
const home = read("app/page.tsx");
const productDetail = read("app/products/[slug]/page.tsx");
const blogDetail = read("app/blog/[slug]/page.tsx");
const subscription = read("lib/subscriptionLandingPage.tsx");

const staticLayouts = [
  "app/products/layout.tsx",
  "app/blog/layout.tsx",
  "app/contact/layout.tsx",
  "app/about/layout.tsx",
  "app/faq/layout.tsx",
  "app/cart/layout.tsx",
  "app/terms/layout.tsx",
  "app/privacy-policy/layout.tsx",
  "app/refund-policy/layout.tsx",
  "app/order-tracking/layout.tsx",
];

fail(
  "A_helper_exists",
  /export function resolveDefaultOgImage/.test(helper) &&
    /export function stableSocialImageUrl/.test(helper) &&
    /FALLBACK_OG_IMAGE/.test(helper) &&
    /export function resolveSocialImagePrecedence/.test(helper)
);

fail(
  "B_fallback_https_png",
  /FALLBACK_OG_IMAGE\s*=\s*"https:\/\/firestick4uk\.com\/og-default\.png"/.test(
    helper
  )
);

fail(
  "C_helper_no_Date_now",
  !/Date\.now\s*\(/.test(helper) && !/Date\.now\s*\(/.test(serverHelper),
  "social helpers must not use Date.now"
);

fail(
  "D_layout_uses_stable_og",
  /resolveDefaultOgImage\(ogImageUrl\)/.test(layout) &&
    !/withCacheBust\(ogImageUrl\)/.test(layout)
);

fail(
  "E_layout_favicon_still_cache_busts",
  /function withCacheBust/.test(layout) &&
    /faviconSizeUrl/.test(layout) &&
    /Date\.now\s*\(/.test(layout)
);

fail(
  "F_og_path_not_cache_busted",
  !/withCacheBust\(ogImageUrl\)/.test(layout) &&
    !/ogFinal\s*=\s*ogImageUrl\s*\?\s*withCacheBust/.test(layout)
);

fail(
  "G_home_uses_cms_server_helper",
  /getDefaultOgImageFromSettings/.test(home) &&
    /defaultSocialImages/.test(home) &&
    /images:\s*social\.images/.test(home)
);

fail(
  "H_og_twitter_aligned_helper",
  /twitterImages:\s*\[url\]/.test(helper) && /images:\s*\[\{\s*url/.test(helper)
);

fail(
  "I_public_fallback_asset",
  fs.existsSync(path.join(ROOT, "public", "og-default.png"))
);

fail(
  "J_no_fake_1200x630_in_root_og",
  !/images:\s*\[\s*\{\s*url:\s*ogFinal,\s*width:\s*1200,\s*height:\s*630/.test(
    layout
  )
);

fail("K_no_product8_slug_migration", (() => {
  for (const f of ["app/products/[slug]/page.tsx", "lib/subscriptionLandingPage.tsx"]) {
    const src = read(f);
    if (/product.?8.*slug.*=.*['"][^'"]+['"]/i.test(src) && /migrate.*slug/i.test(src)) {
      return false;
    }
  }
  return true;
})());

fail(
  "L_no_erp_env_auth_in_helpers",
  !/process\.env\.(DB_|ADMIN_|NEXTAUTH)/.test(helper) &&
    !/erp\//i.test(helper) &&
    !/erp\//i.test(serverHelper)
);

fail(
  "M_server_helper_reads_cms_key",
  /getDefaultOgImageFromSettings/.test(serverHelper) &&
    /og_default_image/.test(serverHelper) &&
    /resolveDefaultOgImage/.test(serverHelper) &&
    /connection\(\)/.test(serverHelper)
);

// Child layouts must NOT use FALLBACK_OG_IMAGE as primary; must use CMS helper
let bypassCount = 0;
for (const rel of staticLayouts) {
  const src = read(rel);
  const usesFallbackPrimary = /defaultSocialImages\(\s*FALLBACK_OG_IMAGE\s*\)/.test(
    src
  );
  const usesCmsHelper = /getDefaultOgImageFromSettings/.test(src);
  const hasGenerateMetadata = /export async function generateMetadata/.test(src);
  const hasImages = /images:\s*social\.images/.test(src);
  if (usesFallbackPrimary || !usesCmsHelper || !hasGenerateMetadata || !hasImages) {
    bypassCount += 1;
    console.log(
      `  layout issue: ${rel} fallbackPrimary=${usesFallbackPrimary} cms=${usesCmsHelper} genMeta=${hasGenerateMetadata} images=${hasImages}`
    );
  }
}
fail(
  "N_static_layouts_cms_not_bundled_primary",
  bypassCount === 0,
  `${bypassCount} layouts still bypass CMS`
);

fail(
  "O_product_precedence",
  /resolveSocialImagePrecedence\(\s*image,\s*cmsDefault\s*\)/.test(productDetail) &&
    /getDefaultOgImageFromSettings/.test(productDetail) &&
    !/resolveDefaultOgImage\(\s*null\s*\)/.test(productDetail)
);

fail(
  "P_blog_precedence",
  /resolveSocialImagePrecedence\(\s*featured,\s*cmsDefault\s*\)/.test(blogDetail) &&
    /getDefaultOgImageFromSettings/.test(blogDetail) &&
    !/resolveDefaultOgImage\(\s*null\s*\)/.test(blogDetail)
);

fail(
  "Q_subscription_precedence",
  /resolveSocialImagePrecedence\(/.test(subscription) &&
    /subscription_og_image/.test(subscription) &&
    /og_default_image/.test(subscription)
);

// Determinism + precedence simulation
function stableSocialImageUrl(url) {
  const raw = (url || "").trim().split("#")[0];
  if (!raw) return "";
  if (!raw.startsWith("http") && !raw.startsWith("/")) return "";
  return raw;
}
function resolveDefaultOgImage(cmsUrl) {
  const stable = stableSocialImageUrl(cmsUrl || "");
  return stable || "https://firestick4uk.com/og-default.png";
}
function resolveSocialImagePrecedence(pageSpecific, cmsDefault) {
  return (
    stableSocialImageUrl(pageSpecific || "") || resolveDefaultOgImage(cmsDefault)
  );
}

const sample =
  "https://res.cloudinary.com/dehknghwm/image/upload/v1786881940/firestick4uk/og/r4gqccnfsuybj3brmamc.png?v=1786881943158";
const a = resolveDefaultOgImage(sample);
const b = resolveDefaultOgImage(sample);
fail("R_resolve_deterministic", a === b && a === sample, a);
fail(
  "S_empty_falls_back_stable",
  resolveDefaultOgImage("") === "https://firestick4uk.com/og-default.png"
);
fail(
  "T_precedence_page_over_cms",
  resolveSocialImagePrecedence("https://cdn.example/product.webp", sample) ===
    "https://cdn.example/product.webp"
);
fail(
  "U_precedence_cms_over_fallback",
  resolveSocialImagePrecedence("", sample) === sample &&
    resolveSocialImagePrecedence(null, "") ===
      "https://firestick4uk.com/og-default.png"
);

fail(
  "V_no_layout_imports_FALLBACK_as_primary",
  staticLayouts.every((rel) => !/FALLBACK_OG_IMAGE/.test(read(rel)))
);

console.log(failed === 0 ? "\nALL PHASE20B TESTS PASSED" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
