/**
 * Resolve CMS-selected Available / Upcoming alternative cards for public SSR.
 */
import type { Pool } from "mysql2/promise";
import type { SchemaCapability } from "@/lib/productSchemaCapability";
import {
  filterAvailableOfferIds,
  filterUpcomingOfferIds,
  parseProductIdArray,
  type ProductOpsRow,
} from "@/lib/productSeasonEligibility";
import { normalizeSeasonalUtcFields } from "@/lib/productSeasonLondon";
import { queryWithSeasonalUtc } from "@/lib/productSeasonalQuery";
import { toPublicListProduct } from "@/lib/productPublicDto";

export type AltPresentation = {
  id: number;
  name: string;
  slug?: string | null;
  price: number | string;
  image?: string | null;
  kind: "available" | "upcoming";
};

export async function loadSeasonalAlternativeCards(opts: {
  db: { query: Pool["query"] };
  selfId: number;
  availableRaw: unknown;
  upcomingRaw: unknown;
  nowMs: number;
  capability: SchemaCapability;
}): Promise<{ available: AltPresentation[]; upcoming: AltPresentation[] }> {
  if (opts.capability.mode !== "expanded") {
    return { available: [], upcoming: [] };
  }
  const availParsed = parseProductIdArray(opts.availableRaw);
  const upParsed = parseProductIdArray(opts.upcomingRaw);
  if (!availParsed.ok && !upParsed.ok) return { available: [], upcoming: [] };
  const availIds = availParsed.ok ? availParsed.ids : [];
  const upIds = upParsed.ok ? upParsed.ids : [];
  const all = [...new Set([...availIds, ...upIds])].filter((id) => id !== opts.selfId);
  if (!all.length) return { available: [], upcoming: [] };

  const placeholders = all.map(() => "?").join(",");
  try {
    const [rows]: any = await queryWithSeasonalUtc(
      opts.db,
      `SELECT id, name, description, short_description, slug, price, badge, image, category, active,
              lifecycle_mode, shop_listed, season_paused, season_starts_at, season_ends_at, product_version
       FROM products WHERE id IN (${placeholders}) AND active = 1`,
      all
    );
    const list = (Array.isArray(rows) ? rows : []).map((r: any) =>
      normalizeSeasonalUtcFields(r)
    ) as ProductOpsRow[];
    const byId = new Map<number, ProductOpsRow>();
    for (const r of list) byId.set(Number(r.id), r);

    const availFiltered = filterAvailableOfferIds(
      opts.selfId,
      availIds,
      byId,
      opts.nowMs,
      opts.capability
    );
    const upFiltered = filterUpcomingOfferIds(
      opts.selfId,
      upIds,
      byId,
      opts.nowMs,
      opts.capability
    );

    const available: AltPresentation[] = availFiltered.map((id) => {
      const row = byId.get(id)!;
      const card = toPublicListProduct(row as any);
      return {
        id: card.id,
        name: card.name,
        slug: card.slug,
        price: card.price,
        image: card.image,
        kind: "available" as const,
      };
    });
    const upcoming: AltPresentation[] = upFiltered.map((id) => {
      const row = byId.get(id)!;
      const card = toPublicListProduct(row as any);
      return {
        id: card.id,
        name: card.name,
        slug: card.slug,
        price: card.price,
        image: card.image,
        kind: "upcoming" as const,
      };
    });
    return { available, upcoming };
  } catch {
    return { available: [], upcoming: [] };
  }
}
