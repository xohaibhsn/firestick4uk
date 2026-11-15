/**
 * Allowlist for checkout receipt_path values.
 * Accepts empty string (no receipt / COD) or the exact shape produced by
 * POST /api/upload-receipt (Cloudinary receipts folder, or local fallback
 * only when Cloudinary env is not configured).
 */

const MAX_LEN = 500;
const NAME_RE = /^[A-Za-z0-9_-]{8,200}$/;
const EXT_RE = /^(?:jpg|jpeg|png|webp|pdf)$/i;

function cloudinaryConfigured(): boolean {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
  );
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Returns true when value is allowed as orders.receipt_path.
 * Empty string is allowed (no receipt). Non-strings are rejected.
 */
export function isAllowedReceiptPath(value: unknown): boolean {
  if (value === "") return true;
  if (typeof value !== "string") return false;
  if (value.length === 0) return true;
  if (value.length > MAX_LEN) return false;

  // Reject whitespace, backslashes, traversal, query, fragment, protocol-relative, http.
  if (/[\s\\]/.test(value)) return false;
  if (value.includes("..")) return false;
  if (value.includes("?") || value.includes("#")) return false;
  if (value.startsWith("//")) return false;
  if (/^http:\/\//i.test(value)) return false;

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME || "";

  if (cloudinaryConfigured() && cloudName) {
    // Exact Cloudinary delivery URL under firestick4uk/receipts.
    // Covers image + raw resource types (PDF via resource_type "auto") and optional vN version segment.
    const re = new RegExp(
      `^https://res\\.cloudinary\\.com/${escapeRegExp(cloudName)}/(?:image|raw)/upload/(?:v\\d+/)?firestick4uk/receipts/([A-Za-z0-9_-]{8,200})\\.(jpg|jpeg|png|webp|pdf)$`
    );
    const m = re.exec(value);
    if (!m) return false;
    return NAME_RE.test(m[1]) && EXT_RE.test(m[2]);
  }

  // Dev/local fallback — only when Cloudinary is not configured.
  const local = /^\/uploads\/receipts\/([A-Za-z0-9_-]{8,200})\.(jpg|jpeg|png|webp|pdf)$/.exec(
    value
  );
  if (!local) return false;
  return NAME_RE.test(local[1]) && EXT_RE.test(local[2]);
}
