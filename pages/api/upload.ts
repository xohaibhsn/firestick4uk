import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { requireAdmin } from "../../lib/adminAuth";
import { canUploadPurpose, resolveUploadPurpose } from "../../lib/adminPermissions";
import { recordMediaAsset } from "../../lib/mediaLibraryServer";
import { recordAdminAudit } from "../../lib/adminAudit";
import {
  CMS_IMAGE_FORMATS,
  CMS_MAX_RAW_BYTES,
  parseDataUrlImage,
  sanitizeUploadFilename,
} from "../../lib/imageUploadValidation";

export const config = {
  api: { bodyParser: { sizeLimit: "12mb" } },
};

function clientIp(req: NextApiRequest): string | null {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.trim()) return xf.split(",")[0].trim().slice(0, 64);
  return req.socket?.remoteAddress?.slice(0, 64) || null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    const { file, name, folder } = req.body || {};
    if (!file || !name) return res.status(400).json({ error: "No file provided" });

    const resolved = resolveUploadPurpose(folder);
    if (!resolved) {
      return res.status(403).json({
        error: "Forbidden",
        message: "You do not have permission for this action.",
        detail: "Unapproved upload folder",
      });
    }

    if (!canUploadPurpose(admin.role, resolved.purpose)) {
      return res.status(403).json({
        error: "Forbidden",
        message: "You do not have permission for this action.",
      });
    }

    // Receipts use a dedicated public endpoint — block here for safety.
    if (resolved.purpose === "receipts") {
      return res.status(403).json({
        error: "Forbidden",
        message: "Use the receipt upload endpoint.",
      });
    }

    const parsed = parseDataUrlImage(file, {
      allowedFormats: CMS_IMAGE_FORMATS,
      maxRawBytes: CMS_MAX_RAW_BYTES,
      unsupportedMessage: "Unsupported image type. Use JPEG, PNG, WEBP, or GIF.",
      invalidMagicMessage: "File content is not a valid JPEG, PNG, WEBP, or GIF image",
    });
    if (!parsed.ok) {
      return res.status(400).json({ error: parsed.error });
    }

    const safeName = sanitizeUploadFilename(name);
    const cloudinaryFolder = resolved.folder;
    const isLogo = resolved.purpose === "logo";
    const isWhatsAppIcon = resolved.purpose === "whatsapp";
    const isHeroSlide = resolved.purpose === "hero";
    const isOg = resolved.purpose === "og";
    const preserveImage = isLogo || isWhatsAppIcon || isHeroSlide || isOg;

    let uploadedUrl = "";
    let provider: "cloudinary" | "local" = "local";
    let publicId: string | null = null;
    let format: string | null = parsed.data.format;
    let bytes: number | null = parsed.data.buffer.length;
    let width: number | null = null;
    let height: number | null = null;
    let resourceType: string | null = "image";

    if (
      process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
    ) {
      const cloudinary = (await import("../../lib/cloudinary")).default;
      const uploadOptions: any = { folder: cloudinaryFolder };

      if (isLogo) {
        uploadOptions.transformation = [
          { width: 800, height: 200, crop: "limit" },
          { quality: 90 },
        ];
      } else if (isWhatsAppIcon) {
        uploadOptions.transformation = [
          { width: 512, height: 512, crop: "limit" },
          { quality: 90 },
        ];
      } else if (isOg) {
        uploadOptions.transformation = [
          { width: 1200, height: 630, crop: "limit" },
          { quality: 90 },
        ];
      } else if (isHeroSlide) {
        uploadOptions.transformation = [
          { width: 1920, height: 1080, crop: "limit" },
          { quality: 85, fetch_format: "webp" },
        ];
      } else {
        uploadOptions.transformation = [
          { width: 800, height: 800, crop: "limit" },
          { quality: 85, fetch_format: "webp" },
        ];
      }

      const result = await cloudinary.uploader.upload(parsed.data.dataUrl, uploadOptions);
      uploadedUrl = result.secure_url;
      provider = "cloudinary";
      publicId = result.public_id || null;
      format = result.format || format;
      bytes = result.bytes != null ? Number(result.bytes) : bytes;
      width = result.width != null ? Number(result.width) : null;
      height = result.height != null ? Number(result.height) : null;
      resourceType = result.resource_type || "image";
    } else {
      const localSub = isLogo ? "logo" : isWhatsAppIcon ? "whatsapp" : "";
      const uploadsDir = path.join(process.cwd(), "public", "uploads", localSub);
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

      const stamped = `${Date.now()}-${safeName}`;

      if (!preserveImage) {
        try {
          const sharp = require("sharp");
          const webpName = stamped.replace(/\.[^.]+$/, ".webp");
          await sharp(parsed.data.buffer)
            .resize(800, 800, { fit: "inside", withoutEnlargement: true })
            .webp({ quality: 85 })
            .toFile(path.join(uploadsDir, webpName));
          uploadedUrl = `/uploads/${webpName}`;
          format = "webp";
          bytes = fs.statSync(path.join(uploadsDir, webpName)).size;
        } catch {
          fs.writeFileSync(path.join(uploadsDir, stamped), parsed.data.buffer);
          const sub = localSub ? `${localSub}/` : "";
          uploadedUrl = `/uploads/${sub}${stamped}`;
        }
      } else {
        fs.writeFileSync(path.join(uploadsDir, stamped), parsed.data.buffer);
        const sub = localSub ? `${localSub}/` : "";
        uploadedUrl = `/uploads/${sub}${stamped}`;
      }
      provider = "local";
    }

    const mediaId = await recordMediaAsset({
      url: uploadedUrl,
      publicId,
      provider,
      purpose: resolved.purpose,
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
      summary: `Uploaded ${resolved.purpose} media`,
      metadata: {
        purpose: resolved.purpose,
        provider,
        format,
        bytes,
      },
      ip: clientIp(req),
    });

    return res.status(200).json({ path: uploadedUrl, mediaId });
  } catch (error: unknown) {
    console.error("[upload]", (error as Error)?.message || error);
    return res.status(500).json({ error: "Upload failed" });
  }
}
