/** Server-authoritative order pricing helpers (pure; no DB). */

import {
  cartShippingPounds,
  isDigitalProduct,
  type ProductFulfilmentFields,
} from "./productFulfilment";

export function roundMoney(n: number): number {
  return Math.round(Number(n) * 100) / 100;
}

export function normalizeCouponCode(code: unknown): string {
  return String(code ?? "")
    .toUpperCase()
    .trim();
}

/** Positive safe integer quantity (rejects 0, negative, fractional, NaN, Infinity). */
export function parseOrderQuantity(raw: unknown): number | null {
  if (typeof raw === "boolean") return null;
  if (typeof raw === "string" && raw.trim() === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  if (!Number.isInteger(n)) return null;
  if (n < 1) return null;
  if (n > Number.MAX_SAFE_INTEGER) return null;
  return n;
}

export function isFiniteNonNegativeMoney(n: unknown): n is number {
  const v = Number(n);
  return Number.isFinite(v) && v >= 0;
}

export type CouponType = "percentage" | "fixed" | string;

/** Same formula as public coupon validate: discount against cart_total (subtotal + shipping). */
export function calculateCouponDiscount(opts: {
  type: CouponType;
  value: number;
  cartTotal: number;
}): number {
  const cartTotal = Number(opts.cartTotal);
  const value = Number(opts.value);
  if (!Number.isFinite(cartTotal) || cartTotal < 0) return 0;
  if (!Number.isFinite(value) || value < 0) return 0;
  const raw =
    opts.type === "percentage"
      ? Math.min((cartTotal * value) / 100, cartTotal)
      : Math.min(value, cartTotal);
  return roundMoney(raw);
}

export type AuthoritativeLineItem = {
  id: number;
  name: string;
  price: number;
  qty: number;
  category: string | null;
  stock: string | null;
};

export function calculateAuthoritativePricing(items: AuthoritativeLineItem[]): {
  subtotal: number;
  shipping: number;
  vatAmount: number;
  hasPhysicalItems: boolean;
  hasDigitalItems: boolean;
} {
  let subtotalRaw = 0;
  let hasPhysicalItems = false;
  let hasDigitalItems = false;

  for (const item of items) {
    subtotalRaw += item.price * item.qty;
    const fulfilment: ProductFulfilmentFields = {
      category: item.category,
      stock: item.stock,
    };
    if (isDigitalProduct(fulfilment)) hasDigitalItems = true;
    else hasPhysicalItems = true;
  }

  const subtotal = roundMoney(subtotalRaw);
  const shipping = roundMoney(
    cartShippingPounds({
      cartLength: items.length,
      hasPhysicalItems,
    })
  );
  const vatAmount = roundMoney(subtotal * 0.2);

  return { subtotal, shipping, vatAmount, hasPhysicalItems, hasDigitalItems };
}

export function calculateGrandTotal(opts: {
  subtotal: number;
  shipping: number;
  vatAmount: number;
  discountAmount: number;
}): number {
  const total = roundMoney(
    opts.subtotal + opts.shipping + opts.vatAmount - opts.discountAmount
  );
  return total < 0 ? 0 : total;
}
