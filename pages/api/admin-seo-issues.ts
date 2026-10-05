/**
 * Authenticated read-only SEO Issue Memory list.
 * GET only. No mutations. Permission-filtered.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdmin } from "@/lib/adminAuth";
import {
  hasAdminPermission,
  type AdminRoleName,
} from "@/lib/adminPermissions";
import { isValidEntityId } from "@/lib/seoIssueMemory";
import { listSeoIssueMemory } from "@/lib/seoIssueMemoryServer";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const admin = await requireAdmin(req, res, { mutate: false });
  if (!admin) return;

  const role = admin.role as AdminRoleName;
  const allowProducts = hasAdminPermission(role, "products.view");
  const allowBlog = hasAdminPermission(role, "blog.manage");
  if (!allowProducts && !allowBlog) {
    return res.status(403).json({
      error: "Forbidden",
      message: "You do not have permission to view SEO issue memory.",
    });
  }

  const statusRaw = String(req.query.status || "all").toLowerCase();
  const status =
    statusRaw === "open" || statusRaw === "resolved" || statusRaw === "all"
      ? statusRaw
      : "all";

  const entityTypeRaw = String(req.query.entity_type || "").toLowerCase();
  const entityType =
    entityTypeRaw === "product" || entityTypeRaw === "blog"
      ? entityTypeRaw
      : null;

  const entityId = req.query.entity_id
    ? isValidEntityId(req.query.entity_id)
    : null;
  if (req.query.entity_id && !entityId) {
    return res.status(400).json({ error: "Invalid entity_id" });
  }

  try {
    const items = await listSeoIssueMemory({
      status,
      entityType,
      entityId,
      allowProducts,
      allowBlog,
      limit: req.query.limit,
    });
    return res.status(200).json({ items });
  } catch (err: any) {
    console.error("[admin-seo-issues] GET failed:", err?.message || err);
    return res.status(500).json({ error: "Failed to load SEO issue memory" });
  }
}
