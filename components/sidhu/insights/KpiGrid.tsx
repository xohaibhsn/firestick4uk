"use client";

import type { InsightsKpis } from "./insightsTypes";
import { KpiCard, fmtInt } from "./shared";

export default function KpiGrid({ kpis }: { kpis: InsightsKpis }) {
  return (
    <div className="sin-grid">
      <KpiCard label="Sessions" value={fmtInt(kpis.sessions)} />
      <KpiCard label="Visitors" value={fmtInt(kpis.visitors)} hint={kpis.visitors === null ? "Not in summaries" : undefined} />
      <KpiCard label="Pageviews" value={fmtInt(kpis.pageviews)} />
      <KpiCard label="Add to cart" value={fmtInt(kpis.add_to_cart)} />
      <KpiCard label="Checkout starts" value={fmtInt(kpis.checkout_starts)} />
      <KpiCard label="Place-order clicks" value={fmtInt(kpis.place_order_clicks)} />
      <KpiCard label="Orders" value={fmtInt(kpis.orders)} hint="Attributed to sessions" />
    </div>
  );
}
