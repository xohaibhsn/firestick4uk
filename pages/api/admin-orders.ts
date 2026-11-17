import type { NextApiRequest, NextApiResponse } from "next";
import pool from "../../lib/db";
import {
  getRequestMeta,
  requireAdminPermission,
  type AdminIdentity,
} from "../../lib/adminAuth";
import { recordAdminAudit } from "../../lib/adminAudit";
import { setAdminNoStore } from "../../lib/adminNoStore";
import {
  hasAdminPermission,
  type AdminRoleName,
} from "../../lib/adminPermissions";
import {
  ORDER_STATUSES,
  buildOrderWhere,
  clampInt,
  isCancelReason,
  itemsListForOrderIds,
  parseOrderFilters,
  type CancelReason,
} from "../../lib/adminOrdersQuery";

async function handleSummary(res: NextApiResponse, admin: AdminIdentity) {
  const [[totals]]: any = await pool.query(`
    SELECT
      COUNT(*) AS total_orders,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_orders,
      SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) AS delivered_orders,
      SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_orders,
      COALESCE(SUM(CASE WHEN status IN ('confirmed','dispatched','delivered') THEN total ELSE 0 END), 0) AS confirmed_revenue,
      COALESCE(SUM(CASE WHEN status = 'delivered' THEN total ELSE 0 END), 0) AS delivered_revenue,
      COALESCE(SUM(CASE WHEN status = 'pending' THEN total ELSE 0 END), 0) AS pending_value,
      COALESCE(SUM(CASE WHEN status = 'cancelled' THEN total ELSE 0 END), 0) AS cancelled_value
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

  // Additive count-only field for Sidhu sidebar badge — no lead PII.
  let leads_last_24: number | undefined;
  if (hasAdminPermission(admin.role as AdminRoleName, "leads.view")) {
    try {
      const [[leadRow]]: any = await pool.query(
        `SELECT COUNT(*) AS c FROM chat_leads
         WHERE created_at >= (NOW() - INTERVAL 24 HOUR)`
      );
      leads_last_24 = Number(leadRow?.c || 0);
    } catch {
      leads_last_24 = 0;
    }
  }

  return res.status(200).json({
    total_orders: Number(totals?.total_orders || 0),
    pending_orders: Number(totals?.pending_orders || 0),
    delivered_orders: Number(totals?.delivered_orders || 0),
    cancelled_orders: Number(totals?.cancelled_orders || 0),
    confirmed_revenue: Number(totals?.confirmed_revenue || 0),
    delivered_revenue: Number(totals?.delivered_revenue || 0),
    pending_value: Number(totals?.pending_value || 0),
    cancelled_value: Number(totals?.cancelled_value || 0),
    customer_count: Number(cust?.customer_count || 0),
    product_count,
    ...(leads_last_24 !== undefined ? { leads_last_24 } : {}),
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
      setAdminNoStore(res);
      if (req.query.customers === "1") {
        const custAdmin = await requireAdminPermission(req, res, "customers.view", {
          mutate: false,
        });
        if (!custAdmin) return;
        return handleCustomers(req, res);
      }

      const admin = await requireAdminPermission(req, res, "orders.view", { mutate: false });
      if (!admin) return;

      if (req.query.summary === "1") return handleSummary(res, admin);

      const orderId = String(req.query.order_id || "").trim();
      if (orderId) return handleOrderDetail(res, orderId.slice(0, 64));

      return handleOrderList(req, res);
    }

    if (req.method === "PATCH") {
      const admin = await requireAdminPermission(req, res, "orders.manage");
      if (!admin) return;

      const {
        order_id: rawOrderId,
        status,
        cancel_reason: rawCancelReason,
        base_status: rawBaseStatus,
      } = req.body || {};
      const order_id =
        typeof rawOrderId === "string"
          ? rawOrderId.trim()
          : typeof rawOrderId === "number"
            ? String(rawOrderId).trim()
            : "";
      if (!order_id || order_id.length > 64) {
        return res.status(400).json({ error: "order_id required" });
      }
      const newStatus = String(status || "").toLowerCase();
      if (!(ORDER_STATUSES as readonly string[]).includes(newStatus)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      let nextReason: CancelReason | null = null;
      if (newStatus === "cancelled") {
        const reasonCode = String(rawCancelReason || "").trim();
        if (!isCancelReason(reasonCode)) {
          return res.status(400).json({ error: "cancel_reason required" });
        }
        nextReason = reasonCode;
      }

      const baseStatusProvided =
        rawBaseStatus !== undefined &&
        rawBaseStatus !== null &&
        String(rawBaseStatus).trim() !== "";
      const expectedBaseStatus = baseStatusProvided
        ? String(rawBaseStatus).trim().toLowerCase()
        : null;

      const conn = await pool.getConnection();
      let oldStatus = "";
      let committedChange = false;
      try {
        await conn.beginTransaction();

        let prev: { order_id: string; status: unknown; cancel_reason: unknown } | null =
          null;
        try {
          const [prevRows]: any = await conn.query(
            "SELECT order_id, status, cancel_reason FROM orders WHERE order_id = ? FOR UPDATE",
            [order_id]
          );
          prev = Array.isArray(prevRows) && prevRows[0] ? prevRows[0] : null;
        } catch (error: any) {
          if (error?.code === "ER_BAD_FIELD_ERROR") {
            await conn.rollback();
            console.error(
              "[admin-orders] status change blocked",
              error?.code || error?.name || "Error"
            );
            return res.status(500).json({
              error: "Status could not be saved. Please contact the site admin.",
            });
          }
          throw error;
        }
        if (!prev) {
          await conn.rollback();
          return res.status(404).json({ error: "Order not found" });
        }

        oldStatus = String(prev.status || "");
        const oldReason =
          prev.cancel_reason == null || prev.cancel_reason === ""
            ? null
            : String(prev.cancel_reason);

        if (
          expectedBaseStatus != null &&
          expectedBaseStatus !== oldStatus.toLowerCase()
        ) {
          await conn.rollback();
          return res.status(409).json({
            error: "stale",
            current_status: oldStatus,
          });
        }

        if (
          oldStatus.toLowerCase() === newStatus &&
          oldReason === nextReason
        ) {
          await conn.commit();
          return res.status(200).json({ success: true, changed: 0 });
        }

        try {
          await conn.query(
            "UPDATE orders SET status = ?, cancel_reason = ? WHERE order_id = ?",
            [newStatus, nextReason, order_id]
          );
        } catch (error: any) {
          if (error?.code === "ER_BAD_FIELD_ERROR") {
            await conn.rollback();
            console.error(
              "[admin-orders] status change blocked",
              error?.code || error?.name || "Error"
            );
            return res.status(500).json({
              error: "Status could not be saved. Please contact the site admin.",
            });
          }
          throw error;
        }

        // Non-strict ENUM guard: MySQL may silently store '' when ENUM rejects the value.
        let storedStatus = "";
        let storedReason: string | null = null;
        try {
          const [checkRows]: any = await conn.query(
            "SELECT status, cancel_reason FROM orders WHERE order_id = ? LIMIT 1",
            [order_id]
          );
          const row = Array.isArray(checkRows) && checkRows[0] ? checkRows[0] : null;
          storedStatus = row ? String(row.status ?? "") : "";
          storedReason =
            row?.cancel_reason == null || row.cancel_reason === ""
              ? null
              : String(row.cancel_reason);
        } catch (error: any) {
          if (error?.code === "ER_BAD_FIELD_ERROR") {
            await conn.rollback();
            console.error(
              "[admin-orders] status change blocked",
              error?.code || error?.name || "Error"
            );
            return res.status(500).json({
              error: "Status could not be saved. Please contact the site admin.",
            });
          }
          throw error;
        }

        const reasonOk =
          newStatus === "cancelled"
            ? storedReason === nextReason
            : storedReason == null;
        if (storedStatus !== newStatus || !reasonOk) {
          await conn.rollback();
          const { ip } = getRequestMeta(req);
          await recordAdminAudit({
            actor: admin,
            action: "order.status_change_failed",
            entityType: "order",
            entityId: order_id,
            summary: `Order status change failed ${oldStatus} → ${newStatus}`,
            metadata: {
              old_status: oldStatus,
              requested_status: newStatus,
              stored_status: storedStatus,
              requested_cancel_reason: nextReason,
              stored_cancel_reason: storedReason,
            },
            ip,
          });
          console.error("[admin-orders] status mismatch after update", "ER_ENUM_GUARD");
          return res.status(500).json({
            error: "Status could not be saved. Please contact the site admin.",
          });
        }

        await conn.commit();
        committedChange = true;
      } catch (txErr) {
        try {
          await conn.rollback();
        } catch {
          /* ignore */
        }
        throw txErr;
      } finally {
        conn.release();
      }

      if (!committedChange) {
        return res.status(500).json({
          error: "Status could not be saved. Please contact the site admin.",
        });
      }

      const { ip } = getRequestMeta(req);
      await recordAdminAudit({
        actor: admin,
        action: "order.status_changed",
        entityType: "order",
        entityId: order_id,
        summary:
          newStatus === "cancelled"
            ? `Order status ${oldStatus} → ${newStatus} (${nextReason})`
            : `Order status ${oldStatus} → ${newStatus}`,
        metadata: {
          old_status: oldStatus,
          new_status: newStatus,
          ...(nextReason ? { cancel_reason: nextReason } : { cancel_reason: null }),
        },
        ip,
      });

      return res.status(200).json({ success: true });
    }

    if (req.method === "DELETE") {
      const admin = await requireAdminPermission(req, res, "orders.manage");
      if (!admin) return;

      const rawOrderId = (req.body || {}).order_id;
      const order_id =
        typeof rawOrderId === "string"
          ? rawOrderId.trim()
          : typeof rawOrderId === "number"
            ? String(rawOrderId).trim()
            : "";
      if (!order_id || order_id.length > 64) {
        return res.status(400).json({ error: "order_id required" });
      }

      const conn = await pool.getConnection();
      let order: { order_id: string; status: unknown; total: unknown };
      let itemsDeleted = 0;
      try {
        await conn.beginTransaction();
        const [orderRows]: any = await conn.query(
          "SELECT order_id, status, total FROM orders WHERE order_id=? FOR UPDATE",
          [order_id]
        );
        if (!orderRows.length) {
          await conn.rollback();
          return res.status(404).json({ error: "Order not found" });
        }
        order = orderRows[0];

        const [itemsResult]: any = await conn.query(
          "DELETE FROM order_items WHERE order_id=?",
          [order_id]
        );
        itemsDeleted = Number(itemsResult?.affectedRows || 0);
        await conn.query("DELETE FROM orders WHERE order_id=?", [order_id]);
        await conn.query("DELETE FROM order_idempotency_keys WHERE order_id=?", [
          order_id,
        ]);
        await conn.commit();
      } catch (txErr) {
        try {
          await conn.rollback();
        } catch {
          /* ignore */
        }
        throw txErr;
      } finally {
        conn.release();
      }

      const { ip } = getRequestMeta(req);
      await recordAdminAudit({
        actor: admin,
        action: "order.deleted",
        entityType: "order",
        entityId: order_id,
        summary: `Deleted order ${order_id}`,
        metadata: { was_status: order.status, items_deleted: itemsDeleted },
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
    const errCode = typeof error?.code === "string" ? error.code : undefined;
    const errName = typeof error?.name === "string" ? error.name : "Error";
    console.error("[admin-orders] failed", errCode || errName);
    return res.status(500).json({ error: "Request failed" });
  }
}
