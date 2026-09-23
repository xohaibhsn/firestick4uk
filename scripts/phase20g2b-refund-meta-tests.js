/**
 * Phase20G.2B — Refund policy meta description accuracy.
 * Metadata only; no legal body / CMS changes.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
let passed = 0;
let failed = 0;

const NEW_DESC =
  "Firestick4UK Refund & Return Policy. 14-day returns on eligible physical products and a 7-day money-back guarantee on 1 Year subscription plans and above.";
const OLD_PHRASE = "7-day returns on physical devices";

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

const layout = read("app/refund-policy/layout.tsx");
const client = read("app/refund-policy/RefundPolicyClient.tsx");
const termsPage = read("app/terms/page.tsx");
const privacyPage = read("app/privacy-policy/page.tsx");

ok("layout_has_exact_new_description", layout.includes(NEW_DESC));
ok("layout_old_phrase_absent", !layout.includes(OLD_PHRASE));
ok(
  "canonical_unchanged",
  layout.includes('canonical: "https://firestick4uk.com/refund-policy"') ||
    layout.includes("canonical: 'https://firestick4uk.com/refund-policy'")
);
ok(
  "og_url_unchanged",
  /url:\s*["']https:\/\/firestick4uk\.com\/refund-policy["']/.test(layout)
);
ok(
  "social_image_helper_intact",
  /defaultSocialImages/.test(layout) &&
    /getDefaultOgImageFromSettings/.test(layout)
);
ok(
  "client_14_day_physical",
  /14-day return window/.test(client) || /within <strong>14 days<\/strong>/.test(client)
);
ok(
  "client_7_day_money_back_1_year",
  /7-day money back/.test(client) && /1 Year plans and above only/.test(client)
);
ok(
  "last_updated_fallback_unchanged",
  /Last updated: 30 May 2026/.test(client)
);
ok(
  "terms_page_not_modified_for_this_phase",
  /getPublicSiteContent/.test(termsPage) && /TermsClient/.test(termsPage)
);
ok(
  "privacy_page_not_modified_for_this_phase",
  /getPublicSiteContent/.test(privacyPage) && /PrivacyPolicyClient/.test(privacyPage)
);
ok("no_erp_in_layout", !/erp\//i.test(layout));
ok("no_erp_in_test_scope_client", !/erp\//i.test(client));

console.log(`\nPhase20G.2B: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
