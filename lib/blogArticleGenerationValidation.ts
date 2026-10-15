/**
 * AB-8B — Deterministic generation-only Blog article preview validation.
 *
 * Pure / side-effect-free. Composes existing AB-7A, AB-4, and AB-3 contracts
 * without mutating CMS state, calling providers, or authorizing publish.
 *
 * Flow:
 *   Untrusted request → strict contract → AB-7A grounding → subject bind →
 *   AB-4 inventory match → optional AB-3 NEW_BLOG eligibility →
 *   candidate structural + provenance checks → VALID_PREVIEW | HOLD
 *
 * Trust boundary: this module cannot authenticate evidence origin or prove
 * authoritative CMS inventory completeness. AB-8C owns trusted orchestration.
 *
 * HTML note: regex-based structural checks are a conservative preview subset
 * informed by AB-1. They are NOT complete HTML sanitization. Final rendering
 * must still use existing sanitization; publication must still pass AB-1.
 */

import {
  BLOG_ARTICLE_GENERATION_HOLD_MESSAGES,
  BLOG_ARTICLE_GENERATION_INTENT,
  BLOG_ARTICLE_GENERATION_TASK,
  MAX_ARTICLE_GENERATION_ADVISORY_LINKS,
  MAX_ARTICLE_GENERATION_BODY_TEXT_CHARS,
  MAX_ARTICLE_GENERATION_CLAIM_REFERENCES,
  MAX_ARTICLE_GENERATION_CONTENT_HTML_CHARS,
  MAX_ARTICLE_GENERATION_EXCERPT_CHARS,
  MAX_ARTICLE_GENERATION_FAQ_FIELD_CHARS,
  MAX_ARTICLE_GENERATION_FAQS,
  MAX_ARTICLE_GENERATION_FOCUS_KEYWORD_CHARS,
  MAX_ARTICLE_GENERATION_HEADINGS,
  MAX_ARTICLE_GENERATION_HOLD_MESSAGE_CHARS,
  MAX_ARTICLE_GENERATION_META_DESCRIPTION_CHARS,
  MAX_ARTICLE_GENERATION_META_TITLE_CHARS,
  MAX_ARTICLE_GENERATION_SLUG_CHARS,
  MAX_ARTICLE_GENERATION_TITLE_CHARS,
  MIN_ARTICLE_GENERATION_BODY_TEXT_CHARS,
  type BlogArticleGenerationCandidate,
  type BlogArticleGenerationClaimReference,
  type BlogArticleGenerationFaq,
  type BlogArticleGenerationHoldCode,
  type BlogArticleGenerationValidationResult,
} from "@/lib/blogArticleGenerationContracts";
import {
  evaluateBlogOpportunity,
  MAX_INTENT_CHARS,
  MAX_OPPORTUNITY_ID_CHARS,
  MAX_TOPIC_CHARS,
} from "@/lib/blogOpportunityEngine";
import {
  matchBlogOpportunity,
  MAX_BLOG_MATCH_INVENTORY,
  MAX_MATCH_FOCUS_KEYWORD_CHARS,
  MAX_MATCH_SLUG_CHARS,
  normalizeBlogMatchSlug,
  toBlogOpportunityExistingContent,
} from "@/lib/blogOpportunityMatcher";
import {
  validateBlogResearchEvidence,
  type BlogResearchEvidenceResult,
} from "@/lib/blogResearchEvidence";
import { stripHtml } from "@/lib/seoOverview";

const REQUEST_KEYS = new Set([
  "task",
  "generationIntent",
  "opportunityId",
  "topic",
  "intent",
  "evidence",
  "inventory",
  "candidate",
  "advisoryInternalLinks",
]);
const REQUIRED_REQUEST_KEYS = new Set([
  "task",
  "generationIntent",
  "opportunityId",
  "topic",
  "evidence",
  "inventory",
  "candidate",
]);

const EVIDENCE_KEYS = new Set(["subject", "providerOutput", "grounding"]);
const REQUIRED_EVIDENCE_KEYS = new Set([
  "subject",
  "providerOutput",
  "grounding",
]);

const INVENTORY_KEYS = new Set(["rows"]);
const REQUIRED_INVENTORY_KEYS = new Set(["rows"]);

const CANDIDATE_KEYS = new Set([
  "opportunityId",
  "topic",
  "intent",
  "generationIntent",
  "title",
  "proposedSlug",
  "excerpt",
  "contentHtml",
  "metaTitle",
  "metaDescription",
  "focusKeyword",
  "faqs",
  "claimReferences",
  "verifiedClaimIndexes",
  "unknowns",
  "mediaRequirement",
  "humanReviewRequired",
]);
const REQUIRED_CANDIDATE_KEYS = new Set([
  "opportunityId",
  "topic",
  "generationIntent",
  "title",
  "proposedSlug",
  "excerpt",
  "contentHtml",
  "metaTitle",
  "metaDescription",
  "claimReferences",
  "unknowns",
  "mediaRequirement",
  "humanReviewRequired",
]);

const CLAIM_REF_KEYS = new Set(["claimIndex", "sourceIds"]);
const REQUIRED_CLAIM_REF_KEYS = new Set(["claimIndex", "sourceIds"]);
const FAQ_KEYS = new Set(["question", "answer"]);
const REQUIRED_FAQ_KEYS = new Set(["question", "answer"]);
const ADVISORY_LINK_KEYS = new Set(["href", "anchorText"]);
const REQUIRED_ADVISORY_LINK_KEYS = new Set(["href"]);

/**
 * Authority-changing / mutation / publish fields that must never appear on
 * the generation request or candidate. Prefer fail-closed rejection over
 * silent ignore.
 */
const FORBIDDEN_AUTHORITY_KEYS = new Set([
  "publicationIntent",
  "publish",
  "published",
  "save",
  "create_draft",
  "update_draft",
  "schedule",
  "scheduledAt",
  "autoPublish",
  "auto_publish",
  "blogId",
  "blog_id",
  "id",
  "entityId",
  "approval",
  "approved",
  "approvedAt",
  "schedulerEligible",
  "canonical_url",
  "canonicalUrl",
  "featured_image",
  "featuredImage",
  "featuredImageUrl",
  "publishedUrl",
  "publicUrl",
  "status",
  "persist",
  "retry",
  "evidenceState",
]);

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PLACEHOLDER_PLAIN =
  /^(todo|tbd|coming soon|lorem ipsum|placeholder|draft content)[\s.!?]*$/i;
const UNSAFE_TAG_RE = /<\s*(script|iframe|object|embed|form)\b/i;
const BODY_H1_RE = /<\s*h1\b/i;
const HEADING_RE = /<\s*h[1-6]\b/gi;
const EVENT_HANDLER_ATTR_RE =
  /\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i;
const HREF_RE = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
const SOURCE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

type DataSnapshot = { ok: true; value: Record<string, unknown> } | { ok: false };
type ArraySnapshot = { ok: true; value: unknown[] } | { ok: false };

type ParsedSubject = {
  opportunityId: string;
  topic: string;
  intent: string | null;
};

function hold(
  reasonCode: BlogArticleGenerationHoldCode,
  detail?: string
): BlogArticleGenerationValidationResult {
  const base = BLOG_ARTICLE_GENERATION_HOLD_MESSAGES[reasonCode];
  const message = detail
    ? clampText(`${base} ${detail}`, MAX_ARTICLE_GENERATION_HOLD_MESSAGE_CHARS)
    : base;
  return {
    ok: false,
    status: "HOLD",
    reasonCodes: [reasonCode],
    message,
  };
}

function clampText(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

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

function objectHasForbiddenAuthorityKey(raw: unknown): boolean {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  for (const key of Reflect.ownKeys(raw)) {
    if (typeof key === "string" && FORBIDDEN_AUTHORITY_KEYS.has(key)) {
      return true;
    }
  }
  return false;
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

function normalizeOptionalPlainText(
  value: unknown,
  maxChars: number
): { ok: true; value: string | null } | { ok: false } {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== "string" || value.length > maxChars) return { ok: false };
  if (!value.trim()) return { ok: true, value: null };
  const normalized = normalizePlainText(value, maxChars);
  return normalized ? { ok: true, value: normalized } : { ok: false };
}

function parseSubjectFields(
  opportunityIdRaw: unknown,
  topicRaw: unknown,
  intentRaw: unknown
): ParsedSubject | null {
  const opportunityId = normalizePlainText(
    opportunityIdRaw,
    MAX_OPPORTUNITY_ID_CHARS
  );
  const topic = normalizePlainText(topicRaw, MAX_TOPIC_CHARS);
  if (!opportunityId || !topic) return null;

  let intent: string | null = null;
  if (intentRaw !== undefined && intentRaw !== null) {
    if (typeof intentRaw !== "string" || intentRaw.length > MAX_INTENT_CHARS) {
      return null;
    }
    if (!intentRaw.trim()) {
      intent = null;
    } else {
      intent = normalizePlainText(intentRaw, MAX_INTENT_CHARS);
      if (!intent) return null;
    }
  }
  return { opportunityId, topic, intent };
}

function subjectsEqual(
  a: ParsedSubject,
  b: { opportunityId: string; topic: string; intent: string | null }
): boolean {
  return (
    a.opportunityId === b.opportunityId &&
    a.topic === b.topic &&
    a.intent === b.intent
  );
}

function collectHrefs(html: string): string[] {
  const out: string[] = [];
  HREF_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = HREF_RE.exec(html)) !== null) {
    out.push(String(match[1] ?? match[2] ?? match[3] ?? "").trim());
  }
  return out;
}

function classifyPreviewHref(href: string): { ok: boolean; detail: string } {
  if (!href) return { ok: true, detail: "" };
  const lower = href.toLowerCase();
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("data:") ||
    lower.startsWith("vbscript:")
  ) {
    return { ok: false, detail: "Unsafe href scheme." };
  }
  if (href.startsWith("//")) {
    return { ok: false, detail: "Protocol-relative URLs are not allowed." };
  }
  if (href.startsWith("/")) {
    if (href.startsWith("//") || /[\s\\]/.test(href) || href.includes("..")) {
      return { ok: false, detail: "Unsupported relative URL form." };
    }
    return { ok: true, detail: "" };
  }
  if (lower.startsWith("mailto:") || lower.startsWith("tel:")) {
    return { ok: true, detail: "" };
  }
  if (/^https?:\/\//i.test(href)) {
    let parsed: URL;
    try {
      parsed = new URL(href);
    } catch {
      return { ok: false, detail: "Malformed absolute URL." };
    }
    if (parsed.username || parsed.password) {
      return { ok: false, detail: "Credentials in URLs are not allowed." };
    }
    const host = parsed.hostname.toLowerCase();
    if (host === "firestick4uk.com" || host === "www.firestick4uk.com") {
      if (parsed.protocol !== "https:" || host !== "firestick4uk.com") {
        return {
          ok: false,
          detail: "Internal absolute links must use HTTPS apex firestick4uk.com.",
        };
      }
      return { ok: true, detail: "" };
    }
    if (parsed.protocol !== "https:") {
      return { ok: false, detail: "External links must use HTTPS." };
    }
    return { ok: true, detail: "" };
  }
  return { ok: false, detail: "Unsupported or unapproved href form." };
}

function countHeadings(html: string): number {
  HEADING_RE.lastIndex = 0;
  let count = 0;
  while (HEADING_RE.exec(html) !== null) count += 1;
  return count;
}

function sameSourceIdSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  if (setA.size !== a.length) return false;
  for (const id of b) {
    if (!setA.has(id)) return false;
  }
  return true;
}

function parseClaimReferences(
  raw: unknown,
  acceptedClaimCount: number,
  acceptedSourceIds: Set<string>,
  acceptedClaims: Array<{ sourceIds: string[] }>
):
  | { ok: true; value: BlogArticleGenerationClaimReference[] }
  | { ok: false; code: BlogArticleGenerationHoldCode } {
  const snapshot = snapshotDenseArray(raw, MAX_ARTICLE_GENERATION_CLAIM_REFERENCES);
  if (!snapshot.ok) return { ok: false, code: "INVALID_CLAIM_REFERENCES" };
  if (snapshot.value.length === 0) {
    return { ok: false, code: "INVALID_CLAIM_REFERENCES" };
  }

  const value: BlogArticleGenerationClaimReference[] = [];
  const seenIndexes = new Set<number>();
  for (const item of snapshot.value) {
    const ref = snapshotDataObject(item, CLAIM_REF_KEYS, REQUIRED_CLAIM_REF_KEYS);
    if (!ref.ok) return { ok: false, code: "INVALID_CLAIM_REFERENCES" };
    if (
      typeof ref.value.claimIndex !== "number" ||
      !Number.isInteger(ref.value.claimIndex) ||
      ref.value.claimIndex < 0 ||
      ref.value.claimIndex >= acceptedClaimCount ||
      seenIndexes.has(ref.value.claimIndex)
    ) {
      return { ok: false, code: "INVALID_CLAIM_REFERENCES" };
    }
    const idsSnapshot = snapshotDenseArray(ref.value.sourceIds, 4);
    if (!idsSnapshot.ok || idsSnapshot.value.length === 0) {
      return { ok: false, code: "INVALID_CLAIM_REFERENCES" };
    }
    const sourceIds: string[] = [];
    const seen = new Set<string>();
    for (const rawId of idsSnapshot.value) {
      if (typeof rawId !== "string" || !SOURCE_ID_PATTERN.test(rawId.trim())) {
        return { ok: false, code: "INVALID_CLAIM_REFERENCES" };
      }
      const id = rawId.trim();
      if (!acceptedSourceIds.has(id) || seen.has(id)) {
        return { ok: false, code: "INVALID_CLAIM_REFERENCES" };
      }
      seen.add(id);
      sourceIds.push(id);
    }
    const accepted = acceptedClaims[ref.value.claimIndex];
    if (!accepted || !sameSourceIdSet(sourceIds, accepted.sourceIds)) {
      return { ok: false, code: "INVALID_CLAIM_REFERENCES" };
    }
    seenIndexes.add(ref.value.claimIndex);
    value.push({ claimIndex: ref.value.claimIndex, sourceIds });
  }
  return { ok: true, value };
}

function parseFaqs(
  raw: unknown
):
  | { ok: true; value: BlogArticleGenerationFaq[] | undefined }
  | { ok: false; code: BlogArticleGenerationHoldCode } {
  if (raw === undefined) return { ok: true, value: undefined };
  const snapshot = snapshotDenseArray(raw, MAX_ARTICLE_GENERATION_FAQS);
  if (!snapshot.ok) return { ok: false, code: "INVALID_METADATA_OR_FAQ" };
  const value: BlogArticleGenerationFaq[] = [];
  for (const item of snapshot.value) {
    const faq = snapshotDataObject(item, FAQ_KEYS, REQUIRED_FAQ_KEYS);
    if (!faq.ok) return { ok: false, code: "INVALID_METADATA_OR_FAQ" };
    const question = normalizePlainText(
      faq.value.question,
      MAX_ARTICLE_GENERATION_FAQ_FIELD_CHARS
    );
    const answer = normalizePlainText(
      faq.value.answer,
      MAX_ARTICLE_GENERATION_FAQ_FIELD_CHARS
    );
    if (!question || !answer) {
      return { ok: false, code: "INVALID_METADATA_OR_FAQ" };
    }
    if (UNSAFE_TAG_RE.test(question) || UNSAFE_TAG_RE.test(answer)) {
      return { ok: false, code: "UNSAFE_HTML_OR_LINK" };
    }
    value.push({ question, answer });
  }
  return { ok: true, value };
}

function parseVerifiedClaimIndexes(
  raw: unknown,
  acceptedClaimCount: number,
  claimReferences: BlogArticleGenerationClaimReference[]
):
  | { ok: true; value: number[] | undefined }
  | { ok: false; code: BlogArticleGenerationHoldCode } {
  if (raw === undefined) return { ok: true, value: undefined };
  const snapshot = snapshotDenseArray(raw, MAX_ARTICLE_GENERATION_CLAIM_REFERENCES);
  if (!snapshot.ok) return { ok: false, code: "INVALID_CLAIM_REFERENCES" };
  const allowed = new Set(claimReferences.map((ref) => ref.claimIndex));
  const value: number[] = [];
  const seen = new Set<number>();
  for (const item of snapshot.value) {
    if (
      typeof item !== "number" ||
      !Number.isInteger(item) ||
      item < 0 ||
      item >= acceptedClaimCount ||
      !allowed.has(item) ||
      seen.has(item)
    ) {
      return { ok: false, code: "INVALID_CLAIM_REFERENCES" };
    }
    seen.add(item);
    value.push(item);
  }
  return { ok: true, value };
}

function parseUnknowns(
  raw: unknown,
  acceptedUnknowns: string[]
):
  | { ok: true; value: string[] }
  | { ok: false; code: BlogArticleGenerationHoldCode } {
  const snapshot = snapshotDenseArray(raw, 8);
  if (!snapshot.ok) return { ok: false, code: "INVALID_ARTICLE_STRUCTURE" };
  if (snapshot.value.length !== acceptedUnknowns.length) {
    return { ok: false, code: "INVALID_ARTICLE_STRUCTURE" };
  }
  const value: string[] = [];
  for (let i = 0; i < snapshot.value.length; i += 1) {
    if (typeof snapshot.value[i] !== "string") {
      return { ok: false, code: "INVALID_ARTICLE_STRUCTURE" };
    }
    const normalized = String(snapshot.value[i]).trim().replace(/\s+/g, " ");
    if (normalized !== acceptedUnknowns[i]) {
      return { ok: false, code: "INVALID_ARTICLE_STRUCTURE" };
    }
    value.push(acceptedUnknowns[i]);
  }
  return { ok: true, value };
}

function validateCandidateBody(
  contentHtml: string
): { ok: true } | { ok: false; code: BlogArticleGenerationHoldCode } {
  if (typeof contentHtml !== "string" || !contentHtml.trim()) {
    return { ok: false, code: "INVALID_ARTICLE_STRUCTURE" };
  }
  if (contentHtml.length > MAX_ARTICLE_GENERATION_CONTENT_HTML_CHARS) {
    return { ok: false, code: "CANDIDATE_TOO_LARGE" };
  }
  if (UNSAFE_TAG_RE.test(contentHtml) || EVENT_HANDLER_ATTR_RE.test(contentHtml)) {
    return { ok: false, code: "UNSAFE_HTML_OR_LINK" };
  }
  if (BODY_H1_RE.test(contentHtml)) {
    return { ok: false, code: "INVALID_ARTICLE_STRUCTURE" };
  }
  if (countHeadings(contentHtml) > MAX_ARTICLE_GENERATION_HEADINGS) {
    return { ok: false, code: "INVALID_ARTICLE_STRUCTURE" };
  }
  for (const href of collectHrefs(contentHtml)) {
    const classified = classifyPreviewHref(href);
    if (!classified.ok) {
      return { ok: false, code: "UNSAFE_HTML_OR_LINK" };
    }
  }
  const plain = stripHtml(contentHtml);
  if (!plain || plain.length < MIN_ARTICLE_GENERATION_BODY_TEXT_CHARS) {
    return { ok: false, code: "INVALID_ARTICLE_STRUCTURE" };
  }
  if (plain.length > MAX_ARTICLE_GENERATION_BODY_TEXT_CHARS) {
    return { ok: false, code: "CANDIDATE_TOO_LARGE" };
  }
  if (PLACEHOLDER_PLAIN.test(plain)) {
    return { ok: false, code: "INVALID_ARTICLE_STRUCTURE" };
  }
  return { ok: true };
}

function findExplicitEvidenceState(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const obj = raw as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(obj, "evidenceState")) {
    return obj.evidenceState;
  }
  return undefined;
}

function mapEvidenceFailure(
  result: BlogResearchEvidenceResult
): BlogArticleGenerationHoldCode {
  if (!result.ok) {
    if (result.reasonCodes.includes("INVALID_INPUT")) return "EVIDENCE_INVALID";
    if (
      result.reasonCodes.includes("INSUFFICIENT_SOURCES") ||
      result.reasonCodes.includes("INSUFFICIENT_CLAIMS")
    ) {
      return "EVIDENCE_INVALID";
    }
    return "EVIDENCE_INVALID";
  }
  return "EVIDENCE_INVALID";
}

/**
 * Validate a generation-only article preview request.
 * Fail-closed: any unsupported authority/mutation field or failed gate → HOLD.
 * Never throws for validation failure. Deterministic for identical input.
 */
export function validateBlogArticleGenerationPreview(
  raw: unknown
): BlogArticleGenerationValidationResult {
  const topLevelEvidenceState = findExplicitEvidenceState(raw);
  if (topLevelEvidenceState === "stale") {
    return hold("EVIDENCE_STALE");
  }
  if (topLevelEvidenceState === "ready") {
    // Caller-supplied READY is never accepted as proof of grounding.
    return hold("EVIDENCE_INVALID");
  }

  if (objectHasForbiddenAuthorityKey(raw)) {
    return hold("UNEXPECTED_PUBLICATION_FIELDS");
  }

  const request = snapshotDataObject(raw, REQUEST_KEYS, REQUIRED_REQUEST_KEYS);
  if (!request.ok) return hold("INVALID_REQUEST");

  if (request.value.task !== BLOG_ARTICLE_GENERATION_TASK) {
    if (
      typeof request.value.task !== "string" ||
      !String(request.value.task).trim()
    ) {
      return hold("INVALID_REQUEST");
    }
    return hold("UNSUPPORTED_TASK");
  }

  if (request.value.generationIntent !== BLOG_ARTICLE_GENERATION_INTENT) {
    return hold("UNSUPPORTED_INTENT");
  }

  const subject = parseSubjectFields(
    request.value.opportunityId,
    request.value.topic,
    request.value.intent
  );
  if (!subject) return hold("INVALID_SUBJECT");

  const nestedEvidenceState = findExplicitEvidenceState(request.value.evidence);
  if (nestedEvidenceState === "stale") {
    return hold("EVIDENCE_STALE");
  }
  if (nestedEvidenceState === "ready") {
    return hold("EVIDENCE_INVALID");
  }
  if (
    request.value.evidence &&
    typeof request.value.evidence === "object" &&
    !Array.isArray(request.value.evidence)
  ) {
    const evidenceObj = request.value.evidence as Record<string, unknown>;
    if (
      Object.prototype.hasOwnProperty.call(evidenceObj, "ready") ||
      Object.prototype.hasOwnProperty.call(evidenceObj, "status")
    ) {
      return hold("UNEXPECTED_PUBLICATION_FIELDS");
    }
  }

  if (objectHasForbiddenAuthorityKey(request.value.evidence)) {
    return hold("UNEXPECTED_PUBLICATION_FIELDS");
  }
  const evidenceSnap = snapshotDataObject(
    request.value.evidence,
    EVIDENCE_KEYS,
    REQUIRED_EVIDENCE_KEYS
  );
  if (!evidenceSnap.ok) return hold("EVIDENCE_MISSING");

  if (
    !evidenceSnap.value.providerOutput ||
    !evidenceSnap.value.grounding ||
    !evidenceSnap.value.subject
  ) {
    return hold("EVIDENCE_MISSING");
  }

  if (objectHasForbiddenAuthorityKey(evidenceSnap.value.subject)) {
    return hold("UNEXPECTED_PUBLICATION_FIELDS");
  }

  // Grounding metadata must be present as an object before AB-7A runs.
  if (
    !evidenceSnap.value.grounding ||
    typeof evidenceSnap.value.grounding !== "object" ||
    Array.isArray(evidenceSnap.value.grounding)
  ) {
    return hold("EVIDENCE_MISSING");
  }
  const groundingObj = evidenceSnap.value.grounding as Record<string, unknown>;
  if (
    !Object.prototype.hasOwnProperty.call(groundingObj, "groundedUrls") ||
    groundingObj.groundedUrls === undefined ||
    groundingObj.groundedUrls === null
  ) {
    return hold("EVIDENCE_MISSING");
  }

  const evidenceResult = validateBlogResearchEvidence(
    evidenceSnap.value.subject,
    evidenceSnap.value.providerOutput,
    evidenceSnap.value.grounding
  );

  if (!evidenceResult.ok) {
    return hold(mapEvidenceFailure(evidenceResult));
  }

  if (
    evidenceResult.evidenceState !== "ready" ||
    !evidenceResult.reasonCodes.includes("GROUNDED_EVIDENCE_READY")
  ) {
    return hold("EVIDENCE_INVALID");
  }

  if (!subjectsEqual(subject, evidenceResult.subject)) {
    return hold("SUBJECT_MISMATCH");
  }

  if (objectHasForbiddenAuthorityKey(request.value.inventory)) {
    return hold("UNEXPECTED_PUBLICATION_FIELDS");
  }
  const inventorySnap = snapshotDataObject(
    request.value.inventory,
    INVENTORY_KEYS,
    REQUIRED_INVENTORY_KEYS
  );
  if (!inventorySnap.ok) return hold("INVALID_INVENTORY");

  const rowsSnapshot = snapshotDenseArray(
    inventorySnap.value.rows,
    MAX_BLOG_MATCH_INVENTORY
  );
  if (!rowsSnapshot.ok) return hold("INVALID_INVENTORY");

  const focusFromCandidate =
    request.value.candidate &&
    typeof request.value.candidate === "object" &&
    !Array.isArray(request.value.candidate)
      ? (request.value.candidate as Record<string, unknown>).focusKeyword
      : undefined;
  const proposedSlugFromCandidate =
    request.value.candidate &&
    typeof request.value.candidate === "object" &&
    !Array.isArray(request.value.candidate)
      ? (request.value.candidate as Record<string, unknown>).proposedSlug
      : undefined;

  const matchOpportunity = {
    topic: subject.topic,
    intent: subject.intent,
    proposedSlug:
      typeof proposedSlugFromCandidate === "string"
        ? proposedSlugFromCandidate
        : null,
    focusKeyword:
      typeof focusFromCandidate === "string" ? focusFromCandidate : null,
  };

  const match = matchBlogOpportunity(matchOpportunity, rowsSnapshot.value);
  if (match.reasonCodes.includes("INVALID_INPUT")) {
    return hold("INVALID_INVENTORY");
  }

  if (match.match === "EXACT" || match.match === "STRONG") {
    if (match.disposition === "historical_recovery") {
      return hold("HISTORICAL_RECOVERY_REQUIRED");
    }
    if (match.disposition === "refresh") {
      return hold("EXISTING_CONTENT_REFRESH_REQUIRED");
    }
    return hold("DUPLICATE_OR_STRONG_MATCH");
  }

  if (match.disposition === "refresh") {
    return hold("EXISTING_CONTENT_REFRESH_REQUIRED");
  }
  if (match.disposition === "historical_recovery") {
    return hold("HISTORICAL_RECOVERY_REQUIRED");
  }
  if (match.newBlogCandidate !== true || match.disposition !== "none") {
    return hold("NEW_ARTICLE_NOT_ELIGIBLE");
  }

  const handoff = toBlogOpportunityExistingContent(match);
  if (handoff.newBlogCandidate !== true) {
    return hold("NEW_ARTICLE_NOT_ELIGIBLE");
  }

  const decision = evaluateBlogOpportunity({
    opportunityId: subject.opportunityId,
    topic: subject.topic,
    intent: subject.intent,
    evidenceState: "ready",
    existingContent: handoff.existingContent,
    newBlogCandidate: handoff.newBlogCandidate,
    reasonEvidence: ["AB-8B preview eligibility composed from AB-7A and AB-4."],
  });

  if (decision.action !== "NEW_BLOG") {
    return hold("NEW_ARTICLE_NOT_ELIGIBLE");
  }

  // Advisory links are optional and must not mutate validation outcomes beyond shape.
  if (request.value.advisoryInternalLinks !== undefined) {
    const advisory = snapshotDenseArray(
      request.value.advisoryInternalLinks,
      MAX_ARTICLE_GENERATION_ADVISORY_LINKS
    );
    if (!advisory.ok) return hold("INVALID_REQUEST");
    for (const item of advisory.value) {
      const link = snapshotDataObject(
        item,
        ADVISORY_LINK_KEYS,
        REQUIRED_ADVISORY_LINK_KEYS
      );
      if (!link.ok) return hold("INVALID_REQUEST");
      if (typeof link.value.href !== "string" || !link.value.href.trim()) {
        return hold("INVALID_REQUEST");
      }
      const classified = classifyPreviewHref(link.value.href.trim());
      if (!classified.ok) return hold("UNSAFE_HTML_OR_LINK");
      if (link.value.anchorText !== undefined) {
        const anchor = normalizeOptionalPlainText(link.value.anchorText, 200);
        if (!anchor.ok) return hold("INVALID_REQUEST");
      }
    }
  }

  if (objectHasForbiddenAuthorityKey(request.value.candidate)) {
    return hold("UNEXPECTED_PUBLICATION_FIELDS");
  }

  const candidateSnap = snapshotDataObject(
    request.value.candidate,
    CANDIDATE_KEYS,
    REQUIRED_CANDIDATE_KEYS
  );
  if (!candidateSnap.ok) return hold("INVALID_ARTICLE_STRUCTURE");

  const c = candidateSnap.value;
  if (c.generationIntent !== BLOG_ARTICLE_GENERATION_INTENT) {
    return hold("UNSUPPORTED_INTENT");
  }
  if (c.mediaRequirement !== "missing") {
    return hold("INVALID_ARTICLE_STRUCTURE");
  }
  if (c.humanReviewRequired !== true) {
    return hold("INVALID_ARTICLE_STRUCTURE");
  }

  const candidateSubject = parseSubjectFields(
    c.opportunityId,
    c.topic,
    c.intent
  );
  if (!candidateSubject || !subjectsEqual(subject, candidateSubject)) {
    return hold("SUBJECT_MISMATCH");
  }

  const title = normalizePlainText(c.title, MAX_ARTICLE_GENERATION_TITLE_CHARS);
  const excerpt = normalizePlainText(
    c.excerpt,
    MAX_ARTICLE_GENERATION_EXCERPT_CHARS
  );
  const metaTitle = normalizePlainText(
    c.metaTitle,
    MAX_ARTICLE_GENERATION_META_TITLE_CHARS
  );
  const metaDescription = normalizePlainText(
    c.metaDescription,
    MAX_ARTICLE_GENERATION_META_DESCRIPTION_CHARS
  );
  if (!title || !excerpt) return hold("INVALID_ARTICLE_STRUCTURE");
  if (!metaTitle || !metaDescription) return hold("INVALID_METADATA_OR_FAQ");

  if (typeof c.proposedSlug !== "string") {
    return hold("INVALID_ARTICLE_STRUCTURE");
  }
  const proposedSlugRaw = c.proposedSlug.trim().toLowerCase();
  if (
    !proposedSlugRaw ||
    proposedSlugRaw.length > MAX_ARTICLE_GENERATION_SLUG_CHARS ||
    proposedSlugRaw.length > MAX_MATCH_SLUG_CHARS ||
    !SLUG_PATTERN.test(proposedSlugRaw) ||
    normalizeBlogMatchSlug(proposedSlugRaw) !== proposedSlugRaw
  ) {
    return hold("INVALID_ARTICLE_STRUCTURE");
  }

  const focusKeyword = normalizeOptionalPlainText(
    c.focusKeyword,
    Math.min(
      MAX_ARTICLE_GENERATION_FOCUS_KEYWORD_CHARS,
      MAX_MATCH_FOCUS_KEYWORD_CHARS
    )
  );
  if (!focusKeyword.ok) return hold("INVALID_METADATA_OR_FAQ");

  if (typeof c.contentHtml !== "string") {
    return hold("INVALID_ARTICLE_STRUCTURE");
  }
  if (c.contentHtml.length > MAX_ARTICLE_GENERATION_CONTENT_HTML_CHARS) {
    return hold("CANDIDATE_TOO_LARGE");
  }
  const bodyCheck = validateCandidateBody(c.contentHtml);
  if (!bodyCheck.ok) return hold(bodyCheck.code);

  const acceptedSourceIds = new Set(
    evidenceResult.sources.map((source) => source.id)
  );
  const claimRefs = parseClaimReferences(
    c.claimReferences,
    evidenceResult.claims.length,
    acceptedSourceIds,
    evidenceResult.claims
  );
  if (!claimRefs.ok) return hold(claimRefs.code);

  const verified = parseVerifiedClaimIndexes(
    c.verifiedClaimIndexes,
    evidenceResult.claims.length,
    claimRefs.value
  );
  if (!verified.ok) return hold(verified.code);

  const faqs = parseFaqs(c.faqs);
  if (!faqs.ok) return hold(faqs.code);

  const unknowns = parseUnknowns(c.unknowns, evidenceResult.unknowns);
  if (!unknowns.ok) return hold(unknowns.code);

  const candidate: BlogArticleGenerationCandidate = {
    opportunityId: subject.opportunityId,
    topic: subject.topic,
    intent: subject.intent,
    generationIntent: BLOG_ARTICLE_GENERATION_INTENT,
    title,
    proposedSlug: proposedSlugRaw,
    excerpt,
    contentHtml: c.contentHtml,
    metaTitle,
    metaDescription,
    focusKeyword: focusKeyword.value,
    faqs: faqs.value,
    claimReferences: claimRefs.value,
    verifiedClaimIndexes: verified.value,
    unknowns: unknowns.value,
    mediaRequirement: "missing",
    humanReviewRequired: true,
  };

  return {
    ok: true,
    status: "VALID_PREVIEW",
    candidate,
    provenance: {
      subject: {
        opportunityId: evidenceResult.subject.opportunityId,
        topic: evidenceResult.subject.topic,
        intent: evidenceResult.subject.intent,
      },
      sources: evidenceResult.sources.map((source) => ({
        id: source.id,
        title: source.title,
        url: source.url,
      })),
      claims: evidenceResult.claims.map((claim) => ({
        claim: claim.claim,
        sourceIds: claim.sourceIds.slice(),
      })),
      unknowns: evidenceResult.unknowns.slice(),
      searchQueries: evidenceResult.searchQueries.slice(),
      inventoryTrust: "caller_supplied_bounded_snapshot",
      planningAction: "NEW_BLOG",
    },
  };
}

/**
 * Convenience: HOLD when an explicit stale evidence state is supplied by a
 * caller outside the strict request shape (e.g. orchestrator pre-check).
 */
export function rejectStaleBlogArticleEvidenceState(
  evidenceState: unknown
): BlogArticleGenerationValidationResult | null {
  if (evidenceState === "stale") {
    return hold("EVIDENCE_STALE");
  }
  return null;
}
