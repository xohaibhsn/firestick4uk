/**
 * Retired (F4UK-INSIGHTS-SLIM-67): the sources screen was removed.
 * Always 410 Gone; no data access.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { setAdminNoStore } from "@/lib/adminNoStore";

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  setAdminNoStore(res);
  res.status(410).json({ error: "gone" });
}