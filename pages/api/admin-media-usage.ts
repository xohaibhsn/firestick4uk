import type { NextApiRequest, NextApiResponse } from "next";
import pool from "../../lib/db";
import { requireAdminPermission } from "../../lib/adminAuth";
import { canViewMediaPurpose } from "../../lib/mediaLibrary";
import { findMediaUsageByUrl } from "../../lib/mediaUsage";

function parseAssetId(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || Math.floor(n) !== n) return null;
  return n;
}

/** Read-only Media Library usage lookup — lazy, per-asset. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const admin = await requireAdminPermission(req, res, "media.view", { mutate: false });
  if (!admin) return;

  const id = parseAssetId(req.query.id);
  if (!id) {
    return res.status(400).json({ error: "Invalid id", message: "A valid media asset id is required." });
  }

  try {
    const [rows]: any = await pool.query(
      `SELECT id, url, purpose, original_name, provider, width, height, bytes, created_at
       FROM media_assets
       WHERE id = ?
       LIMIT 1`,
      [id]
    );
    const asset = Array.isArray(rows) && rows[0] ? rows[0] : null;
    if (!asset) {
      return res.status(404).json({ error: "Not found", message: "Media asset not found." });
    }

    const purpose = String(asset.purpose || "");
    if (!canViewMediaPurpose(admin.role, purpose)) {
      return res.status(403).json({
        error: "Forbidden",
        message: "You do not have permission for this action.",
      });
    }

    const url = String(asset.url || "").trim();
    const { usage, summary } = await findMediaUsageByUrl(url);

    return res.status(200).json({
      asset: {
        id: Number(asset.id),
        url,
        purpose,
        original_name: asset.original_name != null ? String(asset.original_name) : null,
        provider: asset.provider != null ? String(asset.provider) : null,
        width: asset.width != null ? Number(asset.width) : null,
        height: asset.height != null ? Number(asset.height) : null,
        bytes: asset.bytes != null ? Number(asset.bytes) : null,
        created_at: asset.created_at ?? null,
      },
      usage,
      summary,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[admin-media-usage]", message);
    return res.status(500).json({ error: "Usage lookup failed" });
  }
}
