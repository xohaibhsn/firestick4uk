import { unstable_cache } from "next/cache";
import pool from "@/lib/db";

export const FAVICON_CACHE_TAG = "favicon-url";
export const FAVICON_CACHE_TTL_SECONDS = 3600;
export const FAVICON_FALLBACK_URL = "https://firestick4uk.com/og-default.png";

function applyCloudinaryFaviconTransform(url: string): string {
  if (url.includes("res.cloudinary.com") && url.includes("/upload/")) {
    return url.replace(
      "/upload/",
      "/upload/c_fit,w_48,h_48,f_png,q_auto/"
    );
  }
  return url;
}

async function loadFaviconRedirectUrl(): Promise<string> {
  let faviconUrl = "";
  try {
    const [rows]: any = await pool.query(
      "SELECT content_value FROM site_content WHERE content_key='favicon_url' LIMIT 1"
    );
    faviconUrl = String(rows?.[0]?.content_value || "")
      .trim()
      .split("?")[0];
  } catch {
    /* ignore */
  }

  if (!faviconUrl) {
    faviconUrl = FAVICON_FALLBACK_URL;
  }

  return applyCloudinaryFaviconTransform(faviconUrl);
}

/** Cached CMS favicon_url lookup for /api/favicon. */
export const getCachedFaviconRedirectUrl = unstable_cache(
  loadFaviconRedirectUrl,
  ["favicon-redirect-url-v1"],
  {
    revalidate: FAVICON_CACHE_TTL_SECONDS,
    tags: [FAVICON_CACHE_TAG],
  }
);
