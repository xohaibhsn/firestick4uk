/**
 * Authoritative SEO Issue Memory reconcile (POST only).
 * Recomputes diagnostics server-side. Never trusts browser issue arrays.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdmin } from "@/lib/adminAuth";
import {
  hasAdminPermission,
  type AdminRoleName,
} from "@/lib/adminPermissions";
import { recordAdminAudit } from "@/lib/adminAudit";
import {
  isValidEntityId,
  type SeoIssueReconcileScope,
} from "@/lib/seoIssueMemory";
import { reconcileSeoIssueMemory } from "@/lib/seoIssueMemoryServer";

function parseScope(body: any): SeoIssueReconcileScope | { error: string } {
  const scope = String(body?.scope || "").trim().toLowerCase();
  if (scope === "all" || scope === "products" || scope === "blog") {
    return { scope } as SeoIssueReconcileScope;
  }
  if (scope === "entity") {
    const entity_type = String(body?.entity_type || "").trim().toLowerCase();
    if (entity_type !== "product" && entity_type !== "blog") {
      return { error: "entity_type must be product or blog" };
    }
    const entity_id = isValidEntityId(body?.entity_id);
    if (!entity_id) return { error: "entity_id must be a positive integer" };
    return { scope: "entity", entity_type, entity_id };
  }
  return { error: "scope must be all, products, blog, or entity" };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const role = admin.role as AdminRoleName;
  const parsed = parseScope(req.body || {});
  if ("error" in parsed) {
    return res.status(400).json({ error: parsed.error });
  }

  const canProducts = hasAdminPermission(role, "products.view");
  const canBlog = hasAdminPermission(role, "blog.manage");

  if (parsed.scope === "all") {
    if (role !== "super_admin") {
      return res.status(403).json({
        error: "Forbidden",
        message: "Full diagnostic reconcile requires Recovery Admin.",
      });
    }
  } else if (parsed.scope === "products") {
    if (!canProducts) {
      return res.status(403).json({ error: "Forbidden", message: "products.view required" });
    }
  } else if (parsed.scope === "blog") {
    if (!canBlog) {
      return res.status(403).json({ error: "Forbidden", message: "blog.manage required" });
    }
  } else if (parsed.scope === "entity") {
    if (parsed.entity_type === "product" && !canProducts) {
      return res.status(403).json({ error: "Forbidden", message: "products.view required" });
    }
    if (parsed.entity_type === "blog" && !canBlog) {
      return res.status(403).json({ error: "Forbidden", message: "blog.manage required" });
    }
  }

  try {
    const result = await reconcileSeoIssueMemory(parsed);
    await recordAdminAudit({
      actor: admin,
      action: "seo.issues_reconciled",
      entityType: "seo_diagnostics",
      entityId:
        parsed.scope === "entity"
          ? `${parsed.entity_type}:${parsed.entity_id}`
          : parsed.scope,
      summary: `SEO issue memory reconcile (${parsed.scope}): detected ${result.detectedIssues}, opened ${result.opened}, reopened ${result.reopened}, resolved ${result.resolved}`,
      metadata: {
        scope: parsed.scope,
        ...(parsed.scope === "entity"
          ? { entity_type: parsed.entity_type, entity_id: parsed.entity_id }
          : {}),
        detected: result.detectedIssues,
        opened: result.opened,
        updated: result.updated,
        reopened: result.reopened,
        resolved: result.resolved,
        resolutionReasons: result.resolutionReasons,
      },
      ip: String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || ""),
    });
    return res.status(200).json(result);
  } catch (err: any) {
    console.error("[admin-seo-issues/reconcile] failed:", err?.message || err);
    return res.status(500).json({
      error: "Reconcile failed",
      message: "Authoritative diagnostic reconcile did not complete; no resolutions applied.",
    });
  }
}
