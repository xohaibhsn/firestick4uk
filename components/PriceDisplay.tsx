"use client";

import type { CSSProperties } from "react";
import { useSiteContent } from "@/hooks/useSiteContent";
import { parsePricesIncludeVat } from "@/lib/pricesIncludeVat";

type PriceDisplayProps = {
  price: number | string | null | undefined;
  className?: string;
  /** Extra style on the outer wrapper (e.g. product-price already styled). */
  style?: CSSProperties;
  /** When true, render only the suffix span (caller already shows £amount). */
  suffixOnly?: boolean;
};

/**
 * Shows £amount, and when prices_include_vat is ON, a small "incl. VAT" suffix.
 * When OFF / CMS not loaded: amount only (identical to today's display).
 */
export default function PriceDisplay({
  price,
  className,
  style,
  suffixOnly = false,
}: PriceDisplayProps) {
  const { sc, loaded, t } = useSiteContent();
  const amount = Number(price);
  const formatted = `£${(Number.isFinite(amount) ? amount : 0).toFixed(2)}`;
  const incl =
    loaded && parsePricesIncludeVat(sc.prices_include_vat);
  const suffix = incl
    ? t("price_incl_vat_suffix", "incl. VAT")
    : "";

  if (suffixOnly) {
    if (!suffix) return null;
    return (
      <span
        className="price-incl-vat-suffix"
        data-price-incl-vat="1"
        style={{
          display: "inline-block",
          marginLeft: 6,
          fontSize: "0.72em",
          fontWeight: 600,
          color: "#666",
          verticalAlign: "middle",
        }}
      >
        {suffix}
      </span>
    );
  }

  return (
    <span className={className} style={style} data-price-display="1">
      {formatted}
      {suffix ? (
        <span
          className="price-incl-vat-suffix"
          data-price-incl-vat="1"
          style={{
            display: "inline-block",
            marginLeft: 6,
            fontSize: "0.72em",
            fontWeight: 600,
            color: "#666",
            verticalAlign: "middle",
          }}
        >
          {suffix}
        </span>
      ) : null}
    </span>
  );
}
