import type { NextApiRequest, NextApiResponse } from "next";
import pool from "../../lib/db";
import { requireAdminPermission } from "../../lib/adminAuth";
import {
  MEDIA_LIBRARY_PURPOSES,
  canViewMediaPurpose,
  isMediaLibraryPurpose,
  mediaPurposesForRole,
} from "../../lib/mediaLibrary";

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

/** Authenticated CMS Media Library listing — role-filtered server-side. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const admin = await requireAdminPermission(req, res, "media.view", { mutate: false });
  if (!admin) return;

  try {
    const allowed = mediaPurposesForRole(admin.role);
    const page = clampInt(req.query.page, 1, 100000, 1);
    const limit = clampInt(req.query.limit, 12, 60, 24);
    const offset = (page - 1) * limit;
    const q = String(req.query.q || "").trim().slice(0, 180);
    const purposeRaw = String(req.query.purpose || "").trim();
    const providerRaw = String(req.query.provider || "").trim().toLowerCase();

    if (purposeRaw) {
      if (!isMediaLibraryPurpose(purposeRaw)) {
        return res.status(400).json({ error: "Invalid purpose", message: "Unapproved media purpose." });
      }
      if (!canViewMediaPurpose(admin.role, purposeRaw)) {
        return res.status(403).json({
          error: "Forbidden",
          message: "You do not have permission for this action.",
        });
      }
    }

    if (providerRaw && !["cloudinary", "local", "external"].includes(providerRaw)) {
      return res.status(400).json({ error: "Invalid provider" });
    }

    const purposes = purposeRaw ? [purposeRaw] : allowed;
    if (!purposes.length) {
      return res.status(200).json({
        items: [],
        pagination: { page, limit, total: 0, totalPages: 1 },
      });
    }

    const where: string[] = [`purpose IN (${purposes.map(() => "?").join(",")})`];
    const params: any[] = [...purposes];

    if (providerRaw) {
      where.push("provider = ?");
      params.push(providerRaw);
    }

    if (q) {
      where.push("(original_name LIKE ? OR url LIKE ? OR IFNULL(public_id,'') LIKE ?)");
      const like = `%${q}%`;
      params.push(like, like, like);
    }

    const whereSql = `WHERE ${where.join(" AND ")}`;

    const [countRows]: any = await pool.query(
      `SELECT COUNT(*) AS total FROM media_assets ${whereSql}`,
      params
    );
    const total = Number(countRows?.[0]?.total || 0);
    const totalPages = Math.max(1, Math.ceil(total / limit));

    const [rows]: any = await pool.query(
      `SELECT id, url, public_id, provider, purpose, original_name, mime_type, format,
              bytes, width, height, resource_type, source,
              uploaded_by_type, uploaded_by_staff_id, uploaded_by_name, created_at
       FROM media_assets
       ${whereSql}
       ORDER BY created_at DESC, id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return res.status(200).json({
      items: Array.isArray(rows) ? rows : [],
      pagination: { page, limit, total, totalPages },
      meta: {
        allowedPurposes: allowed,
        allPurposes: MEDIA_LIBRARY_PURPOSES,
      },
    });
  } catch (err: any) {
    console.error("[admin-media]", err?.message || err);
    return res.status(500).json({ error: "Failed to load media library" });
  }
}
