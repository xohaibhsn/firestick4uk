import type { NextApiRequest, NextApiResponse } from "next";

/**
 * Temporary ERP retirement tombstone (ERP-R2B).
 * Inert 410 for any leftover Hostinger cron / old /api/erp/* callers.
 * Remove in ERP-R2C after Hostinger cron verification.
 */
export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.status(410).json({ error: "ERP retired" });
}
