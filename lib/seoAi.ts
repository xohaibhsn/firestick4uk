/**
 * Shared SEO AI types, request/output validation, and prompt construction.
 * Provider adapters live in seoAiServer.ts (server-only).
 */

export type SeoAiProvider = "gemini" | "openai";
export type ProductAiProvider = SeoAiProvider;
export type SeoAiTask =
  | "explain_issue"
  | "draft_metadata"
  | "draft_product_fields"
  | "review_product";

export type SeoAiExplainRequest = {
  provider: SeoAiProvider;
  task: "explain_issue";
  issueId: string;
};

export type SeoAiDraftUnsaved = {
  seoTitle?: string;
  metaDescription?: string;
  focusKeyword?: string;
  displayTitle?: string;
};

export type SeoAiDraftRequest = {
  provider: SeoAiProvider;
  task: "draft_metadata";
  entityType: "product" | "blog";
  entityId: string;
  unsaved?: SeoAiDraftUnsaved;
};

/** Request-time only; never persisted. */
export type ProductKindHint =
  | "digital_subscription"
  | "physical"
  | "unknown";

/** New unsaved product — draft/apply whitelist (no badge). */
export const PRODUCT_AI_NEW_EDITABLE_FIELDS = [
  "name",
  "slug",
  "short_description",
  "full_description",
  "features",
  "seo_title",
  "meta_description",
  "focus_keyword",
] as const;

/** Existing saved product — draft/apply-safe whitelist (no name/slug/badge). */
export const PRODUCT_AI_EXISTING_EDITABLE_FIELDS = [
  "short_description",
  "full_description",
  "features",
  "seo_title",
  "meta_description",
  "focus_keyword",
] as const;

/**
 * PAI-4 review fields: Class-A editable + identity-sensitive name (review-only).
 * Never includes slug or other C-class fields.
 */
export const PRODUCT_AI_REVIEW_FIELDS = [
  "name",
  "short_description",
  "full_description",
  "features",
  "seo_title",
  "meta_description",
  "focus_keyword",
] as const;

export type ProductAiNewEditableField =
  (typeof PRODUCT_AI_NEW_EDITABLE_FIELDS)[number];
export type ProductAiExistingEditableField =
  (typeof PRODUCT_AI_EXISTING_EDITABLE_FIELDS)[number];
export type ProductAiReviewField =
  (typeof PRODUCT_AI_REVIEW_FIELDS)[number];
export type ProductAiEditableField =
  | ProductAiNewEditableField
  | ProductAiExistingEditableField;

export type ProductAiAuthoritative = {
  productKind: ProductKindHint;
  brand?: string;
  canonicalName: string;
  category?: "Subscription" | "Device" | "Bundle";
  priceGbp?: number;
  stockLabel?: string;
  active?: boolean;
  slug?: string | null;
  productId?: number | null;
  duration?: string;
  variant?: string;
  confirmedCompatibility?: string[];
  confirmedFeatures?: string[];
  approvedClaims?: string[];
  imageUrl?: string | null;
  ogImageUrl?: string | null;
};

export type ProductAiEditorCopy = {
  name?: string;
  slug?: string;
  short_description?: string;
  full_description?: string;
  features?: string;
  seo_title?: string;
  meta_description?: string;
  focus_keyword?: string;
};

export type SeoAiProductFieldsRequest = {
  provider: SeoAiProvider;
  task: "draft_product_fields";
  productId: number | null;
  productKind: ProductKindHint;
  requestedFields: ProductAiEditableField[];
  authoritative: ProductAiAuthoritative;
  currentEditorCopy: ProductAiEditorCopy;
};

/** Class-A editor copy only — never name/slug for review request body. */
export type ProductAiReviewEditorCopy = {
  short_description?: string;
  full_description?: string;
  features?: string;
  seo_title?: string;
  meta_description?: string;
  focus_keyword?: string;
};

export type SeoAiProductReviewRequest = {
  provider: SeoAiProvider;
  task: "review_product";
  productId: number;
  productKind?: ProductKindHint;
  currentEditorCopy: ProductAiReviewEditorCopy;
};

export type ProductAiReviewStatus = "ok" | "suggest" | "warning";
export type ProductAiReviewConfidence = "high" | "medium" | "low";

export type ProductAiReviewItem = {
  field: ProductAiReviewField;
  current: string;
  suggested: string | null;
  reason: string;
  status: ProductAiReviewStatus;
  confidence?: ProductAiReviewConfidence;
};

export type ProductAiReviewContext = {
  productId: number;
  productKind: ProductKindHint;
  /** DB-authoritative identity / C-class facts (read-only context). */
  dbTruth: {
    id: number;
    name: string;
    slug: string;
    category: string;
    priceGbp?: number;
    stockLabel?: string;
    active?: boolean;
    imageUrl?: string | null;
    ogImageUrl?: string | null;
  };
  /** Plain-text Class-A copy from current editor (or DB fallback). */
  reviewCopy: {
    name: string;
    short_description: string;
    full_description: string;
    features: string;
    seo_title: string;
    meta_description: string;
    focus_keyword: string;
  };
};

export type ProductAiFieldSuggestion = {
  value: string;
  reason?: string;
};

export type ProductAiFieldUnavailable = {
  unavailable: true;
  reason: string;
};

export type ProductAiSuggestions = Partial<
  Record<ProductAiEditableField, ProductAiFieldSuggestion>
>;

export type ProductAiDraftContext = {
  productId: number | null;
  productKind: ProductKindHint;
  requestedFields: ProductAiEditableField[];
  authoritative: ProductAiAuthoritative;
  currentEditorCopy: ProductAiEditorCopy;
};

export type SeoAiRequest =
  | SeoAiExplainRequest
  | SeoAiDraftRequest
  | SeoAiProductFieldsRequest
  | SeoAiProductReviewRequest;

export type SeoAiMetadataDraft = {
  titles: string[];
  meta_descriptions: string[];
};

export type SeoAiMetadataDraftContext = {
  entityType: "product" | "blog";
  entityId: string;
  authoritative: {
    slug: string;
    category: string;
    displayTitle: string;
    seoTitle: string;
    metaDescription: string;
    focusKeyword: string;
    summaryText: string;
  };
  unsaved: SeoAiDraftUnsaved;
};

export const PRODUCT_TITLE_MAX = 70;
export const BLOG_TITLE_MAX = 75;
export const META_DESC_MAX = 180;

/** Deterministic output/input bounds for product AI drafting. */
export const PRODUCT_AI_FIELD_MAX: Record<ProductAiNewEditableField, number> = {
  name: 200,
  slug: 120,
  short_description: 600,
  full_description: 8000,
  features: 4000,
  seo_title: PRODUCT_TITLE_MAX,
  meta_description: META_DESC_MAX,
  focus_keyword: 120,
};

export const PRODUCT_AI_REASON_MAX = 300;
export const PRODUCT_AI_REVIEW_CURRENT_MAX = 8000;
export const PRODUCT_AI_REVIEW_SUGGESTED_MAX = 8000;
export const PRODUCT_AI_CANONICAL_NAME_MAX = 200;
export const PRODUCT_AI_CLAIM_ITEM_MAX = 200;
export const PRODUCT_AI_CLAIM_LIST_MAX = 12;
export const PRODUCT_AI_BRAND_MAX = 80;

export type SeoAiExplanation = {
  summary: string;
  why_it_matters: string;
  recommended_action: string;
  cautions: string[];
};

export type ParsedIssueId = {
  entityType: "product" | "blog";
  entityId: string;
  ruleCode: string;
};

export type SeoAiVerifiedIssueContext = {
  id: string;
  severity: string;
  category: string;
  entityType: "product" | "blog";
  entityId: string;
  label: string;
  url: string | null;
  field: string | null;
  message: string;
  evidence: string;
  entityFacts?: {
    slug?: string;
    effectiveTitle?: string;
    effectiveDescription?: string;
    focusKeyword?: string;
  };
};

export type SeoAiPublicErrorCode =
  | "invalid_request"
  | "issue_not_found"
  | "entity_not_found"
  | "rate_limited"
  | "provider_not_configured"
  | "provider_timeout"
  | "provider_upstream"
  | "malformed_provider_output";

export const SEO_AI_PROVIDER_TIMEOUT_MS = 20_000;

export const SEO_AI_EXPLANATION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "why_it_matters", "recommended_action", "cautions"],
  properties: {
    summary: { type: "string" },
    why_it_matters: { type: "string" },
    recommended_action: { type: "string" },
    cautions: {
      type: "array",
      items: { type: "string" },
      maxItems: 3,
    },
  },
} as const;

export const SEO_AI_METADATA_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["titles", "meta_descriptions"],
  properties: {
    titles: {
      type: "array",
      items: { type: "string" },
      minItems: 1,
      maxItems: 3,
    },
    meta_descriptions: {
      type: "array",
      items: { type: "string" },
      minItems: 1,
      maxItems: 3,
    },
  },
} as const;

const ISSUE_ID_RE = /^(product|blog):(\d+):([a-z0-9][a-z0-9_-]{0,80})$/i;

const ALLOWED_EXPLAIN_REQUEST_KEYS = new Set(["provider", "task", "issueId"]);
const ALLOWED_DRAFT_REQUEST_KEYS = new Set([
  "provider",
  "task",
  "entityType",
  "entityId",
  "unsaved",
]);
const ALLOWED_PRODUCT_FIELDS_REQUEST_KEYS = new Set([
  "provider",
  "task",
  "productId",
  "productKind",
  "requestedFields",
  "authoritative",
  "currentEditorCopy",
]);
const ALLOWED_PRODUCT_REVIEW_REQUEST_KEYS = new Set([
  "provider",
  "task",
  "productId",
  "productKind",
  "currentEditorCopy",
]);
const ALLOWED_REVIEW_EDITOR_COPY_KEYS = new Set([
  "short_description",
  "full_description",
  "features",
  "seo_title",
  "meta_description",
  "focus_keyword",
]);
const REVIEW_FIELD_SET = new Set<string>(PRODUCT_AI_REVIEW_FIELDS);
const REVIEW_STATUS_SET = new Set<ProductAiReviewStatus>([
  "ok",
  "suggest",
  "warning",
]);
const REVIEW_CONFIDENCE_SET = new Set<ProductAiReviewConfidence>([
  "high",
  "medium",
  "low",
]);
const ALLOWED_UNSAVED_KEYS = new Set([
  "seoTitle",
  "metaDescription",
  "focusKeyword",
  "displayTitle",
]);
const UNSAVED_FIELD_MAX: Record<keyof SeoAiDraftUnsaved, number> = {
  seoTitle: 200,
  metaDescription: 500,
  focusKeyword: 200,
  displayTitle: 300,
};

const PRODUCT_KIND_HINTS = new Set<ProductKindHint>([
  "digital_subscription",
  "physical",
  "unknown",
]);
const PRODUCT_CATEGORIES = new Set(["Subscription", "Device", "Bundle"]);
const NEW_FIELD_SET = new Set<string>(PRODUCT_AI_NEW_EDITABLE_FIELDS);
const EXISTING_FIELD_SET = new Set<string>(PRODUCT_AI_EXISTING_EDITABLE_FIELDS);
const C_CLASS_FIELDS = new Set([
  "id",
  "price",
  "stock",
  "active",
  "image",
  "og_image",
  "category",
  "badge",
  "priceGbp",
  "stockLabel",
  "imageUrl",
  "ogImageUrl",
]);
const ALLOWED_AUTHORITATIVE_KEYS = new Set([
  "productKind",
  "brand",
  "canonicalName",
  "category",
  "priceGbp",
  "stockLabel",
  "active",
  "slug",
  "productId",
  "duration",
  "variant",
  "confirmedCompatibility",
  "confirmedFeatures",
  "approvedClaims",
  "imageUrl",
  "ogImageUrl",
]);
const ALLOWED_EDITOR_COPY_KEYS = new Set([
  "name",
  "slug",
  "short_description",
  "full_description",
  "features",
  "seo_title",
  "meta_description",
  "focus_keyword",
]);

function looksLikeHtmlOrScript(value: string): boolean {
  return /<\s*\/?\s*[a-z]|javascript\s*:|on\w+\s*=/i.test(value);
}

function isPlainText(value: unknown, max: number): value is string {
  if (typeof value !== "string") return false;
  const t = value.trim();
  if (!t || t.length > max) return false;
  if (looksLikeHtmlOrScript(t)) return false;
  return true;
}

export function parseIssueId(issueId: unknown): ParsedIssueId | null {
  if (typeof issueId !== "string") return null;
  const raw = issueId.trim();
  if (!raw || raw.length > 160) return null;
  const m = ISSUE_ID_RE.exec(raw);
  if (!m) return null;
  return {
    entityType: m[1].toLowerCase() as "product" | "blog",
    entityId: m[2],
    ruleCode: m[3].toLowerCase(),
  };
}

export function parseExplainIssueRequest(
  body: unknown
):
  | { ok: true; request: SeoAiExplainRequest }
  | { ok: false; code: "invalid_request"; message: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      code: "invalid_request",
      message: "Request body must be a JSON object.",
    };
  }
  const obj = body as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (!ALLOWED_EXPLAIN_REQUEST_KEYS.has(key)) {
      return {
        ok: false,
        code: "invalid_request",
        message: "Request contains unsupported fields.",
      };
    }
  }
  const provider = obj.provider;
  const task = obj.task;
  const issueId = obj.issueId;
  if (provider !== "gemini" && provider !== "openai") {
    return {
      ok: false,
      code: "invalid_request",
      message: "provider must be gemini or openai.",
    };
  }
  if (task !== "explain_issue") {
    return {
      ok: false,
      code: "invalid_request",
      message: "task must be explain_issue.",
    };
  }
  if (typeof issueId !== "string" || !issueId.trim()) {
    return {
      ok: false,
      code: "invalid_request",
      message: "issueId is required.",
    };
  }
  if (!parseIssueId(issueId)) {
    return {
      ok: false,
      code: "invalid_request",
      message: "issueId format is invalid.",
    };
  }
  return {
    ok: true,
    request: {
      provider,
      task,
      issueId: issueId.trim(),
    },
  };
}

/**
 * Accept JSON number or canonical positive-integer string.
 * Always returns a decimal string for downstream DB/auth use.
 */
export function normalizeEntityId(value: unknown): string | null {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value <= 0) return null;
    return String(value);
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^[1-9][0-9]*$/.test(trimmed)) return null;
  const id = Number(trimmed);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  return trimmed;
}

function parseDraftUnsaved(
  value: unknown
):
  | { ok: true; unsaved: SeoAiDraftUnsaved }
  | { ok: false; code: "invalid_request"; message: string } {
  if (value === undefined) {
    return { ok: true, unsaved: {} };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      ok: false,
      code: "invalid_request",
      message: "unsaved must be an object when provided.",
    };
  }
  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (!ALLOWED_UNSAVED_KEYS.has(key)) {
      return {
        ok: false,
        code: "invalid_request",
        message: "unsaved contains unsupported fields.",
      };
    }
  }
  const unsaved: SeoAiDraftUnsaved = {};
  for (const key of ALLOWED_UNSAVED_KEYS) {
    if (!(key in obj)) continue;
    const raw = obj[key];
    if (raw === undefined || raw === null) continue;
    if (typeof raw !== "string") {
      return {
        ok: false,
        code: "invalid_request",
        message: `unsaved.${key} is invalid.`,
      };
    }
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const max = UNSAVED_FIELD_MAX[key as keyof SeoAiDraftUnsaved];
    if (trimmed.length > max || looksLikeHtmlOrScript(trimmed)) {
      return {
        ok: false,
        code: "invalid_request",
        message: `unsaved.${key} is invalid.`,
      };
    }
    unsaved[key as keyof SeoAiDraftUnsaved] = trimmed;
  }
  return { ok: true, unsaved };
}

export function parseSeoAiRequest(
  body: unknown
):
  | { ok: true; request: SeoAiExplainRequest }
  | { ok: true; request: SeoAiDraftRequest }
  | { ok: true; request: SeoAiProductFieldsRequest }
  | { ok: true; request: SeoAiProductReviewRequest }
  | { ok: false; code: "invalid_request"; message: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      code: "invalid_request",
      message: "Request body must be a JSON object.",
    };
  }
  const obj = body as Record<string, unknown>;
  const task = obj.task;
  if (task === "explain_issue") {
    for (const key of Object.keys(obj)) {
      if (!ALLOWED_EXPLAIN_REQUEST_KEYS.has(key)) {
        return {
          ok: false,
          code: "invalid_request",
          message: "Request contains unsupported fields.",
        };
      }
    }
    return parseExplainIssueRequest(body);
  }
  if (task === "draft_product_fields") {
    return parseProductFieldsRequest(body);
  }
  if (task === "review_product") {
    return parseReviewProductRequest(body);
  }
  if (task !== "draft_metadata") {
    return {
      ok: false,
      code: "invalid_request",
      message:
        "task must be explain_issue, draft_metadata, draft_product_fields, or review_product.",
    };
  }
  for (const key of Object.keys(obj)) {
    if (!ALLOWED_DRAFT_REQUEST_KEYS.has(key)) {
      return {
        ok: false,
        code: "invalid_request",
        message: "Request contains unsupported fields.",
      };
    }
  }
  const provider = obj.provider;
  if (provider !== "gemini" && provider !== "openai") {
    return {
      ok: false,
      code: "invalid_request",
      message: "provider must be gemini or openai.",
    };
  }
  const entityType = obj.entityType;
  if (entityType !== "product" && entityType !== "blog") {
    return {
      ok: false,
      code: "invalid_request",
      message: "entityType must be product or blog.",
    };
  }
  const entityId = normalizeEntityId(obj.entityId);
  if (!entityId) {
    return {
      ok: false,
      code: "invalid_request",
      message: "entityId is invalid.",
    };
  }
  const unsavedParsed = parseDraftUnsaved(obj.unsaved);
  if (!unsavedParsed.ok) return unsavedParsed;
  return {
    ok: true,
    request: {
      provider,
      task: "draft_metadata",
      entityType,
      entityId,
      ...(Object.keys(unsavedParsed.unsaved).length
        ? { unsaved: unsavedParsed.unsaved }
        : {}),
    },
  };
}

export function validateSeoAiExplanation(
  value: unknown
):
  | { ok: true; explanation: SeoAiExplanation }
  | { ok: false; code: "malformed_provider_output"; message: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      ok: false,
      code: "malformed_provider_output",
      message: "Provider returned an unexpected explanation shape.",
    };
  }
  const obj = value as Record<string, unknown>;
  const allowed = new Set([
    "summary",
    "why_it_matters",
    "recommended_action",
    "cautions",
  ]);
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) {
      return {
        ok: false,
        code: "malformed_provider_output",
        message: "Provider returned an unexpected explanation shape.",
      };
    }
  }
  if (!isPlainText(obj.summary, 500)) {
    return {
      ok: false,
      code: "malformed_provider_output",
      message: "Provider returned an unexpected explanation shape.",
    };
  }
  if (!isPlainText(obj.why_it_matters, 700)) {
    return {
      ok: false,
      code: "malformed_provider_output",
      message: "Provider returned an unexpected explanation shape.",
    };
  }
  if (!isPlainText(obj.recommended_action, 700)) {
    return {
      ok: false,
      code: "malformed_provider_output",
      message: "Provider returned an unexpected explanation shape.",
    };
  }
  if (!Array.isArray(obj.cautions) || obj.cautions.length > 3) {
    return {
      ok: false,
      code: "malformed_provider_output",
      message: "Provider returned an unexpected explanation shape.",
    };
  }
  const cautions: string[] = [];
  for (const c of obj.cautions) {
    if (!isPlainText(c, 300)) {
      return {
        ok: false,
        code: "malformed_provider_output",
        message: "Provider returned an unexpected explanation shape.",
      };
    }
    cautions.push(c.trim());
  }
  return {
    ok: true,
    explanation: {
      summary: obj.summary.trim(),
      why_it_matters: obj.why_it_matters.trim(),
      recommended_action: obj.recommended_action.trim(),
      cautions,
    },
  };
}

export function parseExplanationJsonText(
  text: string
):
  | { ok: true; explanation: SeoAiExplanation }
  | { ok: false; code: "malformed_provider_output"; message: string } {
  const raw = String(text || "").trim();
  if (!raw) {
    return {
      ok: false,
      code: "malformed_provider_output",
      message: "Provider returned an unexpected explanation shape.",
    };
  }
  try {
    return validateSeoAiExplanation(JSON.parse(raw));
  } catch {
    return {
      ok: false,
      code: "malformed_provider_output",
      message: "Provider returned an unexpected explanation shape.",
    };
  }
}

export function buildSeoAiSystemInstruction(): string {
  return [
    "Explain ONE VERIFIED Firestick4UK deterministic SEO finding.",
    "The deterministic diagnostic rule is the source of truth — do not question whether the issue exists.",
    "Explain clearly and practically for a CMS editor.",
    "Recommend a human-controlled correction only.",
    "Do not claim Google ranking or index status.",
    "Do not invent GSC evidence, traffic, search volume, ratings, reviews, prices, subscribers, channel counts, guarantees, free trials, device support, or other business claims.",
    "Do not say the issue is fixed or resolved.",
    "Do not perform or claim CMS changes or publishing.",
    "Do not recommend URL migration unless the deterministic evidence explicitly concerns URL or canonical safety.",
    "Return only the required normalized structured JSON fields.",
    "No persona or roleplay. Stay strictly within this SEO finding.",
  ].join(" ");
}

export function buildVerifiedIssueContext(input: {
  issue: {
    id: string;
    severity: string;
    category: string;
    entityType: "product" | "blog";
    entityId: string | number;
    label: string;
    url: string | null;
    field: string | null;
    message: string;
    evidence: string;
  };
  entityFacts?: SeoAiVerifiedIssueContext["entityFacts"];
}): SeoAiVerifiedIssueContext {
  return {
    id: String(input.issue.id),
    severity: String(input.issue.severity),
    category: String(input.issue.category),
    entityType: input.issue.entityType,
    entityId: String(input.issue.entityId),
    label: String(input.issue.label || ""),
    url: input.issue.url ?? null,
    field: input.issue.field ?? null,
    message: String(input.issue.message || ""),
    evidence: String(input.issue.evidence || ""),
    ...(input.entityFacts ? { entityFacts: input.entityFacts } : {}),
  };
}

export function buildSeoAiUserPrompt(context: SeoAiVerifiedIssueContext): string {
  return [
    "Verified deterministic SEO issue (compact JSON):",
    JSON.stringify(context),
    "Explain this single finding using the required structured output.",
  ].join("\n");
}

export function contextContainsRawHtml(
  context: SeoAiVerifiedIssueContext
): boolean {
  const blob = JSON.stringify(context);
  return /<\s*(?:img|p|div|span|script|style|a|h[1-6]|ul|ol|li|table|br|strong|em)\b/i.test(
    blob
  );
}

function dedupeTrimmedStrings(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function filterMetadataStrings(
  items: unknown[],
  maxLen: number
): string[] | null {
  if (!Array.isArray(items)) return null;
  const kept: string[] = [];
  for (const item of items) {
    if (typeof item !== "string") return null;
    const trimmed = item.trim();
    if (!trimmed || looksLikeHtmlOrScript(trimmed)) continue;
    if (trimmed.length > maxLen) continue;
    kept.push(trimmed);
  }
  return dedupeTrimmedStrings(kept);
}

export function validateSeoAiMetadataDraft(
  value: unknown,
  entityType: "product" | "blog"
):
  | { ok: true; draft: SeoAiMetadataDraft }
  | { ok: false; code: "malformed_provider_output"; message: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      ok: false,
      code: "malformed_provider_output",
      message: "The AI provider returned unusable suggestions.",
    };
  }
  const obj = value as Record<string, unknown>;
  const allowed = new Set(["titles", "meta_descriptions"]);
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) {
      return {
        ok: false,
        code: "malformed_provider_output",
        message: "The AI provider returned unusable suggestions.",
      };
    }
  }
  const titleMax =
    entityType === "product" ? PRODUCT_TITLE_MAX : BLOG_TITLE_MAX;
  const titlesFiltered = filterMetadataStrings(
    obj.titles as unknown[],
    titleMax
  );
  const descriptionsFiltered = filterMetadataStrings(
    obj.meta_descriptions as unknown[],
    META_DESC_MAX
  );
  if (titlesFiltered === null || descriptionsFiltered === null) {
    return {
      ok: false,
      code: "malformed_provider_output",
      message: "The AI provider returned unusable suggestions.",
    };
  }
  const titles = titlesFiltered.slice(0, 3);
  const meta_descriptions = descriptionsFiltered.slice(0, 3);
  if (titles.length < 1 || meta_descriptions.length < 1) {
    return {
      ok: false,
      code: "malformed_provider_output",
      message: "The AI provider returned unusable suggestions.",
    };
  }
  return { ok: true, draft: { titles, meta_descriptions } };
}

export function parseMetadataJsonText(
  text: string,
  entityType: "product" | "blog"
):
  | { ok: true; draft: SeoAiMetadataDraft }
  | { ok: false; code: "malformed_provider_output"; message: string } {
  const raw = String(text || "").trim();
  if (!raw) {
    return {
      ok: false,
      code: "malformed_provider_output",
      message: "The AI provider returned unusable suggestions.",
    };
  }
  try {
    return validateSeoAiMetadataDraft(JSON.parse(raw), entityType);
  } catch {
    return {
      ok: false,
      code: "malformed_provider_output",
      message: "The AI provider returned unusable suggestions.",
    };
  }
}

export function htmlToPlainTextBounded(html: unknown, max = 600): string {
  const raw = String(html ?? "");
  const plain = raw
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= max) return plain;
  return plain.slice(0, max);
}

export function buildSeoAiMetadataSystemInstruction(): string {
  return [
    "Draft SEO title and meta description suggestions for ONE Firestick4UK CMS entity.",
    "Use the authoritative saved fields and any unsaved editor overrides as context only.",
    "Return 1 to 3 distinct title options and 1 to 3 distinct meta description options.",
    `Product SEO titles must be at most ${PRODUCT_TITLE_MAX} characters; blog SEO titles at most ${BLOG_TITLE_MAX}.`,
    `Meta descriptions must be at most ${META_DESC_MAX} characters.`,
    "Plain text only — no HTML, markdown, or scripts.",
    "Do not claim Google ranking, index status, traffic, or search volume.",
    "Do not invent prices, guarantees, device support, or other business claims.",
    "Do not perform or claim CMS changes or publishing.",
    "Return only the required normalized structured JSON fields.",
    "No persona or roleplay.",
  ].join(" ");
}

export function buildSeoAiMetadataUserPrompt(
  context: SeoAiMetadataDraftContext
): string {
  return [
    "CMS metadata draft context (compact JSON):",
    JSON.stringify(context),
    "Draft title and meta description suggestions using the required structured output.",
  ].join("\n");
}

export function draftContextContainsRawHtml(
  context: SeoAiMetadataDraftContext
): boolean {
  const blob = JSON.stringify(context);
  return /<\s*(?:img|p|div|span|script|style|a|h[1-6]|ul|ol|li|table|br|strong|em)\b/i.test(
    blob
  );
}

// ---------------------------------------------------------------------------
// PAI-2 — draft_product_fields
// ---------------------------------------------------------------------------

export function defaultProductKindFromCategory(
  category: unknown
): ProductKindHint {
  const c = String(category || "").trim();
  if (c === "Subscription") return "digital_subscription";
  if (c === "Device") return "physical";
  return "unknown";
}

export function productAiWhitelistFor(
  productId: number | null
): readonly ProductAiEditableField[] {
  return productId == null
    ? PRODUCT_AI_NEW_EDITABLE_FIELDS
    : PRODUCT_AI_EXISTING_EDITABLE_FIELDS;
}

export function normalizeProductAiSlug(value: string): string | null {
  const raw = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (!raw) return null;
  if (raw.includes("/") || raw.includes("\\") || raw.includes("..")) return null;
  if (raw.length > PRODUCT_AI_FIELD_MAX.slug) return null;
  return raw;
}

function optionalPlainText(
  value: unknown,
  max: number
):
  | { ok: true; value?: string }
  | { ok: false; message: string } {
  if (value === undefined || value === null) return { ok: true };
  if (typeof value !== "string") {
    return { ok: false, message: "must be a string." };
  }
  const trimmed = value.trim();
  if (!trimmed) return { ok: true };
  if (trimmed.length > max || looksLikeHtmlOrScript(trimmed)) {
    return { ok: false, message: "is invalid." };
  }
  return { ok: true, value: trimmed };
}

function parseStringList(
  value: unknown,
  label: string
):
  | { ok: true; value?: string[] }
  | { ok: false; message: string } {
  if (value === undefined || value === null) return { ok: true };
  if (!Array.isArray(value)) {
    return { ok: false, message: `${label} must be an array.` };
  }
  if (value.length > PRODUCT_AI_CLAIM_LIST_MAX) {
    return { ok: false, message: `${label} is too long.` };
  }
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") {
      return { ok: false, message: `${label} items must be strings.` };
    }
    const trimmed = item.trim();
    if (!trimmed) continue;
    if (
      trimmed.length > PRODUCT_AI_CLAIM_ITEM_MAX ||
      looksLikeHtmlOrScript(trimmed)
    ) {
      return { ok: false, message: `${label} contains an invalid item.` };
    }
    out.push(trimmed);
  }
  return { ok: true, value: out.length ? out : undefined };
}

function parseOptionalUrl(
  value: unknown,
  label: string
):
  | { ok: true; value?: string | null }
  | { ok: false; message: string } {
  if (value === undefined) return { ok: true };
  if (value === null) return { ok: true, value: null };
  if (typeof value !== "string") {
    return { ok: false, message: `${label} must be a string or null.` };
  }
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, value: null };
  if (trimmed.length > 500 || looksLikeHtmlOrScript(trimmed)) {
    return { ok: false, message: `${label} is invalid.` };
  }
  return { ok: true, value: trimmed };
}

export function parseProductAiAuthoritative(
  value: unknown,
  productId: number | null
):
  | { ok: true; authoritative: ProductAiAuthoritative }
  | { ok: false; code: "invalid_request"; message: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      ok: false,
      code: "invalid_request",
      message: "authoritative must be an object.",
    };
  }
  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (!ALLOWED_AUTHORITATIVE_KEYS.has(key)) {
      return {
        ok: false,
        code: "invalid_request",
        message: "authoritative contains unsupported fields.",
      };
    }
  }

  const productKind = obj.productKind;
  if (
    typeof productKind !== "string" ||
    !PRODUCT_KIND_HINTS.has(productKind as ProductKindHint)
  ) {
    return {
      ok: false,
      code: "invalid_request",
      message: "authoritative.productKind is invalid.",
    };
  }

  const nameParsed = optionalPlainText(
    obj.canonicalName,
    PRODUCT_AI_CANONICAL_NAME_MAX
  );
  if (!nameParsed.ok) {
    return {
      ok: false,
      code: "invalid_request",
      message: `authoritative.canonicalName ${nameParsed.message}`,
    };
  }
  if (!nameParsed.value) {
    return {
      ok: false,
      code: "invalid_request",
      message: "authoritative.canonicalName is required.",
    };
  }

  const authoritative: ProductAiAuthoritative = {
    productKind: productKind as ProductKindHint,
    canonicalName: nameParsed.value,
  };

  const brand = optionalPlainText(obj.brand, PRODUCT_AI_BRAND_MAX);
  if (!brand.ok) {
    return {
      ok: false,
      code: "invalid_request",
      message: `authoritative.brand ${brand.message}`,
    };
  }
  if (brand.value) authoritative.brand = brand.value;

  if (obj.category !== undefined && obj.category !== null) {
    const cat = String(obj.category).trim();
    if (!PRODUCT_CATEGORIES.has(cat)) {
      return {
        ok: false,
        code: "invalid_request",
        message: "authoritative.category is invalid.",
      };
    }
    authoritative.category = cat as ProductAiAuthoritative["category"];
  }

  if (obj.priceGbp !== undefined && obj.priceGbp !== null) {
    if (typeof obj.priceGbp !== "number" || !Number.isFinite(obj.priceGbp) || obj.priceGbp < 0) {
      return {
        ok: false,
        code: "invalid_request",
        message: "authoritative.priceGbp is invalid.",
      };
    }
    authoritative.priceGbp = obj.priceGbp;
  }

  const stock = optionalPlainText(obj.stockLabel, 120);
  if (!stock.ok) {
    return {
      ok: false,
      code: "invalid_request",
      message: `authoritative.stockLabel ${stock.message}`,
    };
  }
  if (stock.value) authoritative.stockLabel = stock.value;

  if (obj.active !== undefined && obj.active !== null) {
    if (typeof obj.active !== "boolean") {
      return {
        ok: false,
        code: "invalid_request",
        message: "authoritative.active must be a boolean.",
      };
    }
    authoritative.active = obj.active;
  }

  if (obj.slug !== undefined) {
    if (obj.slug === null) {
      authoritative.slug = null;
    } else if (typeof obj.slug === "string") {
      const trimmed = obj.slug.trim();
      if (!trimmed) {
        authoritative.slug = null;
      } else {
        const normalized = normalizeProductAiSlug(trimmed);
        if (!normalized) {
          return {
            ok: false,
            code: "invalid_request",
            message: "authoritative.slug is invalid.",
          };
        }
        authoritative.slug = normalized;
      }
    } else {
      return {
        ok: false,
        code: "invalid_request",
        message: "authoritative.slug is invalid.",
      };
    }
  }

  if (obj.productId !== undefined && obj.productId !== null) {
    if (
      typeof obj.productId !== "number" ||
      !Number.isSafeInteger(obj.productId) ||
      obj.productId <= 0
    ) {
      return {
        ok: false,
        code: "invalid_request",
        message: "authoritative.productId is invalid.",
      };
    }
    if (productId != null && obj.productId !== productId) {
      return {
        ok: false,
        code: "invalid_request",
        message: "authoritative.productId must match productId.",
      };
    }
    authoritative.productId = obj.productId;
  } else if (productId != null) {
    authoritative.productId = productId;
  } else {
    authoritative.productId = null;
  }

  for (const key of ["duration", "variant"] as const) {
    const parsed = optionalPlainText(obj[key], 120);
    if (!parsed.ok) {
      return {
        ok: false,
        code: "invalid_request",
        message: `authoritative.${key} ${parsed.message}`,
      };
    }
    if (parsed.value) authoritative[key] = parsed.value;
  }

  for (const key of [
    "confirmedCompatibility",
    "confirmedFeatures",
    "approvedClaims",
  ] as const) {
    const list = parseStringList(obj[key], `authoritative.${key}`);
    if (!list.ok) {
      return { ok: false, code: "invalid_request", message: list.message };
    }
    if (list.value) authoritative[key] = list.value;
  }

  const imageUrl = parseOptionalUrl(obj.imageUrl, "authoritative.imageUrl");
  if (!imageUrl.ok) {
    return { ok: false, code: "invalid_request", message: imageUrl.message };
  }
  if (imageUrl.value !== undefined) authoritative.imageUrl = imageUrl.value;

  const ogImageUrl = parseOptionalUrl(obj.ogImageUrl, "authoritative.ogImageUrl");
  if (!ogImageUrl.ok) {
    return { ok: false, code: "invalid_request", message: ogImageUrl.message };
  }
  if (ogImageUrl.value !== undefined) authoritative.ogImageUrl = ogImageUrl.value;

  return { ok: true, authoritative };
}

export function parseProductAiEditorCopy(
  value: unknown
):
  | { ok: true; currentEditorCopy: ProductAiEditorCopy }
  | { ok: false; code: "invalid_request"; message: string } {
  if (value === undefined || value === null) {
    return { ok: true, currentEditorCopy: {} };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      ok: false,
      code: "invalid_request",
      message: "currentEditorCopy must be an object.",
    };
  }
  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (!ALLOWED_EDITOR_COPY_KEYS.has(key)) {
      return {
        ok: false,
        code: "invalid_request",
        message: "currentEditorCopy contains unsupported fields.",
      };
    }
  }
  const copy: ProductAiEditorCopy = {};
  for (const field of ALLOWED_EDITOR_COPY_KEYS) {
    if (!(field in obj)) continue;
    const max =
      PRODUCT_AI_FIELD_MAX[field as ProductAiNewEditableField] ?? 600;
    const parsed = optionalPlainText(obj[field], max);
    if (!parsed.ok) {
      return {
        ok: false,
        code: "invalid_request",
        message: `currentEditorCopy.${field} ${parsed.message}`,
      };
    }
    if (parsed.value) {
      (copy as Record<string, string>)[field] = parsed.value;
    }
  }
  return { ok: true, currentEditorCopy: copy };
}

export function parseProductFieldsRequest(
  body: unknown
):
  | { ok: true; request: SeoAiProductFieldsRequest }
  | { ok: false; code: "invalid_request"; message: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      code: "invalid_request",
      message: "Request body must be a JSON object.",
    };
  }
  const obj = body as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (!ALLOWED_PRODUCT_FIELDS_REQUEST_KEYS.has(key)) {
      return {
        ok: false,
        code: "invalid_request",
        message: "Request contains unsupported fields.",
      };
    }
  }

  const provider = obj.provider;
  if (provider !== "gemini" && provider !== "openai") {
    return {
      ok: false,
      code: "invalid_request",
      message: "provider must be gemini or openai.",
    };
  }
  if (obj.task !== "draft_product_fields") {
    return {
      ok: false,
      code: "invalid_request",
      message: "task must be draft_product_fields.",
    };
  }

  let productId: number | null = null;
  if (obj.productId === null || obj.productId === undefined) {
    productId = null;
  } else if (typeof obj.productId === "number") {
    if (!Number.isSafeInteger(obj.productId) || obj.productId <= 0) {
      return {
        ok: false,
        code: "invalid_request",
        message: "productId is invalid.",
      };
    }
    productId = obj.productId;
  } else if (typeof obj.productId === "string") {
    const normalized = normalizeEntityId(obj.productId);
    if (!normalized) {
      return {
        ok: false,
        code: "invalid_request",
        message: "productId is invalid.",
      };
    }
    productId = Number(normalized);
  } else {
    return {
      ok: false,
      code: "invalid_request",
      message: "productId is invalid.",
    };
  }

  const productKind = obj.productKind;
  if (
    typeof productKind !== "string" ||
    !PRODUCT_KIND_HINTS.has(productKind as ProductKindHint)
  ) {
    return {
      ok: false,
      code: "invalid_request",
      message: "productKind is invalid.",
    };
  }

  if (!Array.isArray(obj.requestedFields) || obj.requestedFields.length < 1) {
    return {
      ok: false,
      code: "invalid_request",
      message: "requestedFields must be a non-empty array.",
    };
  }
  if (obj.requestedFields.length > PRODUCT_AI_NEW_EDITABLE_FIELDS.length) {
    return {
      ok: false,
      code: "invalid_request",
      message: "requestedFields is too long.",
    };
  }

  const whitelist = new Set(productAiWhitelistFor(productId));
  const seen = new Set<string>();
  const requestedFields: ProductAiEditableField[] = [];
  for (const field of obj.requestedFields) {
    if (typeof field !== "string") {
      return {
        ok: false,
        code: "invalid_request",
        message: "requestedFields contains an invalid field.",
      };
    }
    if (C_CLASS_FIELDS.has(field) || field === "badge") {
      return {
        ok: false,
        code: "invalid_request",
        message: `Field '${field}' is not allowed for AI drafting.`,
      };
    }
    if (seen.has(field)) {
      return {
        ok: false,
        code: "invalid_request",
        message: "requestedFields must not contain duplicates.",
      };
    }
    seen.add(field);
    if (!NEW_FIELD_SET.has(field) && !EXISTING_FIELD_SET.has(field)) {
      return {
        ok: false,
        code: "invalid_request",
        message: `Field '${field}' is not supported.`,
      };
    }
    if (!whitelist.has(field as ProductAiEditableField)) {
      return {
        ok: false,
        code: "invalid_request",
        message:
          productId == null
            ? `Field '${field}' is not allowed for new products.`
            : `Field '${field}' is not allowed for existing product drafting.`,
      };
    }
    requestedFields.push(field as ProductAiEditableField);
  }

  const authParsed = parseProductAiAuthoritative(obj.authoritative, productId);
  if (!authParsed.ok) return authParsed;
  if (authParsed.authoritative.productKind !== productKind) {
    return {
      ok: false,
      code: "invalid_request",
      message: "authoritative.productKind must match productKind.",
    };
  }

  const copyParsed = parseProductAiEditorCopy(obj.currentEditorCopy);
  if (!copyParsed.ok) return copyParsed;

  return {
    ok: true,
    request: {
      provider,
      task: "draft_product_fields",
      productId,
      productKind: productKind as ProductKindHint,
      requestedFields,
      authoritative: authParsed.authoritative,
      currentEditorCopy: copyParsed.currentEditorCopy,
    },
  };
}

function productKindGuardText(kind: ProductKindHint): string {
  if (kind === "digital_subscription") {
    return [
      "Product kind is digital_subscription.",
      "Do not invent channel counts, uptime, trials, device compatibility, activation guarantees, duration, or service guarantees unless explicitly supplied in authoritative facts.",
    ].join(" ");
  }
  if (kind === "physical") {
    return [
      "Product kind is physical.",
      "Do not invent dimensions, weight, material, shipping times, warranty, accessories, or stock quantity/specifications unless explicitly supplied in authoritative facts.",
    ].join(" ");
  }
  return [
    "Product kind is unknown.",
    "Be conservative. Draft only generic copy grounded in explicitly supplied authoritative facts.",
  ].join(" ");
}

export function buildProductFieldsSystemInstruction(
  context: ProductAiDraftContext
): string {
  const maxLines = context.requestedFields.map(
    (f) => `${f}<=${PRODUCT_AI_FIELD_MAX[f as ProductAiNewEditableField]}`
  );
  return [
    "You are the Firestick4UK CMS product content assistant.",
    "Supplied authoritative facts are the only source of business truth.",
    "Do not invent missing business facts.",
    "Do not rewrite price, stock, active, category, image URL, or OG image URL.",
    "Return only the requested fields.",
    "Plain text only — no HTML, markdown fences, or scripts.",
    "Do not claim Google ranking, indexing, traffic, or search volume.",
    "Do not fabricate ratings, reviews, or search volume.",
    "Do not claim auto-save or publish.",
    productKindGuardText(context.productKind),
    `Character limits: ${maxLines.join(", ")}.`,
    "If a requested field cannot be drafted safely from supplied facts, mark it unavailable with a short reason instead of inventing content.",
    "Return only the required normalized structured JSON.",
    "No persona or roleplay.",
  ].join(" ");
}

export function buildProductFieldsUserPrompt(
  context: ProductAiDraftContext
): string {
  return [
    "Product AI drafting context (compact JSON):",
    JSON.stringify({
      productId: context.productId,
      productKind: context.productKind,
      requestedFields: context.requestedFields,
      authoritative: context.authoritative,
      currentEditorCopy: context.currentEditorCopy,
    }),
    "Draft suggestions only for requestedFields using the required structured output.",
  ].join("\n");
}

export function buildProductFieldsJsonSchema(
  requestedFields: ProductAiEditableField[]
): Record<string, unknown> {
  const suggestionSchema = {
    type: "object",
    additionalProperties: false,
    required: ["unavailable", "value", "reason"],
    properties: {
      unavailable: { type: "boolean" },
      value: { type: "string" },
      reason: { type: "string" },
    },
  };
  const properties: Record<string, unknown> = {};
  for (const field of requestedFields) {
    properties[field] = suggestionSchema;
  }
  return {
    type: "object",
    additionalProperties: false,
    required: ["suggestions"],
    properties: {
      suggestions: {
        type: "object",
        additionalProperties: false,
        required: requestedFields,
        properties,
      },
    },
  };
}

function validateOneProductSuggestion(
  field: ProductAiEditableField,
  raw: unknown
):
  | { ok: true; suggestion?: ProductAiFieldSuggestion }
  | { ok: false; code: "malformed_provider_output"; message: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      ok: false,
      code: "malformed_provider_output",
      message: "The AI provider returned unusable product suggestions.",
    };
  }
  const obj = raw as Record<string, unknown>;
  const allowed = new Set(["unavailable", "value", "reason"]);
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) {
      return {
        ok: false,
        code: "malformed_provider_output",
        message: "The AI provider returned unusable product suggestions.",
      };
    }
  }
  if (typeof obj.unavailable !== "boolean") {
    return {
      ok: false,
      code: "malformed_provider_output",
      message: "The AI provider returned unusable product suggestions.",
    };
  }
  if (typeof obj.value !== "string" || typeof obj.reason !== "string") {
    return {
      ok: false,
      code: "malformed_provider_output",
      message: "The AI provider returned unusable product suggestions.",
    };
  }
  const reason = obj.reason.trim();
  if (reason.length > PRODUCT_AI_REASON_MAX || looksLikeHtmlOrScript(reason)) {
    return {
      ok: false,
      code: "malformed_provider_output",
      message: "The AI provider returned unusable product suggestions.",
    };
  }
  if (obj.unavailable) {
    if (!reason) {
      return {
        ok: false,
        code: "malformed_provider_output",
        message: "The AI provider returned unusable product suggestions.",
      };
    }
    return { ok: true };
  }

  let value = obj.value.trim();
  if (!value || looksLikeHtmlOrScript(value)) {
    return {
      ok: false,
      code: "malformed_provider_output",
      message: "The AI provider returned unusable product suggestions.",
    };
  }
  if (field === "slug") {
    const normalized = normalizeProductAiSlug(value);
    if (!normalized) {
      return {
        ok: false,
        code: "malformed_provider_output",
        message: "The AI provider returned unusable product suggestions.",
      };
    }
    value = normalized;
  }
  const max = PRODUCT_AI_FIELD_MAX[field as ProductAiNewEditableField];
  if (value.length > max) {
    return {
      ok: false,
      code: "malformed_provider_output",
      message: "The AI provider returned unusable product suggestions.",
    };
  }
  const suggestion: ProductAiFieldSuggestion = { value };
  if (reason) suggestion.reason = reason;
  return { ok: true, suggestion };
}

export function validateProductFieldsDraft(
  value: unknown,
  requestedFields: ProductAiEditableField[]
):
  | { ok: true; suggestions: ProductAiSuggestions }
  | { ok: false; code: "malformed_provider_output"; message: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      ok: false,
      code: "malformed_provider_output",
      message: "The AI provider returned unusable product suggestions.",
    };
  }
  const root = value as Record<string, unknown>;
  if (Object.keys(root).some((k) => k !== "suggestions")) {
    return {
      ok: false,
      code: "malformed_provider_output",
      message: "The AI provider returned unusable product suggestions.",
    };
  }
  if (!root.suggestions || typeof root.suggestions !== "object" || Array.isArray(root.suggestions)) {
    return {
      ok: false,
      code: "malformed_provider_output",
      message: "The AI provider returned unusable product suggestions.",
    };
  }
  const suggestionsObj = root.suggestions as Record<string, unknown>;
  const requested = new Set(requestedFields);
  for (const key of Object.keys(suggestionsObj)) {
    if (!requested.has(key as ProductAiEditableField)) {
      return {
        ok: false,
        code: "malformed_provider_output",
        message: "The AI provider returned unusable product suggestions.",
      };
    }
  }
  for (const field of requestedFields) {
    if (!(field in suggestionsObj)) {
      return {
        ok: false,
        code: "malformed_provider_output",
        message: "The AI provider returned unusable product suggestions.",
      };
    }
  }

  const suggestions: ProductAiSuggestions = {};
  for (const field of requestedFields) {
    const one = validateOneProductSuggestion(field, suggestionsObj[field]);
    if (!one.ok) return one;
    if (one.suggestion) suggestions[field] = one.suggestion;
  }
  return { ok: true, suggestions };
}

export function parseProductFieldsJsonText(
  text: string,
  requestedFields: ProductAiEditableField[]
):
  | { ok: true; suggestions: ProductAiSuggestions }
  | { ok: false; code: "malformed_provider_output"; message: string } {
  const raw = String(text || "").trim();
  if (!raw) {
    return {
      ok: false,
      code: "malformed_provider_output",
      message: "The AI provider returned unusable product suggestions.",
    };
  }
  try {
    return validateProductFieldsDraft(JSON.parse(raw), requestedFields);
  } catch {
    return {
      ok: false,
      code: "malformed_provider_output",
      message: "The AI provider returned unusable product suggestions.",
    };
  }
}

/**
 * Merge DB truth over client authoritative for C-class / identity fields.
 * Text drafting context still comes from currentEditorCopy.
 */
export function mergeProductAuthoritativeWithDb(
  client: ProductAiAuthoritative,
  row: {
    id: number | string;
    name?: string | null;
    slug?: string | null;
    category?: string | null;
    price?: number | string | null;
    stock?: string | null;
    active?: number | boolean | null;
    image?: string | null;
    og_image?: string | null;
  }
): ProductAiAuthoritative {
  const priceNum = Number(row.price);
  return {
    ...client,
    productId: Number(row.id),
    canonicalName: String(row.name || client.canonicalName).trim() || client.canonicalName,
    slug: String(row.slug || "").trim() || null,
    category: (String(row.category || "").trim() ||
      client.category) as ProductAiAuthoritative["category"],
    priceGbp: Number.isFinite(priceNum) ? priceNum : client.priceGbp,
    stockLabel: String(row.stock || "").trim() || client.stockLabel,
    active:
      row.active === true || row.active === 1
        ? true
        : row.active === false || row.active === 0
          ? false
          : client.active,
    imageUrl: String(row.image || "").trim() || null,
    ogImageUrl: String(row.og_image || "").trim() || null,
    productKind: client.productKind,
    brand: client.brand || "Firestick4UK",
  };
}

function parseReviewEditorCopy(
  value: unknown
):
  | { ok: true; currentEditorCopy: ProductAiReviewEditorCopy }
  | { ok: false; code: "invalid_request"; message: string } {
  if (value === undefined || value === null) {
    return { ok: true, currentEditorCopy: {} };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      ok: false,
      code: "invalid_request",
      message: "currentEditorCopy must be an object.",
    };
  }
  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (!ALLOWED_REVIEW_EDITOR_COPY_KEYS.has(key)) {
      return {
        ok: false,
        code: "invalid_request",
        message: "currentEditorCopy contains unsupported fields.",
      };
    }
  }
  const copy: ProductAiReviewEditorCopy = {};
  for (const field of PRODUCT_AI_EXISTING_EDITABLE_FIELDS) {
    if (!(field in obj)) continue;
    const max =
      PRODUCT_AI_FIELD_MAX[field as ProductAiNewEditableField] ?? 600;
    const parsed = optionalPlainText(obj[field], max);
    if (!parsed.ok) {
      return {
        ok: false,
        code: "invalid_request",
        message: `currentEditorCopy.${field} ${parsed.message}`,
      };
    }
    if (parsed.value) {
      (copy as Record<string, string>)[field] = parsed.value;
    }
  }
  return { ok: true, currentEditorCopy: copy };
}

export function parseReviewProductRequest(
  body: unknown
):
  | { ok: true; request: SeoAiProductReviewRequest }
  | { ok: false; code: "invalid_request"; message: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      code: "invalid_request",
      message: "Request body must be a JSON object.",
    };
  }
  const obj = body as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (!ALLOWED_PRODUCT_REVIEW_REQUEST_KEYS.has(key)) {
      return {
        ok: false,
        code: "invalid_request",
        message: "Request contains unsupported fields.",
      };
    }
  }

  const provider = obj.provider;
  if (provider !== "gemini" && provider !== "openai") {
    return {
      ok: false,
      code: "invalid_request",
      message: "provider must be gemini or openai.",
    };
  }
  if (obj.task !== "review_product") {
    return {
      ok: false,
      code: "invalid_request",
      message: "task must be review_product.",
    };
  }

  let productId: number | null = null;
  if (typeof obj.productId === "number") {
    if (!Number.isSafeInteger(obj.productId) || obj.productId <= 0) {
      return {
        ok: false,
        code: "invalid_request",
        message: "productId is invalid.",
      };
    }
    productId = obj.productId;
  } else if (typeof obj.productId === "string") {
    const normalized = normalizeEntityId(obj.productId);
    if (!normalized) {
      return {
        ok: false,
        code: "invalid_request",
        message: "productId is invalid.",
      };
    }
    productId = Number(normalized);
  } else {
    return {
      ok: false,
      code: "invalid_request",
      message: "productId is required.",
    };
  }

  let productKind: ProductKindHint | undefined;
  if (obj.productKind !== undefined) {
    if (
      typeof obj.productKind !== "string" ||
      !PRODUCT_KIND_HINTS.has(obj.productKind as ProductKindHint)
    ) {
      return {
        ok: false,
        code: "invalid_request",
        message: "productKind is invalid.",
      };
    }
    productKind = obj.productKind as ProductKindHint;
  }

  const copyParsed = parseReviewEditorCopy(obj.currentEditorCopy);
  if (!copyParsed.ok) return copyParsed;

  return {
    ok: true,
    request: {
      provider,
      task: "review_product",
      productId,
      ...(productKind ? { productKind } : {}),
      currentEditorCopy: copyParsed.currentEditorCopy,
    },
  };
}

export function buildReviewProductSystemInstruction(
  context: ProductAiReviewContext
): string {
  return [
    "You are the Firestick4UK CMS existing-product copy reviewer.",
    "You advise on wording and SEO copy only. You are NOT the SEO health authority.",
    "Deterministic CMS diagnostics remain authoritative for SEO health.",
    "Supplied dbTruth is the only source of protected business identity facts.",
    "Do not propose or generate a replacement public slug.",
    "Do not suggest changes to price, category, stock, active, image, og_image, badge, or id.",
    "name is identity-sensitive: you may suggest/flag wording, but treat rename as cautionary.",
    "If a field is already good, set suggested to null and status to ok.",
    "Do not force changes merely to produce output.",
    "Plain text only — no HTML, markdown fences, or scripts.",
    "Do not claim Google ranking, indexing, GSC status, traffic, or search volume.",
    "Do not fabricate ratings, reviews, channel counts, trials, discounts, offers, uptime, guarantees,",
    "unsupported device compatibility, or unsupported service claims.",
    "Do not invent missing business facts.",
    productKindGuardText(context.productKind),
    `Review these fields only: ${PRODUCT_AI_REVIEW_FIELDS.join(", ")}.`,
    `Reason max ${PRODUCT_AI_REASON_MAX} characters.`,
    "status must be ok, suggest, or warning.",
    "confidence must be high, medium, or low.",
    "Return only the required normalized structured JSON.",
    "No persona or roleplay.",
  ].join(" ");
}

export function buildReviewProductUserPrompt(
  context: ProductAiReviewContext
): string {
  return [
    "Existing product AI review context (compact JSON):",
    JSON.stringify({
      productId: context.productId,
      productKind: context.productKind,
      reviewFields: PRODUCT_AI_REVIEW_FIELDS,
      dbTruth: {
        id: context.dbTruth.id,
        name: context.dbTruth.name,
        slug: context.dbTruth.slug,
        category: context.dbTruth.category,
        priceGbp: context.dbTruth.priceGbp,
        stockLabel: context.dbTruth.stockLabel,
        active: context.dbTruth.active,
        // URLs omitted from prompt body size; presence flags only
        hasImage: Boolean(context.dbTruth.imageUrl),
        hasOgImage: Boolean(context.dbTruth.ogImageUrl),
      },
      reviewCopy: context.reviewCopy,
    }),
    "Return one review entry per reviewFields item. Do not invent a slug suggestion.",
  ].join("\n");
}

export function buildReviewProductJsonSchema(): Record<string, unknown> {
  const itemSchema = {
    type: "object",
    additionalProperties: false,
    required: [
      "field",
      "current",
      "suggested",
      "reason",
      "status",
      "confidence",
    ],
    properties: {
      field: { type: "string", enum: [...PRODUCT_AI_REVIEW_FIELDS] },
      current: { type: "string" },
      suggested: { type: ["string", "null"] },
      reason: { type: "string" },
      status: { type: "string", enum: ["ok", "suggest", "warning"] },
      confidence: { type: "string", enum: ["high", "medium", "low"] },
    },
  };
  return {
    type: "object",
    additionalProperties: false,
    required: ["review"],
    properties: {
      review: {
        type: "array",
        minItems: PRODUCT_AI_REVIEW_FIELDS.length,
        maxItems: PRODUCT_AI_REVIEW_FIELDS.length,
        items: itemSchema,
      },
    },
  };
}

function reviewFieldMax(field: ProductAiReviewField): number {
  if (field === "name") return PRODUCT_AI_FIELD_MAX.name;
  return PRODUCT_AI_FIELD_MAX[field as ProductAiNewEditableField] ?? 600;
}

function validateOneReviewItem(
  raw: unknown,
  expectedCurrent: Record<ProductAiReviewField, string>
):
  | { ok: true; item: ProductAiReviewItem }
  | { ok: false; code: "malformed_provider_output"; message: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      ok: false,
      code: "malformed_provider_output",
      message: "The AI provider returned an unusable product review.",
    };
  }
  const obj = raw as Record<string, unknown>;
  const allowed = new Set([
    "field",
    "current",
    "suggested",
    "reason",
    "status",
    "confidence",
  ]);
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) {
      return {
        ok: false,
        code: "malformed_provider_output",
        message: "The AI provider returned an unusable product review.",
      };
    }
  }
  if (typeof obj.field !== "string" || !REVIEW_FIELD_SET.has(obj.field)) {
    return {
      ok: false,
      code: "malformed_provider_output",
      message: "The AI provider returned an unusable product review.",
    };
  }
  if (obj.field === "slug" || C_CLASS_FIELDS.has(obj.field) || obj.field === "badge") {
    return {
      ok: false,
      code: "malformed_provider_output",
      message: "The AI provider returned an unusable product review.",
    };
  }
  const field = obj.field as ProductAiReviewField;
  if (typeof obj.current !== "string") {
    return {
      ok: false,
      code: "malformed_provider_output",
      message: "The AI provider returned an unusable product review.",
    };
  }
  const current = obj.current.trim();
  if (
    current.length > PRODUCT_AI_REVIEW_CURRENT_MAX ||
    looksLikeHtmlOrScript(current)
  ) {
    return {
      ok: false,
      code: "malformed_provider_output",
      message: "The AI provider returned an unusable product review.",
    };
  }
  // Prefer server-known current text; accept provider current if empty/match-ish.
  const authoritativeCurrent = expectedCurrent[field] || "";
  const normalizedCurrent =
    authoritativeCurrent || current.slice(0, reviewFieldMax(field));

  if (typeof obj.reason !== "string") {
    return {
      ok: false,
      code: "malformed_provider_output",
      message: "The AI provider returned an unusable product review.",
    };
  }
  const reason = obj.reason.trim();
  if (
    !reason ||
    reason.length > PRODUCT_AI_REASON_MAX ||
    looksLikeHtmlOrScript(reason)
  ) {
    return {
      ok: false,
      code: "malformed_provider_output",
      message: "The AI provider returned an unusable product review.",
    };
  }
  if (typeof obj.status !== "string" || !REVIEW_STATUS_SET.has(obj.status as ProductAiReviewStatus)) {
    return {
      ok: false,
      code: "malformed_provider_output",
      message: "The AI provider returned an unusable product review.",
    };
  }
  const status = obj.status as ProductAiReviewStatus;

  let suggested: string | null = null;
  if (obj.suggested === null || obj.suggested === undefined) {
    suggested = null;
  } else if (typeof obj.suggested === "string") {
    const s = obj.suggested.trim();
    if (!s) {
      suggested = null;
    } else if (
      s.length > PRODUCT_AI_REVIEW_SUGGESTED_MAX ||
      looksLikeHtmlOrScript(s) ||
      s.length > reviewFieldMax(field)
    ) {
      return {
        ok: false,
        code: "malformed_provider_output",
        message: "The AI provider returned an unusable product review.",
      };
    } else {
      suggested = s;
    }
  } else {
    return {
      ok: false,
      code: "malformed_provider_output",
      message: "The AI provider returned an unusable product review.",
    };
  }

  if (status === "ok" && suggested !== null) {
    // Allow ok with null only — coerce inconsistent ok+suggestion.
    return {
      ok: false,
      code: "malformed_provider_output",
      message: "The AI provider returned an unusable product review.",
    };
  }
  if ((status === "suggest" || status === "warning") && suggested === null) {
    return {
      ok: false,
      code: "malformed_provider_output",
      message: "The AI provider returned an unusable product review.",
    };
  }

  let confidence: ProductAiReviewConfidence | undefined;
  if (obj.confidence !== undefined) {
    if (
      typeof obj.confidence !== "string" ||
      !REVIEW_CONFIDENCE_SET.has(obj.confidence as ProductAiReviewConfidence)
    ) {
      return {
        ok: false,
        code: "malformed_provider_output",
        message: "The AI provider returned an unusable product review.",
      };
    }
    confidence = obj.confidence as ProductAiReviewConfidence;
  }

  const item: ProductAiReviewItem = {
    field,
    current: normalizedCurrent,
    suggested,
    reason,
    status,
  };
  if (confidence) item.confidence = confidence;
  return { ok: true, item };
}

export function validateProductReview(
  value: unknown,
  expectedCurrent: Record<ProductAiReviewField, string>
):
  | { ok: true; review: ProductAiReviewItem[] }
  | { ok: false; code: "malformed_provider_output"; message: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      ok: false,
      code: "malformed_provider_output",
      message: "The AI provider returned an unusable product review.",
    };
  }
  const root = value as Record<string, unknown>;
  if (Object.keys(root).some((k) => k !== "review")) {
    return {
      ok: false,
      code: "malformed_provider_output",
      message: "The AI provider returned an unusable product review.",
    };
  }
  if (!Array.isArray(root.review)) {
    return {
      ok: false,
      code: "malformed_provider_output",
      message: "The AI provider returned an unusable product review.",
    };
  }
  if (root.review.length !== PRODUCT_AI_REVIEW_FIELDS.length) {
    return {
      ok: false,
      code: "malformed_provider_output",
      message: "The AI provider returned an unusable product review.",
    };
  }

  const seen = new Set<string>();
  const review: ProductAiReviewItem[] = [];
  for (const raw of root.review) {
    const one = validateOneReviewItem(raw, expectedCurrent);
    if (!one.ok) return one;
    if (seen.has(one.item.field)) {
      return {
        ok: false,
        code: "malformed_provider_output",
        message: "The AI provider returned an unusable product review.",
      };
    }
    seen.add(one.item.field);
    review.push(one.item);
  }
  for (const field of PRODUCT_AI_REVIEW_FIELDS) {
    if (!seen.has(field)) {
      return {
        ok: false,
        code: "malformed_provider_output",
        message: "The AI provider returned an unusable product review.",
      };
    }
  }
  return { ok: true, review };
}

export function parseProductReviewJsonText(
  text: string,
  expectedCurrent: Record<ProductAiReviewField, string>
):
  | { ok: true; review: ProductAiReviewItem[] }
  | { ok: false; code: "malformed_provider_output"; message: string } {
  const raw = String(text || "").trim();
  if (!raw) {
    return {
      ok: false,
      code: "malformed_provider_output",
      message: "The AI provider returned an unusable product review.",
    };
  }
  try {
    return validateProductReview(JSON.parse(raw), expectedCurrent);
  } catch {
    return {
      ok: false,
      code: "malformed_provider_output",
      message: "The AI provider returned an unusable product review.",
    };
  }
}
