import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";
import { getClientIp, rateLimit } from "../../lib/rateLimit";

export const config = {
  api: { bodyParser: { sizeLimit: "8mb" } },
};

const RECEIPT_FOLDER = "firestick4uk/receipts";
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

function sanitizeFilename(name: unknown): string {
  const base = path.basename(String(name || "receipt")).replace(/[^a-zA-Z0-9._-]/g, "_");
  return base.slice(0, 120) || "receipt";
}

function sniffMime(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  if (buf.length >= 4 && buf.toString("ascii", 0, 4) === "%PDF") return "application/pdf";
  return null;
}

function parseDataUrl(file: unknown): { mime: string; buffer: Buffer } | { error: string } {
  const raw = String(file || "");
  const m = raw.match(/^data:([^;,]+);base64,(.+)$/i);
  if (!m) return { error: "Invalid file data" };
  const declaredMime = m[1].trim().toLowerCase();
  if (!ALLOWED_MIME.has(declaredMime)) return { error: "Unsupported file type" };

  let buffer: Buffer;
  try {
    buffer = Buffer.from(m[2], "base64");
  } catch {
    return { error: "Invalid file data" };
  }
  if (!buffer.length) return { error: "Empty file" };
  if (buffer.length > MAX_BYTES) return { error: "File too large" };

  const sniffed = sniffMime(buffer);
  if (!sniffed || sniffed !== declaredMime || !ALLOWED_MIME.has(sniffed)) {
    return { error: "Unsupported file type" };
  }

  return { mime: sniffed, buffer };
}

/** Public checkout receipt upload — fixed folder only, no admin session. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { allowed } = rateLimit(`receipt-upload:${getClientIp(req)}`, 30, 15 * 60 * 1000);
  if (!allowed) return res.status(429).json({ error: "Too many upload attempts. Please try again later." });

  try {
    const { file, name } = req.body || {};
    if (!file) return res.status(400).json({ error: "No file provided" });

    const parsed = parseDataUrl(file);
    if ("error" in parsed) return res.status(400).json({ error: parsed.error });

    const { mime, buffer } = parsed;
    const safeName = sanitizeFilename(name);
    const dataUri = `data:${mime};base64,${buffer.toString("base64")}`;

    if (
      process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
    ) {
      const cloudinary = (await import("../../lib/cloudinary")).default;
      const isPdf = mime === "application/pdf";
      const result = await cloudinary.uploader.upload(dataUri, {
        folder: RECEIPT_FOLDER,
        resource_type: "auto",
        public_id: `${Date.now()}-${safeName.replace(/\.[^.]+$/, "")}`.slice(0, 180),
        ...(isPdf
          ? {}
          : {
              transformation: [{ quality: 90 }],
            }),
      });
      return res.status(200).json({ path: result.secure_url });
    }

    // Local fallback (dev without Cloudinary)
    const uploadsDir = path.join(process.cwd(), "public", "uploads", "receipts");
    const resolvedDir = path.resolve(uploadsDir);
    if (!resolvedDir.startsWith(path.resolve(path.join(process.cwd(), "public", "uploads")))) {
      return res.status(500).json({ error: "Upload path error" });
    }
    if (!fs.existsSync(resolvedDir)) fs.mkdirSync(resolvedDir, { recursive: true });

    const ext =
      mime === "application/pdf"
        ? ".pdf"
        : mime === "image/png"
          ? ".png"
          : mime === "image/webp"
            ? ".webp"
            : ".jpg";
    const outName = `${Date.now()}-${safeName.replace(/\.[^.]+$/, "")}${ext}`.replace(
      /[^a-zA-Z0-9._-]/g,
      "_"
    );
    const outPath = path.resolve(resolvedDir, outName);
    if (!outPath.startsWith(resolvedDir + path.sep)) {
      return res.status(400).json({ error: "Invalid filename" });
    }
    fs.writeFileSync(outPath, buffer);
    return res.status(200).json({ path: `/uploads/receipts/${outName}` });
  } catch (error: any) {
    console.error("[upload-receipt]", error?.message || error);
    return res.status(500).json({ error: "Upload failed" });
  }
}
