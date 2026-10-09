/**
 * AB-7A — Pure grounded Blog research evidence validator.
 *
 * A model-written URL is never evidence by itself. Every accepted source URL
 * must also appear in separately supplied provider grounding metadata.
 * This module validates compact facts and provenance only: it does not call a
 * provider, search, fetch, persist, schedule, generate prose, or publish.
 *
 * AB-3 retains the full ready | missing | stale vocabulary. This one-shot
 * validator returns only ready or missing because staleness requires persisted
 * evidence age and a future freshness policy.
 */

import {
  MAX_INTENT_CHARS,
  MAX_OPPORTUNITY_ID_CHARS,
  MAX_TOPIC_CHARS,
} from "@/lib/blogOpportunityEngine";

export const MIN_BLOG_RESEARCH_SOURCES = 2;
export const MAX_BLOG_RESEARCH_SOURCES = 12;
export const MIN_BLOG_RESEARCH_CLAIMS = 2;
export const MAX_BLOG_RESEARCH_CLAIMS = 12;
export const MAX_BLOG_RESEARCH_GROUNDED_URLS = 50;
export const MAX_BLOG_RESEARCH_SEARCH_QUERIES = 12;
export const MAX_BLOG_RESEARCH_UNKNOWNS = 8;
export const MAX_BLOG_RESEARCH_SOURCE_ID_CHARS = 128;
export const MAX_BLOG_RESEARCH_SOURCE_TITLE_CHARS = 300;
export const MAX_BLOG_RESEARCH_URL_CHARS = 2_000;
export const MAX_BLOG_RESEARCH_PUBLISHED_AT_CHARS = 64;
export const MAX_BLOG_RESEARCH_CLAIM_CHARS = 500;
export const MAX_BLOG_RESEARCH_SUMMARY_CHARS = 1_200;
export const MAX_BLOG_RESEARCH_UNKNOWN_CHARS = 300;
export const MAX_BLOG_RESEARCH_SEARCH_QUERY_CHARS = 300;
export const MAX_BLOG_RESEARCH_CLAIM_SOURCE_IDS = 4;

export type BlogResearchSubject = {
  opportunityId: string;
  topic: string;
  intent?: string | null;
};

export type BlogResearchProviderOutput = {
  summary: string;
  sources: Array<{
    id: string;
    title: string;
    url: string;
    publishedAt?: string | null;
  }>;
  claims: Array<{
    claim: string;
    sourceIds: string[];
  }>;
  unknowns?: string[];
};

export type BlogResearchGrounding = {
  groundedUrls: string[];
  searchQueries?: string[];
};

export type NormalizedBlogResearchSource = {
  id: string;
  title: string;
  url: string;
  publishedAt: string | null;
};

export type NormalizedBlogResearchClaim = {
  claim: string;
  sourceIds: string[];
};

export type BlogResearchEvidenceFailureReasonCode =
  | "INVALID_INPUT"
  | "INSUFFICIENT_SOURCES"
  | "INSUFFICIENT_CLAIMS"
  | "UNGROUNDED_SOURCE"
  | "DUPLICATE_SOURCE_ID"
  | "DUPLICATE_SOURCE_URL"
  | "INVALID_SOURCE_URL"
  | "INVALID_CLAIM_REFERENCE"
  | "UNUSED_SOURCE"
  | "NO_EXTERNAL_SOURCE";

export type BlogResearchEvidenceReasonCode =
  | BlogResearchEvidenceFailureReasonCode
  | "GROUNDED_EVIDENCE_READY";

export type BlogResearchEvidenceResult =
  | {
      ok: true;
      evidenceState: "ready";
      subject: {
        opportunityId: string;
        topic: string;
        intent: string | null;
      };
      summary: string;
      sources: NormalizedBlogResearchSource[];
      claims: NormalizedBlogResearchClaim[];
      unknowns: string[];
      searchQueries: string[];
      reasonCodes: ["GROUNDED_EVIDENCE_READY"];
    }
  | {
      ok: false;
      evidenceState: "missing";
      sources: [];
      claims: [];
      unknowns: [];
      searchQueries: [];
      reasonCodes: BlogResearchEvidenceFailureReasonCode[];
    };

type DataSnapshot = { ok: true; value: Record<string, unknown> } | { ok: false };
type ArraySnapshot = { ok: true; value: unknown[] } | { ok: false };

type ParsedSubject = {
  opportunityId: string;
  topic: string;
  intent: string | null;
};

const SUBJECT_KEYS = new Set(["opportunityId", "topic", "intent"]);
const REQUIRED_SUBJECT_KEYS = new Set(["opportunityId", "topic"]);
const OUTPUT_KEYS = new Set(["summary", "sources", "claims", "unknowns"]);
const REQUIRED_OUTPUT_KEYS = new Set(["summary", "sources", "claims"]);
const SOURCE_KEYS = new Set(["id", "title", "url", "publishedAt"]);
const REQUIRED_SOURCE_KEYS = new Set(["id", "title", "url"]);
const CLAIM_KEYS = new Set(["claim", "sourceIds"]);
const REQUIRED_CLAIM_KEYS = new Set(["claim", "sourceIds"]);
const GROUNDING_KEYS = new Set(["groundedUrls", "searchQueries"]);
const REQUIRED_GROUNDING_KEYS = new Set(["groundedUrls"]);
const SOURCE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SELF_SITE_HOST = "firestick4uk.com";

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

    const value: Record<string, unknown> = Object.create(null);
    for (const key of Reflect.ownKeys(raw)) {
      if (typeof key !== "string" || !allowedKeys.has(key)) {
        return { ok: false };
      }
      const descriptor = Object.getOwnPropertyDescriptor(raw, key);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
        return { ok: false };
      }
      value[key] = descriptor.value;
    }
    for (const key of requiredKeys) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) {
        return { ok: false };
      }
    }
    return { ok: true, value };
  } catch {
    return { ok: false };
  }
}

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

    const keys = Reflect.ownKeys(raw);
    if (keys.length !== length + 1 || !keys.includes("length")) {
      return { ok: false };
    }

    const value: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(raw, String(index));
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
        return { ok: false };
      }
      value.push(descriptor.value);
    }
    return { ok: true, value };
  } catch {
    return { ok: false };
  }
}

function normalizePlainText(value: unknown, maxChars: number): string | null {
  if (typeof value !== "string" || !value || value.length > maxChars) {
    return null;
  }
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)) {
    return null;
  }
  if (/[<>]/.test(value)) return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized || normalized.length > maxChars) return null;
  return normalized;
}

function normalizeSourceId(value: unknown): string | null {
  if (typeof value !== "string" || value.length > MAX_BLOG_RESEARCH_SOURCE_ID_CHARS) {
    return null;
  }
  const normalized = value.trim();
  return SOURCE_ID_PATTERN.test(normalized) ? normalized : null;
}

function isIpLiteral(hostname: string): boolean {
  if (hostname.startsWith("[") && hostname.endsWith("]")) return true;
  const parts = hostname.split(".");
  return (
    parts.length === 4 &&
    parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
  );
}

/**
 * Normalize an HTTPS research URL for exact grounding comparison.
 * No request or DNS lookup is performed.
 */
export function normalizeBlogResearchUrl(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > MAX_BLOG_RESEARCH_URL_CHARS
  ) {
    return null;
  }
  const raw = value.trim();
  if (!raw || raw.startsWith("//") || /\s/.test(raw)) return null;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    return null;
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    !hostname ||
    hostname.endsWith(".") ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    isIpLiteral(hostname)
  ) {
    return null;
  }

  parsed.hostname = hostname;
  if (parsed.port === "443") parsed.port = "";
  parsed.hash = "";
  return parsed.toString();
}

function failure(
  reasonCode: BlogResearchEvidenceFailureReasonCode
): BlogResearchEvidenceResult {
  return {
    ok: false,
    evidenceState: "missing",
    sources: [],
    claims: [],
    unknowns: [],
    searchQueries: [],
    reasonCodes: [reasonCode],
  };
}

function parseSubject(raw: unknown): ParsedSubject | null {
  const snapshot = snapshotDataObject(raw, SUBJECT_KEYS, REQUIRED_SUBJECT_KEYS);
  if (!snapshot.ok) return null;
  const opportunityId = normalizePlainText(
    snapshot.value.opportunityId,
    MAX_OPPORTUNITY_ID_CHARS
  );
  const topic = normalizePlainText(snapshot.value.topic, MAX_TOPIC_CHARS);
  if (!opportunityId || !topic) return null;

  let intent: string | null = null;
  const rawIntent = snapshot.value.intent;
  if (rawIntent !== undefined && rawIntent !== null) {
    if (typeof rawIntent !== "string" || rawIntent.length > MAX_INTENT_CHARS) {
      return null;
    }
    if (!rawIntent.trim()) {
      intent = null;
    } else {
      intent = normalizePlainText(rawIntent, MAX_INTENT_CHARS);
      if (!intent) return null;
    }
  }
  return { opportunityId, topic, intent };
}

function parseOptionalPlainText(
  value: unknown,
  maxChars: number
): { ok: true; value: string | null } | { ok: false } {
  if (value === undefined || value === null) return { ok: true, value: null };
  const normalized = normalizePlainText(value, maxChars);
  return normalized ? { ok: true, value: normalized } : { ok: false };
}

function parsePlainTextArray(
  raw: unknown,
  maxItems: number,
  maxChars: number,
  optional: boolean
): { ok: true; value: string[] } | { ok: false } {
  if (raw === undefined && optional) return { ok: true, value: [] };
  const snapshot = snapshotDenseArray(raw, maxItems);
  if (!snapshot.ok) return { ok: false };
  const value: string[] = [];
  for (const item of snapshot.value) {
    const normalized = normalizePlainText(item, maxChars);
    if (!normalized) return { ok: false };
    value.push(normalized);
  }
  return { ok: true, value };
}

function isSelfSiteUrl(normalizedUrl: string): boolean {
  const hostname = new URL(normalizedUrl).hostname;
  return hostname === SELF_SITE_HOST || hostname.endsWith(`.${SELF_SITE_HOST}`);
}

/** Validate provider output against independent grounding metadata. */
export function validateBlogResearchEvidence(
  subjectInput: BlogResearchSubject | unknown,
  providerOutputInput: BlogResearchProviderOutput | unknown,
  groundingInput: BlogResearchGrounding | unknown
): BlogResearchEvidenceResult {
  const subject = parseSubject(subjectInput);
  if (!subject) return failure("INVALID_INPUT");

  const output = snapshotDataObject(
    providerOutputInput,
    OUTPUT_KEYS,
    REQUIRED_OUTPUT_KEYS
  );
  const grounding = snapshotDataObject(
    groundingInput,
    GROUNDING_KEYS,
    REQUIRED_GROUNDING_KEYS
  );
  if (!output.ok || !grounding.ok) return failure("INVALID_INPUT");

  const summary = normalizePlainText(
    output.value.summary,
    MAX_BLOG_RESEARCH_SUMMARY_CHARS
  );
  if (!summary) return failure("INVALID_INPUT");

  const groundedSnapshot = snapshotDenseArray(
    grounding.value.groundedUrls,
    MAX_BLOG_RESEARCH_GROUNDED_URLS
  );
  if (!groundedSnapshot.ok) return failure("INVALID_INPUT");
  const groundedUrls = new Set<string>();
  for (const rawUrl of groundedSnapshot.value) {
    const normalized = normalizeBlogResearchUrl(rawUrl);
    if (!normalized) return failure("INVALID_SOURCE_URL");
    groundedUrls.add(normalized);
  }

  const searchQueries = parsePlainTextArray(
    grounding.value.searchQueries,
    MAX_BLOG_RESEARCH_SEARCH_QUERIES,
    MAX_BLOG_RESEARCH_SEARCH_QUERY_CHARS,
    true
  );
  if (!searchQueries.ok) return failure("INVALID_INPUT");

  const sourcesSnapshot = snapshotDenseArray(
    output.value.sources,
    MAX_BLOG_RESEARCH_SOURCES
  );
  if (!sourcesSnapshot.ok) return failure("INVALID_INPUT");
  if (sourcesSnapshot.value.length < MIN_BLOG_RESEARCH_SOURCES) {
    return failure("INSUFFICIENT_SOURCES");
  }

  const sources: NormalizedBlogResearchSource[] = [];
  const sourceIds = new Set<string>();
  const sourceUrls = new Set<string>();
  let hasExternalSource = false;
  for (const rawSource of sourcesSnapshot.value) {
    const source = snapshotDataObject(rawSource, SOURCE_KEYS, REQUIRED_SOURCE_KEYS);
    if (!source.ok) return failure("INVALID_INPUT");
    const id = normalizeSourceId(source.value.id);
    const title = normalizePlainText(
      source.value.title,
      MAX_BLOG_RESEARCH_SOURCE_TITLE_CHARS
    );
    const url = normalizeBlogResearchUrl(source.value.url);
    const publishedAt = parseOptionalPlainText(
      source.value.publishedAt,
      MAX_BLOG_RESEARCH_PUBLISHED_AT_CHARS
    );
    if (!id || !title || !publishedAt.ok) return failure("INVALID_INPUT");
    if (!url) return failure("INVALID_SOURCE_URL");
    if (sourceIds.has(id)) return failure("DUPLICATE_SOURCE_ID");
    if (sourceUrls.has(url)) return failure("DUPLICATE_SOURCE_URL");
    if (!groundedUrls.has(url)) return failure("UNGROUNDED_SOURCE");

    sourceIds.add(id);
    sourceUrls.add(url);
    if (!isSelfSiteUrl(url)) hasExternalSource = true;
    sources.push({ id, title, url, publishedAt: publishedAt.value });
  }
  if (!hasExternalSource) return failure("NO_EXTERNAL_SOURCE");

  const claimsSnapshot = snapshotDenseArray(
    output.value.claims,
    MAX_BLOG_RESEARCH_CLAIMS
  );
  if (!claimsSnapshot.ok) return failure("INVALID_INPUT");
  if (claimsSnapshot.value.length < MIN_BLOG_RESEARCH_CLAIMS) {
    return failure("INSUFFICIENT_CLAIMS");
  }

  const claims: NormalizedBlogResearchClaim[] = [];
  const usedSourceIds = new Set<string>();
  for (const rawClaim of claimsSnapshot.value) {
    const claimSnapshot = snapshotDataObject(
      rawClaim,
      CLAIM_KEYS,
      REQUIRED_CLAIM_KEYS
    );
    if (!claimSnapshot.ok) return failure("INVALID_INPUT");
    const claim = normalizePlainText(
      claimSnapshot.value.claim,
      MAX_BLOG_RESEARCH_CLAIM_CHARS
    );
    if (!claim) return failure("INVALID_INPUT");

    const references = snapshotDenseArray(
      claimSnapshot.value.sourceIds,
      MAX_BLOG_RESEARCH_CLAIM_SOURCE_IDS
    );
    if (!references.ok || references.value.length === 0) {
      return failure("INVALID_CLAIM_REFERENCE");
    }
    const normalizedReferences: string[] = [];
    const seenReferences = new Set<string>();
    for (const rawReference of references.value) {
      const reference = normalizeSourceId(rawReference);
      if (
        !reference ||
        !sourceIds.has(reference) ||
        seenReferences.has(reference)
      ) {
        return failure("INVALID_CLAIM_REFERENCE");
      }
      seenReferences.add(reference);
      usedSourceIds.add(reference);
      normalizedReferences.push(reference);
    }
    claims.push({ claim, sourceIds: normalizedReferences });
  }

  for (const source of sources) {
    if (!usedSourceIds.has(source.id)) return failure("UNUSED_SOURCE");
  }

  const unknowns = parsePlainTextArray(
    output.value.unknowns,
    MAX_BLOG_RESEARCH_UNKNOWNS,
    MAX_BLOG_RESEARCH_UNKNOWN_CHARS,
    true
  );
  if (!unknowns.ok) return failure("INVALID_INPUT");

  return {
    ok: true,
    evidenceState: "ready",
    subject,
    summary,
    sources,
    claims,
    unknowns: unknowns.value,
    searchQueries: searchQueries.value,
    reasonCodes: ["GROUNDED_EVIDENCE_READY"],
  };
}

/** Map only a completed AB-7A result into AB-3's evidence-state vocabulary. */
export function toBlogOpportunityEvidenceState(
  result: BlogResearchEvidenceResult
): "ready" | "missing" {
  return result.ok ? "ready" : "missing";
}
