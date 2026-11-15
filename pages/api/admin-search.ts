import type { NextApiRequest, NextApiResponse } from "next";
import pool from "../../lib/db";
import { requireAdmin } from "../../lib/adminAuth";
import { setAdminNoStore } from "../../lib/adminNoStore";
import {
  hasAdminPermission,
  type AdminPermission,
  type AdminRoleName,
} from "../../lib/adminPermissions";
import { getClientIp, RL_SEARCH } from "../../lib/rateLimit";
import { maskEmail } from "../../lib/orderTrackingPrivacy";

const PER_TYPE_LIMIT = 6;
const Q_MIN = 2;
const Q_MAX = 80;

type SearchGroup =
  | "orders"
  | "customers"
  | "products"
  | "blog"
  | "faqs"
  | "reviews";

type GroupDef = {
  key: SearchGroup;
  permission: AdminPermission;
  run: (like: string, q: string) => Promise<unknown[]>;
};

function maskCustomerInitial(name: unknown): string {
  const raw = typeof name === "string" ? name.trim() : "";
  if (!raw) return "?";
  const ch = raw.charAt(0).toUpperCase();
  return /[A-Z0-9]/i.test(ch) ? `${ch}.` : "?";
}

function clampQuery(raw: unknown): string | null {
  const q = String(raw ?? "").trim();
  if (q.length < Q_MIN || q.length > Q_MAX) return null;
  return q;
}

const GROUPS: GroupDef[] = [
  {
    key: "orders",
    permission: "orders.view",
    run: async (like) => {
      const [rows]: any = await pool.query(
        `SELECT order_id, status, created_at, customer_name
         FROM orders
         WHERE order_id LIKE ?
         ORDER BY created_at DESC
         LIMIT ?`,
        [like, PER_TYPE_LIMIT]
      );
      return (Array.isArray(rows) ? rows : []).map((r: any) => ({
        type: "order",
        order_id: String(r.order_id || ""),
        status: String(r.status || ""),
        created_at: r.created_at,
        customer_initial: maskCustomerInitial(r.customer_name),
      }));
    },
  },
  {
    key: "customers",
    permission: "customers.view",
    run: async (like) => {
      const [rows]: any = await pool.query(
        `SELECT customer_name, customer_email, MAX(created_at) AS last_order
         FROM orders
         WHERE customer_name LIKE ? OR customer_email LIKE ?
         GROUP BY customer_email, customer_name
         ORDER BY last_order DESC
         LIMIT ?`,
        [like, like, PER_TYPE_LIMIT]
      );
      return (Array.isArray(rows) ? rows : []).map((r: any) => ({
        type: "customer",
        display_name: String(r.customer_name || "").trim() || "Customer",
        email_masked: maskEmail(r.customer_email),
      }));
    },
  },
  {
    key: "products",
    permission: "products.view",
    run: async (like) => {
      const [rows]: any = await pool.query(
        `SELECT id, name, slug
         FROM products
         WHERE name LIKE ? OR slug LIKE ? OR CAST(id AS CHAR) LIKE ?
         ORDER BY id DESC
         LIMIT ?`,
        [like, like, like, PER_TYPE_LIMIT]
      );
      return (Array.isArray(rows) ? rows : []).map((r: any) => ({
        type: "product",
        id: Number(r.id),
        name: String(r.name || ""),
        slug: String(r.slug || ""),
      }));
    },
  },
  {
    key: "blog",
    permission: "blog.manage",
    run: async (like) => {
      const [rows]: any = await pool.query(
        `SELECT id, title, status
         FROM blog_posts
         WHERE title LIKE ? OR slug LIKE ? OR CAST(id AS CHAR) LIKE ?
         ORDER BY id DESC
         LIMIT ?`,
        [like, like, like, PER_TYPE_LIMIT]
      );
      return (Array.isArray(rows) ? rows : []).map((r: any) => ({
        type: "blog",
        id: Number(r.id),
        title: String(r.title || ""),
        status: String(r.status || ""),
      }));
    },
  },
  {
    key: "faqs",
    permission: "faqs.manage",
    run: async (like) => {
      const [rows]: any = await pool.query(
        `SELECT id, question
         FROM faqs
         WHERE question LIKE ? OR CAST(id AS CHAR) LIKE ?
         ORDER BY id DESC
         LIMIT ?`,
        [like, like, PER_TYPE_LIMIT]
      );
      return (Array.isArray(rows) ? rows : []).map((r: any) => ({
        type: "faq",
        id: Number(r.id),
        question: String(r.question || ""),
      }));
    },
  },
  {
    key: "reviews",
    permission: "reviews.manage",
    run: async (like) => {
      const [rows]: any = await pool.query(
        `SELECT id, display_name, status
         FROM customer_reviews
         WHERE display_name LIKE ? OR CAST(id AS CHAR) LIKE ?
         ORDER BY id DESC
         LIMIT ?`,
        [like, like, PER_TYPE_LIMIT]
      );
      return (Array.isArray(rows) ? rows : []).map((r: any) => ({
        type: "review",
        id: Number(r.id),
        name: String(r.display_name || ""),
        status: String(r.status || ""),
      }));
    },
  },
];

/** Permission-filtered global admin search (non-mutating). */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  setAdminNoStore(res);

  const admin = await requireAdmin(req, res, { mutate: false });
  if (!admin) return;

  const ip = getClientIp(req);
  const rl = RL_SEARCH(ip);
  if (!rl.allowed) {
    res.setHeader("Retry-After", String(rl.retryAfterSec));
    return res.status(429).json({ error: "Too many requests" });
  }

  const q = clampQuery(req.query.q);
  if (!q) {
    return res.status(400).json({
      error: `Query must be ${Q_MIN}–${Q_MAX} characters`,
    });
  }

  const role = admin.role as AdminRoleName;
  const like = `%${q}%`;

  try {
    const groups: Record<string, unknown[]> = {};
    await Promise.all(
      GROUPS.map(async (g) => {
        if (!hasAdminPermission(role, g.permission)) return;
        try {
          groups[g.key] = await g.run(like, q);
        } catch (groupErr: any) {
          const errCode = typeof groupErr?.code === "string" ? groupErr.code : undefined;
          const errName = typeof groupErr?.name === "string" ? groupErr.name : "Error";
          console.error("[admin-search] group failed", g.key, errCode || errName);
          groups[g.key] = [];
        }
      })
    );

    return res.status(200).json({
      q,
      groups,
      cms_find_hint: `Search CMS texts for '${q}'`,
    });
  } catch (error: any) {
    const errCode = typeof error?.code === "string" ? error.code : undefined;
    const errName = typeof error?.name === "string" ? error.name : "Error";
    console.error("[admin-search] failed", errCode || errName);
    return res.status(500).json({ error: "Request failed" });
  }
}
