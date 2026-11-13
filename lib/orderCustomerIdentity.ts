/** Checkout customer identity helpers (name optional; email + phone required). */

import {
  coercePhoneToE164Candidate,
  isValidE164,
  isValidPhoneForCountryRules,
} from "./phoneCountryCodes";

export const CUSTOMER_IDENTITY_REQUIRED_MSG =
  "Please provide your name, email address, or WhatsApp / phone number.";

export const CHECKOUT_EMAIL_REQUIRED_MSG =
  "Please enter your email address.";
export const CHECKOUT_EMAIL_INVALID_MSG =
  "Please enter a valid email address.";
export const CHECKOUT_PHONE_REQUIRED_MSG =
  "Please enter your phone / WhatsApp number.";
export const CHECKOUT_PHONE_INVALID_MSG =
  "Please enter a valid phone number for the selected country.";

export type OrderCustomerIdentity = {
  customer_name: string;
  customer_email: string;
  customer_phone: string;
};

export type CheckoutContactValidation =
  | { ok: true }
  | {
      ok: false;
      field: "email" | "phone";
      code: "required" | "invalid";
      message: string;
    };

export function normalizeCustomerIdentityField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeOrderCustomerIdentity(input: {
  customer_name?: unknown;
  customer_email?: unknown;
  customer_phone?: unknown;
}): OrderCustomerIdentity {
  return {
    customer_name: normalizeCustomerIdentityField(input.customer_name),
    customer_email: normalizeCustomerIdentityField(input.customer_email),
    customer_phone: normalizeCustomerIdentityField(input.customer_phone),
  };
}

export function hasMeaningfulCustomerIdentity(
  identity: OrderCustomerIdentity
): boolean {
  return Boolean(
    identity.customer_name ||
      identity.customer_email ||
      identity.customer_phone
  );
}

/** RFC-lite: one @, domain with a dot, no spaces; length ≤ 254. */
export function isValidCheckoutEmail(email: string): boolean {
  const s = String(email || "").trim();
  if (!s || s.length > 254) return false;
  if (/\s/.test(s)) return false;
  const at = s.indexOf("@");
  if (at <= 0 || at !== s.lastIndexOf("@")) return false;
  const local = s.slice(0, at);
  const domain = s.slice(at + 1);
  if (!local || !domain) return false;
  if (!domain.includes(".")) return false;
  if (domain.startsWith(".") || domain.endsWith(".")) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

/**
 * Validate mandatory checkout email + phone.
 * Phone must already be E.164 (or defensively coercible from +/00 form).
 * Server never guesses a country for numbers without "+".
 */
export function validateCheckoutContact(input: {
  customer_email?: unknown;
  customer_phone?: unknown;
}): CheckoutContactValidation {
  const email = normalizeCustomerIdentityField(input.customer_email);
  if (!email) {
    return {
      ok: false,
      field: "email",
      code: "required",
      message: CHECKOUT_EMAIL_REQUIRED_MSG,
    };
  }
  if (!isValidCheckoutEmail(email)) {
    return {
      ok: false,
      field: "email",
      code: "invalid",
      message: CHECKOUT_EMAIL_INVALID_MSG,
    };
  }

  const phoneRaw = normalizeCustomerIdentityField(input.customer_phone);
  if (!phoneRaw) {
    return {
      ok: false,
      field: "phone",
      code: "required",
      message: CHECKOUT_PHONE_REQUIRED_MSG,
    };
  }

  const phone = coercePhoneToE164Candidate(phoneRaw);
  if (!phone || !isValidE164(phone) || !isValidPhoneForCountryRules(phone)) {
    return {
      ok: false,
      field: "phone",
      code: "invalid",
      message: CHECKOUT_PHONE_INVALID_MSG,
    };
  }

  return { ok: true };
}

/** Defensive E.164 coerce for storage after validateCheckoutContact succeeds. */
export function normalizeCheckoutPhoneForStorage(raw: string): string {
  const coerced = coercePhoneToE164Candidate(raw);
  return isValidE164(coerced) ? coerced : coercePhoneToE164Candidate(raw);
}
