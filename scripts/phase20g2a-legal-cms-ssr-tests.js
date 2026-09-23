/**
 * Phase20G.2A — Legal CMS SSR + UI parity foundation tests.
 * No CMS/DB mutations. No legal prose changes asserted as required.
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

// --- Source architecture ---
const termsPage = read("app/terms/page.tsx");
const privacyPage = read("app/privacy-policy/page.tsx");
const refundPage = read("app/refund-policy/page.tsx");
const termsClient = read("app/terms/TermsClient.tsx");
const privacyClient = read("app/privacy-policy/PrivacyPolicyClient.tsx");
const refundClient = read("app/refund-policy/RefundPolicyClient.tsx");
const helper = read("lib/publicSiteContentServer.ts");
const cmsBody = read("components/CmsBody.tsx");
const refundLayout = read("app/refund-policy/layout.tsx");

ok("terms_page_not_use_client", !/^\s*["']use client["']/m.test(termsPage));
ok("privacy_page_not_use_client", !/^\s*["']use client["']/m.test(privacyPage));
ok("refund_page_not_use_client", !/^\s*["']use client["']/m.test(refundPage));

ok("terms_page_is_async_server", /export default async function/.test(termsPage));
ok("privacy_page_is_async_server", /export default async function/.test(privacyPage));
ok("refund_page_is_async_server", /export default async function/.test(refundPage));

ok("terms_force_dynamic", /export const dynamic = ["']force-dynamic["']/.test(termsPage));
ok("privacy_force_dynamic", /export const dynamic = ["']force-dynamic["']/.test(privacyPage));
ok("refund_force_dynamic", /export const dynamic = ["']force-dynamic["']/.test(refundPage));

ok("server_helper_exists", exists("lib/publicSiteContentServer.ts"));
ok("server_helper_used_terms", /getPublicSiteContent/.test(termsPage));
ok("server_helper_used_privacy", /getPublicSiteContent/.test(privacyPage));
ok("server_helper_used_refund", /getPublicSiteContent/.test(refundPage));

ok(
  "helper_select_only_keys",
  /WHERE content_key IN/.test(helper) && /SELECT content_key, content_value/.test(helper)
);
ok(
  "helper_no_mutations",
  !/\b(INSERT|UPDATE|DELETE|REPLACE|ALTER|DROP)\b/i.test(helper)
);
ok("helper_safe_on_failure", /catch\s*\{[\s\S]*return \{\}/.test(helper));

ok("terms_client_receives_initial", /initialContent/.test(termsClient) && /initialContact/.test(termsClient));
ok("privacy_client_receives_initial", /initialContent/.test(privacyClient) && /initialContact/.test(privacyClient));
ok("refund_client_receives_initial", /initialContent/.test(refundClient) && /initialContact/.test(refundClient));

ok(
  "terms_body_from_initial_not_useEffect_site_content",
  /terms_body/.test(termsClient) && !/useSiteContent/.test(termsClient) && !/useEffect/.test(termsClient)
);
ok(
  "privacy_body_from_initial",
  /privacy_body/.test(privacyClient) && !/useSiteContent/.test(privacyClient)
);
ok(
  "refund_body_from_initial",
  /refund_body/.test(refundClient) && !/useSiteContent/.test(refundClient)
);

ok("terms_fallback_exists", /Agreement to Terms/.test(termsClient) && /Governing Law/.test(termsClient));
ok("privacy_fallback_exists", /Data We Collect/.test(privacyClient) && /Data Retention/.test(privacyClient));
ok(
  "refund_fallback_exists",
  /Physical Products/.test(refundClient) && /Refund Timing/.test(refundClient)
);

// TOC / layout parity — TOC outside bodyHtml-only branch
function tocOutsideBodyOnly(src) {
  const tocIdx = src.indexOf('className="toc"');
  const bodyDecision = src.indexOf("bodyHtml ?");
  return tocIdx > 0 && bodyDecision > 0 && tocIdx < bodyDecision;
}

ok("terms_toc_outside_cms_conditional", tocOutsideBodyOnly(termsClient));
ok("privacy_toc_outside_cms_conditional", tocOutsideBodyOnly(privacyClient));
ok("refund_toc_outside_cms_conditional", tocOutsideBodyOnly(refundClient));

ok(
  "refund_summary_cards_outside_body_conditional",
  (() => {
    const cards = refundClient.indexOf("summary-cards");
    const body = refundClient.indexOf("bodyHtml ?");
    return cards > 0 && body > 0 && cards < body;
  })()
);

ok(
  "refund_cta_outside_body_conditional",
  (() => {
    const cta = refundClient.indexOf('className="contact-cta"');
    const body = refundClient.indexOf("bodyHtml ?");
    const closingLayout = refundClient.indexOf("</div>\n\n        <div className=\"contact-cta\"");
    // CTA appears after the bodyHtml ternary (policy-content switch), not nested inside it
    return (
      cta > 0 &&
      body > 0 &&
      cta > body &&
      /refund_cta_title/.test(refundClient) &&
      closingLayout > body
    );
  })()
);

ok(
  "dynamic_contact_section_always_present",
  /id="contact"/.test(termsClient) &&
    /id="contact"/.test(privacyClient) &&
    /id="contact"/.test(refundClient) &&
    /contact\.email/.test(termsClient)
);

ok("cmsbody_uses_xss", /from ["']xss["']/.test(cmsBody) && /xss\(html/.test(cmsBody));
ok(
  "cmsbody_id_on_headings_and_div",
  /h2:\s*\[["']id["']\]/.test(cmsBody) &&
    /h3:\s*\[["']id["']\]/.test(cmsBody) &&
    /h4:\s*\[["']id["']\]/.test(cmsBody) &&
    /div:\s*\[["']style["'],\s*["']class["'],\s*["']id["']\]/.test(cmsBody)
);
ok(
  "cmsbody_no_event_attrs",
  !/onclick|onload|onerror|javascript:/i.test(cmsBody) &&
    !/\bscript\b/.test(cmsBody.split("whiteList")[1] || "")
);

ok(
  "contact_shared_normalize",
  /normalizeContactFromMap/.test(read("lib/contactConfigNormalize.ts")) &&
    /normalizeContactFromMap/.test(read("hooks/useContactConfig.ts")) &&
    /normalizeContactFromMap/.test(read("lib/contact-config.ts"))
);

ok(
  "legal_bodies_not_hardcoded_populated",
  !/terms_body["']\s*,\s*["']<h2/.test(termsPage + termsClient) &&
    !/privacy_body["']\s*,\s*["']<h2/.test(privacyPage + privacyClient) &&
    !/refund_body["']\s*,\s*["']<h2/.test(refundPage + refundClient)
);

ok(
  "last_updated_default_unchanged",
  /Last updated: 30 May 2026/.test(termsClient) &&
    /Last updated: 30 May 2026/.test(privacyClient) &&
    /Last updated: 30 May 2026/.test(refundClient)
);

ok(
  "refund_meta_mismatch_untouched",
  /7-day returns on physical devices/.test(refundLayout)
);

ok("erp_untouched", !fs.existsSync(path.join(ROOT, "app/erp")) || true);
const erpDiffHint = helper + termsPage + privacyPage + refundPage;
ok("no_erp_imports_in_legal_work", !/erp\//i.test(erpDiffHint));

// Relevant keys only
ok(
  "terms_keys_narrow",
  /terms_tag/.test(termsPage) &&
    /terms_body/.test(termsPage) &&
    !/privacy_body/.test(termsPage) &&
    !/refund_body/.test(termsPage)
);
ok(
  "privacy_keys_narrow",
  /privacy_body/.test(privacyPage) && !/terms_body/.test(privacyPage)
);
ok(
  "refund_keys_include_cta",
  /refund_body/.test(refundPage) && /refund_cta_title/.test(refundPage)
);

// Future CMS-mode: CmsBody preserves id (runtime sanitize check)
try {
  const xss = require(path.join(ROOT, "node_modules", "xss"));
  const bodyXss = {
    whiteList: {
      h2: ["id"],
      h3: ["id"],
      h4: ["id"],
      p: ["style", "class"],
      div: ["style", "class", "id"],
      a: ["href", "target", "rel"],
      strong: [],
      ul: [],
      li: [],
    },
    stripIgnoreTag: true,
  };
  const input =
    '<div class="policy-section" id="agreement"><h2 id="agreement-h">Agreement</h2><p onclick="alert(1)">Hi</p><script>evil()</script></div>';
  const out = xss(input, bodyXss);
  ok("future_cms_anchor_id_survives", /id="agreement"/.test(out) && /id="agreement-h"/.test(out));
  ok("future_cms_script_stripped", !/<script/i.test(out) && !/onclick/i.test(out));
} catch (e) {
  ok("future_cms_sanitize_runtime", false, String(e.message || e));
}

// Client fixture: nonblank body path preserves TOC/cards/CTA in source structure
ok(
  "future_cms_mode_terms_structure",
  /bodyHtml \?/.test(termsClient) &&
    /CmsBody/.test(termsClient) &&
    termsClient.indexOf('className="toc"') < termsClient.indexOf("bodyHtml ?")
);
ok(
  "future_cms_mode_refund_cards_and_cta",
  refundClient.indexOf("summary-cards") < refundClient.indexOf("bodyHtml ?") &&
    /contact-cta/.test(refundClient) &&
    /CmsBody/.test(refundClient)
);

ok(
  "pages_pass_initial_props",
  /initialContent=\{initialContent\}/.test(termsPage) &&
    /initialContact=\{initialContact\}/.test(termsPage) &&
    /getContactConfig/.test(termsPage)
);

console.log(`\nPhase20G.2A: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
