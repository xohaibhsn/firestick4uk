import type { NextApiRequest, NextApiResponse } from "next";
import pool from "@/lib/db";
import { getRequestMeta, requireAdminPermission } from "@/lib/adminAuth";
import { recordAdminAudit } from "@/lib/adminAudit";
import { setAdminNoStore } from "@/lib/adminNoStore";
import { leadsHandledColumnAvailable } from "@/lib/leadsHandledCapability";
import { clampInt } from "@/lib/adminOrdersQuery";

const Q_MIN = 2;
const Q_MAX = 80;

function escapeLike(raw: string): string {
  return raw.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function clampQuery(raw: unknown): string | null | undefined {
  if (raw == null || String(raw).trim() === "") return undefined;
  const q = String(raw).trim();
  if (q.length < Q_MIN || q.length > Q_MAX) return null;
  return q;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") setAdminNoStore(res);

  const isStatusMutation = req.method === "PATCH" || req.method === "PUT";
  const admin = await requireAdminPermission(
    req,
    res,
    req.method === "GET" ? "leads.view" : "leads.manage",
    req.method === "GET" ? { mutate: false } : undefined
  );
  if (!admin) return;

  try {
    const handledAvailable = await leadsHandledColumnAvailable(pool);

    if (req.method === "GET") {
      const q = clampQuery(req.query.q);
      if (q === null) {
        return res.status(400).json({
          error: `Query must be ${Q_MIN}–${Q_MAX} characters`,
        });
      }

      const statusRaw = String(req.query.status || "all").trim().toLowerCase();
      let statusFilter: "open" | "handled" | "all" = "all";
      if (statusRaw === "open" || statusRaw === "handled" || statusRaw === "all") {
        statusFilter = statusRaw;
      } else if (statusRaw) {
        return res.status(400).json({ error: "Invalid status" });
      }

      const page = clampInt(req.query.page, 1, 10_000, 1);
      const limit = clampInt(req.query.limit, 1, 200, 50);
      const offset = (page - 1) * limit;
      // Existing clients omit page/limit → return full list (compat). Paginate only when asked.
      const paginate = req.query.page != null || req.query.limit != null;

      const where: string[] = [];
      const params: any[] = [];

      if (q) {
        const like = `%${escapeLike(q)}%`;
        where.push(
          `(customer_name LIKE ? ESCAPE '\\\\' OR customer_email LIKE ? ESCAPE '\\\\' OR customer_whatsapp LIKE ? ESCAPE '\\\\' OR chat_history LIKE ? ESCAPE '\\\\' OR interested_in LIKE ? ESCAPE '\\\\')`
        );
        params.push(like, like, like, like, like);
      }

      if (handledAvailable && statusFilter === "open") {
        where.push("handled = 0");
      } else if (handledAvailable && statusFilter === "handled") {
        where.push("handled = 1");
      } else if (!handledAvailable && statusFilter !== "all") {
        // Column absent: status filter is inert (treat as all).
      }

      const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
      const selectCols = handledAvailable
        ? "id, customer_name, customer_whatsapp, customer_email, interested_in, chat_history, ip_address, created_at, handled, handled_at"
        : "id, customer_name, customer_whatsapp, customer_email, interested_in, chat_history, ip_address, created_at";

      const [countRows]: any = await pool.query(
        `SELECT COUNT(*) AS c FROM chat_leads ${whereSql}`,
        params
      );
      const total = Number(countRows?.[0]?.c || 0);

      let rows: any[];
      if (paginate) {
        const [pageRows]: any = await pool.query(
          `SELECT ${selectCols} FROM chat_leads ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
          [...params, limit, offset]
        );
        rows = Array.isArray(pageRows) ? pageRows : [];
      } else {
        const [allRows]: any = await pool.query(
          `SELECT ${selectCols} FROM chat_leads ${whereSql} ORDER BY created_at DESC`,
          params
        );
        rows = Array.isArray(allRows) ? allRows : [];
      }

      return res.status(200).json({
        leads: rows,
        total: paginate ? total : rows.length,
        page: paginate ? page : 1,
        limit: paginate ? limit : rows.length,
        handled_available: handledAvailable,
      });
    }

    if (isStatusMutation) {
      if (!handledAvailable) {
        return res.status(404).json({ error: "Handled status not available" });
      }
      const id = Number(req.body?.id ?? req.query.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: "id required" });
      }
      const handledRaw = req.body?.handled;
      const handled =
        handledRaw === true ||
        handledRaw === 1 ||
        handledRaw === "1" ||
        String(handledRaw).toLowerCase() === "true";
      const open =
        handledRaw === false ||
        handledRaw === 0 ||
        handledRaw === "0" ||
        String(handledRaw).toLowerCase() === "false";
      if (!handled && !open) {
        return res.status(400).json({ error: "handled required" });
      }
      const next = handled ? 1 : 0;
      await pool.query(
        `UPDATE chat_leads
         SET handled = ?, handled_at = IF(? = 1, UTC_TIMESTAMP(), NULL)
         WHERE id = ?`,
        [next, next, id]
      );
      const { ip } = getRequestMeta(req);
      await recordAdminAudit({
        actor: admin,
        action: "lead.status_changed",
        entityType: "lead",
        entityId: id,
        summary: next ? `Marked lead ${id} handled` : `Marked lead ${id} open`,
        metadata: { handled: next },
        ip,
      });
      return res.status(200).json({ success: true, id, handled: next });
    }

    if (req.method === "DELETE") {
      if (Array.isArray(req.body?.ids)) {
        const rawIds = req.body.ids as unknown[];
        if (rawIds.length > 500) {
          return res.status(400).json({ error: "invalid_ids" });
        }
        const ids: number[] = [];
        for (const value of rawIds) {
          const n = Number(value);
          if (!Number.isInteger(n) || n <= 0) {
            return res.status(400).json({ error: "invalid_ids" });
          }
          ids.push(n);
        }
        if (ids.length > 0) {
          const placeholders = ids.map(() => "?").join(",");
          const [delResult]: any = await pool.query(
            `DELETE FROM chat_leads WHERE id IN (${placeholders})`,
            ids
          );
          const deleted = Number(delResult?.affectedRows) || 0;
          const { ip } = getRequestMeta(req);
          await recordAdminAudit({
            actor: admin,
            action: "lead.bulk_deleted",
            entityType: "lead",
            entityId: null,
            summary: `Bulk deleted ${deleted} lead(s)`,
            metadata: { count: deleted },
            ip,
          });
          return res.status(200).json({ success: true, deleted });
        }
      }

      const id = Number(req.query.id || req.body?.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: "id required" });
      }
      const [delResult]: any = await pool.query("DELETE FROM chat_leads WHERE id=?", [id]);
      if (!delResult || Number(delResult.affectedRows) === 0) {
        return res.status(404).json({ error: "not_found" });
      }
      const { ip } = getRequestMeta(req);
      await recordAdminAudit({
        actor: admin,
        action: "lead.deleted",
        entityType: "lead",
        entityId: id,
        summary: `Deleted lead ${id}`,
        ip,
      });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error: unknown) {
    const err = error as { code?: string; name?: string };
    const errCode = typeof err?.code === "string" ? err.code : undefined;
    const errName = typeof err?.name === "string" ? err.name : "Error";
    console.error("[admin/leads] failed", errCode || errName);
    return res.status(500).json({ error: "Request failed" });
  }
}
