import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let connection;
  try {
    const mysql = require('mysql2/promise');
    connection = await Promise.race([
      mysql.createConnection({
        host: process.env.DB_HOST || 'srv497.hstgr.io',
        user: process.env.DB_USER || 'u992747032_firestick4uk',
        password: process.env.DB_PASSWORD || 'Firestick@2026',
        database: process.env.DB_NAME || 'u992747032_firestick4uk',
        port: Number(process.env.DB_PORT) || 3306,
        connectTimeout: 5000,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('DB connection timeout')), 6000)),
    ]);

    // Auto-migrate: add new SEO/description columns
    for (const col of [
      "ALTER TABLE products ADD COLUMN short_description TEXT",
      "ALTER TABLE products ADD COLUMN full_description TEXT",
      "ALTER TABLE products ADD COLUMN seo_title VARCHAR(60)",
      "ALTER TABLE products ADD COLUMN meta_description VARCHAR(160)",
      "ALTER TABLE products ADD COLUMN focus_keyword VARCHAR(100)",
      "ALTER TABLE products ADD COLUMN features TEXT",
      "ALTER TABLE products ADD COLUMN og_image VARCHAR(500)",
    ]) { try { await connection.query(col); } catch (_) {} }

    if (req.method === 'GET') {
      const [rows] = await connection.query('SELECT * FROM products ORDER BY created_at DESC');
      return res.status(200).json(Array.isArray(rows) ? rows : []);
    }

    if (req.method === 'POST') {
      const { name, description, price, category, badge, image, stock,
        short_description, full_description, seo_title, meta_description, focus_keyword, features, og_image } = req.body;

      const finalSeoTitle = (seo_title || '').trim() || name;
      const finalMetaDesc = (meta_description || '').trim() || (short_description || '').trim() || '';

      const [result]: any = await connection.query(
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

      await connection.query(
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
      await connection.query('DELETE FROM products WHERE id = ?', [id]);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error: any) {
    console.error('DB Error:', error.message);
    return res.status(500).json({ error: error.message });
  } finally {
    if (connection) try { await connection.end(); } catch (_) {}
  }
}
