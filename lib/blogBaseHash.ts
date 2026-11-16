/**
 * Blog editor stale-write token (MULTI-113).
 * Server-only — Node crypto. Do not import from client components.
 *
 * Hash is sha256 of JSON.stringify of the RAW column values, in a fixed order,
 * of exactly the columns updateBlogPost writes. No trimming, no newline
 * folding, no FAQ parse, no 0/1 → boolean coercion.
 *
 * null and "" stay distinct because JSON encodes them differently and MySQL
 * distinguishes NULL from ''. A missing key is encoded as null (JSON.stringify
 * turns an array hole / undefined into null), so a missing key hashes like
 * SQL NULL and does not hash like "".
 */
import { createHash } from "crypto";

/** Same order as the UPDATE column list in writeRevisionAndUpdate. */
export const BLOG_WRITE_COLUMNS = [
  "title",
  "slug",
  "excerpt",
  "content",
  "category",
  "emoji",
  "badge",
  "badgeText",
  "featured_image",
  "meta_title",
  "meta_description",
  "focus_keyword",
  "status",
  "featured",
  "canonical_url",
  "faqs",
] as const;

export type BlogWriteColumn = (typeof BLOG_WRITE_COLUMNS)[number];

function rawColumn(row: Record<string, unknown>, key: string): unknown {
  if (!Object.prototype.hasOwnProperty.call(row, key)) return null;
  const value = row[key];
  return value === undefined ? null : value;
}

/** SHA-256 hex of the raw writable columns. Unrelated columns are ignored. */
export function blogRowBaseHash(row: Record<string, unknown> | null | undefined): string {
  const source = row && typeof row === "object" ? row : {};
  const values = BLOG_WRITE_COLUMNS.map((key) => rawColumn(source, key));
  return createHash("sha256").update(JSON.stringify(values), "utf8").digest("hex");
}
