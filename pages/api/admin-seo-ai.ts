/**
 * Authenticated SEO AI assistance (AI-1A).
 * POST only: explain one verified deterministic SEO issue via exactly one selected provider.
 * No CMS writes. No Issue Memory. No Berlin coupling.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdmin } from "@/lib/adminAuth";
import {
  hasAdminPermission,
  type AdminRoleName,
} from "@/lib/adminPermissions";
import { RL_SEO_AI } from "@/lib/rateLimit";
import { parseExplainIssueRequest } from "@/lib/seoAi";
import {
  dispatchSeoAiExplain,
  getProviderEnvConfig,
  verifyDeterministicIssue,
} from "@/lib/seoAiServer";

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

  // Default same-origin mutation protection (mutate !== false).
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const parsed = parseExplainIssueRequest(req.body);
  if (!parsed.ok) {
    return res.status(400).json({
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

  const role = admin.role as AdminRoleName;
  const canProducts = hasAdminPermission(role, "products.view");
  const canBlog = hasAdminPermission(role, "blog.manage");
  if (!canProducts && !canBlog) {
    return res.status(403).json({
      error: "Forbidden",
      message: "You do not have permission for this action.",
    });
  }

  const verified = await verifyDeterministicIssue(parsed.request.issueId);
  if (!verified.ok) {
    return res.status(verified.status).json({
      ok: false,
      code: verified.code,
      message: verified.message,
    });
  }

  if (verified.entityType === "product" && !canProducts) {
    return res.status(403).json({
      error: "Forbidden",
      message: "You do not have permission for this action.",
    });
  }
  if (verified.entityType === "blog" && !canBlog) {
    return res.status(403).json({
      error: "Forbidden",
      message: "You do not have permission for this action.",
    });
  }

  const cfg = getProviderEnvConfig(parsed.request.provider);
  if (!cfg.configured) {
    return res.status(503).json({
      ok: false,
      code: "provider_not_configured",
      message: "Selected AI provider is not configured.",
    });
  }

  const result = await dispatchSeoAiExplain(
    parsed.request.provider,
    verified.context
  );
  if (!result.ok) {
    return res.status(result.status).json({
      ok: false,
      code: result.code,
      message: result.message,
    });
  }

  return res.status(200).json({
    ok: true,
    provider: parsed.request.provider,
    task: "explain_issue",
    issueId: parsed.request.issueId,
    explanation: result.explanation,
  });
}
