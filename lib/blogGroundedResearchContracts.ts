/**
 * AB-7B R0 — Pure clean-room grounded Blog research contracts.
 *
 * Transport-neutral request/provider-packet/error shapes only.
 * No network, timers, cancellation primitives, DB, SEO-AI graph, or AB-7A
 * evidence validation. Future R1 adapters return packets; R2 invokes AB-7A.
 *
 * Resource ceiling note (Hostinger Max Processes = 120): this module adds
 * zero runtime processes, workers, timers, routes, or provider calls.
 */

import {
  MAX_INTENT_CHARS,
  MAX_OPPORTUNITY_ID_CHARS,
  MAX_TOPIC_CHARS,
} from "@/lib/blogOpportunityEngine";

import type {
  BlogResearchGrounding,
  BlogResearchProviderOutput,
} from "@/lib/blogResearchEvidence";

export const BLOG_GROUNDED_RESEARCH_PROVIDERS = ["openai", "gemini"] as const;

export type BlogGroundedResearchProvider =
  (typeof BLOG_GROUNDED_RESEARCH_PROVIDERS)[number];

export const BLOG_GROUNDED_RESEARCH_TASK = "research_blog_evidence" as const;

export type BlogGroundedResearchTask = typeof BLOG_GROUNDED_RESEARCH_TASK;

/** Future R1/R3 ceilings — contract constants only (no timers/network here). */
export const BLOG_GROUNDED_RESEARCH_PROVIDER_TIMEOUT_MS = 45_000;
export const BLOG_GROUNDED_RESEARCH_MAX_RAW_RESPONSE_BYTES = 262_144;
export const BLOG_GROUNDED_RESEARCH_MAX_PROVIDER_ATTEMPTS = 1;
export const BLOG_GROUNDED_RESEARCH_MAX_IN_FLIGHT_PER_PROCESS = 1;

export type BlogGroundedResearchRequest = {
  provider: BlogGroundedResearchProvider;
  task: BlogGroundedResearchTask;
  opportunityId: string;
  topic: string;
  intent: string | null;
};

/**
 * R1 adapter success packet. Factual grounding/evidence checks belong to
 * AB-7A's exported evidence validator — not performed here.
 */
export type BlogGroundedResearchProviderPacket = {
  provider: BlogGroundedResearchProvider;
  providerOutput: BlogResearchProviderOutput;
  grounding: BlogResearchGrounding;
};

export const BLOG_GROUNDED_RESEARCH_FAILURE_CODES = [
  "invalid_request",
  "provider_not_configured",
  "provider_timeout",
  "provider_upstream",
  "malformed_provider_output",
  "grounding_unavailable",
  "research_busy",
  "request_aborted",
] as const;

export type BlogGroundedResearchFailureCode =
  (typeof BLOG_GROUNDED_RESEARCH_FAILURE_CODES)[number];

export type BlogGroundedResearchFailure = {
  ok: false;
  status: number;
  code: BlogGroundedResearchFailureCode;
  message: string;
};

export type BlogGroundedResearchParseResult =
  | { ok: true; value: BlogGroundedResearchRequest }
  | BlogGroundedResearchFailure;

const PROVIDERS = new Set<string>(BLOG_GROUNDED_RESEARCH_PROVIDERS);

const REQUEST_KEYS = new Set([
  "provider",
  "task",
  "opportunityId",
  "topic",
  "intent",
]);
const REQUIRED_REQUEST_KEYS = new Set([
  "provider",
  "task",
  "opportunityId",
  "topic",
]);

const FAILURE_STATUS: Record<BlogGroundedResearchFailureCode, number> = {
  invalid_request: 400,
  research_busy: 429,
  request_aborted: 499,
  malformed_provider_output: 502,
  grounding_unavailable: 502,
  provider_not_configured: 503,
  provider_timeout: 503,
  provider_upstream: 503,
};

const FAILURE_MESSAGE: Record<BlogGroundedResearchFailureCode, string> = {
  invalid_request: "Invalid grounded research request.",
  research_busy: "Grounded research is busy. Try again later.",
  request_aborted: "Grounded research request was aborted.",
  malformed_provider_output: "Provider returned a malformed research payload.",
  grounding_unavailable: "Provider grounding metadata was unavailable.",
  provider_not_configured: "Grounded research provider is not configured.",
  provider_timeout: "Grounded research provider timed out.",
  provider_upstream: "Grounded research provider is unavailable.",
};

type DataSnapshot = { ok: true; value: Record<string, unknown> } | { ok: false };

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

/** Match AB-7A subject text normalization without importing non-exported helpers. */
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

export function blogGroundedResearchFailureStatus(
  code: BlogGroundedResearchFailureCode
): number {
  return FAILURE_STATUS[code];
}

/**
 * Canonical failure factory. Accepts only known codes; ignores any caller
 * status/message/upstream detail.
 */
export function createBlogGroundedResearchFailure(
  code: BlogGroundedResearchFailureCode | unknown
): BlogGroundedResearchFailure {
  if (
    typeof code !== "string" ||
    !Object.prototype.hasOwnProperty.call(FAILURE_STATUS, code)
  ) {
    return {
      ok: false,
      status: FAILURE_STATUS.invalid_request,
      code: "invalid_request",
      message: FAILURE_MESSAGE.invalid_request,
    };
  }
  const typed = code as BlogGroundedResearchFailureCode;
  return {
    ok: false,
    status: FAILURE_STATUS[typed],
    code: typed,
    message: FAILURE_MESSAGE[typed],
  };
}

/**
 * Strict request parser. Fail-closed. Does not mutate caller input.
 */
export function parseBlogGroundedResearchRequest(
  raw: unknown
): BlogGroundedResearchParseResult {
  const snapshot = snapshotDataObject(
    raw,
    REQUEST_KEYS,
    REQUIRED_REQUEST_KEYS
  );
  if (!snapshot.ok) {
    return createBlogGroundedResearchFailure("invalid_request");
  }
  const value = snapshot.value;

  if (
    typeof value.provider !== "string" ||
    !PROVIDERS.has(value.provider)
  ) {
    return createBlogGroundedResearchFailure("invalid_request");
  }
  const provider = value.provider as BlogGroundedResearchProvider;

  if (value.task !== BLOG_GROUNDED_RESEARCH_TASK) {
    return createBlogGroundedResearchFailure("invalid_request");
  }

  const opportunityId = normalizePlainText(
    value.opportunityId,
    MAX_OPPORTUNITY_ID_CHARS
  );
  const topic = normalizePlainText(value.topic, MAX_TOPIC_CHARS);
  if (!opportunityId || !topic) {
    return createBlogGroundedResearchFailure("invalid_request");
  }

  let intent: string | null = null;
  const rawIntent = value.intent;
  if (rawIntent !== undefined && rawIntent !== null) {
    if (typeof rawIntent !== "string" || rawIntent.length > MAX_INTENT_CHARS) {
      return createBlogGroundedResearchFailure("invalid_request");
    }
    if (!rawIntent.trim()) {
      intent = null;
    } else {
      intent = normalizePlainText(rawIntent, MAX_INTENT_CHARS);
      if (!intent) {
        return createBlogGroundedResearchFailure("invalid_request");
      }
    }
  }

  return {
    ok: true,
    value: {
      provider,
      task: BLOG_GROUNDED_RESEARCH_TASK,
      opportunityId,
      topic,
      intent,
    },
  };
}
