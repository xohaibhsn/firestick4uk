/**
 * AB-3 — Pure deterministic Blog Opportunity / Next-Best-Action engine.
 *
 * Accepts already-normalized factual signals and returns exactly ONE action.
 * Does not discover opportunities, score, research, persist, or schedule.
 *
 * Phase boundaries:
 * - AB-4: refresh-first / dedup / cannibalization matching
 * - AB-5: priority / uncertainty / cost ranking
 * - AB-7: evidence / research
 */

export const BLOG_NEXT_BEST_ACTIONS = [
  "NEW_BLOG",
  "REFRESH_EXISTING",
  "TITLE_META_UPDATE",
  "INTERNAL_LINKS",
  "IMAGE",
  "INDEXING_REVIEW",
  "TECHNICAL_FIX",
  "HISTORICAL_RECOVERY",
  "DO_NOTHING",
] as const;

export type BlogNextBestAction = (typeof BLOG_NEXT_BEST_ACTIONS)[number];

export type BlogOpportunityEvidenceState = "ready" | "missing" | "stale";

/**
 * Existing-content remediation disposition supplied by future AB-4 matching.
 * Existing known-page remediation always wins over NEW_BLOG when present.
 */
export type ExistingContentDisposition =
  | "none"
  | "refresh"
  | "metadata"
  | "internal_links"
  | "image"
  | "technical"
  | "indexing"
  | "historical_recovery";

export type BlogOpportunityReasonCode =
  | "INVALID_INPUT"
  | "EVIDENCE_MISSING"
  | "EVIDENCE_STALE"
  | "TECHNICAL_BLOCKER"
  | "HISTORICAL_RECOVERY_CANDIDATE"
  | "INDEXING_REVIEW_REQUIRED"
  | "EXISTING_CONTENT_REFRESH"
  | "METADATA_ONLY"
  | "INTERNAL_LINK_GAP"
  | "IMAGE_GAP"
  | "NO_EXISTING_CONTENT"
  | "NEW_BLOG_EVIDENCE_READY"
  | "NO_ACTIONABLE_SIGNAL";

export type BlogOpportunityInput = {
  opportunityId: string;
  topic: string;
  intent?: string | null;
  evidenceState: BlogOpportunityEvidenceState;
  existingContent: {
    disposition: ExistingContentDisposition;
    entityId?: number | null;
    url?: string | null;
  };
  newBlogCandidate: boolean;
  reasonEvidence?: string[];
};

export type BlogOpportunityDecision = {
  opportunityId: string;
  action: BlogNextBestAction;
  target: {
    entityId: number | null;
    url: string | null;
  };
  schedulerEligible: boolean;
  reasonCodes: BlogOpportunityReasonCode[];
  explanation: string;
};

export const MAX_BLOG_OPPORTUNITY_BATCH = 100;
export const MAX_OPPORTUNITY_ID_CHARS = 128;
export const MAX_TOPIC_CHARS = 200;
export const MAX_INTENT_CHARS = 200;
export const MAX_URL_CHARS = 500;
export const MAX_REASON_EVIDENCE_ITEMS = 12;
export const MAX_REASON_EVIDENCE_CHARS = 240;

const EVIDENCE_STATES = new Set<BlogOpportunityEvidenceState>([
  "ready",
  "missing",
  "stale",
]);

const DISPOSITIONS = new Set<ExistingContentDisposition>([
  "none",
  "refresh",
  "metadata",
  "internal_links",
  "image",
  "technical",
  "indexing",
  "historical_recovery",
]);

const SITE_HOST = "firestick4uk.com";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function clampText(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

/** On-site HTTPS Firestick4UK URL (apex host only). */
export function isOnSiteFirestickUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const raw = value.trim();
  if (!raw || raw.length > MAX_URL_CHARS) return false;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  if (u.hostname !== SITE_HOST) return false;
  if (u.port && u.port !== "443") return false;
  if (u.username || u.password) return false;
  return true;
}

/**
 * Scheduler may eventually publish ONLY genuine NEW_BLOG decisions.
 * Does not schedule anything.
 */
export function isAutonomousNewBlogEligible(
  action: BlogNextBestAction | unknown
): boolean {
  return action === "NEW_BLOG";
}

type ParsedOk = {
  ok: true;
  value: {
    opportunityId: string;
    topic: string;
    intent: string | null;
    evidenceState: BlogOpportunityEvidenceState;
    disposition: ExistingContentDisposition;
    entityId: number | null;
    url: string | null;
    newBlogCandidate: boolean;
    reasonEvidence: string[];
  };
};

type ParsedBad = { ok: false };

function parseInput(raw: unknown): ParsedOk | ParsedBad {
  if (!isPlainObject(raw)) return { ok: false };

  if (typeof raw.opportunityId !== "string") return { ok: false };
  const opportunityId = raw.opportunityId.trim();
  if (!opportunityId || opportunityId.length > MAX_OPPORTUNITY_ID_CHARS) {
    return { ok: false };
  }

  if (typeof raw.topic !== "string") return { ok: false };
  const topic = raw.topic.trim();
  if (!topic || topic.length > MAX_TOPIC_CHARS) return { ok: false };

  let intent: string | null = null;
  if (raw.intent !== undefined && raw.intent !== null) {
    if (typeof raw.intent !== "string") return { ok: false };
    const trimmed = raw.intent.trim();
    if (trimmed.length > MAX_INTENT_CHARS) return { ok: false };
    intent = trimmed || null;
  }

  if (
    typeof raw.evidenceState !== "string" ||
    !EVIDENCE_STATES.has(raw.evidenceState as BlogOpportunityEvidenceState)
  ) {
    return { ok: false };
  }

  if (!isPlainObject(raw.existingContent)) return { ok: false };
  const existing = raw.existingContent;
  if (
    typeof existing.disposition !== "string" ||
    !DISPOSITIONS.has(existing.disposition as ExistingContentDisposition)
  ) {
    return { ok: false };
  }

  let entityId: number | null = null;
  if (existing.entityId !== undefined && existing.entityId !== null) {
    if (
      typeof existing.entityId !== "number" ||
      !Number.isFinite(existing.entityId) ||
      !Number.isInteger(existing.entityId) ||
      existing.entityId <= 0
    ) {
      return { ok: false };
    }
    entityId = existing.entityId;
  }

  let url: string | null = null;
  if (existing.url !== undefined && existing.url !== null) {
    if (!isOnSiteFirestickUrl(existing.url)) return { ok: false };
    url = String(existing.url).trim();
  }

  if (typeof raw.newBlogCandidate !== "boolean") return { ok: false };

  const reasonEvidence: string[] = [];
  if (raw.reasonEvidence !== undefined && raw.reasonEvidence !== null) {
    if (!Array.isArray(raw.reasonEvidence)) return { ok: false };
    if (raw.reasonEvidence.length > MAX_REASON_EVIDENCE_ITEMS) return { ok: false };
    for (const item of raw.reasonEvidence) {
      if (typeof item !== "string") return { ok: false };
      const t = item.trim();
      if (!t || t.length > MAX_REASON_EVIDENCE_CHARS) return { ok: false };
      reasonEvidence.push(t);
    }
  }

  return {
    ok: true,
    value: {
      opportunityId,
      topic,
      intent,
      evidenceState: raw.evidenceState as BlogOpportunityEvidenceState,
      disposition: existing.disposition as ExistingContentDisposition,
      entityId,
      url,
      newBlogCandidate: raw.newBlogCandidate,
      reasonEvidence,
    },
  };
}

function decision(args: {
  opportunityId: string;
  action: BlogNextBestAction;
  entityId: number | null;
  url: string | null;
  reasonCodes: BlogOpportunityReasonCode[];
  explanation: string;
}): BlogOpportunityDecision {
  return {
    opportunityId: args.opportunityId,
    action: args.action,
    target: {
      entityId: args.entityId,
      url: args.url,
    },
    schedulerEligible: isAutonomousNewBlogEligible(args.action),
    reasonCodes: args.reasonCodes.slice(),
    explanation: clampText(args.explanation, 280),
  };
}

function nothing(
  opportunityId: string,
  reasonCodes: BlogOpportunityReasonCode[],
  explanation: string
): BlogOpportunityDecision {
  return decision({
    opportunityId: opportunityId || "invalid",
    action: "DO_NOTHING",
    entityId: null,
    url: null,
    reasonCodes,
    explanation,
  });
}

/**
 * Evaluate one opportunity signal → exactly one Next Best Action.
 *
 * Precedence (existing-content remediation wins over NEW_BLOG):
 * invalid → evidence not ready → technical → historical → indexing →
 * refresh → metadata → internal_links → image →
 * none+newBlogCandidate → DO_NOTHING
 */
export function evaluateBlogOpportunity(raw: unknown): BlogOpportunityDecision {
  const parsed = parseInput(raw);
  if (!parsed.ok) {
    return nothing("invalid", ["INVALID_INPUT"], "Input failed validation.");
  }

  const v = parsed.value;

  if (v.evidenceState === "missing") {
    return nothing(v.opportunityId, ["EVIDENCE_MISSING"], "Evidence is missing.");
  }
  if (v.evidenceState === "stale") {
    return nothing(v.opportunityId, ["EVIDENCE_STALE"], "Evidence is stale.");
  }

  // evidenceState === "ready"
  const targetEntity = v.entityId;
  const targetUrl = v.url;

  switch (v.disposition) {
    case "technical":
      return decision({
        opportunityId: v.opportunityId,
        action: "TECHNICAL_FIX",
        entityId: targetEntity,
        url: targetUrl,
        reasonCodes: ["TECHNICAL_BLOCKER"],
        explanation:
          "Existing content has a technical disposition; remediate before creating a new blog.",
      });
    case "historical_recovery":
      return decision({
        opportunityId: v.opportunityId,
        action: "HISTORICAL_RECOVERY",
        entityId: targetEntity,
        url: targetUrl,
        reasonCodes: ["HISTORICAL_RECOVERY_CANDIDATE"],
        explanation:
          "Existing content is flagged for historical recovery; recover before NEW_BLOG.",
      });
    case "indexing":
      return decision({
        opportunityId: v.opportunityId,
        action: "INDEXING_REVIEW",
        entityId: targetEntity,
        url: targetUrl,
        reasonCodes: ["INDEXING_REVIEW_REQUIRED"],
        explanation:
          "Existing content needs indexing review; do not create a competing new blog.",
      });
    case "refresh":
      return decision({
        opportunityId: v.opportunityId,
        action: "REFRESH_EXISTING",
        entityId: targetEntity,
        url: targetUrl,
        reasonCodes: ["EXISTING_CONTENT_REFRESH"],
        explanation:
          "Existing content refresh wins over NEW_BLOG to avoid duplication.",
      });
    case "metadata":
      return decision({
        opportunityId: v.opportunityId,
        action: "TITLE_META_UPDATE",
        entityId: targetEntity,
        url: targetUrl,
        reasonCodes: ["METADATA_ONLY"],
        explanation:
          "Existing content needs title/meta update; metadata remediation precedes NEW_BLOG.",
      });
    case "internal_links":
      return decision({
        opportunityId: v.opportunityId,
        action: "INTERNAL_LINKS",
        entityId: targetEntity,
        url: targetUrl,
        reasonCodes: ["INTERNAL_LINK_GAP"],
        explanation:
          "Existing content has an internal-link gap; link remediation precedes NEW_BLOG.",
      });
    case "image":
      return decision({
        opportunityId: v.opportunityId,
        action: "IMAGE",
        entityId: targetEntity,
        url: targetUrl,
        reasonCodes: ["IMAGE_GAP"],
        explanation:
          "Existing content has an image gap; image remediation precedes NEW_BLOG.",
      });
    case "none":
      if (v.newBlogCandidate) {
        return decision({
          opportunityId: v.opportunityId,
          action: "NEW_BLOG",
          entityId: null,
          url: null,
          reasonCodes: ["NO_EXISTING_CONTENT", "NEW_BLOG_EVIDENCE_READY"],
          explanation:
            "No existing-content disposition and evidence is ready for a new blog candidate.",
        });
      }
      return nothing(
        v.opportunityId,
        ["NO_ACTIONABLE_SIGNAL"],
        "No existing-content disposition and no new-blog candidate."
      );
    default:
      return nothing(
        v.opportunityId,
        ["INVALID_INPUT"],
        "Unrecognized existing-content disposition."
      );
  }
}

/**
 * Batch evaluate up to MAX_BLOG_OPPORTUNITY_BATCH opportunities.
 * Preserves input order. No ranking. Oversize batch → fail-closed DO_NOTHING.
 */
export function evaluateBlogOpportunities(
  inputs: unknown
): BlogOpportunityDecision[] {
  if (!Array.isArray(inputs)) {
    return [
      nothing("invalid", ["INVALID_INPUT"], "Batch input must be an array."),
    ];
  }
  if (inputs.length > MAX_BLOG_OPPORTUNITY_BATCH) {
    return [
      nothing(
        "invalid",
        ["INVALID_INPUT"],
        `Batch exceeds maximum of ${MAX_BLOG_OPPORTUNITY_BATCH}.`
      ),
    ];
  }
  return inputs.map((item) => evaluateBlogOpportunity(item));
}

/**
 * Optional pure adapter: map a supplied SeoDiagnosticIssue-like category
 * into an ExistingContentDisposition. Does not run diagnostics.
 */
export function dispositionFromSeoDiagnosticCategory(
  category: unknown
): ExistingContentDisposition | null {
  if (category === "canonical") return "technical";
  if (category === "indexing") return "indexing";
  if (category === "metadata") return "metadata";
  if (category === "media") return "image";
  return null;
}
