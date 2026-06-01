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

    if (req.method === 'GET') {
      const [rows] = await connection.query(
        'SELECT * FROM blog_posts WHERE active = 1 ORDER BY created_at DESC'
      );
      return res.status(200).json(Array.isArray(rows) ? rows : []);
    }

    if (req.method === 'POST') {
      const { title, excerpt, category, emoji, badge, badgeText } = req.body;
      const [result]: any = await connection.query(
        'INSERT INTO blog_posts (title, excerpt, category, emoji, badge, badgeText, active) VALUES (?, ?, ?, ?, ?, ?, 1)',
        [title, excerpt || '', category || 'Guides', emoji || '📝', badge || 'guide', badgeText || 'Guide']
      );
      return res.status(200).json({ success: true, id: result.insertId });
    }

    if (req.method === 'PUT') {
      const { id, title, excerpt, category, emoji, badge, badgeText } = req.body;
      await connection.query(
        'UPDATE blog_posts SET title=?, excerpt=?, category=?, emoji=?, badge=?, badgeText=? WHERE id=?',
        [title, excerpt || '', category || 'Guides', emoji || '📝', badge || 'guide', badgeText || 'Guide', id]
      );
      return res.status(200).json({ success: true });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      await connection.query('DELETE FROM blog_posts WHERE id = ?', [id]);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  } finally {
    if (connection) try { await connection.end(); } catch (_) {}
  }
}
