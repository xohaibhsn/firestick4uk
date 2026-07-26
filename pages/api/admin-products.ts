import type { NextApiRequest, NextApiResponse } from 'next';
import pool from '../../lib/db';

function checkAdminAuth(req: NextApiRequest): boolean {
  const session = req.headers['x-admin-session'] || req.cookies?.sAdminSession;
  return !!session;
}

function toSlug(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function ensureProductSlugColumn() {
  for (const col of [
    "ALTER TABLE products ADD COLUMN short_description TEXT",
    "ALTER TABLE products ADD COLUMN full_description TEXT",
    "ALTER TABLE products ADD COLUMN seo_title VARCHAR(60)",
    "ALTER TABLE products ADD COLUMN meta_description VARCHAR(160)",
    "ALTER TABLE products ADD COLUMN focus_keyword VARCHAR(100)",
    "ALTER TABLE products ADD COLUMN features TEXT",
    "ALTER TABLE products ADD COLUMN og_image VARCHAR(500)",
    "ALTER TABLE products ADD COLUMN slug VARCHAR(255)",
  ]) {
    try { await pool.query(col); } catch (_) {}
  }

  // Backfill missing slugs from product name (same style as public URLs)
  try {
    await pool.query(
      `UPDATE products
       SET slug = LOWER(REPLACE(REPLACE(REPLACE(name, ' ', '-'), '/', ''), '--', '-'))
       WHERE slug IS NULL OR slug = ''`
    );
    await pool.query(
      `UPDATE products
       SET slug = TRIM(BOTH '-' FROM slug)
       WHERE slug IS NOT NULL`
    );
  } catch (_) {}

  // Resolve duplicate slugs before unique index
  try {
    const [rows]: any = await pool.query(
      `SELECT slug, GROUP_CONCAT(id ORDER BY id) AS ids, COUNT(*) AS c
       FROM products
       WHERE slug IS NOT NULL AND slug != ''
       GROUP BY slug
       HAVING c > 1`
    );
    for (const row of Array.isArray(rows) ? rows : []) {
      const ids = String(row.ids || '').split(',').map((id: string) => Number(id)).filter(Boolean);
      // Keep first id's slug; append -id to the rest
      for (const id of ids.slice(1)) {
        await pool.query('UPDATE products SET slug = ? WHERE id = ?', [`${row.slug}-${id}`, id]);
      }
    }
  } catch (_) {}

  try {
    await pool.query('ALTER TABLE products ADD UNIQUE KEY unique_slug (slug)');
  } catch (_) {}
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
  // Writers cannot mutate products
  const role = req.headers['x-admin-role'] as string;
  if (req.method !== 'GET' && role === 'writer') {
    return res.status(403).json({ error: 'Forbidden: Writers cannot modify products' });
  }
  try {
    await ensureProductSlugColumn();

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
      await pool.query('DELETE FROM products WHERE id = ?', [id]);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
