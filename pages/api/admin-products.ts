import type { NextApiRequest, NextApiResponse } from 'next';
import pool from '../../lib/db';

function checkAdminAuth(req: NextApiRequest): boolean {
  const session = req.headers['x-admin-session'] || req.cookies?.sAdminSession;
  return !!session;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });
  try {
    for (const col of [
      "ALTER TABLE products ADD COLUMN short_description TEXT",
      "ALTER TABLE products ADD COLUMN full_description TEXT",
      "ALTER TABLE products ADD COLUMN seo_title VARCHAR(60)",
      "ALTER TABLE products ADD COLUMN meta_description VARCHAR(160)",
      "ALTER TABLE products ADD COLUMN focus_keyword VARCHAR(100)",
      "ALTER TABLE products ADD COLUMN features TEXT",
      "ALTER TABLE products ADD COLUMN og_image VARCHAR(500)",
    ]) { try { await pool.query(col); } catch (_) {} }

    if (req.method === 'GET') {
      const [rows] = await pool.query('SELECT * FROM products ORDER BY created_at DESC');
      return res.status(200).json(Array.isArray(rows) ? rows : []);
    }

    if (req.method === 'POST') {
      const { name, description, price, category, badge, image, stock,
        short_description, full_description, seo_title, meta_description, focus_keyword, features, og_image } = req.body;

      const finalSeoTitle = (seo_title || '').trim() || name;
      const finalMetaDesc = (meta_description || '').trim() || (short_description || '').trim() || '';

      const [result]: any = await pool.query(
        `INSERT INTO products (name, description, price, category, badge, image, stock, active,
          short_description, full_description, seo_title, meta_description, focus_keyword, features, og_image)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`,
        [name, description || '', price, category, badge || null, image || null, stock || 'Digital',
         short_description || '', full_description || '', finalSeoTitle, finalMetaDesc,
         focus_keyword || '', features || '', og_image || '']
      );
      return res.status(200).json({ success: true, id: result.insertId });
    }

    if (req.method === 'PUT') {
      const { id, name, description, price, category, badge, image, stock, active,
        short_description, full_description, seo_title, meta_description, focus_keyword, features, og_image } = req.body;

      const finalSeoTitle = (seo_title || '').trim() || name;
      const finalMetaDesc = (meta_description || '').trim() || (short_description || '').trim() || '';

      await pool.query(
        `UPDATE products SET name=?, description=?, price=?, category=?, badge=?, image=?, stock=?, active=?,
          short_description=?, full_description=?, seo_title=?, meta_description=?, focus_keyword=?, features=?, og_image=?
         WHERE id=?`,
        [name, description || '', price, category, badge || null, image || null, stock, active,
         short_description || '', full_description || '', finalSeoTitle, finalMetaDesc,
         focus_keyword || '', features || '', og_image || '', id]
      );
      return res.status(200).json({ success: true });
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
