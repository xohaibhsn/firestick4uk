/**
 * Human stock badge from existing stock field only — never invents quantity.
 * Numeric stock: fallback ("In stock"); if N <= 5, "Only N left".
 * Non-numeric / empty / digital: fallback (no fabricated count).
 * `fallback` is the CMS `pd_stock_fallback` value (or hard-coded "In stock").
 */
export function stockBadgeLabel(
  stock: string | null | undefined,
  fallback = "In stock"
): string {
  const emptyLabel = String(fallback || "").trim() || "In stock";
  const raw = String(stock ?? "").trim();
  if (!raw) return emptyLabel;
  const lower = raw.toLowerCase();
  if (lower === "digital") return emptyLabel;
  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    if (n <= 5) return `Only ${n} left`;
    return emptyLabel;
  }
  // Preserve an existing non-numeric label without inventing urgency.
  return raw;
}
