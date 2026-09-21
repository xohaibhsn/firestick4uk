import type { NextApiRequest, NextApiResponse } from "next";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import pool from "../../../lib/db";
import { getRequestMeta, requireAdminPermission } from "../../../lib/adminAuth";
import { recordAdminAudit } from "../../../lib/adminAudit";
import { SITE_CONTENT_DEFAULTS } from "../../../lib/siteContentSeed";
import { isSuperAdminSettingsKey } from "../../../lib/adminPermissions";
import {
  canRestoreRevisionEntity,
  getRevisionById,
  parseSnapshot,
  recordContentRevision,
  snapshotBlog,
  snapshotHasSubscriptionRouting,
  snapshotProduct,
  SUBSCRIPTION_ROUTING_KEYS,
} from "../../../lib/contentRevisions";

const PRODUCT_CATEGORIES = ["Subscription", "Device", "Bundle"] as const;

function validatePrice(value: unknown): { ok: true; price: number } | { ok: false; error: string } {
  if (value === null || value === undefined || value === "") {
    return { ok: false, error: "Price must be a finite non-negative number" };
  }
  const raw = String(value).trim();
  const cleaned = raw.replace(/[^0-9.\-]/g, "");
  if (!cleaned || !/[0-9]/.test(raw)) {
    return { ok: false, error: "Price must be a finite non-negative number" };
  }
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) {
    return { ok: false, error: "Price must be a finite non-negative number" };
  }
  return { ok: true, price: n };
}

function toSlug(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Restore a CMS content revision (saves current state first). */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const admin = await requireAdminPermission(req, res, "revisions.view");
  if (!admin) return;

  const revisionId = Number(req.body?.revision_id);
  if (!Number.isFinite(revisionId) || revisionId <= 0) {
    return res.status(400).json({ error: "revision_id is required" });
  }

  const revision = await getRevisionById(revisionId);
  if (!revision) return res.status(404).json({ error: "Revision not found" });

  if (!canRestoreRevisionEntity(admin.role, revision.entity_type)) {
    return res.status(403).json({
      error: "Forbidden",
      message: "You do not have permission for this action.",
    });
  }

  let snapshot: any;
  try {
    snapshot = parseSnapshot(revision.snapshot_json);
  } catch {
    return res.status(400).json({ error: "Invalid revision snapshot" });
  }

  if (snapshotHasSubscriptionRouting(snapshot)) {
    return res.status(400).json({
      error:
        "This revision contains subscription routing settings and must be restored through the Subscription editor.",
    });
  }

  // V1: deleted product/blog snapshots are view-only
  if (
    revision.revision_action === "delete" &&
    (revision.entity_type === "product" || revision.entity_type === "blog")
  ) {
    return res.status(400).json({
      error: "Deleted product/blog snapshots cannot be restored in V1.",
    });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    if (revision.entity_type === "product") {
      const productId = Number(revision.entity_id);
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT * FROM products WHERE id=? LIMIT 1",
        [productId]
      );
      const current = rows[0];
      if (!current) {
        await conn.rollback();
        return res.status(404).json({ error: "Product no longer exists; restore denied in V1." });
      }

      const snap = snapshot as Record<string, unknown>;
      const name = String(snap.name || "").trim();
      const slug = toSlug(String(snap.slug || name));
      if (!name || !slug) {
        await conn.rollback();
        return res.status(400).json({ error: "Historical product snapshot is missing name/slug" });
      }
      const priceCheck = validatePrice(snap.price);
      if (!priceCheck.ok) {
        await conn.rollback();
        return res.status(400).json({ error: priceCheck.error });
      }
      const category = String(snap.category || "").trim();
      if (!(PRODUCT_CATEGORIES as readonly string[]).includes(category)) {
        await conn.rollback();
        return res.status(400).json({ error: "Historical product category is invalid" });
      }

      if (slug !== String(current.slug || "")) {
        const [dup] = await conn.query<RowDataPacket[]>(
          "SELECT id FROM products WHERE slug=? AND id<>? LIMIT 1",
          [slug, productId]
        );
        if (dup.length) {
          await conn.rollback();
          return res.status(409).json({ error: "Slug already exists. Choose a different URL slug." });
        }
      }

      await recordContentRevision(
        {
          entityType: "product",
          entityId: productId,
          entityLabel: String(current.name || ""),
          revisionAction: "restore",
          snapshot: snapshotProduct(current as any),
          changedFields: ["restore_pre_state"],
          actor: admin,
        },
        conn
      );

      await conn.query(
        `UPDATE products SET name=?, slug=?, description=?, price=?, category=?, badge=?, image=?, stock=?, active=?,
          short_description=?, full_description=?, seo_title=?, meta_description=?, focus_keyword=?, features=?, og_image=?
         WHERE id=?`,
        [
          name,
          slug,
          snap.description ?? "",
          priceCheck.price,
          category,
          snap.badge ?? null,
          snap.image ?? null,
          snap.stock ?? "Digital",
          snap.active === 0 || snap.active === "0" || snap.active === false ? 0 : 1,
          snap.short_description ?? "",
          snap.full_description ?? "",
          snap.seo_title ?? "",
          snap.meta_description ?? "",
          snap.focus_keyword ?? "",
          snap.features ?? "",
          snap.og_image ?? "",
          productId,
        ]
      );

      await conn.commit();
      const { ip } = getRequestMeta(req);
      await recordAdminAudit({
        actor: admin,
        action: "revision.restored",
        entityType: "product",
        entityId: productId,
        summary: `Restored product from revision ${revisionId}`,
        metadata: { revision_id: revisionId, changed_fields: ["restore"] },
        ip,
      });
      return res.status(200).json({ success: true, entity_type: "product", entity_id: String(productId) });
    }

    if (revision.entity_type === "blog") {
      const blogId = Number(revision.entity_id);
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT * FROM blog_posts WHERE id=? LIMIT 1",
        [blogId]
      );
      const current = rows[0];
      if (!current) {
        await conn.rollback();
        return res.status(404).json({ error: "Blog post no longer exists; restore denied in V1." });
      }

      const snap = snapshot as Record<string, unknown>;
      const title = String(snap.title || "").trim();
      const slug = String(snap.slug || "").trim();
      if (!title) {
        await conn.rollback();
        return res.status(400).json({ error: "Historical blog snapshot is missing title" });
      }
      if (slug && slug !== String(current.slug || "")) {
        const [dup] = await conn.query<RowDataPacket[]>(
          "SELECT id FROM blog_posts WHERE slug=? AND id<>? LIMIT 1",
          [slug, blogId]
        );
        if (dup.length) {
          await conn.rollback();
          return res.status(409).json({ error: "Slug already exists on another blog post." });
        }
      }

      await recordContentRevision(
        {
          entityType: "blog",
          entityId: blogId,
          entityLabel: String(current.title || ""),
          revisionAction: "restore",
          snapshot: snapshotBlog(current as any),
          changedFields: ["restore_pre_state"],
          actor: admin,
        },
        conn
      );

      const faqsVal =
        snap.faqs == null
          ? null
          : typeof snap.faqs === "string"
            ? snap.faqs
            : JSON.stringify(snap.faqs);

      await conn.query(
        `UPDATE blog_posts SET title=?, slug=?, excerpt=?, content=?, category=?, emoji=?, badge=?, badgeText=?,
          featured_image=?, meta_title=?, meta_description=?, focus_keyword=?, status=?, featured=?,
          canonical_url=?, faqs=?, active=? WHERE id=?`,
        [
          title,
          slug,
          snap.excerpt ?? "",
          snap.content ?? "",
          snap.category ?? "Guides",
          snap.emoji ?? "📝",
          snap.badge ?? "guide",
          snap.badgeText ?? "Guide",
          snap.featured_image ?? "",
          snap.meta_title ?? "",
          snap.meta_description ?? "",
          snap.focus_keyword ?? "",
          snap.status ?? "published",
          snap.featured ? 1 : 0,
          snap.canonical_url ?? "",
          faqsVal,
          snap.active === 0 || snap.active === "0" || snap.active === false ? 0 : 1,
          blogId,
        ]
      );

      await conn.commit();
      const { ip } = getRequestMeta(req);
      await recordAdminAudit({
        actor: admin,
        action: "revision.restored",
        entityType: "blog",
        entityId: blogId,
        summary: `Restored blog from revision ${revisionId}`,
        metadata: { revision_id: revisionId, changed_fields: ["restore"] },
        ip,
      });
      return res.status(200).json({ success: true, entity_type: "blog", entity_id: String(blogId) });
    }

    if (
      revision.entity_type === "site_content" ||
      revision.entity_type === "site_settings" ||
      revision.entity_type === "site_content_batch"
    ) {
      // Mixed/settings batches already gated by canRestoreRevisionEntity
      if (revision.entity_type === "site_settings" && admin.role !== "super_admin") {
        await conn.rollback();
        return res.status(403).json({ error: "Forbidden" });
      }

      const values: Record<string, string> = {};
      const metadata: Record<string, any> = {};

      if (snapshot?.values && typeof snapshot.values === "object") {
        for (const [k, v] of Object.entries(snapshot.values)) {
          if (SUBSCRIPTION_ROUTING_KEYS.has(k)) continue;
          values[k] = String(v ?? "");
        }
        if (snapshot.metadata?.rows && typeof snapshot.metadata.rows === "object") {
          Object.assign(metadata, snapshot.metadata.rows);
        }
      } else if (snapshot?.content_key) {
        const ck = String(snapshot.content_key);
        if (SUBSCRIPTION_ROUTING_KEYS.has(ck)) {
          await conn.rollback();
          return res.status(400).json({
            error:
              "This revision contains subscription routing settings and must be restored through the Subscription editor.",
          });
        }
        values[ck] = String(snapshot.content_value ?? "");
        metadata[ck] = {
          content_type: snapshot.content_type || "text",
          page_name: snapshot.page_name || "",
          label: snapshot.label || ck,
        };
      }

      const keys = Object.keys(values);
      if (!keys.length) {
        await conn.rollback();
        return res.status(400).json({ error: "Empty site content snapshot" });
      }

      // Permission: settings keys need settings.manage
      if (keys.some((k) => isSuperAdminSettingsKey(k)) && admin.role !== "super_admin") {
        await conn.rollback();
        return res.status(403).json({ error: "Forbidden" });
      }

      const [prevRows] = await conn.query<RowDataPacket[]>(
        `SELECT content_key, content_value, content_type, page_name, label
         FROM site_content WHERE content_key IN (${keys.map(() => "?").join(",")})`,
        keys
      );
      const prevMap: Record<string, any> = {};
      for (const r of prevRows || []) prevMap[r.content_key] = r;

      const preValues: Record<string, string> = {};
      const preMeta: Record<string, any> = {};
      for (const k of keys) {
        if (prevMap[k]) {
          preValues[k] = prevMap[k].content_value || "";
          preMeta[k] = {
            content_type: prevMap[k].content_type,
            page_name: prevMap[k].page_name,
            label: prevMap[k].label,
          };
        } else {
          preValues[k] = "";
        }
      }

      await recordContentRevision(
        {
          entityType: revision.entity_type as any,
          entityId: revision.entity_id,
          entityLabel: revision.entity_label,
          revisionAction: "restore",
          snapshot: { values: preValues, metadata: { rows: preMeta } },
          changedFields: keys,
          actor: admin,
        },
        conn
      );

      for (const k of keys) {
        const defaults = SITE_CONTENT_DEFAULTS.find((d) => d[0] === k);
        const meta = metadata[k] || {};
        const contentType = meta.content_type || (defaults?.[2] as string) || "text";
        const pageName = meta.page_name || (defaults?.[3] as string) || k.split("_")[0] || "home";
        const label = meta.label || (defaults?.[4] as string) || k;
        await conn.query(
          `INSERT INTO site_content (content_key, content_value, content_type, page_name, label)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE content_value=VALUES(content_value), page_name=VALUES(page_name), label=VALUES(label)`,
          [k, values[k], contentType, pageName, label]
        );
      }

      await conn.commit();
      const { ip } = getRequestMeta(req);
      await recordAdminAudit({
        actor: admin,
        action: "revision.restored",
        entityType: revision.entity_type === "site_settings" ? "settings" : "content",
        entityId: revision.entity_id,
        summary: `Restored site content from revision ${revisionId}`,
        metadata: { revision_id: revisionId, changed_fields: keys },
        ip,
      });
      return res.status(200).json({ success: true, entity_type: revision.entity_type, entity_id: revision.entity_id });
    }

    if (revision.entity_type === "section") {
      const key = revision.entity_id;
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT content_key, content_value, content_type, page_name, label, section_order, is_visible
         FROM site_content WHERE content_key=? LIMIT 1`,
        [key]
      );
      const current = rows[0];
      if (!current) {
        await conn.rollback();
        return res.status(404).json({ error: "Section no longer exists" });
      }

      const snap = snapshot as Record<string, unknown>;
      await recordContentRevision(
        {
          entityType: "section",
          entityId: key,
          entityLabel: String(current.label || key),
          revisionAction: "restore",
          snapshot: {
            content_key: current.content_key,
            content_value: current.content_value,
            content_type: current.content_type,
            page_name: current.page_name,
            label: current.label,
            section_order: current.section_order,
            is_visible: current.is_visible,
            data: (() => {
              try {
                return JSON.parse(String(current.content_value || "{}"));
              } catch {
                return {};
              }
            })(),
          },
          changedFields: ["restore_pre_state"],
          actor: admin,
        },
        conn
      );

      const json =
        typeof snap.content_value === "string"
          ? snap.content_value
          : snap.data != null
            ? JSON.stringify(snap.data)
            : String(current.content_value || "{}");

      await conn.query(
        `UPDATE site_content SET content_value=?, label=?, section_order=?, is_visible=? WHERE content_key=?`,
        [
          json,
          snap.label ?? current.label,
          snap.section_order != null ? Number(snap.section_order) : current.section_order,
          snap.is_visible === 0 || snap.is_visible === false || snap.visible === false ? 0 : 1,
          key,
        ]
      );

      await conn.commit();
      const { ip } = getRequestMeta(req);
      await recordAdminAudit({
        actor: admin,
        action: "revision.restored",
        entityType: "page_builder",
        entityId: key,
        summary: `Restored section from revision ${revisionId}`,
        metadata: { revision_id: revisionId, changed_fields: ["restore"] },
        ip,
      });
      return res.status(200).json({ success: true, entity_type: "section", entity_id: key });
    }

    await conn.rollback();
    return res.status(400).json({ error: "Unsupported revision entity type" });
  } catch (err: any) {
    try {
      await conn.rollback();
    } catch {
      /* ignore */
    }
    if (err?.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "Slug already exists. Choose a different URL slug." });
    }
    if (err?.code === "REVISION_TOO_LARGE") {
      return res.status(400).json({ error: err.message });
    }
    console.error("[admin-revisions/restore]", err?.message || err);
    return res.status(500).json({ error: "Restore failed" });
  } finally {
    conn.release();
  }
}
