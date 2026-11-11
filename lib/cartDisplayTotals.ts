/**
 * Client/server-safe cart display totals — same math as /cart summary
 * (pre-coupon): subtotal + shipping + VAT(20%).
 *
 * Coupons are NOT applied here — /cart remains the source of truth for discounts.
 */
import { cartShippingPounds } from "./productFulfilment";
import { calculateGrandTotal, roundMoney } from "./orderPricing";

export type CartDisplayTotalsInput = {
  /** Sum of price * qty (useCart().total). */
  subtotal: number;
  /** Number of line items (cart.length), same input cartShippingPounds uses. */
  cartLength: number;
  /**
   * When true/false (after product classification), drives shipping exactly
   * as /cart does once classification.ready.
   * When null/undefined: shipping is 0 — do NOT assume PHYSICAL_SHIPPING_GBP
   * for display helpers (mini-bar must not show a shipping-inclusive guess).
   * /cart page still applies PHYSICAL_SHIPPING_GBP inline while unclassified.
   */
  hasPhysicalItems?: boolean | null;
  discountAmount?: number;
};

export type CartDisplayTotals = {
  subtotal: number;
  shipping: number;
  vatAmount: number;
  discountAmount: number;
  grandTotal: number;
};

/** Same presentation totals used on /cart when classification is known (pre-coupon). */
export function computeCartDisplayTotals(
  opts: CartDisplayTotalsInput
): CartDisplayTotals {
  const subtotal = roundMoney(Number(opts.subtotal) || 0);
  const cartLength = Math.max(0, Number(opts.cartLength) || 0);
  const discountAmount = roundMoney(Number(opts.discountAmount) || 0);

  let shipping = 0;
  if (cartLength > 0) {
    if (opts.hasPhysicalItems === true || opts.hasPhysicalItems === false) {
      shipping = roundMoney(
        cartShippingPounds({
          cartLength,
          hasPhysicalItems: opts.hasPhysicalItems,
        })
      );
    }
    // null/undefined → shipping 0 (no assumed physical shipping for display)
  }

  const vatAmount = roundMoney(subtotal * 0.2);
  const grandTotal = calculateGrandTotal({
    subtotal,
    shipping,
    vatAmount,
    discountAmount,
  });

  return { subtotal, shipping, vatAmount, discountAmount, grandTotal };
}

export function formatGbp(amount: number): string {
  return `£${roundMoney(amount).toFixed(2)}`;
}

/**
 * Mini-bar amount text.
 * Ready + classified → £grandTotal (shipping included exactly as /cart).
 * Pending / error / unknown → "£subtotal + VAT" (label only; no shipping guess).
 */
export function formatMiniCartAmountText(opts: {
  subtotal: number;
  cartLength: number;
  classificationReady: boolean;
  hasPhysicalItems: boolean;
}): string {
  if (opts.classificationReady) {
    const t = computeCartDisplayTotals({
      subtotal: opts.subtotal,
      cartLength: opts.cartLength,
      hasPhysicalItems: opts.hasPhysicalItems,
    });
    return formatGbp(t.grandTotal);
  }
  return `${formatGbp(roundMoney(Number(opts.subtotal) || 0))} + VAT`;
}
