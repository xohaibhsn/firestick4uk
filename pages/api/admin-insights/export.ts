/**
 * GET /api/admin-insights/export — CSV export of daily summaries / sessions.
 * Permission: insights.export (manager + super_admin).
 * kind=daily (default) for all exporters; kind=sessions requires super_admin. No IP / geo columns.
 * Max rows clamped to 50_000. UTF-8 BOM. Formula-injection safe cells.
 * Audit-logs every successful export (who/when/range/row count).
 * Missing tables => 200 JSON { installed:false, state:"not_installed" } (never 500 stack).
 * SELECT only against insights_* (audit INSERT via recordAdminAudit helper only).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getRequestMeta, requireAdminPermission } from "@/lib/adminAuth";
import { recordAdminAudit } from "@/lib/adminAudit";
import { setAdminNoStore } from "@/lib/adminNoStore";
import {
  botClause,
  isMissingTableError,
  num,
  parseDateRange,
  qrows,
} from "@/components/sidhu/insights/insightsServer";
import {
  csvRow,
  parseExportKind,
  parseExportMaxRows,
} from "@/components/sidhu/insights/insightsPhase2";
import { INSIGHTS_NOT_INSTALLED } from "@/components/sidhu/insights/insightsTypes";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const admin = await requireAdminPermission(req, res, "insights.export");
  if (!admin) return;

  setAdminNoStore(res);

  const parsed = parseDateRange(req.query);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const range = parsed.range;
  const kind = parseExportKind(req.query.kind);
  if (!kind) {
    res.status(400).json({ error: "Invalid kind. Use daily or sessions." });
    return;
  }
  if (kind === "sessions" && admin.role !== "super_admin") {
    res.status(403).json({ error: "Session-level export requires super_admin." });
    return;
  }

  const maxRows = parseExportMaxRows(req.query.max_rows ?? req.query.limit);
  const bots = botClause("s", range.includeBots);

  try {
    let header: string[];
    const lines: string[] = [];
    let rowCount = 0;

    if (kind === "daily") {
      header = [
        "summary_date",
        "visitors",
        "sessions",
        "pageviews",
        "new_visitors",
        "returning_visitors",
        "bot_sessions",
        "orders_attributed",
        "add_to_cart",
        "checkout_starts",
        "place_order_clicks",
      ];
      lines.push(csvRow(header));
      const rows = await qrows<Record<string, unknown>>(
        `SELECT DATE_FORMAT(summary_date, '%Y-%m-%d') AS d,
                visitors, sessions, pageviews, new_visitors, returning_visitors,
                bot_sessions, orders_attributed, add_to_cart, checkout_starts, place_order_clicks
           FROM insights_daily_summary
          WHERE summary_date >= ? AND summary_date <= ?
          ORDER BY summary_date ASC
          LIMIT ?`,
        [range.from, range.to, maxRows]
      );
      for (const r of rows) {
        lines.push(
          csvRow([
            r.d,
            num(r.visitors),
            num(r.sessions),
            num(r.pageviews),
            num(r.new_visitors),
            num(r.returning_visitors),
            num(r.bot_sessions),
            num(r.orders_attributed),
            num(r.add_to_cart),
            num(r.checkout_starts),
            num(r.place_order_clicks),
          ])
        );
      }
      rowCount = rows.length;
    } else {
      header = [
        "started_at",
        "device_type",
        "landing_path",
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "referrer_host",
        "is_new_visitor",
        "is_returning",
        "is_bot",
        "pageview_count",
        "order_id",
      ];
      lines.push(csvRow(header));

      const rows = await qrows<Record<string, unknown>>(
        `SELECT DATE_FORMAT(s.started_at, '%Y-%m-%dT%H:%i:%sZ') AS started_at,
                s.device_type AS device_type,
                s.landing_path AS landing_path,
                s.utm_source AS utm_source,
                s.utm_medium AS utm_medium,
                s.utm_campaign AS utm_campaign,
                s.referrer_host AS referrer_host,
                s.is_new_visitor AS is_new_visitor,
                s.is_returning AS is_returning,
                s.is_bot AS is_bot,
                s.pageview_count AS pageview_count,
                s.order_id AS order_id
           FROM insights_sessions s
          WHERE s.started_at >= ? AND s.started_at < ?${bots}
          ORDER BY s.started_at DESC
          LIMIT ?`,
        [range.startSql, range.endSql, maxRows]
      );
      for (const r of rows) {
        const cols: unknown[] = [
          r.started_at,
          r.device_type,
          r.landing_path,
          r.utm_source,
          r.utm_medium,
          r.utm_campaign,
          r.referrer_host,
          num(r.is_new_visitor),
          num(r.is_returning),
          num(r.is_bot),
          num(r.pageview_count),
          r.order_id || "",
        ];
        lines.push(csvRow(cols));
      }
      rowCount = rows.length;
    }

    const { ip } = getRequestMeta(req);
    await recordAdminAudit({
      actor: admin,
      action: "insights.export",
      entityType: "insights",
      entityId: kind,
      summary: `Insights ${kind} export ${range.from}..${range.to} (${rowCount} rows)`,
      metadata: {
        kind,
        from: range.from,
        to: range.to,
        row_count: rowCount,
        max_rows: maxRows,
        include_bots: range.includeBots,
      },
      ip,
    });

    const stamp = `${range.from}_${range.to}`;
    const csv = `\uFEFF${lines.join("\r\n")}`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="insights-${kind}-${stamp}.csv"`
    );
    res.status(200).send(csv);
  } catch (err) {
    if (isMissingTableError(err)) {
      res.status(200).json({ ...INSIGHTS_NOT_INSTALLED });
      return;
    }
    const code = err && typeof err === "object" ? String((err as { code?: string }).code || "") : "";
    console.error("[insights-export] failed", code || "unknown");
    res.status(503).json({ error: "Insights export is temporarily unavailable." });
  }
}
