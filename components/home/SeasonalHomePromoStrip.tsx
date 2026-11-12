"use client";

import SeasonalCountdown from "@/components/product/SeasonalCountdown";

/**
 * Thin home promo strip. Text/CTA come from SSR props (no client fetch).
 * Optional countdown uses the shared SeasonalCountdown presentation component.
 */
export default function SeasonalHomePromoStrip({
  text,
  cta,
  endsAt,
  showCountdown,
  prefix,
  upcomingPrefix,
}: {
  text: string;
  cta: string;
  endsAt?: string | null;
  showCountdown?: boolean;
  prefix?: string;
  upcomingPrefix?: string;
}) {
  return (
    <div
      data-testid="seasonal-home-promo"
      style={{
        background: "#4C1D95",
        color: "#FFFFFF",
        padding: "10px 16px",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "center",
        gap: "10px 16px",
        fontSize: 14,
        fontWeight: 600,
        minHeight: 44,
        boxSizing: "border-box",
      }}
    >
      <span data-testid="seasonal-home-promo-text">{text}</span>
      <a
        href="/seasonal-offers"
        data-testid="seasonal-home-promo-cta"
        style={{
          color: "#FFFFFF",
          textDecoration: "underline",
          textUnderlineOffset: 3,
          fontWeight: 700,
        }}
      >
        {cta}
      </a>
      {showCountdown && endsAt ? (
        <div style={{ flexBasis: "100%", display: "flex", justifyContent: "center" }}>
          <div style={{ maxWidth: 420, width: "100%" }}>
            <SeasonalCountdown
              phase="live"
              show
              endsAt={endsAt}
              prefix={prefix}
              upcomingPrefix={upcomingPrefix}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
