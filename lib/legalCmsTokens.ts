import { escapeHtml } from "@/lib/contentHtml";
import type { ContactConfig } from "@/lib/contactConfigNormalize";

/** Exact CMS legal-body tokens supported for ContactConfig substitution. */
export const LEGAL_CMS_CONTACT_TOKENS = [
  "{{contact_email}}",
  "{{contact_phone}}",
  "{{contact_telegram}}",
] as const;

function escapeContactValue(value: string): string {
  // Reuse shared HTML escape, then cover apostrophe for attribute/text safety.
  return escapeHtml(String(value ?? "")).replace(/'/g, "&#39;");
}

/**
 * Replace only the three explicit legal CMS contact tokens with HTML-escaped
 * ContactConfig values. Unknown {{...}} tokens are left unchanged.
 * Exact token substitution only — no dynamic code execution or recursive expansion.
 */
export function renderLegalCmsContactTokens(
  html: string,
  contact: ContactConfig
): string {
  if (!html) return html;

  const replacements: Record<(typeof LEGAL_CMS_CONTACT_TOKENS)[number], string> =
    {
      "{{contact_email}}": escapeContactValue(contact.email),
      "{{contact_phone}}": escapeContactValue(contact.phone),
      "{{contact_telegram}}": escapeContactValue(contact.telegram),
    };

  let out = String(html);
  for (const token of LEGAL_CMS_CONTACT_TOKENS) {
    if (!out.includes(token)) continue;
    out = out.split(token).join(replacements[token]);
  }
  return out;
}
