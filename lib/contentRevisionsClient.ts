/**
 * Client-safe revision helpers (no DB).
 * Mirror of role → entity visibility from lib/contentRevisions.ts
 */
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
