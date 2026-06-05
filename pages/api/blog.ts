import type { NextApiRequest, NextApiResponse } from 'next';
import pool from '../../lib/db';

function checkAdminAuth(req: any): boolean {
  const session = req.headers['x-admin-session'] || req.cookies?.sAdminSession;
  return !!session;
}



export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'GET' && !checkAdminAuth(req)) return res.status(403).json({ error: 'Forbidden' });

    await pool.query(`
      CREATE TABLE IF NOT EXISTS blog_posts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(500) NOT NULL,
        slug VARCHAR(500),
        excerpt TEXT,
        content LONGTEXT,
        category VARCHAR(100) DEFAULT 'Guides',
        emoji VARCHAR(10) DEFAULT '📝',
        badge VARCHAR(50) DEFAULT 'guide',
        badgeText VARCHAR(50) DEFAULT 'Guide',
        featured_image VARCHAR(1000),
        meta_title VARCHAR(500),
        meta_description VARCHAR(500),
        focus_keyword VARCHAR(255),
        status VARCHAR(20) DEFAULT 'published',
        featured TINYINT(1) DEFAULT 0,
        active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    for (const col of [
      "ALTER TABLE blog_posts ADD COLUMN slug VARCHAR(500) AFTER title",
      "ALTER TABLE blog_posts ADD COLUMN content LONGTEXT AFTER excerpt",
      "ALTER TABLE blog_posts ADD COLUMN featured_image VARCHAR(1000) AFTER badgeText",
      "ALTER TABLE blog_posts ADD COLUMN meta_title VARCHAR(500)",
      "ALTER TABLE blog_posts ADD COLUMN meta_description VARCHAR(500)",
      "ALTER TABLE blog_posts ADD COLUMN focus_keyword VARCHAR(255)",
      "ALTER TABLE blog_posts ADD COLUMN status VARCHAR(20) DEFAULT 'published'",
      "ALTER TABLE blog_posts ADD COLUMN featured TINYINT(1) DEFAULT 0",
      "ALTER TABLE blog_posts ADD COLUMN canonical_url VARCHAR(500)",
      "ALTER TABLE blog_posts ADD COLUMN faqs TEXT",
      "ALTER TABLE blog_posts ADD COLUMN active TINYINT(1) DEFAULT 1",
      "ALTER TABLE blog_posts ADD COLUMN badgeText VARCHAR(50) DEFAULT 'Guide'",
      "ALTER TABLE blog_posts ADD COLUMN emoji VARCHAR(10) DEFAULT '📝'",
    ]) { try { await pool.query(col); } catch (_) {} }

    // Activate any existing posts that have NULL active (added before column existed)
    try { await pool.query("UPDATE blog_posts SET active=1 WHERE active IS NULL"); } catch (_) {}

    if (req.method === 'GET') {
      const { slug, id } = req.query;
      if (slug) {
        const [rows]: any = await pool.query(
          'SELECT * FROM blog_posts WHERE slug = ? AND status = "published" AND active = 1 LIMIT 1',
          [slug]
        );
        return res.status(200).json(rows[0] || null);
      }
      if (id) {
        const [rows]: any = await pool.query('SELECT * FROM blog_posts WHERE id = ? LIMIT 1', [id]);
        return res.status(200).json(rows[0] || null);
      }
      const [rows]: any = await pool.query('SELECT * FROM blog_posts WHERE active = 1 ORDER BY created_at DESC');
      if (Array.isArray(rows) && rows.length === 0) {
        await pool.query(`
          INSERT INTO blog_posts (title, slug, excerpt, content, category, emoji, badge, badgeText, status)
          VALUES
          ('How to Set Up Your Firestick in 5 Minutes', 'how-to-set-up-your-firestick', 'Getting started with your new Amazon Firestick is easier than you think. Follow these simple steps to be streaming in minutes.', '<h2>Getting Started</h2><p>Plug your Firestick into your TV HDMI port and connect the power cable. Follow the on-screen setup instructions.</p>', 'Guides', '🔥', 'guide', 'Guide', 'published'),
          ('Best IPTV Subscriptions in the UK 2026', 'best-iptv-subscriptions-uk-2026', 'Looking for the best IPTV service in the UK? We compare the top options so you can pick the right plan.', '<h2>Top IPTV Plans</h2><p>We offer 1 Month, 6 Month and 1 Year subscription plans to suit every budget.</p>', 'Tips', '📺', 'tips', 'Tips', 'published'),
          ('Firestick4UK — What''s New This Month', 'firestick4uk-whats-new', 'We have added new subscription plans, improved order tracking, and launched faster delivery.', '<h2>New This Month</h2><p>Check out our improved order tracking and new product range.</p>', 'News', '🚀', 'news', 'News', 'published')
        `);
        const [fresh] = await pool.query('SELECT * FROM blog_posts WHERE active = 1 ORDER BY created_at DESC');
        return res.status(200).json(Array.isArray(fresh) ? fresh : []);
      }
      return res.status(200).json(Array.isArray(rows) ? rows : []);
    }

    if (req.method === 'POST') {
      const { title, slug, excerpt, content, category, emoji, badge, badgeText, featured_image, meta_title, meta_description, focus_keyword, status, featured, canonical_url, faqs } = req.body;
      const finalCanonical = (canonical_url || '').trim() || `https://firestick4uk.com/blog/${slug || ''}`;
      const [result]: any = await pool.query(
        'INSERT INTO blog_posts (title, slug, excerpt, content, category, emoji, badge, badgeText, featured_image, meta_title, meta_description, focus_keyword, status, featured, canonical_url, faqs, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)',
        [title, slug || '', excerpt || '', content || '', category || 'Guides', emoji || '📝', badge || 'guide', badgeText || 'Guide', featured_image || '', meta_title || '', meta_description || '', focus_keyword || '', status || 'published', featured ? 1 : 0, finalCanonical, faqs ? JSON.stringify(faqs) : null]
      );
      return res.status(200).json({ success: true, id: result.insertId });
    }

    if (req.method === 'PUT') {
      const { id, title, slug, excerpt, content, category, emoji, badge, badgeText, featured_image, meta_title, meta_description, focus_keyword, status, featured, canonical_url, faqs } = req.body;
      const finalCanonical = (canonical_url || '').trim() || `https://firestick4uk.com/blog/${slug || ''}`;
      await pool.query(
        'UPDATE blog_posts SET title=?, slug=?, excerpt=?, content=?, category=?, emoji=?, badge=?, badgeText=?, featured_image=?, meta_title=?, meta_description=?, focus_keyword=?, status=?, featured=?, canonical_url=?, faqs=? WHERE id=?',
        [title, slug || '', excerpt || '', content || '', category || 'Guides', emoji || '📝', badge || 'guide', badgeText || 'Guide', featured_image || '', meta_title || '', meta_description || '', focus_keyword || '', status || 'published', featured ? 1 : 0, finalCanonical, faqs ? JSON.stringify(faqs) : null, id]
      );
      return res.status(200).json({ success: true });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      await pool.query('DELETE FROM blog_posts WHERE id = ?', [id]);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
