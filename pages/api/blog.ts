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

    await connection.query(`
      CREATE TABLE IF NOT EXISTS blog_posts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(500) NOT NULL,
        excerpt TEXT,
        category VARCHAR(100) DEFAULT 'Guides',
        emoji VARCHAR(10) DEFAULT '📝',
        badge VARCHAR(50) DEFAULT 'guide',
        badgeText VARCHAR(50) DEFAULT 'Guide',
        active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    if (req.method === 'GET') {
      const [rows]: any = await connection.query(
        'SELECT * FROM blog_posts WHERE active = 1 ORDER BY created_at DESC'
      );
      if (Array.isArray(rows) && rows.length === 0) {
        await connection.query(`
          INSERT INTO blog_posts (title, excerpt, category, emoji, badge, badgeText) VALUES
          ('How to Set Up Your Firestick in 5 Minutes', 'Getting started with your new Amazon Firestick is easier than you think. Follow these simple steps to be streaming in minutes.', 'Guides', '🔥', 'guide', 'Guide'),
          ('Best IPTV Subscriptions in the UK 2026', 'Looking for the best IPTV service in the UK? We compare the top options so you can pick the right plan for your budget and needs.', 'Tips', '📺', 'tips', 'Tips'),
          ('Firestick4UK — What''s New This Month', 'We have added new subscription plans, improved our order tracking system, and launched faster delivery. Here is everything that changed.', 'News', '🚀', 'news', 'News')
        `);
        const [fresh] = await connection.query('SELECT * FROM blog_posts WHERE active = 1 ORDER BY created_at DESC');
        return res.status(200).json(Array.isArray(fresh) ? fresh : []);
      }
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
