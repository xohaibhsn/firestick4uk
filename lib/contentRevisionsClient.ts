/**
 * Client-safe revision helpers (no DB).
 * Mirror of role → entity visibility from lib/contentRevisions.ts
 * lib/adminPermissions.ts is a pure policy module (no DB/secrets), so it is safe to import here.
 * The server (pages/api/admin-revisions/restore.ts) stays authoritative — these only gate UI buttons.
 */
import { hasAdminPermission } from "./adminPermissions";
import type { AdminRoleName } from "./adminPermissions";

export type RevisionEntityType =
  | "product"
  | "blog"
  | "site_content"
  | "site_settings"
  | "site_content_batch"
  | "section";

export function revisionEntityTypesForRole(role: AdminRoleName): RevisionEntityType[] {
  if (role === "super_admin") {
    return ["product", "blog", "site_content", "site_settings", "site_content_batch", "section"];
  }
  if (role === "manager") {
    return ["product", "blog", "site_content", "site_content_batch"];
  }
  return ["blog"];
}

/** Entity types a content-key (site_content / site_settings) history lookup may search. */
export const CONTENT_KEY_REVISION_TYPES: readonly RevisionEntityType[] = [
  "site_content",
  "site_settings",
  "site_content_batch",
];

/** Mirror of lib/contentRevisions.ts canViewRevisionEntity. */
export function canViewRevisionEntity(role: AdminRoleName, entityType: string): boolean {
  return revisionEntityTypesForRole(role).includes(entityType as RevisionEntityType);
}

/**
 * Mirror of lib/contentRevisions.ts canRestoreRevisionEntity.
 * Restore requires the underlying entity capability (not just revisions.view).
 */
export function canRestoreRevisionEntity(role: AdminRoleName, entityType: string): boolean {
  switch (entityType) {
    case "product":
      return hasAdminPermission(role, "products.manage");
    case "blog":
      return hasAdminPermission(role, "blog.manage");
    case "site_content":
    case "site_content_batch":
      return hasAdminPermission(role, "content.manage");
    case "site_settings":
      return hasAdminPermission(role, "settings.manage");
    case "section":
      return hasAdminPermission(role, "page_builder.manage");
    default:
      return false;
  }
}

export type RestorableRevisionLike = {
  entity_type: string;
  revision_action: string;
};

/**
 * Whether the UI may offer a Restore button for a revision.
 * Same rules as ContentHistoryPanel (server re-checks everything).
 */
export function canOfferRestoreRevision(
  item: RestorableRevisionLike,
  role: AdminRoleName
): boolean {
  if (!hasAdminPermission(role, "revisions.view")) return false;
  if (!canViewRevisionEntity(role, item.entity_type)) return false;
  // V1: deleted product/blog snapshots are view-only; deleted site content/settings may be restored.
  if (item.revision_action === "delete") {
    if (item.entity_type !== "site_content" && item.entity_type !== "site_settings") return false;
  }
  if (item.entity_type === "site_settings" && role !== "super_admin") return false;
  if (item.entity_type === "section" && role !== "super_admin") return false;
  return canRestoreRevisionEntity(role, item.entity_type);
}

/** Per-field History buttons / drawer require revisions.view. */
export function canViewRevisionsForRole(role: AdminRoleName): boolean {
  return hasAdminPermission(role, "revisions.view");
}

/**
 * Restore request body — SAME shape the History tab sends to POST /api/admin-revisions/restore.
 * expected_version (product only) must come from a fresh authorized current-product read,
 * never from the historical snapshot.
 */
export function buildRestoreBody(
  revisionId: number,
  expectedVersion?: number | null
): { revision_id: number; expected_version?: number } {
  return {
    revision_id: revisionId,
    ...(expectedVersion != null && Number.isFinite(Number(expectedVersion))
      ? { expected_version: Number(expectedVersion) }
      : {}),
  };
}

export const RESTORE_ENDPOINT = "/api/admin-revisions/restore";
