"use client";

import { useState } from "react";
import { useCart } from "@/app/lib/cartContext";
import SeasonalCardCountdown from "@/components/product/SeasonalCardCountdown";

export type CurrentSeasonalOfferCard = {
  id: number;
  name: string;
  slug?: string | null;
  price: number | string;
  image?: string | null;
  season_ends_at?: string | null;
  season_phase?: "live";
};

/**
 * "Current Seasonal Offers" under the PDP buy box — up to 3 live seasonal products
 * (server-selected, earliest end first). Uses existing cart add flow.
 */
export default function CurrentSeasonalOffers({
  enabled,
  heading,
  offers,
}: {
  enabled: boolean;
  heading: string;
  offers: CurrentSeasonalOfferCard[];
}) {
  const { addToCart, cart } = useCart();
  const [addedId, setAddedId] = useState<number | null>(null);
  const [endedIds, setEndedIds] = useState<Record<number, true>>({});

  if (!enabled || !offers.length) return null;

  return (
    <section
      data-testid="current-seasonal-offers"
      style={{
        marginTop: 22,
        paddingTop: 18,
        borderTop: "1px solid #E5E5E5",
      }}
    >
      <h2
        style={{
          fontSize: 18,
          fontWeight: 800,
          color: "#111111",
          margin: "0 0 14px",
          fontFamily: "var(--font-display)",
        }}
      >
        {heading}
      </h2>
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "grid",
          gap: 12,
        }}
      >
        {offers.map((p) => {
          const href = `/products/${p.slug || p.id}`;
          const inCart = cart.some((i) => i.id === p.id);
          const ended = Boolean(endedIds[p.id]);
          return (
            <li
              key={p.id}
              data-testid="current-seasonal-offer-card"
              style={{
                border: "1px solid #E5E5E5",
                borderRadius: 12,
                padding: 12,
                display: "flex",
                gap: 12,
                alignItems: "center",
                flexWrap: "wrap",
                background: "#FFFFFF",
              }}
            >
              <a href={href} style={{ flexShrink: 0 }}>
                {p.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.image}
                    alt=""
                    width={64}
                    height={64}
                    style={{ borderRadius: 8, objectFit: "cover", display: "block" }}
                  />
                ) : (
                  <div
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: 8,
                      background: "#F3F4F6",
                    }}
                  />
                )}
              </a>
              <div style={{ flex: "1 1 140px", minWidth: 0 }}>
                <a
                  href={href}
                  style={{
                    color: "#5B21B6",
                    fontWeight: 700,
                    textDecoration: "none",
                    fontSize: 15,
                  }}
                >
                  {p.name}
                </a>
                <div style={{ fontSize: 15, fontWeight: 800, marginTop: 4 }}>
                  £{Number(p.price).toFixed(2)}
                </div>
                <SeasonalCardCountdown
                  endsAt={p.season_ends_at}
                  phase={p.season_phase || "live"}
                  onEnded={() =>
                    setEndedIds((prev) =>
                      prev[p.id] ? prev : { ...prev, [p.id]: true }
                    )
                  }
                />
              </div>
              <button
                type="button"
                data-insights-id="cart_add"
                data-testid="current-seasonal-offer-atc"
                disabled={ended}
                onClick={() => {
                  if (ended) return;
                  addToCart({
                    id: p.id,
                    name: p.name,
                    price: Number(p.price),
                    qty: 1,
                    image: p.image || undefined,
                  });
                  setAddedId(p.id);
                  window.setTimeout(() => setAddedId((cur) => (cur === p.id ? null : cur)), 1500);
                }}
                style={{
                  background: ended
                    ? "#9CA3AF"
                    : inCart || addedId === p.id
                      ? "#16A34A"
                      : "#5B21B6",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  padding: "10px 14px",
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: ended ? "not-allowed" : "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {ended
                  ? "Offer ended"
                  : inCart || addedId === p.id
                    ? "Added!"
                    : "Add to Cart"}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
