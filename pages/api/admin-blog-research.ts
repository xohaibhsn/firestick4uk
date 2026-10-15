/**
 * AB-7B R3 — Dedicated authenticated grounded Blog research route.
 *
 * POST only. blog.manage via requireAdminPermission. Shares RL_SEO_AI.
 * Initial canary: route-local super_admin-only after blog.manage (global RBAC unchanged).
 * Does not import seoAi / seoAiServer. No CMS/DB writes. No UI.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminPermission } from "@/lib/adminAuth";
import { mintBlogArticleEvidenceHandle } from "@/lib/blogArticleEvidenceBridge.server";
import {
  BLOG_GROUNDED_RESEARCH_TASK,
  createBlogGroundedResearchFailure,
  parseBlogGroundedResearchRequest,
} from "@/lib/blogGroundedResearchContracts";
import { runBlogGroundedResearchRuntime } from "@/lib/blogGroundedResearchRuntime.server";
import { RL_SEO_AI } from "@/lib/rateLimit";

function responseWritable(res: NextApiResponse): boolean {
  return !res.writableEnded && !(res as { destroyed?: boolean }).destroyed;
}

function safeJson(
  res: NextApiResponse,
  status: number,
  body: Record<string, unknown>
): void {
  if (!responseWritable(res)) return;
  res.status(status).json(body);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      code: "invalid_request",
      message: "Method not allowed",
    });
  }

  const admin = await requireAdminPermission(req, res, "blog.manage");
  if (!admin) return;

  // Temporary AB-7B canary: only super_admin may invoke grounded research.
  // Keeps blog.manage for managers/writers elsewhere; do not widen global RBAC.
  if (admin.role !== "super_admin") {
    return res.status(403).json({
      error: "Forbidden",
      message: "You do not have permission for this action.",
    });
  }

  const parsed = parseBlogGroundedResearchRequest(req.body);
  if (!parsed.ok) {
    return res.status(parsed.status).json({
      ok: false,
      code: parsed.code,
      message: parsed.message,
    });
  }

  const rl = RL_SEO_AI(admin.sessionId);
  if (!rl.allowed) {
    res.setHeader("Retry-After", String(rl.retryAfterSec));
    return res.status(429).json({
      ok: false,
      code: "rate_limited",
      message: "Too many AI requests. Please try again shortly.",
    });
  }

  // Request-scoped cancellation only after auth + parse + rate-limit success.
  const controller = new AbortController();
  let settled = false;

  const abortFromClient = () => {
    if (!controller.signal.aborted) {
      controller.abort();
    }
  };

  const onReqAborted = () => {
    abortFromClient();
  };

  const onResClose = () => {
    // Ignore normal completion close; abort only if still unsettled.
    if (!settled) {
      abortFromClient();
    }
  };

  // Attach first so post-registration disconnects are observed, then reconcile
  // any disconnect that already happened before listeners existed (no replay).
  req.on("aborted", onReqAborted);
  res.on("close", onResClose);

  if (req.aborted === true || (res as { destroyed?: boolean }).destroyed === true) {
    abortFromClient();
  }

  try {
    if (controller.signal.aborted) {
      settled = true;
      const failure = createBlogGroundedResearchFailure("request_aborted");
      safeJson(res, failure.status, {
        ok: false,
        code: failure.code,
        message: failure.message,
      });
      return;
    }

    // AB-8C1: optional opaque handle for authentic READY packets only.
    // Mint failures never fabricate a handle and never fail the research response.
    let evidenceHandle: string | undefined;

    const result = await runBlogGroundedResearchRuntime(parsed.value, {
      signal: controller.signal,
      deps: {
        onTrustedReadyEvidence: ({ packet, evidence }) => {
          if (controller.signal.aborted) return;
          if (evidence.evidenceState !== "ready" || evidence.ok !== true) return;
          const minted = mintBlogArticleEvidenceHandle({
            admin,
            subject: evidence.subject,
            provider: "openai",
            packet,
            evidence,
            signal: controller.signal,
          });
          if (minted.ok) {
            evidenceHandle = minted.handle;
          }
        },
      },
    });
    settled = true;

    if (!result.ok) {
      safeJson(res, result.status, {
        ok: false,
        code: result.code,
        message: result.message,
      });
      return;
    }

    const body: Record<string, unknown> = {
      ok: true,
      provider: result.provider,
      task: BLOG_GROUNDED_RESEARCH_TASK,
      evidence: result.evidence,
    };
    if (
      evidenceHandle &&
      result.evidence &&
      result.evidence.ok === true &&
      result.evidence.evidenceState === "ready"
    ) {
      body.evidenceHandle = evidenceHandle;
    }
    safeJson(res, 200, body);
  } catch {
    settled = true;
    const failure = createBlogGroundedResearchFailure("provider_upstream");
    safeJson(res, failure.status, {
      ok: false,
      code: failure.code,
      message: failure.message,
    });
  } finally {
    req.removeListener("aborted", onReqAborted);
    res.removeListener("close", onResClose);
  }
}
