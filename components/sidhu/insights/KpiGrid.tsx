"use client";

import type { InsightsKpis } from "./insightsTypes";
import { KpiCard, fmtDuration, fmtInt } from "./shared";

export default function KpiGrid({
  kpis,
  avgEngagedMs,
}: {
  kpis: InsightsKpis;
  avgEngagedMs: number | null;
}) {
  return (
    <div className="sin-grid">
      <KpiCard label="Sessions" value={fmtInt(kpis.sessions)} />
      <KpiCard label="Pageviews" value={fmtInt(kpis.pageviews)} />
      <KpiCard
        label="Avg engaged time"
        value={fmtDuration(avgEngagedMs)}
        hint={avgEngagedMs === null ? "No timing recorded yet" : "Visible-tab time per session"}
      />
      <KpiCard label="Add to cart" value={fmtInt(kpis.add_to_cart)} />
      <KpiCard label="Checkout starts" value={fmtInt(kpis.checkout_starts)} />
      <KpiCard label="Orders linked" value={fmtInt(kpis.orders)} hint="Attributed to sessions" />
    </div>
  );
}
