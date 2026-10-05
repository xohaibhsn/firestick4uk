/**
 * Pure SEO Issue Memory model (no DB, no HTTP, no AI).
 */

import type { SeoDiagnosticIssue } from "@/lib/seoDiagnostics";

export type SeoIssueMemoryStatus = "open" | "resolved";

export type SeoIssueResolutionReason =
  | "fixed"
  | "entity_out_of_scope"
  | "deleted";

export type SeoIssueEntityType = "product" | "blog";

export type SeoIssueReconcileScope =
  | { scope: "all" }
  | { scope: "products" }
  | { scope: "blog" }
  | { scope: "entity"; entity_type: SeoIssueEntityType; entity_id: string };

export type SeoIssueMemoryRow = {
  issue_key: string;
  rule_code: string;
  entity_type: SeoIssueEntityType;
  entity_id: string;
  entity_label: string | null;
  category: string;
  severity: string;
  field_name: string | null;
  status: SeoIssueMemoryStatus;
  resolution_reason: SeoIssueResolutionReason | null;
  first_seen_at: string;
  last_seen_at: string;
  resolved_at: string | null;
  reopened_count: number;
  occurrence_count: number;
  latest_message: string;
  latest_evidence: string;
};

export type SeoIssueEntityState = {
  entityType: SeoIssueEntityType;
  entityId: string;
  exists: boolean;
  eligible: boolean;
};

export type SeoIssueResolutionPlan = {
  issue_key: string;
  reason: SeoIssueResolutionReason;
};

/**
 * Derive rule_code from a deterministic issue.id.
 * Requires id to start with `${entityType}:${entityId}:`.
 */
export function extractRuleCodeFromIssue(
  issue: Pick<SeoDiagnosticIssue, "id" | "entityType" | "entityId">
): string | null {
  const entityType = String(issue.entityType || "");
  const entityId = String(issue.entityId || "");
  const id = String(issue.id || "");
  if (!entityType || !entityId || !id) return null;
  if (entityType !== "product" && entityType !== "blog") return null;
  const prefix = `${entityType}:${entityId}:`;
  if (!id.startsWith(prefix)) return null;
  const rule = id.slice(prefix.length).trim();
  if (!rule || rule.includes(":")) return null;
  return rule;
}

export function isValidEntityId(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!/^\d+$/.test(s)) return null;
  if (Number(s) <= 0) return null;
  return s;
}

export function entityStateKey(
  entityType: SeoIssueEntityType,
  entityId: string
): string {
  return `${entityType}:${entityId}`;
}

/**
 * Classify an OPEN memory row that is absent from the current detected set.
 * Returns null when the row must be left alone (out of evaluated scope).
 */
export function classifyAbsentOpenIssue(args: {
  memory: Pick<
    SeoIssueMemoryRow,
    "issue_key" | "entity_type" | "entity_id" | "status"
  >;
  entityStates: Map<string, SeoIssueEntityState>;
  evaluatedProducts: boolean;
  evaluatedBlogs: boolean;
  /** When set, only this entity may be resolved. */
  entityFilter?: { entityType: SeoIssueEntityType; entityId: string } | null;
}): SeoIssueResolutionReason | null {
  const { memory, entityStates, evaluatedProducts, evaluatedBlogs, entityFilter } =
    args;
  if (memory.status !== "open") return null;

  if (entityFilter) {
    if (
      memory.entity_type !== entityFilter.entityType ||
      memory.entity_id !== entityFilter.entityId
    ) {
      return null;
    }
  } else if (memory.entity_type === "product" && !evaluatedProducts) {
    return null;
  } else if (memory.entity_type === "blog" && !evaluatedBlogs) {
    return null;
  }

  const key = entityStateKey(memory.entity_type, memory.entity_id);
  const state = entityStates.get(key);
  if (!state || !state.exists) return "deleted";
  if (!state.eligible) return "entity_out_of_scope";
  return "fixed";
}

/** Compact detected payload ready for persistence (no HTML). */
export type SeoIssueDetectedPayload = {
  issue_key: string;
  rule_code: string;
  entity_type: SeoIssueEntityType;
  entity_id: string;
  entity_label: string;
  category: string;
  severity: string;
  field_name: string | null;
  latest_message: string;
  latest_evidence: string;
};

export function toDetectedPayload(
  issue: SeoDiagnosticIssue
): SeoIssueDetectedPayload | null {
  const rule_code = extractRuleCodeFromIssue(issue);
  if (!rule_code) return null;
  if (issue.entityType !== "product" && issue.entityType !== "blog") return null;
  return {
    issue_key: issue.id,
    rule_code,
    entity_type: issue.entityType,
    entity_id: String(issue.entityId),
    entity_label: String(issue.label || "").slice(0, 255),
    category: String(issue.category || "").slice(0, 32),
    severity: String(issue.severity || "").slice(0, 32),
    field_name: issue.field ? String(issue.field).slice(0, 64) : null,
    latest_message: String(issue.message || "").slice(0, 500),
    latest_evidence: String(issue.evidence || "").slice(0, 500),
  };
}

export function resolutionReasonLabel(
  reason: SeoIssueResolutionReason | null | undefined
): string {
  if (reason === "fixed") return "No longer detected";
  if (reason === "entity_out_of_scope") return "No longer in public SEO scope";
  if (reason === "deleted") return "Entity deleted";
  return "—";
}
