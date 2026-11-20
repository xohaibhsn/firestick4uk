/**
 * Split a CMS products page title into lead + tail so the H1 can keep a
 * styled "Products" span without duplicating that word when the CMS value
 * already ends with it (e.g. "All Products").
 */
export function splitProductsTitle(raw: unknown): { lead: string; tail: string } {
  const collapsed =
    typeof raw === "string"
      ? raw.trim().replace(/\s+/g, " ")
      : "";
  if (!collapsed) {
    return { lead: "All", tail: "Products" };
  }
  const m = collapsed.match(/^(.*?)(?:\s+)?(\bProducts\b)$/i);
  if (m) {
    return { lead: (m[1] || "").trim(), tail: m[2] };
  }
  return { lead: collapsed, tail: "Products" };
}
