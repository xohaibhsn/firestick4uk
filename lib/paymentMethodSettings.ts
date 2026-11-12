/**
 * CMS payment-method toggles (Bank Transfer / COD).
 *
 * Keys live in site_content as "1" / "0".
 * ABSENT or unreadable / garbage ⇒ enabled (today's behaviour).
 * If both are explicitly "0", treat both as enabled and flag a warning —
 * never block checkout entirely via toggles alone.
 *
 * Pure helpers only — safe for client + server. Server cache lives in
 * paymentMethodSettingsServer.ts.
 */

import type { PublicPaymentMethod } from "./paymentMethod";

export const PAYMENT_BANK_ENABLED_KEY = "payment_bank_enabled";
export const PAYMENT_COD_ENABLED_KEY = "payment_cod_enabled";

export type PaymentMethodToggleMap = {
  bankEnabled: boolean;
  codEnabled: boolean;
  /** True when both CMS values were OFF and were corrected to ON. */
  bothOffCorrected: boolean;
};

/**
 * Parse a single toggle. Absent / empty / garbage ⇒ enabled (fail-safe).
 * Only explicit off tokens disable.
 */
export function parsePaymentMethodToggle(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  const s = String(value).trim().toLowerCase();
  if (s === "") return true;
  if (s === "0" || s === "false" || s === "off" || s === "no") return false;
  if (s === "1" || s === "true" || s === "on" || s === "yes") return true;
  return true;
}

/** Effective methods after applying the at-least-one-enabled rule. */
export function effectivePaymentMethods(
  bankRaw: unknown,
  codRaw: unknown
): PaymentMethodToggleMap {
  let bankEnabled = parsePaymentMethodToggle(bankRaw);
  let codEnabled = parsePaymentMethodToggle(codRaw);
  let bothOffCorrected = false;
  if (!bankEnabled && !codEnabled) {
    bankEnabled = true;
    codEnabled = true;
    bothOffCorrected = true;
  }
  return { bankEnabled, codEnabled, bothOffCorrected };
}

export function isPaymentMethodEffectivelyEnabled(
  method: PublicPaymentMethod,
  toggles: PaymentMethodToggleMap
): boolean {
  if (method === "bank") return toggles.bankEnabled;
  if (method === "cod") return toggles.codEnabled;
  return false;
}

/** All three bank identity fields must be non-empty after trim. */
export function bankDetailsComplete(
  accountName: unknown,
  sortCode: unknown,
  accountNo: unknown
): boolean {
  const name = String(accountName ?? "").trim();
  const sort = String(sortCode ?? "").trim();
  const account = String(accountNo ?? "").trim();
  return name.length > 0 && sort.length > 0 && account.length > 0;
}

/** Editor save guard: refuse persisting both OFF. */
export function validatePaymentTogglesForSave(
  bankEnabled: boolean,
  codEnabled: boolean
): { ok: true } | { ok: false; error: string } {
  if (!bankEnabled && !codEnabled) {
    return {
      ok: false,
      error: "At least one payment method must stay enabled.",
    };
  }
  return { ok: true };
}

export function paymentToggleToStoredValue(enabled: boolean): "1" | "0" {
  return enabled ? "1" : "0";
}
