/**
 * Denylist, not allowlist: unknown/new keys stay public so the UI never breaks.
 *
 * PUBLIC_SITE_CONTENT_DENYLIST hides admin-only / unused site_content keys from the
 * public GET /api/site-content?page=all response only. DB rows are unchanged;
 * server-side readers (getPublicSiteContent, layout seed, etc.) are unaffected.
 */
import denylistJson from "./publicSiteContentDenylist.json";
import {
  effectivePaymentMethods,
  PAYMENT_BANK_ENABLED_KEY,
  PAYMENT_COD_ENABLED_KEY,
} from "./paymentMethodSettings";

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

/** Bank identity keys blanked on the public map when Bank Transfer is effectively disabled. */
export const BANK_IDENTITY_PUBLIC_KEYS = [
  "bank_account_name",
  "bank_sort_code",
  "bank_account_no",
] as const;

export const SITE_CONTENT_PAGE_LOCKED_BODY = { error: "Unauthorized" } as const;

/**
 * When Bank Transfer is effectively OFF, return a copy with bank identity values
 * set to "" for keys that already exist. Does not mutate the input (may be the
 * shared public cache object). Does not add absent keys.
 */
export function redactBankIdentityWhenBankDisabled<T extends Record<string, unknown>>(
  map: T
): T {
  const toggles = effectivePaymentMethods(
    map[PAYMENT_BANK_ENABLED_KEY],
    map[PAYMENT_COD_ENABLED_KEY]
  );
  if (toggles.bankEnabled) return map;
  const out = { ...map } as T;
  for (const key of BANK_IDENTITY_PUBLIC_KEYS) {
    if (Object.prototype.hasOwnProperty.call(out, key)) {
      (out as Record<string, unknown>)[key] = "";
    }
  }
  return out;
}

export function filterPublicSiteContentMap<T extends Record<string, unknown>>(
  map: T
): T {
  const out = { ...map };
  for (const key of PUBLIC_SITE_CONTENT_DENYLIST) {
    if (Object.prototype.hasOwnProperty.call(out, key)) {
      delete (out as Record<string, unknown>)[key];
    }
  }
  return redactBankIdentityWhenBankDisabled(out);
}
