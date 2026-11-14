/**
 * Denylist, not allowlist: unknown/new keys stay public so the UI never breaks.
 *
 * PUBLIC_SITE_CONTENT_DENYLIST hides admin-only / unused site_content keys from the
 * public GET /api/site-content?page=all response only. DB rows are unchanged;
 * server-side readers (getPublicSiteContent, layout seed, etc.) are unaffected.
 */
import denylistJson from "./publicSiteContentDenylist.json";

export const PUBLIC_SITE_CONTENT_DENYLIST: ReadonlySet<string> = new Set(
  denylistJson as string[]
);

/** Critical keys that must remain present on the public page=all map (presence only). */
export const PUBLIC_SITE_CONTENT_CRITICAL_KEYS: readonly string[] = [
  "prices_include_vat",
  "price_incl_vat_suffix",
  "ads_conv_label_purchase",
  "ads_conv_label_whatsapp",
  "bank_account_name",
  "bank_account_no",
  "bank_sort_code",
  "bank_heading",
  "payment_bank_enabled",
  "payment_cod_enabled",
  "contact_email",
  "contact_phone",
  "contact_whatsapp",
  "hero_slide_1",
  "hero_slide_2",
  "hero_slide_3",
  "hero_slide_4",
  "seasonal_promo_text",
  "seasonal_promo_cta",
  "track_email_label",
  "track_email_placeholder",
  "track_email_help",
] as const;

export const SITE_CONTENT_PAGE_LOCKED_BODY = { error: "Unauthorized" } as const;

export function filterPublicSiteContentMap<T extends Record<string, unknown>>(
  map: T
): T {
  const out = { ...map };
  for (const key of PUBLIC_SITE_CONTENT_DENYLIST) {
    if (Object.prototype.hasOwnProperty.call(out, key)) {
      delete (out as Record<string, unknown>)[key];
    }
  }
  return out;
}
