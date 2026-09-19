import type { NextApiRequest, NextApiResponse } from "next";
import {
  clearAdminSessionCookie,
  destroyAdminSessionByToken,
  readAdminSessionToken,
} from "../../lib/adminAuth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const token = readAdminSessionToken(req);
    if (token) {
      await destroyAdminSessionByToken(token);
    }
    clearAdminSessionCookie(res, req);
    return res.status(200).json({ success: true });
  } catch (error: any) {
    clearAdminSessionCookie(res, req);
    return res.status(200).json({ success: true, warning: error?.message || "logout_partial" });
  }
}
