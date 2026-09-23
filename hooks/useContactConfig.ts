"use client";

import { useEffect, useState } from "react";
import {
  CONTACT_CONFIG_FALLBACK,
  normalizeContactFromMap,
  type ContactConfig,
} from "@/lib/contactConfigNormalize";

export type ContactConfigClient = ContactConfig;

export function useContactConfig(
  initial?: ContactConfig | null
): ContactConfigClient {
  const [config, setConfig] = useState<ContactConfigClient>(
    initial || CONTACT_CONFIG_FALLBACK
  );

  useEffect(() => {
    fetch("/api/site-content?page=all")
      .then((r) => r.json())
      .then((data) => {
        if (!data || typeof data !== "object") return;
        setConfig(normalizeContactFromMap(data as Record<string, string>));
      })
      .catch(() => {});
  }, []);

  return config;
}
