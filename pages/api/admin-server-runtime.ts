/**
 * Super-admin read-only hosting process/thread snapshot (HOST-PROC-2).
 * GET only. Never reads process environment files. Never returns full argv.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminRole } from "../../lib/adminAuth";
import { setAdminNoStore } from "../../lib/adminNoStore";
import { getCachedServerRuntime } from "../../lib/serverRuntime";

/**
 * Same-origin gate for this sensitive GET (Origin / Referer / Sec-Fetch-Site).
 * Does not early-return true for GET the way assertSameOriginMutation does.
 */
function assertSameOriginGet(req: NextApiRequest): boolean {
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  if (!host) return true;

  const origin = String(req.headers.origin || "").trim();
  if (origin) {
    try {
      const originHost = new URL(origin).host.toLowerCase();
      if (originHost === host) return true;
      if (
        process.env.NODE_ENV !== "production" &&
        ((originHost.startsWith("localhost:") && host.startsWith("localhost:")) ||
          (originHost.startsWith("127.0.0.1:") && host.startsWith("127.0.0.1:")))
      ) {
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  const referer = String(req.headers.referer || "").trim();
  if (referer) {
    try {
      const refHost = new URL(referer).host.toLowerCase();
      if (refHost === host) return true;
      return false;
    } catch {
      return false;
    }
  }

  const fetchSite = String(req.headers["sec-fetch-site"] || "").toLowerCase();
  if (
    fetchSite === "same-origin" ||
    fetchSite === "same-site" ||
    fetchSite === "none" ||
    fetchSite === ""
  ) {
    return true;
  }
  return false;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setAdminNoStore(res);

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!assertSameOriginGet(req)) {
    return res.status(403).json({ error: "Forbidden: invalid origin" });
  }

  const admin = await requireAdminRole(req, res, ["super_admin"], { mutate: false });
  if (!admin) return;

  const payload = getCachedServerRuntime();
  return res.status(200).json(payload);
}
