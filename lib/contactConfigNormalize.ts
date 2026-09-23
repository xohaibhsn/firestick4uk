export type ContactConfig = {
  whatsapp: string;
  email: string;
  telegram: string;
  phone: string;
  whatsappUrl: string;
  telegramUrl: string;
};

export const CONTACT_CONFIG_FALLBACK: ContactConfig = {
  whatsapp: "447518787653",
  email: "info@firestick4uk.com",
  telegram: "@firestick44",
  phone: "+447518787653",
  whatsappUrl: "https://wa.me/447518787653",
  telegramUrl: "https://t.me/firestick44",
};

/** Shared client/server precedence matching historical useContactConfig. */
export function normalizeContactFromMap(
  config: Record<string, string | undefined | null>
): ContactConfig {
  const whatsapp =
    String(config.contact_whatsapp || "").trim() ||
    String(config.whatsapp_number || "").trim() ||
    CONTACT_CONFIG_FALLBACK.whatsapp;
  const rawTg =
    String(config.contact_telegram || "").trim() ||
    CONTACT_CONFIG_FALLBACK.telegram;
  const telegramHandle = rawTg.replace(/^@/, "");

  return {
    whatsapp,
    email:
      String(config.contact_email || "").trim() || CONTACT_CONFIG_FALLBACK.email,
    telegram: rawTg.startsWith("@") ? rawTg : `@${telegramHandle}`,
    phone:
      String(config.contact_phone || "").trim() || CONTACT_CONFIG_FALLBACK.phone,
    whatsappUrl: `https://wa.me/${whatsapp}`,
    telegramUrl: `https://t.me/${telegramHandle}`,
  };
}
