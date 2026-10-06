/**
 * Shared SEO AI types, request/output validation, and prompt construction.
 * Provider adapters live in seoAiServer.ts (server-only).
 */

export type SeoAiProvider = "gemini" | "openai";
export type SeoAiTask = "explain_issue";

export type SeoAiExplainRequest = {
  provider: SeoAiProvider;
  task: SeoAiTask;
  issueId: string;
};

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

const ISSUE_ID_RE = /^(product|blog):(\d+):([a-z0-9][a-z0-9_-]{0,80})$/i;

const ALLOWED_REQUEST_KEYS = new Set(["provider", "task", "issueId"]);

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
    if (!ALLOWED_REQUEST_KEYS.has(key)) {
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
