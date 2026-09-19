import type { NextApiRequest, NextApiResponse } from "next";
import { getAdminSession, publicAdminIdentity } from "../../lib/adminAuth";

/** Current admin identity from HttpOnly session cookie. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const identity = await getAdminSession(req);
    if (!identity) {
      return res.status(200).json({ authenticated: false });
    }
    return res.status(200).json(publicAdminIdentity(identity));
  } catch (error: any) {
    return res.status(500).json({ authenticated: false, error: error?.message || "Session check failed" });
  }
}
