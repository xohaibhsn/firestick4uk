import type { NextApiRequest, NextApiResponse } from "next";
import pool from "../../lib/db";
import { getRequestMeta, requireAdminPermission } from "../../lib/adminAuth";
import { recordAdminAudit } from "../../lib/adminAudit";
import {
  ORDER_STATUSES,
  buildOrderWhere,
  clampInt,
  itemsListForOrderIds,
  parseOrderFilters,
} from "../../lib/adminOrdersQuery";

async function handleSummary(res: NextApiResponse) {
  const [[totals]]: any = await pool.query(`
    SELECT
      COUNT(*) AS total_orders,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_orders,
      SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) AS delivered_orders,
      COALESCE(SUM(CASE WHEN status IN ('confirmed','dispatched','delivered') THEN total ELSE 0 END), 0) AS confirmed_revenue
    FROM orders
  `);
  const [[cust]]: any = await pool.query(`
    SELECT COUNT(*) AS customer_count FROM (
      SELECT customer_email FROM orders
      WHERE customer_email IS NOT NULL AND customer_email != ''
      GROUP BY customer_email
    ) t
  `);
  let product_count = 0;
  try {
    const [[p]]: any = await pool.query(
      "SELECT COUNT(*) AS c FROM products WHERE active = 1 OR active IS NULL"
    );
    product_count = Number(p?.c || 0);
  } catch {
    try {
      const [[p]]: any = await pool.query("SELECT COUNT(*) AS c FROM products");
      product_count = Number(p?.c || 0);
    } catch {
      product_count = 0;
    }
  }

  return res.status(200).json({
    total_orders: Number(totals?.total_orders || 0),
    pending_orders: Number(totals?.pending_orders || 0),
    delivered_orders: Number(totals?.delivered_orders || 0),
    confirmed_revenue: Number(totals?.confirmed_revenue || 0),
    customer_count: Number(cust?.customer_count || 0),
    product_count,
  });
}

async function handleOrderDetail(res: NextApiResponse, orderId: string) {
  const [orderRows]: any = await pool.query("SELECT * FROM orders WHERE order_id = ? LIMIT 1", [
    orderId,
  ]);
  const order = Array.isArray(orderRows) && orderRows[0] ? orderRows[0] : null;
  if (!order) return res.status(404).json({ error: "Order not found" });

  const [items]: any = await pool.query(
    "SELECT id, product_id, product_name, price, quantity FROM order_items WHERE order_id = ? ORDER BY id ASC",
    [orderId]
  );

  return res.status(200).json({
    order,
    items: Array.isArray(items) ? items : [],
  });
}

async function handleCustomers(req: NextApiRequest, res: NextApiResponse) {
  const page = clampInt(req.query.page, 1, 100000, 1);
  const limit = clampInt(req.query.limit, 10, 100, 25);
  const offset = (page - 1) * limit;
  const q = String(req.query.q || "").trim().slice(0, 200);

  const where: string[] = [];
  const params: any[] = [];
  if (q) {
    const like = `%${q}%`;
    where.push("(customer_name LIKE ? OR customer_email LIKE ? OR customer_phone LIKE ?)");
    params.push(like, like, like);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [countRows]: any = await pool.query(
    `SELECT COUNT(*) AS total FROM (
       SELECT customer_email
       FROM orders
       ${whereSql}
       GROUP BY customer_email, customer_name, customer_phone
     ) t`,
    params
  );
  const total = Number(countRows?.[0]?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / limit) || 1);

  const [rows]: any = await pool.query(
    `SELECT customer_name, customer_email, customer_phone,
            COUNT(*) AS order_count,
            COALESCE(SUM(total), 0) AS total_spent,
            MIN(created_at) AS first_order,
            MAX(created_at) AS last_order
     FROM orders
     ${whereSql}
     GROUP BY customer_email, customer_name, customer_phone
     ORDER BY last_order DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return res.status(200).json({
    items: Array.isArray(rows) ? rows : [],
    pagination: { page, limit, total, totalPages },
  });
}

async function handleOrderList(req: NextApiRequest, res: NextApiResponse) {
  const parsed = parseOrderFilters(req.query);
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  const page = clampInt(req.query.page, 1, 100000, 1);
  const limit = clampInt(req.query.limit, 10, 100, 25);
  const offset = (page - 1) * limit;

  const { sql: whereSql, params } = buildOrderWhere(parsed.filters, "o");

  const [countRows]: any = await pool.query(
    `SELECT COUNT(*) AS total FROM orders o ${whereSql}`,
    params
  );
  const total = Number(countRows?.[0]?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / limit) || 1);

  const [idRows]: any = await pool.query(
    `SELECT o.order_id
     FROM orders o
     ${whereSql}
     ORDER BY o.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const orderIds = (Array.isArray(idRows) ? idRows : []).map((r: any) => String(r.order_id));

  let items: any[] = [];
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
    items = orderIds.map((id: string) => ({
      ...(byId[id] || { order_id: id }),
      items_list: itemsMap[id] || "",
    }));
  }

  return res.status(200).json({
    items,
    pagination: { page, limit, total, totalPages },
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === "GET") {
      if (req.query.customers === "1") {
        const custAdmin = await requireAdminPermission(req, res, "customers.view", {
          mutate: false,
        });
        if (!custAdmin) return;
        return handleCustomers(req, res);
      }

      const admin = await requireAdminPermission(req, res, "orders.view", { mutate: false });
      if (!admin) return;

      if (req.query.summary === "1") return handleSummary(res);

      const orderId = String(req.query.order_id || "").trim();
      if (orderId) return handleOrderDetail(res, orderId.slice(0, 64));

      return handleOrderList(req, res);
    }

    if (req.method === "PATCH") {
      const admin = await requireAdminPermission(req, res, "orders.manage");
      if (!admin) return;

      const { order_id, status } = req.body || {};
      if (!order_id) return res.status(400).json({ error: "order_id required" });
      const newStatus = String(status || "").toLowerCase();
      if (!(ORDER_STATUSES as readonly string[]).includes(newStatus)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      const [prevRows]: any = await pool.query(
        "SELECT order_id, status FROM orders WHERE order_id = ? LIMIT 1",
        [order_id]
      );
      const prev = Array.isArray(prevRows) && prevRows[0] ? prevRows[0] : null;
      if (!prev) return res.status(404).json({ error: "Order not found" });

      const oldStatus = String(prev.status || "");
      await pool.query("UPDATE orders SET status = ? WHERE order_id = ?", [newStatus, order_id]);

      const { ip } = getRequestMeta(req);
      await recordAdminAudit({
        actor: admin,
        action: "order.status_changed",
        entityType: "order",
        entityId: order_id,
        summary: `Order status ${oldStatus} → ${newStatus}`,
        metadata: { old_status: oldStatus, new_status: newStatus },
        ip,
      });

      return res.status(200).json({ success: true });
    }

    if (req.method === "DELETE") {
      const admin = await requireAdminPermission(req, res, "orders.manage");
      if (!admin) return;

      const { order_id } = req.body || {};
      if (!order_id) return res.status(400).json({ error: "order_id required" });

      const [orderRows]: any = await pool.query(
        "SELECT order_id, status, total FROM orders WHERE order_id=?",
        [order_id]
      );
      if (!orderRows.length) return res.status(404).json({ error: "Order not found" });
      const order = orderRows[0];

      await pool.query("DELETE FROM order_items WHERE order_id=?", [order_id]);
      await pool.query("DELETE FROM orders WHERE order_id=?", [order_id]);

      const { ip } = getRequestMeta(req);
      await recordAdminAudit({
        actor: admin,
        action: "order.deleted",
        entityType: "order",
        entityId: order_id,
        summary: `Deleted order ${order_id}`,
        metadata: { was_status: order.status },
        ip,
      });

      return res.status(200).json({
        success: true,
        deleted_order_id: order_id,
        reversed_amount: Number(order.total || 0),
        was_status: order.status,
      });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Orders request failed" });
  }
}
