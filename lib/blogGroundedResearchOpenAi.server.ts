/**
 * AB-7B R1 — Isolated OpenAI grounded-research adapter (server-only).
 *
 * Dynamic openai SDK import inside the call path only. No environment reads,
 * top-level client, retry, fallback, DB, or SEO-AI graph imports.
 */

import {
  BLOG_GROUNDED_RESEARCH_PROVIDER_TIMEOUT_MS,
  createBlogGroundedResearchFailure,
  type BlogGroundedResearchFailure,
  type BlogGroundedResearchProviderPacket,
} from "@/lib/blogGroundedResearchContracts";
import {
  assertSerializedResponseWithinByteCap,
  BLOG_GROUNDED_RESEARCH_OPENAI_MAX_OUTPUT_TOKENS,
  BLOG_GROUNDED_RESEARCH_PROVIDER_JSON_SCHEMA,
  buildBlogGroundedResearchSystemPrompt,
  buildBlogGroundedResearchUserPrompt,
  extractOpenAiGroundedResearchGrounding,
  isBlogGroundedResearchProviderConfigured,
  mapGroundingExtractionFailure,
  mapHttpStatusToProviderFailure,
  parseBlogGroundedResearchProviderJsonEnvelope,
  type BlogGroundedResearchProviderConfig,
} from "@/lib/blogGroundedResearchProviderCommon.server";
import type { BlogResearchSubject } from "@/lib/blogResearchEvidence";

type OpenAiResponsesCreate = (
  body: Record<string, unknown>,
  options?: { signal?: AbortSignal }
) => Promise<unknown>;

type OpenAiClient = {
  responses: { create: OpenAiResponsesCreate };
};

export type OpenAiSdkModuleLike = {
  default: new (options: {
    apiKey: string;
    maxRetries: number;
    timeout: number;
  }) => OpenAiClient;
};

export type CallOpenAiGroundedResearchDeps = {
  /** Test seam: fake SDK module so real `openai` is never loaded. */
  loadOpenAiSdk?: () => Promise<OpenAiSdkModuleLike>;
};

export type CallOpenAiGroundedResearchResult =
  | { ok: true; packet: BlogGroundedResearchProviderPacket }
  | BlogGroundedResearchFailure;

async function defaultLoadOpenAiSdk(): Promise<OpenAiSdkModuleLike> {
  return (await import("openai")) as unknown as OpenAiSdkModuleLike;
}

function errorName(err: unknown): string {
  if (!err || typeof err !== "object") return "";
  return String((err as { name?: unknown }).name || "");
}

function errorStatus(err: unknown): number {
  if (!err || typeof err !== "object" || !("status" in err)) return NaN;
  return Number((err as { status?: unknown }).status);
}

/**
 * Exactly one OpenAI Responses API call with web_search. Returns a provider
 * packet only — does not invoke AB-7A evidence validation.
 */
export async function callOpenAiGroundedResearch(
  subject: BlogResearchSubject,
  config: BlogGroundedResearchProviderConfig,
  options?: {
    signal?: AbortSignal;
    deps?: CallOpenAiGroundedResearchDeps;
  }
): Promise<CallOpenAiGroundedResearchResult> {
  if (!isBlogGroundedResearchProviderConfigured(config)) {
    return createBlogGroundedResearchFailure("provider_not_configured");
  }

  const externalSignal = options?.signal;
  if (externalSignal?.aborted) {
    return createBlogGroundedResearchFailure("request_aborted");
  }

  const loadSdk = options?.deps?.loadOpenAiSdk ?? defaultLoadOpenAiSdk;

  try {
    const sdk = await loadSdk();
    const client = new sdk.default({
      apiKey: config.apiKey,
      maxRetries: 0,
      timeout: BLOG_GROUNDED_RESEARCH_PROVIDER_TIMEOUT_MS,
    });

    const response = await client.responses.create(
      {
        model: config.model,
        store: false,
        instructions: buildBlogGroundedResearchSystemPrompt(),
        input: buildBlogGroundedResearchUserPrompt(subject),
        tools: [
          {
            type: "web_search",
            external_web_access: true,
            search_context_size: "medium",
          },
        ],
        tool_choice: "required",
        include: ["web_search_call.action.sources"],
        max_output_tokens: BLOG_GROUNDED_RESEARCH_OPENAI_MAX_OUTPUT_TOKENS,
        text: {
          format: {
            type: "json_schema",
            name: "blog_grounded_research_evidence",
            strict: true,
            schema: BLOG_GROUNDED_RESEARCH_PROVIDER_JSON_SCHEMA as unknown as {
              [key: string]: unknown;
            },
          },
        },
      },
      externalSignal ? { signal: externalSignal } : undefined
    );

    const sizeCheck = assertSerializedResponseWithinByteCap(response);
    if (!sizeCheck.ok) return sizeCheck;

    const grounding = extractOpenAiGroundedResearchGrounding(response);
    if (!grounding.ok) {
      return mapGroundingExtractionFailure(grounding.reason);
    }

    const text =
      response &&
      typeof response === "object" &&
      typeof (response as { output_text?: unknown }).output_text === "string"
        ? String((response as { output_text: string }).output_text)
        : "";
    const parsed = parseBlogGroundedResearchProviderJsonEnvelope(text);
    if (!parsed.ok) return parsed;

    return {
      ok: true,
      packet: {
        provider: "openai",
        providerOutput: parsed.providerOutput,
        grounding: grounding.grounding,
      },
    };
  } catch (err) {
    if (externalSignal?.aborted) {
      return createBlogGroundedResearchFailure("request_aborted");
    }
    const name = errorName(err);
    if (name === "APIUserAbortError" || name === "AbortError") {
      return createBlogGroundedResearchFailure("request_aborted");
    }
    if (name === "APIConnectionTimeoutError") {
      return createBlogGroundedResearchFailure("provider_timeout");
    }
    const status = errorStatus(err);
    if (Number.isFinite(status) && status > 0) {
      return mapHttpStatusToProviderFailure(status);
    }
    if (/timeout|timed out/i.test(name)) {
      return createBlogGroundedResearchFailure("provider_timeout");
    }
    return createBlogGroundedResearchFailure("provider_upstream");
  }
}
