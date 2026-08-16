/** Detect if a stored content string already contains HTML tags. */
export function looksLikeHtml(value: string): boolean {
  return /<[a-z][\s\S]*>/i.test(value || "");
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Convert legacy "one line per feature" plain text into a TipTap-friendly list. */
export function plainLinesToListHtml(raw: string): string {
  const lines = (raw || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return "";
  return `<ul>${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>`;
}

/** Normalize DB content for TipTap: HTML as-is, plain lines → bullet list. */
export function toEditorHtml(raw: string): string {
  if (!(raw || "").trim()) return "";
  if (looksLikeHtml(raw)) return raw;
  return plainLinesToListHtml(raw);
}
