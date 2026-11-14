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

  const suffixStyle: CSSProperties = {
    display: "inline-block",
    marginLeft: 6,
    fontSize: "0.72em",
    fontWeight: 600,
    color: "#666",
    verticalAlign: "middle",
  };

  if (suffixOnly) {
    if (!suffix) return null;
    return (
      <span
        className="price-incl-vat-suffix"
        data-price-incl-vat="1"
        style={suffixStyle}
      >
        {suffix}
      </span>
    );
  }

  return (
    <>
      <style>{`
        .price-display-wrap {
          display: inline-flex;
          flex-wrap: wrap;
          align-items: baseline;
          gap: 0 6px;
          min-width: 0;
          max-width: 100%;
        }
        .price-display-wrap .price-incl-vat-suffix {
          margin-left: 0;
        }
        /* Narrow card / mobile: stack "incl. VAT" under the price */
        @media (max-width: 520px) {
          .price-display-wrap {
            flex-direction: column;
            align-items: flex-start;
            gap: 2px;
          }
          .price-display-wrap .price-incl-vat-suffix {
            margin-left: 0 !important;
            display: block;
            line-height: 1.2;
          }
        }
        /* Shared card price+CTA row: wrap / stack on narrow cards */
        .product-footer {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          min-width: 0;
        }
        .product-footer .product-price,
        .product-footer [data-price-display] {
          min-width: 0;
          flex: 1 1 auto;
        }
        .product-footer .add-btn {
          flex: 0 1 auto;
          min-width: 0;
          min-height: 40px;
          box-sizing: border-box;
        }
        @media (max-width: 520px) {
          .product-footer {
            flex-direction: column;
            align-items: stretch;
          }
          .product-footer .product-price {
            white-space: normal;
            width: 100%;
          }
          .product-footer .add-btn {
            width: 100%;
            flex: 1 1 100%;
            min-height: 40px;
          }
        }
      `}</style>
      <span
        className={["price-display-wrap", className].filter(Boolean).join(" ")}
        style={style}
        data-price-display="1"
        data-price-row="wrap"
      >
        <span className="price-display-amount">{formatted}</span>
        {suffix ? (
          <span
            className="price-incl-vat-suffix"
            data-price-incl-vat="1"
            style={suffixStyle}
          >
            {suffix}
          </span>
        ) : null}
      </span>
    </>
  );
}
