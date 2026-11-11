"use client";

export type SeasonalAltCard = {
  id: number;
  name: string;
  slug?: string | null;
  price: number | string;
  image?: string | null;
  kind: "available" | "upcoming";
};

export default function SeasonalAlternativeCards({
  heading,
  available,
  upcoming,
}: {
  heading?: string | null;
  available: SeasonalAltCard[];
  upcoming: SeasonalAltCard[];
}) {
  if (!available.length && !upcoming.length) return null;

  return (
    <div data-testid="seasonal-alternatives" style={{ marginTop: 28 }}>
      {available.length > 0 ? (
        <section data-testid="seasonal-available-offers" style={{ marginBottom: 22 }}>
          <h2 style={{ fontSize: 18, marginBottom: 12 }}>
            {heading?.trim() || "Available Offers"}
          </h2>
          <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 12 }}>
            {available.map((p) => (
              <li
                key={`a-${p.id}`}
                style={{
                  border: "1px solid #E5E5E5",
                  borderRadius: 12,
                  padding: 12,
                  display: "flex",
                  gap: 12,
                  alignItems: "center",
                }}
              >
                {p.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.image}
                    alt=""
                    width={56}
                    height={56}
                    style={{ borderRadius: 8, objectFit: "cover" }}
                  />
                ) : null}
                <div style={{ flex: 1 }}>
                  <a
                    href={`/products/${p.slug || p.id}`}
                    style={{ color: "#5B21B6", fontWeight: 700, textDecoration: "none" }}
                  >
                    {p.name}
                  </a>
                  <div style={{ fontSize: 14, marginTop: 4 }}>£{Number(p.price).toFixed(2)}</div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {upcoming.length > 0 ? (
        <section data-testid="seasonal-upcoming-offers">
          <h2 style={{ fontSize: 18, marginBottom: 8 }}>Upcoming Offers</h2>
          <p style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>
            These seasonal offers are not available to purchase yet.
          </p>
          <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 12 }}>
            {upcoming.map((p) => (
              <li
                key={`u-${p.id}`}
                style={{
                  border: "1px solid #E5E5E5",
                  borderRadius: 12,
                  padding: 12,
                  display: "flex",
                  gap: 12,
                  alignItems: "center",
                }}
              >
                {p.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.image}
                    alt=""
                    width={56}
                    height={56}
                    style={{ borderRadius: 8, objectFit: "cover" }}
                  />
                ) : null}
                <div style={{ flex: 1 }}>
                  <a
                    href={`/products/${p.slug || p.id}`}
                    style={{ color: "#5B21B6", fontWeight: 700, textDecoration: "none" }}
                  >
                    {p.name}
                  </a>
                  <div style={{ fontSize: 14, marginTop: 4 }}>£{Number(p.price).toFixed(2)}</div>
                  <div style={{ fontSize: 12, color: "#92400E", marginTop: 4 }}>Upcoming</div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
