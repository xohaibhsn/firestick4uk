import type { NextApiRequest, NextApiResponse } from 'next';
import pool from '../../lib/db';
import { getRequestMeta, requireAdminPermission } from '../../lib/adminAuth';
import { recordAdminAudit } from '../../lib/adminAudit';

function toSlug(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
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
      const { name, description, price, category, badge, image, stock, slug,
        short_description, full_description, seo_title, meta_description, focus_keyword, features, og_image } = req.body;

      const finalSlug = toSlug(slug || name);
      if (!name || !finalSlug) {
        return res.status(400).json({ error: 'Name and slug are required' });
      }

      const finalSeoTitle = (seo_title || '').trim() || name;
      const finalMetaDesc = (meta_description || '').trim() || (short_description || '').trim() || '';

      try {
        const [result]: any = await pool.query(
          `INSERT INTO products (name, slug, description, price, category, badge, image, stock, active,
            short_description, full_description, seo_title, meta_description, focus_keyword, features, og_image)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`,
          [name, finalSlug, description || '', price, category, badge || null, image || null, stock || 'Digital',
           short_description || '', full_description || '', finalSeoTitle, finalMetaDesc,
           focus_keyword || '', features || '', og_image || '']
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
      const { id, name, description, price, category, badge, image, stock, active, slug,
        short_description, full_description, seo_title, meta_description, focus_keyword, features, og_image } = req.body;

      const finalSlug = toSlug(slug || name);
      if (!id || !name || !finalSlug) {
        return res.status(400).json({ error: 'id, name and slug are required' });
      }

      const finalSeoTitle = (seo_title || '').trim() || name;
      const finalMetaDesc = (meta_description || '').trim() || (short_description || '').trim() || '';

      try {
        await pool.query(
          `UPDATE products SET name=?, slug=?, description=?, price=?, category=?, badge=?, image=?, stock=?, active=?,
            short_description=?, full_description=?, seo_title=?, meta_description=?, focus_keyword=?, features=?, og_image=?
           WHERE id=?`,
          [name, finalSlug, description || '', price, category, badge || null, image || null, stock, active,
           short_description || '', full_description || '', finalSeoTitle, finalMetaDesc,
           focus_keyword || '', features || '', og_image || '', id]
        );
        const { ip } = getRequestMeta(req);
        await recordAdminAudit({
          actor: admin,
          action: 'product.updated',
          entityType: 'product',
          entityId: id,
          summary: `Updated product ${name}`,
          metadata: {
            changed_fields: [
              'name', 'slug', 'description', 'price', 'category', 'badge', 'image', 'stock', 'active',
              'short_description', 'full_description', 'seo_title', 'meta_description', 'focus_keyword', 'features', 'og_image',
            ],
          },
          ip,
        });
        return res.status(200).json({ success: true, slug: finalSlug });
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
