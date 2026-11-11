"use client";

import type { InsightsRangeState, InsightsReturningResponse } from "./insightsTypes";
import {
  KpiCard,
  NotesList,
  RangeControls,
  ResourceView,
  S,
  buildInsightsUrl,
  fmtInt,
  fmtPct,
  useInsightsResource,
} from "./shared";

type Props = {
  range: InsightsRangeState;
  onRange: (r: InsightsRangeState) => void;
  includeBots: boolean;
  onIncludeBots: (v: boolean) => void;
};

function BucketTable({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ label: string; visitors: number }>;
}) {
  return (
    <div style={S.card}>
      <h3 style={S.cardTitle}>{title}</h3>
      <div className="sin-table-wrap">
        <table>
          <thead>
            <tr>
              <th style={S.th}>Bucket</th>
              <th style={{ ...S.th, textAlign: "right" }}>Visitors</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td style={S.td}>{r.label}</td>
                <td style={S.tdNum}>{fmtInt(r.visitors)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ReturningScreen({ range, onRange, includeBots, onIncludeBots }: Props) {
  const url = buildInsightsUrl("returning", range, includeBots);
  const resource = useInsightsResource<InsightsReturningResponse>(url);

  return (
    <div>
      <RangeControls range={range} onRange={onRange} includeBots={includeBots} onIncludeBots={onIncludeBots} />
      <ResourceView resource={resource} isEmpty={(d) => !d.has_data}>
        {(d) => {
          const t = d.totals;
          return (
            <>
              <NotesList notes={d.notes} />
              <div className="sin-grid">
                <KpiCard label="Visitors" value={fmtInt(t.visitors)} />
                <KpiCard label="New" value={fmtInt(t.new_visitors)} />
                <KpiCard
                  label="Returning"
                  value={fmtInt(t.returning_visitors)}
                  hint={t.visitors ? `${fmtPct(t.returning_visitors, t.visitors)} of visitors` : undefined}
                />
                <KpiCard
                  label="Avg days since last"
                  value={d.avg_days_since_last == null ? "—" : String(d.avg_days_since_last)}
                  hint="Among returning visitors with a prior session"
                />
              </div>
              <div className="sin-two">
                <BucketTable title="Visits in range" rows={d.visit_count_buckets} />
                <BucketTable title="Days since last visit" rows={d.days_since_last_buckets} />
              </div>
            </>
          );
        }}
      </ResourceView>
    </div>
  );
}
