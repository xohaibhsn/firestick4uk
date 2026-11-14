/**
 * Super-admin read-only hosting process/thread snapshot (HOST-PROC-2).
 * GET only. Never reads process environment files. Never returns full argv.
 * MULTI-93: also returns a read-only request IP-chain diagnostic for the CURRENT
 * request only (never logged/stored). Client-IP selection for rate limits is unchanged.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminRole } from "../../lib/adminAuth";
import { setAdminNoStore } from "../../lib/adminNoStore";
import { getCachedServerRuntime } from "../../lib/serverRuntime";

/** CDN / proxy client-IP header names inspected when present (names + values). */
const CDN_CLIENT_IP_HEADER_NAMES = [
  "cf-connecting-ip",
  "true-client-ip",
  "x-client-ip",
  "fastly-client-ip",
  "x-cluster-client-ip",
  "x-azure-clientip",
  "x-appengine-user-ip",
] as const;

function headerValue(raw: string | string[] | undefined): string | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) {
    const joined = raw.map((v) => String(v).trim()).filter(Boolean).join(", ");
    return joined || null;
  }
  const s = String(raw).trim();
  return s || null;
}

/**
 * Read-only IP chain for the requesting super_admin's own request.
 * Never logged, never stored — returned in the JSON body only.
 */
export function buildRequestIpChain(req: {
  headers: NextApiRequest["headers"];
  socket?: { remoteAddress?: string | null };
}): {
  xForwardedFor: string | null;
  xRealIp: string | null;
  cdnClientIpHeaders: { name: string; value: string }[];
  remoteAddress: string | null;
} {
  const cdnClientIpHeaders: { name: string; value: string }[] = [];
  for (const name of CDN_CLIENT_IP_HEADER_NAMES) {
    const value = headerValue(req.headers[name]);
    if (value) cdnClientIpHeaders.push({ name, value });
  }
  return {
    xForwardedFor: headerValue(req.headers["x-forwarded-for"]),
    xRealIp: headerValue(req.headers["x-real-ip"]),
    cdnClientIpHeaders,
    remoteAddress: req.socket?.remoteAddress ? String(req.socket.remoteAddress) : null,
  };
}

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

  const payload = {
    ...getCachedServerRuntime(),
    requestIpChain: buildRequestIpChain(req),
  };
  return res.status(200).json(payload);
}
