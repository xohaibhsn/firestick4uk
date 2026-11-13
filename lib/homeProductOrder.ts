import type { PublicListProduct } from "@/lib/productPublicDto";

const HOME_PRODUCT_MAX = 8;

/**
 * Resolve home featured products from CMS `home_product_ids`.
 * - Empty / missing key → first 8 of the sales-card list (legacy behaviour).
 * - Otherwise: ordered selection of active ids; skip missing/inactive; max 8.
 */
export function resolveHomeProducts(
  allActive: PublicListProduct[],
  homeProductIdsRaw: string | null | undefined
): PublicListProduct[] {
  const raw = String(homeProductIdsRaw || "").trim();
  if (!raw) {
    return allActive.slice(0, HOME_PRODUCT_MAX);
  }
  const byId = new Map<number, PublicListProduct>();
  for (const p of allActive) byId.set(Number(p.id), p);
  const out: PublicListProduct[] = [];
  const seen = new Set<number>();
  for (const part of raw.split(",")) {
    const id = Number(String(part).trim());
    if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue;
    const p = byId.get(id);
    if (!p) continue;
    seen.add(id);
    out.push(p);
    if (out.length >= HOME_PRODUCT_MAX) break;
  }
  return out;
}

/**
 * Build up to `max` live seasonal offer cards for PDP, excluding `selfId`,
 * ordered by earliest season_ends_at first.
 */
export function pickCurrentSeasonalOffers<
  T extends {
    id: number;
    name: string;
    slug?: string | null;
    price: number | string;
    image?: string | null;
    season_ends_at?: string | null;
  }
>(
  liveMembers: T[],
  selfId: number,
  max = 3
): Array<
  T & { season_ends_at: string; season_phase: "live" }
> {
  const others = liveMembers
    .filter((p) => Number(p.id) !== Number(selfId) && p.season_ends_at)
    .slice()
    .sort((a, b) => {
      const aMs = Date.parse(String(a.season_ends_at));
      const bMs = Date.parse(String(b.season_ends_at));
      if (!Number.isFinite(aMs) && !Number.isFinite(bMs)) return 0;
      if (!Number.isFinite(aMs)) return 1;
      if (!Number.isFinite(bMs)) return -1;
      return aMs - bMs;
    })
    .slice(0, max);
  return others.map((p) => ({
    ...p,
    season_ends_at: String(p.season_ends_at),
    season_phase: "live" as const,
  }));
}
