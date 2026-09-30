import type { NextApiRequest, NextApiResponse } from "next";
import { getRequestMeta, requireAdminPermission } from "../../lib/adminAuth";
import { recordAdminAudit } from "../../lib/adminAudit";
import { validateRedirectFields, safeRedirectRow } from "../../lib/urlRedirects";
import {
  createRedirect,
  deleteRedirect,
  getRedirectById,
  listRedirects,
  loadRedirectGraphRules,
  updateRedirect,
} from "../../lib/urlRedirectsServer";

function changedFields(
  before: { source_path: string; destination_path: string; redirect_type: number; active: 0 | 1 },
  after: { source_path: string; destination_path: string; redirect_type: number; active: 0 | 1 }
): string[] {
  const fields: string[] = [];
  if (before.source_path !== after.source_path) fields.push("source_path");
  if (before.destination_path !== after.destination_path) fields.push("destination_path");
  if (before.redirect_type !== after.redirect_type) fields.push("redirect_type");
  if (before.active !== after.active) fields.push("active");
  return fields;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Auth + permission + same-origin BEFORE any url_redirects query.
  const admin = await requireAdminPermission(req, res, "redirects.manage");
  if (!admin) return;

  try {
    if (req.method === "GET") {
      const list = await listRedirects();
      return res.status(200).json(list);
    }

    if (req.method === "POST") {
      const body = req.body || {};
      const existing = await loadRedirectGraphRules();
      const validated = validateRedirectFields({
        source_path: body.source_path,
        destination_path: body.destination_path,
        redirect_type: body.redirect_type,
        active: body.active,
        existing,
      });
      if (!validated.ok) {
        const status = validated.code === "conflict" ? 409 : 400;
        return res.status(status).json({ error: validated.error });
      }

      try {
        const id = await createRedirect({
          source_path: validated.source_path,
          destination_path: validated.destination_path,
          redirect_type: validated.redirect_type,
          active: validated.active,
        });
        const row = await getRedirectById(id);
        const { ip } = getRequestMeta(req);
        await recordAdminAudit({
          actor: admin,
          action: "redirect.created",
          entityType: "redirect",
          entityId: id,
          summary: `Created redirect ${validated.source_path} → ${validated.destination_path}`,
          metadata: {
            source_path: validated.source_path,
            destination_path: validated.destination_path,
            redirect_type: validated.redirect_type,
            active: validated.active,
          },
          ip,
        });
        return res.status(200).json({ success: true, id, redirect: row ? safeRedirectRow(row) : null });
      } catch (err: any) {
        if (err?.code === "ER_DUP_ENTRY") {
          return res.status(409).json({ error: "A redirect with this source path already exists" });
        }
        throw err;
      }
    }

    if (req.method === "PUT") {
      const body = req.body || {};
      const id = Number(body.id);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ error: "ID required" });
      }

      const existingRow = await getRedirectById(id);
      if (!existingRow) {
        return res.status(404).json({ error: "Redirect not found" });
      }

      const existing = await loadRedirectGraphRules();
      const validated = validateRedirectFields({
        source_path: body.source_path !== undefined ? body.source_path : existingRow.source_path,
        destination_path:
          body.destination_path !== undefined ? body.destination_path : existingRow.destination_path,
        redirect_type: body.redirect_type !== undefined ? body.redirect_type : existingRow.redirect_type,
        active: body.active !== undefined ? body.active : existingRow.active,
        existing,
        id,
      });
      if (!validated.ok) {
        const status = validated.code === "conflict" ? 409 : 400;
        return res.status(status).json({ error: validated.error });
      }

      try {
        const ok = await updateRedirect(id, {
          source_path: validated.source_path,
          destination_path: validated.destination_path,
          redirect_type: validated.redirect_type,
          active: validated.active,
        });
        if (!ok) {
          return res.status(404).json({ error: "Redirect not found" });
        }
      } catch (err: any) {
        if (err?.code === "ER_DUP_ENTRY") {
          return res.status(409).json({ error: "A redirect with this source path already exists" });
        }
        throw err;
      }

      const after = {
        source_path: validated.source_path,
        destination_path: validated.destination_path,
        redirect_type: validated.redirect_type,
        active: validated.active,
      };
      const before = {
        source_path: existingRow.source_path,
        destination_path: existingRow.destination_path,
        redirect_type: existingRow.redirect_type,
        active: existingRow.active,
      };
      const changed = changedFields(before, after);

      let action = "redirect.updated";
      if (changed.length === 1 && changed[0] === "active") {
        action = after.active === 1 ? "redirect.enabled" : "redirect.disabled";
      } else if (before.active !== after.active && changed.includes("active")) {
        // Material field changes with active flip → updated (metadata includes active).
        action = "redirect.updated";
      }

      const { ip } = getRequestMeta(req);
      await recordAdminAudit({
        actor: admin,
        action,
        entityType: "redirect",
        entityId: id,
        summary:
          action === "redirect.enabled"
            ? `Enabled redirect ${after.source_path}`
            : action === "redirect.disabled"
              ? `Disabled redirect ${after.source_path}`
              : `Updated redirect ${after.source_path} → ${after.destination_path}`,
        metadata: {
          before,
          after,
          changed_fields: changed,
        },
        ip,
      });

      const row = await getRedirectById(id);
      return res.status(200).json({ success: true, redirect: row ? safeRedirectRow(row) : null });
    }

    if (req.method === "DELETE") {
      const id = Number(req.query.id ?? req.body?.id);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ error: "ID required" });
      }

      const existingRow = await getRedirectById(id);
      if (!existingRow) {
        return res.status(404).json({ error: "Redirect not found" });
      }

      const ok = await deleteRedirect(id);
      if (!ok) {
        return res.status(404).json({ error: "Redirect not found" });
      }

      const { ip } = getRequestMeta(req);
      await recordAdminAudit({
        actor: admin,
        action: "redirect.deleted",
        entityType: "redirect",
        entityId: id,
        summary: `Deleted redirect ${existingRow.source_path} → ${existingRow.destination_path}`,
        metadata: {
          source_path: existingRow.source_path,
          destination_path: existingRow.destination_path,
          redirect_type: existingRow.redirect_type,
          active: existingRow.active,
        },
        ip,
      });

      return res.status(200).json({ success: true });
    }

    res.setHeader("Allow", "GET, POST, PUT, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err: any) {
    console.error("[admin-redirects]", err?.message || err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
