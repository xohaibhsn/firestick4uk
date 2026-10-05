/**
 * Legal CMS dynamic contact tokens — focused regression tests.
 * Runtime unit checks mirror lib/legalCmsTokens.ts + contentHtml escapeHtml.
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

const helperSrc = read("lib/legalCmsTokens.ts");
const contentHtmlSrc = read("lib/contentHtml.ts");
const privacyClient = read("app/privacy-policy/PrivacyPolicyClient.tsx");
const refundClient = read("app/refund-policy/RefundPolicyClient.tsx");
const termsClient = read("app/terms/TermsClient.tsx");
const cmsBody = read("components/CmsBody.tsx");

// Mirror production helper (must stay aligned with lib/legalCmsTokens.ts).
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function escapeContactValue(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}
function renderLegalCmsContactTokens(html, contact) {
  if (!html) return html;
  const replacements = {
    "{{contact_email}}": escapeContactValue(contact.email),
    "{{contact_phone}}": escapeContactValue(contact.phone),
    "{{contact_telegram}}": escapeContactValue(contact.telegram),
  };
  let out = String(html);
  for (const token of Object.keys(replacements)) {
    if (!out.includes(token)) continue;
    out = out.split(token).join(replacements[token]);
  }
  return out;
}

ok("helper_exists", fs.existsSync(path.join(ROOT, "lib/legalCmsTokens.ts")));
ok(
  "helper_exports_renderLegalCmsContactTokens",
  /export function renderLegalCmsContactTokens/.test(helperSrc)
);
ok(
  "helper_exact_tokens_only",
  helperSrc.includes("{{contact_email}}") &&
    helperSrc.includes("{{contact_phone}}") &&
    helperSrc.includes("{{contact_telegram}}")
);
ok(
  "helper_uses_escapeHtml",
  /escapeHtml/.test(helperSrc) &&
    /from ["']@\/lib\/contentHtml["']/.test(helperSrc) &&
    /export function escapeHtml/.test(contentHtmlSrc)
);
ok(
  "helper_no_eval_or_function_ctor",
  !/\beval\s*\(/.test(helperSrc) && !/\bnew\s+Function\b/.test(helperSrc)
);
ok(
  "helper_uses_split_join_not_recursive",
  /\.split\(token\)\.join\(/.test(helperSrc) &&
    !/while\s*\(.*\{\{/.test(helperSrc)
);

ok(
  "privacy_imports_helper",
  /renderLegalCmsContactTokens/.test(privacyClient) &&
    /from ["']@\/lib\/legalCmsTokens["']/.test(privacyClient)
);
ok(
  "refund_imports_helper",
  /renderLegalCmsContactTokens/.test(refundClient) &&
    /from ["']@\/lib\/legalCmsTokens["']/.test(refundClient)
);
ok(
  "privacy_cms_body_uses_helper_then_CmsBody",
  /html=\{renderLegalCmsContactTokens\(bodyHtml,\s*contact\)\}/.test(
    privacyClient
  )
);
ok(
  "refund_cms_body_uses_helper_then_CmsBody",
  /html=\{renderLegalCmsContactTokens\(bodyHtml,\s*contact\)\}/.test(
    refundClient
  )
);
ok(
  "privacy_still_uses_CmsBody",
  /import CmsBody/.test(privacyClient) && /<CmsBody/.test(privacyClient)
);
ok(
  "refund_still_uses_CmsBody",
  /import CmsBody/.test(refundClient) && /<CmsBody/.test(refundClient)
);
ok(
  "cmsbody_still_uses_xss",
  /import xss from ["']xss["']/.test(cmsBody) && /xss\(html/.test(cmsBody)
);

ok(
  "privacy_empty_body_no_legacy_rights_email_interp",
  !/To exercise any of these rights, please contact us at \{contact\.email\}/.test(
    privacyClient
  ) && /LegalContentUnavailable/.test(privacyClient)
);
ok(
  "refund_component_contact_still_uses_contact_fields",
  /id="contact"/.test(refundClient) &&
    /contact\.phone/.test(refundClient) &&
    /contact\.telegram/.test(refundClient) &&
    /contact\.email/.test(refundClient) &&
    !/Contact us via WhatsApp \(\{contact\.phone\}\)/.test(refundClient)
);
ok(
  "terms_not_wired_to_helper",
  !/renderLegalCmsContactTokens/.test(termsClient)
);

function contactOutsideBodySwitch(src) {
  const cmsIdx = src.indexOf("bodyHtml ?");
  const contactIdx = src.indexOf('id="contact"');
  if (cmsIdx < 0 || contactIdx < 0) return false;
  const afterTernary = src.indexOf(")}", cmsIdx);
  return contactIdx > afterTernary && contactIdx > cmsIdx;
}

ok("privacy_contact_outside_body_switch", contactOutsideBodySwitch(privacyClient));
ok("refund_contact_outside_body_switch", contactOutsideBodySwitch(refundClient));

const contact = {
  whatsapp: "447500000000",
  email: "a&b@example.com",
  telegram: "@fire<script>x",
  phone: "+44<>\"'",
  whatsappUrl: "https://wa.me/447500000000",
  telegramUrl: "https://t.me/fire",
};

ok(
  "runtime_email_token",
  renderLegalCmsContactTokens("<p>{{contact_email}}</p>", contact) ===
    "<p>a&amp;b@example.com</p>"
);
const phoneOut = renderLegalCmsContactTokens("{{contact_phone}}", contact);
ok(
  "runtime_phone_token_escaped",
  phoneOut.includes("&lt;") &&
    phoneOut.includes("&gt;") &&
    phoneOut.includes("&quot;") &&
    phoneOut.includes("&#39;")
);
const tgOut = renderLegalCmsContactTokens("{{contact_telegram}}", contact);
ok(
  "runtime_telegram_token_escaped",
  tgOut.includes("&lt;script&gt;") && !tgOut.includes("<script>")
);
ok(
  "runtime_multiple_occurrences",
  renderLegalCmsContactTokens("{{contact_email}} / {{contact_email}}", contact) ===
    "a&amp;b@example.com / a&amp;b@example.com"
);
ok(
  "runtime_unknown_token_unchanged",
  renderLegalCmsContactTokens("{{contact_fax}} {{CONTACT_EMAIL}}", contact) ===
    "{{contact_fax}} {{CONTACT_EMAIL}}"
);
ok("runtime_empty_html", renderLegalCmsContactTokens("", contact) === "");
ok(
  "runtime_ordinary_html_unchanged",
  renderLegalCmsContactTokens("<p>Hello <strong>world</strong></p>", contact) ===
    "<p>Hello <strong>world</strong></p>"
);
ok(
  "runtime_all_three",
  (() => {
    const out = renderLegalCmsContactTokens(
      "{{contact_email}}|{{contact_phone}}|{{contact_telegram}}",
      contact
    );
    return out.startsWith("a&amp;b@example.com|") && out.endsWith(tgOut);
  })()
);

console.log(
  `\nphase-legal-cms-contact-tokens: ${passed} passed, ${failed} failed`
);
process.exit(failed ? 1 : 0);
