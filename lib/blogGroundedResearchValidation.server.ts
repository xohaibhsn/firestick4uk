/**
 * AB-7B R2 — Provider-neutral grounded research → AB-7A evidence validation.
 *
 * Accepts one already-selected injected provider call. Does not import concrete
 * OpenAI/Gemini adapters, env, DB, timers, AbortController, or routes.
 *
 * Outer `{ ok: true }` means provider execution completed and AB-7A ran.
 * Nested `evidence` may still be `ready` or `missing`.
 */

import {
  createBlogGroundedResearchFailure,
  type BlogGroundedResearchFailure,
  type BlogGroundedResearchProviderPacket,
  type BlogGroundedResearchRequest,
} from "@/lib/blogGroundedResearchContracts";
import {
  validateBlogResearchEvidence,
  type BlogResearchEvidenceResult,
  type BlogResearchSubject,
} from "@/lib/blogResearchEvidence";

export type BlogGroundedResearchInjectedProviderCall = (
  subject: BlogResearchSubject,
  options?: { signal?: AbortSignal }
) => Promise<
  | { ok: true; packet: BlogGroundedResearchProviderPacket }
  | BlogGroundedResearchFailure
>;

/**
 * Outer success means validation completed — not that evidence is ready.
 * Nested `evidence.evidenceState` is `ready` or `missing` per AB-7A.
 */
export type BlogGroundedResearchValidatedResult =
  | {
      ok: true;
      provider: BlogGroundedResearchRequest["provider"];
      evidence: BlogResearchEvidenceResult;
    }
  | BlogGroundedResearchFailure;

function subjectFromRequest(
  request: BlogGroundedResearchRequest
): BlogResearchSubject {
  return {
    opportunityId: request.opportunityId,
    topic: request.topic,
    intent: request.intent,
  };
}

/**
 * Pure packet check + single AB-7A evidence validation.
 * Provider identity must match the normalized R0 request.
 */
export function validateBlogGroundedResearchPacket(
  request: BlogGroundedResearchRequest,
  packet: BlogGroundedResearchProviderPacket
): BlogGroundedResearchValidatedResult {
  if (packet.provider !== request.provider) {
    return createBlogGroundedResearchFailure("malformed_provider_output");
  }

  const subject = subjectFromRequest(request);
  const evidence = validateBlogResearchEvidence(
    subject,
    packet.providerOutput,
    packet.grounding
  );

  return {
    ok: true,
    provider: request.provider,
    evidence,
  };
}

/**
 * Exactly one injected provider invocation, then AB-7A when a packet exists.
 * No retry, fallback, timeout, AbortController, or concrete provider imports.
 */
export async function runBlogGroundedResearchValidation(
  request: BlogGroundedResearchRequest,
  providerCall: BlogGroundedResearchInjectedProviderCall,
  options?: { signal?: AbortSignal }
): Promise<BlogGroundedResearchValidatedResult> {
  const subject = subjectFromRequest(request);

  let providerResult:
    | { ok: true; packet: BlogGroundedResearchProviderPacket }
    | BlogGroundedResearchFailure;
  try {
    providerResult = await providerCall(
      subject,
      options?.signal !== undefined ? { signal: options.signal } : undefined
    );
  } catch {
    return createBlogGroundedResearchFailure("provider_upstream");
  }

  if (!providerResult.ok) {
    return providerResult;
  }

  return validateBlogGroundedResearchPacket(request, providerResult.packet);
}
