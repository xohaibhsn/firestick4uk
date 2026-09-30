/**
 * Helpers for TipTap Visual | HTML source mode.
 * No DB, no HTTP. Editor source is not an execution surface.
 */

/** Structural tags TipTap cannot round-trip without a table extension. */
const UNSUPPORTED_STRUCTURAL_RE =
  /<\s*(table|thead|tbody|tfoot|tr|th|td|colgroup|col|caption)\b/i;

export function htmlContainsUnsupportedStructuralMarkup(html: string): boolean {
  return UNSUPPORTED_STRUCTURAL_RE.test(String(html || ""));
}

/**
 * Normalize empty TipTap docs so parent comparisons stay stable.
 * TipTap often emits `<p></p>` for empty content.
 */
export function normalizeEmptyEditorHtml(html: string): string {
  const raw = String(html || "");
  if (!raw.trim()) return "";
  if (/^<p><\/p>$/i.test(raw.trim())) return "";
  return raw;
}
