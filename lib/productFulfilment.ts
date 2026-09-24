/** Authoritative digital vs physical product classification (no name/slug heuristics). */

export type ProductFulfilmentFields = {
  category?: string | null;
  stock?: string | null;
};

/**
 * Digital/subscription when category is Subscription OR stock is Digital
 * (trim + case-insensitive). Missing both → not confidently digital.
 */
export function isDigitalProduct(product: ProductFulfilmentFields): boolean {
  const category = String(product?.category ?? "")
    .trim()
    .toLowerCase();
  const stock = String(product?.stock ?? "")
    .trim()
    .toLowerCase();
  if (category === "subscription") return true;
  if (stock === "digital") return true;
  return false;
}

/** Physical goods still ship at £3.99; digital-only / empty cart = £0. */
export const PHYSICAL_SHIPPING_GBP = 3.99;

export function cartShippingPounds(opts: {
  cartLength: number;
  hasPhysicalItems: boolean;
}): number {
  if (!opts.cartLength) return 0;
  if (opts.hasPhysicalItems) return PHYSICAL_SHIPPING_GBP;
  return 0;
}

export const DIGITAL_SUPPLY_ACK_MARKER = "[DIGITAL_SUPPLY_ACK_V1]";

export const DIGITAL_SUPPLY_ACK_TEXT =
  "I request that my digital subscription starts as soon as possible after payment confirmation, before the 14-day cancellation period ends. I understand that once digital supply begins, I will lose my 14-day right to cancel for that digital content. This does not affect my statutory rights if the digital content is faulty, not as described, or otherwise does not conform to the contract.";

export function buildDigitalSupplyAckNotes(opts: {
  customerNotes: string;
  digitalProductIds: number[];
  recordedAtIso: string;
}): string {
  const ids = opts.digitalProductIds
    .filter((n) => Number.isInteger(n) && n > 0)
    .sort((a, b) => a - b)
    .join(",");
  const markerBlock = [
    DIGITAL_SUPPLY_ACK_MARKER,
    "accepted=true",
    `recorded_at=${opts.recordedAtIso}`,
    `product_ids=${ids}`,
    "customer requested digital supply to begin before the end of the 14-day cancellation period and acknowledged loss of the 14-day cancellation right once digital supply begins",
  ].join("\n");
  const customer = String(opts.customerNotes || "").trim();
  return customer ? `${customer}\n${markerBlock}` : markerBlock;
}
