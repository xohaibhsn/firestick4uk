/**
 * F4UK-MULTI-142 / MULTI-150 — Admin-only shared draft API (Draft/Publish D2 + D4).
 * Never writes site_content or products (except reading product id existence).
 * Publishing remains POST /api/site-content (pages) or PUT /api/admin-products (products).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import pool from "../../lib/db";
import { getRequestMeta, requireAdminPermission } from "../../lib/adminAuth";
import type { AdminPermission } from "../../lib/adminPermissions";
import { recordAdminAudit } from "../../lib/adminAudit";
import { setAdminNoStore } from "../../lib/adminNoStore";
import {
  draftRowToDto,
  draftRowToSummary,
  loadKnownKeys,
  validateDraftChanges,
  validateDraftChangesEarly,
  validateEntity,
  validateEntityTypeOnly,
  validateProductDraft,
  type ContentDraftRow,
  type DraftChanges,
  type DraftEntityType,
  type ProductDraftChanges,
} from "../../lib/contentDrafts";
import {
  contentDraftsTableAvailable,
} from "../../lib/contentDraftsCapability";

const SELECT_COLS =
  "entity_type, entity_id, draft_json, draft_version, created_by_name, updated_by_name, created_at, updated_at";

function qOne(v: unknown): string {
  if (Array.isArray(v)) return String(v[0] ?? "");
  return v == null ? "" : String(v);
}

function actorName(admin: { name?: string }): string {
  return String(admin.name || "Admin").slice(0, 255);
}

function actorStaffId(admin: { staffId?: number }): number | null {
  return admin.staffId != null && Number(admin.staffId) > 0 ? Number(admin.staffId) : null;
}

function permissionForEntity(entityType: DraftEntityType): AdminPermission {
  return entityType === "product" ? "products.manage" : "content.manage";
}

function productFieldNames(changes: ProductDraftChanges): string[] {
  return Object.keys(changes.fields || {});
}

function auditKeysFromDraftJson(
  entityType: DraftEntityType,
  draftJson: string
): string[] {
  try {
    const parsed = JSON.parse(String(draftJson || "{}"));
    if (entityType === "product") {
      const fields =
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed) &&
        parsed.fields &&
        typeof parsed.fields === "object" &&
        !Array.isArray(parsed.fields)
          ? parsed.fields
          : {};
      return Object.keys(fields);
    }
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return Object.keys(parsed as DraftChanges);
    }
  } catch {
    /* ignore */
  }
  return [];
}

async function safeRollback(conn: { rollback: () => Promise<void> }): Promise<void> {
  try {
    await conn.rollback();
  } catch {
    /* swallow */
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const method = String(req.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "PUT" && method !== "DELETE") {
    res.setHeader("Allow", "GET, PUT, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Entity type first (query for GET, body for PUT/DELETE) — invalid → 400 before auth.
  const entityTypeRaw =
    method === "GET"
      ? qOne(req.query.entity_type)
      : String(((req.body || {}) as Record<string, unknown>).entity_type ?? "");
  const typeOnly = validateEntityTypeOnly(entityTypeRaw);
  if (!typeOnly.ok) {
    return res.status(400).json({
      error: typeOnly.errors[0]?.message || "Invalid entity",
      code: typeOnly.errors[0]?.code || "invalid_entity",
      details: typeOnly.errors,
    });
  }

  const admin = await requireAdminPermission(
    req,
    res,
    permissionForEntity(typeOnly.entity_type),
    { mutate: method !== "GET" }
  );
  if (!admin) return;

  setAdminNoStore(res);

  try {
    const available = await contentDraftsTableAvailable(pool);
    if (!available) {
      if (method === "GET") {
        return res.status(200).json({ available: false, draft: null, drafts: [] });
      }
      return res.status(503).json({
        error: "Drafts are not available",
        code: "drafts_unavailable",
      });
    }

    if (method === "GET") {
      const entityIdRaw = qOne(req.query.entity_id).trim();

      if (entityIdRaw) {
        const entity = validateEntity(entityTypeRaw, entityIdRaw);
        if (!entity.ok) {
          return res.status(400).json({
            error: entity.errors[0]?.message || "Invalid entity",
            code: entity.errors[0]?.code || "invalid_entity",
            details: entity.errors,
          });
        }
        const [rows] = await pool.query<RowDataPacket[]>(
          `SELECT ${SELECT_COLS} FROM content_drafts WHERE entity_type = ? AND entity_id = ? LIMIT 1`,
          [entity.entity_type, entity.entity_id]
        );
        const row = Array.isArray(rows) && rows[0] ? (rows[0] as ContentDraftRow) : null;
        return res.status(200).json({
          available: true,
          draft: row ? draftRowToDto(row) : null,
        });
      }

      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT ${SELECT_COLS} FROM content_drafts WHERE entity_type = ? ORDER BY updated_at DESC LIMIT 100`,
        [typeOnly.entity_type]
      );
      const drafts = Array.isArray(rows)
        ? rows.map((r) => draftRowToSummary(r as ContentDraftRow))
        : [];
      return res.status(200).json({ available: true, drafts });
    }

    const body = (req.body || {}) as Record<string, unknown>;
    const entity = validateEntity(body.entity_type, body.entity_id);
    if (!entity.ok) {
      return res.status(400).json({
        error: entity.errors[0]?.message || "Invalid entity",
        code: entity.errors[0]?.code || "invalid_entity",
        details: entity.errors,
      });
    }

    const { ip } = getRequestMeta(req);
    const isProduct = entity.entity_type === "product";

    if (method === "PUT") {
      const expectedRaw = body.expected_draft_version;
      const isCreate = expectedRaw === null;
      const expectedVersion =
        typeof expectedRaw === "number" && Number.isFinite(expectedRaw)
          ? Math.floor(expectedRaw)
          : null;
      if (!isCreate && expectedVersion === null) {
        return res.status(400).json({
          error: "expected_draft_version must be null (create) or a number (update).",
          code: "invalid_version",
        });
      }

      // Product: validate shape before any DB work.
      let productValidated: ProductDraftChanges | null = null;
      let pageEarlyKeys: string[] | null = null;
      if (isProduct) {
        const validated = validateProductDraft(body.changes);
        if (!validated.ok) {
          return res.status(400).json({
            error: validated.errors[0]?.message || "Invalid draft",
            code: validated.errors[0]?.code || "invalid_value",
            details: validated.errors,
          });
        }
        productValidated = validated.changes;
      } else {
        // N1: reject non-object / >200 keys before any site_content query.
        const early = validateDraftChangesEarly(body.changes);
        if (!early.ok) {
          return res.status(400).json({
            error: early.errors[0]?.message || "Invalid draft",
            code: early.errors[0]?.code || "empty_draft",
            details: early.errors,
          });
        }
        pageEarlyKeys = early.keys;
      }

      const conn = await pool.getConnection();
      let dtoOut: ReturnType<typeof draftRowToDto> | null = null;
      let auditVersion = 0;
      let auditKeys: string[] = [];
      try {
        let draftJson: string;

        if (isProduct && productValidated) {
          const [prows] = await conn.query<RowDataPacket[]>(
            `SELECT id FROM products WHERE id = ? LIMIT 1`,
            [entity.entity_id]
          );
          if (!Array.isArray(prows) || !prows[0]) {
            return res.status(404).json({
              error: "Product not found.",
              code: "product_missing",
            });
          }
          draftJson = JSON.stringify(productValidated);
          auditKeys = productFieldNames(productValidated);
        } else {
          const changeKeys = pageEarlyKeys || [];
          const knownKeys = await loadKnownKeys(conn, changeKeys);
          const validated = validateDraftChanges(body.changes, { knownKeys });
          if (!validated.ok) {
            return res.status(400).json({
              error: validated.errors[0]?.message || "Invalid draft",
              code: validated.errors[0]?.code || "empty_draft",
              details: validated.errors,
            });
          }
          draftJson = JSON.stringify(validated.changes);
          auditKeys = Object.keys(validated.changes);
        }

        const name = actorName(admin);
        const staffId = actorStaffId(admin);

        if (isCreate) {
          try {
            await conn.query<ResultSetHeader>(
              `INSERT INTO content_drafts
                (entity_type, entity_id, draft_json, draft_version,
                 created_by_name, created_by_staff_id, updated_by_name, updated_by_staff_id)
               VALUES (?, ?, ?, 1, ?, ?, ?, ?)`,
              [
                entity.entity_type,
                entity.entity_id,
                draftJson,
                name,
                staffId,
                name,
                staffId,
              ]
            );
          } catch (insErr: unknown) {
            const code =
              typeof (insErr as { code?: string })?.code === "string"
                ? (insErr as { code: string }).code
                : "";
            if (code === "ER_DUP_ENTRY") {
              return res.status(409).json({
                error: isProduct
                  ? "A draft for this product already exists - reload it first."
                  : "A draft for this page already exists - reload it first.",
                code: "draft_exists",
              });
            }
            throw insErr;
          }
          auditVersion = 1;
          const [rows] = await conn.query<RowDataPacket[]>(
            `SELECT ${SELECT_COLS} FROM content_drafts WHERE entity_type = ? AND entity_id = ? LIMIT 1`,
            [entity.entity_type, entity.entity_id]
          );
          const row = Array.isArray(rows) && rows[0] ? (rows[0] as ContentDraftRow) : null;
          if (!row) throw new Error("draft insert missing row");
          dtoOut = draftRowToDto(row);
        } else {
          await conn.beginTransaction();
          const [existingRows] = await conn.query<RowDataPacket[]>(
            `SELECT ${SELECT_COLS} FROM content_drafts WHERE entity_type = ? AND entity_id = ? LIMIT 1 FOR UPDATE`,
            [entity.entity_type, entity.entity_id]
          );
          const existing =
            Array.isArray(existingRows) && existingRows[0]
              ? (existingRows[0] as ContentDraftRow)
              : null;
          if (!existing) {
            await safeRollback(conn);
            return res.status(409).json({
              error: "Draft not found - create it first.",
              code: "draft_missing",
            });
          }
          if (Number(existing.draft_version) !== expectedVersion) {
            await safeRollback(conn);
            return res.status(409).json({
              error: "This draft was changed by someone else - reload it first.",
              code: "draft_stale",
              current_version: Number(existing.draft_version),
              updated_by_name: String(existing.updated_by_name || ""),
              updated_at:
                existing.updated_at instanceof Date
                  ? existing.updated_at.toISOString()
                  : String(existing.updated_at),
            });
          }
          await conn.query(
            `UPDATE content_drafts
             SET draft_json = ?, draft_version = draft_version + 1,
                 updated_by_name = ?, updated_by_staff_id = ?
             WHERE entity_type = ? AND entity_id = ?`,
            [draftJson, name, staffId, entity.entity_type, entity.entity_id]
          );
          await conn.commit();
          auditVersion = Number(existing.draft_version) + 1;
          const [rows] = await conn.query<RowDataPacket[]>(
            `SELECT ${SELECT_COLS} FROM content_drafts WHERE entity_type = ? AND entity_id = ? LIMIT 1`,
            [entity.entity_type, entity.entity_id]
          );
          const row = Array.isArray(rows) && rows[0] ? (rows[0] as ContentDraftRow) : null;
          if (!row) throw new Error("draft update missing row");
          dtoOut = draftRowToDto(row);
        }
      } catch (err) {
        await safeRollback(conn);
        throw err;
      } finally {
        conn.release();
      }

      await recordAdminAudit({
        actor: admin,
        action: "content_draft.save",
        entityType: "content_draft",
        entityId: `${entity.entity_type}:${entity.entity_id}`,
        summary: `Saved draft for ${entity.entity_type}/${entity.entity_id}`,
        metadata: { keys: auditKeys, draft_version: auditVersion },
        ip,
      });
      return res.status(200).json({ success: true, draft: dtoOut });
    }

    // DELETE
    const expectedRaw = body.expected_draft_version;
    if (typeof expectedRaw !== "number" || !Number.isFinite(expectedRaw)) {
      return res.status(400).json({
        error: "expected_draft_version is required.",
        code: "invalid_version",
      });
    }
    const expectedVersion = Math.floor(expectedRaw);

    const conn = await pool.getConnection();
    let auditVersion = expectedVersion;
    let auditKeys: string[] = [];
    try {
      await conn.beginTransaction();
      const [existingRows] = await conn.query<RowDataPacket[]>(
        `SELECT ${SELECT_COLS} FROM content_drafts WHERE entity_type = ? AND entity_id = ? LIMIT 1 FOR UPDATE`,
        [entity.entity_type, entity.entity_id]
      );
      const existing =
        Array.isArray(existingRows) && existingRows[0]
          ? (existingRows[0] as ContentDraftRow)
          : null;
      if (!existing) {
        await safeRollback(conn);
        return res.status(404).json({
          error: "Draft not found.",
          code: "draft_missing",
        });
      }
      if (Number(existing.draft_version) !== expectedVersion) {
        await safeRollback(conn);
        return res.status(409).json({
          error: "This draft was changed by someone else - reload it first.",
          code: "draft_stale",
          current_version: Number(existing.draft_version),
          updated_by_name: String(existing.updated_by_name || ""),
          updated_at:
            existing.updated_at instanceof Date
              ? existing.updated_at.toISOString()
              : String(existing.updated_at),
        });
      }
      auditKeys = auditKeysFromDraftJson(
        entity.entity_type,
        String(existing.draft_json || "{}")
      );
      auditVersion = Number(existing.draft_version);
      await conn.query(
        `DELETE FROM content_drafts WHERE entity_type = ? AND entity_id = ?`,
        [entity.entity_type, entity.entity_id]
      );
      await conn.commit();
    } catch (err) {
      await safeRollback(conn);
      throw err;
    } finally {
      conn.release();
    }

    await recordAdminAudit({
      actor: admin,
      action: "content_draft.discard",
      entityType: "content_draft",
      entityId: `${entity.entity_type}:${entity.entity_id}`,
      summary: `Discarded draft for ${entity.entity_type}/${entity.entity_id}`,
      metadata: { keys: auditKeys, draft_version: auditVersion },
      ip,
    });
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("[admin-drafts]", err instanceof Error ? err.message : "error");
    return res.status(500).json({ error: "Draft request failed" });
  }
}
