import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { getClientIp, rateLimit } from "../../lib/rateLimit";
import { parseReceiptDataUrl } from "../../lib/receiptUploadContract";

// Next.js requires a string literal here (imported constants are rejected).
export const config = {
  api: { bodyParser: { sizeLimit: "8mb" } },
};

const RECEIPT_FOLDER = "firestick4uk/receipts";

/** Public checkout receipt upload — fixed folder only, no admin session. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { allowed } = rateLimit(`receipt-upload:${getClientIp(req)}`, 30, 15 * 60 * 1000);
  if (!allowed) return res.status(429).json({ error: "Too many upload attempts. Please try again later." });

  try {
    const { file } = req.body || {};
    if (!file) return res.status(400).json({ error: "No file provided" });

    const parsed = parseReceiptDataUrl(file);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });

    const { mime, buffer } = parsed;
    const randomId = crypto.randomBytes(16).toString("hex");
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
        public_id: randomId,
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
    const outName = `${randomId}${ext}`;
    const outPath = path.resolve(resolvedDir, outName);
    if (!outPath.startsWith(resolvedDir + path.sep)) {
      return res.status(400).json({ error: "Invalid filename" });
    }
    fs.writeFileSync(outPath, buffer);
    return res.status(200).json({ path: `/uploads/receipts/${outName}` });
  } catch (error: any) {
    // Do not log file contents, paths with PII, or raw credentials.
    console.error("[upload-receipt]", error?.name || "Error", error?.http_code || error?.code || "");
    return res.status(500).json({ error: "Upload failed" });
  }
}
