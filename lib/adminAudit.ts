/**
 * Best-effort CMS admin activity audit helper.
 * No request-time DDL. Table must exist via one-time migration.
 *
 * Retention: rows are kept indefinitely for now.
 * Future optional policy: purge rows older than ~12 months (manual/scripted — no cron).
 */
import pool from "@/lib/db";
import type { AdminIdentity, AdminRole, PrincipalType } from "@/lib/adminAuth";

export type AuditActor = {
  principalType: PrincipalType;
  staffId?: number | null;
  name: string;
  role: AdminRole;
};

export type RecordAdminAuditInput = {
  actor: AuditActor | AdminIdentity;
  action: string;
  entityType: string;
  entityId?: string | number | null;
  summary?: string | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
};

function sanitizeMetadata(meta: Record<string, unknown> | null | undefined): string | null {
  if (!meta || typeof meta !== "object") return null;
  const blocked = /password|token|cookie|secret|hash|smtp|credential|authorization/i;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (blocked.test(k)) continue;
    if (typeof v === "string" && v.length > 500) {
      out[k] = v.slice(0, 500);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  try {
    const json = JSON.stringify(out);
    if (!json || json === "{}") return null;
    return json.length > 8000 ? json.slice(0, 8000) : json;
  } catch {
    return null;
  }
}

/** Insert one audit row. Never throws to callers — failures are logged only. */
export async function recordAdminAudit(input: RecordAdminAuditInput): Promise<void> {
  try {
    const actor = input.actor;
    const action = String(input.action || "").slice(0, 100);
    const entityType = String(input.entityType || "").slice(0, 100);
    if (!action || !entityType) return;

    const entityId =
      input.entityId === undefined || input.entityId === null || input.entityId === ""
        ? null
        : String(input.entityId).slice(0, 191);
    const summary = input.summary ? String(input.summary).slice(0, 500) : null;
    const metadataJson = sanitizeMetadata(input.metadata ?? null);
    const ip = input.ip ? String(input.ip).slice(0, 64) : null;

    const staffId =
      "staffId" in actor && actor.staffId != null && Number(actor.staffId) > 0
        ? Number(actor.staffId)
        : null;

    await pool.query(
      `INSERT INTO admin_audit_log
        (actor_type, actor_staff_id, actor_name, actor_role, action, entity_type, entity_id, summary, metadata_json, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        actor.principalType === "master" ? "master" : "staff",
        staffId,
        String(actor.name || "Admin").slice(0, 255),
        actor.role,
        action,
        entityType,
        entityId,
        summary,
        metadataJson,
        ip,
      ]
    );
  } catch (err: any) {
    console.error(`[audit] failed to record ${input?.action || "unknown"}:`, err?.message || err);
  }
}

export function actorFromIdentity(identity: AdminIdentity): AuditActor {
  return {
    principalType: identity.principalType,
    staffId: identity.staffId ?? null,
    name: identity.name,
    role: identity.role,
  };
}
