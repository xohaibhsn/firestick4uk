/**
 * Client/server-safe cart display totals — same math as /cart summary
 * (pre-coupon): subtotal + shipping + VAT(20%) when prices are ex-VAT;
 * or subtotal + shipping when prices_include_vat is ON.
 *
 * Coupons are NOT applied here — /cart remains the source of truth for discounts.
 */
import { cartShippingPounds } from "./productFulfilment";
import {
  calculateGrandTotal,
  extractVatFromInclusiveGrandTotal,
  roundMoney,
} from "./orderPricing";

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
  /** CMS prices_include_vat — default false (additive VAT). */
  pricesIncludeVat?: boolean;
};

export type CartDisplayTotals = {
  subtotal: number;
  shipping: number;
  vatAmount: number;
  discountAmount: number;
  grandTotal: number;
  pricesIncludeVat: boolean;
};

/** Same presentation totals used on /cart when classification is known (pre-coupon). */
export function computeCartDisplayTotals(
  opts: CartDisplayTotalsInput
): CartDisplayTotals {
  const subtotal = roundMoney(Number(opts.subtotal) || 0);
  const cartLength = Math.max(0, Number(opts.cartLength) || 0);
  const discountAmount = roundMoney(Number(opts.discountAmount) || 0);
  const pricesIncludeVat = opts.pricesIncludeVat === true;

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

  let vatAmount = 0;
  if (!pricesIncludeVat) {
    vatAmount = roundMoney(subtotal * 0.2);
  }

  const grandTotal = calculateGrandTotal({
    subtotal,
    shipping,
    vatAmount,
    discountAmount,
    pricesIncludeVat,
  });

  if (pricesIncludeVat) {
    vatAmount = extractVatFromInclusiveGrandTotal(grandTotal);
  }

  return {
    subtotal,
    shipping,
    vatAmount,
    discountAmount,
    grandTotal,
    pricesIncludeVat,
  };
}

export function formatGbp(amount: number): string {
  return `£${roundMoney(amount).toFixed(2)}`;
}

/**
 * Mini-bar amount text.
 * Ready + classified → £grandTotal (shipping included exactly as /cart).
 * Pending / error / unknown → "£subtotal + VAT" when ex-VAT; plain £subtotal when inclusive.
 * Callers must pass pricesIncludeVat only after CMS has loaded; while CMS is
 * unloaded, MiniCartBar shows "Calculating…" instead of calling this helper.
 */
export function formatMiniCartAmountText(opts: {
  subtotal: number;
  cartLength: number;
  classificationReady: boolean;
  hasPhysicalItems: boolean;
  pricesIncludeVat?: boolean;
}): string {
  const pricesIncludeVat = opts.pricesIncludeVat === true;
  if (opts.classificationReady) {
    const t = computeCartDisplayTotals({
      subtotal: opts.subtotal,
      cartLength: opts.cartLength,
      hasPhysicalItems: opts.hasPhysicalItems,
      pricesIncludeVat,
    });
    return formatGbp(t.grandTotal);
  }
  const base = formatGbp(roundMoney(Number(opts.subtotal) || 0));
  return pricesIncludeVat ? base : `${base} + VAT`;
}
