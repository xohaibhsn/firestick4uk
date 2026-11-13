import type { NextApiRequest, NextApiResponse } from 'next';
import pool from '../../lib/db';
import { getRequestMeta, requireAdminPermission } from '../../lib/adminAuth';
import { recordAdminAudit } from '../../lib/adminAudit';
import { setAdminNoStore } from '../../lib/adminNoStore';
import { recordContentRevision, snapshotProduct } from '../../lib/contentRevisions';
import { invalidateSitemapCache } from '../../lib/hostingerResourceInvalidation';
import {
  runPostSaveSeoGuard,
  shouldRunPostSaveSeoGuard,
} from '../../lib/postSaveSeoGuard';
import { parseProductVisibilityPayload } from '../../lib/productVisibility';
import { applyProductVisibilityChange } from '../../lib/productVisibilityServer';
import { parseSeasonActionPayload } from '../../lib/productSeasonActions';
import { applySeasonAction } from '../../lib/productSeasonServer';
import { detectProductSchemaCapability } from '../../lib/productSchemaCapabilityServer';
import {
  assertSingleUpdate,
  gateExpectedVersionAllowMaxNoop,
  lockProductRow,
} from '../../lib/productWriterTx';
import { normalizeSeasonalUtcFields } from '../../lib/productSeasonLondon';
import { queryWithSeasonalUtc } from '../../lib/productSeasonalQuery';
import { PRODUCT_VERSION_MAX } from '../../lib/productSeasonActions';

const PRODUCT_CATEGORIES = ['Subscription', 'Device', 'Bundle'] as const;

const OPTIONAL_STRING_FIELDS = [
  'description',
  'short_description',
  'full_description',
  'badge',
  'image',
  'stock',
  'seo_title',
  'meta_description',
  'focus_keyword',
  'features',
  'og_image',
] as const;

function toSlug(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function hasOwn(body: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(body, key);
}

function normalizeOptionalString(value: unknown): string | null {
  if (value === null) return null;
  return String(value);
}

function normalizeNullableImage(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s ? s : null;
}

const PRICE_ERROR = 'Price must be a finite non-negative number';

/** Whole pounds or up to 2 decimal places; optional thousands commas. No silent junk stripping. */
const STRICT_PRICE_NUMERIC = /^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?$/;

function validatePrice(value: unknown): { ok: true; price: number } | { ok: false; error: string } {
  if (value === null || value === undefined || value === '') {
    return { ok: false, error: PRICE_ERROR };
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) {
      return { ok: false, error: PRICE_ERROR };
    }
    // At most 2 decimal places (reject float junk / excess precision)
    if (Math.abs(value * 100 - Math.round(value * 100)) > 1e-6) {
      return { ok: false, error: PRICE_ERROR };
    }
    return { ok: true, price: value };
  }

  if (typeof value !== 'string') {
    return { ok: false, error: PRICE_ERROR };
  }

  let raw = value.trim();
  if (!raw || /^(nan|infinity|\+infinity|-infinity)$/i.test(raw)) {
    return { ok: false, error: PRICE_ERROR };
  }

  // Normalize only explicitly supported formatting: optional £ + surrounding whitespace
  if (raw.startsWith('£')) {
    raw = raw.slice(1).trim();
  }

  // Entire remaining string must match; do not strip letters or arbitrary characters
  if (!STRICT_PRICE_NUMERIC.test(raw)) {
    return { ok: false, error: PRICE_ERROR };
  }

  const n = Number(raw.replace(/,/g, ''));
  if (!Number.isFinite(n) || n < 0) {
    return { ok: false, error: PRICE_ERROR };
  }
  return { ok: true, price: n };
}

function validateCategory(value: unknown): { ok: true; category: string } | { ok: false; error: string } {
  const c = String(value || '').trim();
  if (!(PRODUCT_CATEGORIES as readonly string[]).includes(c)) {
    return { ok: false, error: `Category must be one of: ${PRODUCT_CATEGORIES.join(', ')}` };
  }
  return { ok: true, category: c };
}

function valuesEqual(a: unknown, b: unknown): boolean {
  const na = a === null || a === undefined ? '' : String(a);
  const nb = b === null || b === undefined ? '' : String(b);
  return na === nb;
}

function pricesEqual(a: unknown, b: unknown): boolean {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb;
  return valuesEqual(a, b);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') setAdminNoStore(res);
  const admin = await requireAdminPermission(req, res, 'products.manage');
  if (!admin) return;

  try {
    if (req.method === 'GET') {
      const [rows] = await queryWithSeasonalUtc(
        pool,
        'SELECT * FROM products ORDER BY created_at DESC'
      );
      const list = (Array.isArray(rows) ? rows : []).map((r: any) =>
        normalizeSeasonalUtcFields(r as Record<string, unknown>)
      );
      return res.status(200).json(list);
    }

    if (req.method === 'POST') {
      const body = (req.body || {}) as Record<string, unknown>;
      const name = String(body.name || '').trim();
      const finalSlug = toSlug(String(body.slug || name));
      if (!name || !finalSlug) {
        return res.status(400).json({ error: 'Name and slug are required' });
      }

      const priceCheck = validatePrice(body.price);
      if (!priceCheck.ok) return res.status(400).json({ error: priceCheck.error });

      const categoryCheck = validateCategory(body.category);
      if (!categoryCheck.ok) return res.status(400).json({ error: categoryCheck.error });

      const shortDesc = String(body.short_description || '');
      const finalSeoTitle = String(body.seo_title || '').trim() || name;
      const finalMetaDesc =
        String(body.meta_description || '').trim() || shortDesc.trim() || '';

      try {
        const [result]: any = await pool.query(
          `INSERT INTO products (name, slug, description, price, category, badge, image, stock, active,
            short_description, full_description, seo_title, meta_description, focus_keyword, features, og_image)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`,
          [
            name,
            finalSlug,
            String(body.description || ''),
            priceCheck.price,
            categoryCheck.category,
            body.badge != null && String(body.badge).trim() !== '' ? String(body.badge) : null,
            normalizeNullableImage(body.image),
            String(body.stock || 'Digital'),
            shortDesc,
            String(body.full_description || ''),
            finalSeoTitle,
            finalMetaDesc,
            String(body.focus_keyword || ''),
            String(body.features || ''),
            String(body.og_image || ''),
          ]
        );
        const { ip } = getRequestMeta(req);
        await recordAdminAudit({
          actor: admin,
          action: 'product.created',
          entityType: 'product',
          entityId: result.insertId,
          summary: `Created product ${name}`,
          metadata: { slug: finalSlug },
          ip,
        });
        invalidateSitemapCache();
        const seo_guard = await runPostSaveSeoGuard({
          entityType: 'product',
          entityId: result.insertId,
          operation: 'create',
        });
        return res.status(200).json({
          success: true,
          id: result.insertId,
          slug: finalSlug,
          seo_guard,
        });
      } catch (err: any) {
        if (err?.code === 'ER_DUP_ENTRY') {
          return res.status(409).json({ error: 'Slug already exists. Choose a different URL slug.' });
        }
        throw err;
      }
    }

    if (req.method === 'PUT') {
      const body = (req.body || {}) as Record<string, unknown>;
      const id = Number(body.id);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ error: 'Valid product id is required' });
      }

      const OPS_REJECT = [
        'lifecycle_mode',
        'shop_listed',
        'season_name',
        'season_starts_at',
        'season_ends_at',
        'season_paused',
        'season_show_countdown',
        'season_ended_notice',
        'available_offers_heading',
        'season_available_ids',
        'season_upcoming_ids',
        'action',
      ];
      for (const k of OPS_REJECT) {
        if (hasOwn(body, k)) {
          return res.status(400).json({
            error: `Ordinary PUT cannot change ${k}; use lifecycle PATCH actions`,
            code: 'validation',
          });
        }
      }

      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const locked = await lockProductRow(conn, id);
        if (!locked.ok) {
          await conn.rollback();
          return res.status(404).json({ error: locked.error, code: locked.code });
        }
        const current = locked.row;
        const expandedOps = Object.prototype.hasOwnProperty.call(current, 'product_version');

        // Merge omitted content from locked authoritative row (never restore obsolete slug).
        let name = String(current.name || '');
        if (hasOwn(body, 'name')) {
          name = String(body.name || '').trim();
          if (!name) {
            await conn.rollback();
            return res.status(400).json({ error: 'Name cannot be empty' });
          }
        }

        let slug = String(current.slug || '');
        if (hasOwn(body, 'slug')) {
          const nextSlug = toSlug(String(body.slug || ''));
          if (!nextSlug) {
            await conn.rollback();
            return res.status(400).json({ error: 'Slug cannot be empty' });
          }
          const currentNorm = toSlug(String(current.slug || '')) || String(current.slug || '').trim();
          if (nextSlug !== currentNorm) {
            await conn.rollback();
            return res.status(409).json({
              error:
                'Existing product URL slug is protected. Use a controlled SEO migration with a permanent redirect before changing this URL.',
            });
          }
          slug = nextSlug;
        }

        let price = Number(current.price);
        if (hasOwn(body, 'price')) {
          const priceCheck = validatePrice(body.price);
          if (!priceCheck.ok) {
            await conn.rollback();
            return res.status(400).json({ error: priceCheck.error });
          }
          price = priceCheck.price;
        }

        let category = String(current.category || '');
        if (hasOwn(body, 'category')) {
          const categoryCheck = validateCategory(body.category);
          if (!categoryCheck.ok) {
            await conn.rollback();
            return res.status(400).json({ error: categoryCheck.error });
          }
          category = categoryCheck.category;
        }

        let active = Number(current.active) === 1 ? 1 : 0;
        if (expandedOps) {
          if (hasOwn(body, 'active')) {
            await conn.rollback();
            return res.status(400).json({
              error: 'Ordinary PUT cannot change active; use set_private_active PATCH',
              code: 'validation',
            });
          }
        } else if (hasOwn(body, 'active')) {
          if (body.active !== 0 && body.active !== 1) {
            await conn.rollback();
            return res.status(400).json({
              error: 'active must be exactly 0 or 1 when provided',
              code: 'validation',
            });
          }
          active = body.active as 0 | 1;
        }

        const merged: Record<string, unknown> = {
          name,
          slug,
          price,
          category,
          active,
          description: current.description ?? '',
          short_description: current.short_description ?? '',
          full_description: current.full_description ?? '',
          badge: current.badge,
          image: current.image,
          stock: current.stock ?? 'Digital',
          seo_title: current.seo_title ?? '',
          meta_description: current.meta_description ?? '',
          focus_keyword: current.focus_keyword ?? '',
          features: current.features ?? '',
          og_image: current.og_image ?? '',
        };

        for (const field of OPTIONAL_STRING_FIELDS) {
          if (!hasOwn(body, field)) continue;
          if (field === 'image' || field === 'badge') {
            merged[field] = normalizeNullableImage(body[field]);
            if (field === 'badge' && body[field] !== null && String(body[field]).trim() !== '') {
              merged.badge = String(body[field]);
            } else if (field === 'badge') {
              merged.badge = null;
            }
            continue;
          }
          merged[field] = normalizeOptionalString(body[field]) ?? '';
        }

        const changedFields: string[] = [];
        const track = (key: string, next: unknown, prev: unknown) => {
          if (!valuesEqual(next, prev)) changedFields.push(key);
        };
        track('name', merged.name, current.name);
        track('slug', merged.slug, current.slug);
        if (!pricesEqual(merged.price, current.price)) changedFields.push('price');
        track('category', merged.category, current.category);
        track('active', merged.active, current.active);
        for (const field of OPTIONAL_STRING_FIELDS) {
          track(field, merged[field], current[field]);
        }

        const isNoop = changedFields.length === 0;
        if (expandedOps) {
          const gate = gateExpectedVersionAllowMaxNoop(current, body.expected_version, isNoop);
          if (!gate.ok) {
            await conn.rollback();
            return res.status(gate.status).json({
              error: gate.error,
              code: gate.code,
              ...(gate.current_version != null ? { current_version: gate.current_version } : {}),
            });
          }
        }

        if (isNoop) {
          await conn.commit();
          const skip = shouldRunPostSaveSeoGuard({
            entityType: 'product',
            operation: 'update',
            changedFields,
          });
          return res.status(200).json({
            success: true,
            noop: true,
            slug: merged.slug,
            changed_fields: changedFields,
            product: normalizeSeasonalUtcFields({ ...current }),
            ...(expandedOps ? { product_version: Number(current.product_version) } : {}),
            seo_guard: {
              status: 'skipped' as const,
              entity_type: 'product' as const,
              entity_id: String(id),
              operation: 'update' as const,
              issue_count: 0,
              needs_attention: 0,
              review: 0,
              issues: [],
              memory_synced: false,
              skip_reason: skip.skip_reason || 'noop_update',
            },
          });
        }

        if (expandedOps && Number(current.product_version) === PRODUCT_VERSION_MAX) {
          await conn.rollback();
          return res.status(409).json({
            error: 'product_version overflow; refuse further mutations',
            code: 'version_overflow',
            current_version: Number(current.product_version),
          });
        }

        await recordContentRevision(
          {
            entityType: 'product',
            entityId: id,
            entityLabel: String(current.name || ''),
            revisionAction: 'update',
            snapshot: snapshotProduct(current),
            changedFields,
            actor: admin,
          },
          conn
        );

        if (expandedOps) {
          const nextVer = Number(current.product_version) + 1;
          const [upd]: any = await conn.query(
            `UPDATE products SET name=?, slug=?, description=?, price=?, category=?, badge=?, image=?, stock=?,
              short_description=?, full_description=?, seo_title=?, meta_description=?, focus_keyword=?, features=?, og_image=?,
              product_version=?
             WHERE id=? AND product_version=? AND slug=?`,
            [
              merged.name,
              merged.slug,
              merged.description,
              merged.price,
              merged.category,
              merged.badge,
              merged.image,
              merged.stock,
              merged.short_description,
              merged.full_description,
              merged.seo_title,
              merged.meta_description,
              merged.focus_keyword,
              merged.features,
              merged.og_image,
              nextVer,
              id,
              Number(current.product_version),
              current.slug,
            ]
          );
          assertSingleUpdate(upd, 'product_put');
          changedFields.push('product_version');
        } else {
          const [upd]: any = await conn.query(
            `UPDATE products SET name=?, slug=?, description=?, price=?, category=?, badge=?, image=?, stock=?, active=?,
              short_description=?, full_description=?, seo_title=?, meta_description=?, focus_keyword=?, features=?, og_image=?
             WHERE id=? AND slug=?`,
            [
              merged.name,
              merged.slug,
              merged.description,
              merged.price,
              merged.category,
              merged.badge,
              merged.image,
              merged.stock,
              merged.active,
              merged.short_description,
              merged.full_description,
              merged.seo_title,
              merged.meta_description,
              merged.focus_keyword,
              merged.features,
              merged.og_image,
              id,
              current.slug,
            ]
          );
          assertSingleUpdate(upd, 'product_put_legacy');
        }

        const [freshRows]: any = await queryWithSeasonalUtc(
          conn,
          'SELECT * FROM products WHERE id=? LIMIT 1',
          [id]
        );
        const fresh = normalizeSeasonalUtcFields(
          Array.isArray(freshRows) && freshRows[0] ? freshRows[0] : { ...current, ...merged }
        );
        await conn.commit();

        const { ip } = getRequestMeta(req);
        await recordAdminAudit({
          actor: admin,
          action: 'product.updated',
          entityType: 'product',
          entityId: id,
          summary: `Updated product ${merged.name}`,
          metadata: { changed_fields: changedFields },
          ip,
        });

        invalidateSitemapCache();
        const seo_guard = await runPostSaveSeoGuard({
          entityType: 'product',
          entityId: id,
          operation: 'update',
          changedFields,
        });
        return res.status(200).json({
          success: true,
          noop: false,
          slug: fresh.slug,
          changed_fields: changedFields,
          product: fresh,
          seo_guard,
          ...(expandedOps ? { product_version: Number(fresh.product_version) } : {}),
        });
      } catch (err: any) {
        try { await conn.rollback(); } catch { /* ignore */ }
        if (err?.code === 'REVISION_TOO_LARGE') {
          return res.status(400).json({ error: err.message });
        }
        if (err?.code === 'ER_DUP_ENTRY') {
          return res.status(409).json({ error: 'Slug already exists. Choose a different URL slug.' });
        }
        if (err?.code === 'concurrent_conflict') {
          return res.status(409).json({ error: err.message, code: 'concurrent_conflict' });
        }
        throw err;
      } finally {
        conn.release();
      }
    }

    if (req.method === 'PATCH') {
      const body = (req.body || {}) as Record<string, unknown>;
      const { ip } = getRequestMeta(req);

      // Lifecycle / listing / presentation actions (expanded schema).
      if (typeof body.action === 'string' && body.action) {
        const cap = await detectProductSchemaCapability();
        if (cap.mode !== 'expanded') {
          return res.status(409).json({
            error: 'Seasonal lifecycle actions require expanded product schema',
            code: 'schema_capability',
            capability: cap.mode,
          });
        }
        const parsedAction = parseSeasonActionPayload(body);
        if (!parsedAction.ok) {
          return res.status(400).json({ error: parsedAction.error, code: parsedAction.code });
        }
        const result = await applySeasonAction(parsedAction.payload, admin, ip);
        if (!result.ok) {
          return res.status(result.status).json({
            error: result.error,
            code: result.code,
            ...(result.id != null ? { id: result.id } : {}),
            ...(result.current_version != null ? { current_version: result.current_version } : {}),
          });
        }
        return res.status(200).json({
          success: true,
          id: result.id,
          product_version: result.product_version,
          changed_fields: result.changed_fields,
          noop: result.noop,
          product: result.row,
        });
      }

      // Private/Public active toggle (task-01 contract).
      const parsed = parseProductVisibilityPayload(body);
      if (!parsed.ok) {
        return res.status(400).json({ error: parsed.error, code: parsed.code });
      }

      const result = await applyProductVisibilityChange(parsed.payload, admin, ip);
      if (!result.ok) {
        return res.status(result.status).json({
          error: result.error,
          code: result.code,
          ...(result.id != null ? { id: result.id } : {}),
          ...(result.name != null ? { name: result.name } : {}),
          ...(result.slug != null ? { slug: result.slug } : {}),
          ...(result.current_active != null
            ? { current_active: result.current_active }
            : {}),
          ...(result.current_version != null
            ? { current_version: result.current_version }
            : {}),
          ...(result.public_page_available != null
            ? { public_page_available: result.public_page_available }
            : {}),
        });
      }

      return res.status(200).json({
        success: true,
        id: result.id,
        name: result.name,
        slug: result.slug,
        active: result.active,
        expected_active: result.expected_active,
        changed_fields: result.changed_fields,
        noop: result.noop,
        public_page_available: result.public_page_available,
        ...(result.product_version != null ? { product_version: result.product_version } : {}),
      });
    }

    if (req.method === 'DELETE') {
      const idRaw = req.query.id;
      const body = (req.body || {}) as Record<string, unknown>;
      const id = Number(idRaw);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'Valid product id is required' });
      }

      const conn = await pool.getConnection();
      let prevName: string | number = id;
      try {
        await conn.beginTransaction();
        const locked = await lockProductRow(conn, id);
        if (!locked.ok) {
          await conn.rollback();
          // Idempotent missing delete: still 404 (not silent success).
          return res.status(404).json({ error: 'Product not found', code: 'not_found' });
        }
        const prev = locked.row;
        prevName = String(prev.name || id);
        const expanded = Object.prototype.hasOwnProperty.call(prev, 'product_version');
        if (expanded) {
          const gate = gateExpectedVersionAllowMaxNoop(prev, body.expected_version, false);
          if (!gate.ok) {
            await conn.rollback();
            return res.status(gate.status).json({
              error: gate.error,
              code: gate.code,
              ...(gate.current_version != null ? { current_version: gate.current_version } : {}),
            });
          }
        }

        await recordContentRevision(
          {
            entityType: 'product',
            entityId: String(id),
            entityLabel: String(prev.name || ''),
            revisionAction: 'delete',
            snapshot: snapshotProduct(prev),
            changedFields: ['delete'],
            actor: admin,
          },
          conn
        );

        if (expanded) {
          const [del]: any = await conn.query(
            'DELETE FROM products WHERE id = ? AND product_version = ?',
            [id, Number(prev.product_version)]
          );
          assertSingleUpdate(del, 'product_delete');
        } else {
          const [del]: any = await conn.query('DELETE FROM products WHERE id = ?', [id]);
          assertSingleUpdate(del, 'product_delete_legacy');
        }
        await conn.commit();
      } catch (txErr: any) {
        try { await conn.rollback(); } catch { /* ignore */ }
        if (txErr?.code === 'concurrent_conflict') {
          return res.status(409).json({ error: txErr.message, code: 'concurrent_conflict' });
        }
        throw txErr;
      } finally {
        conn.release();
      }

      const { ip } = getRequestMeta(req);
      await recordAdminAudit({
        actor: admin,
        action: 'product.deleted',
        entityType: 'product',
        entityId: String(id),
        summary: `Deleted product ${prevName}`,
        ip,
      });
      invalidateSitemapCache();
      const seo_guard = await runPostSaveSeoGuard({
        entityType: 'product',
        entityId: String(id),
        operation: 'delete',
      });
      return res.status(200).json({ success: true, seo_guard });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
