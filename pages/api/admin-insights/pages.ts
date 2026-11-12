/**
 * Retired (F4UK-INSIGHTS-SLIM-67): the pages screen was removed.
 * Always 410 Gone; no data access.
 */
import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  res.status(410).json({ error: "gone" });
}