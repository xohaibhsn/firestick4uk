import type { NextApiRequest, NextApiResponse } from "next";
import { getRequestMeta, requireAdminPermission } from "../../lib/adminAuth";
import { recordAdminAudit } from "../../lib/adminAudit";
import { hasAdminPermission } from "../../lib/adminPermissions";
import { migrateProductUrl } from "../../lib/productUrlMigrationServer";

/**
 * Controlled product URL migration (POST only).
 * Requires products.manage AND redirects.manage (super_admin today).
 * Does not unlock ordinary product slug edits (HTTP 409 protection remains).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const admin = await requireAdminPermission(req, res, "products.manage");
  if (!admin) return;

  if (!hasAdminPermission(admin.role, "redirects.manage")) {
    return res.status(403).json({
      error: "Forbidden",
      message: "Product URL migration requires redirects.manage in addition to products.manage.",
    });
  }

  const body = (req.body || {}) as Record<string, unknown>;
  const productId = Number(body.product_id ?? body.productId ?? body.id);
  const expectedOldSlug = String(body.expected_old_slug ?? body.expectedOldSlug ?? "");
  const newSlug = String(body.new_slug ?? body.newSlug ?? "");

  try {
    const result = await migrateProductUrl({
      productId,
      expectedOldSlug,
      newSlug,
      actor: admin,
    });

    if (!result.ok) {
      return res.status(result.status).json({
        error: result.error,
        code: result.code || undefined,
      });
    }

    const { ip } = getRequestMeta(req);
    await recordAdminAudit({
      actor: admin,
      action: result.alreadyMigrated ? "product.url_migration_noop" : "product.url_migrated",
      entityType: "product",
      entityId: result.productId,
      summary: result.alreadyMigrated
        ? `URL migration already applied for product ${result.productId}: ${result.oldSlug} → ${result.newSlug}`
        : `Migrated product URL ${result.oldSlug} → ${result.newSlug}`,
      metadata: {
        product_id: result.productId,
        old_slug: result.oldSlug,
        new_slug: result.newSlug,
        source_path: result.sourcePath,
        destination_path: result.destinationPath,
        redirect_id: result.redirectId,
        already_migrated: result.alreadyMigrated,
        preserved: result.preserved,
        changed_fields: result.alreadyMigrated ? [] : ["slug"],
      },
      ip,
    });

    return res.status(200).json({
      success: true,
      already_migrated: result.alreadyMigrated,
      product_id: result.productId,
      old_slug: result.oldSlug,
      new_slug: result.newSlug,
      source_path: result.sourcePath,
      destination_path: result.destinationPath,
      redirect_id: result.redirectId,
      preserved: result.preserved,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Migration failed" });
  }
}
