/**
 * Public customer reviews — GET approved list; POST submit (pending moderation).
 * No email / IP stored. No runtime DDL.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import pool from "../../lib/db";
import { assertSameOriginMutation } from "../../lib/adminAuth";
import { getClientIp, rateLimit, RL_PUBLIC_GET } from "../../lib/rateLimit";
import {
  REVIEW_CLOSED,
  REVIEW_GENERIC_500,
  REVIEW_SUCCESS,
  validateReviewFields,
} from "../../lib/customerReviews";
import { reviewTextHash } from "../../lib/customerReviewsHash";
import {
  clearPublicReviewsCache,
  getReviewsSubmissionEnabled,
  loadApprovedPublicReviews,
  maybeNotifyAdminNewReview,
} from "../../lib/customerReviewsServer";

/** 3 submissions / hour / IP */
const RL_REVIEWS_HOUR = (ip: string) =>
  rateLimit(`reviews:hour:${ip}`, 3, 60 * 60 * 1000);
/** 10 submissions / 24h / IP */
const RL_REVIEWS_DAY = (ip: string) =>
  rateLimit(`reviews:day:${ip}`, 10, 24 * 60 * 60 * 1000);

const RATE_LIMITED = { error: "Too many reviews. Please try again later." } as const;

function asString(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function mysqlNow3(): string {
  const d = new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    ` ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}` +
    `.${pad(d.getUTCMilliseconds(), 3)}`
  );
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    try {
      const ip = getClientIp(req);
      const { allowed, retryAfterSec } = RL_PUBLIC_GET(ip, "reviews");
      if (!allowed) {
        res.setHeader("Retry-After", String(retryAfterSec));
        return res.status(429).json({ error: "Too many requests" });
      }
      const rows = await loadApprovedPublicReviews();
      return res.status(200).json(rows);
    } catch (error: any) {
      const errCode = typeof error?.code === "string" ? error.code : undefined;
      const errName = typeof error?.name === "string" ? error.name : "Error";
      console.error("[reviews] get failed", errCode || errName);
      return res.status(500).json(REVIEW_GENERIC_500);
    }
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!assertSameOriginMutation(req)) {
    return res.status(403).json({ error: "Forbidden: invalid origin" });
  }

  const ip = getClientIp(req);
  const hour = RL_REVIEWS_HOUR(ip);
  if (!hour.allowed) {
    res.setHeader("Retry-After", String(hour.retryAfterSec));
    return res.status(429).json(RATE_LIMITED);
  }
  const day = RL_REVIEWS_DAY(ip);
  if (!day.allowed) {
    res.setHeader("Retry-After", String(day.retryAfterSec));
    return res.status(429).json(RATE_LIMITED);
  }

  try {
    const enabled = await getReviewsSubmissionEnabled();
    if (!enabled) {
      return res.status(403).json(REVIEW_CLOSED);
    }

    const body = (req.body || {}) as Record<string, unknown>;

    // Honeypot — same success body, no insert.
    if (asString(body.website)) {
      return res.status(200).json(REVIEW_SUCCESS);
    }

    const consent =
      body.consent === true || body.consent === 1 || body.consent === "1" || body.consent === "true";
    if (!consent) {
      return res.status(400).json({ error: "Consent is required." });
    }

    const validated = validateReviewFields({
      display_name: body.display_name,
      rating: body.rating,
      review_text: body.review_text,
    });
    if (!validated.ok) {
      return res.status(400).json({ error: validated.error });
    }

    const orderIdRaw = asString(body.order_id);
    const emailRaw = asString(body.email);
    if ((orderIdRaw && !emailRaw) || (!orderIdRaw && emailRaw)) {
      return res
        .status(400)
        .json({ error: "Order number and email are both required to verify, or leave both blank." });
    }

    let productId: number | null = null;
    if (body.product_id != null && body.product_id !== "") {
      const pid = Number(body.product_id);
      if (!Number.isInteger(pid) || pid <= 0) {
        return res.status(400).json({ error: "Invalid product." });
      }
      const [prows]: any = await pool.query(
        "SELECT id FROM products WHERE id = ? AND active = 1 LIMIT 1",
        [pid]
      );
      if (!Array.isArray(prows) || !prows.length) {
        return res.status(400).json({ error: "Invalid product." });
      }
      productId = pid;
    }

    let isVerified = 0;
    let orderIdStore: string | null = null;
    if (orderIdRaw && emailRaw) {
      if (orderIdRaw.length > 20) {
        return res.status(400).json({ error: "Invalid order number." });
      }
      // Email used only for this SELECT — never stored or logged.
      const [orows]: any = await pool.query(
        `SELECT 1 AS ok FROM orders
         WHERE order_id = ? AND LOWER(customer_email) = LOWER(?)
         LIMIT 1`,
        [orderIdRaw, emailRaw]
      );
      isVerified = Array.isArray(orows) && orows.length ? 1 : 0;
      orderIdStore = orderIdRaw;
    }

    const textHash = reviewTextHash(validated.review_text);

    // Duplicate guard: same text_hash within 30 days → success without insert.
    const [dups]: any = await pool.query(
      `SELECT id FROM customer_reviews
       WHERE text_hash = ? AND created_at >= (UTC_TIMESTAMP(3) - INTERVAL 30 DAY)
       LIMIT 1`,
      [textHash]
    );
    if (Array.isArray(dups) && dups.length) {
      return res.status(200).json(REVIEW_SUCCESS);
    }

    const now = mysqlNow3();
    await pool.query(
      `INSERT INTO customer_reviews
        (status, display_name, rating, review_text, original_text, product_id, order_id,
         is_verified, text_hash, consent_at, created_at, moderated_at, moderated_by, edited_at, edit_note)
       VALUES ('pending', ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL)`,
      [
        validated.display_name,
        validated.rating,
        validated.review_text,
        productId,
        orderIdStore,
        isVerified,
        textHash,
        now,
        now,
      ]
    );

    clearPublicReviewsCache();

    // Fire-and-forget notify — never blocks success; OFF by default.
    void maybeNotifyAdminNewReview({
      display_name: validated.display_name,
      rating: validated.rating,
      review_text: validated.review_text,
    });

    return res.status(200).json(REVIEW_SUCCESS);
  } catch (error: any) {
    const errCode = typeof error?.code === "string" ? error.code : undefined;
    const errName = typeof error?.name === "string" ? error.name : "Error";
    console.error("[reviews] failed", errCode || errName);
    return res.status(500).json(REVIEW_GENERIC_500);
  }
}
