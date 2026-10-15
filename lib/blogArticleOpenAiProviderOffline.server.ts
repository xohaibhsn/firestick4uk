/**
 * AB-8C2 — Offline OpenAI article provider adapter (server-only).
 *
 * Models Responses API request construction and response interpretation using
 * an explicitly injected fake `responses.create` only.
 *
 * Absolutely forbidden in this module:
 * - Instantiating a real OpenAI client
 * - Importing live OpenAI SDK runtime code
 * - Reading OPENAI_API_KEY / Hostinger credentials
 * - fetch/HTTP, streaming, or provider web-search tools
 * - Automatic retries or provider fallbacks
 *
 * Type-only SDK shapes are expressed as local structural types — never load the SDK package.
 */

import {
  BLOG_ARTICLE_OPENAI_COST_ACCOUNTING,
  BLOG_ARTICLE_OPENAI_MAX_RESPONSE_BYTES,
  BLOG_ARTICLE_OPENAI_PROVIDER_OUTPUT_STATUS,
  assertBlogArticleOpenAiBudgetGate,
  buildBlogArticleOpenAiResponsesRequest,
  createBlogArticleOpenAiFailure,
  estimateBlogArticleOpenAiCostFromUsage,
  normalizeBlogArticleOpenAiUsage,
  parseBlogArticleOpenAiModelOutput,
  validateBlogArticleOpenAiOfflineConfig,
  type BlogArticleOpenAiFailure,
  type BlogArticleOpenAiOfflineConfig,
  type BlogArticleOpenAiProviderResult,
  type BlogArticleOpenAiResponsesRequestEnvelope,
  type BlogArticleOpenAiTrustedEvidenceFixture,
} from "@/lib/blogArticleOpenAiContracts";

/** Injected fake Responses.create — never defaults to a real SDK. */
export type BlogArticleOpenAiFakeResponsesCreate = (
  body: BlogArticleOpenAiResponsesRequestEnvelope,
  options?: { signal?: AbortSignal }
) => Promise<unknown>;

export type BlogArticleOpenAiOfflineProviderDeps = {
  /**
   * Required. No injected mock = fail closed.
   * There is no default SDK loader and no environment fallback.
   */
  fakeResponsesCreate?: BlogArticleOpenAiFakeResponsesCreate;
};

type OfflineCallOptions = {
  signal?: AbortSignal;
  deps?: BlogArticleOpenAiOfflineProviderDeps;
  /**
   * When true, skip the pre-call budget gate (runtime already gated).
   * Adapter still validates cost policy for post-response accounting.
   */
  budgetAlreadyChecked?: boolean;
  /** Preflight estimate from runtime budget gate (optional). */
  preflightCostUsd?: number;
};

const RESPONSE_STATUSES = new Set([
  "completed",
  "failed",
  "in_progress",
  "cancelled",
  "queued",
  "incomplete",
]);

function errorName(err: unknown): string {
  if (!err || typeof err !== "object") return "";
  return String((err as { name?: unknown }).name || "");
}

function errorStatus(err: unknown): number {
  if (!err || typeof err !== "object" || !("status" in err)) return NaN;
  return Number((err as { status?: unknown }).status);
}

function assertSerializedWithinByteCap(
  value: unknown,
  maxBytes: number
): { ok: true } | BlogArticleOpenAiFailure {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return createBlogArticleOpenAiFailure("malformed_provider_output");
  }
  if (typeof serialized !== "string") {
    return createBlogArticleOpenAiFailure("malformed_provider_output");
  }
  if (Buffer.byteLength(serialized, "utf8") > maxBytes) {
    return createBlogArticleOpenAiFailure("provider_output_oversized");
  }
  return { ok: true };
}

function extractOutputText(body: Record<string, unknown>): string | null {
  if (typeof body.output_text === "string") {
    return body.output_text;
  }

  // Nested refusal / output_text scan across Responses `output` items.
  const output = body.output;
  if (!Array.isArray(output)) return null;
  const chunks: string[] = [];
  for (const rawItem of output) {
    if (!rawItem || typeof rawItem !== "object") continue;
    const item = rawItem as Record<string, unknown>;
    const content = item.content;
    if (!Array.isArray(content)) continue;
    for (const rawPart of content) {
      if (!rawPart || typeof rawPart !== "object") continue;
      const part = rawPart as Record<string, unknown>;
      if (part.type === "refusal") {
        return null; // signalled via detectRefusal
      }
      if (part.type === "output_text" && typeof part.text === "string") {
        chunks.push(part.text);
      }
    }
  }
  if (chunks.length === 0) return null;
  return chunks.join("");
}

function detectRefusal(body: Record<string, unknown>): boolean {
  if (typeof body.refusal === "string" && body.refusal.trim()) {
    return true;
  }
  const output = body.output;
  if (!Array.isArray(output)) return false;
  for (const rawItem of output) {
    if (!rawItem || typeof rawItem !== "object") continue;
    const item = rawItem as Record<string, unknown>;
    if (item.type === "refusal") return true;
    const content = item.content;
    if (!Array.isArray(content)) continue;
    for (const rawPart of content) {
      if (!rawPart || typeof rawPart !== "object") continue;
      const part = rawPart as Record<string, unknown>;
      if (part.type === "refusal") return true;
      if (typeof part.refusal === "string" && part.refusal.trim()) return true;
    }
  }
  return false;
}

/**
 * Interpret a Responses API envelope without trusting HTTP 200 alone.
 * Incomplete / refused / non-completed statuses never become valid output.
 */
export function interpretBlogArticleOpenAiMockResponse(
  response: unknown,
  config: BlogArticleOpenAiOfflineConfig,
  evidence: BlogArticleOpenAiTrustedEvidenceFixture,
  options?: {
    preflightCostUsd?: number;
  }
): BlogArticleOpenAiProviderResult {
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    return createBlogArticleOpenAiFailure("malformed_provider_output");
  }

  const maxBytes =
    config.maxResponseBytes ?? BLOG_ARTICLE_OPENAI_MAX_RESPONSE_BYTES;
  const sizeCheck = assertSerializedWithinByteCap(response, maxBytes);
  if (!sizeCheck.ok) return sizeCheck;

  const body = response as Record<string, unknown>;
  const status = body.status;

  if (typeof status !== "string" || !RESPONSE_STATUSES.has(status)) {
    return createBlogArticleOpenAiFailure("unknown_response_status");
  }

  if (status === "queued" || status === "in_progress") {
    return createBlogArticleOpenAiFailure("response_not_ready");
  }
  if (status === "failed") {
    return createBlogArticleOpenAiFailure("provider_failed");
  }
  if (status === "cancelled") {
    return createBlogArticleOpenAiFailure("provider_cancelled");
  }
  if (status === "incomplete") {
    const details = body.incomplete_details;
    if (details && typeof details === "object" && !Array.isArray(details)) {
      const reason = (details as Record<string, unknown>).reason;
      if (reason === "max_output_tokens") {
        return createBlogArticleOpenAiFailure("provider_max_output_tokens");
      }
    }
    return createBlogArticleOpenAiFailure("provider_incomplete");
  }

  // status === "completed"
  if (detectRefusal(body)) {
    return createBlogArticleOpenAiFailure("provider_refusal");
  }

  // Strict response model identity — fail closed. Acceptance requires a
  // nonempty string that exactly matches the configured model. Missing, null,
  // blank, non-string, alias, or mismatched identities are rejected. Never
  // fabricate a default or fall back to the request model field.
  if (typeof body.model !== "string") {
    return createBlogArticleOpenAiFailure("unsupported_model");
  }
  const responseModel = body.model.trim();
  if (!responseModel || responseModel !== config.model) {
    return createBlogArticleOpenAiFailure("unsupported_model");
  }

  const text = extractOutputText(body);
  if (text === null) {
    return createBlogArticleOpenAiFailure("malformed_provider_output");
  }
  if (!text.trim()) {
    return createBlogArticleOpenAiFailure("malformed_provider_output");
  }

  const parsed = parseBlogArticleOpenAiModelOutput(text, evidence);
  if (!parsed.ok) return parsed;

  if (!Object.prototype.hasOwnProperty.call(body, "usage")) {
    return createBlogArticleOpenAiFailure("missing_usage");
  }
  const usageNorm = normalizeBlogArticleOpenAiUsage(body.usage);
  if (!usageNorm.ok) return usageNorm;

  const reportedCostUsd = estimateBlogArticleOpenAiCostFromUsage({
    inputTokens: usageNorm.usage.inputTokens,
    outputTokens: usageNorm.usage.outputTokens,
    inputUsdPerMillion: config.rates.inputUsdPerMillion,
    outputUsdPerMillion: config.rates.outputUsdPerMillion,
  });
  if (reportedCostUsd === null) {
    return createBlogArticleOpenAiFailure("invalid_usage");
  }

  const preflight =
    typeof options?.preflightCostUsd === "number" &&
    Number.isFinite(options.preflightCostUsd)
      ? options.preflightCostUsd
      : reportedCostUsd;

  return {
    ok: true,
    status: BLOG_ARTICLE_OPENAI_PROVIDER_OUTPUT_STATUS,
    provider: "openai",
    task: config.task,
    generationIntent: config.generationIntent,
    executionMode: config.executionMode,
    model: config.model,
    modelOutput: parsed.modelOutput,
    usage: usageNorm.usage,
    reportedCostUsd,
    preflightCostUsd: preflight,
    costAccounting: BLOG_ARTICLE_OPENAI_COST_ACCOUNTING,
    ab8bPreviewStatus: "not_evaluated",
  };
}

/**
 * Exactly one injected mock Responses.create call. No retries. No live SDK.
 */
export async function callBlogArticleOpenAiProviderOffline(
  evidence: BlogArticleOpenAiTrustedEvidenceFixture,
  configRaw: unknown,
  options?: OfflineCallOptions
): Promise<BlogArticleOpenAiProviderResult> {
  const configResult = validateBlogArticleOpenAiOfflineConfig(configRaw);
  if (!configResult.ok) return configResult;
  const config = configResult.value;

  const fake = options?.deps?.fakeResponsesCreate;
  if (typeof fake !== "function") {
    return createBlogArticleOpenAiFailure("provider_not_configured");
  }

  const externalSignal = options?.signal;
  if (externalSignal?.aborted) {
    return createBlogArticleOpenAiFailure("request_aborted");
  }

  let preflightCostUsd = options?.preflightCostUsd;
  if (!options?.budgetAlreadyChecked) {
    const budget = assertBlogArticleOpenAiBudgetGate(config);
    if (!budget.ok) return budget;
    preflightCostUsd = budget.estimate.estimatedCostUsd;
  }

  const built = buildBlogArticleOpenAiResponsesRequest(config, evidence);
  if (!built.ok) return built;

  try {
    const response = await fake(
      built.request,
      externalSignal ? { signal: externalSignal } : undefined
    );

    if (externalSignal?.aborted) {
      return createBlogArticleOpenAiFailure("request_aborted");
    }

    return interpretBlogArticleOpenAiMockResponse(
      response,
      config,
      evidence,
      { preflightCostUsd }
    );
  } catch (err) {
    if (externalSignal?.aborted) {
      return createBlogArticleOpenAiFailure("request_aborted");
    }
    const name = errorName(err);
    if (name === "APIUserAbortError" || name === "AbortError") {
      return createBlogArticleOpenAiFailure("request_aborted");
    }
    if (name === "APIConnectionTimeoutError") {
      return createBlogArticleOpenAiFailure("provider_timeout");
    }
    const status = errorStatus(err);
    if (status === 429) {
      return createBlogArticleOpenAiFailure("provider_rate_limited");
    }
    if (status === 408 || status === 504) {
      return createBlogArticleOpenAiFailure("provider_timeout");
    }
    if (Number.isFinite(status) && status >= 500) {
      return createBlogArticleOpenAiFailure("provider_upstream");
    }
    if (Number.isFinite(status) && status >= 400) {
      return createBlogArticleOpenAiFailure("provider_upstream");
    }
    if (/timeout|timed out/i.test(name) || /timeout|timed out/i.test(String(err))) {
      return createBlogArticleOpenAiFailure("provider_timeout");
    }
    return createBlogArticleOpenAiFailure("provider_upstream");
  }
}
