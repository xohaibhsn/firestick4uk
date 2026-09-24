/**
 * Phase20G.3D — Legal CMS migration foundation (source validation).
 * Verifies refund summary cards, SSR legal wiring, CmsBody sanitization,
 * and that prior consent / checkout / confirmation work remains intact.
 * Does NOT assert live CMS body content (mutated after deploy).
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

const refundClient = read("app/refund-policy/RefundPolicyClient.tsx");
const termsClient = read("app/terms/TermsClient.tsx");
const privacyClient = read("app/privacy-policy/PrivacyPolicyClient.tsx");
const refundPage = read("app/refund-policy/page.tsx");
const termsPage = read("app/terms/page.tsx");
const privacyPage = read("app/privacy-policy/page.tsx");
const cmsBody = read("components/CmsBody.tsx");
const tracking = read("components/TrackingConsent.tsx");
const consentLib = read("lib/trackingConsent.ts");
const cart = read("app/cart/page.tsx");
const orders = read("pages/api/orders.ts");
const helper = read("lib/productFulfilment.ts");
const siteContentApi = read("pages/api/site-content.ts");

const SUMMARY = [
  "Tell us within 14 days if you want to cancel; then return within 14 days",
  "7-day money-back guarantee on 1 Year+ plans; statutory rights are unaffected",
  "Statutory remedies apply if goods are faulty or not as described",
  "Change-of-mind return postage is normally the customer's responsibility",
];

for (const s of SUMMARY) {
  ok(`refund_summary_exact:${s.slice(0, 40)}…`, refundClient.includes(s));
}

ok(
  "old_physical_summary_removed",
  !refundClient.includes("14-day return window from delivery date")
);
ok(
  "old_subscription_summary_removed",
  !refundClient.includes("7-day money back on 1 Year plans and above only")
);
ok(
  "old_faulty_summary_removed",
  !refundClient.includes("Full refund or replacement at no cost")
);
ok(
  "old_postage_summary_removed",
  !refundClient.includes("Customer's responsibility unless item is faulty")
);

ok(
  "terms_page_uses_getPublicSiteContent",
  /getPublicSiteContent/.test(termsPage) && /TERMS_KEYS|terms_body/.test(termsPage)
);
ok(
  "privacy_page_uses_getPublicSiteContent",
  /getPublicSiteContent/.test(privacyPage) && /privacy_body/.test(privacyPage)
);
ok(
  "refund_page_uses_getPublicSiteContent",
  /getPublicSiteContent/.test(refundPage) && /refund_body/.test(refundPage)
);

ok("terms_body_key", /t\(["']terms_body["']/.test(termsClient));
ok("privacy_body_key", /t\(["']privacy_body["']/.test(privacyClient));
ok("refund_body_key", /t\(["']refund_body["']/.test(refundClient));

ok("terms_client_component", exists("app/terms/TermsClient.tsx"));
ok("privacy_client_component", exists("app/privacy-policy/PrivacyPolicyClient.tsx"));
ok("refund_client_component", exists("app/refund-policy/RefundPolicyClient.tsx"));

function contactOutsideBodySwitch(src) {
  const cmsIdx = src.indexOf("bodyHtml ?");
  const contactIdx = src.indexOf('id="contact"');
  if (cmsIdx < 0 || contactIdx < 0) return false;
  // Contact must appear after the ternary closes (outside both branches of bodyHtml switch)
  const afterTernary = src.indexOf(")}", cmsIdx);
  return contactIdx > afterTernary && contactIdx > cmsIdx;
}

ok("terms_contact_outside_body_switch", contactOutsideBodySwitch(termsClient));
ok("privacy_contact_outside_body_switch", contactOutsideBodySwitch(privacyClient));
ok("refund_contact_outside_body_switch", contactOutsideBodySwitch(refundClient));

const refundCtaJsx = refundClient.indexOf('className="contact-cta"');
const refundBodySwitch = refundClient.indexOf("bodyHtml ?");
const refundContactId = refundClient.indexOf('id="contact"');
ok(
  "refund_cta_outside_body_switch",
  refundCtaJsx > refundBodySwitch &&
    refundCtaJsx > refundContactId &&
    /className="contact-cta"/.test(refundClient) &&
    /refund_cta_title/.test(refundClient)
);

ok(
  "refund_summary_cards_outside_body",
  refundClient.indexOf("summary-cards") < refundClient.indexOf("bodyHtml ?")
);

ok(
  "toc_outside_body_terms",
  termsClient.indexOf("toc-list") < termsClient.indexOf("bodyHtml ?")
);
ok(
  "toc_outside_body_privacy",
  privacyClient.indexOf("toc-list") < privacyClient.indexOf("bodyHtml ?")
);
ok(
  "toc_outside_body_refund",
  refundClient.indexOf("toc-list") < refundClient.indexOf("bodyHtml ?")
);

ok("cmsbody_uses_xss", /import xss from ["']xss["']/.test(cmsBody) && /xss\(html/.test(cmsBody));
ok(
  "cmsbody_allows_div_id",
  /div:\s*\[[^\]]*["']id["']/.test(cmsBody) || /div:\s*\[[^\]]*id/.test(cmsBody)
);
ok(
  "cmsbody_allows_heading_ids",
  /h2:\s*\[[^\]]*["']id["']/.test(cmsBody) && /h3:\s*\[[^\]]*["']id["']/.test(cmsBody)
);

// New CMS phrases must NOT be hardcoded as source fallbacks for the body keys
const NEW_CMS_MARKERS = [
  "Nothing in these terms limits any statutory consumer rights that cannot lawfully be excluded",
  "authorised reseller arrangement with us",
  "Privacy choices for optional analytics and advertising technologies are managed separately",
  "tell us that they wish to cancel within 14 days after receiving the goods",
];
for (const marker of NEW_CMS_MARKERS) {
  ok(
    `no_hardcoded_cms_body:${marker.slice(0, 36)}…`,
    !termsClient.includes(marker) &&
      !privacyClient.includes(marker) &&
      !refundClient.includes(marker)
  );
}

// Tracking consent intact
ok("tracking_consent_component", exists("components/TrackingConsent.tsx"));
ok("tracking_consent_lib", exists("lib/trackingConsent.ts"));
ok(
  "tracking_storage_key",
  /firestick_tracking_consent_v1/.test(consentLib)
);
ok(
  "tracking_analytics_advertising_flags",
  /analytics:\s*boolean/.test(consentLib) && /advertising:\s*boolean/.test(consentLib)
);
ok("tracking_component_loads_gtag_conditionally", /loadGtag|shouldLoadGtag|analytics/.test(tracking));

// Checkout acknowledgement intact
ok(
  "digital_ack_helper",
  /DIGITAL_SUPPLY_ACK/.test(helper) &&
    helper.includes(
      "I request that my digital subscription starts as soon as possible after payment confirmation"
    )
);
ok(
  "cart_digital_ack_checkbox",
  /digital-ack/.test(cart) && /classification\.hasDigitalItems/.test(cart)
);
ok(
  "checkout_policy_links",
  /href=["']\/terms["']/.test(cart) &&
    /href=["']\/refund-policy["']/.test(cart) &&
    /href=["']\/privacy-policy["']/.test(cart)
);

// Universal customer confirmation intact
ok(
  "customer_confirmation_not_gated_by_hasDigital",
  !/if\s*\(\s*hasDigital\s*&&\s*customer_email\s*\)/.test(orders)
);
ok(
  "customer_confirmation_requires_email",
  /if\s*\(\s*customer_email\s*\)/.test(orders)
);
ok(
  "customer_confirmation_label",
  /Customer order confirmation/.test(orders)
);

// No ERP / runtime DDL in this phase's touch points
ok(
  "no_erp_in_legal_clients",
  !/erp|ERP|odoo|Odoo/.test(termsClient + privacyClient + refundClient)
);
ok(
  "site_content_no_create_alter_drop",
  !/\b(CREATE|ALTER|DROP)\s+(TABLE|DATABASE|INDEX)\b/i.test(siteContentApi)
);
ok(
  "legal_pages_no_runtime_ddl",
  !/\b(CREATE|ALTER|DROP)\s+TABLE\b/i.test(
    termsPage + privacyPage + refundPage + termsClient + privacyClient + refundClient
  )
);

ok(
  "site_content_api_uses_updates_array",
  /updates\s*&&\s*Array\.isArray\(updates\)/.test(siteContentApi) ||
    /updates && Array.isArray\(updates\)/.test(siteContentApi)
);
ok(
  "site_content_requires_content_manage",
  /content\.manage/.test(siteContentApi)
);
ok(
  "site_content_records_revision",
  /recordContentRevision/.test(siteContentApi)
);

console.log(`\nphase20g3d: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
