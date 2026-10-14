/**
 * JSEO-W1 — Pure deterministic SEO Daily Work Queue derivation.
 *
 * Builds a compact suggested queue from already-authorized overview payload
 * fields only. No DB, HTTP, GSC live data, issue-memory writes, or AB engines.
 */

export const SEO_DAILY_WORK_QUEUE_DEFAULT_LIMIT = 8;

export type SeoDailyWorkQueueIssue = {
  id: string;
  severity: "needs-attention" | "review";
  category: string;
  entityType: "product" | "blog";
  entityId: string;
  label: string;
  url: string | null;
  field: string | null;
  message: string;
  evidence: string;
  editTarget: "products" | "blog";
};

export type SeoDailyWorkQueueVerification = {
  url: string;
  label: string;
  group: "priority-migrations" | "core-content";
  kind: "current" | "legacy-redirect" | "content";
  expectedStatus: 200 | 308 | null;
  expectedCanonical: string | null;
  expectedTarget: string | null;
  inSitemap: boolean | null;
  note: string;
};

export type SeoDailyWorkQueuePermissions = {
  products: boolean;
  blog: boolean;
  productsManage: boolean;
  blogManage: boolean;
};

export type SeoDailyWorkQueueItem = {
  key: string;
  priority: 1 | 2 | 3 | 4;
  priorityLabel: string;
  source: "Product SEO" | "Blog SEO" | "GSC Manual Verification";
  entityLabel: string;
  reason: string;
  nextAction: string;
  navigateTab: "products" | "blog" | null;
  canEdit: boolean;
  publicUrl: string | null;
  issueId: string | null;
  verificationUrl: string | null;
  isManualGsc: boolean;
};

export type SeoDailyWorkQueueResult = {
  items: SeoDailyWorkQueueItem[];
  totalEligible: number;
  truncated: boolean;
};

function compareIssue(a: SeoDailyWorkQueueIssue, b: SeoDailyWorkQueueIssue): number {
  if (a.severity !== b.severity) {
    if (a.severity === "needs-attention") return -1;
    if (b.severity === "needs-attention") return 1;
  }
  if (a.entityType !== b.entityType) {
    return a.entityType < b.entityType ? -1 : 1;
  }
  if (a.entityId !== b.entityId) {
    return a.entityId < b.entityId ? -1 : 1;
  }
  if (a.id !== b.id) {
    return a.id < b.id ? -1 : 1;
  }
  return 0;
}

function compareVerification(
  a: SeoDailyWorkQueueVerification,
  b: SeoDailyWorkQueueVerification
): number {
  if (a.group !== b.group) {
    if (a.group === "priority-migrations") return -1;
    if (b.group === "priority-migrations") return 1;
  }
  if (a.label !== b.label) {
    return a.label < b.label ? -1 : 1;
  }
  if (a.url !== b.url) {
    return a.url < b.url ? -1 : 1;
  }
  return 0;
}

function issueVisible(
  issue: SeoDailyWorkQueueIssue,
  permissions: SeoDailyWorkQueuePermissions
): boolean {
  if (issue.entityType === "product") return permissions.products === true;
  if (issue.entityType === "blog") return permissions.blog === true;
  return false;
}

function canEditIssue(
  issue: SeoDailyWorkQueueIssue,
  permissions: SeoDailyWorkQueuePermissions
): boolean {
  if (issue.editTarget === "products") {
    return permissions.productsManage === true;
  }
  if (issue.editTarget === "blog") {
    return permissions.blogManage === true;
  }
  return false;
}

function issueToItem(
  issue: SeoDailyWorkQueueIssue,
  permissions: SeoDailyWorkQueuePermissions
): SeoDailyWorkQueueItem {
  const canEdit = canEditIssue(issue, permissions);
  const source: SeoDailyWorkQueueItem["source"] =
    issue.entityType === "product" ? "Product SEO" : "Blog SEO";
  const priority: 1 | 2 = issue.severity === "needs-attention" ? 1 : 2;
  const navigateTab: "products" | "blog" | null = canEdit
    ? issue.editTarget
    : null;
  const nextAction = canEdit
    ? issue.editTarget === "products"
      ? "Open Products editor and fix this check"
      : "Open Blog editor and fix this check"
    : "Review evidence in SEO Diagnostics (edit not available for this role)";

  return {
    key: `issue:${issue.id}`,
    priority,
    priorityLabel:
      priority === 1 ? "Priority 1 — Needs Attention" : "Priority 2 — Review",
    source,
    entityLabel: issue.label,
    reason: String(issue.message || issue.evidence || "").trim() || issue.id,
    nextAction,
    navigateTab,
    canEdit,
    publicUrl: issue.url && String(issue.url).trim() ? String(issue.url) : null,
    issueId: issue.id,
    verificationUrl: null,
    isManualGsc: false,
  };
}

function verificationToItem(
  item: SeoDailyWorkQueueVerification
): SeoDailyWorkQueueItem {
  const priority: 3 | 4 = item.group === "priority-migrations" ? 3 : 4;
  const expectedBits: string[] = [];
  if (item.expectedStatus != null) {
    expectedBits.push(`expected HTTP ${item.expectedStatus}`);
  }
  if (item.expectedCanonical) {
    expectedBits.push(`canonical ${item.expectedCanonical}`);
  } else if (item.expectedTarget) {
    expectedBits.push(`destination ${item.expectedTarget}`);
  }
  const note = String(item.note || "").trim();
  const reason = [
    note || "Curated URL for manual Google Search Console verification.",
    expectedBits.length ? `(${expectedBits.join("; ")})` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    key: `gsc:${item.url}`,
    priority,
    priorityLabel:
      priority === 3
        ? "Priority 3 — Manual GSC (migrations)"
        : "Priority 3 — Manual GSC (core)",
    source: "GSC Manual Verification",
    entityLabel: item.label,
    reason,
    nextAction: "Verify manually in Google Search Console",
    navigateTab: null,
    canEdit: false,
    publicUrl: item.url && String(item.url).trim() ? String(item.url) : null,
    issueId: null,
    verificationUrl: item.url,
    isManualGsc: true,
  };
}

/**
 * Build a role-scoped, deduplicated, deterministically ordered daily work queue.
 * Does not invent GSC indexing status or mutate issue memory.
 */
export function buildSeoDailyWorkQueue(input: {
  issues?: readonly SeoDailyWorkQueueIssue[] | null;
  verificationQueue?: readonly SeoDailyWorkQueueVerification[] | null;
  permissions: SeoDailyWorkQueuePermissions;
  limit?: number;
}): SeoDailyWorkQueueResult {
  const limit =
    typeof input.limit === "number" &&
    Number.isFinite(input.limit) &&
    input.limit > 0
      ? Math.floor(input.limit)
      : SEO_DAILY_WORK_QUEUE_DEFAULT_LIMIT;

  const permissions = input.permissions;
  const seenKeys = new Set<string>();
  const eligible: SeoDailyWorkQueueItem[] = [];

  const issues = Array.isArray(input.issues) ? [...input.issues] : [];
  issues.sort(compareIssue);
  for (const issue of issues) {
    if (!issue || typeof issue.id !== "string" || !issue.id) continue;
    if (!issueVisible(issue, permissions)) continue;
    const item = issueToItem(issue, permissions);
    if (seenKeys.has(item.key)) continue;
    seenKeys.add(item.key);
    eligible.push(item);
  }

  const verifications = Array.isArray(input.verificationQueue)
    ? [...input.verificationQueue]
    : [];
  verifications.sort(compareVerification);
  for (const row of verifications) {
    if (!row || typeof row.url !== "string" || !row.url.trim()) continue;
    // verificationQueue is already permission-filtered by the overview API.
    const item = verificationToItem(row);
    if (seenKeys.has(item.key)) continue;
    seenKeys.add(item.key);
    eligible.push(item);
  }

  // Stable final order: priority band, then original relative order within band
  // (issues already severity-sorted; migrations before core).
  eligible.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (a.key !== b.key) return a.key < b.key ? -1 : 1;
    return 0;
  });

  const totalEligible = eligible.length;
  const items = eligible.slice(0, limit);
  return {
    items,
    totalEligible,
    truncated: totalEligible > items.length,
  };
}
