import type { NextApiRequest, NextApiResponse } from "next";
import pool from "../../lib/db";
import cloudinary from "../../lib/cloudinary";
import { requireAdminPermission } from "../../lib/adminAuth";
import { recordMediaAsset } from "../../lib/mediaLibraryServer";
import { recordAdminAudit } from "../../lib/adminAudit";

export const config = { api: { bodyParser: { sizeLimit: "2mb" } } };

function clientIp(req: NextApiRequest): string | null {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.trim()) return xf.split(",")[0].trim().slice(0, 64);
  return req.socket?.remoteAddress?.slice(0, 64) || null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const admin = await requireAdminPermission(req, res, "settings.manage");
  if (!admin) return;
  try {
    const { file, name } = req.body;
    if (!file || !name) return res.status(400).json({ error: "No file provided" });

    const ext = (name as string).toLowerCase().split(".").pop();
    if (!["ico", "png", "jpg", "jpeg", "svg"].includes(ext || "")) {
      return res.status(400).json({ error: "Invalid file type. Use .ico, .png, .jpg, or .svg" });
    }

    // Unique public_id so Cloudinary URL changes on each upload (busts CDN/browser cache)
    const stamp = Date.now();
    const result = await cloudinary.uploader.upload(file, {
      folder: "firestick4uk/favicon",
      public_id: `favicon-${stamp}`,
      overwrite: true,
      invalidate: true,
      transformation: [
        { width: 180, height: 180, crop: "fit", quality: "auto", fetch_format: "png" },
      ],
    });

    const publicUrl = `${result.secure_url}?v=${result.version || stamp}`;

    await pool.query(
      `INSERT INTO site_content (content_key, content_value, content_type, page_name, label)
       VALUES ('favicon_url', ?, 'image', 'settings', 'Favicon URL')
       ON DUPLICATE KEY UPDATE
         content_value = VALUES(content_value),
         content_type = 'image',
         page_name = 'settings',
         label = 'Favicon URL'`,
      [publicUrl]
    );

    const mediaId = await recordMediaAsset({
      url: publicUrl,
      publicId: result.public_id || null,
      provider: "cloudinary",
      purpose: "favicon",
      originalName: String(name).slice(0, 255),
      format: result.format || "png",
      bytes: result.bytes != null ? Number(result.bytes) : null,
      width: result.width != null ? Number(result.width) : null,
      height: result.height != null ? Number(result.height) : null,
      resourceType: result.resource_type || "image",
      source: "upload",
      actor: admin,
    });

    await recordAdminAudit({
      actor: admin,
      action: "media.uploaded",
      entityType: "media",
      entityId: mediaId,
      summary: "Uploaded favicon",
      metadata: {
        purpose: "favicon",
        provider: "cloudinary",
        format: result.format || "png",
        bytes: result.bytes != null ? Number(result.bytes) : null,
      },
      ip: clientIp(req),
    });

    return res.status(200).json({ success: true, url: publicUrl });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
