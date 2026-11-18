/**
 * Customer-review moderation stale-write token (MULTI-137).
 * Server-only — Node crypto. Do not import from client components.
 *
 * Hash is sha256 of JSON.stringify of the RAW column values, in a fixed order,
 * of the moderation-facing fields. No trimming, no coercion beyond Date
 * normalisation (mysql2 Date -> toISOString(); null stays distinct from "").
 */
import { createHash } from "crypto";

export const REVIEW_MODERATION_COLUMNS = [
  "status",
  "display_name",
  "rating",
  "review_text",
  "edited_at",
] as const;

export type ReviewModerationColumn = (typeof REVIEW_MODERATION_COLUMNS)[number];

function rawColumn(row: Record<string, unknown>, key: string): unknown {
  if (!Object.prototype.hasOwnProperty.call(row, key)) return null;
  const value = row[key];
  if (value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

/** SHA-256 hex of the moderation columns. Unrelated columns are ignored. */
export function reviewModerationBaseHash(
  row: Record<string, unknown> | null | undefined
): string {
  const source = row && typeof row === "object" ? row : {};
  const values = REVIEW_MODERATION_COLUMNS.map((key) => rawColumn(source, key));
  return createHash("sha256").update(JSON.stringify(values), "utf8").digest("hex");
}
