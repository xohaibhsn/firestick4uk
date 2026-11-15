import type { NextApiRequest, NextApiResponse } from "next";
import {
  assertSameOriginMutation,
  clearAdminSessionCookie,
  destroyAdminSessionByToken,
  getAdminSession,
  getRequestMeta,
  readAdminSessionToken,
} from "../../lib/adminAuth";
import { recordAdminAudit } from "../../lib/adminAudit";
import { setAdminNoStore } from "../../lib/adminNoStore";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setAdminNoStore(res);

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!assertSameOriginMutation(req)) {
    return res.status(403).json({ error: "Forbidden: invalid origin" });
  }

  try {
    const identity = await getAdminSession(req);
    const token = readAdminSessionToken(req);
    if (token) {
      await destroyAdminSessionByToken(token);
    }
    clearAdminSessionCookie(res, req);

    if (identity) {
      const { ip } = getRequestMeta(req);
      await recordAdminAudit({
        actor: identity,
        action: "auth.logout",
        entityType: "session",
        entityId: identity.staffId ?? null,
        summary: "Admin signed out",
        ip,
      });
    }

    return res.status(200).json({ success: true });
  } catch {
    console.error("[admin-logout] cleanup failed");
    clearAdminSessionCookie(res, req);
    return res.status(200).json({ success: true });
  }
}
