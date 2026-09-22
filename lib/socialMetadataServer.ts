import { cache } from "react";
import { connection } from "next/server";
import { resolveDefaultOgImage } from "@/lib/socialMetadata";

/**
 * Server-only: CMS `og_default_image` → bundled `/og-default.png`.
 * Request-deduped via React cache. Does not mutate CMS values.
 * Uses connection() so metadata cannot bake an empty-CMS fallback at build time.
 */
export const getDefaultOgImageFromSettings = cache(async (): Promise<string> => {
  await connection();
  try {
    const pool = (await import("@/lib/db")).default;
    const [rows]: any = await pool.query(
      `SELECT content_value FROM site_content
       WHERE content_key = 'og_default_image'
       LIMIT 1`
    );
    const cms = String(rows?.[0]?.content_value || "").trim();
    return resolveDefaultOgImage(cms);
  } catch {
    return resolveDefaultOgImage(null);
  }
});
