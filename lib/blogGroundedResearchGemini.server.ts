/**
 * AB-7B R1 — Isolated Gemini grounded-research adapter (server-only).
 *
 * Isolated Interactions REST call only. No Gemini SDK, environment reads,
 * top-level timers, retry, fallback, DB, or SEO-AI graph imports.
 */

import {
  BLOG_GROUNDED_RESEARCH_MAX_RAW_RESPONSE_BYTES,
  BLOG_GROUNDED_RESEARCH_PROVIDER_TIMEOUT_MS,
  createBlogGroundedResearchFailure,
  type BlogGroundedResearchFailure,
  type BlogGroundedResearchProviderPacket,
} from "@/lib/blogGroundedResearchContracts";
import {
  BLOG_GROUNDED_RESEARCH_GEMINI_INTERACTIONS_URL,
  BLOG_GROUNDED_RESEARCH_PROVIDER_JSON_SCHEMA,
  buildBlogGroundedResearchSystemPrompt,
  buildBlogGroundedResearchUserPrompt,
  extractGeminiGroundedResearchGrounding,
  extractGeminiInteractionText,
  isBlogGroundedResearchProviderConfigured,
  mapGroundingExtractionFailure,
  mapHttpStatusToProviderFailure,
  parseBlogGroundedResearchProviderJsonEnvelope,
  readBoundedGeminiResearchResponseJson,
  type BlogGroundedResearchProviderConfig,
} from "@/lib/blogGroundedResearchProviderCommon.server";
import type { BlogResearchSubject } from "@/lib/blogResearchEvidence";

export { BLOG_GROUNDED_RESEARCH_GEMINI_INTERACTIONS_URL };

export type CallGeminiGroundedResearchDeps = {
  fetchImpl?: typeof fetch;
  /** Test-only override; production callers omit this. */
  timeoutMs?: number;
};

export type CallGeminiGroundedResearchResult =
  | { ok: true; packet: BlogGroundedResearchProviderPacket }
  | BlogGroundedResearchFailure;

type AbortReason = "client" | "timeout" | null;

type ResearchAbortBundle = {
  signal: AbortSignal;
  getAbortReason: () => AbortReason;
  cleanup: () => void;
};

function createResearchAbortBundle(
  timeoutMs: number,
  external?: AbortSignal
): ResearchAbortBundle {
  let abortReason: AbortReason = null;
  const providerController = new AbortController();
  const timer = setTimeout(() => {
    if (abortReason == null) {
      abortReason = "timeout";
      providerController.abort();
    }
  }, timeoutMs);

  let onExternalAbort: (() => void) | null = null;
  if (external) {
    if (external.aborted) {
      abortReason = "client";
      providerController.abort();
    } else {
      onExternalAbort = () => {
        if (abortReason == null) {
          abortReason = "client";
          providerController.abort();
        }
      };
      external.addEventListener("abort", onExternalAbort, { once: true });
    }
  }

  return {
    signal: providerController.signal,
    getAbortReason: () => abortReason,
    cleanup: () => {
      clearTimeout(timer);
      if (onExternalAbort && external) {
        external.removeEventListener("abort", onExternalAbort);
      }
    },
  };
}

function mapAbortFailure(abort: ResearchAbortBundle): BlogGroundedResearchFailure {
  if (abort.getAbortReason() === "client") {
    return createBlogGroundedResearchFailure("request_aborted");
  }
  return createBlogGroundedResearchFailure("provider_timeout");
}

/**
 * Exactly one Gemini Interactions REST call with google_search. Returns a
 * provider packet only — does not invoke AB-7A evidence validation.
 */
export async function callGeminiGroundedResearch(
  subject: BlogResearchSubject,
  config: BlogGroundedResearchProviderConfig,
  options?: {
    signal?: AbortSignal;
    deps?: CallGeminiGroundedResearchDeps;
  }
): Promise<CallGeminiGroundedResearchResult> {
  if (!isBlogGroundedResearchProviderConfigured(config)) {
    return createBlogGroundedResearchFailure("provider_not_configured");
  }

  const externalSignal = options?.signal;
  if (externalSignal?.aborted) {
    return createBlogGroundedResearchFailure("request_aborted");
  }

  const deps = options?.deps;
  const timeoutMs =
    typeof deps?.timeoutMs === "number" &&
    Number.isFinite(deps.timeoutMs) &&
    deps.timeoutMs > 0
      ? deps.timeoutMs
      : BLOG_GROUNDED_RESEARCH_PROVIDER_TIMEOUT_MS;
  const abort = createResearchAbortBundle(timeoutMs, externalSignal);
  const fetchImpl = deps?.fetchImpl ?? fetch;

  try {
    if (abort.getAbortReason() === "client") {
      return mapAbortFailure(abort);
    }

    const res = await fetchImpl(BLOG_GROUNDED_RESEARCH_GEMINI_INTERACTIONS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": config.apiKey,
        "Api-Revision": "2026-05-20",
      },
      body: JSON.stringify({
        model: config.model,
        input: buildBlogGroundedResearchUserPrompt(subject),
        system_instruction: buildBlogGroundedResearchSystemPrompt(),
        tools: [{ type: "google_search" }],
        store: false,
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: BLOG_GROUNDED_RESEARCH_PROVIDER_JSON_SCHEMA,
        },
      }),
      redirect: "error",
      signal: abort.signal,
    });

    if (!res.ok) {
      return mapHttpStatusToProviderFailure(res.status);
    }

    const bounded = await readBoundedGeminiResearchResponseJson(
      res,
      BLOG_GROUNDED_RESEARCH_MAX_RAW_RESPONSE_BYTES
    );
    if (!bounded.ok) {
      return bounded;
    }

    const body = bounded.value;
    const grounding = extractGeminiGroundedResearchGrounding(body);
    if (!grounding.ok) {
      return mapGroundingExtractionFailure(grounding.reason);
    }

    const parsed = parseBlogGroundedResearchProviderJsonEnvelope(
      extractGeminiInteractionText(body)
    );
    if (!parsed.ok) {
      return parsed;
    }

    return {
      ok: true,
      packet: {
        provider: "gemini",
        providerOutput: parsed.providerOutput,
        grounding: grounding.grounding,
      },
    };
  } catch {
    if (abort.getAbortReason() != null) {
      return mapAbortFailure(abort);
    }
    return createBlogGroundedResearchFailure("provider_upstream");
  } finally {
    abort.cleanup();
  }
}
