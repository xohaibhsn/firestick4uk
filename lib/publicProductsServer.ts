import pool from "@/lib/db";

export type PublicProduct = {
  id: number;
  name: string;
  description: string;
  short_description?: string | null;
  slug?: string | null;
  price: number | string;
  badge: string | null;
  image: string | null;
  category: string;
};

/**
 * Default public product listing — matches /api/products with sort=featured:
 * active=1 ORDER BY id ASC
 */
export async function getPublicActiveProducts(): Promise<PublicProduct[]> {
  try {
    const [rows]: any = await pool.query(
      `SELECT id, name, description, short_description, slug, price, badge, image, category
       FROM products
       WHERE active = 1
       ORDER BY id ASC`
    );
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}
