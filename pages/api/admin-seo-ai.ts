/**
 * Authenticated SEO AI assistance (AI-1A explain, AI-1B draft metadata).
 * POST only: explain one verified deterministic SEO issue or draft metadata suggestions
 * via exactly one selected provider.
 * No CMS writes. No Issue Memory. No Berlin coupling.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdmin } from "@/lib/adminAuth";
import {
  hasAdminPermission,
  type AdminRoleName,
} from "@/lib/adminPermissions";
import { RL_SEO_AI } from "@/lib/rateLimit";
import { parseSeoAiRequest } from "@/lib/seoAi";
import {
  buildMetadataDraftContext,
  dispatchSeoAiDraft,
  dispatchSeoAiExplain,
  getProviderEnvConfig,
  loadBlogDraftRow,
  loadProductDraftRow,
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

  const parsed = parseSeoAiRequest(req.body);
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

  if (parsed.request.task === "explain_issue") {
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

  const { entityType, entityId, provider, unsaved } = parsed.request;

  if (entityType === "product") {
    if (!hasAdminPermission(role, "products.manage")) {
      return res.status(403).json({
        error: "Forbidden",
        message: "You do not have permission for this action.",
      });
    }
  } else if (!hasAdminPermission(role, "blog.manage")) {
    return res.status(403).json({
      error: "Forbidden",
      message: "You do not have permission for this action.",
    });
  }

  const row =
    entityType === "product"
      ? await loadProductDraftRow(entityId)
      : await loadBlogDraftRow(entityId);
  if (!row) {
    return res.status(404).json({
      ok: false,
      code: "entity_not_found",
      message: "Entity not found.",
    });
  }

  const context = buildMetadataDraftContext(entityType, row, unsaved || {});

  const cfg = getProviderEnvConfig(provider);
  if (!cfg.configured) {
    return res.status(503).json({
      ok: false,
      code: "provider_not_configured",
      message: "Selected AI provider is not configured.",
    });
  }

  const result = await dispatchSeoAiDraft(provider, context);
  if (!result.ok) {
    return res.status(result.status).json({
      ok: false,
      code: result.code,
      message: result.message,
    });
  }

  return res.status(200).json({
    ok: true,
    provider,
    task: "draft_metadata",
    entityType,
    entityId,
    result: result.draft,
  });
}
