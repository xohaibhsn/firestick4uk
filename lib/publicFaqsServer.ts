import pool from "@/lib/db";

export type PublicFaq = {
  id: number;
  question: string;
  answer: string;
  category: string;
  sort_order: number;
};

/**
 * Public FAQ listing — matches GET /api/faqs (non-admin):
 * is_visible=1 ORDER BY category, sort_order ASC
 */
export async function getPublicVisibleFaqs(): Promise<PublicFaq[]> {
  try {
    const [rows]: any = await pool.query(
      `SELECT id, question, answer, category, sort_order
       FROM faqs
       WHERE is_visible = 1
       ORDER BY category, sort_order ASC`
    );
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}
