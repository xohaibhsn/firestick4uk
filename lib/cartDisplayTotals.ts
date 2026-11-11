/**
 * Client/server-safe cart display totals — same math as /cart summary
 * (pre-coupon): subtotal + shipping + VAT(20%).
 */
import {
  cartShippingPounds,
  PHYSICAL_SHIPPING_GBP,
} from "./productFulfilment";
import { calculateGrandTotal, roundMoney } from "./orderPricing";

export type CartDisplayTotalsInput = {
  /** Sum of price * qty (useCart().total). */
  subtotal: number;
  /** Number of line items (cart.length), same input cartShippingPounds uses. */
  cartLength: number;
  /**
   * When known (after product classification), drives shipping.
   * When null/undefined and cart non-empty, matches /cart unclassified path
   * (PHYSICAL_SHIPPING_GBP).
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

/** Same presentation totals used on /cart (before coupon unless discount passed). */
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
    } else {
      // Match /cart while classification is loading / unresolved
      shipping = roundMoney(PHYSICAL_SHIPPING_GBP);
    }
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
