import type { NextApiRequest, NextApiResponse } from "next";
import pool from "../../lib/db";
import { requireAdminPermission } from "../../lib/adminAuth";
import {
  canViewRevisionEntity,
  getRevisionById,
  parseChangedFields,
  parseSnapshot,
  revisionEntityTypesForRole,
} from "../../lib/contentRevisions";

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

/** List or detail CMS content revisions — metadata by default; snapshot only for ?id=. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const admin = await requireAdminPermission(req, res, "revisions.view", { mutate: false });
  if (!admin) return;

  try {
    const detailId = Number(req.query.id);
    if (req.query.id != null && String(req.query.id).trim() !== "") {
      if (!Number.isFinite(detailId) || detailId <= 0) {
        return res.status(400).json({ error: "Invalid revision id" });
      }
      const row = await getRevisionById(detailId);
      if (!row) return res.status(404).json({ error: "Revision not found" });
      if (!canViewRevisionEntity(admin.role, row.entity_type)) {
        return res.status(403).json({
          error: "Forbidden",
          message: "You do not have permission for this action.",
        });
      }
      let snapshot: unknown = null;
      try {
        snapshot = parseSnapshot(row.snapshot_json);
      } catch {
        snapshot = null;
      }
      return res.status(200).json({
        id: row.id,
        entity_type: row.entity_type,
        entity_id: row.entity_id,
        entity_label: row.entity_label,
        revision_action: row.revision_action,
        changed_fields: parseChangedFields(row.changed_fields_json),
        actor_name: row.actor_name,
        actor_role: row.actor_role,
        created_at: row.created_at,
        snapshot,
        restore_supported:
          row.revision_action !== "delete" ||
          row.entity_type === "site_content" ||
          row.entity_type === "site_settings",
      });
    }

    const allowed = revisionEntityTypesForRole(admin.role);
    const page = clampInt(req.query.page, 1, 100000, 1);
    const limit = clampInt(req.query.limit, 10, 100, 25);
    const offset = (page - 1) * limit;
    const entityType = String(req.query.entity_type || "").trim();
    const entityId = String(req.query.entity_id || "").trim().slice(0, 191);
    const action = String(req.query.action || "").trim().slice(0, 30);
    const q = String(req.query.q || "").trim().slice(0, 180);

    if (entityType) {
      if (!allowed.includes(entityType as any)) {
        return res.status(403).json({
          error: "Forbidden",
          message: "You do not have permission for this action.",
        });
      }
    }

    const types = entityType ? [entityType] : allowed;
    if (!types.length) {
      return res.status(200).json({
        items: [],
        pagination: { page, limit, total: 0, totalPages: 1 },
      });
    }

    const where: string[] = [`entity_type IN (${types.map(() => "?").join(",")})`];
    const params: any[] = [...types];

    if (entityId) {
      where.push("entity_id = ?");
      params.push(entityId);
    }
    if (action) {
      where.push("revision_action = ?");
      params.push(action);
    }
    if (q) {
      where.push("entity_label LIKE ?");
      params.push(`%${q}%`);
    }

    const whereSql = `WHERE ${where.join(" AND ")}`;
    const [countRows]: any = await pool.query(
      `SELECT COUNT(*) AS total FROM content_revisions ${whereSql}`,
      params
    );
    const total = Number(countRows?.[0]?.total || 0);
    const totalPages = Math.max(1, Math.ceil(total / limit));

    const [rows]: any = await pool.query(
      `SELECT id, entity_type, entity_id, entity_label, revision_action, changed_fields_json,
              actor_name, actor_role, created_at
       FROM content_revisions
       ${whereSql}
       ORDER BY created_at DESC, id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const items = (Array.isArray(rows) ? rows : []).map((r: any) => ({
      id: r.id,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      entity_label: r.entity_label,
      revision_action: r.revision_action,
      changed_fields: parseChangedFields(r.changed_fields_json),
      actor_name: r.actor_name,
      actor_role: r.actor_role,
      created_at: r.created_at,
    }));

    return res.status(200).json({
      items,
      pagination: { page, limit, total, totalPages },
      meta: { allowedEntityTypes: allowed },
    });
  } catch (err: any) {
    console.error("[admin-revisions]", err?.message || err);
    return res.status(500).json({ error: "Failed to load revisions" });
  }
}
