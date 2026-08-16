import type { NextApiRequest, NextApiResponse } from "next";
import pool from "../../lib/db";

/**
 * Browser default request target: /favicon.ico → rewritten here.
 * Always redirects to the current DB favicon_url (Cloudinary).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return res.status(405).end();
  }

  let faviconUrl = "";
  try {
    const [rows]: any = await pool.query(
      "SELECT content_value FROM site_content WHERE content_key='favicon_url' LIMIT 1"
    );
    faviconUrl = String(rows?.[0]?.content_value || "").trim().split("?")[0];
  } catch {
    /* ignore */
  }

  if (!faviconUrl) {
    faviconUrl = "https://firestick4uk.com/og-default.jpg";
  }

  // Serve a small PNG via Cloudinary transforms when possible
  if (faviconUrl.includes("res.cloudinary.com") && faviconUrl.includes("/upload/")) {
    faviconUrl = faviconUrl.replace(
      "/upload/",
      "/upload/c_fit,w_48,h_48,f_png,q_auto/"
    );
  }

  res.setHeader("Cache-Control", "public, max-age=3600");
  return res.redirect(302, faviconUrl);
}
