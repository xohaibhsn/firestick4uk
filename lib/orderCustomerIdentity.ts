/** Minimum checkout identity: at least one of name / email / phone after trim. */

export const CUSTOMER_IDENTITY_REQUIRED_MSG =
  "Please provide your name, email address, or WhatsApp / phone number.";

export type OrderCustomerIdentity = {
  customer_name: string;
  customer_email: string;
  customer_phone: string;
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
