/**
 * Server-only helpers for customer reviews (settings, cache, admin notify).
 * No runtime DDL.
 */

import nodemailer from "nodemailer";
import pool from "@/lib/db";
import { escapeHtml } from "@/lib/contentHtml";
import { getContactConfig } from "@/lib/contact-config";
import {
  isReviewsNotifyAdminEnabled,
  isReviewsSubmissionEnabled,
  REVIEWS_NOTIFY_ADMIN_KEY,
  REVIEWS_SUBMISSION_ENABLED_KEY,
  type PublicCustomerReview,
} from "@/lib/customerReviews";

export const PUBLIC_REVIEWS_CACHE_TTL_MS = 60_000;

type Queryable = {
  query: (sql: string, params?: unknown[]) => Promise<[unknown[], unknown?]>;
};

type CacheEntry = { at: number; value: PublicCustomerReview[] };

let publicCache: CacheEntry | null = null;

/** Process-local daily notify counter (max 20 / day). */
let notifyDayKey = "";
let notifyDayCount = 0;

export function clearPublicReviewsCache(): void {
  publicCache = null;
}

export function resetReviewNotifyCountersForTests(): void {
  notifyDayKey = "";
  notifyDayCount = 0;
}

export async function getReviewsSubmissionEnabled(opts?: {
  db?: Queryable;
}): Promise<boolean> {
  try {
    const db = opts?.db ?? (pool as unknown as Queryable);
    const [rows] = await db.query(
      `SELECT content_value FROM site_content WHERE content_key = ? LIMIT 1`,
      [REVIEWS_SUBMISSION_ENABLED_KEY]
    );
    const row =
      Array.isArray(rows) && rows.length
        ? (rows[0] as { content_value?: string })
        : null;
    return isReviewsSubmissionEnabled(row ? row.content_value : undefined);
  } catch {
    // Fail open (missing/error = enabled) so a CMS blip does not brick submissions.
    return true;
  }
}

export async function getReviewsNotifyAdminEnabled(opts?: {
  db?: Queryable;
}): Promise<boolean> {
  try {
    const db = opts?.db ?? (pool as unknown as Queryable);
    const [rows] = await db.query(
      `SELECT content_value FROM site_content WHERE content_key = ? LIMIT 1`,
      [REVIEWS_NOTIFY_ADMIN_KEY]
    );
    const row =
      Array.isArray(rows) && rows.length
        ? (rows[0] as { content_value?: string })
        : null;
    return isReviewsNotifyAdminEnabled(row ? row.content_value : undefined);
  } catch {
    return false;
  }
}

function mapPublicRow(r: any): PublicCustomerReview {
  const created = r.created_at != null ? String(r.created_at) : "";
  return {
    id: Number(r.id),
    display_name: String(r.display_name || ""),
    rating: Number(r.rating),
    review_text: String(r.review_text || ""),
    is_verified: Number(r.is_verified) === 1,
    created_at: created.slice(0, 10),
    product_name: r.product_name != null ? String(r.product_name) : null,
  };
}

export async function loadApprovedPublicReviews(opts?: {
  db?: Queryable;
  nowMs?: number;
  ttlMs?: number;
  limit?: number;
}): Promise<PublicCustomerReview[]> {
  const now = opts?.nowMs ?? Date.now();
  const ttl = opts?.ttlMs ?? PUBLIC_REVIEWS_CACHE_TTL_MS;
  if (publicCache && now - publicCache.at < ttl) return publicCache.value;

  const db = opts?.db ?? (pool as unknown as Queryable);
  const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 50);
  const [rows] = await db.query(
    `SELECT r.id, r.display_name, r.rating, r.review_text, r.is_verified, r.created_at,
            p.name AS product_name
     FROM customer_reviews r
     LEFT JOIN products p ON p.id = r.product_id
     WHERE r.status = 'approved'
     ORDER BY r.created_at DESC
     LIMIT ?`,
    [limit]
  );
  const value = (Array.isArray(rows) ? rows : []).map(mapPublicRow);
  publicCache = { at: now, value };
  return value;
}

function utcDayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Best-effort admin notify. Never throws. Caps at 20 emails/day per process.
 * Body: name, rating, first 200 chars of text (escaped). No email/IP of submitter.
 */
export async function maybeNotifyAdminNewReview(input: {
  display_name: string;
  rating: number;
  review_text: string;
  db?: Queryable;
}): Promise<{ sent: boolean; reason: string }> {
  const enabled = await getReviewsNotifyAdminEnabled({ db: input.db });
  if (!enabled) return { sent: false, reason: "notify_off" };

  const day = utcDayKey();
  if (notifyDayKey !== day) {
    notifyDayKey = day;
    notifyDayCount = 0;
  }
  if (notifyDayCount >= 20) return { sent: false, reason: "daily_cap" };

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return { sent: false, reason: "smtp_missing" };
  }

  let to = "";
  try {
    const cfg = await getContactConfig();
    to = String(cfg.email || "").trim();
  } catch {
    to = "";
  }
  if (!to) return { sent: false, reason: "no_admin_address" };

  const safeName = escapeHtml(String(input.display_name || "").slice(0, 80));
  const safeRating = escapeHtml(String(input.rating));
  const excerpt = escapeHtml(String(input.review_text || "").slice(0, 200));

  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.hostinger.com",
      port: 465,
      secure: true,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to,
      subject: "New review pending approval",
      html: `<p><strong>Name:</strong> ${safeName}</p>
<p><strong>Rating:</strong> ${safeRating}</p>
<p><strong>Review:</strong> ${excerpt}</p>`,
    });
    notifyDayCount += 1;
    return { sent: true, reason: "sent" };
  } catch (err: any) {
    const code = typeof err?.code === "string" ? err.code : undefined;
    const name = typeof err?.name === "string" ? err.name : "Error";
    console.error("[reviews-notify] failed", code || name);
    return { sent: false, reason: "send_failed" };
  }
}
