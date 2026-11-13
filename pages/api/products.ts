import type { NextApiRequest, NextApiResponse } from 'next';
import { RL_GENERAL, getClientIp } from '../../lib/rateLimit';
import pool from '../../lib/db';
import { detectProductSchemaCapability } from '../../lib/productSchemaCapabilityServer';
import {
  filterSalesCardRows,
  PUBLIC_DETAIL_SQL_EXPANDED,
  PUBLIC_DETAIL_SQL_LEGACY,
  PUBLIC_LIST_SQL,
  toPublicDetailProduct,
  toPublicListProduct,
} from '../../lib/productPublicDto';
import { floorSecondUtcMs, normalizeSeasonalUtcFields } from '../../lib/productSeasonLondon';
import { queryWithSeasonalUtc } from '../../lib/productSeasonalQuery';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { allowed } = RL_GENERAL(getClientIp(req));
  if (!allowed) return res.status(429).json({ error: 'Too many requests' });

  try {
    const { slug, id, category, minPrice, maxPrice, sort } = req.query;
    const capability = await detectProductSchemaCapability();
    const nowMs = floorSecondUtcMs();
    const detailSql =
      capability.mode === 'expanded' ? PUBLIC_DETAIL_SQL_EXPANDED : PUBLIC_DETAIL_SQL_LEGACY;

    if (id) {
      const [rows]: any = await queryWithSeasonalUtc(
        pool,
        `SELECT ${detailSql} FROM products WHERE id=? AND active=1`,
        [id]
      );
      const row = rows[0] ? normalizeSeasonalUtcFields(rows[0]) : null;
      if (!row) return res.status(200).json(null);
      return res.status(200).json(toPublicDetailProduct(row, nowMs, capability));
    }

    if (slug) {
      const s = String(slug).toLowerCase();
      const [rows]: any = await queryWithSeasonalUtc(
        pool,
        `SELECT ${detailSql} FROM products
         WHERE active=1 AND (
           slug = ?
           OR LOWER(REPLACE(REPLACE(name,' ','-'),'/','')) = ?
         )
         LIMIT 1`,
        [s, s]
      );
      const row = rows[0] ? normalizeSeasonalUtcFields(rows[0]) : null;
      if (!row) return res.status(200).json(null);
      return res.status(200).json(toPublicDetailProduct(row, nowMs, capability));
    }

    // List / filter — lightweight DTO; sales-card eligibility applied.
    let selectCols = PUBLIC_LIST_SQL;
    if (capability.mode === 'expanded') {
      selectCols += ', lifecycle_mode, shop_listed, season_paused, season_starts_at, season_ends_at, product_version';
    }

    let query = `SELECT ${selectCols} FROM products WHERE active=1`;
    const params: any[] = [];

    if (category && category !== 'All') {
      query += ' AND category=?';
      params.push(category);
    }
    if (minPrice) {
      query += ' AND price >= ?';
      params.push(Number(minPrice));
    }
    if (maxPrice) {
      query += ' AND price <= ?';
      params.push(Number(maxPrice));
    }

    const sortMap: Record<string, string> = {
      price_asc: 'price ASC',
      price_desc: 'price DESC',
      newest: 'created_at DESC',
      featured: 'id ASC',
    };
    query += ` ORDER BY ${sortMap[String(sort)] || 'id ASC'}`;

    const [rows] = await queryWithSeasonalUtc(pool, query, params);
    const list = (Array.isArray(rows) ? (rows as Record<string, unknown>[]) : []).map((r) =>
      normalizeSeasonalUtcFields(r)
    );
    const eligible = filterSalesCardRows(list, nowMs, capability);
    return res.status(200).json(
      eligible.map((r) => toPublicListProduct(r, { nowMs, capability }))
    );
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
