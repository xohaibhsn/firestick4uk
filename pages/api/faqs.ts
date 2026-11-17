import type { NextApiRequest, NextApiResponse } from 'next';
import pool from '../../lib/db';
import { getRequestMeta, requireAdminPermission } from '../../lib/adminAuth';
import { recordAdminAudit } from '../../lib/adminAudit';
import { setAdminNoStore } from '../../lib/adminNoStore';
import { getClientIp, RL_PUBLIC_GET } from '../../lib/rateLimit';
import { faqRowBaseHash } from '../../lib/faqBaseHash';

/** Columns used by public FAQ UI (FAQClient, contact preview, PublicFaq). */
const PUBLIC_FAQ_COLUMNS = 'id, question, answer, category, sort_order';

function withAdminFaqBaseHash<T extends Record<string, unknown>>(row: T): T & { base_hash: string } {
  return { ...row, base_hash: faqRowBaseHash(row) };
}

function parseIdList(raw: unknown): number[] | null {
  if (!Array.isArray(raw)) return null;
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const v of raw) {
    const n = Number(v);
    if (!Number.isInteger(n) || n <= 0) return null;
    if (seen.has(n)) return null;
    seen.add(n);
    ids.push(n);
  }
  return ids;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    let admin: Awaited<ReturnType<typeof requireAdminPermission>> | null = null;
    if (req.method !== 'GET') {
      admin = await requireAdminPermission(req, res, 'faqs.manage');
      if (!admin) return;
    }

    if (req.method === 'GET') {
      const { admin } = req.query;
      if (admin) {
        setAdminNoStore(res);
        const identity = await requireAdminPermission(req, res, 'faqs.manage', { mutate: false });
        if (!identity) return;
        let query = 'SELECT * FROM faqs';
        query += ' ORDER BY category, sort_order ASC';
        const [rows]: any = await pool.query(query);
        const list = Array.isArray(rows) ? rows : [];
        return res.status(200).json(
          list.map((row: any) => withAdminFaqBaseHash(row as Record<string, unknown>))
        );
      }

      const ip = getClientIp(req);
      const { allowed, retryAfterSec } = RL_PUBLIC_GET(ip, 'faqs');
      if (!allowed) {
        res.setHeader('Retry-After', String(retryAfterSec));
        return res.status(429).json({ error: 'Too many requests' });
      }

      const [rows] = await pool.query(
        `SELECT ${PUBLIC_FAQ_COLUMNS} FROM faqs WHERE is_visible=1 ORDER BY category, sort_order ASC`
      );
      return res.status(200).json(Array.isArray(rows)?rows:[]);
    }

    if (req.method === 'POST') {
      // Reorder action: { action: "reorder", ids: number[] }
      if (req.body?.action === 'reorder') {
        setAdminNoStore(res);
        const ids = parseIdList(req.body?.ids);
        if (!ids) {
          return res.status(400).json({ error: 'Invalid id list' });
        }

        const conn = await pool.getConnection();
        try {
          await conn.beginTransaction();
          const [existingRows]: any = await conn.query('SELECT id FROM faqs FOR UPDATE');
          const existing = new Set(
            (Array.isArray(existingRows) ? existingRows : []).map((r: any) => Number(r.id))
          );
          if (ids.length !== existing.size) {
            await conn.rollback();
            return res.status(400).json({ error: 'Invalid id list' });
          }
          for (const id of ids) {
            if (!existing.has(id)) {
              await conn.rollback();
              return res.status(400).json({ error: 'Invalid id list' });
            }
          }

          for (let i = 0; i < ids.length; i++) {
            const sortOrder = (i + 1) * 10;
            await conn.query('UPDATE faqs SET sort_order = ? WHERE id = ?', [sortOrder, ids[i]]);
          }

          await conn.commit();
        } catch (txErr) {
          try {
            await conn.rollback();
          } catch {
            /* ignore */
          }
          throw txErr;
        } finally {
          conn.release();
        }

        if (admin) {
          const { ip } = getRequestMeta(req);
          await recordAdminAudit({
            actor: admin,
            action: 'faq.reordered',
            entityType: 'faq',
            entityId: null,
            summary: `Reordered ${ids.length} FAQ(s)`,
            metadata: { count: ids.length },
            ip,
          });
        }
        return res.status(200).json({ success: true, count: ids.length });
      }

      const { question, answer, category, sort_order } = req.body;
      if (!question || !answer) return res.status(400).json({ error: 'Question and answer required' });
      const [r]: any = await pool.query(
        'INSERT INTO faqs (question,answer,category,sort_order) VALUES (?,?,?,?)',
        [question, answer, category||'General', sort_order||0]
      );
      if (admin) {
        const { ip } = getRequestMeta(req);
        await recordAdminAudit({
          actor: admin,
          action: 'faq.created',
          entityType: 'faq',
          entityId: r.insertId,
          summary: 'Created FAQ',
          metadata: { category: category || 'General' },
          ip,
        });
      }
      return res.status(200).json({ success:true, id:r.insertId });
    }

    if (req.method === 'PUT') {
      const {
        id,
        question,
        answer,
        category,
        sort_order,
        is_visible,
        base_hash: bodyBaseHash,
        force: bodyForce,
      } = req.body;
      if (!id) return res.status(400).json({ error: 'ID required' });
      const hasBaseHash = typeof bodyBaseHash === 'string';
      const force = bodyForce === true;
      if (!hasBaseHash) {
        console.log('faq.save_without_base_hash', id);
      }

      const nextQuestion = question;
      const nextAnswer = answer;
      const nextCategory = category || 'General';
      const nextSortOrder = sort_order || 0;
      const nextVisible = is_visible ?? 1;

      const conn = await pool.getConnection();
      let writtenRow: Record<string, unknown> | null = null;
      try {
        await conn.beginTransaction();
        const [lockedRows]: any = await conn.query(
          'SELECT * FROM faqs WHERE id=? FOR UPDATE',
          [id]
        );
        const locked = lockedRows?.[0] || null;

        // Missing row: keep prior behaviour (no-op UPDATE path + success).
        if (locked && hasBaseHash && !force) {
          if (faqRowBaseHash(locked) !== bodyBaseHash) {
            await conn.rollback();
            return res.status(409).json({
              error: 'stale',
              conflicts: [{ id: Number(locked.id), question: String(locked.question || '') }],
            });
          }
        }

        await conn.query(
          'UPDATE faqs SET question=?,answer=?,category=?,sort_order=?,is_visible=? WHERE id=?',
          [nextQuestion, nextAnswer, nextCategory, nextSortOrder, nextVisible, id]
        );
        writtenRow = {
          ...(locked || {}),
          id,
          question: nextQuestion,
          answer: nextAnswer,
          category: nextCategory,
          sort_order: nextSortOrder,
          is_visible: nextVisible,
        };
        await conn.commit();
      } catch (txErr) {
        try {
          await conn.rollback();
        } catch {
          /* ignore */
        }
        throw txErr;
      } finally {
        conn.release();
      }

      if (admin) {
        const { ip } = getRequestMeta(req);
        await recordAdminAudit({
          actor: admin,
          action: 'faq.updated',
          entityType: 'faq',
          entityId: id,
          summary: 'Updated FAQ',
          ip,
        });
        if (force && hasBaseHash) {
          await recordAdminAudit({
            actor: admin,
            action: 'faq.overwrite_stale',
            entityType: 'faq',
            entityId: id,
            summary: 'Overwrote stale FAQ',
            metadata: { id: Number(id) },
            ip,
          });
        }
      }
      const resultHash = faqRowBaseHash(writtenRow);
      return res.status(200).json({ success: true, base_hash: resultHash });
    }

    if (req.method === 'DELETE') {
      const rawId = req.query.id;
      const idNum = typeof rawId === 'string' || typeof rawId === 'number' ? Number(rawId) : NaN;
      if (!Number.isInteger(idNum) || idNum <= 0) {
        return res.status(400).json({ error: 'invalid_id' });
      }

      const conn = await pool.getConnection();
      let deleted: { id: number; question: string; category: string };
      try {
        await conn.beginTransaction();
        const [rows]: any = await conn.query(
          'SELECT id, question, category FROM faqs WHERE id=? FOR UPDATE',
          [idNum]
        );
        if (!rows?.length) {
          await conn.rollback();
          return res.status(404).json({ error: 'not_found' });
        }
        deleted = {
          id: Number(rows[0].id),
          question: String(rows[0].question || ''),
          category: String(rows[0].category || ''),
        };
        await conn.query('DELETE FROM faqs WHERE id=?', [idNum]);
        await conn.commit();
      } catch (txErr) {
        try {
          await conn.rollback();
        } catch {
          /* ignore */
        }
        throw txErr;
      } finally {
        conn.release();
      }

      if (admin) {
        const { ip } = getRequestMeta(req);
        await recordAdminAudit({
          actor: admin,
          action: 'faq.deleted',
          entityType: 'faq',
          entityId: String(deleted.id),
          summary: 'Deleted FAQ',
          metadata: {
            question: deleted.question.slice(0, 200),
            category: deleted.category,
          },
          ip,
        });
      }
      return res.status(200).json({ success:true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    const errCode = typeof error?.code === 'string' ? error.code : undefined;
    const errName = typeof error?.name === 'string' ? error.name : 'Error';
    console.error('[faqs] failed', errCode || errName);
    return res.status(500).json({ error: 'Request failed' });
  }
}
