/**
 * AB-7B R3 — Dedicated authenticated grounded Blog research route.
 *
 * POST only. blog.manage via requireAdminPermission. Shares RL_SEO_AI.
 * Does not import seoAi / seoAiServer. No CMS/DB writes. No UI.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminPermission } from "@/lib/adminAuth";
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

  req.on("aborted", onReqAborted);
  res.on("close", onResClose);

  try {
    const result = await runBlogGroundedResearchRuntime(parsed.value, {
      signal: controller.signal,
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

    safeJson(res, 200, {
      ok: true,
      provider: result.provider,
      task: BLOG_GROUNDED_RESEARCH_TASK,
      evidence: result.evidence,
    });
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
