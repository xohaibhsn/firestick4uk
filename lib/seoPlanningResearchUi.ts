/**
 * JSEO-W3 — Pure client-side grounded research presentation helpers.
 *
 * No network, timers, storage, or AB-7A re-validation. Interprets the existing
 * /api/admin-blog-research envelope for ephemeral SEO panel UI only.
 */

import { BLOG_GROUNDED_RESEARCH_TASK } from "@/lib/blogGroundedResearchContracts";
import {
  MAX_INTENT_CHARS,
  MAX_OPPORTUNITY_ID_CHARS,
  MAX_TOPIC_CHARS,
} from "@/lib/blogOpportunityEngine";
import {
  MAX_BLOG_RESEARCH_CLAIM_CHARS,
  MAX_BLOG_RESEARCH_CLAIM_SOURCE_IDS,
  MAX_BLOG_RESEARCH_CLAIMS,
  MAX_BLOG_RESEARCH_PUBLISHED_AT_CHARS,
  MAX_BLOG_RESEARCH_SEARCH_QUERIES,
  MAX_BLOG_RESEARCH_SEARCH_QUERY_CHARS,
  MAX_BLOG_RESEARCH_SOURCE_ID_CHARS,
  MAX_BLOG_RESEARCH_SOURCE_TITLE_CHARS,
  MAX_BLOG_RESEARCH_SOURCES,
  MAX_BLOG_RESEARCH_SUMMARY_CHARS,
  MAX_BLOG_RESEARCH_UNKNOWN_CHARS,
  MAX_BLOG_RESEARCH_UNKNOWNS,
  MAX_BLOG_RESEARCH_URL_CHARS,
  MIN_BLOG_RESEARCH_CLAIMS,
  MIN_BLOG_RESEARCH_SOURCES,
} from "@/lib/blogResearchEvidence";
import type { SeoPlanningPreviewResult } from "@/lib/seoPlanningReadiness";

/** Soft ceiling for a complete plain-text editorial brief (fail closed if exceeded). */
const MAX_SEO_EDITORIAL_RESEARCH_BRIEF_CHARS = 48_000;

export type SeoPlanningResearchUiStatus =
  | "idle"
  | "loading"
  | "ready"
  | "missing"
  | "error";

export type SeoPlanningResearchSourceView = {
  id: string;
  title: string;
  url: string;
  publishedAt: string | null;
  linkable: boolean;
};

export type SeoPlanningResearchClaimView = {
  claim: string;
  sourceIds: string[];
};

export type SeoPlanningResearchSubjectSnapshot = {
  opportunityId: string;
  topic: string;
  intent: string | null;
};

export type SeoPlanningResearchUiState =
  | {
      status: "idle";
      message: string;
      subject: null;
      summary: null;
      sources: [];
      claims: [];
      unknowns: [];
      searchQueries: [];
      reasonCodes: [];
      httpStatus: null;
      errorCode: null;
    }
  | {
      status: "loading";
      message: string;
      subject: SeoPlanningResearchSubjectSnapshot;
      summary: null;
      sources: [];
      claims: [];
      unknowns: [];
      searchQueries: [];
      reasonCodes: [];
      httpStatus: null;
      errorCode: null;
    }
  | {
      status: "ready";
      message: string;
      subject: SeoPlanningResearchSubjectSnapshot;
      summary: string;
      sources: SeoPlanningResearchSourceView[];
      claims: SeoPlanningResearchClaimView[];
      unknowns: string[];
      searchQueries: string[];
      reasonCodes: string[];
      httpStatus: number;
      errorCode: null;
    }
  | {
      status: "missing";
      message: string;
      subject: SeoPlanningResearchSubjectSnapshot;
      summary: null;
      sources: [];
      claims: [];
      unknowns: [];
      searchQueries: [];
      reasonCodes: string[];
      httpStatus: number;
      errorCode: null;
    }
  | {
      status: "error";
      message: string;
      subject: SeoPlanningResearchSubjectSnapshot | null;
      summary: null;
      sources: [];
      claims: [];
      unknowns: [];
      searchQueries: [];
      reasonCodes: [];
      httpStatus: number | null;
      errorCode: string | null;
    };

export type SeoPlanningResearchRequestBody = {
  provider: "openai";
  task: "research_blog_evidence";
  opportunityId: string;
  topic: string;
  intent?: string;
};

let researchIdCounter = 0;

function normalizePlainText(value: unknown, maxChars: number): string | null {
  if (typeof value !== "string" || !value || value.length > maxChars) {
    return null;
  }
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)) return null;
  if (/[<>]/.test(value)) return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized || normalized.length > maxChars) return null;
  return normalized;
}

export function createIdleSeoPlanningResearchState(): SeoPlanningResearchUiState {
  return {
    status: "idle",
    message:
      "No research has been run for the current checked topic. Explicit Research with OpenAI is required. Results stay in this browser session only.",
    subject: null,
    summary: null,
    sources: [],
    claims: [],
    unknowns: [],
    searchQueries: [],
    reasonCodes: [],
    httpStatus: null,
    errorCode: null,
  };
}

export function createLoadingSeoPlanningResearchState(
  subject: SeoPlanningResearchSubjectSnapshot
): SeoPlanningResearchUiState {
  return {
    status: "loading",
    message: "OpenAI grounded research in progress.",
    subject,
    summary: null,
    sources: [],
    claims: [],
    unknowns: [],
    searchQueries: [],
    reasonCodes: [],
    httpStatus: null,
    errorCode: null,
  };
}

export function createSupersededSeoPlanningResearchState(): SeoPlanningResearchUiState {
  return {
    status: "error",
    message:
      "Previous research request was cancelled or superseded. Check coverage again for the current topic, then click Research with OpenAI deliberately. No automatic retry was performed.",
    subject: null,
    summary: null,
    sources: [],
    claims: [],
    unknowns: [],
    searchQueries: [],
    reasonCodes: [],
    httpStatus: null,
    errorCode: "request_aborted",
  };
}

/** Bounded per-click manual request id (not a persisted opportunity). */
export function createSeoPlanningResearchRequestId(
  nowMs: number = Date.now()
): string {
  researchIdCounter += 1;
  const raw = `manual-openai-research-${nowMs}-${researchIdCounter}`;
  if (raw.length <= MAX_OPPORTUNITY_ID_CHARS) return raw;
  return raw.slice(0, MAX_OPPORTUNITY_ID_CHARS);
}

export function normalizeSeoPlanningResearchIntent(
  intent: unknown
): string | null {
  if (intent === undefined || intent === null) return null;
  if (typeof intent !== "string") return null;
  if (!intent.trim()) return null;
  return normalizePlainText(intent, MAX_INTENT_CHARS);
}

export function planningInputsMatchCheckedPreview(input: {
  topic: unknown;
  intent?: unknown;
  preview: SeoPlanningPreviewResult | null | undefined;
}): boolean {
  if (!input.preview || input.preview.status !== "preview") return false;
  const topic = normalizePlainText(input.topic, MAX_TOPIC_CHARS);
  if (!topic || topic !== input.preview.topic) return false;
  const intent = normalizeSeoPlanningResearchIntent(input.intent);
  const previewIntent = input.preview.intent ?? null;
  return intent === previewIntent;
}

export function canRunSeoPlanningResearch(input: {
  role: string | null | undefined;
  blogPermission: boolean;
  blogManagePermission: boolean;
  overviewAvailable: boolean;
  preview: SeoPlanningPreviewResult | null | undefined;
  topic: unknown;
  intent?: unknown;
  researchInFlight: boolean;
}): boolean {
  if (input.researchInFlight) return false;
  if (input.role !== "super_admin") return false;
  if (!input.blogPermission || !input.blogManagePermission) return false;
  if (!input.overviewAvailable) return false;
  if (!input.preview || input.preview.status !== "preview") return false;
  if (input.preview.holdCode) return false;
  return planningInputsMatchCheckedPreview({
    topic: input.topic,
    intent: input.intent,
    preview: input.preview,
  });
}

export function buildSeoPlanningResearchRequestBody(input: {
  topic: unknown;
  intent?: unknown;
  opportunityId?: string;
}):
  | { ok: true; body: SeoPlanningResearchRequestBody; subject: SeoPlanningResearchSubjectSnapshot }
  | { ok: false; message: string } {
  const topic = normalizePlainText(input.topic, MAX_TOPIC_CHARS);
  if (!topic) {
    return { ok: false, message: "Topic is invalid for grounded research." };
  }
  const intent = normalizeSeoPlanningResearchIntent(input.intent);
  if (
    input.intent !== undefined &&
    input.intent !== null &&
    typeof input.intent === "string" &&
    input.intent.trim() &&
    intent === null
  ) {
    return { ok: false, message: "Intent is invalid for grounded research." };
  }
  const opportunityId =
    typeof input.opportunityId === "string" &&
    input.opportunityId.trim() &&
    input.opportunityId.length <= MAX_OPPORTUNITY_ID_CHARS
      ? input.opportunityId.trim()
      : createSeoPlanningResearchRequestId();

  const body: SeoPlanningResearchRequestBody = {
    provider: "openai",
    task: BLOG_GROUNDED_RESEARCH_TASK,
    opportunityId,
    topic,
  };
  if (intent) body.intent = intent;

  return {
    ok: true,
    body,
    subject: { opportunityId, topic, intent },
  };
}

export function isSafeHttpsSourceUrl(url: unknown): boolean {
  if (typeof url !== "string" || !url.trim()) return false;
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== "https:") return false;
    if (!parsed.hostname || parsed.hostname.includes(" ")) return false;
    return true;
  } catch {
    return false;
  }
}

export function researchSubjectsMatch(
  expected: SeoPlanningResearchSubjectSnapshot,
  actual: unknown
): boolean {
  if (!actual || typeof actual !== "object" || Array.isArray(actual)) {
    return false;
  }
  const row = actual as Record<string, unknown>;
  if (typeof row.opportunityId !== "string" || typeof row.topic !== "string") {
    return false;
  }
  const intent =
    row.intent === undefined || row.intent === null
      ? null
      : typeof row.intent === "string"
        ? row.intent
        : undefined;
  if (intent === undefined) return false;
  return (
    row.opportunityId === expected.opportunityId &&
    row.topic === expected.topic &&
    intent === expected.intent
  );
}

function asStringArray(value: unknown, maxItems: number): string[] | null {
  if (!Array.isArray(value)) return null;
  if (value.length > maxItems) return null;
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !item.trim()) return null;
    out.push(item);
  }
  return out;
}

function sanitizeClientMessage(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const cleaned = raw.replace(/[<>]/g, "").trim().replace(/\s+/g, " ");
  if (!cleaned) return fallback;
  return cleaned.slice(0, 280);
}

/**
 * Interpret an HTTP + JSON envelope from /api/admin-blog-research.
 * Outer ok does not imply READY. Fail closed on unexpected shapes.
 */
export function interpretSeoPlanningResearchResponse(input: {
  httpStatus: number;
  json: unknown;
  expectedSubject: SeoPlanningResearchSubjectSnapshot;
  aborted?: boolean;
}): SeoPlanningResearchUiState {
  if (input.aborted) {
    return createSupersededSeoPlanningResearchState();
  }

  const json = input.json;
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return {
      status: "error",
      message: "Grounded research response was malformed.",
      subject: input.expectedSubject,
      summary: null,
      sources: [],
      claims: [],
      unknowns: [],
      searchQueries: [],
      reasonCodes: [],
      httpStatus: input.httpStatus,
      errorCode: "malformed_provider_output",
    };
  }

  const envelope = json as Record<string, unknown>;

  if (envelope.ok !== true) {
    const code =
      typeof envelope.code === "string" ? envelope.code.slice(0, 64) : null;
    return {
      status: "error",
      message: sanitizeClientMessage(
        envelope.message,
        "Grounded research request failed."
      ),
      subject: input.expectedSubject,
      summary: null,
      sources: [],
      claims: [],
      unknowns: [],
      searchQueries: [],
      reasonCodes: [],
      httpStatus: input.httpStatus,
      errorCode: code,
    };
  }

  // Fail closed: READY/MISSING require exact HTTP 200. A positive-looking
  // envelope on any other status is never accepted as evidence.
  if (
    typeof input.httpStatus !== "number" ||
    !Number.isFinite(input.httpStatus) ||
    input.httpStatus !== 200
  ) {
    return {
      status: "error",
      message:
        "Grounded research returned an unexpected HTTP status. Evidence was not accepted.",
      subject: input.expectedSubject,
      summary: null,
      sources: [],
      claims: [],
      unknowns: [],
      searchQueries: [],
      reasonCodes: [],
      httpStatus: Number.isFinite(input.httpStatus)
        ? input.httpStatus
        : null,
      errorCode: "malformed_provider_output",
    };
  }

  if (
    envelope.provider !== "openai" ||
    envelope.task !== BLOG_GROUNDED_RESEARCH_TASK
  ) {
    return {
      status: "error",
      message: "Grounded research response provider/task was unexpected.",
      subject: input.expectedSubject,
      summary: null,
      sources: [],
      claims: [],
      unknowns: [],
      searchQueries: [],
      reasonCodes: [],
      httpStatus: input.httpStatus,
      errorCode: "malformed_provider_output",
    };
  }

  const evidence = envelope.evidence;
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    return {
      status: "error",
      message: "Grounded research evidence packet was missing.",
      subject: input.expectedSubject,
      summary: null,
      sources: [],
      claims: [],
      unknowns: [],
      searchQueries: [],
      reasonCodes: [],
      httpStatus: input.httpStatus,
      errorCode: "malformed_provider_output",
    };
  }

  const ev = evidence as Record<string, unknown>;

  if (ev.ok === false || ev.evidenceState === "missing") {
    const reasonCodes = asStringArray(ev.reasonCodes, 32) || [];
    return {
      status: "missing",
      message:
        "OpenAI research completed validation, but reliable grounded evidence is not available (MISSING). Planning remains HOLD. No article was created.",
      subject: input.expectedSubject,
      summary: null,
      sources: [],
      claims: [],
      unknowns: [],
      searchQueries: [],
      reasonCodes,
      httpStatus: input.httpStatus,
      errorCode: null,
    };
  }

  if (
    ev.ok !== true ||
    ev.evidenceState !== "ready" ||
    !researchSubjectsMatch(input.expectedSubject, ev.subject)
  ) {
    return {
      status: "error",
      message:
        "Grounded research response did not meet the READY evidence contract for the active topic.",
      subject: input.expectedSubject,
      summary: null,
      sources: [],
      claims: [],
      unknowns: [],
      searchQueries: [],
      reasonCodes: [],
      httpStatus: input.httpStatus,
      errorCode: "malformed_provider_output",
    };
  }

  const reasonCodes = asStringArray(ev.reasonCodes, 32);
  if (!reasonCodes || !reasonCodes.includes("GROUNDED_EVIDENCE_READY")) {
    return {
      status: "error",
      message: "READY evidence marker was missing from the research packet.",
      subject: input.expectedSubject,
      summary: null,
      sources: [],
      claims: [],
      unknowns: [],
      searchQueries: [],
      reasonCodes: [],
      httpStatus: input.httpStatus,
      errorCode: "malformed_provider_output",
    };
  }

  if (typeof ev.summary !== "string" || !ev.summary.trim()) {
    return {
      status: "error",
      message: "READY evidence summary was missing.",
      subject: input.expectedSubject,
      summary: null,
      sources: [],
      claims: [],
      unknowns: [],
      searchQueries: [],
      reasonCodes: [],
      httpStatus: input.httpStatus,
      errorCode: "malformed_provider_output",
    };
  }

  if (!Array.isArray(ev.sources) || ev.sources.length < 2) {
    return {
      status: "error",
      message: "READY evidence did not include the minimum accepted sources.",
      subject: input.expectedSubject,
      summary: null,
      sources: [],
      claims: [],
      unknowns: [],
      searchQueries: [],
      reasonCodes: [],
      httpStatus: input.httpStatus,
      errorCode: "malformed_provider_output",
    };
  }

  if (!Array.isArray(ev.claims) || ev.claims.length < 2) {
    return {
      status: "error",
      message: "READY evidence did not include the minimum accepted claims.",
      subject: input.expectedSubject,
      summary: null,
      sources: [],
      claims: [],
      unknowns: [],
      searchQueries: [],
      reasonCodes: [],
      httpStatus: input.httpStatus,
      errorCode: "malformed_provider_output",
    };
  }

  const sources: SeoPlanningResearchSourceView[] = [];
  for (const item of ev.sources) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return {
        status: "error",
        message: "READY evidence contained a malformed source.",
        subject: input.expectedSubject,
        summary: null,
        sources: [],
        claims: [],
        unknowns: [],
        searchQueries: [],
        reasonCodes: [],
        httpStatus: input.httpStatus,
        errorCode: "malformed_provider_output",
      };
    }
    const row = item as Record<string, unknown>;
    if (
      typeof row.id !== "string" ||
      typeof row.title !== "string" ||
      typeof row.url !== "string"
    ) {
      return {
        status: "error",
        message: "READY evidence contained a malformed source.",
        subject: input.expectedSubject,
        summary: null,
        sources: [],
        claims: [],
        unknowns: [],
        searchQueries: [],
        reasonCodes: [],
        httpStatus: input.httpStatus,
        errorCode: "malformed_provider_output",
      };
    }
    const publishedAt =
      row.publishedAt === undefined || row.publishedAt === null
        ? null
        : typeof row.publishedAt === "string"
          ? row.publishedAt
          : null;
    sources.push({
      id: row.id,
      title: row.title,
      url: row.url,
      publishedAt,
      linkable: isSafeHttpsSourceUrl(row.url),
    });
  }

  const claims: SeoPlanningResearchClaimView[] = [];
  for (const item of ev.claims) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return {
        status: "error",
        message: "READY evidence contained a malformed claim.",
        subject: input.expectedSubject,
        summary: null,
        sources: [],
        claims: [],
        unknowns: [],
        searchQueries: [],
        reasonCodes: [],
        httpStatus: input.httpStatus,
        errorCode: "malformed_provider_output",
      };
    }
    const row = item as Record<string, unknown>;
    if (typeof row.claim !== "string" || !Array.isArray(row.sourceIds)) {
      return {
        status: "error",
        message: "READY evidence contained a malformed claim.",
        subject: input.expectedSubject,
        summary: null,
        sources: [],
        claims: [],
        unknowns: [],
        searchQueries: [],
        reasonCodes: [],
        httpStatus: input.httpStatus,
        errorCode: "malformed_provider_output",
      };
    }
    const sourceIds: string[] = [];
    for (const id of row.sourceIds) {
      if (typeof id !== "string" || !id) {
        return {
          status: "error",
          message: "READY evidence claim references were invalid.",
          subject: input.expectedSubject,
          summary: null,
          sources: [],
          claims: [],
          unknowns: [],
          searchQueries: [],
          reasonCodes: [],
          httpStatus: input.httpStatus,
          errorCode: "malformed_provider_output",
        };
      }
      sourceIds.push(id);
    }
    claims.push({ claim: row.claim, sourceIds });
  }

  const unknowns = asStringArray(ev.unknowns, 32) || [];
  const searchQueries = asStringArray(ev.searchQueries, 32) || [];

  return {
    status: "ready",
    message:
      "Grounded research evidence is READY for human review. This does not approve publishing a Blog post. Planning remains HOLD.",
    subject: input.expectedSubject,
    summary: ev.summary.trim(),
    sources,
    claims,
    unknowns,
    searchQueries,
    reasonCodes,
    httpStatus: input.httpStatus,
    errorCode: null,
  };
}

/** Evidence badge label for the planning card (research overrides pre-research). */
export function seoPlanningResearchEvidenceLabel(
  research: SeoPlanningResearchUiState,
  planningEvidenceLabel: string
): string {
  if (research.status === "ready") return "READY";
  if (research.status === "missing") return "MISSING";
  if (research.status === "loading") return "IN PROGRESS";
  if (research.status === "error") return "ERROR";
  return planningEvidenceLabel;
}

// ── JSEO-W4B — Ephemeral editorial research brief (read-only handoff) ────────

export type SeoEditorialChecklistItemId =
  | "claims_sources_reviewed"
  | "uk_audience_relevance"
  | "existing_content_refresh"
  | "cannibalization_overlap"
  | "new_article_approval";

export type SeoEditorialChecklistState = Record<
  SeoEditorialChecklistItemId,
  boolean
>;

export const SEO_EDITORIAL_CHECKLIST_ITEM_IDS: SeoEditorialChecklistItemId[] = [
  "claims_sources_reviewed",
  "uk_audience_relevance",
  "existing_content_refresh",
  "cannibalization_overlap",
  "new_article_approval",
];

/** Checkbox labels shown in the SEO panel (operator-facing). */
export const SEO_EDITORIAL_CHECKLIST_UI_LABELS: Record<
  SeoEditorialChecklistItemId,
  string
> = {
  claims_sources_reviewed:
    "Claims checked against the cited source pages.",
  uk_audience_relevance:
    "Sources assessed for UK audience relevance.",
  existing_content_refresh:
    "Existing Blog content reviewed for refresh opportunities.",
  cannibalization_overlap:
    "Potential overlap/cannibalization reviewed.",
  new_article_approval:
    "New-article approval requirements considered.",
};

/** Compact labels used inside the copied plain-text brief. */
export const SEO_EDITORIAL_CHECKLIST_BRIEF_LABELS: Record<
  SeoEditorialChecklistItemId,
  string
> = {
  claims_sources_reviewed: "Claim/source review",
  uk_audience_relevance: "UK audience relevance",
  existing_content_refresh: "Existing-content refresh review",
  cannibalization_overlap: "Cannibalization/overlap review",
  new_article_approval: "New-article approval requirements reviewed",
};

export function createDefaultSeoEditorialChecklist(): SeoEditorialChecklistState {
  return {
    claims_sources_reviewed: false,
    uk_audience_relevance: false,
    existing_content_refresh: false,
    cannibalization_overlap: false,
    new_article_approval: false,
  };
}

export type SeoEditorialResearchBriefResult =
  | { ok: true; brief: string }
  | { ok: false; reason: string };

function briefFail(reason: string): SeoEditorialResearchBriefResult {
  return { ok: false, reason };
}

function isBoundedPlainField(
  value: string,
  maxChars: number
): boolean {
  if (!value || value.length > maxChars) return false;
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)) return false;
  if (/[<>]/.test(value)) return false;
  return true;
}

function researchSubjectMatchesPlanningPreview(
  subject: SeoPlanningResearchSubjectSnapshot,
  preview: SeoPlanningPreviewResult | null | undefined
): boolean {
  return planningInputsMatchCheckedPreview({
    topic: subject.topic,
    intent: subject.intent ?? undefined,
    preview,
  });
}

/**
 * Pure formatter for a human-copied editorial research brief.
 * Fail closed unless a genuine READY UI state with intact provenance is present.
 * Does not fetch, persist, or re-run AB-7A grounding validation.
 */
export function buildSeoEditorialResearchBrief(input: {
  researchUi: SeoPlanningResearchUiState;
  checklist: SeoEditorialChecklistState;
  planningPreview?: SeoPlanningPreviewResult | null;
}): SeoEditorialResearchBriefResult {
  const research = input.researchUi;
  if (research.status !== "ready") {
    return briefFail(
      "Research brief is unavailable because grounded research is not READY."
    );
  }
  if (!research.subject) {
    return briefFail("Research brief is unavailable: READY subject is missing.");
  }
  if (
    typeof research.summary !== "string" ||
    !research.summary.trim() ||
    !isBoundedPlainField(research.summary, MAX_BLOG_RESEARCH_SUMMARY_CHARS)
  ) {
    return briefFail(
      "Research brief is unavailable: accepted summary is missing or malformed."
    );
  }

  const subject = research.subject;
  if (
    !isBoundedPlainField(subject.opportunityId, MAX_OPPORTUNITY_ID_CHARS) ||
    !isBoundedPlainField(subject.topic, MAX_TOPIC_CHARS)
  ) {
    return briefFail(
      "Research brief is unavailable: research subject is malformed."
    );
  }
  if (
    subject.intent !== null &&
    !isBoundedPlainField(subject.intent, MAX_INTENT_CHARS)
  ) {
    return briefFail(
      "Research brief is unavailable: research intent is malformed."
    );
  }

  if (
    !Array.isArray(research.sources) ||
    research.sources.length < MIN_BLOG_RESEARCH_SOURCES ||
    research.sources.length > MAX_BLOG_RESEARCH_SOURCES
  ) {
    return briefFail(
      "Research brief is unavailable: accepted sources are incomplete or oversized."
    );
  }
  if (
    !Array.isArray(research.claims) ||
    research.claims.length < MIN_BLOG_RESEARCH_CLAIMS ||
    research.claims.length > MAX_BLOG_RESEARCH_CLAIMS
  ) {
    return briefFail(
      "Research brief is unavailable: accepted claims are incomplete or oversized."
    );
  }
  if (
    !Array.isArray(research.unknowns) ||
    research.unknowns.length > MAX_BLOG_RESEARCH_UNKNOWNS
  ) {
    return briefFail(
      "Research brief is unavailable: unknowns list is malformed."
    );
  }
  if (
    !Array.isArray(research.searchQueries) ||
    research.searchQueries.length > MAX_BLOG_RESEARCH_SEARCH_QUERIES
  ) {
    return briefFail(
      "Research brief is unavailable: search queries list is malformed."
    );
  }
  if (!Array.isArray(research.reasonCodes) || research.reasonCodes.length > 32) {
    return briefFail(
      "Research brief is unavailable: evidence reason codes are malformed."
    );
  }
  if (!research.reasonCodes.includes("GROUNDED_EVIDENCE_READY")) {
    return briefFail(
      "Research brief is unavailable: READY evidence marker is missing."
    );
  }

  if (
    !input.checklist ||
    typeof input.checklist !== "object" ||
    Array.isArray(input.checklist)
  ) {
    return briefFail(
      "Research brief is unavailable: editorial checklist is malformed."
    );
  }
  for (const id of SEO_EDITORIAL_CHECKLIST_ITEM_IDS) {
    if (typeof input.checklist[id] !== "boolean") {
      return briefFail(
        "Research brief is unavailable: editorial checklist is incomplete."
      );
    }
  }

  const seenSourceIds = new Set<string>();
  for (const source of research.sources) {
    if (
      !source ||
      typeof source.id !== "string" ||
      typeof source.title !== "string" ||
      typeof source.url !== "string"
    ) {
      return briefFail(
        "Research brief is unavailable: a source entry is malformed."
      );
    }
    if (
      !isBoundedPlainField(source.id, MAX_BLOG_RESEARCH_SOURCE_ID_CHARS) ||
      !isBoundedPlainField(source.title, MAX_BLOG_RESEARCH_SOURCE_TITLE_CHARS) ||
      !source.url.trim() ||
      source.url.length > MAX_BLOG_RESEARCH_URL_CHARS ||
      /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(source.url) ||
      /[<>]/.test(source.url)
    ) {
      return briefFail(
        "Research brief is unavailable: a source field exceeds accepted bounds."
      );
    }
    if (seenSourceIds.has(source.id)) {
      return briefFail(
        "Research brief is unavailable: duplicate source IDs prevent a complete brief."
      );
    }
    seenSourceIds.add(source.id);
    if (
      source.publishedAt !== null &&
      (typeof source.publishedAt !== "string" ||
        !isBoundedPlainField(
          source.publishedAt,
          MAX_BLOG_RESEARCH_PUBLISHED_AT_CHARS
        ))
    ) {
      return briefFail(
        "Research brief is unavailable: a published date is malformed."
      );
    }
  }

  for (const claim of research.claims) {
    if (
      !claim ||
      typeof claim.claim !== "string" ||
      !Array.isArray(claim.sourceIds)
    ) {
      return briefFail(
        "Research brief is unavailable: a claim entry is malformed."
      );
    }
    if (
      !isBoundedPlainField(claim.claim, MAX_BLOG_RESEARCH_CLAIM_CHARS) ||
      claim.sourceIds.length < 1 ||
      claim.sourceIds.length > MAX_BLOG_RESEARCH_CLAIM_SOURCE_IDS
    ) {
      return briefFail(
        "Research brief is unavailable: claim provenance is incomplete or oversized."
      );
    }
    for (const sourceId of claim.sourceIds) {
      if (
        typeof sourceId !== "string" ||
        !isBoundedPlainField(sourceId, MAX_BLOG_RESEARCH_SOURCE_ID_CHARS) ||
        !seenSourceIds.has(sourceId)
      ) {
        return briefFail(
          "Research brief is unavailable: claim-to-source associations are incomplete."
        );
      }
    }
  }

  for (const unknown of research.unknowns) {
    if (
      typeof unknown !== "string" ||
      !isBoundedPlainField(unknown, MAX_BLOG_RESEARCH_UNKNOWN_CHARS)
    ) {
      return briefFail(
        "Research brief is unavailable: an unknown item is malformed."
      );
    }
  }
  for (const query of research.searchQueries) {
    if (
      typeof query !== "string" ||
      !isBoundedPlainField(query, MAX_BLOG_RESEARCH_SEARCH_QUERY_CHARS)
    ) {
      return briefFail(
        "Research brief is unavailable: a search query is malformed."
      );
    }
  }
  for (const code of research.reasonCodes) {
    if (typeof code !== "string" || !code.trim() || code.length > 64) {
      return briefFail(
        "Research brief is unavailable: a reason code is malformed."
      );
    }
  }

  const lines: string[] = [];
  lines.push("FIRESTICK4UK — EDITORIAL RESEARCH BRIEF");
  lines.push("=====================================");
  lines.push("");
  lines.push("Status: GROUNDED RESEARCH READY");
  lines.push("Provider: OpenAI");
  lines.push("Planning: HOLD — HUMAN EDITORIAL REVIEW REQUIRED");
  lines.push("");
  lines.push("TOPIC");
  lines.push(subject.topic);
  lines.push("");
  lines.push("INTENT");
  lines.push(subject.intent ?? "(none)");
  lines.push("");
  lines.push("RESEARCH SUBJECT");
  lines.push(`Opportunity ID: ${subject.opportunityId}`);
  lines.push("");
  lines.push("RESEARCH SUMMARY");
  lines.push(research.summary);
  lines.push("");
  lines.push("ACCEPTED SOURCES");
  for (const source of research.sources) {
    lines.push(`[${source.id}] ${source.title}`);
    lines.push(`URL: ${source.url}`);
    if (source.publishedAt) {
      lines.push(`Published: ${source.publishedAt}`);
    }
    lines.push("");
  }
  lines.push("GROUNDED CLAIMS");
  research.claims.forEach((claim, index) => {
    lines.push(`${index + 1}. ${claim.claim}`);
    lines.push(`   Supporting source IDs: ${claim.sourceIds.join(", ")}`);
    lines.push("");
  });
  lines.push("UNKNOWNS");
  if (research.unknowns.length === 0) {
    lines.push("(none listed)");
  } else {
    for (const unknown of research.unknowns) {
      lines.push(`- ${unknown}`);
    }
  }
  lines.push("");
  lines.push("SEARCH QUERIES");
  if (research.searchQueries.length === 0) {
    lines.push("(none listed)");
  } else {
    for (const query of research.searchQueries) {
      lines.push(`- ${query}`);
    }
  }
  lines.push("");
  lines.push("EVIDENCE REASON CODES");
  lines.push(research.reasonCodes.join(", "));
  lines.push("");
  lines.push("EXISTING BLOG COVERAGE (ADVISORY)");
  const preview = input.planningPreview;
  if (
    preview &&
    preview.status === "preview" &&
    preview.match &&
    researchSubjectMatchesPlanningPreview(subject, preview)
  ) {
    const match = preview.match;
    lines.push(`Match: ${match.kind}`);
    if (match.kind === "NONE") {
      lines.push(
        "NONE match does not authorize creating or publishing a new Blog article."
      );
    }
    if (match.title) {
      lines.push(`Existing title: ${match.title}`);
    }
    if (match.url) {
      lines.push(`Existing URL: ${match.url}`);
    }
    lines.push(
      `AB-4 reasons: ${
        preview.ab4ReasonCodes.length
          ? preview.ab4ReasonCodes.join(", ")
          : "(none)"
      }`
    );
  } else {
    lines.push(
      "No matching AB-4 planning preview is currently associated with this research subject."
    );
  }
  lines.push("");
  lines.push("MANUAL EDITORIAL REVIEW");
  for (const id of SEO_EDITORIAL_CHECKLIST_ITEM_IDS) {
    const mark = input.checklist[id] ? "x" : " ";
    lines.push(`[${mark}] ${SEO_EDITORIAL_CHECKLIST_BRIEF_LABELS[id]}`);
  }
  lines.push("");
  lines.push("IMPORTANT");
  lines.push("Research evidence was accepted by AB-7A.");
  lines.push(
    "Individual claims are not independently editorially verified by this tool."
  );
  lines.push(
    "Checklist selections are operator-entered, not audited proof."
  );
  lines.push("This research brief has not been saved in the CMS.");
  lines.push("Planning remains HOLD.");
  lines.push(
    "No Blog article or draft has been created or approved."
  );
  lines.push(
    "Publishing requires separate human editorial approval."
  );
  lines.push(
    "Do not paste this entire internal brief into public article content."
  );

  const brief = lines.join("\n");
  if (
    !brief ||
    brief.length > MAX_SEO_EDITORIAL_RESEARCH_BRIEF_CHARS ||
    /[<>]/.test(brief)
  ) {
    return briefFail(
      "Research brief is unavailable: formatted output exceeded safe completeness bounds."
    );
  }

  return { ok: true, brief };
}
