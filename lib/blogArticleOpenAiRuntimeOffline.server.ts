/**
 * AB-8C2 / AB-8C2A — Offline article OpenAI runtime safety (server-only).
 *
 * Process-local concurrency, caller-facing timeout/abort race, cost-budget gate,
 * and injected-mock-only execution. No live SDK, no env credential fallback,
 * no route/DB/CMS/bridge imports, no retries, no provider fallback.
 *
 * Caller-facing settlement is independent of provider cooperation: a configured
 * deadline or explicit abort resolves the caller promptly while requesting
 * cancellation. The process-local busy reservation is released only when the
 * underlying provider promise actually settles. A provider that never settles
 * may leave the slot unavailable until process restart — an explicit fail-closed
 * limitation safer than overlapping billable calls.
 *
 * Cancellation / timeout does not forcibly terminate an arbitrary JavaScript
 * promise and does not guarantee zero future provider billing.
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

/**
 * Monotonic reservation id. Late settlement of an abandoned underlying promise
 * must not clear a newer invocation's busy slot (including after test reset).
 */
let busyReservationGeneration = 0;

/**
 * Test seam: clear the process-local busy flag between offline suites.
 * Invalidates any pending late-release callbacks from prior invocations.
 * Not a production bypass for an active underlying invocation. Suites that
 * leave a permanently unsettled mock must use an isolated module instance.
 */
export function __resetBlogArticleOpenAiOfflineRuntimeForTests(): void {
  busyReservationGeneration += 1;
  articleProviderInFlight = false;
}

function acquireBusyReservation(): number {
  articleProviderInFlight = true;
  busyReservationGeneration += 1;
  return busyReservationGeneration;
}

function releaseBusyReservation(generation: number): void {
  if (
    generation === busyReservationGeneration &&
    articleProviderInFlight
  ) {
    articleProviderInFlight = false;
  }
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

  const reservation = acquireBusyReservation();
  let underlyingStarted = false;

  try {
    const configResult = validateBlogArticleOpenAiOfflineConfig(configRaw);
    if (!configResult.ok) {
      releaseBusyReservation(reservation);
      return configResult;
    }
    const config = configResult.value;

    if (BLOG_ARTICLE_OPENAI_MAX_PROVIDER_ATTEMPTS !== 1) {
      releaseBusyReservation(reservation);
      return createBlogArticleOpenAiFailure("invalid_request");
    }

    const deps = options?.deps;
    const fake = deps?.fakeResponsesCreate;
    if (typeof fake !== "function") {
      releaseBusyReservation(reservation);
      return createBlogArticleOpenAiFailure("provider_not_configured");
    }

    const mismatch = rejectLiveCredentialMismatch(config, deps?.env);
    if (mismatch) {
      releaseBusyReservation(reservation);
      return mismatch;
    }

    const budget = assertBlogArticleOpenAiBudgetGate(config);
    if (!budget.ok) {
      releaseBusyReservation(reservation);
      return budget;
    }

    const externalSignal = options?.signal;
    if (externalSignal?.aborted) {
      releaseBusyReservation(reservation);
      return createBlogArticleOpenAiFailure("request_aborted");
    }

    const localController = new AbortController();
    const timeoutMs = config.timeoutMs ?? 90_000;
    const combinedSignal = localController.signal;

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let abortListener: (() => void) | null = null;

    const cleanupDeadlineResources = () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (abortListener && externalSignal) {
        externalSignal.removeEventListener("abort", abortListener);
        abortListener = null;
      }
    };

    let callerSettled = false;
    let settleCaller: (result: BlogArticleOpenAiProviderResult) => void =
      () => {};

    // Register timeout/abort listeners BEFORE invoking the provider so a
    // synchronous abort inside the mock cannot race past listener setup.
    const callerResultPromise = new Promise<BlogArticleOpenAiProviderResult>(
      (resolve) => {
        settleCaller = (result: BlogArticleOpenAiProviderResult) => {
          if (callerSettled) return;
          callerSettled = true;
          cleanupDeadlineResources();
          resolve(result);
        };

        timeoutId = setTimeout(() => {
          try {
            localController.abort();
          } catch {
            // ignore
          }
          settleCaller(createBlogArticleOpenAiFailure("provider_timeout"));
        }, timeoutMs);

        if (externalSignal) {
          abortListener = () => {
            try {
              localController.abort();
            } catch {
              // ignore
            }
            settleCaller(createBlogArticleOpenAiFailure("request_aborted"));
          };
          externalSignal.addEventListener("abort", abortListener, {
            once: true,
          });
        }
      }
    );

    // TOCTOU: abort may have fired between the pre-check and listener attach.
    if (externalSignal?.aborted) {
      try {
        localController.abort();
      } catch {
        // ignore
      }
      settleCaller(createBlogArticleOpenAiFailure("request_aborted"));
      releaseBusyReservation(reservation);
      return callerResultPromise;
    }

    underlyingStarted = true;

    const providerPromise = callBlogArticleOpenAiProviderOffline(
      evidence,
      config,
      {
        signal: combinedSignal,
        deps: { fakeResponsesCreate: fake },
        budgetAlreadyChecked: true,
        preflightCostUsd: budget.estimate.estimatedCostUsd,
      }
    );

    // Keep the busy reservation until the underlying promise settles, even if
    // the caller already timed out or aborted. Swallow late rejections.
    // Release is generation-scoped so a late settle cannot clear a newer slot.
    void providerPromise.then(
      (result) => {
        if (!callerSettled) {
          settleCaller(result);
        }
        releaseBusyReservation(reservation);
      },
      (err) => {
        if (!callerSettled) {
          void err;
          if (externalSignal?.aborted) {
            settleCaller(createBlogArticleOpenAiFailure("request_aborted"));
          } else if (combinedSignal.aborted) {
            settleCaller(createBlogArticleOpenAiFailure("provider_timeout"));
          } else {
            settleCaller(createBlogArticleOpenAiFailure("provider_upstream"));
          }
        }
        releaseBusyReservation(reservation);
      }
    );

    return callerResultPromise;
  } catch {
    if (!underlyingStarted) {
      releaseBusyReservation(reservation);
    }
    return createBlogArticleOpenAiFailure("provider_upstream");
  }
}
