"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  HOME_REVIEWS_WRITE_BTN_DEFAULT,
  REVIEW_TEXT_MAX,
  REVIEW_TEXT_MIN,
  REVIEW_DISPLAY_NAME_MAX,
  REVIEW_DISPLAY_NAME_MIN,
} from "@/lib/customerReviews";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
};

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function WriteReviewModal({
  open,
  onClose,
  title = HOME_REVIEWS_WRITE_BTN_DEFAULT,
}: Props) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const firstFieldRef = useRef<HTMLInputElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [rating, setRating] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [orderId, setOrderId] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState(""); // honeypot
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const resetForm = useCallback(() => {
    setDisplayName("");
    setRating(5);
    setReviewText("");
    setOrderId("");
    setEmail("");
    setConsent(false);
    setWebsite("");
    setError(null);
    setSuccess(null);
    setSubmitting(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    resetForm();
    const t = window.setTimeout(() => firstFieldRef.current?.focus(), 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose, resetForm]);

  const onDialogKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab" || !dialogRef.current) return;
    const nodes = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)
    ).filter((el) => el.offsetParent !== null || el === document.activeElement);
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const name = displayName.trim();
    const text = reviewText.trim();
    if (name.length < REVIEW_DISPLAY_NAME_MIN || name.length > REVIEW_DISPLAY_NAME_MAX) {
      setError(`Name must be ${REVIEW_DISPLAY_NAME_MIN}–${REVIEW_DISPLAY_NAME_MAX} characters.`);
      return;
    }
    if (text.length < REVIEW_TEXT_MIN || text.length > REVIEW_TEXT_MAX) {
      setError(`Review must be ${REVIEW_TEXT_MIN}–${REVIEW_TEXT_MAX} characters.`);
      return;
    }
    if (!consent) {
      setError("Please confirm consent before submitting.");
      return;
    }
    const oid = orderId.trim();
    const em = email.trim();
    if ((oid && !em) || (!oid && em)) {
      setError("Provide both order number and email to verify, or leave both blank.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          display_name: name,
          rating,
          review_text: text,
          order_id: oid || undefined,
          email: em || undefined,
          consent: true,
          website,
        }),
      });
      let data: any = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
      if (res.status === 200 && data?.ok) {
        setSuccess(
          data.message ||
            "Thank you — your review will appear after approval."
        );
        return;
      }
      setError(
        (data && data.error) ||
          (res.status === 429
            ? "Too many reviews. Please try again later."
            : "Could not submit your review. Please try again.")
      );
    } catch {
      setError("Could not submit your review. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="write-review-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="write-review-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={dialogRef}
        onKeyDown={onDialogKeyDown}
      >
        <div className="write-review-header">
          <h2 id={titleId} className="write-review-title">
            {title}
          </h2>
          <button
            type="button"
            className="write-review-close"
            aria-label="Close review form"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        {success ? (
          <div className="write-review-success" role="status">
            <p>{success}</p>
            <button type="button" className="write-review-submit" onClick={onClose}>
              Close
            </button>
          </div>
        ) : (
          <form className="write-review-form" onSubmit={onSubmit} noValidate>
            <div className="write-review-field">
              <label htmlFor="wr-name">Display name</label>
              <input
                id="wr-name"
                ref={firstFieldRef}
                type="text"
                autoComplete="nickname"
                maxLength={REVIEW_DISPLAY_NAME_MAX}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
              />
            </div>

            <fieldset className="write-review-field write-review-stars">
              <legend>Rating</legend>
              <div className="write-review-star-row" role="radiogroup" aria-label="Rating">
                {[1, 2, 3, 4, 5].map((n) => (
                  <label key={n} className="write-review-star-label">
                    <input
                      type="radio"
                      name="wr-rating"
                      value={n}
                      checked={rating === n}
                      onChange={() => setRating(n)}
                    />
                    <span aria-hidden="true" className={n <= rating ? "on" : "off"}>
                      ★
                    </span>
                    <span className="sr-only">{n} star{n === 1 ? "" : "s"}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="write-review-field">
              <label htmlFor="wr-text">Your review</label>
              <textarea
                id="wr-text"
                rows={5}
                maxLength={REVIEW_TEXT_MAX}
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                required
              />
              <div className="write-review-counter" aria-live="polite">
                {reviewText.trim().length}/{REVIEW_TEXT_MAX}
              </div>
            </div>

            <details className="write-review-verify">
              <summary>Verify your purchase (optional)</summary>
              <div className="write-review-field">
                <label htmlFor="wr-order">Order number</label>
                <input
                  id="wr-order"
                  type="text"
                  maxLength={20}
                  value={orderId}
                  onChange={(e) => setOrderId(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="write-review-field">
                <label htmlFor="wr-email">Email used on the order</label>
                <input
                  id="wr-email"
                  type="email"
                  maxLength={254}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
            </details>

            {/* Honeypot — visually hidden; must stay empty */}
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                left: "-10000px",
                top: "auto",
                width: 1,
                height: 1,
                overflow: "hidden",
              }}
            >
              <label htmlFor="wr-website">Website</label>
              <input
                id="wr-website"
                name="website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </div>

            <label className="write-review-consent">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <span>
                I confirm this is my genuine experience and agree to it being published
                with my display name.
              </span>
            </label>

            {error ? (
              <p className="write-review-error" role="alert">
                {error}
              </p>
            ) : null}

            <div className="write-review-actions">
              <button type="button" className="write-review-cancel" onClick={onClose}>
                Cancel
              </button>
              <button
                type="submit"
                className="write-review-submit"
                disabled={submitting}
              >
                {submitting ? "Submitting…" : "Submit review"}
              </button>
            </div>
          </form>
        )}
      </div>
      <style jsx>{`
        .write-review-overlay {
          position: fixed;
          inset: 0;
          z-index: 80;
          background: rgba(15, 23, 42, 0.45);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .write-review-dialog {
          background: #fff;
          color: #1a1a1a;
          width: min(520px, 100%);
          max-height: min(90vh, 760px);
          overflow: auto;
          border-radius: 14px;
          box-shadow: 0 18px 50px rgba(0, 0, 0, 0.22);
          padding: 20px 22px 22px;
          position: relative;
        }
        .write-review-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 14px;
        }
        .write-review-title {
          margin: 0;
          font-size: 1.25rem;
          font-weight: 700;
          line-height: 1.3;
        }
        .write-review-close {
          border: none;
          background: transparent;
          font-size: 1.5rem;
          line-height: 1;
          cursor: pointer;
          color: #666;
          padding: 0 4px;
        }
        .write-review-field {
          margin-bottom: 12px;
        }
        .write-review-field label,
        .write-review-field legend {
          display: block;
          font-size: 0.85rem;
          font-weight: 600;
          margin-bottom: 6px;
        }
        .write-review-field input[type="text"],
        .write-review-field input[type="email"],
        .write-review-field textarea {
          width: 100%;
          border: 1px solid #d4d4d8;
          border-radius: 8px;
          padding: 10px 12px;
          font: inherit;
          box-sizing: border-box;
        }
        .write-review-stars {
          border: none;
          padding: 0;
          margin: 0 0 12px;
        }
        .write-review-star-row {
          display: flex;
          gap: 6px;
        }
        .write-review-star-label {
          cursor: pointer;
          font-size: 1.4rem;
        }
        .write-review-star-label input {
          position: absolute;
          opacity: 0;
          width: 1px;
          height: 1px;
        }
        .write-review-star-label .on {
          color: #ca8a04;
        }
        .write-review-star-label .off {
          color: #d4d4d8;
        }
        .write-review-counter {
          font-size: 0.75rem;
          color: #71717a;
          text-align: right;
          margin-top: 4px;
        }
        .write-review-verify {
          margin: 8px 0 14px;
          border: 1px solid #e4e4e7;
          border-radius: 8px;
          padding: 8px 12px;
        }
        .write-review-verify summary {
          cursor: pointer;
          font-size: 0.9rem;
          font-weight: 600;
        }
        .write-review-consent {
          display: flex;
          gap: 10px;
          align-items: flex-start;
          font-size: 0.88rem;
          line-height: 1.45;
          margin: 8px 0 14px;
          cursor: pointer;
        }
        .write-review-consent input {
          margin-top: 3px;
        }
        .write-review-error {
          color: #b91c1c;
          font-size: 0.9rem;
          margin: 0 0 12px;
        }
        .write-review-success p {
          margin: 0 0 16px;
          line-height: 1.5;
        }
        .write-review-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          flex-wrap: wrap;
        }
        .write-review-cancel,
        .write-review-submit {
          border-radius: 8px;
          padding: 10px 16px;
          font: inherit;
          font-weight: 600;
          cursor: pointer;
        }
        .write-review-cancel {
          background: #f4f4f5;
          border: 1px solid #e4e4e7;
          color: #3f3f46;
        }
        .write-review-submit {
          background: #5b21b6;
          border: 1px solid #5b21b6;
          color: #fff;
        }
        .write-review-submit:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }
        .sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          border: 0;
        }
      `}</style>
    </div>
  );
}
