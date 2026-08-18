"use client";

import { useEffect, useState } from "react";
import { cms, cmsJson, type SiteContentMap } from "@/lib/cms";

export function useSiteContent() {
  const [sc, setSc] = useState<SiteContentMap>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/site-content?page=all")
      .then((r) => r.json())
      .then((data) => {
        if (data && typeof data === "object") setSc(data);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const t = (key: string, fallback = "") => cms(sc, key, fallback);
  const j = <T,>(key: string, fallback: T) => cmsJson<T>(sc, key, fallback);

  return { sc, loaded, t, j };
}
