/**
 * Legal fallback retirement — static regression tests.
 * Full hardcoded legal prose must not remain as empty-body false branches.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

let passed = 0;
let failed = 0;
function ok(name, cond) {
  if (cond) {
    passed++;
    console.log(`PASS ${name}`);
  } else {
    failed++;
    console.error(`FAIL ${name}`);
  }
}

const terms = read("app/terms/TermsClient.tsx");
const privacy = read("app/privacy-policy/PrivacyPolicyClient.tsx");
const refund = read("app/refund-policy/RefundPolicyClient.tsx");
const neutral = read("components/LegalContentUnavailable.tsx");

const NEUTRAL_MSG =
  "Policy content is currently unavailable. Please contact us if you need assistance.";

ok("neutral_component_exists", fs.existsSync(path.join(root, "components/LegalContentUnavailable.tsx")));
ok("neutral_exact_message", neutral.includes(NEUTRAL_MSG));
ok("neutral_no_dangerouslySetInnerHTML", !/dangerouslySetInnerHTML/.test(neutral));
ok("neutral_no_hardcoded_email", !/info@firestick4uk\.com/.test(neutral));
ok("neutral_no_hardcoded_phone", !/\+44/.test(neutral));
ok("neutral_uses_policy_section_or_highlight", /policy-section|highlight-box/.test(neutral));

function emptyBranchUsesNeutral(src) {
  const i = src.indexOf("bodyHtml ?");
  if (i < 0) return false;
  const slice = src.slice(i, i + 450);
  return (
    /<CmsBody[\s\S]*?:\s*\(\s*<LegalContentUnavailable\s*\/>\s*\)/.test(slice) ||
    /:\s*\(\s*<LegalContentUnavailable\s*\/>\s*\)/.test(slice)
  );
}

ok("terms_imports_neutral", /import LegalContentUnavailable from ["']@\/components\/LegalContentUnavailable["']/.test(terms));
ok("privacy_imports_neutral", /import LegalContentUnavailable from ["']@\/components\/LegalContentUnavailable["']/.test(privacy));
ok("refund_imports_neutral", /import LegalContentUnavailable from ["']@\/components\/LegalContentUnavailable["']/.test(refund));

ok("terms_empty_branch_neutral", emptyBranchUsesNeutral(terms));
ok("privacy_empty_branch_neutral", emptyBranchUsesNeutral(privacy));
ok("refund_empty_branch_neutral", emptyBranchUsesNeutral(refund));

ok("terms_cmsbody_populated_path", /<CmsBody html=\{bodyHtml\}/.test(terms) || /<CmsBody\s+html=\{bodyHtml\}/.test(terms));
ok(
  "privacy_cmsbody_token_path",
  /html=\{renderLegalCmsContactTokens\(bodyHtml,\s*contact\)\}/.test(privacy)
);
ok(
  "refund_cmsbody_token_path",
  /html=\{renderLegalCmsContactTokens\(bodyHtml,\s*contact\)\}/.test(refund)
);
ok("terms_no_token_helper", !/renderLegalCmsContactTokens/.test(terms));

function contactOutsideBody(src) {
  const cmsIdx = src.indexOf("bodyHtml ?");
  const contactIdx = src.indexOf('id="contact"');
  if (cmsIdx < 0 || contactIdx < 0) return false;
  return contactIdx > cmsIdx;
}

ok("terms_contact_outside_body", contactOutsideBody(terms));
ok("privacy_contact_outside_body", contactOutsideBody(privacy));
ok("refund_contact_outside_body", contactOutsideBody(refund));

ok(
  "refund_cards_outside_body",
  refund.indexOf("summary-cards") > 0 &&
    refund.indexOf("summary-cards") < refund.indexOf("bodyHtml ?")
);
ok(
  "refund_cta_outside_body",
  refund.indexOf('className="contact-cta"') > refund.indexOf("bodyHtml ?")
);

// Distinctive old prose (not TOC labels)
const OLD_PROSE = [
  {
    name: "terms_no_agreement_prose",
    src: terms,
    marker: "By accessing or placing an order on firestick4uk.com, you agree to be bound",
  },
  {
    name: "terms_no_governing_prose",
    src: terms,
    marker:
      "These Terms & Conditions are governed by and construed in accordance with the laws of England and Wales",
  },
  {
    name: "privacy_no_card_details_prose",
    src: privacy,
    marker: "We do not collect or store credit/debit card details",
  },
  {
    name: "privacy_no_retention_prose",
    src: privacy,
    marker: "Order data is typically retained for 6 years",
  },
  {
    name: "refund_no_return_steps_prose",
    src: refund,
    marker: "To initiate a return, please follow these steps",
  },
  {
    name: "refund_no_overview_guarantee_prose",
    src: refund,
    marker:
      "No free trials are offered. We provide a 7-day money back guarantee on 1 Year subscription plans and above only",
  },
];

for (const row of OLD_PROSE) {
  ok(row.name, !row.src.includes(row.marker));
}

ok(
  "neutral_message_only_in_shared_component",
  !terms.includes(NEUTRAL_MSG) &&
    !privacy.includes(NEUTRAL_MSG) &&
    !refund.includes(NEUTRAL_MSG) &&
    neutral.includes(NEUTRAL_MSG)
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
