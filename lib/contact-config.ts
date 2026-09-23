import pool from "@/lib/db";
import {
  CONTACT_CONFIG_FALLBACK,
  normalizeContactFromMap,
  type ContactConfig,
} from "@/lib/contactConfigNormalize";

export type { ContactConfig };
export { CONTACT_CONFIG_FALLBACK, normalizeContactFromMap };

export async function getContactConfig(): Promise<ContactConfig> {
  try {
    const [rows]: any = await pool.query(
      `SELECT content_key, content_value
       FROM site_content
       WHERE content_key IN (
         'contact_whatsapp',
         'whatsapp_number',
         'contact_email',
         'contact_telegram',
         'contact_phone'
       )`
    );

    const config: Record<string, string> = {};
    for (const row of rows || []) {
      config[row.content_key] = row.content_value || "";
    }

    return normalizeContactFromMap(config);
  } catch {
    return { ...CONTACT_CONFIG_FALLBACK };
  }
}
