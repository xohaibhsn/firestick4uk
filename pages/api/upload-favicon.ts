import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import pool from "../../lib/db";
import { requireAdminPermission } from "../../lib/adminAuth";
import { recordMediaAsset } from "../../lib/mediaLibraryServer";
import { recordAdminAudit } from "../../lib/adminAudit";
import {
  FAVICON_IMAGE_FORMATS,
  FAVICON_MAX_RAW_BYTES,
  parseDataUrlImage,
  sanitizeUploadFilename,
} from "../../lib/imageUploadValidation";

export const config = { api: { bodyParser: { sizeLimit: "2mb" } } };

function clientIp(req: NextApiRequest): string | null {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.trim()) return xf.split(",")[0].trim().slice(0, 64);
  return req.socket?.remoteAddress?.slice(0, 64) || null;
}

function hasCloudinary(): boolean {
  return !!(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const admin = await requireAdminPermission(req, res, "settings.manage");
  if (!admin) return;

  try {
    const { file, name } = req.body || {};
    if (!file || !name) return res.status(400).json({ error: "No file provided" });

    const parsed = parseDataUrlImage(file, {
      allowedFormats: FAVICON_IMAGE_FORMATS,
      maxRawBytes: FAVICON_MAX_RAW_BYTES,
      unsupportedMessage: "Unsupported favicon type. Use PNG, JPEG, or ICO.",
      invalidMagicMessage: "File content is not a valid PNG, JPEG, or ICO image",
    });
    if (!parsed.ok) {
      return res.status(400).json({ error: parsed.error });
    }

    const safeName = sanitizeUploadFilename(name, "favicon");
    const stamp = Date.now();

    let publicUrl = "";
    let publicId: string | null = null;
    let provider: "cloudinary" | "local" = "local";
    let format: string = parsed.data.format === "jpeg" ? "jpg" : parsed.data.format;
    let bytes: number = parsed.data.buffer.length;
    let width: number | null = null;
    let height: number | null = null;
    let resourceType: string = "image";

    if (hasCloudinary()) {
      try {
        const cloudinary = (await import("../../lib/cloudinary")).default;
        // Unique public_id so Cloudinary URL changes on each upload (busts CDN/browser cache)
        const result = await cloudinary.uploader.upload(parsed.data.dataUrl, {
          folder: "firestick4uk/favicon",
          public_id: `favicon-${stamp}`,
          overwrite: true,
          invalidate: true,
          transformation: [
            { width: 180, height: 180, crop: "fit", quality: "auto", fetch_format: "png" },
          ],
        });
        publicUrl = `${result.secure_url}?v=${result.version || stamp}`;
        publicId = result.public_id || null;
        provider = "cloudinary";
        format = result.format || "png";
        bytes = result.bytes != null ? Number(result.bytes) : bytes;
        width = result.width != null ? Number(result.width) : null;
        height = result.height != null ? Number(result.height) : null;
        resourceType = result.resource_type || "image";
      } catch (err: unknown) {
        console.error("[upload-favicon] cloudinary upload failed", (err as Error)?.message || err);
        return res.status(500).json({ error: "Favicon upload failed" });
      }
    } else {
      // Local/dev fallback when Cloudinary is not configured (production Hostinger has keys).
      try {
        const dir = path.join(process.cwd(), "public", "uploads", "favicon");
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const ext = format === "jpeg" ? "jpg" : format;
        const filename = `favicon-${stamp}.${ext}`;
        fs.writeFileSync(path.join(dir, filename), parsed.data.buffer);
        publicUrl = `/uploads/favicon/${filename}?v=${stamp}`;
        provider = "local";
      } catch (err: unknown) {
        console.error("[upload-favicon] local write failed", (err as Error)?.message || err);
        return res.status(500).json({ error: "Favicon upload failed" });
      }
    }

    try {
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
    } catch (err: unknown) {
      console.error("[upload-favicon] site_content update failed", (err as Error)?.message || err);
      return res.status(500).json({ error: "Favicon upload failed" });
    }

    const mediaId = await recordMediaAsset({
      url: publicUrl,
      publicId,
      provider,
      purpose: "favicon",
      originalName: safeName,
      mimeType: parsed.data.mime,
      format,
      bytes,
      width,
      height,
      resourceType,
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
        provider,
        format,
        bytes,
      },
      ip: clientIp(req),
    });

    return res.status(200).json({ success: true, url: publicUrl });
  } catch (error: unknown) {
    console.error("[upload-favicon]", (error as Error)?.message || error);
    return res.status(500).json({ error: "Favicon upload failed" });
  }
}
