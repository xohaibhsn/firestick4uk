/**
 * True when `text` contains the word "optional" (case-insensitive, word boundary).
 * Never throws. Non-strings return false.
 */
export function labelHasOptional(text: unknown): boolean {
  try {
    if (typeof text !== "string") return false;
    return /\boptional\b/i.test(text);
  } catch {
    return false;
  }
}
