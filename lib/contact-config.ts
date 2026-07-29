import pool from "@/lib/db";

export type ContactConfig = {
  whatsapp: string;
  email: string;
  telegram: string;
  phone: string;
  whatsappUrl: string;
  telegramUrl: string;
};

const FALLBACK: ContactConfig = {
  whatsapp: "447518787653",
  email: "firestick4uk@gmail.com",
  telegram: "@firestick44",
  phone: "+447518787653",
  whatsappUrl: "https://wa.me/447518787653",
  telegramUrl: "https://t.me/firestick44",
};

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

    const whatsapp =
      config.contact_whatsapp || config.whatsapp_number || FALLBACK.whatsapp;
    const telegram = config.contact_telegram || FALLBACK.telegram;
    const telegramHandle = telegram.replace(/^@/, "");

    return {
      whatsapp,
      email: config.contact_email || FALLBACK.email,
      telegram: telegram.startsWith("@") ? telegram : `@${telegramHandle}`,
      phone: config.contact_phone || FALLBACK.phone,
      whatsappUrl: `https://wa.me/${whatsapp}`,
      telegramUrl: `https://t.me/${telegramHandle}`,
    };
  } catch {
    return { ...FALLBACK };
  }
}
