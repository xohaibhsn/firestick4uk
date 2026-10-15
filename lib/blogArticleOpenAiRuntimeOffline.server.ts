/**
 * AB-8C2 — Offline article OpenAI runtime safety (server-only).
 *
 * Process-local concurrency, timeout, abort, cost-budget gate, and
 * injected-mock-only execution. No live SDK, no env credential fallback,
 * no route/DB/CMS/bridge imports, no retries, no provider fallback.
 *
 * Cancellation does not guarantee zero provider billing for a future live call.
 */

import {
  BLOG_ARTICLE_OPENAI_MAX_PROVIDER_ATTEMPTS,
  assertBlogArticleOpenAiBudgetGate,
  createBlogArticleOpenAiFailure,
  validateBlogArticleOpenAiOfflineConfig,
  type BlogArticleOpenAiFailure,
  type BlogArticleOpenAiOfflineConfig,
  type BlogArticleOpenAiProviderResult,
  type BlogArticleOpenAiTrustedEvidenceFixture,
} from "@/lib/blogArticleOpenAiContracts";
import {
  callBlogArticleOpenAiProviderOffline,
  type BlogArticleOpenAiFakeResponsesCreate,
} from "@/lib/blogArticleOpenAiProviderOffline.server";

export type BlogArticleOpenAiOfflineRuntimeDeps = {
  /**
   * Required injected fake Responses.create.
   * Absence fails closed without loading any SDK.
   */
  fakeResponsesCreate?: BlogArticleOpenAiFakeResponsesCreate;
  /**
   * Optional plain env map for mismatch detection only.
   * Never used as a credential fallback. Live API-key values with offline_mock
   * cause fail-closed rejection.
   */
  env?: Record<string, string | undefined>;
};

/** Per Node process — max one offline article-generation mock in flight. */
let articleProviderInFlight = false;

/** Test seam: clear the process-local busy flag between offline suites. */
export function __resetBlogArticleOpenAiOfflineRuntimeForTests(): void {
  articleProviderInFlight = false;
}

function rejectLiveCredentialMismatch(
  config: BlogArticleOpenAiOfflineConfig,
  env: Record<string, string | undefined> | undefined
): BlogArticleOpenAiFailure | null {
  if (config.executionMode !== "offline_mock") {
    return createBlogArticleOpenAiFailure("unsupported_execution_mode");
  }
  if (!env) return null;

  const liveKey = env.OPENAI_API_KEY;
  if (typeof liveKey === "string" && liveKey.trim()) {
    // Offline mock must never execute with live credential material present.
    return createBlogArticleOpenAiFailure("invalid_request");
  }
  // Presence of OPENAI_SEO_MODEL alone is fine for inspection, but must not
  // silently select the model — config.model is authoritative.
  return null;
}

/**
 * Run one offline article-provider call against an injected fake provider.
 * Maximum attempts: 1. Automatic retries: 0. Fallbacks: 0.
 */
export async function runBlogArticleOpenAiRuntimeOffline(
  evidence: BlogArticleOpenAiTrustedEvidenceFixture,
  configRaw: unknown,
  options?: {
    signal?: AbortSignal;
    deps?: BlogArticleOpenAiOfflineRuntimeDeps;
  }
): Promise<BlogArticleOpenAiProviderResult> {
  if (articleProviderInFlight) {
    return createBlogArticleOpenAiFailure("provider_busy");
  }

  articleProviderInFlight = true;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let abortListener: (() => void) | null = null;
  let localController: AbortController | null = null;

  try {
    const configResult = validateBlogArticleOpenAiOfflineConfig(configRaw);
    if (!configResult.ok) return configResult;
    const config = configResult.value;

    if (BLOG_ARTICLE_OPENAI_MAX_PROVIDER_ATTEMPTS !== 1) {
      return createBlogArticleOpenAiFailure("invalid_request");
    }

    const deps = options?.deps;
    const fake = deps?.fakeResponsesCreate;
    if (typeof fake !== "function") {
      return createBlogArticleOpenAiFailure("provider_not_configured");
    }

    const mismatch = rejectLiveCredentialMismatch(config, deps?.env);
    if (mismatch) return mismatch;

    const budget = assertBlogArticleOpenAiBudgetGate(config);
    if (!budget.ok) return budget;

    const externalSignal = options?.signal;
    if (externalSignal?.aborted) {
      return createBlogArticleOpenAiFailure("request_aborted");
    }

    localController = new AbortController();
    const timeoutMs = config.timeoutMs ?? 90_000;

    const onExternalAbort = () => {
      try {
        localController?.abort();
      } catch {
        // ignore
      }
    };

    if (externalSignal) {
      abortListener = onExternalAbort;
      externalSignal.addEventListener("abort", onExternalAbort, {
        once: true,
      });
    }

    timeoutId = setTimeout(() => {
      try {
        localController?.abort();
      } catch {
        // ignore
      }
    }, timeoutMs);

    const combinedSignal = localController.signal;
    let timedOut = false;
    const markTimeout = () => {
      timedOut = true;
    };
    const timeoutAbortListener = () => {
      // Distinguish timeout abort from external abort after the fact.
      if (!externalSignal?.aborted) markTimeout();
    };
    combinedSignal.addEventListener("abort", timeoutAbortListener, {
      once: true,
    });

    try {
      const result = await callBlogArticleOpenAiProviderOffline(
        evidence,
        config,
        {
          signal: combinedSignal,
          deps: { fakeResponsesCreate: fake },
          budgetAlreadyChecked: true,
          preflightCostUsd: budget.estimate.estimatedCostUsd,
        }
      );

      if (combinedSignal.aborted) {
        if (externalSignal?.aborted) {
          return createBlogArticleOpenAiFailure("request_aborted");
        }
        if (timedOut) {
          return createBlogArticleOpenAiFailure("provider_timeout");
        }
        return createBlogArticleOpenAiFailure("request_aborted");
      }

      return result;
    } catch (err) {
      if (combinedSignal.aborted) {
        if (externalSignal?.aborted) {
          return createBlogArticleOpenAiFailure("request_aborted");
        }
        return createBlogArticleOpenAiFailure(
          timedOut ? "provider_timeout" : "request_aborted"
        );
      }
      void err;
      return createBlogArticleOpenAiFailure("provider_upstream");
    } finally {
      combinedSignal.removeEventListener("abort", timeoutAbortListener);
    }
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    if (abortListener && options?.signal) {
      options.signal.removeEventListener("abort", abortListener);
      abortListener = null;
    }
    localController = null;
    articleProviderInFlight = false;
  }
}
