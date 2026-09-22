import pool from "@/lib/db";

export type PublicBlogPost = {
  id: number;
  title: string;
  slug: string;
  excerpt: string;
  category: string;
  emoji: string;
  badge: string;
  badgeText: string;
  featured_image: string;
  created_at: string | Date | null;
  featured: number | boolean;
  status: string;
};

/**
 * Public blog listing only — published + active.
 * (Unlike GET /api/blog list which returns all active and lets the client filter.)
 */
export async function getPublicPublishedPosts(): Promise<PublicBlogPost[]> {
  try {
    const [rows]: any = await pool.query(
      `SELECT id, title, slug, excerpt, category, emoji, badge, badgeText,
              featured_image, created_at, featured, status
       FROM blog_posts
       WHERE active = 1 AND status = 'published'
       ORDER BY created_at DESC`
    );
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}
