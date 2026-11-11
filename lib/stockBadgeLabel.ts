/**
 * Human stock badge from existing stock field only — never invents quantity.
 * Numeric stock: "In stock"; if N <= 5, "Only N left".
 * Non-numeric / empty / digital: "In stock" (no fabricated count).
 */
export function stockBadgeLabel(stock: string | null | undefined): string {
  const raw = String(stock ?? "").trim();
  if (!raw) return "In stock";
  const lower = raw.toLowerCase();
  if (lower === "digital") return "In stock";
  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    if (n <= 5) return `Only ${n} left`;
    return "In stock";
  }
  // Preserve an existing non-numeric label without inventing urgency.
  return raw;
}
