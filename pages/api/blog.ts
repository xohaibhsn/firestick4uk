import type { NextApiRequest, NextApiResponse } from 'next';
import pool from '../../lib/db';
import { getRequestMeta, requireAdminPermission } from '../../lib/adminAuth';
import { recordAdminAudit } from '../../lib/adminAudit';



export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    let admin: Awaited<ReturnType<typeof requireAdminPermission>> | null = null;
    if (req.method !== 'GET') {
      admin = await requireAdminPermission(req, res, 'blog.manage');
      if (!admin) return;
    }

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
      return res.status(200).json(Array.isArray(rows) ? rows : []);
    }

    if (req.method === 'POST') {
      const { title, slug, excerpt, content, category, emoji, badge, badgeText, featured_image, meta_title, meta_description, focus_keyword, status, featured, canonical_url, faqs } = req.body;
      const finalCanonical = (canonical_url || '').trim() || `https://firestick4uk.com/blog/${slug || ''}`;
      const [result]: any = await pool.query(
        'INSERT INTO blog_posts (title, slug, excerpt, content, category, emoji, badge, badgeText, featured_image, meta_title, meta_description, focus_keyword, status, featured, canonical_url, faqs, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)',
        [title, slug || '', excerpt || '', content || '', category || 'Guides', emoji || '📝', badge || 'guide', badgeText || 'Guide', featured_image || '', meta_title || '', meta_description || '', focus_keyword || '', status || 'published', featured ? 1 : 0, finalCanonical, faqs ? JSON.stringify(faqs) : null]
      );
      if (admin) {
        const { ip } = getRequestMeta(req);
        await recordAdminAudit({
          actor: admin,
          action: 'blog.created',
          entityType: 'blog',
          entityId: result.insertId,
          summary: `Created blog post ${title || result.insertId}`,
          ip,
        });
      }
      return res.status(200).json({ success: true, id: result.insertId });
    }

    if (req.method === 'PUT') {
      const { id, title, slug, excerpt, content, category, emoji, badge, badgeText, featured_image, meta_title, meta_description, focus_keyword, status, featured, canonical_url, faqs } = req.body;
      const finalCanonical = (canonical_url || '').trim() || `https://firestick4uk.com/blog/${slug || ''}`;
      await pool.query(
        'UPDATE blog_posts SET title=?, slug=?, excerpt=?, content=?, category=?, emoji=?, badge=?, badgeText=?, featured_image=?, meta_title=?, meta_description=?, focus_keyword=?, status=?, featured=?, canonical_url=?, faqs=? WHERE id=?',
        [title, slug || '', excerpt || '', content || '', category || 'Guides', emoji || '📝', badge || 'guide', badgeText || 'Guide', featured_image || '', meta_title || '', meta_description || '', focus_keyword || '', status || 'published', featured ? 1 : 0, finalCanonical, faqs ? JSON.stringify(faqs) : null, id]
      );
      if (admin) {
        const { ip } = getRequestMeta(req);
        await recordAdminAudit({
          actor: admin,
          action: 'blog.updated',
          entityType: 'blog',
          entityId: id,
          summary: `Updated blog post ${title || id}`,
          ip,
        });
      }
      return res.status(200).json({ success: true });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      const [prevRows]: any = await pool.query('SELECT id, title FROM blog_posts WHERE id = ? LIMIT 1', [id]);
      const prev = Array.isArray(prevRows) && prevRows[0] ? prevRows[0] : null;
      await pool.query('DELETE FROM blog_posts WHERE id = ?', [id]);
      if (admin) {
        const { ip } = getRequestMeta(req);
        await recordAdminAudit({
          actor: admin,
          action: 'blog.deleted',
          entityType: 'blog',
          entityId: id as string,
          summary: `Deleted blog post ${prev?.title || id}`,
          ip,
        });
      }
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
