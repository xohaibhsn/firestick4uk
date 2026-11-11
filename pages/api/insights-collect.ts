/**
 * POST /api/insights-collect — first-party Sidhu Insights ingest.
 * Default: recording disabled → 204 and store nothing.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { assertSameOriginMutation } from "../../lib/adminAuth";
import { getClientIp, rateLimit } from "../../lib/rateLimit";
import {
  getInsightsSettings,
  insightsRecordingActive,
} from "../../lib/insightsSettings";
import {
  INSIGHTS_MAX_BODY_BYTES,
  persistInsightsIngest,
  validateInsightsCollectBody,
} from "../../lib/insightsIngest";
import { lookupInsightsGeo } from "../../lib/insightsGeo";
import { scheduleInsightsRetention } from "../../lib/insightsRetention";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "16kb",
    },
  },
};

function safeLog(code: string, extra?: Record<string, string | number | boolean>): void {
  // Never log IP, UA, path, or PII together.
  try {
    console.info("[insights-collect]", code, extra ? JSON.stringify(extra) : "");
  } catch {
    /* ignore */
  }
}

function bodyByteLength(req: NextApiRequest): number {
  const cl = req.headers["content-length"];
  if (cl && /^\d+$/.test(String(cl))) return Number(cl);
  try {
    return Buffer.byteLength(JSON.stringify(req.body ?? {}), "utf8");
  } catch {
    return INSIGHTS_MAX_BODY_BYTES + 1;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }

  // Sec-GPC: 1 => analytics deny (204 drop)
  const gpc = String(req.headers["sec-gpc"] || "").trim();
  if (gpc === "1") {
    safeLog("gpc_drop");
    return res.status(204).end();
  }

  if (!assertSameOriginMutation(req)) {
    // Also check Referer host when Origin missing was already handled by assert;
    // wrong Origin returns false → 400/403 per DESIGN
    safeLog("bad_origin");
    return res.status(403).json({ error: "invalid_origin" });
  }

  const ip = getClientIp(req);
  const rl = rateLimit(`insights:${ip}`, 120, 60_000);
  if (!rl.allowed) {
    res.setHeader("Retry-After", String(rl.retryAfterSec));
    safeLog("rate_limited", { remaining: 0 });
    return res.status(429).json({ error: "rate_limited" });
  }

  const bytes = bodyByteLength(req);
  if (bytes > INSIGHTS_MAX_BODY_BYTES) {
    safeLog("body_too_large", { bytes });
    return res.status(413).json({ error: "body_too_large" });
  }

  // Settings fail-safe: missing tables / DB error => disabled
  const settings = await getInsightsSettings();
  if (!insightsRecordingActive(settings)) {
    safeLog("disabled_drop");
    return res.status(204).end();
  }

  let parsed: unknown = req.body;
  if (typeof req.body === "string") {
    try {
      parsed = JSON.parse(req.body);
    } catch {
      safeLog("bad_json");
      return res.status(400).json({ error: "invalid_json" });
    }
  }

  const validated = validateInsightsCollectBody(parsed, {
    maxBodyBytes: settings.ingest_max_body_bytes || INSIGHTS_MAX_BODY_BYTES,
    rawByteLength: bytes,
  });
  if (!validated.ok) {
    safeLog(validated.code, { status: validated.status });
    return res.status(validated.status).json({ error: validated.code });
  }

  if (validated.payload.events.length === 0) {
    safeLog("no_storable_events");
    return res.status(204).end();
  }

  try {
    const pool = (await import("../../lib/db")).default;
    const geo = lookupInsightsGeo(ip, { geoCityEnabled: settings.geo_city_enabled === true });
    const ua = String(req.headers["user-agent"] || "");

    await persistInsightsIngest(validated.payload, {
      query: (sql, params) => pool.query(sql, params as never[]),
      settings,
      ip,
      userAgent: ua,
      geo,
    });

    // Opportunistic retention — do not await past scheduling
    scheduleInsightsRetention({
      getConnection: () => pool.getConnection() as Promise<{
        query: (sql: string, params?: unknown[]) => Promise<[unknown, unknown?]>;
        release: () => void;
      }>,
      settings,
    });

    safeLog("stored", { events: validated.payload.events.length });
    return res.status(204).end();
  } catch {
    // Fail closed for storage errors after enable: still avoid leaking details
    safeLog("store_error");
    return res.status(204).end();
  }
}
