import type { NextApiRequest, NextApiResponse } from "next";
import pool from "../../lib/db";
import { requireAdminPermission } from "../../lib/adminAuth";

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

/** Super Admin only — paginated admin activity log. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const admin = await requireAdminPermission(req, res, "audit.view", { mutate: false });
  if (!admin) return;

  try {
    const page = clampInt(req.query.page, 1, 100000, 1);
    const limit = clampInt(req.query.limit, 10, 100, 50);
    const offset = (page - 1) * limit;

    const action = String(req.query.action || "").trim().slice(0, 100);
    const entityType = String(req.query.entity_type || "").trim().slice(0, 100);
    const actor = String(req.query.actor || "").trim().slice(0, 255);
    const dateFrom = String(req.query.date_from || "").trim();
    const dateTo = String(req.query.date_to || "").trim();
    const q = String(req.query.q || "").trim().slice(0, 200);

    const where: string[] = [];
    const params: any[] = [];

    if (action) {
      where.push("action = ?");
      params.push(action);
    }
    if (entityType) {
      where.push("entity_type = ?");
      params.push(entityType);
    }
    if (actor) {
      where.push("actor_name LIKE ?");
      params.push(`%${actor}%`);
    }
    if (/^\d{4}-\d{2}-\d{2}/.test(dateFrom)) {
      where.push("created_at >= ?");
      params.push(`${dateFrom.slice(0, 10)} 00:00:00`);
    }
    if (/^\d{4}-\d{2}-\d{2}/.test(dateTo)) {
      where.push("created_at <= ?");
      params.push(`${dateTo.slice(0, 10)} 23:59:59`);
    }
    if (q) {
      where.push("(actor_name LIKE ? OR summary LIKE ? OR entity_id LIKE ? OR action LIKE ?)");
      const like = `%${q}%`;
      params.push(like, like, like, like);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const [countRows]: any = await pool.query(
      `SELECT COUNT(*) AS total FROM admin_audit_log ${whereSql}`,
      params
    );
    const total = Number(countRows?.[0]?.total || 0);
    const totalPages = Math.max(1, Math.ceil(total / limit));

    const [rows]: any = await pool.query(
      `SELECT id, actor_type, actor_staff_id, actor_name, actor_role, action, entity_type, entity_id,
              summary, metadata_json, ip_address, created_at
       FROM admin_audit_log
       ${whereSql}
       ORDER BY created_at DESC, id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const items = (Array.isArray(rows) ? rows : []).map((r: any) => {
      let metadata: any = null;
      if (r.metadata_json) {
        try {
          metadata = JSON.parse(r.metadata_json);
        } catch {
          metadata = null;
        }
      }
      return {
        id: Number(r.id),
        actorType: r.actor_type,
        actorStaffId: r.actor_staff_id != null ? Number(r.actor_staff_id) : null,
        actorName: r.actor_name,
        actorRole: r.actor_role,
        action: r.action,
        entityType: r.entity_type,
        entityId: r.entity_id,
        summary: r.summary,
        metadata,
        ipAddress: r.ip_address,
        createdAt: r.created_at,
      };
    });

    return res.status(200).json({
      items,
      pagination: { page, limit, total, totalPages },
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Audit fetch failed" });
  }
}
