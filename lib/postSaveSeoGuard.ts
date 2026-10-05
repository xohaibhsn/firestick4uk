/**
 * Post-save SEO Guard — deterministic advisory after successful CMS mutations.
 * SERVER-ORIENTED: runPostSaveSeoGuard imports DB helpers; do not import from client.
 * Pure helpers (field sets / shouldRun / format banner) are safe to copy or re-export.
 */
import { reconcileSeoIssueMemory } from "@/lib/seoIssueMemoryServer";

export const PRODUCT_SEO_FIELDS = [
  "active",
  "slug",
  "name",
  "seo_title",
  "meta_description",
  "short_description",
  "description",
  "full_description",
  "image",
  "og_image",
] as const;

export const BLOG_SEO_FIELDS = [
  "status",
  "active",
  "slug",
  "title",
  "meta_title",
  "meta_description",
  "excerpt",
  "featured_image",
  "canonical_url",
  "content",
] as const;

export type SeoGuardOperation = "create" | "update" | "delete" | "restore";
export type SeoGuardStatus = "checked" | "skipped" | "unavailable";
export type SeoGuardEntityType = "product" | "blog";

export type SeoGuardIssue = {
  id: string;
  severity: "needs-attention" | "review";
  category: string;
  field: string | null;
  message: string;
  evidence: string;
};

export type SeoGuardResult = {
  status: SeoGuardStatus;
  entity_type: SeoGuardEntityType;
  entity_id: string;
  operation: SeoGuardOperation;
  issue_count: number;
  needs_attention: number;
  review: number;
  issues: SeoGuardIssue[];
  memory_synced: boolean;
  skip_reason?: "no_seo_field_change" | "noop_update";
  message?: string;
};

const PRODUCT_SEO_SET = new Set<string>(PRODUCT_SEO_FIELDS);
const BLOG_SEO_SET = new Set<string>(BLOG_SEO_FIELDS);

function emptyResult(
  partial: Pick<
    SeoGuardResult,
    "status" | "entity_type" | "entity_id" | "operation"
  > &
    Partial<SeoGuardResult>
): SeoGuardResult {
  return {
    status: partial.status,
    entity_type: partial.entity_type,
    entity_id: String(partial.entity_id),
    operation: partial.operation,
    issue_count: partial.issue_count ?? 0,
    needs_attention: partial.needs_attention ?? 0,
    review: partial.review ?? 0,
    issues: partial.issues ?? [],
    memory_synced: partial.memory_synced ?? false,
    skip_reason: partial.skip_reason,
    message: partial.message,
  };
}

export function shouldRunPostSaveSeoGuard(args: {
  entityType: SeoGuardEntityType;
  operation: SeoGuardOperation;
  changedFields?: string[] | null;
}): { run: boolean; skip_reason?: "no_seo_field_change" | "noop_update" } {
  if (
    args.operation === "create" ||
    args.operation === "delete" ||
    args.operation === "restore"
  ) {
    return { run: true };
  }
  const fields = Array.isArray(args.changedFields) ? args.changedFields : [];
  if (fields.length === 0) {
    return { run: false, skip_reason: "noop_update" };
  }
  const set = args.entityType === "product" ? PRODUCT_SEO_SET : BLOG_SEO_SET;
  const intersects = fields.some((f) => set.has(String(f)));
  if (!intersects) {
    return { run: false, skip_reason: "no_seo_field_change" };
  }
  return { run: true };
}

/** Compact banner suffix for Sidhu (pure; safe to mirror in client). */
export function formatSeoGuardBanner(guard: SeoGuardResult | null | undefined): string {
  if (!guard || guard.status === "skipped") return "";
  if (guard.status === "unavailable") {
    return " — SEO check temporarily unavailable";
  }
  if (guard.issue_count === 0) {
    return " — SEO: no deterministic issues found";
  }
  const parts: string[] = [];
  if (guard.needs_attention > 0) {
    parts.push(
      `${guard.needs_attention} Needs attention`
    );
  }
  if (guard.review > 0) {
    parts.push(`${guard.review} Review`);
  }
  const countLabel = parts.length ? parts.join(", ") : `${guard.issue_count} issue(s)`;
  const first = guard.issues[0]?.message;
  if (first) {
    return ` — SEO: ${countLabel} — ${first}`;
  }
  return ` — SEO: ${countLabel}`;
}

/**
 * Best-effort post-save guard. NEVER throws.
 */
export async function runPostSaveSeoGuard(args: {
  entityType: SeoGuardEntityType;
  entityId: string | number;
  operation: SeoGuardOperation;
  changedFields?: string[] | null;
}): Promise<SeoGuardResult> {
  const entity_id = String(args.entityId);
  const base = {
    entity_type: args.entityType,
    entity_id,
    operation: args.operation,
  } as const;

  try {
    const applicability = shouldRunPostSaveSeoGuard({
      entityType: args.entityType,
      operation: args.operation,
      changedFields: args.changedFields,
    });
    if (!applicability.run) {
      return emptyResult({
        ...base,
        status: "skipped",
        memory_synced: false,
        skip_reason: applicability.skip_reason,
      });
    }

    const result = await reconcileSeoIssueMemory({
      scope: "entity",
      entity_type: args.entityType,
      entity_id,
    });

    const allIssues: SeoGuardIssue[] = (result.currentIssues || [])
      .filter(
        (i) =>
          i.severity === "needs-attention" || i.severity === "review"
      )
      .map((i) => ({
        id: i.id,
        severity: i.severity as "needs-attention" | "review",
        category: i.category,
        field: i.field,
        message: i.message,
        evidence: i.evidence,
      }));

    const needs_attention = allIssues.filter(
      (i) => i.severity === "needs-attention"
    ).length;
    const review = allIssues.filter((i) => i.severity === "review").length;

    return emptyResult({
      ...base,
      status: "checked",
      issue_count: allIssues.length,
      needs_attention,
      review,
      issues: allIssues.slice(0, 10),
      memory_synced: true,
    });
  } catch (err: any) {
    const msg = String(err?.message || err || "unknown error").slice(0, 300);
    console.error(
      `[post-save-seo-guard] entity=${args.entityType}:${entity_id} op=${args.operation} ${msg}`
    );
    return emptyResult({
      ...base,
      status: "unavailable",
      memory_synced: false,
      message: "SEO check temporarily unavailable.",
    });
  }
}
