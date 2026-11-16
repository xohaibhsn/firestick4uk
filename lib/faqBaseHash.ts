/**
 * FAQ edit / visibility stale-write token (MULTI-114).
 * Server-only — Node crypto. Do not import from client components.
 *
 * Hash is sha256 of JSON.stringify of the RAW column values, in a fixed order,
 * of exactly the columns PUT /api/faqs writes. No trimming, no coercion.
 *
 * null and "" stay distinct because JSON encodes them differently and MySQL
 * distinguishes NULL from ''. A missing key is encoded as null.
 */
import { createHash } from "crypto";

/** Same order as the UPDATE column list in pages/api/faqs.ts PUT. */
export const FAQ_WRITE_COLUMNS = [
  "question",
  "answer",
  "category",
  "sort_order",
  "is_visible",
] as const;

export type FaqWriteColumn = (typeof FAQ_WRITE_COLUMNS)[number];

function rawColumn(row: Record<string, unknown>, key: string): unknown {
  if (!Object.prototype.hasOwnProperty.call(row, key)) return null;
  const value = row[key];
  return value === undefined ? null : value;
}

/** SHA-256 hex of the raw writable columns. Unrelated columns are ignored. */
export function faqRowBaseHash(row: Record<string, unknown> | null | undefined): string {
  const source = row && typeof row === "object" ? row : {};
  const values = FAQ_WRITE_COLUMNS.map((key) => rawColumn(source, key));
  return createHash("sha256").update(JSON.stringify(values), "utf8").digest("hex");
}
