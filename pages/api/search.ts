import type { NextApiRequest, NextApiResponse } from 'next';
import { RL_SEARCH, getClientIp } from '../../lib/rateLimit';
import pool from '../../lib/db';
import { detectProductSchemaCapability } from '../../lib/productSchemaCapabilityServer';
import { isSalesCardEligible } from '../../lib/productSeasonEligibility';
import { floorSecondUtcMs, normalizeSeasonalUtcFields } from '../../lib/productSeasonLondon';
import { queryWithSeasonalUtc } from '../../lib/productSeasonalQuery';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { allowed } = RL_SEARCH(getClientIp(req));
  if (!allowed) return res.status(429).json({ error: 'Too many requests' });

  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.status(200).json([]);

  try {
    const capability = await detectProductSchemaCapability();
    const nowMs = floorSecondUtcMs();
    const term = `%${q}%`;
    const seasonalCols =
      capability.mode === 'expanded'
        ? ', lifecycle_mode, shop_listed, season_paused, season_starts_at, season_ends_at, product_version'
        : '';
    const [rows]: any = await queryWithSeasonalUtc(
      pool,
      `SELECT id, name, price, image, category, badge, active, stock,
        COALESCE(NULLIF(slug, ''), LOWER(REPLACE(REPLACE(name, ' ', '-'), '/', ''))) as slug
        ${seasonalCols}
       FROM products
       WHERE active=1 AND (name LIKE ? OR short_description LIKE ? OR focus_keyword LIKE ?)
       LIMIT 24`,
      [term, term, term]
    );
    const list = (Array.isArray(rows) ? rows : []).map((r: any) => normalizeSeasonalUtcFields(r));
    const filtered = list
      .filter((r: Record<string, unknown>) => isSalesCardEligible(r, nowMs, capability))
      .slice(0, 6)
      .map((r: any) => ({
        id: r.id,
        name: r.name,
        price: r.price,
        image: r.image,
        category: r.category,
        badge: r.badge,
        slug: r.slug,
      }));
    return res.status(200).json(filtered);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
