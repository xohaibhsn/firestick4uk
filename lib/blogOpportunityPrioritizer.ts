/**
 * AB-5 — Pure deterministic Blog opportunity prioritization.
 *
 * Ranks already-decided AB-3 opportunities. It does not discover an
 * opportunity, change its action, perform matching, persist, or authorize
 * execution. Cost values are relative execution-effort classes only; actual
 * runtime usage accounting belongs to AB-11.
 */

import {
  BLOG_NEXT_BEST_ACTIONS,
  MAX_OPPORTUNITY_ID_CHARS,
  isOnSiteFirestickUrl,
  type BlogNextBestAction,
  type BlogOpportunityDecision,
  type BlogOpportunityReasonCode,
} from "@/lib/blogOpportunityEngine";

export const MAX_BLOG_PRIORITY_BATCH = 100;
export const MAX_PRIORITY_UNCERTAINTY_REASONS = 12;
export const MAX_PRIORITY_UNCERTAINTY_REASON_CHARS = 240;

export const BLOG_PRIORITY_UNCERTAINTIES = [
  "low",
  "medium",
  "high",
] as const;

export type BlogPriorityUncertainty =
  (typeof BLOG_PRIORITY_UNCERTAINTIES)[number];

export const BLOG_RELATIVE_ACTION_COSTS = [
  "none",
  "low",
  "medium",
  "high",
  "variable",
] as const;

export type BlogRelativeActionCost =
  (typeof BLOG_RELATIVE_ACTION_COSTS)[number];

export type BlogPriorityTier = 0 | 1 | 2 | 3 | 9;

export type BlogPriorityClass =
  | "BLOCKING_TECHNICAL"
  | "REUSE_EXISTING"
  | "IMPROVE_EXISTING"
  | "CREATE_NEW"
  | "NO_ACTION";

export type BlogPriorityReasonCode =
  | "TECHNICAL_PRIORITY"
  | "INDEXING_PRIORITY"
  | "EXISTING_CONTENT_REUSE"
  | "EXISTING_CONTENT_IMPROVEMENT"
  | "NEW_CONTENT_CREATION"
  | "NO_ACTION"
  | "LOW_UNCERTAINTY"
  | "MEDIUM_UNCERTAINTY"
  | "HIGH_UNCERTAINTY_REVIEW"
  | "COST_NONE"
  | "COST_LOW"
  | "COST_MEDIUM"
  | "COST_HIGH"
  | "COST_VARIABLE"
  | "INVALID_INPUT";

export type BlogPriorityInput = {
  decision: BlogOpportunityDecision;
  uncertainty: BlogPriorityUncertainty;
  uncertaintyReasons?: string[];
};

export type BlogPrioritizedOpportunity = {
  opportunityId: string;
  action: BlogNextBestAction;
  priorityTier: BlogPriorityTier;
  priorityClass: BlogPriorityClass;
  uncertainty: BlogPriorityUncertainty;
  estimatedCost: BlogRelativeActionCost;
  reviewRequired: boolean;
  rankable: boolean;
  target: {
    entityId: number | null;
    url: string | null;
  };
  reasonCodes: BlogPriorityReasonCode[];
};

type PriorityPolicy = {
  priorityTier: BlogPriorityTier;
  priorityClass: BlogPriorityClass;
  reasonCode: BlogPriorityReasonCode;
};

const PRIORITY_POLICY: Record<BlogNextBestAction, PriorityPolicy> = {
  TECHNICAL_FIX: {
    priorityTier: 0,
    priorityClass: "BLOCKING_TECHNICAL",
    reasonCode: "TECHNICAL_PRIORITY",
  },
  INDEXING_REVIEW: {
    priorityTier: 0,
    priorityClass: "BLOCKING_TECHNICAL",
    reasonCode: "INDEXING_PRIORITY",
  },
  HISTORICAL_RECOVERY: {
    priorityTier: 1,
    priorityClass: "REUSE_EXISTING",
    reasonCode: "EXISTING_CONTENT_REUSE",
  },
  REFRESH_EXISTING: {
    priorityTier: 1,
    priorityClass: "REUSE_EXISTING",
    reasonCode: "EXISTING_CONTENT_REUSE",
  },
  TITLE_META_UPDATE: {
    priorityTier: 2,
    priorityClass: "IMPROVE_EXISTING",
    reasonCode: "EXISTING_CONTENT_IMPROVEMENT",
  },
  INTERNAL_LINKS: {
    priorityTier: 2,
    priorityClass: "IMPROVE_EXISTING",
    reasonCode: "EXISTING_CONTENT_IMPROVEMENT",
  },
  IMAGE: {
    priorityTier: 2,
    priorityClass: "IMPROVE_EXISTING",
    reasonCode: "EXISTING_CONTENT_IMPROVEMENT",
  },
  NEW_BLOG: {
    priorityTier: 3,
    priorityClass: "CREATE_NEW",
    reasonCode: "NEW_CONTENT_CREATION",
  },
  DO_NOTHING: {
    priorityTier: 9,
    priorityClass: "NO_ACTION",
    reasonCode: "NO_ACTION",
  },
};

const ACTION_COST: Record<BlogNextBestAction, BlogRelativeActionCost> = {
  DO_NOTHING: "none",
  TITLE_META_UPDATE: "low",
  INTERNAL_LINKS: "low",
  INDEXING_REVIEW: "low",
  IMAGE: "medium",
  REFRESH_EXISTING: "medium",
  HISTORICAL_RECOVERY: "medium",
  NEW_BLOG: "high",
  TECHNICAL_FIX: "variable",
};

const UNCERTAINTY_RANK: Record<BlogPriorityUncertainty, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

const COST_RANK: Record<BlogRelativeActionCost, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  variable: 4,
};

const ACTIONS = new Set<BlogNextBestAction>(BLOG_NEXT_BEST_ACTIONS);
const UNCERTAINTIES = new Set<BlogPriorityUncertainty>(
  BLOG_PRIORITY_UNCERTAINTIES
);

const AB3_REASON_CODES = new Set<BlogOpportunityReasonCode>([
  "INVALID_INPUT",
  "EVIDENCE_MISSING",
  "EVIDENCE_STALE",
  "TECHNICAL_BLOCKER",
  "HISTORICAL_RECOVERY_CANDIDATE",
  "INDEXING_REVIEW_REQUIRED",
  "EXISTING_CONTENT_REFRESH",
  "METADATA_ONLY",
  "INTERNAL_LINK_GAP",
  "IMAGE_GAP",
  "NO_EXISTING_CONTENT",
  "NEW_BLOG_EVIDENCE_READY",
  "NO_ACTIONABLE_SIGNAL",
]);

const INPUT_KEYS = new Set(["decision", "uncertainty", "uncertaintyReasons"]);
const REQUIRED_INPUT_KEYS = new Set(["decision", "uncertainty"]);
const DECISION_KEYS = new Set([
  "opportunityId",
  "action",
  "target",
  "schedulerEligible",
  "reasonCodes",
  "explanation",
]);
const REQUIRED_DECISION_KEYS = new Set(DECISION_KEYS);
const TARGET_KEYS = new Set(["entityId", "url"]);
const REQUIRED_TARGET_KEYS = new Set(TARGET_KEYS);

const AB3_REASON_SEQUENCES: Record<
  BlogNextBestAction,
  readonly (readonly BlogOpportunityReasonCode[])[]
> = {
  TECHNICAL_FIX: [["TECHNICAL_BLOCKER"]],
  INDEXING_REVIEW: [["INDEXING_REVIEW_REQUIRED"]],
  HISTORICAL_RECOVERY: [["HISTORICAL_RECOVERY_CANDIDATE"]],
  REFRESH_EXISTING: [["EXISTING_CONTENT_REFRESH"]],
  TITLE_META_UPDATE: [["METADATA_ONLY"]],
  INTERNAL_LINKS: [["INTERNAL_LINK_GAP"]],
  IMAGE: [["IMAGE_GAP"]],
  NEW_BLOG: [["NO_EXISTING_CONTENT", "NEW_BLOG_EVIDENCE_READY"]],
  DO_NOTHING: [
    ["INVALID_INPUT"],
    ["EVIDENCE_MISSING"],
    ["EVIDENCE_STALE"],
    ["NO_ACTIONABLE_SIGNAL"],
  ],
};

type DataSnapshot = { ok: true; value: Record<string, unknown> } | { ok: false };

type ArraySnapshot = { ok: true; value: unknown[] } | { ok: false };

/**
 * Snapshot exact own enumerable data properties without invoking accessors.
 * Hidden fields, symbols, accessors, inherited records, and reflection errors
 * fail closed.
 */
function snapshotDataObject(
  raw: unknown,
  allowedKeys: Set<string>,
  requiredKeys: Set<string>
): DataSnapshot {
  try {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return { ok: false };
    }
    const prototype = Object.getPrototypeOf(raw);
    if (prototype !== Object.prototype && prototype !== null) {
      return { ok: false };
    }

    const snapshot: Record<string, unknown> = Object.create(null);
    for (const key of Reflect.ownKeys(raw)) {
      if (typeof key !== "string" || !allowedKeys.has(key)) {
        return { ok: false };
      }
      const descriptor = Object.getOwnPropertyDescriptor(raw, key);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
        return { ok: false };
      }
      snapshot[key] = descriptor.value;
    }

    for (const key of requiredKeys) {
      if (!Object.prototype.hasOwnProperty.call(snapshot, key)) {
        return { ok: false };
      }
    }
    return { ok: true, value: snapshot };
  } catch {
    return { ok: false };
  }
}

/** Snapshot a bounded dense array without calling caller-owned methods. */
function snapshotDenseArray(raw: unknown, maxItems: number): ArraySnapshot {
  try {
    if (!Array.isArray(raw)) return { ok: false };
    const lengthDescriptor = Object.getOwnPropertyDescriptor(raw, "length");
    if (!lengthDescriptor || !("value" in lengthDescriptor)) {
      return { ok: false };
    }
    const length = lengthDescriptor.value;
    if (
      typeof length !== "number" ||
      !Number.isInteger(length) ||
      length < 0 ||
      length > maxItems
    ) {
      return { ok: false };
    }

    const ownKeys = Reflect.ownKeys(raw);
    if (ownKeys.length !== length + 1 || !ownKeys.includes("length")) {
      return { ok: false };
    }

    const values: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(raw, String(index));
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
        return { ok: false };
      }
      values.push(descriptor.value);
    }
    return { ok: true, value: values };
  } catch {
    return { ok: false };
  }
}

function reasonCodesMatchAction(
  action: BlogNextBestAction,
  reasonCodes: BlogOpportunityReasonCode[]
): boolean {
  return AB3_REASON_SEQUENCES[action].some(
    (expected) =>
      expected.length === reasonCodes.length &&
      expected.every((code, index) => code === reasonCodes[index])
  );
}

function parseTarget(
  raw: unknown
): { ok: true; value: BlogOpportunityDecision["target"] } | { ok: false } {
  const snapshot = snapshotDataObject(raw, TARGET_KEYS, REQUIRED_TARGET_KEYS);
  if (!snapshot.ok) return { ok: false };
  const value = snapshot.value;

  let entityId: number | null = null;
  if (value.entityId !== null) {
    if (
      typeof value.entityId !== "number" ||
      !Number.isFinite(value.entityId) ||
      !Number.isInteger(value.entityId) ||
      value.entityId <= 0
    ) {
      return { ok: false };
    }
    entityId = value.entityId;
  }

  let url: string | null = null;
  if (value.url !== null) {
    if (
      typeof value.url !== "string" ||
      value.url !== value.url.trim() ||
      !isOnSiteFirestickUrl(value.url)
    ) {
      return { ok: false };
    }
    url = value.url;
  }

  return { ok: true, value: { entityId, url } };
}

function parseDecision(
  raw: unknown
): { ok: true; value: BlogOpportunityDecision } | { ok: false } {
  const snapshot = snapshotDataObject(
    raw,
    DECISION_KEYS,
    REQUIRED_DECISION_KEYS
  );
  if (!snapshot.ok) return { ok: false };
  const value = snapshot.value;

  if (
    typeof value.opportunityId !== "string" ||
    !value.opportunityId ||
    value.opportunityId !== value.opportunityId.trim() ||
    value.opportunityId.length > MAX_OPPORTUNITY_ID_CHARS
  ) {
    return { ok: false };
  }

  if (
    typeof value.action !== "string" ||
    !ACTIONS.has(value.action as BlogNextBestAction)
  ) {
    return { ok: false };
  }
  const action = value.action as BlogNextBestAction;

  const target = parseTarget(value.target);
  if (!target.ok) return { ok: false };

  if (
    typeof value.schedulerEligible !== "boolean" ||
    value.schedulerEligible !== (action === "NEW_BLOG")
  ) {
    return { ok: false };
  }

  const reasonSnapshot = snapshotDenseArray(value.reasonCodes, 12);
  if (!reasonSnapshot.ok || reasonSnapshot.value.length < 1) {
    return { ok: false };
  }
  const reasonCodes: BlogOpportunityReasonCode[] = [];
  const seenReasonCodes = new Set<BlogOpportunityReasonCode>();
  for (const code of reasonSnapshot.value) {
    if (
      typeof code !== "string" ||
      !AB3_REASON_CODES.has(code as BlogOpportunityReasonCode) ||
      seenReasonCodes.has(code as BlogOpportunityReasonCode)
    ) {
      return { ok: false };
    }
    const typedCode = code as BlogOpportunityReasonCode;
    seenReasonCodes.add(typedCode);
    reasonCodes.push(typedCode);
  }
  if (!reasonCodesMatchAction(action, reasonCodes)) return { ok: false };

  if (
    (action === "NEW_BLOG" || action === "DO_NOTHING") &&
    (target.value.entityId !== null || target.value.url !== null)
  ) {
    return { ok: false };
  }

  if (
    typeof value.explanation !== "string" ||
    !value.explanation.trim() ||
    value.explanation !== value.explanation.trim() ||
    value.explanation.length > 280
  ) {
    return { ok: false };
  }

  return {
    ok: true,
    value: {
      opportunityId: value.opportunityId,
      action,
      target: target.value,
      schedulerEligible: value.schedulerEligible,
      reasonCodes,
      explanation: value.explanation,
    },
  };
}

function parsePriorityInput(
  raw: unknown
): { ok: true; value: BlogPriorityInput } | { ok: false } {
  const snapshot = snapshotDataObject(raw, INPUT_KEYS, REQUIRED_INPUT_KEYS);
  if (!snapshot.ok) return { ok: false };
  const value = snapshot.value;

  const decision = parseDecision(value.decision);
  if (!decision.ok) return { ok: false };

  if (
    typeof value.uncertainty !== "string" ||
    !UNCERTAINTIES.has(value.uncertainty as BlogPriorityUncertainty)
  ) {
    return { ok: false };
  }

  let uncertaintyReasons: string[] | undefined;
  if (value.uncertaintyReasons !== undefined) {
    const reasonsSnapshot = snapshotDenseArray(
      value.uncertaintyReasons,
      MAX_PRIORITY_UNCERTAINTY_REASONS
    );
    if (!reasonsSnapshot.ok) return { ok: false };
    uncertaintyReasons = [];
    for (const reason of reasonsSnapshot.value) {
      if (
        typeof reason !== "string" ||
        !reason.trim() ||
        reason !== reason.trim() ||
        reason.length > MAX_PRIORITY_UNCERTAINTY_REASON_CHARS
      ) {
        return { ok: false };
      }
      uncertaintyReasons.push(reason);
    }
  }

  return {
    ok: true,
    value: {
      decision: decision.value,
      uncertainty: value.uncertainty as BlogPriorityUncertainty,
      ...(uncertaintyReasons === undefined ? {} : { uncertaintyReasons }),
    },
  };
}

function invalidPrioritizedOpportunity(): BlogPrioritizedOpportunity {
  return {
    opportunityId: "invalid",
    action: "DO_NOTHING",
    priorityTier: 9,
    priorityClass: "NO_ACTION",
    // Conservative sentinel for malformed data; INVALID_INPUT is not rankable.
    uncertainty: "high",
    estimatedCost: "none",
    reviewRequired: false,
    rankable: false,
    target: {
      entityId: null,
      url: null,
    },
    reasonCodes: ["INVALID_INPUT"],
  };
}

function uncertaintyReason(
  uncertainty: BlogPriorityUncertainty
): BlogPriorityReasonCode {
  if (uncertainty === "low") return "LOW_UNCERTAINTY";
  if (uncertainty === "medium") return "MEDIUM_UNCERTAINTY";
  return "HIGH_UNCERTAINTY_REVIEW";
}

function costReason(cost: BlogRelativeActionCost): BlogPriorityReasonCode {
  if (cost === "none") return "COST_NONE";
  if (cost === "low") return "COST_LOW";
  if (cost === "medium") return "COST_MEDIUM";
  if (cost === "high") return "COST_HIGH";
  return "COST_VARIABLE";
}

/** Stable action-to-tier policy. Unknown actions fail closed with null. */
export function getBlogActionPriority(
  action: BlogNextBestAction | unknown
): PriorityPolicy | null {
  if (typeof action !== "string" || !ACTIONS.has(action as BlogNextBestAction)) {
    return null;
  }
  const policy = PRIORITY_POLICY[action as BlogNextBestAction];
  return { ...policy };
}

/** Relative expected implementation effort only; unknown actions return null. */
export function estimateBlogActionCost(
  action: BlogNextBestAction | unknown
): BlogRelativeActionCost | null {
  if (typeof action !== "string" || !ACTIONS.has(action as BlogNextBestAction)) {
    return null;
  }
  return ACTION_COST[action as BlogNextBestAction];
}

/** Normalization is used only for deterministic duplicate and tie handling. */
export function normalizeBlogPriorityOpportunityId(value: string): string {
  return value.trim().normalize("NFKC").toLowerCase();
}

/** Rank one already-produced AB-3 decision without changing that decision. */
export function prioritizeBlogOpportunity(
  input: BlogPriorityInput | unknown
): BlogPrioritizedOpportunity {
  const parsed = parsePriorityInput(input);
  if (!parsed.ok) return invalidPrioritizedOpportunity();

  const { decision, uncertainty } = parsed.value;
  const policy = getBlogActionPriority(decision.action);
  const estimatedCost = estimateBlogActionCost(decision.action);
  if (!policy || !estimatedCost) return invalidPrioritizedOpportunity();

  const noAction = decision.action === "DO_NOTHING";
  const reasonCodes: BlogPriorityReasonCode[] = noAction
    ? [policy.reasonCode, costReason(estimatedCost)]
    : [
        policy.reasonCode,
        uncertaintyReason(uncertainty),
        costReason(estimatedCost),
      ];

  return {
    opportunityId: decision.opportunityId,
    action: decision.action,
    priorityTier: policy.priorityTier,
    priorityClass: policy.priorityClass,
    uncertainty,
    estimatedCost,
    reviewRequired: noAction ? false : uncertainty === "high",
    rankable: !noAction,
    target: {
      entityId: decision.target.entityId,
      url: decision.target.url,
    },
    reasonCodes,
  };
}

function compareText(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function comparePrioritized(
  a: BlogPrioritizedOpportunity,
  b: BlogPrioritizedOpportunity
): number {
  if (a.priorityTier !== b.priorityTier) {
    return a.priorityTier - b.priorityTier;
  }

  const aUncertainty = UNCERTAINTY_RANK[a.uncertainty];
  const bUncertainty = UNCERTAINTY_RANK[b.uncertainty];
  if (aUncertainty !== bUncertainty) return aUncertainty - bUncertainty;

  const costDifference = COST_RANK[a.estimatedCost] - COST_RANK[b.estimatedCost];
  if (costDifference !== 0) return costDifference;

  const actionDifference = compareText(a.action, b.action);
  if (actionDifference !== 0) return actionDifference;

  return compareText(
    normalizeBlogPriorityOpportunityId(a.opportunityId),
    normalizeBlogPriorityOpportunityId(b.opportunityId)
  );
}

/**
 * Rank a complete batch. Any malformed entry, oversize batch, non-array input,
 * or normalized duplicate ID fails the whole batch closed. No item is dropped
 * or truncated, and caller-owned arrays and objects are never mutated.
 */
export function prioritizeBlogOpportunities(
  inputs: BlogPriorityInput[] | unknown
): BlogPrioritizedOpportunity[] {
  const batch = snapshotDenseArray(inputs, MAX_BLOG_PRIORITY_BATCH);
  if (!batch.ok) return [invalidPrioritizedOpportunity()];

  const prioritized: BlogPrioritizedOpportunity[] = [];
  let invalid = false;
  for (const input of batch.value) {
    const item = prioritizeBlogOpportunity(input);
    prioritized.push(item);
    if (item.reasonCodes.includes("INVALID_INPUT")) invalid = true;
  }
  if (invalid) {
    return [invalidPrioritizedOpportunity()];
  }

  const seenIds = new Set<string>();
  for (const item of prioritized) {
    const normalizedId = normalizeBlogPriorityOpportunityId(item.opportunityId);
    if (seenIds.has(normalizedId)) {
      return [invalidPrioritizedOpportunity()];
    }
    seenIds.add(normalizedId);
  }

  return prioritized.slice().sort(comparePrioritized);
}
