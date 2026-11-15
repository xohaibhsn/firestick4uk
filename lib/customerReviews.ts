/**
 * Shared customer-review validation / normalisation (no DB I/O).
 * Safe for client + server. Hashing lives in customerReviewsHash.ts (Node only).
 */

import type { PublishableHomeTestimonial } from "./homeTestimonials";

export const REVIEW_DISPLAY_NAME_MIN = 2;
export const REVIEW_DISPLAY_NAME_MAX = 60;
export const REVIEW_TEXT_MIN = 20;
export const REVIEW_TEXT_MAX = 1500;
export const REVIEW_SUCCESS = {
  ok: true as const,
  message: "Thank you — your review will appear after approval.",
};
export const REVIEW_LINKS_REJECT =
  "Links and contact details are not allowed." as const;
export const REVIEW_CLOSED = { error: "Reviews are closed." } as const;
export const REVIEW_GENERIC_500 = { error: "Request failed" } as const;

const TAG_RE = /<[^>]*>/g;
const URL_RE = /https?:\/\/|www\.|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

export type CustomerReviewStatus = "pending" | "approved" | "rejected";

export type PublicCustomerReview = {
  id: number;
  display_name: string;
  rating: number;
  review_text: string;
  is_verified: boolean;
  created_at: string; // date only YYYY-MM-DD
  product_name: string | null;
};

export type AdminCustomerReview = {
  id: number;
  status: CustomerReviewStatus;
  display_name: string;
  rating: number;
  review_text: string;
  original_text: string | null;
  product_id: number | null;
  order_id: string | null;
  is_verified: number;
  consent_at: string;
  created_at: string;
  moderated_at: string | null;
  moderated_by: string | null;
  edited_at: string | null;
  edit_note: string | null;
};

/** Strip tags, collapse whitespace. Does not reject. */
export function sanitizeReviewPlainText(raw: unknown): string {
  let s = String(raw ?? "");
  s = s.replace(TAG_RE, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/** True when text/name contains URL / www. / http(s) / email-like. */
export function containsLinksOrContact(text: string): boolean {
  return URL_RE.test(text);
}

export function normaliseReviewTextForHash(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export type ReviewFieldValidation =
  | { ok: true; display_name: string; rating: number; review_text: string }
  | { ok: false; error: string };

export function validateReviewFields(input: {
  display_name?: unknown;
  rating?: unknown;
  review_text?: unknown;
}): ReviewFieldValidation {
  const display_name = sanitizeReviewPlainText(input.display_name);
  const review_text = sanitizeReviewPlainText(input.review_text);

  if (
    display_name.length < REVIEW_DISPLAY_NAME_MIN ||
    display_name.length > REVIEW_DISPLAY_NAME_MAX
  ) {
    return {
      ok: false,
      error: `Display name must be ${REVIEW_DISPLAY_NAME_MIN}–${REVIEW_DISPLAY_NAME_MAX} characters.`,
    };
  }
  if (containsLinksOrContact(display_name) || containsLinksOrContact(review_text)) {
    return { ok: false, error: REVIEW_LINKS_REJECT };
  }

  const ratingRaw =
    typeof input.rating === "number" ? input.rating : Number(input.rating);
  if (!Number.isInteger(ratingRaw) || ratingRaw < 1 || ratingRaw > 5) {
    return { ok: false, error: "Rating must be an integer from 1 to 5." };
  }

  if (review_text.length < REVIEW_TEXT_MIN || review_text.length > REVIEW_TEXT_MAX) {
    return {
      ok: false,
      error: `Review text must be ${REVIEW_TEXT_MIN}–${REVIEW_TEXT_MAX} characters.`,
    };
  }

  return { ok: true, display_name, rating: ratingRaw, review_text };
}

/** Missing / empty / anything other than "0" ⇒ enabled. Only explicit "0" closes. */
export function isReviewsSubmissionEnabled(value: unknown): boolean {
  return String(value ?? "").trim() !== "0";
}

/** Missing / empty ⇒ OFF. Only explicit "1" enables notify. */
export function isReviewsNotifyAdminEnabled(value: unknown): boolean {
  return String(value ?? "").trim() === "1";
}

/**
 * Manual CMS testimonials first (their existing sort), then customer reviews newest-first.
 * Verified badge only when is_verified (mapped to verifiedOrderId sentinel).
 */
export function mergeHomeReviews(
  manual: PublishableHomeTestimonial[],
  customer: Array<{
    id: number;
    display_name: string;
    rating: number;
    review_text: string;
    is_verified: boolean;
    created_at: string;
    product_name?: string | null;
  }>
): PublishableHomeTestimonial[] {
  const customerMapped: PublishableHomeTestimonial[] = customer.map((r) => ({
    name: r.display_name,
    text: r.review_text,
    rating: r.rating,
    date: r.created_at ? String(r.created_at).slice(0, 10) : null,
    service: r.product_name || null,
    pinned: false,
    order: null,
    sourceLabel: null,
    verifiedOrderId: r.is_verified ? "verified" : null,
  }));
  return [...manual, ...customerMapped];
}

export const HOME_REVIEWS_WRITE_BTN_DEFAULT = "Write a review";
export const HOME_REVIEWS_HELPER_DEFAULT =
  "Reviews are checked before publishing to remove spam or personal details. We publish genuine reviews, good or bad.";
export const HOME_REVIEWS_WRITE_BTN_KEY = "home_reviews_write_btn";
export const HOME_REVIEWS_HELPER_KEY = "home_reviews_helper";
export const REVIEWS_SUBMISSION_ENABLED_KEY = "reviews_submission_enabled";
export const REVIEWS_NOTIFY_ADMIN_KEY = "reviews_notify_admin";
