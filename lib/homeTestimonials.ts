/**
 * Homepage customer-review helpers for CMS `home_testimonials` items.
 * Only customer-permission-approved records are eligible for public display.
 */

export type HomeTestimonialItem = {
  name?: unknown;
  text?: unknown;
  rating?: unknown;
  date?: unknown;
  service?: unknown;
  approved?: unknown;
  permission?: unknown;
};

export type PublishableHomeTestimonial = {
  name: string;
  text: string;
  rating: number | null;
  date: string | null;
  service: string | null;
};

function asTrimmedString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

/** Valid explicit 1–5 rating only; missing/invalid → null (no stars). */
export function parseHomeTestimonialRating(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  const rating = Math.trunc(n);
  if (rating < 1 || rating > 5) return null;
  return rating;
}

export function isHomeTestimonialApproved(item: HomeTestimonialItem | null | undefined): boolean {
  if (!item || typeof item !== "object") return false;
  return item.approved === true || item.permission === true;
}

/**
 * Filter CMS items to customer-approved publishable reviews.
 * Unverified / unknown-provenance records are excluded.
 */
export function getPublishableHomeTestimonials(
  items: unknown
): PublishableHomeTestimonial[] {
  if (!Array.isArray(items)) return [];
  const out: PublishableHomeTestimonial[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as HomeTestimonialItem;
    if (!isHomeTestimonialApproved(item)) continue;
    const name = asTrimmedString(item.name);
    const text = asTrimmedString(item.text);
    if (!name || !text) continue;
    const date = asTrimmedString(item.date) || null;
    const service = asTrimmedString(item.service) || null;
    out.push({
      name,
      text,
      rating: parseHomeTestimonialRating(item.rating),
      date,
      service,
    });
  }
  return out;
}
