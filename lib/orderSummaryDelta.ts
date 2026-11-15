/** Pure helpers for Sidhu dashboard order-summary optimistic updates. */

export const REVENUE_ORDER_STATUSES = ["confirmed", "dispatched", "delivered"] as const;
export const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "dispatched",
  "delivered",
  "cancelled",
] as const;

export type OrderStatusName = (typeof ORDER_STATUSES)[number];

export type OrderSummarySlice = {
  total_orders?: number;
  pending_orders?: number;
  delivered_orders?: number;
  cancelled_orders?: number;
  confirmed_revenue?: number;
  delivered_revenue?: number;
  pending_value?: number;
  cancelled_value?: number;
  customer_count?: number;
  [key: string]: unknown;
};

export function parseMoney(v: unknown): number {
  const n = parseFloat(String(v ?? "0").replace(/[£,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function bump(next: OrderSummarySlice, key: string, delta: number) {
  if (next[key] == null) return;
  next[key] = Math.max(0, Number(next[key]) + delta);
}

function isRevenueStatus(status: string): boolean {
  return (REVENUE_ORDER_STATUSES as readonly string[]).includes(status);
}

/** Apply optimistic counter/revenue deltas for delete or status change. */
export function applyOrderSummaryDelta(
  prev: OrderSummarySlice | null | undefined,
  opts: {
    removed?: { status: string; total: string | number };
    statusChange?: { from: string; to: string; total: string | number };
    customerRemoved?: boolean;
  }
): OrderSummarySlice | null | undefined {
  if (!prev) return prev;
  const next: OrderSummarySlice = { ...prev };

  if (opts.removed) {
    const { status, total } = opts.removed;
    const money = parseMoney(total);
    bump(next, "total_orders", -1);
    if (status === "pending") bump(next, "pending_orders", -1);
    if (status === "delivered") bump(next, "delivered_orders", -1);
    if (status === "cancelled") bump(next, "cancelled_orders", -1);
    if (isRevenueStatus(status)) bump(next, "confirmed_revenue", -money);
    if (status === "delivered") bump(next, "delivered_revenue", -money);
    if (status === "pending") bump(next, "pending_value", -money);
    if (status === "cancelled") bump(next, "cancelled_value", -money);
    if (opts.customerRemoved) bump(next, "customer_count", -1);
  }

  if (opts.statusChange) {
    const { from, to, total } = opts.statusChange;
    if (from !== to) {
      const money = parseMoney(total);
      if (from === "pending") bump(next, "pending_orders", -1);
      if (to === "pending") bump(next, "pending_orders", 1);
      if (from === "delivered") bump(next, "delivered_orders", -1);
      if (to === "delivered") bump(next, "delivered_orders", 1);
      if (from === "cancelled") bump(next, "cancelled_orders", -1);
      if (to === "cancelled") bump(next, "cancelled_orders", 1);

      const wasRev = isRevenueStatus(from);
      const isRev = isRevenueStatus(to);
      if (wasRev && !isRev) bump(next, "confirmed_revenue", -money);
      if (!wasRev && isRev) bump(next, "confirmed_revenue", money);

      if (from === "delivered") bump(next, "delivered_revenue", -money);
      if (to === "delivered") bump(next, "delivered_revenue", money);
      if (from === "pending") bump(next, "pending_value", -money);
      if (to === "pending") bump(next, "pending_value", money);
      if (from === "cancelled") bump(next, "cancelled_value", -money);
      if (to === "cancelled") bump(next, "cancelled_value", money);
    }
  }

  return next;
}

/** SQL CASE fragments documented for tests (must match admin-orders handleSummary). */
export const SUMMARY_SQL_CASE = {
  confirmed_revenue:
    "COALESCE(SUM(CASE WHEN status IN ('confirmed','dispatched','delivered') THEN total ELSE 0 END), 0)",
  delivered_revenue:
    "COALESCE(SUM(CASE WHEN status = 'delivered' THEN total ELSE 0 END), 0)",
  pending_value:
    "COALESCE(SUM(CASE WHEN status = 'pending' THEN total ELSE 0 END), 0)",
  cancelled_value:
    "COALESCE(SUM(CASE WHEN status = 'cancelled' THEN total ELSE 0 END), 0)",
} as const;
