/**
 * Server-only SEO AI: issue verification, provider adapters, dispatch.
 * SELECT-only DB access. No CMS/Issue Memory/Berlin writes.
 */

import OpenAI from "openai";
import pool from "@/lib/db";
import { diagnoseBlog, diagnoseProduct } from "@/lib/seoDiagnostics";
import {
  normalizeBlogDiagnosticRow,
  normalizeProductDiagnosticRow,
  type BlogDbRow,
  type ProductDbRow,
} from "@/lib/seoDiagnosticRows";
import {
  SEO_AI_EXPLANATION_JSON_SCHEMA,
  SEO_AI_PROVIDER_TIMEOUT_MS,
  buildSeoAiSystemInstruction,
  buildSeoAiUserPrompt,
  buildVerifiedIssueContext,
  parseExplanationJsonText,
  parseIssueId,
  type SeoAiExplanation,
  type SeoAiProvider,
  type SeoAiPublicErrorCode,
  type SeoAiVerifiedIssueContext,
} from "@/lib/seoAi";

export type SeoAiFailure = {
  ok: false;
  status: number;
  code: SeoAiPublicErrorCode;
  message: string;
};

export type SeoAiExplainSuccess = {
  ok: true;
  provider: SeoAiProvider;
  task: "explain_issue";
  issueId: string;
  explanation: SeoAiExplanation;
};

export type LoadProductRowFn = (
  entityId: string
) => Promise<ProductDbRow | null>;
export type LoadBlogRowFn = (entityId: string) => Promise<BlogDbRow | null>;

export type ProviderCallFn = (
  context: SeoAiVerifiedIssueContext
) => Promise<
  | { ok: true; explanation: SeoAiExplanation }
  | SeoAiFailure
>;

const GEMINI_INTERACTIONS_URL =
  "https://generativelanguage.googleapis.com/v1beta/interactions";

function fail(
  status: number,
  code: SeoAiPublicErrorCode,
  message: string
): SeoAiFailure {
  return { ok: false, status, code, message };
}

export function getProviderEnvConfig(provider: SeoAiProvider): {
  configured: boolean;
  apiKey: string;
  model: string;
} {
  if (provider === "openai") {
    const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
    const model = String(process.env.OPENAI_SEO_MODEL || "").trim();
    return { configured: !!(apiKey && model), apiKey, model };
  }
  const apiKey = String(process.env.GEMINI_API_KEY || "").trim();
  const model = String(process.env.GEMINI_SEO_MODEL || "").trim();
  return { configured: !!(apiKey && model), apiKey, model };
}

export async function defaultLoadProductRow(
  entityId: string
): Promise<ProductDbRow | null> {
  const id = Number(entityId);
  if (!Number.isFinite(id) || id <= 0) return null;
  const [rows]: any = await pool.query(
    `SELECT id, name, slug, active, seo_title, meta_description, focus_keyword,
            image, og_image, short_description, description, full_description
     FROM products
     WHERE id = ?
     LIMIT 1`,
    [id]
  );
  const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
  return row as ProductDbRow | null;
}

export async function defaultLoadBlogRow(
  entityId: string
): Promise<BlogDbRow | null> {
  const id = Number(entityId);
  if (!Number.isFinite(id) || id <= 0) return null;
  const [rows]: any = await pool.query(
    `SELECT id, title, slug, status, active, meta_title, meta_description,
            focus_keyword, canonical_url, featured_image, excerpt, content
     FROM blog_posts
     WHERE id = ?
     LIMIT 1`,
    [id]
  );
  const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
  return row as BlogDbRow | null;
}

/**
 * Load the entity, recompute deterministic diagnostics, match issueId.
 * No provider call. No Issue Memory lookup.
 */
export async function verifyDeterministicIssue(
  issueId: string,
  deps?: {
    loadProduct?: LoadProductRowFn;
    loadBlog?: LoadBlogRowFn;
  }
): Promise<
  | {
      ok: true;
      entityType: "product" | "blog";
      context: SeoAiVerifiedIssueContext;
    }
  | SeoAiFailure
> {
  const parsed = parseIssueId(issueId);
  if (!parsed) {
    return fail(400, "invalid_request", "issueId format is invalid.");
  }

  const loadProduct = deps?.loadProduct || defaultLoadProductRow;
  const loadBlog = deps?.loadBlog || defaultLoadBlogRow;

  if (parsed.entityType === "product") {
    const row = await loadProduct(parsed.entityId);
    if (!row) {
      return fail(
        400,
        "issue_not_found",
        "This deterministic SEO issue is no longer currently detected."
      );
    }
    const normalized = normalizeProductDiagnosticRow(row);
    const issues = diagnoseProduct(normalized);
    const issue = issues.find((i) => i.id === issueId);
    if (!issue) {
      return fail(
        400,
        "issue_not_found",
        "This deterministic SEO issue is no longer currently detected."
      );
    }
    return {
      ok: true,
      entityType: "product",
      context: buildVerifiedIssueContext({
        issue,
        entityFacts: {
          slug: normalized.slug,
          effectiveTitle: normalized.title,
          effectiveDescription: normalized.description,
          focusKeyword: normalized.focus_keyword || undefined,
        },
      }),
    };
  }

  const row = await loadBlog(parsed.entityId);
  if (!row) {
    return fail(
      400,
      "issue_not_found",
      "This deterministic SEO issue is no longer currently detected."
    );
  }
  const normalized = normalizeBlogDiagnosticRow(row);
  const issues = diagnoseBlog(normalized);
  const issue = issues.find((i) => i.id === issueId);
  if (!issue) {
    return fail(
      400,
      "issue_not_found",
      "This deterministic SEO issue is no longer currently detected."
    );
  }
  return {
    ok: true,
    entityType: "blog",
    context: buildVerifiedIssueContext({
      issue,
      entityFacts: {
        slug: normalized.slug,
        effectiveTitle: normalized.effectiveTitle,
        effectiveDescription: normalized.effectiveDescription,
        focusKeyword: normalized.focus_keyword || undefined,
      },
    }),
  };
}

function mapAbortOrTimeout(err: unknown, label: string): SeoAiFailure {
  const name =
    err && typeof err === "object" && "name" in err
      ? String((err as { name?: unknown }).name || "")
      : "";
  const msg =
    err && typeof err === "object" && "message" in err
      ? String((err as { message?: unknown }).message || "")
      : "";
  if (
    name === "AbortError" ||
    /timeout|timed out|aborted/i.test(name) ||
    /timeout|timed out|aborted/i.test(msg)
  ) {
    console.error(`[seo-ai] ${label} timeout`);
    return fail(
      503,
      "provider_timeout",
      "The selected AI provider timed out. Please try again shortly."
    );
  }
  console.error(`[seo-ai] ${label} upstream failed`);
  return fail(
    503,
    "provider_upstream",
    "The selected AI provider is temporarily unavailable."
  );
}

export async function callOpenAiExplain(
  context: SeoAiVerifiedIssueContext
): Promise<{ ok: true; explanation: SeoAiExplanation } | SeoAiFailure> {
  const cfg = getProviderEnvConfig("openai");
  if (!cfg.configured) {
    return fail(
      503,
      "provider_not_configured",
      "Selected AI provider is not configured."
    );
  }

  const client = new OpenAI({
    apiKey: cfg.apiKey,
    maxRetries: 0,
    timeout: SEO_AI_PROVIDER_TIMEOUT_MS,
  });

  try {
    const response = await client.responses.create({
      model: cfg.model,
      store: false,
      instructions: buildSeoAiSystemInstruction(),
      input: buildSeoAiUserPrompt(context),
      text: {
        format: {
          type: "json_schema",
          name: "seo_ai_explanation",
          strict: true,
          schema: SEO_AI_EXPLANATION_JSON_SCHEMA as unknown as {
            [key: string]: unknown;
          },
        },
      },
    });

    const text =
      typeof response.output_text === "string" ? response.output_text : "";
    const parsed = parseExplanationJsonText(text);
    if (!parsed.ok) {
      console.error("[seo-ai] openai malformed output");
      return fail(
        502,
        "malformed_provider_output",
        "The AI provider returned an unusable explanation."
      );
    }
    return { ok: true, explanation: parsed.explanation };
  } catch (err) {
    const status =
      err && typeof err === "object" && "status" in err
        ? Number((err as { status?: unknown }).status)
        : NaN;
    if (Number.isFinite(status) && status > 0) {
      console.error(`[seo-ai] openai upstream failed: status ${status}`);
      if (status === 408 || status === 504) {
        return fail(
          503,
          "provider_timeout",
          "The selected AI provider timed out. Please try again shortly."
        );
      }
      return fail(
        503,
        "provider_upstream",
        "The selected AI provider is temporarily unavailable."
      );
    }
    return mapAbortOrTimeout(err, "openai");
  }
}

function extractGeminiInteractionText(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const root = body as Record<string, unknown>;
  const steps = root.steps;
  if (Array.isArray(steps)) {
    const parts: string[] = [];
    for (const step of steps) {
      if (!step || typeof step !== "object") continue;
      const s = step as Record<string, unknown>;
      if (s.type !== "model_output") continue;
      const content = s.content;
      if (!Array.isArray(content)) continue;
      for (const part of content) {
        if (!part || typeof part !== "object") continue;
        const p = part as Record<string, unknown>;
        if (p.type === "text" && typeof p.text === "string") {
          parts.push(p.text);
        }
      }
    }
    return parts.join("\n").trim();
  }
  return "";
}

export async function callGeminiExplain(
  context: SeoAiVerifiedIssueContext
): Promise<{ ok: true; explanation: SeoAiExplanation } | SeoAiFailure> {
  const cfg = getProviderEnvConfig("gemini");
  if (!cfg.configured) {
    return fail(
      503,
      "provider_not_configured",
      "Selected AI provider is not configured."
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    SEO_AI_PROVIDER_TIMEOUT_MS
  );

  try {
    const res = await fetch(GEMINI_INTERACTIONS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": cfg.apiKey,
        "Api-Revision": "2026-05-20",
      },
      body: JSON.stringify({
        model: cfg.model,
        input: buildSeoAiUserPrompt(context),
        system_instruction: buildSeoAiSystemInstruction(),
        store: false,
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: SEO_AI_EXPLANATION_JSON_SCHEMA,
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.error(`[seo-ai] gemini upstream failed: status ${res.status}`);
      if (res.status === 408 || res.status === 504) {
        return fail(
          503,
          "provider_timeout",
          "The selected AI provider timed out. Please try again shortly."
        );
      }
      return fail(
        503,
        "provider_upstream",
        "The selected AI provider is temporarily unavailable."
      );
    }

    const body = await res.json().catch(() => null);
    const text = extractGeminiInteractionText(body);
    const parsed = parseExplanationJsonText(text);
    if (!parsed.ok) {
      console.error("[seo-ai] gemini malformed output");
      return fail(
        502,
        "malformed_provider_output",
        "The AI provider returned an unusable explanation."
      );
    }
    return { ok: true, explanation: parsed.explanation };
  } catch (err) {
    return mapAbortOrTimeout(err, "gemini");
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Exactly one provider call. No fallback. No retry. No dual call.
 */
export async function dispatchSeoAiExplain(
  provider: SeoAiProvider,
  context: SeoAiVerifiedIssueContext,
  deps?: {
    callOpenAI?: ProviderCallFn;
    callGemini?: ProviderCallFn;
  }
): Promise<{ ok: true; explanation: SeoAiExplanation } | SeoAiFailure> {
  if (provider === "openai") {
    const call = deps?.callOpenAI || callOpenAiExplain;
    return call(context);
  }
  if (provider === "gemini") {
    const call = deps?.callGemini || callGeminiExplain;
    return call(context);
  }
  return fail(400, "invalid_request", "provider must be gemini or openai.");
}

export async function explainDeterministicIssue(input: {
  provider: SeoAiProvider;
  issueId: string;
  deps?: {
    loadProduct?: LoadProductRowFn;
    loadBlog?: LoadBlogRowFn;
    callOpenAI?: ProviderCallFn;
    callGemini?: ProviderCallFn;
  };
}): Promise<
  | (SeoAiExplainSuccess & { entityType: "product" | "blog" })
  | SeoAiFailure
> {
  // Verify first — no provider call when the issue is gone.
  const verified = await verifyDeterministicIssue(input.issueId, {
    loadProduct: input.deps?.loadProduct,
    loadBlog: input.deps?.loadBlog,
  });
  if (!verified.ok) return verified;

  const cfg = getProviderEnvConfig(input.provider);
  if (!cfg.configured) {
    return fail(
      503,
      "provider_not_configured",
      "Selected AI provider is not configured."
    );
  }

  const result = await dispatchSeoAiExplain(
    input.provider,
    verified.context,
    {
      callOpenAI: input.deps?.callOpenAI,
      callGemini: input.deps?.callGemini,
    }
  );
  if (!result.ok) return result;

  return {
    ok: true,
    provider: input.provider,
    task: "explain_issue",
    issueId: input.issueId,
    entityType: verified.entityType,
    explanation: result.explanation,
  };
}
