"use client";

import { useEffect, useState } from "react";

export type ContactConfigClient = {
  whatsapp: string;
  email: string;
  telegram: string;
  phone: string;
  whatsappUrl: string;
  telegramUrl: string;
};

const FALLBACK: ContactConfigClient = {
  whatsapp: "447518787653",
  email: "firestick4uk@gmail.com",
  telegram: "@firestick44",
  phone: "+447518787653",
  whatsappUrl: "https://wa.me/447518787653",
  telegramUrl: "https://t.me/firestick44",
};

export function useContactConfig(): ContactConfigClient {
  const [config, setConfig] = useState<ContactConfigClient>(FALLBACK);

  useEffect(() => {
    fetch("/api/site-content?page=all")
      .then((r) => r.json())
      .then((data) => {
        if (!data || typeof data !== "object") return;
        const wa = data.contact_whatsapp || data.whatsapp_number || FALLBACK.whatsapp;
        const rawTg = data.contact_telegram || FALLBACK.telegram;
        const tgHandle = String(rawTg).replace(/^@/, "");
        setConfig({
          whatsapp: wa,
          email: data.contact_email || FALLBACK.email,
          telegram: String(rawTg).startsWith("@") ? String(rawTg) : `@${tgHandle}`,
          phone: data.contact_phone || FALLBACK.phone,
          whatsappUrl: `https://wa.me/${wa}`,
          telegramUrl: `https://t.me/${tgHandle}`,
        });
      })
      .catch(() => {});
  }, []);

  return config;
}
