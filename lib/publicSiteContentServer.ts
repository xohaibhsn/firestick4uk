import pool from "@/lib/db";

export type PublicSiteContentMap = Record<string, string>;

/**
 * Read-only site_content lookup for public/server rendering.
 * SELECT only the requested keys; never mutates.
 */
export async function getPublicSiteContent(
  keys: readonly string[]
): Promise<PublicSiteContentMap> {
  const unique = [
    ...new Set(
      keys.map((k) => String(k || "").trim()).filter((k) => k.length > 0)
    ),
  ];
  if (!unique.length) return {};

  try {
    const [rows]: any = await pool.query(
      `SELECT content_key, content_value
       FROM site_content
       WHERE content_key IN (${unique.map(() => "?").join(",")})`,
      unique
    );
    const out: PublicSiteContentMap = {};
    for (const row of Array.isArray(rows) ? rows : []) {
      out[String(row.content_key)] = String(row.content_value ?? "");
    }
    return out;
  } catch {
    return {};
  }
}
