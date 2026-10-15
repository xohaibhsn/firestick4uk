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
import type { SeoPlanningPreviewResult } from "@/lib/seoPlanningReadiness";

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
