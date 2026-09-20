import type { NextApiRequest, NextApiResponse } from 'next';
import pool from '../../lib/db';
import { getRequestMeta, requireAdminPermission } from '../../lib/adminAuth';
import { recordAdminAudit } from '../../lib/adminAudit';

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

function validatePrice(value: unknown): { ok: true; price: number } | { ok: false; error: string } {
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[^0-9.\-]/g, ''));
  if (!Number.isFinite(n) || n < 0) {
    return { ok: false, error: 'Price must be a finite non-negative number' };
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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const admin = await requireAdminPermission(req, res, 'products.manage');
  if (!admin) return;

  try {
    if (req.method === 'GET') {
      const [rows] = await pool.query('SELECT * FROM products ORDER BY created_at DESC');
      return res.status(200).json(Array.isArray(rows) ? rows : []);
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
        return res.status(200).json({ success: true, id: result.insertId, slug: finalSlug });
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

      const [existingRows]: any = await pool.query('SELECT * FROM products WHERE id = ? LIMIT 1', [id]);
      const current = Array.isArray(existingRows) && existingRows[0] ? existingRows[0] : null;
      if (!current) {
        return res.status(404).json({ error: 'Product not found' });
      }

      // Required fields: omitted → preserve; explicit empty/invalid → 400
      let name = String(current.name || '');
      if (hasOwn(body, 'name')) {
        name = String(body.name || '').trim();
        if (!name) return res.status(400).json({ error: 'Name cannot be empty' });
      }

      let slug = String(current.slug || '');
      if (hasOwn(body, 'slug') || hasOwn(body, 'name')) {
        const slugSource = hasOwn(body, 'slug') ? String(body.slug || '') : name;
        const nextSlug = toSlug(slugSource || name);
        if (!nextSlug) return res.status(400).json({ error: 'Slug cannot be empty' });
        slug = nextSlug;
      }

      let price = Number(current.price);
      if (hasOwn(body, 'price')) {
        const priceCheck = validatePrice(body.price);
        if (!priceCheck.ok) return res.status(400).json({ error: priceCheck.error });
        price = priceCheck.price;
      }

      let category = String(current.category || '');
      if (hasOwn(body, 'category')) {
        const categoryCheck = validateCategory(body.category);
        if (!categoryCheck.ok) return res.status(400).json({ error: categoryCheck.error });
        category = categoryCheck.category;
      }

      let active = Number(current.active) === 1 ? 1 : 0;
      if (hasOwn(body, 'active')) {
        active = body.active === true || body.active === 1 || body.active === '1' ? 1 : 0;
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
      track('price', merged.price, current.price);
      track('category', merged.category, current.category);
      track('active', merged.active, current.active);
      for (const field of OPTIONAL_STRING_FIELDS) {
        track(field, merged[field], current[field]);
      }

      try {
        await pool.query(
          `UPDATE products SET name=?, slug=?, description=?, price=?, category=?, badge=?, image=?, stock=?, active=?,
            short_description=?, full_description=?, seo_title=?, meta_description=?, focus_keyword=?, features=?, og_image=?
           WHERE id=?`,
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
          ]
        );

        if (changedFields.length > 0) {
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
        }

        return res.status(200).json({
          success: true,
          slug: merged.slug,
          changed_fields: changedFields,
        });
      } catch (err: any) {
        if (err?.code === 'ER_DUP_ENTRY') {
          return res.status(409).json({ error: 'Slug already exists. Choose a different URL slug.' });
        }
        throw err;
      }
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      const [prevRows]: any = await pool.query('SELECT id, name FROM products WHERE id = ? LIMIT 1', [id]);
      const prev = Array.isArray(prevRows) && prevRows[0] ? prevRows[0] : null;
      await pool.query('DELETE FROM products WHERE id = ?', [id]);
      const { ip } = getRequestMeta(req);
      await recordAdminAudit({
        actor: admin,
        action: 'product.deleted',
        entityType: 'product',
        entityId: id as string,
        summary: `Deleted product ${prev?.name || id}`,
        ip,
      });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
