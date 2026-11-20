"use client";

import { useEffect, useRef, useState } from "react";
import { useSharedSecondTicker } from "@/hooks/useSharedSecondTicker";
import { parseUtcSqlToMs } from "@/lib/productSeasonLondon";
import { formatSeasonalCompactHms } from "@/lib/seasonalCountdownLabel";
import {
  normalizeSeasonalPromoStyle,
  type SeasonalPromoStyle,
} from "@/lib/seasonalPromoStyle";

/** Fixed navbar offset used site-wide for home page-wrapper. */
export const HOME_NAV_OFFSET_PX = 80;
/** Reserved announcement-bar height (SSR + client; avoids CLS). */
export const HOME_PROMO_BAR_HEIGHT_PX = 44;

const PROMO_STYLE_TOKENS = {
  classic: {
    barBg: "#4C1D95",
    pillBg: "rgba(255,255,255,0.22)",
    pillColor: "#FFFFFF",
    ctaColor: "#FFFFFF",
  },
  "red-alert": {
    barBg: "#C81E1E",
    pillBg: "#FFFFFF",
    pillColor: "#B91C1C",
    ctaColor: "#FFFFFF",
  },
  "black-friday": {
    barBg: "#111111",
    pillBg: "#FBBF24",
    pillColor: "#111111",
    ctaColor: "#FBBF24",
  },
  "timer-pulse": {
    barBg: "#4C1D95",
    pillBg: "#DC2626",
    pillColor: "#FFFFFF",
    ctaColor: "#FFFFFF",
  },
} as const;

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
  promoStyle,
}: {
  text: string;
  cta: string;
  href: string;
  endsAt?: string | null;
  /** Fires once when remaining hits 0 so parent can drop navbar+bar offset. */
  onEnded?: () => void;
  promoStyle?: SeasonalPromoStyle;
}) {
  const style = normalizeSeasonalPromoStyle(promoStyle);
  const tokens = PROMO_STYLE_TOKENS[style];
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
      className={`seasonal-home-promo-bar seasonal-home-promo-bar--${style}`}
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
        background: tokens.barBg,
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
        @keyframes f4ukPromoBlink {
          0%,49% { background-color:#C81E1E; }
          50%,100% { background-color:#7F1D1D; }
        }
        a.seasonal-home-promo-bar--red-alert {
          animation: f4ukPromoBlink 1s steps(1,end) 0s 5;
        }
        @keyframes f4ukPromoPulse {
          0%,100% { box-shadow:0 0 0 0 rgba(220,38,38,0.7); }
          50% { box-shadow:0 0 0 6px rgba(220,38,38,0); }
        }
        a.seasonal-home-promo-bar--timer-pulse [data-testid="seasonal-home-promo-countdown"] {
          animation: f4ukPromoPulse 2s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          a.seasonal-home-promo-bar--red-alert,
          a.seasonal-home-promo-bar--timer-pulse [data-testid="seasonal-home-promo-countdown"] {
            animation: none;
          }
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
                background: tokens.pillBg,
                color: tokens.pillColor,
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
        <span
          data-testid="seasonal-home-promo-cta"
          style={{ fontWeight: 800, color: tokens.ctaColor }}
        >
          {cta} →
        </span>
      </span>
    </a>
  );
}
