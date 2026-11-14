/**
 * CMS setting: prices_include_vat ("1" / "0").
 * Absent / missing / garbage ⇒ OFF (today's additive-VAT behaviour).
 * Only explicit on tokens enable inclusive mode.
 *
 * Pure helpers — safe for client + server. Server cache: pricesIncludeVatServer.ts.
 */

export const PRICES_INCLUDE_VAT_KEY = "prices_include_vat";

/**
 * Parse toggle. Absent / empty / garbage ⇒ false (OFF).
 * Explicit on: "1" | "true" | "on" | "yes".
 */
export function parsePricesIncludeVat(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  const s = String(value).trim().toLowerCase();
  if (s === "") return false;
  if (s === "1" || s === "true" || s === "on" || s === "yes") return true;
  if (s === "0" || s === "false" || s === "off" || s === "no") return false;
  return false;
}

export function pricesIncludeVatToStoredValue(enabled: boolean): "1" | "0" {
  return enabled ? "1" : "0";
}
