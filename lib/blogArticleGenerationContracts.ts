/**
 * AB-8B — Generation-only Blog article preview contracts.
 *
 * Pure TypeScript shapes and constants for future AB-8C orchestration.
 * This module defines contracts only: no provider calls, no CMS/DB reads or
 * writes, no persistence, no publishing, no routes, and no UI.
 *
 * Trust boundary (explicit):
 * - Pure validation cannot authenticate who supplied a raw research packet or
 *   grounding metadata. A caller-supplied `evidenceState: "ready"` string is
 *   NOT proof. A copied W4B brief is NOT proof. URLs typed into an AI response
 *   are NOT independent grounding.
 * - Future AB-8C must obtain grounding through the trusted server-side
 *   provider/runtime boundary and must supply permission-authorized CMS
 *   inventory. AB-8B revalidates AB-7A locally on request-scoped fixtures only.
 * - A successful fixture validation is not production authorization.
 *
 * Semantic limitation (explicit):
 * - Deterministic validation cannot establish semantic truth for every sentence
 *   in generated article text. Claim/source integrity checks bind structured
 *   citations to accepted AB-7A provenance; they do not certify prose accuracy,
 *   commercial facts, prices, compatibility claims, or review statistics.
 * - Future AB-8C / AB-10 must still apply grounded-output checking and
 *   editorial review. Passing AB-8B is not AB-1 pre-publish QA and is not
 *   proof of safe-to-render HTML after sanitization.
 */

import type {
  BlogMatchInventoryRow,
  BlogMatchOpportunity,
} from "@/lib/blogOpportunityMatcher";
import type {
  BlogResearchGrounding,
  BlogResearchProviderOutput,
  BlogResearchSubject,
  NormalizedBlogResearchClaim,
  NormalizedBlogResearchSource,
} from "@/lib/blogResearchEvidence";

/** Exact task discriminator for generation-only preview validation. */
export const BLOG_ARTICLE_GENERATION_TASK =
  "generate_blog_article_preview" as const;

export type BlogArticleGenerationTask = typeof BLOG_ARTICLE_GENERATION_TASK;

/** Generation intent — preview only; never publish/save/draft mutation. */
export const BLOG_ARTICLE_GENERATION_INTENT = "preview_only" as const;

export type BlogArticleGenerationIntent =
  typeof BLOG_ARTICLE_GENERATION_INTENT;

export const BLOG_ARTICLE_GENERATION_HOLD_CODES = [
  "INVALID_REQUEST",
  "UNSUPPORTED_TASK",
  "UNSUPPORTED_INTENT",
  "INVALID_SUBJECT",
  "EVIDENCE_MISSING",
  "EVIDENCE_INVALID",
  "EVIDENCE_STALE",
  "SUBJECT_MISMATCH",
  "INVALID_INVENTORY",
  "EXISTING_CONTENT_REFRESH_REQUIRED",
  "HISTORICAL_RECOVERY_REQUIRED",
  "DUPLICATE_OR_STRONG_MATCH",
  "NEW_ARTICLE_NOT_ELIGIBLE",
  "INVALID_ARTICLE_STRUCTURE",
  "UNSAFE_HTML_OR_LINK",
  "INVALID_CLAIM_REFERENCES",
  "CANDIDATE_TOO_LARGE",
  "INVALID_METADATA_OR_FAQ",
  "UNEXPECTED_PUBLICATION_FIELDS",
] as const;

export type BlogArticleGenerationHoldCode =
  (typeof BLOG_ARTICLE_GENERATION_HOLD_CODES)[number];

/** Preview media state — always missing in AB-8B (AB-9 owns media). */
export type BlogArticleGenerationMediaRequirement = "missing";

/**
 * Structured citation binding for a proposed preview candidate.
 * Indexes refer to the accepted AB-7A claims array from this request only.
 */
export type BlogArticleGenerationClaimReference = {
  /** Zero-based index into accepted AB-7A claims. */
  claimIndex: number;
  /** Source IDs that must exactly match the accepted claim's sourceIds set. */
  sourceIds: string[];
};

export type BlogArticleGenerationFaq = {
  question: string;
  answer: string;
};

/**
 * Intermediate generation-only candidate. Distinct from AB-1's
 * AutonomousBlogCandidate (which requires publicationIntent: "publish").
 *
 * No Blog ID, no published URL, no featured-image URL, no canonical URL,
 * no publicationIntent, no scheduler decision, and no approval flag.
 */
export type BlogArticleGenerationCandidate = {
  opportunityId: string;
  topic: string;
  intent: string | null;
  generationIntent: BlogArticleGenerationIntent;
  title: string;
  /** Proposed slug only — not an approved public URL. */
  proposedSlug: string;
  excerpt: string;
  /** HTML body for preview validation only; not publish-authorized. */
  contentHtml: string;
  metaTitle: string;
  metaDescription: string;
  focusKeyword?: string | null;
  faqs?: BlogArticleGenerationFaq[];
  /**
   * Structured citations that must bind to accepted AB-7A claims/sources.
   * Prose outside these references must not be labeled verified.
   */
  claimReferences: BlogArticleGenerationClaimReference[];
  /**
   * Optional list of claim indexes the candidate labels as verified-evidence.
   * Only accepted AB-7A claim indexes may appear; fabricated verified claims HOLD.
   */
  verifiedClaimIndexes?: number[];
  /** Preserved AB-7A unknowns — must not be silently converted to facts. */
  unknowns: string[];
  mediaRequirement: BlogArticleGenerationMediaRequirement;
  /**
   * Non-authorizing label. Does not create an approval workflow or permit publish.
   */
  humanReviewRequired: true;
};

/**
 * Request-scoped research evidence input.
 * Raw provider output and grounding metadata are supplied separately.
 * Caller-supplied ready flags are ignored as proof — AB-7A must revalidate.
 */
export type BlogArticleGenerationEvidenceInput = {
  subject: BlogResearchSubject;
  providerOutput: BlogResearchProviderOutput;
  grounding: BlogResearchGrounding;
};

/**
 * Bounded Blog inventory snapshot for AB-4 matching.
 * Caller-controlled empty inventory is NOT proof that authoritative CMS
 * inventory has no matching content. Future AB-8C must supply fresh,
 * permission-authorized inventory.
 */
export type BlogArticleGenerationInventoryInput = {
  rows: BlogMatchInventoryRow[];
};

/**
 * Optional advisory AB-6 link suggestions. Not inserted into HTML, not
 * treated as verified published links, and not used to invent destinations.
 */
export type BlogArticleGenerationAdvisoryLink = {
  href: string;
  anchorText?: string;
};

export type BlogArticleGenerationRequest = {
  task: BlogArticleGenerationTask;
  generationIntent: BlogArticleGenerationIntent;
  opportunityId: string;
  topic: string;
  intent?: string | null;
  evidence: BlogArticleGenerationEvidenceInput;
  inventory: BlogArticleGenerationInventoryInput;
  candidate: BlogArticleGenerationCandidate;
  /** Optional AB-6 advisory input — ignored for insertion/verification. */
  advisoryInternalLinks?: BlogArticleGenerationAdvisoryLink[];
};

/** Provenance retained only for a successful preview validation. */
export type BlogArticleGenerationAcceptedProvenance = {
  subject: {
    opportunityId: string;
    topic: string;
    intent: string | null;
  };
  sources: Array<Pick<NormalizedBlogResearchSource, "id" | "title" | "url">>;
  claims: NormalizedBlogResearchClaim[];
  unknowns: string[];
  searchQueries: string[];
  /**
   * Explicit trust marker: inventory was caller-supplied for this request.
   * Never claims authoritative CMS completeness.
   */
  inventoryTrust: "caller_supplied_bounded_snapshot";
  /**
   * AB-3 planning signal when composed. NEW_BLOG is NOT publication approval.
   */
  planningAction: "NEW_BLOG";
};

export type BlogArticleGenerationValidationResult =
  | {
      ok: true;
      status: "VALID_PREVIEW";
      candidate: BlogArticleGenerationCandidate;
      provenance: BlogArticleGenerationAcceptedProvenance;
    }
  | {
      ok: false;
      status: "HOLD";
      reasonCodes: BlogArticleGenerationHoldCode[];
      message: string;
    };

/** Opportunity shape reused when calling AB-4 matchBlogOpportunity. */
export type BlogArticleGenerationMatchOpportunity = BlogMatchOpportunity;

/** Preview editorial bounds — not Google ranking factors. */
export const MAX_ARTICLE_GENERATION_TITLE_CHARS = 200;
export const MAX_ARTICLE_GENERATION_SLUG_CHARS = 200;
export const MAX_ARTICLE_GENERATION_EXCERPT_CHARS = 500;
export const MAX_ARTICLE_GENERATION_META_TITLE_CHARS = 70;
export const MAX_ARTICLE_GENERATION_META_DESCRIPTION_CHARS = 180;
export const MAX_ARTICLE_GENERATION_FOCUS_KEYWORD_CHARS = 120;
export const MAX_ARTICLE_GENERATION_CONTENT_HTML_CHARS = 100_000;
export const MIN_ARTICLE_GENERATION_BODY_TEXT_CHARS = 200;
export const MAX_ARTICLE_GENERATION_BODY_TEXT_CHARS = 80_000;
export const MAX_ARTICLE_GENERATION_FAQS = 12;
export const MAX_ARTICLE_GENERATION_FAQ_FIELD_CHARS = 4_000;
export const MAX_ARTICLE_GENERATION_CLAIM_REFERENCES = 12;
export const MAX_ARTICLE_GENERATION_HEADINGS = 40;
export const MAX_ARTICLE_GENERATION_ADVISORY_LINKS = 12;
export const MAX_ARTICLE_GENERATION_HOLD_MESSAGE_CHARS = 280;

export const BLOG_ARTICLE_GENERATION_HOLD_MESSAGES: Record<
  BlogArticleGenerationHoldCode,
  string
> = {
  INVALID_REQUEST: "Article generation preview request is invalid.",
  UNSUPPORTED_TASK: "Unsupported article generation task.",
  UNSUPPORTED_INTENT: "Unsupported article generation intent.",
  INVALID_SUBJECT: "Article generation subject is invalid.",
  EVIDENCE_MISSING: "Grounded research evidence is missing.",
  EVIDENCE_INVALID: "Grounded research evidence failed validation.",
  EVIDENCE_STALE: "Stale evidence is not accepted for preview generation.",
  SUBJECT_MISMATCH: "Evidence subject does not match the generation request.",
  INVALID_INVENTORY: "Blog inventory snapshot is missing or malformed.",
  EXISTING_CONTENT_REFRESH_REQUIRED:
    "Existing content refresh is required; new-article preview is blocked.",
  HISTORICAL_RECOVERY_REQUIRED:
    "Historical recovery is required; new-article preview is blocked.",
  DUPLICATE_OR_STRONG_MATCH:
    "Existing exact or strong content match blocks new-article preview.",
  NEW_ARTICLE_NOT_ELIGIBLE:
    "Opportunity is not eligible for a new-article preview.",
  INVALID_ARTICLE_STRUCTURE: "Proposed article structure is invalid.",
  UNSAFE_HTML_OR_LINK: "Proposed article contains unsafe HTML or links.",
  INVALID_CLAIM_REFERENCES:
    "Proposed claim or source references are invalid.",
  CANDIDATE_TOO_LARGE: "Proposed article candidate exceeds size bounds.",
  INVALID_METADATA_OR_FAQ: "Proposed metadata or FAQ structure is invalid.",
  UNEXPECTED_PUBLICATION_FIELDS:
    "Unexpected publication or mutation fields are not allowed.",
};
