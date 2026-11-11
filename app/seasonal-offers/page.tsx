import type { Metadata } from "next";
import pool from "@/lib/db";
import {
  isHubLiveMember,
  isHubPastMember,
  isHubUpcomingMember,
} from "@/lib/productSeasonEligibility";
import { floorSecondUtcMs } from "@/lib/productSeasonLondon";
import { toPublicListProduct, type PublicListProduct } from "@/lib/productPublicDto";
import { resolveSeasonalHubPublicState } from "@/lib/seasonalHubPublic";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const state = await resolveSeasonalHubPublicState(pool);
  const indexable = state.effectivelyPublic;
  return {
    title: "Seasonal Offers | Firestick4UK",
    description: "Live, upcoming and past seasonal offers from Firestick4UK.",
    robots: indexable
      ? { index: true, follow: true }
      : { index: false, follow: false },
    alternates: { canonical: "https://firestick4uk.com/seasonal-offers" },
  };
}

export default async function SeasonalOffersHubPage() {
  const state = await resolveSeasonalHubPublicState(pool);
  const nowMs = floorSecondUtcMs();
  const capability = state.capability;

  let live: PublicListProduct[] = [];
  let upcoming: PublicListProduct[] = [];
  let past: PublicListProduct[] = [];

  if (state.storedPublished === true && state.effectivelyPublic) {
    live = state.rows
      .filter((r: any) => isHubLiveMember(r, nowMs, capability))
      .map((r: any) => toPublicListProduct(r));
    upcoming = state.rows
      .filter((r: any) => isHubUpcomingMember(r, nowMs, capability))
      .map((r: any) => toPublicListProduct(r));
    past = state.rows
      .filter((r: any) => isHubPastMember(r, nowMs, capability))
      .map((r: any) => toPublicListProduct(r));
  }

  // Temporary-failure / unknown flag must not be masked by an early "not published" branch.
  // HTTP remains 200 with robots noindex when not effectivelyPublic (metadata above).
  return (
    <>
      <Navbar />
      <main style={{ maxWidth: 960, margin: "0 auto", padding: "100px 20px 60px" }}>
        <h1 style={{ fontSize: 28, marginBottom: 8 }}>Seasonal Offers</h1>
        {state.temporarilyUnavailable || state.storedPublished == null ? (
          <p data-testid="seasonal-hub-unavailable" style={{ color: "#666" }}>
            Seasonal offers are temporarily unavailable. Please try again shortly.
          </p>
        ) : state.storedPublished === false ? (
          <p data-testid="seasonal-hub-unpublished" style={{ color: "#666" }}>
            This hub is not published yet.
          </p>
        ) : state.knownEmpty || !state.effectivelyPublic ? (
          <p data-testid="seasonal-hub-empty" style={{ color: "#666" }}>
            No seasonal offers are available to display right now.
          </p>
        ) : (
          <>
            <Section title="Live" testId="seasonal-hub-live" items={live} />
            <Section title="Upcoming" testId="seasonal-hub-upcoming" items={upcoming} />
            <Section
              title="Past"
              testId="seasonal-hub-past"
              items={past}
              note="Historical archive pages — purchasing may be unavailable."
            />
          </>
        )}
      </main>
      <Footer />
    </>
  );
}

function Section({
  title,
  testId,
  items,
  note,
}: {
  title: string;
  testId: string;
  items: PublicListProduct[];
  note?: string;
}) {
  if (!items.length) return null;
  return (
    <section data-testid={testId} style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 20, marginBottom: 8 }}>{title}</h2>
      {note ? <p style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>{note}</p> : null}
      <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 12 }}>
        {items.map((p) => (
          <li key={p.id} style={{ border: "1px solid #E5E5E5", borderRadius: 10, padding: 12 }}>
            <a href={`/products/${p.slug || p.id}`} style={{ color: "#5B21B6", fontWeight: 600 }}>
              {p.name}
            </a>
            <div style={{ fontSize: 14, marginTop: 4 }}>£{Number(p.price).toFixed(2)}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}
