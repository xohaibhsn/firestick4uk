/**
 * Phase 2 Insights — pure helpers (safe for tests; no DB imports).
 * Funnel drop-off maths, export caps, CSV formula defense.
 */
import {
  INSIGHTS_EXPORT_DEFAULT_ROWS,
  INSIGHTS_EXPORT_MAX_ROWS,
  type InsightsFunnelStep,
  type InsightsFunnelStepId,
} from "./insightsTypes";

export const FUNNEL_STEP_LABELS: Record<InsightsFunnelStepId, string> = {
  product_view: "Product view",
  add_to_cart: "Add to cart",
  cart_view: "Cart view",
  checkout_start: "Checkout start",
  order_placed: "Order placed",
};

export const FUNNEL_STEP_ORDER: InsightsFunnelStepId[] = [
  "product_view",
  "add_to_cart",
  "cart_view",
  "checkout_start",
  "order_placed",
];

/**
 * Checkout-problem signals the beacon actually emits today.
 * Anything else must surface as tracked:false ("not tracked") — never invent counts.
 */
export const CHECKOUT_PROBLEM_CATALOG = [
  {
    id: "checkout_stage_abandonment",
    label: "Checkout-stage abandonment",
    tracked: true,
    note: "Sessions with a checkout signal (start / payment / place-order click) and no linked order.",
  },
  {
    id: "validation_errors",
    label: "Validation errors",
    tracked: false,
    note: "Checkout validation failures are not emitted by the Insights beacon.",
  },
  {
    id: "payment_method_switches",
    label: "Payment-method switches (bank / COD)",
    tracked: true,
    note: "Counted from checkout_payment events (pay_method_bank / pay_method_cod).",
  },
  {
    id: "receipt_upload_failures",
    label: "Receipt upload failures",
    tracked: false,
    note: "Receipt upload failures are not emitted by the Insights beacon.",
  },
] as const;

/** Drop-off % from previous → current: ((prev - curr) / prev) * 100, clamped ≥ 0. */
export function funnelDropoffPct(previous: number, current: number): number | null {
  if (!Number.isFinite(previous) || previous <= 0) return null;
  const prev = Math.max(0, Math.floor(previous));
  const curr = Math.max(0, Math.floor(current));
  return Math.round(((prev - Math.min(curr, prev)) / prev) * 1000) / 10;
}

export function buildFunnelSteps(
  counts: Partial<Record<InsightsFunnelStepId, number>>
): InsightsFunnelStep[] {
  return FUNNEL_STEP_ORDER.map((id, i) => {
    const sessions = Math.max(0, Math.floor(Number(counts[id] ?? 0) || 0));
    const prevId = i > 0 ? FUNNEL_STEP_ORDER[i - 1] : null;
    const prev = prevId != null ? Math.max(0, Math.floor(Number(counts[prevId] ?? 0) || 0)) : 0;
    return {
      id,
      label: FUNNEL_STEP_LABELS[id],
      sessions,
      dropoff_pct: i === 0 ? null : funnelDropoffPct(prev, sessions),
    };
  });
}

export function parseExportMaxRows(raw: unknown): number {
  const n = Number.parseInt(String(Array.isArray(raw) ? raw[0] : raw ?? ""), 10);
  if (!Number.isFinite(n) || n < 1) return INSIGHTS_EXPORT_DEFAULT_ROWS;
  return Math.min(n, INSIGHTS_EXPORT_MAX_ROWS);
}

export function parseExportKind(raw: unknown): "daily" | "sessions" | null {
  const v = String(Array.isArray(raw) ? raw[0] : raw ?? "")
    .trim()
    .toLowerCase();
  if (v === "daily" || v === "sessions") return v;
  if (!v) return "daily";
  return null;
}

/**
 * CSV cell escape with spreadsheet formula-injection defense
 * (prefix leading = + - @ with a single quote). Mirrors lib/adminOrdersQuery.csvEscapeCell.
 */
export function csvEscapeInsightsCell(value: unknown): string {
  let s = value == null ? "" : String(value);
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n") {
      i++;
      continue;
    }
    break;
  }
  const firstMeaningful = i < s.length ? s[i] : "";
  if (
    firstMeaningful === "=" ||
    firstMeaningful === "+" ||
    firstMeaningful === "-" ||
    firstMeaningful === "@"
  ) {
    s = `'${s}`;
  }
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function csvRow(cols: unknown[]): string {
  return cols.map(csvEscapeInsightsCell).join(",");
}

/** Bucket a non-negative integer visit count into fixed labels. */
export function visitCountBucketLabel(n: number): string {
  const v = Math.max(0, Math.floor(n));
  if (v <= 1) return "1 visit";
  if (v === 2) return "2 visits";
  if (v <= 4) return "3–4 visits";
  if (v <= 9) return "5–9 visits";
  return "10+ visits";
}

/** Bucket days-since-last-visit into fixed labels. */
export function daysSinceLastBucketLabel(days: number): string {
  const d = Math.max(0, Math.floor(days));
  if (d <= 1) return "0–1 days";
  if (d <= 7) return "2–7 days";
  if (d <= 30) return "8–30 days";
  if (d <= 90) return "31–90 days";
  return "90+ days";
}
