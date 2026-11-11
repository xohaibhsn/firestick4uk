/**
 * Homepage customer-review helpers for CMS `home_testimonials` items.
 * Only customer-permission-approved, non-hidden records are eligible for public display.
 * No fabricated defaults; ratings are explicit 1–5 or absent.
 */

export type HomeTestimonialItem = {
  name?: unknown;
  text?: unknown;
  rating?: unknown;
  date?: unknown;
  service?: unknown;
  approved?: unknown;
  permission?: unknown;
  /** Pin / feature to the front of the list */
  pinned?: unknown;
  featured?: unknown;
  /** Explicit display order (lower first). Also accepts displayOrder / display_order. */
  order?: unknown;
  displayOrder?: unknown;
  display_order?: unknown;
  /** Free-text source label (not a third-party brand claim). */
  source?: unknown;
  sourceLabel?: unknown;
  source_label?: unknown;
  /** Optional verified order id — badge only when non-empty. */
  verifiedOrderId?: unknown;
  verified_order_id?: unknown;
  /** When true, keep in CMS but do not publish. */
  hidden?: unknown;
};

export type HomeTestimonialsSection = {
  title?: unknown;
  subtitle?: unknown;
  showSummary?: unknown;
  show_summary?: unknown;
  minReviewsForSummary?: unknown;
  min_reviews_for_summary?: unknown;
  minReviews?: unknown;
  items?: unknown;
};

export type PublishableHomeTestimonial = {
  name: string;
  text: string;
  rating: number | null;
  date: string | null;
  service: string | null;
  pinned: boolean;
  order: number | null;
  sourceLabel: string | null;
  verifiedOrderId: string | null;
};

export type HomeTestimonialsSummary = {
  average: number;
  ratedCount: number;
};

const MAX_NAME = 80;
const MAX_TEXT = 2000;
const MAX_SERVICE = 120;
const MAX_DATE = 40;
const MAX_SOURCE = 60;
const MAX_TITLE = 120;
const MAX_SUBTITLE = 240;
const MAX_VERIFIED_ORDER_ID = 64;

const DEFAULT_TITLE = "What Our Customers Say";
const DEFAULT_SUBTITLE = "Your feedback helps us improve our service.";
const DEFAULT_MIN_REVIEWS_FOR_SUMMARY = 3;

function asTrimmedString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function clampText(value: unknown, max: number): string {
  const s = asTrimmedString(value);
  if (!s) return "";
  return s.length > max ? s.slice(0, max) : s;
}

function parseOptionalInt(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function isTruthyFlag(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "true";
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

export function isHomeTestimonialApproved(
  item: HomeTestimonialItem | null | undefined
): boolean {
  if (!item || typeof item !== "object") return false;
  return item.approved === true || item.permission === true;
}

export function isHomeTestimonialHidden(
  item: HomeTestimonialItem | null | undefined
): boolean {
  if (!item || typeof item !== "object") return false;
  return isTruthyFlag(item.hidden);
}

function readPinned(item: HomeTestimonialItem): boolean {
  return isTruthyFlag(item.pinned) || isTruthyFlag(item.featured);
}

function readOrder(item: HomeTestimonialItem): number | null {
  return (
    parseOptionalInt(item.order) ??
    parseOptionalInt(item.displayOrder) ??
    parseOptionalInt(item.display_order)
  );
}

function readSourceLabel(item: HomeTestimonialItem): string | null {
  const raw =
    clampText(item.sourceLabel, MAX_SOURCE) ||
    clampText(item.source_label, MAX_SOURCE) ||
    clampText(item.source, MAX_SOURCE);
  return raw || null;
}

function readVerifiedOrderId(item: HomeTestimonialItem): string | null {
  const raw =
    clampText(item.verifiedOrderId, MAX_VERIFIED_ORDER_ID) ||
    clampText(item.verified_order_id, MAX_VERIFIED_ORDER_ID);
  return raw || null;
}

function dateSortKey(date: string | null): number {
  if (!date) return Number.NEGATIVE_INFINITY;
  const t = Date.parse(date);
  return Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY;
}

/**
 * Filter + sanitise CMS items to customer-approved publishable reviews.
 * Shows only if approved/permission AND not hidden AND has name+text.
 * Sort: pinned first, then explicit order ascending, then date desc, stable.
 */
export function getPublishableHomeTestimonials(
  items: unknown
): PublishableHomeTestimonial[] {
  if (!Array.isArray(items)) return [];
  const out: Array<PublishableHomeTestimonial & { _idx: number }> = [];
  for (let idx = 0; idx < items.length; idx++) {
    const raw = items[idx];
    if (!raw || typeof raw !== "object") continue;
    const item = raw as HomeTestimonialItem;
    if (!isHomeTestimonialApproved(item)) continue;
    if (isHomeTestimonialHidden(item)) continue;
    const name = clampText(item.name, MAX_NAME);
    const text = clampText(item.text, MAX_TEXT);
    if (!name || !text) continue;
    const date = clampText(item.date, MAX_DATE) || null;
    const service = clampText(item.service, MAX_SERVICE) || null;
    out.push({
      name,
      text,
      rating: parseHomeTestimonialRating(item.rating),
      date,
      service,
      pinned: readPinned(item),
      order: readOrder(item),
      sourceLabel: readSourceLabel(item),
      verifiedOrderId: readVerifiedOrderId(item),
      _idx: idx,
    });
  }

  out.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const ao = a.order;
    const bo = b.order;
    if (ao !== null && bo !== null && ao !== bo) return ao - bo;
    if (ao !== null && bo === null) return -1;
    if (ao === null && bo !== null) return 1;
    const ad = dateSortKey(a.date);
    const bd = dateSortKey(b.date);
    if (ad !== bd) return bd - ad;
    return a._idx - b._idx;
  });

  return out.map(({ _idx: _omit, ...rest }) => rest);
}

/** Average + count from publishable items that have an explicit rating. */
export function computeHomeTestimonialsSummary(
  publishable: PublishableHomeTestimonial[]
): HomeTestimonialsSummary | null {
  let sum = 0;
  let ratedCount = 0;
  for (const item of publishable) {
    if (item.rating === null) continue;
    sum += item.rating;
    ratedCount += 1;
  }
  if (ratedCount === 0) return null;
  const average = Math.round((sum / ratedCount) * 10) / 10;
  return { average, ratedCount };
}

export function parseShowSummaryToggle(section: HomeTestimonialsSection | null | undefined): boolean {
  if (!section || typeof section !== "object") return false;
  return isTruthyFlag(section.showSummary) || isTruthyFlag(section.show_summary);
}

export function parseMinReviewsForSummary(
  section: HomeTestimonialsSection | null | undefined
): number {
  if (!section || typeof section !== "object") return DEFAULT_MIN_REVIEWS_FOR_SUMMARY;
  const n =
    parseOptionalInt(section.minReviewsForSummary) ??
    parseOptionalInt(section.min_reviews_for_summary) ??
    parseOptionalInt(section.minReviews);
  if (n === null || n < 1) return DEFAULT_MIN_REVIEWS_FOR_SUMMARY;
  return Math.min(n, 100);
}

/**
 * Summary bar only when CMS toggle is on AND rated-item count >= threshold.
 * Toggle defaults OFF; threshold defaults to 3.
 */
export function shouldShowHomeTestimonialsSummary(
  section: HomeTestimonialsSection | null | undefined,
  publishable: PublishableHomeTestimonial[]
): boolean {
  if (!parseShowSummaryToggle(section)) return false;
  const summary = computeHomeTestimonialsSummary(publishable);
  if (!summary) return false;
  return summary.ratedCount >= parseMinReviewsForSummary(section);
}

export function getHomeTestimonialsTitle(
  section: HomeTestimonialsSection | null | undefined
): string {
  const t = clampText(section?.title, MAX_TITLE);
  return t || DEFAULT_TITLE;
}

export function getHomeTestimonialsSubtitle(
  section: HomeTestimonialsSection | null | undefined
): string {
  const t = clampText(section?.subtitle, MAX_SUBTITLE);
  return t || DEFAULT_SUBTITLE;
}

/** Initials for avatar — letters only, max 2. */
export function homeTestimonialInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .map((p) => p.replace(/[^A-Za-z0-9]/g, ""))
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const HOME_TESTIMONIALS_DEFAULTS = {
  title: DEFAULT_TITLE,
  subtitle: DEFAULT_SUBTITLE,
  showSummary: false,
  minReviewsForSummary: DEFAULT_MIN_REVIEWS_FOR_SUMMARY,
  maxName: MAX_NAME,
  maxText: MAX_TEXT,
  maxService: MAX_SERVICE,
  maxDate: MAX_DATE,
  maxSource: MAX_SOURCE,
  maxTitle: MAX_TITLE,
  maxSubtitle: MAX_SUBTITLE,
  maxVerifiedOrderId: MAX_VERIFIED_ORDER_ID,
} as const;
