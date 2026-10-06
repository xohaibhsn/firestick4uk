/**
 * Shared SEO AI types, request/output validation, and prompt construction.
 * Provider adapters live in seoAiServer.ts (server-only).
 */

export type SeoAiProvider = "gemini" | "openai";
export type SeoAiTask = "explain_issue" | "draft_metadata";

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

export type SeoAiRequest = SeoAiExplainRequest | SeoAiDraftRequest;

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
  if (task !== "draft_metadata") {
    return {
      ok: false,
      code: "invalid_request",
      message: "task must be explain_issue or draft_metadata.",
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
