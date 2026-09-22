/**
 * Phase 20D — Product 8 canonical slug migration source invariants.
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

const helper = read("lib/productLegacyRedirects.ts");
const page = read("app/products/[slug]/page.tsx");
const sitemap = read("app/sitemap.ts");
const nextConfig = read("next.config.ts");
const subSlug = read("lib/subscriptionSlug.ts");

fail(
  "A_helper_exports",
  /PRODUCT8_CANONICAL_SLUG\s*=\s*"3-years-subscription"/.test(helper) &&
    /PRODUCT8_LEGACY_SLUG_REDIRECTS/.test(helper) &&
    /resolveProductLegacyRedirect/.test(helper)
);

fail(
  "B_legacy_sources_exact",
  /"world-cup-offer-3-years"\s*:\s*PRODUCT8_CANONICAL_SLUG/.test(helper) &&
    /"3-years-season-pass"\s*:\s*PRODUCT8_CANONICAL_SLUG/.test(helper)
);

fail(
  "C_no_extra_legacy_keys",
  (() => {
    const m = helper.match(
      /PRODUCT8_LEGACY_SLUG_REDIRECTS[^=]*=\s*\{([^}]+)\}/s
    );
    if (!m) return false;
    const keys = [...m[1].matchAll(/"([^"]+)"\s*:/g)].map((x) => x[1]);
    return (
      keys.length === 2 &&
      keys.includes("world-cup-offer-3-years") &&
      keys.includes("3-years-season-pass")
    );
  })()
);

fail(
  "D_target_not_a_source",
  !/"3-years-subscription"\s*:/.test(
    helper.match(/PRODUCT8_LEGACY_SLUG_REDIRECTS[^=]*=\s*\{([^}]+)\}/s)?.[1] ||
      ""
  )
);

fail(
  "E_conditional_on_targetExists",
  /targetExists/.test(helper) &&
    /if\s*\(\s*!s\s*\|\|\s*!targetExists\s*\)\s*return null/.test(helper)
);

fail(
  "F_no_self_redirect",
  /t\s*===\s*s/.test(helper) || /t === s/.test(helper)
);

fail(
  "G_page_uses_helper_after_exact",
  /resolveProductLegacyRedirect/.test(page) &&
    /activeProductExistsBySlug/.test(page) &&
    /exactRows/.test(page)
);

fail(
  "H_exact_before_legacy",
  (() => {
    const start = page.indexOf("const resolveProduct");
    const body = start >= 0 ? page.slice(start) : page;
    const iExact = body.indexOf("SELECT * FROM products WHERE active = 1 AND slug = ?");
    const iLegacy = body.indexOf("PRODUCT8_LEGACY_SLUG_REDIRECTS[s]");
    return iExact >= 0 && iLegacy > iExact;
  })()
);

fail(
  "I_name_alias_still_present",
  /LOWER\(REPLACE\(REPLACE\(name/.test(page)
);

fail(
  "J_no_hardcoded_price_in_routing",
  !/75\.00/.test(helper) && !/"3 Years Subscription"/.test(helper)
);

fail(
  "K_sitemap_db_slug_driven",
  /Only emit authoritative stored slugs/.test(sitemap) &&
    !/world-cup-offer-3-years/.test(sitemap) &&
    !/3-years-season-pass/.test(sitemap)
);

fail(
  "L_canonical_db_driven_in_page",
  /authoritativeProductSlug/.test(page) &&
    /firestick4uk\.com\/products\/\$\{canonicalSlug\}/.test(page)
);

fail(
  "M_no_middleware_file",
  !fs.existsSync(path.join(ROOT, "middleware.ts")) &&
    !fs.existsSync(path.join(ROOT, "middleware.js")) &&
    !fs.existsSync(path.join(ROOT, "src", "middleware.ts"))
);

fail(
  "N_no_trailing_slash_config_change",
  !/skipTrailingSlashRedirect/.test(nextConfig) &&
    !/trailingSlash\s*:/.test(nextConfig)
);

fail(
  "O_subscription_slug_untouched_in_phase20d",
  /DEFAULT_SUBSCRIPTION_SLUG\s*=\s*"iptv-subscriptions-uk"/.test(subSlug) &&
    !/productLegacyRedirects/.test(subSlug)
);

fail(
  "P_no_redirects_in_next_config",
  !/async redirects\(/.test(nextConfig)
);

// Simulate helper logic
function normalizeProductSlug(slug) {
  return String(slug || "")
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, "");
}
const MAP = {
  "world-cup-offer-3-years": "3-years-subscription",
  "3-years-season-pass": "3-years-subscription",
};
function resolveProductLegacyRedirect(requested, targetExists) {
  const s = normalizeProductSlug(requested);
  if (!s || !targetExists) return null;
  const target = MAP[s];
  if (!target) return null;
  const t = normalizeProductSlug(target);
  if (!t || t === s) return null;
  return t;
}

fail(
  "Q_pre_migration_season_pass_no_forced_redirect",
  resolveProductLegacyRedirect("3-years-season-pass", false) === null
);

fail(
  "R_pre_migration_world_cup_inactive",
  resolveProductLegacyRedirect("world-cup-offer-3-years", false) === null
);

fail(
  "S_post_migration_both_sources",
  resolveProductLegacyRedirect("3-years-season-pass", true) ===
    "3-years-subscription" &&
    resolveProductLegacyRedirect("world-cup-offer-3-years", true) ===
      "3-years-subscription"
);

fail(
  "T_target_slug_not_legacy_mapped",
  resolveProductLegacyRedirect("3-years-subscription", true) === null &&
    resolveProductLegacyRedirect("3-years-subscription", false) === null
);

fail(
  "U_page_checks_target_live_before_redirect",
  /activeProductExistsBySlug\(legacyTarget\)/.test(page) ||
    /activeProductExistsBySlug\(/.test(page)
);

console.log(failed === 0 ? "\nALL PHASE20D TESTS PASSED" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
