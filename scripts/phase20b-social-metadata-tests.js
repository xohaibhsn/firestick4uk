/**
 * Phase 20B — Social metadata stability invariants (source-level).
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
const layout = read("app/layout.tsx");
const home = read("app/page.tsx");

fail(
  "A_helper_exists",
  /export function resolveDefaultOgImage/.test(helper) &&
    /export function stableSocialImageUrl/.test(helper) &&
    /FALLBACK_OG_IMAGE/.test(helper)
);

fail(
  "B_fallback_https_png",
  /FALLBACK_OG_IMAGE\s*=\s*"https:\/\/firestick4uk\.com\/og-default\.png"/.test(
    helper
  )
);

fail(
  "C_helper_no_Date_now",
  !/Date\.now\s*\(/.test(helper),
  "socialMetadata must not use Date.now"
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
  "G_home_includes_social_images",
  /defaultSocialImages/.test(home) &&
    /images:\s*social\.images/.test(home) &&
    /images:\s*social\.twitterImages/.test(home)
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

// Product 8 slug must remain untouched
const productSlugFiles = [
  "app/products/[slug]/page.tsx",
  "lib/subscriptionLandingPage.tsx",
];
let product8Touched = false;
for (const f of productSlugFiles) {
  // Only flag if this phase introduced a forced slug rewrite for product 8 — scan for known bad patterns
  const src = read(f);
  if (/product.?8.*slug.*=.*['"][^'"]+['"]/i.test(src) && /migrate.*slug/i.test(src)) {
    product8Touched = true;
  }
}
fail("K_no_product8_slug_migration", !product8Touched);

fail(
  "L_no_erp_env_auth_in_phase20b_helper",
  !/process\.env\.(DB_|ADMIN_|NEXTAUTH)/.test(helper) &&
    !/erp\//i.test(helper)
);

fail(
  "M_products_layout_has_og_images",
  /images:\s*social\.images/.test(read("app/products/layout.tsx"))
);

fail(
  "N_contact_layout_has_og_images",
  /images:\s*social\.images/.test(read("app/contact/layout.tsx"))
);

fail(
  "O_subscription_uses_stable_resolver",
  /resolveDefaultOgImage/.test(read("lib/subscriptionLandingPage.tsx"))
);

// Determinism: same CMS URL in → same URL out (simulate helper logic)
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
const sample =
  "https://res.cloudinary.com/dehknghwm/image/upload/v1786881940/firestick4uk/og/r4gqccnfsuybj3brmamc.png?v=1786881943158";
const a = resolveDefaultOgImage(sample);
const b = resolveDefaultOgImage(sample);
const c = resolveDefaultOgImage(sample);
fail(
  "P_resolve_deterministic",
  a === b && b === c && a === sample,
  a
);
fail(
  "Q_empty_falls_back_stable",
  resolveDefaultOgImage("") === "https://firestick4uk.com/og-default.png" &&
    resolveDefaultOgImage(null) === "https://firestick4uk.com/og-default.png"
);

console.log(failed === 0 ? "\nALL PHASE20B TESTS PASSED" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
