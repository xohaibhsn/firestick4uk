import type { NextApiRequest, NextApiResponse } from "next";
import { getCachedFaviconRedirectUrl } from "../../lib/faviconUrlServer";

/**
 * Browser default request target: /favicon.ico → rewritten here.
 * Redirects to CMS favicon_url (Cloudinary) with short browser cache.
 * DB lookup is unstable_cache'd; invalidated when favicon_url changes.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return res.status(405).end();
  }

  const faviconUrl = await getCachedFaviconRedirectUrl();

  res.setHeader("Cache-Control", "public, max-age=3600");
  return res.redirect(302, faviconUrl);
}
