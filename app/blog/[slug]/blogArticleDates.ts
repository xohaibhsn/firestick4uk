/**
 * Normalize blog timestamp values from mysql2 / CMS for public metadata + JSON-LD.
 * Never fabricates dates; never returns "[object Object]".
 */

export function toIsoDateString(value: unknown): string | undefined {
  if (value == null) return undefined;

  if (value instanceof Date) {
    const t = value.getTime();
    if (Number.isNaN(t)) return undefined;
    return value.toISOString();
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return undefined;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return undefined;
    return d.toISOString();
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    if (trimmed === "[object Object]" || /^\[object \w+\]$/i.test(trimmed)) {
      return undefined;
    }
    const d = new Date(trimmed);
    if (Number.isNaN(d.getTime())) return undefined;
    return d.toISOString();
  }

  // Plain objects / other runtimes — never String(value) into meta tags.
  return undefined;
}

export type ArticleDateFields = {
  publishedTime?: string;
  datePublished?: string;
  dateModified?: string;
};

/**
 * publishedTime / datePublished from created_at when valid.
 * dateModified from updated_at when valid, else falls back to published.
 * Omits fields when no valid source exists (no fabricated "now").
 */
export function resolveArticleDates(
  createdAt: unknown,
  updatedAt: unknown
): ArticleDateFields {
  const published = toIsoDateString(createdAt);
  const modified = toIsoDateString(updatedAt) ?? published;
  const out: ArticleDateFields = {};
  if (published) {
    out.publishedTime = published;
    out.datePublished = published;
  }
  if (modified) {
    out.dateModified = modified;
  }
  return out;
}
