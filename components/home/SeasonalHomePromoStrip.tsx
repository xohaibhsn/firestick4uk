"use client";

import { useEffect, useRef, useState } from "react";
import { useSharedSecondTicker } from "@/hooks/useSharedSecondTicker";
import { parseUtcSqlToMs } from "@/lib/productSeasonLondon";
import { formatSeasonalCompactHms } from "@/lib/seasonalCountdownLabel";

/** Fixed navbar offset used site-wide for home page-wrapper. */
export const HOME_NAV_OFFSET_PX = 80;
/** Reserved announcement-bar height (SSR + client; avoids CLS). */
export const HOME_PROMO_BAR_HEIGHT_PX = 44;

/**
 * Slim home announcement bar. Text/CTA/href/endsAt come from SSR props only (no network).
 * Whole bar is one link; compact Nd HH:MM:SS countdown via shared ticker (not PDP boxes).
 * Sits fixed directly below the navbar; hides client-side when countdown hits 0.
 */
export default function SeasonalHomePromoStrip({
  text,
  cta,
  href,
  endsAt,
  onEnded,
}: {
  text: string;
  cta: string;
  href: string;
  endsAt?: string | null;
  /** Fires once when remaining hits 0 so parent can drop navbar+bar offset. */
  onEnded?: () => void;
}) {
  const endMs = endsAt ? parseUtcSqlToMs(endsAt) : null;
  const ticking = endMs != null;
  const nowMs = useSharedSecondTicker(ticking);
  const remainingSec =
    ticking && endMs != null ? Math.floor((endMs - nowMs) / 1000) : null;
  const ended = remainingSec != null && remainingSec <= 0;
  const endedNotified = useRef(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    endedNotified.current = false;
    setHidden(false);
  }, [endsAt]);

  useEffect(() => {
    if (!ended || endedNotified.current) return;
    endedNotified.current = true;
    setHidden(true);
    onEnded?.();
  }, [ended, onEnded]);

  if (hidden || ended) return null;

  const compact =
    remainingSec == null ? "" : formatSeasonalCompactHms(remainingSec);
  const ariaLabel = `${text} — opens offer`;

  return (
    <a
      href={href}
      className="seasonal-home-promo-bar"
      data-testid="seasonal-home-promo"
      aria-label={ariaLabel}
      style={{
        position: "fixed",
        top: HOME_NAV_OFFSET_PX,
        left: 0,
        right: 0,
        zIndex: 99,
        height: HOME_PROMO_BAR_HEIGHT_PX,
        minHeight: HOME_PROMO_BAR_HEIGHT_PX,
        maxHeight: HOME_PROMO_BAR_HEIGHT_PX,
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: "0 12px",
        background: "#4C1D95",
        color: "#FFFFFF",
        textDecoration: "none",
        fontSize: 13,
        fontWeight: 600,
        lineHeight: 1.25,
        textAlign: "center",
        overflow: "hidden",
      }}
    >
      <style>{`
        a.seasonal-home-promo-bar:focus-visible {
          outline: 2px solid #FDE68A;
          outline-offset: 2px;
        }
      `}</style>
      <span
        data-testid="seasonal-home-promo-text"
        style={{
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          maxWidth: "100%",
        }}
      >
        <span aria-hidden="true">🔥 </span>
        {text}
        {compact ? (
          <>
            {" · ends in "}
            <span
              data-testid="seasonal-home-promo-countdown"
              role="timer"
              aria-live="off"
              style={{
                display: "inline-block",
                padding: "2px 8px",
                borderRadius: 999,
                background: "rgba(255,255,255,0.22)",
                color: "#FFFFFF",
                fontWeight: 700,
                fontVariantNumeric: "tabular-nums",
                letterSpacing: "0.01em",
                whiteSpace: "nowrap",
              }}
            >
              {compact}
            </span>
          </>
        ) : null}
        {" · "}
        <span data-testid="seasonal-home-promo-cta" style={{ fontWeight: 800 }}>
          {cta} →
        </span>
      </span>
    </a>
  );
}
