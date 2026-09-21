import type { NextApiRequest, NextApiResponse } from 'next';
import pool from '../../lib/db';
import { getRequestMeta, requireAdminPermission } from '../../lib/adminAuth';
import { recordAdminAudit } from '../../lib/adminAudit';
import { recordContentRevision, snapshotBlog } from '../../lib/contentRevisions';

function valuesEqual(a: unknown, b: unknown): boolean {
  const na = a === null || a === undefined ? '' : String(a);
  const nb = b === null || b === undefined ? '' : String(b);
  return na === nb;
}

function normalizeFaqs(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

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
      if (!admin) return;
      const body = req.body || {};
      const id = Number(body.id);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ error: 'Valid blog id is required' });
      }

      const [existingRows]: any = await pool.query('SELECT * FROM blog_posts WHERE id = ? LIMIT 1', [id]);
      const current = Array.isArray(existingRows) && existingRows[0] ? existingRows[0] : null;
      if (!current) return res.status(404).json({ error: 'Blog post not found' });

      const next = {
        title: body.title ?? current.title,
        slug: body.slug ?? current.slug ?? '',
        excerpt: body.excerpt ?? current.excerpt ?? '',
        content: body.content ?? current.content ?? '',
        category: body.category ?? current.category ?? 'Guides',
        emoji: body.emoji ?? current.emoji ?? '📝',
        badge: body.badge ?? current.badge ?? 'guide',
        badgeText: body.badgeText ?? current.badgeText ?? 'Guide',
        featured_image: body.featured_image ?? current.featured_image ?? '',
        meta_title: body.meta_title ?? current.meta_title ?? '',
        meta_description: body.meta_description ?? current.meta_description ?? '',
        focus_keyword: body.focus_keyword ?? current.focus_keyword ?? '',
        status: body.status ?? current.status ?? 'published',
        featured: body.featured != null ? (body.featured ? 1 : 0) : (current.featured ? 1 : 0),
        canonical_url:
          (body.canonical_url || '').trim() ||
          current.canonical_url ||
          `https://firestick4uk.com/blog/${body.slug || current.slug || ''}`,
        faqs: normalizeFaqs(body.faqs !== undefined ? body.faqs : current.faqs),
      };

      const changedFields: string[] = [];
      const track = (key: string, a: unknown, b: unknown) => {
        if (!valuesEqual(a, b)) changedFields.push(key);
      };
      track('title', next.title, current.title);
      track('slug', next.slug, current.slug);
      track('excerpt', next.excerpt, current.excerpt);
      track('content', next.content, current.content);
      track('category', next.category, current.category);
      track('emoji', next.emoji, current.emoji);
      track('badge', next.badge, current.badge);
      track('badgeText', next.badgeText, current.badgeText);
      track('featured_image', next.featured_image, current.featured_image);
      track('meta_title', next.meta_title, current.meta_title);
      track('meta_description', next.meta_description, current.meta_description);
      track('focus_keyword', next.focus_keyword, current.focus_keyword);
      track('status', next.status, current.status);
      track('featured', next.featured, current.featured);
      track('canonical_url', next.canonical_url, current.canonical_url);
      track('faqs', next.faqs, typeof current.faqs === 'string' ? current.faqs : normalizeFaqs(current.faqs));

      if (changedFields.length === 0) {
        return res.status(200).json({ success: true, changed_fields: [] });
      }

      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await recordContentRevision(
          {
            entityType: 'blog',
            entityId: id,
            entityLabel: String(current.title || ''),
            revisionAction: 'update',
            snapshot: snapshotBlog(current),
            changedFields,
            actor: admin,
          },
          conn
        );
        await conn.query(
          'UPDATE blog_posts SET title=?, slug=?, excerpt=?, content=?, category=?, emoji=?, badge=?, badgeText=?, featured_image=?, meta_title=?, meta_description=?, focus_keyword=?, status=?, featured=?, canonical_url=?, faqs=? WHERE id=?',
          [
            next.title,
            next.slug || '',
            next.excerpt || '',
            next.content || '',
            next.category,
            next.emoji,
            next.badge,
            next.badgeText,
            next.featured_image || '',
            next.meta_title || '',
            next.meta_description || '',
            next.focus_keyword || '',
            next.status,
            next.featured,
            next.canonical_url,
            next.faqs,
            id,
          ]
        );
        await conn.commit();
      } catch (txErr: any) {
        try { await conn.rollback(); } catch { /* ignore */ }
        if (txErr?.code === 'REVISION_TOO_LARGE') {
          return res.status(400).json({ error: txErr.message });
        }
        throw txErr;
      } finally {
        conn.release();
      }

      const { ip } = getRequestMeta(req);
      await recordAdminAudit({
        actor: admin,
        action: 'blog.updated',
        entityType: 'blog',
        entityId: id,
        summary: `Updated blog post ${next.title || id}`,
        metadata: { changed_fields: changedFields },
        ip,
      });
      return res.status(200).json({ success: true, changed_fields: changedFields });
    }

    if (req.method === 'DELETE') {
      if (!admin) return;
      const { id } = req.query;
      const [prevRows]: any = await pool.query('SELECT * FROM blog_posts WHERE id = ? LIMIT 1', [id]);
      const prev = Array.isArray(prevRows) && prevRows[0] ? prevRows[0] : null;
      if (prev) {
        const conn = await pool.getConnection();
        try {
          await conn.beginTransaction();
          await recordContentRevision(
            {
              entityType: 'blog',
              entityId: String(id),
              entityLabel: String(prev.title || ''),
              revisionAction: 'delete',
              snapshot: snapshotBlog(prev),
              changedFields: ['delete'],
              actor: admin,
            },
            conn
          );
          await conn.query('DELETE FROM blog_posts WHERE id = ?', [id]);
          await conn.commit();
        } catch (txErr: any) {
          try { await conn.rollback(); } catch { /* ignore */ }
          if (txErr?.code === 'REVISION_TOO_LARGE') {
            return res.status(400).json({ error: txErr.message });
          }
          throw txErr;
        } finally {
          conn.release();
        }
      } else {
        await pool.query('DELETE FROM blog_posts WHERE id = ?', [id]);
      }
      const { ip } = getRequestMeta(req);
      await recordAdminAudit({
        actor: admin,
        action: 'blog.deleted',
        entityType: 'blog',
        entityId: id as string,
        summary: `Deleted blog post ${prev?.title || id}`,
        ip,
      });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
