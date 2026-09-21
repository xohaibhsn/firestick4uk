/**
 * Phase 9 — CMS content revision helpers (SERVER ONLY).
 * No request-time DDL. Table created via scripts/migrate-content-revisions.js.
 */
import type { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from "mysql2/promise";
import pool from "./db";
import type { AdminIdentity } from "./adminAuth";
import type { AdminRoleName } from "./adminPermissions";
import { hasAdminPermission, isSuperAdminSettingsKey } from "./adminPermissions";

export const REVISION_MAX_BYTES = 1024 * 1024; // 1 MB
export const REVISION_RETENTION = 100;

export type RevisionEntityType =
  | "product"
  | "blog"
  | "site_content"
  | "site_settings"
  | "site_content_batch"
  | "section";

export type RevisionAction = "update" | "delete" | "restore";

const SECRET_KEY_RE =
  /password|password_hash|session_token|cookie|authorization|smtp|secret|credential|api_key|api_secret|db_password|private_key/i;

export const SUBSCRIPTION_ROUTING_KEYS = new Set([
  "subscription_slug",
  "subscription_previous_slug",
  "subscription_canonical",
]);

export const PRODUCT_SNAPSHOT_FIELDS = [
  "id",
  "name",
  "slug",
  "description",
  "price",
  "category",
  "badge",
  "image",
  "stock",
  "active",
  "short_description",
  "full_description",
  "seo_title",
  "meta_description",
  "focus_keyword",
  "features",
  "og_image",
] as const;

export const BLOG_SNAPSHOT_FIELDS = [
  "id",
  "title",
  "slug",
  "excerpt",
  "content",
  "category",
  "emoji",
  "badge",
  "badgeText",
  "featured_image",
  "meta_title",
  "meta_description",
  "focus_keyword",
  "status",
  "featured",
  "canonical_url",
  "faqs",
  "active",
] as const;

type Queryable = Pool | PoolConnection;

function scrubObject(value: unknown, depth = 0): unknown {
  if (depth > 12) return null;
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((v) => scrubObject(v, depth + 1));
  if (typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY_RE.test(k)) continue;
    out[k] = scrubObject(v, depth + 1);
  }
  return out;
}

export function snapshotProduct(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of PRODUCT_SNAPSHOT_FIELDS) {
    if (f in row) out[f] = row[f];
  }
  return scrubObject(out) as Record<string, unknown>;
}

export function snapshotBlog(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of BLOG_SNAPSHOT_FIELDS) {
    if (f in row) out[f] = row[f];
  }
  return scrubObject(out) as Record<string, unknown>;
}

export function serializeSnapshot(snapshot: unknown): string {
  const scrubbed = scrubObject(snapshot);
  const json = JSON.stringify(scrubbed);
  if (!json) throw new Error("Empty revision snapshot");
  if (Buffer.byteLength(json, "utf8") > REVISION_MAX_BYTES) {
    const err: any = new Error("Content too large to record revision history (max 1 MB)");
    err.code = "REVISION_TOO_LARGE";
    throw err;
  }
  return json;
}

export function normalizeChangedFields(fields: unknown): string[] {
  if (!Array.isArray(fields)) return [];
  return [...new Set(fields.map((f) => String(f || "").trim()).filter(Boolean))].slice(0, 200);
}

export type RecordRevisionInput = {
  entityType: RevisionEntityType;
  entityId: string | number;
  entityLabel?: string | null;
  revisionAction: RevisionAction;
  snapshot: unknown;
  changedFields?: unknown;
  actor: AdminIdentity;
};

/** Insert one revision row. Caller may wrap in a transaction via `conn`. */
export async function recordContentRevision(
  input: RecordRevisionInput,
  conn: Queryable = pool
): Promise<number> {
  const entityType = String(input.entityType || "").slice(0, 50);
  const entityId = String(input.entityId ?? "").slice(0, 191);
  if (!entityType || !entityId) throw new Error("Revision entity required");

  const snapshotJson = serializeSnapshot(input.snapshot);
  const changed = normalizeChangedFields(input.changedFields);
  const changedJson = changed.length ? JSON.stringify(changed) : null;

  const actorType = input.actor.principalType === "master" ? "master" : "staff";
  const staffId =
    input.actor.staffId != null && Number(input.actor.staffId) > 0
      ? Number(input.actor.staffId)
      : null;

  const [result] = await conn.query<ResultSetHeader>(
    `INSERT INTO content_revisions
      (entity_type, entity_id, entity_label, revision_action, snapshot_json, changed_fields_json,
       actor_type, actor_staff_id, actor_name, actor_role)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entityType,
      entityId,
      input.entityLabel ? String(input.entityLabel).slice(0, 255) : null,
      input.revisionAction,
      snapshotJson,
      changedJson,
      actorType,
      staffId,
      String(input.actor.name || "Admin").slice(0, 255),
      input.actor.role,
    ]
  );

  const id = Number(result.insertId);
  await pruneEntityRevisions(entityType, entityId, conn);
  return id;
}

/** Keep latest N revisions for the same entity only. */
export async function pruneEntityRevisions(
  entityType: string,
  entityId: string | number,
  conn: Queryable = pool,
  keep = REVISION_RETENTION
): Promise<void> {
  const et = String(entityType);
  const eid = String(entityId);
  await conn.query(
    `DELETE FROM content_revisions
     WHERE entity_type=? AND entity_id=?
       AND id NOT IN (
         SELECT id FROM (
           SELECT id FROM content_revisions
           WHERE entity_type=? AND entity_id=?
           ORDER BY created_at DESC, id DESC
           LIMIT ?
         ) keep_rows
       )`,
    [et, eid, et, eid, keep]
  );
}

export function revisionEntityTypesForRole(role: AdminRoleName): RevisionEntityType[] {
  if (role === "super_admin") {
    return ["product", "blog", "site_content", "site_settings", "site_content_batch", "section"];
  }
  if (role === "manager") {
    return ["product", "blog", "site_content", "site_content_batch"];
  }
  return ["blog"];
}

export function canViewRevisionEntity(role: AdminRoleName, entityType: string): boolean {
  return revisionEntityTypesForRole(role).includes(entityType as RevisionEntityType);
}

/** Restore requires the underlying entity capability (not just revisions.view). */
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

export function classifySiteContentEntityType(keys: string[]): RevisionEntityType {
  const unique = [...new Set(keys.map((k) => String(k || "").trim()).filter(Boolean))];
  if (!unique.length) return "site_content";
  const settings = unique.filter((k) => isSuperAdminSettingsKey(k));
  const content = unique.filter((k) => !isSuperAdminSettingsKey(k));
  if (settings.length && !content.length) return "site_settings";
  if (content.length && !settings.length) return "site_content";
  return "site_content_batch";
}

export function snapshotHasSubscriptionRouting(snapshot: unknown): boolean {
  if (!snapshot || typeof snapshot !== "object") return false;
  const values = (snapshot as any).values;
  if (values && typeof values === "object") {
    return Object.keys(values).some((k) => SUBSCRIPTION_ROUTING_KEYS.has(k));
  }
  // single-row site content shape
  const key = (snapshot as any).content_key;
  if (key && SUBSCRIPTION_ROUTING_KEYS.has(String(key))) return true;
  return false;
}

export type ContentRevisionRow = {
  id: number;
  entity_type: string;
  entity_id: string;
  entity_label: string | null;
  revision_action: string;
  snapshot_json: string;
  changed_fields_json: string | null;
  actor_type: string;
  actor_staff_id: number | null;
  actor_name: string;
  actor_role: string;
  created_at: Date | string;
};

export async function getRevisionById(
  id: number,
  conn: Queryable = pool
): Promise<ContentRevisionRow | null> {
  const [rows] = await conn.query<RowDataPacket[]>(
    "SELECT * FROM content_revisions WHERE id=? LIMIT 1",
    [id]
  );
  return (rows?.[0] as ContentRevisionRow) || null;
}

export function parseChangedFields(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return normalizeChangedFields(parsed);
  } catch {
    return [];
  }
}

export function parseSnapshot(json: string): unknown {
  return JSON.parse(json);
}
