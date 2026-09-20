import crypto from "crypto";
import pool from "./db";
import type { AdminIdentity } from "./adminAuth";
import {
  detectMediaProvider,
  type RecordMediaAssetInput,
} from "./mediaLibrary";

export function hashMediaUrl(url: string): string {
  return crypto.createHash("sha256").update(String(url || "").trim()).digest("hex");
}

/**
 * Upsert a media catalog row. Never throws to callers — returns id or null.
 * Upload success remains primary; indexing is best-effort.
 * Server-only (uses mysql).
 */
export async function recordMediaAsset(
  input: RecordMediaAssetInput & { actor?: AdminIdentity | null }
): Promise<number | null> {
  try {
    const url = String(input.url || "").trim();
    const purpose = String(input.purpose || "").trim();
    if (!url || !purpose) return null;
    if (purpose === "receipts") return null;

    const urlHash = hashMediaUrl(url);
    const provider =
      input.provider || detectMediaProvider(url, process.env.CLOUDINARY_CLOUD_NAME || "");
    const source = input.source || "upload";

    const [result]: any = await pool.query(
      `INSERT INTO media_assets
        (url, url_hash, public_id, provider, purpose, original_name, mime_type, format,
         bytes, width, height, resource_type, source,
         uploaded_by_type, uploaded_by_staff_id, uploaded_by_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         url = VALUES(url),
         public_id = COALESCE(VALUES(public_id), public_id),
         provider = VALUES(provider),
         original_name = COALESCE(VALUES(original_name), original_name),
         mime_type = COALESCE(VALUES(mime_type), mime_type),
         format = COALESCE(VALUES(format), format),
         bytes = COALESCE(VALUES(bytes), bytes),
         width = COALESCE(VALUES(width), width),
         height = COALESCE(VALUES(height), height),
         resource_type = COALESCE(VALUES(resource_type), resource_type)`,
      [
        url,
        urlHash,
        input.publicId || null,
        provider,
        purpose,
        input.originalName || null,
        input.mimeType || null,
        input.format || null,
        input.bytes != null && Number.isFinite(Number(input.bytes)) ? Number(input.bytes) : null,
        input.width != null && Number.isFinite(Number(input.width)) ? Number(input.width) : null,
        input.height != null && Number.isFinite(Number(input.height)) ? Number(input.height) : null,
        input.resourceType || null,
        source,
        input.actor?.principalType || null,
        input.actor?.staffId ?? null,
        input.actor?.name || null,
      ]
    );

    if (result?.insertId) return Number(result.insertId);

    const [rows]: any = await pool.query(
      "SELECT id FROM media_assets WHERE url_hash=? AND purpose=? LIMIT 1",
      [urlHash, purpose]
    );
    return rows?.[0]?.id ? Number(rows[0].id) : null;
  } catch (err: any) {
    console.error("[media] registration failed", err?.message || err);
    return null;
  }
}
