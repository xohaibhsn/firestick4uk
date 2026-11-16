import type { NextApiRequest, NextApiResponse } from 'next';
import pool from '../../lib/db';
import { getRequestMeta, requireAdminPermission } from '../../lib/adminAuth';
import { recordAdminAudit } from '../../lib/adminAudit';
import { setAdminNoStore } from '../../lib/adminNoStore';
import { recordContentRevision, snapshotBlog } from '../../lib/contentRevisions';
import { invalidateSitemapCache } from '../../lib/hostingerResourceInvalidation';
import { runPostSaveSeoGuard } from '../../lib/postSaveSeoGuard';
import {
  BlogPersistenceError,
  createBlogPost,
  requireExplicitBlogStatus,
  requireSuppliedBlogStatus,
  updateBlogPost,
} from '../../lib/blogPersistenceServer';
import { blogRowBaseHash } from '../../lib/blogBaseHash';
import { getClientIp, RL_PUBLIC_GET } from '../../lib/rateLimit';

function withAdminBlogBaseHash<T extends Record<string, unknown>>(row: T): T & { base_hash: string } {
  return { ...row, base_hash: blogRowBaseHash(row) };
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

      // Public: published + active slug lookup only (no admin session).
      if (slug) {
        const ip = getClientIp(req);
        const { allowed, retryAfterSec } = RL_PUBLIC_GET(ip, 'blog');
        if (!allowed) {
          res.setHeader('Retry-After', String(retryAfterSec));
          return res.status(429).json({ error: 'Too many requests' });
        }
        const [rows]: any = await pool.query(
          'SELECT * FROM blog_posts WHERE slug = ? AND status = "published" AND active = 1 LIMIT 1',
          [slug]
        );
        return res.status(200).json(rows[0] || null);
      }

      // CMS list / id: require blog.manage (read-safe; no CSRF mutate).
      setAdminNoStore(res);
      admin = await requireAdminPermission(req, res, 'blog.manage', { mutate: false });
      if (!admin) return;

      if (id) {
        const [rows]: any = await pool.query('SELECT * FROM blog_posts WHERE id = ? LIMIT 1', [id]);
        const row = rows[0] || null;
        return res.status(200).json(row ? withAdminBlogBaseHash(row) : null);
      }
      const [rows]: any = await pool.query('SELECT * FROM blog_posts WHERE active = 1 ORDER BY created_at DESC');
      const list = Array.isArray(rows) ? rows : [];
      return res.status(200).json(list.map((row: Record<string, unknown>) => withAdminBlogBaseHash(row)));
    }

    if (req.method === 'POST') {
      if (!admin) return;
      const body = (req.body || {}) as Record<string, unknown>;
      let mode;
      try {
        mode = requireExplicitBlogStatus(body.status);
      } catch (err) {
        if (err instanceof BlogPersistenceError) {
          return res.status(err.status).json({ error: err.message, code: err.code });
        }
        throw err;
      }
      const { ip } = getRequestMeta(req);
      try {
        const result = await createBlogPost({
          actor: admin,
          input: body,
          mode,
          source: 'manual_cms',
          ip,
        });
        return res.status(200).json(result);
      } catch (err) {
        if (err instanceof BlogPersistenceError) {
          return res.status(err.status).json({ error: err.message, code: err.code });
        }
        throw err;
      }
    }

    if (req.method === 'PUT') {
      if (!admin) return;
      const body = (req.body || {}) as Record<string, unknown>;
      const id = Number(body.id);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ error: 'Valid blog id is required' });
      }

      let mode: 'draft' | 'publish' | undefined;
      if (Object.prototype.hasOwnProperty.call(body, 'status')) {
        try {
          mode = requireSuppliedBlogStatus(body.status);
        } catch (err) {
          if (err instanceof BlogPersistenceError) {
            return res.status(err.status).json({ error: err.message, code: err.code });
          }
          throw err;
        }
      }

      const { ip } = getRequestMeta(req);
      try {
        const result = await updateBlogPost({
          actor: admin,
          id,
          patch: body,
          mode,
          source: 'manual_cms',
          ip,
          baseHash: typeof body.base_hash === 'string' ? body.base_hash : undefined,
          force: body.force === true,
        });
        return res.status(200).json(result);
      } catch (err) {
        if (err instanceof BlogPersistenceError) {
          if (err.code === 'stale') {
            return res.status(409).json({
              error: 'stale',
              conflicts: Array.isArray(err.conflicts) ? err.conflicts : [],
            });
          }
          return res.status(err.status).json({ error: err.message, code: err.code });
        }
        throw err;
      }
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
      invalidateSitemapCache();
      const seo_guard = await runPostSaveSeoGuard({
        entityType: 'blog',
        entityId: String(id),
        operation: 'delete',
      });
      return res.status(200).json({ success: true, seo_guard });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    const errCode = typeof error?.code === 'string' ? error.code : undefined;
    const errName = typeof error?.name === 'string' ? error.name : 'Error';
    console.error('[blog] failed', errCode || errName);
    return res.status(500).json({ error: 'Request failed' });
  }
}
