import type { NextApiRequest, NextApiResponse } from "next";
import pool from "../../lib/db";
import { getRequestMeta, requireAdminPermission } from "../../lib/adminAuth";
import { recordAdminAudit } from "../../lib/adminAudit";
import {
  EXPORT_MAX,
  buildOrderWhere,
  csvEscapeCell,
  itemsListForOrderIds,
  parseOrderFilters,
} from "../../lib/adminOrdersQuery";

function rowToCsv(cols: unknown[]): string {
  return cols.map(csvEscapeCell).join(",");
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const admin = await requireAdminPermission(req, res, "orders.view", { mutate: false });
  if (!admin) return;

  try {
    const parsed = parseOrderFilters(req.query);
    if (parsed.error) return res.status(400).json({ error: parsed.error });

    const { sql: whereSql, params } = buildOrderWhere(parsed.filters, "o");

    const [countRows]: any = await pool.query(
      `SELECT COUNT(*) AS total FROM orders o ${whereSql}`,
      params
    );
    const total = Number(countRows?.[0]?.total || 0);
    if (total > EXPORT_MAX) {
      return res.status(400).json({
        error: `Export limited to ${EXPORT_MAX} orders. Narrow your filters (currently ${total} match).`,
        total,
        max: EXPORT_MAX,
      });
    }

    const [idRows]: any = await pool.query(
      `SELECT o.order_id
       FROM orders o
       ${whereSql}
       ORDER BY o.created_at DESC
       LIMIT ?`,
      [...params, EXPORT_MAX]
    );
    const orderIds = (Array.isArray(idRows) ? idRows : []).map((r: any) => String(r.order_id));

    let orders: any[] = [];
    if (orderIds.length) {
      const placeholders = orderIds.map(() => "?").join(",");
      const [orderRows]: any = await pool.query(
        `SELECT * FROM orders WHERE order_id IN (${placeholders})`,
        orderIds
      );
      const byId: Record<string, any> = {};
      for (const row of Array.isArray(orderRows) ? orderRows : []) {
        byId[String(row.order_id)] = row;
      }
      const itemsMap = await itemsListForOrderIds(pool, orderIds);
      orders = orderIds.map((id: string) => ({
        ...(byId[id] || { order_id: id }),
        items_list: itemsMap[id] || "",
      }));
    }

    const header = [
      "Order ID",
      "Date",
      "Status",
      "Customer Name",
      "Email",
      "Phone",
      "Address",
      "City",
      "Postcode",
      "Payment Method",
      "Payment Reference",
      "Items",
      "VAT",
      "Discount",
      "Total",
      "Coupon Code",
      "Receipt URL",
    ];

    const lines = [rowToCsv(header)];
    for (const o of orders) {
      lines.push(
        rowToCsv([
          o.order_id,
          o.created_at ? new Date(o.created_at).toISOString() : "",
          o.status,
          o.customer_name,
          o.customer_email,
          o.customer_phone,
          o.delivery_address,
          o.city,
          o.postcode,
          o.payment_method,
          o.payment_reference,
          o.items_list,
          o.vat_amount,
          o.discount_amount,
          o.total,
          o.coupon_code,
          o.receipt_path,
        ])
      );
    }

    const dateStamp = new Date().toISOString().slice(0, 10);
    const csv = "\uFEFF" + lines.join("\r\n");

    const { ip } = getRequestMeta(req);
    await recordAdminAudit({
      actor: admin,
      action: "order.exported",
      entityType: "orders",
      entityId: null,
      summary: `Exported ${orders.length} order(s)`,
      metadata: {
        row_count: orders.length,
        filters: {
          q: parsed.filters.q || undefined,
          status: parsed.filters.status || undefined,
          payment_method: parsed.filters.paymentMethod || undefined,
          date_from: req.query.date_from || undefined,
          date_to: req.query.date_to || undefined,
        },
      },
      ip,
    });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="firestick4uk-orders-${dateStamp}.csv"`
    );
    return res.status(200).send(csv);
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Export failed" });
  }
}
