/**
 * Admin customer-review moderation — list / approve / reject / edit / delete.
 * Permission: reviews.manage. No runtime DDL. Never returns text_hash.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import pool from "../../lib/db";
import {
  getRequestMeta,
  requireAdminPermission,
} from "../../lib/adminAuth";
import { recordAdminAudit } from "../../lib/adminAudit";
import { setAdminNoStore } from "../../lib/adminNoStore";
import { validateReviewFields } from "../../lib/customerReviews";
import { reviewTextHash } from "../../lib/customerReviewsHash";
import { clearPublicReviewsCache } from "../../lib/customerReviewsServer";
import { reviewModerationBaseHash } from "../../lib/reviewModerationHash";

const PAGE_SIZE = 20;

const ADMIN_SELECT = `id, status, display_name, rating, review_text, original_text,
  product_id, order_id, is_verified, consent_at, created_at,
  moderated_at, moderated_by, edited_at, edit_note`;

function mysqlNow3(): string {
  const d = new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    ` ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}` +
    `.${pad(d.getUTCMilliseconds(), 3)}`
  );
}

function parseId(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

function withAdminReviewBaseHash<T extends Record<string, unknown>>(
  row: T
): T & { base_hash: string } {
  return { ...row, base_hash: reviewModerationBaseHash(row) };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === "GET") {
      setAdminNoStore(res);
      const admin = await requireAdminPermission(req, res, "reviews.manage", {
        mutate: false,
      });
      if (!admin) return;

      const statusRaw = String(req.query.status || "pending").trim().toLowerCase();
      const status =
        statusRaw === "approved" ||
        statusRaw === "rejected" ||
        statusRaw === "all" ||
        statusRaw === "pending"
          ? statusRaw
          : "pending";
      const page = Math.max(1, Math.trunc(Number(req.query.page) || 1));
      const offset = (page - 1) * PAGE_SIZE;

      const where =
        status === "all" ? "1=1" : "status = ?";
      const params: unknown[] = status === "all" ? [] : [status];

      const [countRows]: any = await pool.query(
        `SELECT COUNT(*) AS c FROM customer_reviews WHERE ${where}`,
        params
      );
      const total = Number(countRows?.[0]?.c || 0);

      const [rows]: any = await pool.query(
        `SELECT ${ADMIN_SELECT}
         FROM customer_reviews
         WHERE ${where}
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, PAGE_SIZE, offset]
      );

      const items = (Array.isArray(rows) ? rows : []).map((row: any) =>
        withAdminReviewBaseHash(row as Record<string, unknown>)
      );

      return res.status(200).json({
        items,
        total,
        page,
        pageSize: PAGE_SIZE,
      });
    }

    if (req.method === "PATCH") {
      const admin = await requireAdminPermission(req, res, "reviews.manage");
      if (!admin) return;
      setAdminNoStore(res);

      const body = (req.body || {}) as Record<string, unknown>;
      const id = parseId(body.id);
      if (!id) return res.status(400).json({ error: "id required" });

      const action = String(body.action || "").trim().toLowerCase();
      if (!["approve", "reject", "edit"].includes(action)) {
        return res.status(400).json({ error: "Invalid action" });
      }

      const { ip } = getRequestMeta(req);
      const now = mysqlNow3();
      const moderator = String(admin.name || "Admin").slice(0, 100);

      const conn = await pool.getConnection();
      let responsePayload: Record<string, unknown> | null = null;
      let auditAction: string | null = null;
      let auditSummary: string | null = null;
      let auditMetadata: Record<string, unknown> | undefined;
      try {
        await conn.beginTransaction();
        const [existingRows]: any = await conn.query(
          `SELECT ${ADMIN_SELECT} FROM customer_reviews WHERE id = ? LIMIT 1 FOR UPDATE`,
          [id]
        );
        const existing = Array.isArray(existingRows) ? existingRows[0] : null;
        if (!existing) {
          await conn.rollback();
          return res.status(404).json({ error: "Not found" });
        }

        if (action === "approve" || action === "reject") {
          const expectedStatus = body.expected_status;
          if (
            typeof expectedStatus === "string" &&
            expectedStatus !== existing.status
          ) {
            await conn.rollback();
            return res.status(409).json({
              error: "This review was already moderated by someone else.",
              code: "stale",
              current_status: existing.status,
            });
          }

          const newStatus = action === "approve" ? "approved" : "rejected";
          await conn.query(
            `UPDATE customer_reviews
             SET status = ?, moderated_at = ?, moderated_by = ?
             WHERE id = ?`,
            [newStatus, now, moderator, id]
          );
          await conn.commit();
          responsePayload = { success: true, status: newStatus };
          auditAction =
            action === "approve" ? "review.approved" : "review.rejected";
          auditSummary = `${action === "approve" ? "Approved" : "Rejected"} review #${id}`;
          auditMetadata = { action };
        } else {
          // edit
          const editNote = String(body.edit_note || "").trim();
          if (!editNote) {
            await conn.rollback();
            return res.status(400).json({ error: "edit_note is required." });
          }
          if (editNote.length > 255) {
            await conn.rollback();
            return res.status(400).json({ error: "edit_note is too long." });
          }

          const bodyBaseHash = body.base_hash;
          if (
            typeof bodyBaseHash === "string" &&
            bodyBaseHash !==
              reviewModerationBaseHash(existing as Record<string, unknown>)
          ) {
            await conn.rollback();
            return res.status(409).json({
              error:
                "This review was changed by someone else - reloaded, try again.",
              code: "stale",
              current_status: existing.status,
            });
          }

          const validated = validateReviewFields({
            display_name:
              body.display_name != null ? body.display_name : existing.display_name,
            rating: body.rating != null ? body.rating : existing.rating,
            review_text:
              body.review_text != null ? body.review_text : existing.review_text,
          });
          if (!validated.ok) {
            await conn.rollback();
            return res.status(400).json({ error: validated.error });
          }

          const originalText =
            existing.original_text != null &&
            String(existing.original_text).length > 0
              ? existing.original_text
              : existing.review_text;
          const textHash = reviewTextHash(validated.review_text);

          await conn.query(
            `UPDATE customer_reviews
             SET display_name = ?, rating = ?, review_text = ?, original_text = ?,
                 text_hash = ?, edited_at = ?, edit_note = ?
             WHERE id = ?`,
            [
              validated.display_name,
              validated.rating,
              validated.review_text,
              originalText,
              textHash,
              now,
              editNote.slice(0, 255),
              id,
            ]
          );
          await conn.commit();
          responsePayload = { success: true };
          auditAction = "review.edited";
          auditSummary = `Edited review #${id}`;
          auditMetadata = { action: "edit", edit_note: editNote.slice(0, 255) };
        }
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

      clearPublicReviewsCache();
      if (auditAction && auditSummary) {
        await recordAdminAudit({
          actor: admin,
          action: auditAction,
          entityType: "customer_review",
          entityId: id,
          summary: auditSummary,
          metadata: auditMetadata,
          ip,
        });
      }
      return res.status(200).json(responsePayload || { success: true });
    }

    if (req.method === "DELETE") {
      const admin = await requireAdminPermission(req, res, "reviews.manage");
      if (!admin) return;
      setAdminNoStore(res);

      const id = parseId(
        Array.isArray(req.query.id) ? req.query.id[0] : req.query.id
      );
      if (!id) return res.status(400).json({ error: "id required" });

      const expectedRaw = Array.isArray(req.query.expected_status)
        ? req.query.expected_status[0]
        : req.query.expected_status;
      const expectedStatus =
        typeof expectedRaw === "string" ? expectedRaw : undefined;

      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [existingRows]: any = await conn.query(
          `SELECT ${ADMIN_SELECT} FROM customer_reviews WHERE id = ? LIMIT 1 FOR UPDATE`,
          [id]
        );
        if (!Array.isArray(existingRows) || !existingRows.length) {
          await conn.rollback();
          return res.status(404).json({ error: "Not found" });
        }
        const existing = existingRows[0];
        if (
          typeof expectedStatus === "string" &&
          expectedStatus !== existing.status
        ) {
          await conn.rollback();
          return res.status(409).json({
            error: "This review was already moderated by someone else.",
            code: "stale",
            current_status: existing.status,
          });
        }

        await conn.query(`DELETE FROM customer_reviews WHERE id = ?`, [id]);
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

      clearPublicReviewsCache();

      const { ip } = getRequestMeta(req);
      await recordAdminAudit({
        actor: admin,
        action: "review.deleted",
        entityType: "customer_review",
        entityId: id,
        summary: `Deleted review #${id}`,
        metadata: { action: "delete" },
        ip,
      });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error: any) {
    const errCode = typeof error?.code === "string" ? error.code : undefined;
    const errName = typeof error?.name === "string" ? error.name : "Error";
    console.error("[admin-reviews] failed", errCode || errName);
    return res.status(500).json({ error: "Request failed" });
  }
}
