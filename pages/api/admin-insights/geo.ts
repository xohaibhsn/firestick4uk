/**
 * Retired (F4UK-INSIGHTS-SLIM-67): geo collection/UI removed.
 * MULTI-93: return an empty result gracefully (no DB access, no 500).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { setAdminNoStore } from "@/lib/adminNoStore";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  setAdminNoStore(res);
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  return res.status(200).json({ rows: [], items: [], data: [] });
}
