/**
 * AB-7B R3 — Isolated grounded-research runtime (server-only).
 *
 * OpenAI-only. Resolves existing OPENAI_* env names, enforces max-one-in-flight
 * per Node process, dynamically loads ONLY the OpenAI R1 adapter, and
 * delegates to R2 validation. No route/auth/rate-limit/DB/CMS/timer/AbortController.
 *
 * Concurrency is process-local (one boolean slot). Not account-global.
 */

import {
  createBlogGroundedResearchFailure,
  type BlogGroundedResearchFailure,
  type BlogGroundedResearchProviderPacket,
  type BlogGroundedResearchRequest,
} from "@/lib/blogGroundedResearchContracts";
import {
  runBlogGroundedResearchValidation,
  type BlogGroundedResearchValidatedResult,
} from "@/lib/blogGroundedResearchValidation.server";
import type { BlogResearchSubject } from "@/lib/blogResearchEvidence";

type ProviderConfig = { apiKey: string; model: string };

type ProviderAdapterFn = (
  subject: BlogResearchSubject,
  config: ProviderConfig,
  options?: { signal?: AbortSignal }
) => Promise<
  | { ok: true; packet: BlogGroundedResearchProviderPacket }
  | BlogGroundedResearchFailure
>;

type OpenAiAdapterModule = {
  callOpenAiGroundedResearch: ProviderAdapterFn;
};

export type BlogGroundedResearchRuntimeDeps = {
  /** Test seam: plain env map. Production defaults to process.env. */
  env?: Record<string, string | undefined>;
  loadOpenAiAdapter?: () => Promise<OpenAiAdapterModule>;
};

/** Per Node process — max one grounded-research invocation in flight. */
let researchInFlight = false;

function readEnv(
  env: Record<string, string | undefined>,
  key: string
): string {
  const raw = env[key];
  return typeof raw === "string" ? raw.trim() : "";
}

function resolveOpenAiConfig(
  env: Record<string, string | undefined>
): ProviderConfig | null {
  const apiKey = readEnv(env, "OPENAI_API_KEY");
  const model = readEnv(env, "OPENAI_SEO_MODEL");
  if (!apiKey || !model) return null;
  return { apiKey, model };
}

async function defaultLoadOpenAiAdapter(): Promise<OpenAiAdapterModule> {
  return import("@/lib/blogGroundedResearchOpenAi.server");
}

/**
 * Execute one grounded-research request through the OpenAI adapter and
 * R2/AB-7A validation. Never selects a fallback provider.
 */
export async function runBlogGroundedResearchRuntime(
  request: BlogGroundedResearchRequest,
  options?: {
    signal?: AbortSignal;
    deps?: BlogGroundedResearchRuntimeDeps;
  }
): Promise<BlogGroundedResearchValidatedResult> {
  if (researchInFlight) {
    return createBlogGroundedResearchFailure("research_busy");
  }

  researchInFlight = true;
  try {
    const deps = options?.deps;
    const env = deps?.env ?? (process.env as Record<string, string | undefined>);
    const config = resolveOpenAiConfig(env);
    if (!config) {
      return createBlogGroundedResearchFailure("provider_not_configured");
    }

    const signal = options?.signal;
    const callOptions =
      signal !== undefined ? { signal } : undefined;

    let providerCall: (
      subject: BlogResearchSubject,
      callOpts?: { signal?: AbortSignal }
    ) => Promise<
      | { ok: true; packet: BlogGroundedResearchProviderPacket }
      | BlogGroundedResearchFailure
    >;

    try {
      const load = deps?.loadOpenAiAdapter ?? defaultLoadOpenAiAdapter;
      const mod = await load();
      providerCall = (subject, callOpts) =>
        mod.callOpenAiGroundedResearch(subject, config, callOpts);
    } catch {
      return createBlogGroundedResearchFailure("provider_upstream");
    }

    return await runBlogGroundedResearchValidation(
      request,
      providerCall,
      callOptions
    );
  } catch {
    return createBlogGroundedResearchFailure("provider_upstream");
  } finally {
    researchInFlight = false;
  }
}
