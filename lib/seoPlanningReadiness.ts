/**
 * JSEO-W2B — Pure Blog Planning & Evidence Readiness composition.
 *
 * Manual topic + role-scoped overview blog inventory → AB-4 match → AB-3
 * with evidenceState "missing". No network, DB, providers, or persistence.
 */

import {
  evaluateBlogOpportunity,
  MAX_INTENT_CHARS,
  MAX_OPPORTUNITY_ID_CHARS,
  MAX_TOPIC_CHARS,
  type BlogOpportunityDecision,
  type BlogOpportunityReasonCode,
} from "@/lib/blogOpportunityEngine";

/** Re-exported for UI bounds without importing AB-3 into the panel. */
export { MAX_INTENT_CHARS, MAX_TOPIC_CHARS };
import {
  matchBlogOpportunity,
  toBlogOpportunityExistingContent,
  type BlogMatchInventoryRow,
  type BlogMatchKind,
  type BlogMatchReasonCode,
  type BlogOpportunityMatchResult,
} from "@/lib/blogOpportunityMatcher";

export const SEO_PLANNING_EVAL_OPPORTUNITY_ID = "manual-planning-preview";

export type SeoPlanningPermissions = {
  blog: boolean;
  blogManage: boolean;
};

/** Minimal overview blog row fields required for AB-4 mapping. */
export type SeoPlanningBlogRow = {
  id: number;
  title: string;
  slug: string;
  status: string;
  active: boolean | number;
  focus_keyword?: string | null;
};

export type SeoPlanningHoldCode =
  | "NO_TOPIC"
  | "INVALID_TOPIC"
  | "BLOG_PERMISSION_DENIED"
  | "INVENTORY_UNAVAILABLE"
  | "INVENTORY_EMPTY_UNVERIFIED"
  | "INVENTORY_MALFORMED"
  | "AB4_INVALID_INPUT"
  | "AB3_INVARIANT_FAILED";

export type SeoPlanningPreviewResult =
  | {
      status: "hold";
      holdCode: SeoPlanningHoldCode;
      message: string;
      topic: string | null;
      intent: string | null;
      evidenceState: "missing";
      evidenceLabel: "NOT YET COLLECTED";
      planningDecision: "HOLD";
      match: null;
      decision: null;
      canOpenBlog: false;
      ab4ReasonCodes: [];
      ab3ReasonCodes: [];
    }
  | {
      status: "preview";
      holdCode: null;
      message: string;
      topic: string;
      intent: string | null;
      evidenceState: "missing";
      evidenceLabel: "NOT YET COLLECTED";
      planningDecision: "HOLD";
      match: {
        kind: BlogMatchKind;
        title: string | null;
        status: string | null;
        url: string | null;
        entityId: number | null;
        reasonCodes: BlogMatchReasonCode[];
        heuristicNote: string;
      };
      decision: {
        action: BlogOpportunityDecision["action"];
        reasonCodes: BlogOpportunityReasonCode[];
        explanation: string;
        schedulerEligible: false;
      };
      canOpenBlog: boolean;
      ab4ReasonCodes: BlogMatchReasonCode[];
      ab3ReasonCodes: BlogOpportunityReasonCode[];
    };

function hold(
  code: SeoPlanningHoldCode,
  message: string,
  topic: string | null = null,
  intent: string | null = null
): SeoPlanningPreviewResult {
  return {
    status: "hold",
    holdCode: code,
    message,
    topic,
    intent,
    evidenceState: "missing",
    evidenceLabel: "NOT YET COLLECTED",
    planningDecision: "HOLD",
    match: null,
    decision: null,
    canOpenBlog: false,
    ab4ReasonCodes: [],
    ab3ReasonCodes: [],
  };
}

function normalizePlainTopic(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  if (!raw || raw.length > MAX_TOPIC_CHARS) return null;
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(raw)) return null;
  if (/[<>]/.test(raw)) return null;
  const normalized = raw.trim().replace(/\s+/g, " ");
  if (!normalized || normalized.length > MAX_TOPIC_CHARS) return null;
  return normalized;
}

function normalizePlainIntent(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") return null;
  if (raw.length > MAX_INTENT_CHARS) return null;
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(raw)) return null;
  if (/[<>]/.test(raw)) return null;
  const normalized = raw.trim().replace(/\s+/g, " ");
  if (!normalized) return null;
  if (normalized.length > MAX_INTENT_CHARS) return null;
  return normalized;
}

/**
 * Map overview NormalizedBlogSeoRow-like objects to AB-4 inventory rows.
 * Fail closed on any malformed row (do not silently drop posts).
 */
export function mapOverviewBlogToMatchInventory(
  blog: unknown
):
  | { ok: true; rows: BlogMatchInventoryRow[] }
  | { ok: false; reason: "unavailable" | "malformed" } {
  if (blog === undefined || blog === null) {
    return { ok: false, reason: "unavailable" };
  }
  if (!Array.isArray(blog)) {
    return { ok: false, reason: "malformed" };
  }
  const rows: BlogMatchInventoryRow[] = [];
  for (const item of blog) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { ok: false, reason: "malformed" };
    }
    const row = item as Record<string, unknown>;
    const id = Number(row.id);
    if (!Number.isInteger(id) || id <= 0) {
      return { ok: false, reason: "malformed" };
    }
    if (typeof row.title !== "string" || !row.title.trim()) {
      return { ok: false, reason: "malformed" };
    }
    if (typeof row.slug !== "string") {
      return { ok: false, reason: "malformed" };
    }
    if (typeof row.status !== "string") {
      return { ok: false, reason: "malformed" };
    }
    const status = row.status.trim().toLowerCase();
    if (status !== "draft" && status !== "published") {
      return { ok: false, reason: "malformed" };
    }
    let active: boolean;
    if (typeof row.active === "boolean") {
      active = row.active;
    } else if (row.active === 0 || row.active === 1) {
      active = row.active === 1;
    } else if (typeof row.active === "number" && Number.isFinite(row.active)) {
      active = row.active === 1;
    } else {
      return { ok: false, reason: "malformed" };
    }
    const focus =
      row.focus_keyword === undefined || row.focus_keyword === null
        ? null
        : typeof row.focus_keyword === "string"
          ? row.focus_keyword
          : null;
    if (row.focus_keyword != null && typeof row.focus_keyword !== "string") {
      return { ok: false, reason: "malformed" };
    }
    rows.push({
      id,
      title: row.title.trim(),
      slug: row.slug.trim(),
      status,
      active,
      focus_keyword: focus,
    });
  }
  return { ok: true, rows };
}

function matchTitleFromInventory(
  match: BlogOpportunityMatchResult,
  inventory: BlogMatchInventoryRow[]
): string | null {
  if (match.matchedEntityId == null) return null;
  const found = inventory.find((r) => r.id === match.matchedEntityId);
  return found ? found.title : null;
}

/**
 * Build default HOLD state (no topic selected). Pure; no side effects.
 */
export function createSeoPlanningHoldDefault(): SeoPlanningPreviewResult {
  return hold(
    "NO_TOPIC",
    "No research topic selected. Enter a topic to review existing Blog coverage. No AI research has been performed."
  );
}

/**
 * Explicit user-triggered planning preview. Never invents READY evidence.
 */
export function buildSeoPlanningPreview(input: {
  topic: unknown;
  intent?: unknown;
  blog: unknown;
  permissions: SeoPlanningPermissions;
}): SeoPlanningPreviewResult {
  const topic = normalizePlainTopic(input.topic);
  if (!topic) {
    if (
      typeof input.topic === "string" &&
      input.topic.trim() === ""
    ) {
      return createSeoPlanningHoldDefault();
    }
    return hold(
      "INVALID_TOPIC",
      "Enter a valid Blog topic (plain text, within length limits, without HTML)."
    );
  }

  const intent = normalizePlainIntent(input.intent);
  if (
    input.intent !== undefined &&
    input.intent !== null &&
    intent === null &&
    !(typeof input.intent === "string" && !input.intent.trim())
  ) {
    return hold(
      "INVALID_TOPIC",
      "Intent must be plain text within length limits, without HTML.",
      topic,
      null
    );
  }

  if (!input.permissions?.blog) {
    return hold(
      "BLOG_PERMISSION_DENIED",
      "Blog inventory is not available for this role. Planning coverage cannot be checked.",
      topic,
      intent
    );
  }

  const mapped = mapOverviewBlogToMatchInventory(input.blog);
  if (!mapped.ok) {
    if (mapped.reason === "unavailable") {
      return hold(
        "INVENTORY_UNAVAILABLE",
        "HOLD — Blog inventory unavailable or not verifiably complete.",
        topic,
        intent
      );
    }
    return hold(
      "INVENTORY_MALFORMED",
      "HOLD — Blog inventory unavailable or not verifiably complete.",
      topic,
      intent
    );
  }

  // Empty array cannot be distinguished from a failed DB read in the overview API.
  if (mapped.rows.length === 0) {
    return hold(
      "INVENTORY_EMPTY_UNVERIFIED",
      "HOLD — Blog inventory unavailable or not verifiably complete. An empty list is not treated as proof that no Blog posts exist.",
      topic,
      intent
    );
  }

  const ab4 = matchBlogOpportunity(
    {
      topic,
      intent,
    },
    mapped.rows
  );

  if (ab4.reasonCodes.includes("INVALID_INPUT")) {
    return hold(
      "AB4_INVALID_INPUT",
      "HOLD — Existing-content matching could not run on the supplied topic or inventory.",
      topic,
      intent
    );
  }

  const handoff = toBlogOpportunityExistingContent(ab4);
  const opportunityId =
    SEO_PLANNING_EVAL_OPPORTUNITY_ID.length <= MAX_OPPORTUNITY_ID_CHARS
      ? SEO_PLANNING_EVAL_OPPORTUNITY_ID
      : SEO_PLANNING_EVAL_OPPORTUNITY_ID.slice(0, MAX_OPPORTUNITY_ID_CHARS);

  const decision = evaluateBlogOpportunity({
    opportunityId,
    topic,
    intent,
    evidenceState: "missing",
    existingContent: handoff.existingContent,
    newBlogCandidate: handoff.newBlogCandidate,
    reasonEvidence: ab4.reasonCodes.map((c) => `ab4:${c}`),
  });

  if (
    decision.action !== "DO_NOTHING" ||
    !decision.reasonCodes.includes("EVIDENCE_MISSING") ||
    decision.schedulerEligible !== false
  ) {
    return hold(
      "AB3_INVARIANT_FAILED",
      "HOLD — Planning preview failed an evidence-safety check. No content action is recommended.",
      topic,
      intent
    );
  }

  const matchedTitle = matchTitleFromInventory(ab4, mapped.rows);
  let coverageMessage: string;
  if (ab4.match === "NONE") {
    coverageMessage =
      "No matching Blog detected in the available inventory. This does not approve creating a new article.";
  } else {
    coverageMessage =
      "Potential existing Blog match found. Matching is a deterministic heuristic, not a definitive cannibalization finding.";
  }

  return {
    status: "preview",
    holdCode: null,
    message: `${coverageMessage} Existing-content review is advisory. Grounded research is required before any content action can be recommended.`,
    topic,
    intent,
    evidenceState: "missing",
    evidenceLabel: "NOT YET COLLECTED",
    planningDecision: "HOLD",
    match: {
      kind: ab4.match,
      title: matchedTitle,
      status: ab4.matchedStatus,
      url: ab4.matchedUrl,
      entityId: ab4.matchedEntityId,
      reasonCodes: ab4.reasonCodes,
      heuristicNote:
        "Deterministic AB-4 coverage check only — not Google indexing status or a publish recommendation.",
    },
    decision: {
      action: decision.action,
      reasonCodes: decision.reasonCodes,
      explanation: decision.explanation,
      schedulerEligible: false,
    },
    canOpenBlog:
      input.permissions.blogManage === true &&
      (ab4.match === "EXACT" || ab4.match === "STRONG"),
    ab4ReasonCodes: ab4.reasonCodes,
    ab3ReasonCodes: decision.reasonCodes,
  };
}
